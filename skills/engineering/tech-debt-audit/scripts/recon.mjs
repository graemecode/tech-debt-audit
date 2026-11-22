#!/usr/bin/env node
// Read-only quantitative repository reconnaissance for tech-debt-audit.
// Zero external dependencies; Node 18+.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import {
  findSecretLeaks,
  getRepoIdentity,
  loadPriorMemo,
  loadQuestLedger,
  tryGit,
} from "./lib/common.mjs";

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".cache",
  ".venv",
  "venv",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  "dist",
  "build",
  "out",
  "coverage",
  "target",
  "vendor",
  ".pnpm-store",
  ".yarn",
  ".idea",
  ".vscode",
  "Pods",
]);

const SOURCE_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".rs", ".java", ".kt", ".kts",
  ".rb", ".php", ".cs", ".cpp", ".cc", ".c", ".h", ".hpp",
  ".swift", ".scala", ".ex", ".exs", ".dart", ".lua",
  ".vue", ".svelte", ".astro", ".sql", ".sh", ".bash", ".zsh",
]);

const LOCK_OR_GENERATED_PATTERNS = [
  /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|poetry\.lock|uv\.lock|go\.sum|Gemfile\.lock|composer\.lock)$/i,
  /(^|\/)([^/]+\.min\.(js|css)|[^/]+\.bundle\.js|[^/]+\.d\.ts|[^/]+\.generated\.[^/]+|[^/]+\.pb\.go|[^/]+_pb2\.py)$/i,
  /(^|\/)(__generated__|generated|gen|_generated)\//i,
];

const TEST_FILE_PATTERN = /(^|\/)(__tests__|tests?|spec|specs|e2e|fixtures?)\/|(^|\/)tests?\.[^.]+$|\.(test|spec)\.[^.]+$|_test\.(go|py|rb|rs)$|test_[^/]+\.py$/i;

const CONFIG_FILE_PATTERN = /(^|\/)(\.[^/]+|[^/]+\.config\.[^/]+|jest\.setup\.[^/]+|vitest\.setup\.[^/]+)$/i;

const DOC_INTENT_PATTERN =
  /(^|\/)(README|AGENTS|CLAUDE|GEMINI|CONTRIBUTING|CONTEXT|ARCHITECTURE|DESIGN|MIGRATION|ROADMAP|SECURITY|CHANGELOG)[^/]*\.(md|txt|rst)$|(^|\/)(docs?\/(adr|adrs|rfc|rfcs|architecture|design|decisions|specs?)\/.*\.md)$/i;

const MANIFEST_NAMES = new Set([
  "package.json",
  "pnpm-workspace.yaml",
  "turbo.json",
  "nx.json",
  "tsconfig.json",
  "pyproject.toml",
  "requirements.txt",
  "setup.py",
  "Cargo.toml",
  "go.mod",
  "Makefile",
  "Justfile",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "biome.json",
  "biome.jsonc",
  "knip.json",
  "knip.jsonc",
]);

const TODO_REGEX = /\b(TODO|FIXME|HACK|XXX|WORKAROUND|TEMP(?:ORARY)?|LEGACY|DEPRECATED)\b[:(\s-]/i;

const ESCAPE_HATCH_PATTERNS = [
  { key: "ts_any", regex: /(:\s*any\b|\bas\s+any\b|<any>)/g },
  { key: "ts_unknown_cast", regex: /\bas\s+unknown\s+as\b/g },
  { key: "ts_ignore", regex: /@ts-(?:ignore|expect-error|nocheck)\b/g },
  { key: "lint_disable", regex: /(eslint-disable|biome-ignore|oxlint-disable|nolint|#\s*noqa\b|#\s*type:\s*ignore\b)/g },
  { key: "rust_unwrap_unsafe", regex: /(\.unwrap\(\)|\bunsafe\s*\{)/g },
  { key: "silent_catch", regex: /\bcatch\s*(?:\([^)]*\))?\s*\{\s*(?:\/\/[^\n]*\n\s*)?\}/g },
];

const FIX_COMMIT_REGEX = /\b(fix|fixes|fixed|bug|bugfix|hotfix|patch|regression|broken|crash)\b|^fix(\([^)]+\))?:/i;
const REVERT_COMMIT_REGEX = /^revert\b|\breverted\b/i;

function parseArgs(argv) {
  const args = {
    repo: ".",
    effort: "standard",
    branch: false,
    base: null,
    since: "6 months ago",
    scopes: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo" && argv[i + 1]) args.repo = argv[++i];
    else if (a === "--effort" && argv[i + 1]) args.effort = argv[++i];
    else if (a === "--branch") args.branch = true;
    else if (a === "--base" && argv[i + 1]) args.base = argv[++i];
    else if (a === "--since" && argv[i + 1]) args.since = argv[++i];
    else if (a === "--scope" && argv[i + 1]) args.scopes.push(argv[++i]);
    else if (!a.startsWith("-")) args.scopes.push(a);
  }
  if (!["quick", "standard", "deep"].includes(args.effort)) {
    args.effort = "standard";
  }
  return args;
}

function isGeneratedOrLock(relPath) {
  return LOCK_OR_GENERATED_PATTERNS.some((re) => re.test(relPath));
}

function isSourceFile(relPath) {
  return SOURCE_EXTS.has(extname(relPath).toLowerCase()) && !isGeneratedOrLock(relPath);
}

function isTestFile(relPath) {
  return TEST_FILE_PATTERN.test(relPath);
}

function walkFilesFs(rootDir, currentDir = rootDir, out = []) {
  let entries;
  try {
    entries = readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walkFilesFs(rootDir, full, out);
    } else if (entry.isFile()) {
      out.push(relative(rootDir, full).replace(/\\/g, "/"));
    }
  }
  return out;
}

function listAllRepoFiles(root, isGit) {
  if (isGit) {
    const raw = tryGit(root, ["ls-files", "-co", "--exclude-standard"], { maxBuffer: 50 * 1024 * 1024 });
    if (raw !== null) {
      return raw
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.split("/").some((seg) => IGNORED_DIRS.has(seg)) && existsSync(join(root, l)));
    }
  }
  return walkFilesFs(root);
}

function validateScopes(root, requestedScopes) {
  const existing = [];
  const missing = [];
  for (const raw of requestedScopes) {
    const clean = raw.replace(/^\.\//, "").replace(/\/+$/, "");
    const full = resolve(root, clean);
    if (!full.startsWith(root)) {
      missing.push({ path: raw, nearby: [], reason: "escapes repo root" });
      continue;
    }
    if (existsSync(full)) {
      existing.push(clean);
    } else {
      const parent = dirname(full);
      let nearby = [];
      if (existsSync(parent) && parent.startsWith(root)) {
        try {
          nearby = readdirSync(parent).slice(0, 15);
        } catch {
          nearby = [];
        }
      }
      missing.push({ path: raw, nearby });
    }
  }
  return { existing, missing };
}

function matchesScopes(relPath, scopes) {
  if (!scopes.length) return true;
  return scopes.some((s) => relPath === s || relPath.startsWith(`${s}/`));
}

function detectBranchDiff(root, baseOverride) {
  let baseRef = baseOverride;
  if (!baseRef) {
    const originHead = tryGit(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
    if (originHead) {
      baseRef = originHead;
    } else {
      for (const candidate of ["origin/main", "origin/master", "main", "master"]) {
        if (tryGit(root, ["rev-parse", "--verify", "--quiet", candidate])) {
          baseRef = candidate;
          break;
        }
      }
    }
  }
  if (!baseRef) return { base_ref: null, merge_base: null, changed_files: [] };

  const mergeBase = tryGit(root, ["merge-base", "HEAD", baseRef]);
  if (!mergeBase) return { base_ref: baseRef, merge_base: null, changed_files: [] };

  const diffOut = tryGit(root, ["diff", "--name-only", `${mergeBase}...HEAD`]) || "";
  const workingOut = tryGit(root, ["diff", "--name-only"]) || "";
  const stagedOut = tryGit(root, ["diff", "--name-only", "--cached"]) || "";

  const changedSet = new Set(
    [...diffOut.split("\n"), ...workingOut.split("\n"), ...stagedOut.split("\n")]
      .map((s) => s.trim())
      .filter((s) => s && existsSync(join(root, s)))
  );

  return {
    base_ref: baseRef,
    merge_base: mergeBase.slice(0, 10),
    changed_files: [...changedSet].sort(),
  };
}

function findDirectImporters(root, allSourceFiles, targetFiles, cap = 40) {
  if (!targetFiles.length) return [];
  const stems = new Set();
  for (const tf of targetFiles) {
    const noExt = tf.replace(/\.[^.]+$/, "");
    stems.add(basename(noExt));
    if (basename(noExt) === "index") {
      stems.add(basename(dirname(noExt)));
    }
  }
  stems.delete("index");
  stems.delete("");
  if (!stems.size) return [];

  const targetSet = new Set(targetFiles);
  const importers = [];
  const scanFiles = allSourceFiles.filter((f) => !targetSet.has(f)).slice(0, 1500);
  const importLineRe = /(?:^|\n)\s*(?:import\b.*?\bfrom\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|from\s+([.\w]+)\s+import\b)/g;

  for (const f of scanFiles) {
    let text;
    try {
      const st = statSync(join(root, f));
      if (st.size > 256 * 1024) continue;
      text = readFileSync(join(root, f), "utf8");
    } catch {
      continue;
    }
    let matched = false;
    importLineRe.lastIndex = 0;
    let m;
    while ((m = importLineRe.exec(text)) !== null) {
      const spec = m[1] || m[2] || m[3] || "";
      const lastSeg = spec.replace(/\.[^./]+$/, "").split(/[/.]/).filter(Boolean).pop();
      if (lastSeg && stems.has(lastSeg)) {
        matched = true;
        break;
      }
    }
    if (matched) {
      importers.push(f);
      if (importers.length >= cap) break;
    }
  }
  return importers;
}

function parseGitHistory(root, since, scopedSet, maxCommits) {
  const sep = "\x1e";
  const raw = tryGit(
    root,
    [
      "log",
      `--since=${since}`,
      `-n`,
      String(maxCommits),
      `--pretty=format:${sep}%H\t%an\t%ad\t%s`,
      "--date=short",
      "--name-only",
    ],
    { maxBuffer: 50 * 1024 * 1024, timeout: 20000 }
  );
  if (!raw) return { commits_analyzed: 0, hotspots: [], co_change_pairs: [] };

  const blocks = raw.split(sep).filter(Boolean);
  const fileStats = new Map();
  const pairCounts = new Map();
  let commitsAnalyzed = 0;

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const [hash, author, date, ...subjParts] = lines[0].split("\t");
    if (!hash) continue;
    commitsAnalyzed++;
    const subject = subjParts.join("\t");
    const isRevert = REVERT_COMMIT_REGEX.test(subject);
    const isFix = !isRevert && FIX_COMMIT_REGEX.test(subject);

    const files = lines
      .slice(1)
      .filter((f) => scopedSet.has(f) && isSourceFile(f));

    for (const f of files) {
      let s = fileStats.get(f);
      if (!s) {
        s = { path: f, commits: 0, fix_commits: 0, revert_commits: 0, authors: new Set(), last_touched: date };
        fileStats.set(f, s);
      }
      s.commits++;
      if (isFix) s.fix_commits++;
      if (isRevert) s.revert_commits++;
      if (author) s.authors.add(author);
    }

    // Co-change coupling: ignore bulk mechanical commits (>20 files) and single-file commits
    const nonTestFiles = files.filter((f) => !isTestFile(f));
    if (nonTestFiles.length >= 2 && nonTestFiles.length <= 20) {
      const uniq = [...new Set(nonTestFiles)].sort();
      for (let i = 0; i < uniq.length; i++) {
        for (let j = i + 1; j < uniq.length; j++) {
          const a = uniq[i];
          const b = uniq[j];
          // Focus on cross-directory coupling (same-directory siblings are less surprising)
          if (dirname(a) === dirname(b)) continue;
          const key = `${a}\t${b}`;
          pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
        }
      }
    }
  }

  const hotspots = [...fileStats.values()]
    .filter((s) => !isTestFile(s.path))
    .map((s) => ({
      path: s.path,
      commits: s.commits,
      fix_commits: s.fix_commits,
      revert_commits: s.revert_commits,
      authors: s.authors.size,
      last_touched: s.last_touched,
      interest_score: s.commits + 2 * s.fix_commits + 3 * s.revert_commits,
    }))
    .sort((a, b) => b.interest_score - a.interest_score || b.commits - a.commits);

  const coChangePairs = [];
  for (const [key, count] of pairCounts.entries()) {
    if (count < 3) continue;
    const [a, b] = key.split("\t");
    const ca = fileStats.get(a)?.commits || count;
    const cb = fileStats.get(b)?.commits || count;
    const union = ca + cb - count;
    const coupling = union > 0 ? Number((count / union).toFixed(2)) : 0;
    if (coupling < 0.25) continue;
    coChangePairs.push({
      file_a: a,
      file_b: b,
      co_commits: count,
      coupling_ratio: coupling,
    });
  }
  coChangePairs.sort((x, y) => y.co_commits * y.coupling_ratio - x.co_commits * x.coupling_ratio);

  return { commits_analyzed: commitsAnalyzed, hotspots, co_change_pairs: coChangePairs };
}

function discoverTooling(root, allFiles) {
  const manifests = allFiles.filter(
    (f) => MANIFEST_NAMES.has(basename(f)) || /^\.github\/workflows\/.+\.ya?ml$/.test(f)
  );
  const verificationCommands = [];
  const installedAnalyzers = [];
  const workspacePackages = [];

  const rootPkgPath = join(root, "package.json");
  if (existsSync(rootPkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(rootPkgPath, "utf8"));
      const pm = existsSync(join(root, "pnpm-lock.yaml"))
        ? "pnpm"
        : existsSync(join(root, "yarn.lock"))
          ? "yarn"
          : existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock"))
            ? "bun"
            : "npm";
      const runPrefix = pm === "npm" ? "npm run" : pm;
      const scripts = pkg.scripts || {};
      for (const [name, cmd] of Object.entries(scripts)) {
        if (/^(test|lint|typecheck|check|verify|validate|audit|build|format:check)/i.test(name)) {
          verificationCommands.push({
            command: `${runPrefix} ${name}`,
            script: String(cmd).slice(0, 120),
            read_only_hint: !/(--fix|--write|format(?!:check))/i.test(String(cmd)),
          });
        }
      }
      const binDir = join(root, "node_modules", ".bin");
      if (existsSync(binDir)) {
        for (const tool of ["tsc", "eslint", "biome", "oxlint", "knip", "madge", "depcruise", "depcheck", "vitest", "jest"]) {
          if (existsSync(join(binDir, tool))) {
            installedAnalyzers.push(`node_modules/.bin/${tool}`);
          }
        }
      }
    } catch {
      // ignore malformed package.json
    }
  }

  // Discover workspace packages (depth <= 2 package.json / Cargo.toml / pyproject.toml / go.mod)
  for (const m of manifests) {
    const parts = m.split("/");
    if (parts.length >= 2 && parts.length <= 3 && ["package.json", "Cargo.toml", "pyproject.toml", "go.mod"].includes(basename(m))) {
      workspacePackages.push(dirname(m));
    }
  }

  if (existsSync(join(root, "Cargo.toml"))) {
    verificationCommands.push({ command: "cargo check --all-targets", script: "rust check", read_only_hint: true });
    verificationCommands.push({ command: "cargo clippy --all-targets", script: "rust lint", read_only_hint: true });
  }
  if (existsSync(join(root, "go.mod"))) {
    verificationCommands.push({ command: "go vet ./...", script: "go vet", read_only_hint: true });
  }
  if (existsSync(join(root, "pyproject.toml"))) {
    verificationCommands.push({ command: "ruff check .", script: "python lint (if installed)", read_only_hint: true });
  }

  return {
    manifests: manifests.slice(0, 40),
    workspace_packages: [...new Set(workspacePackages)].sort().slice(0, 40),
    verification_commands: verificationCommands.slice(0, 20),
    installed_analyzers: installedAnalyzers,
  };
}

function scanSourceFiles(root, filesToScan, allFilesSet, limits) {
  const largestFiles = [];
  const todoClusters = [];
  const escapeHatchClusters = [];
  const locByPath = new Map();
  let totalLoc = 0;

  for (const rel of filesToScan) {
    const full = join(root, rel);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.size > 512 * 1024) continue;

    let text;
    try {
      text = readFileSync(full, "utf8");
    } catch {
      continue;
    }
    if (text.includes("\0")) continue; // binary

    const lines = text.split("\n");
    const loc = lines.length;
    totalLoc += loc;
    locByPath.set(rel, loc);

    const testFile = isTestFile(rel);
    if (!testFile && loc >= 150) {
      largestFiles.push({ path: rel, loc });
    }

    // TODO / FIXME / HACK clusters
    const todoSamples = [];
    let todoCount = 0;
    for (let i = 0; i < lines.length; i++) {
      if (TODO_REGEX.test(lines[i])) {
        todoCount++;
        if (todoSamples.length < 3) {
          const snippet = lines[i].trim().slice(0, 120);
          const safeSnippet = findSecretLeaks(snippet).length
            ? "[redacted: potential credential on line]"
            : snippet;
          todoSamples.push({ line: i + 1, text: safeSnippet });
        }
      }
    }
    if (todoCount > 0) {
      todoClusters.push({ path: rel, count: todoCount, samples: todoSamples });
    }

    // Escape hatches (non-test files only; strip inline Rust #[cfg(test)] blocks)
    if (!testFile) {
      const scanText = extname(rel).toLowerCase() === ".rs"
        ? text.split(/#\[cfg\(test\)\]/)[0]
        : text;
      const counts = {};
      let totalHatches = 0;
      for (const pat of ESCAPE_HATCH_PATTERNS) {
        const m = scanText.match(pat.regex);
        if (m && m.length) {
          counts[pat.key] = m.length;
          totalHatches += m.length;
        }
      }
      if (totalHatches >= 2) {
        escapeHatchClusters.push({ path: rel, total: totalHatches, breakdown: counts });
      }
    }
  }

  largestFiles.sort((a, b) => b.loc - a.loc);
  todoClusters.sort((a, b) => b.count - a.count);
  escapeHatchClusters.sort((a, b) => b.total - a.total);

  // Build package-scoped test-name index to spot untested high-churn files accurately in monorepos
  const packagePrefix = (rel) => {
    const parts = rel.split("/");
    return parts.length >= 3 && ["apps", "packages", "services", "libs", "crates"].includes(parts[0])
      ? `${parts[0]}/${parts[1]}`
      : "";
  };
  const testKeys = new Set();
  for (const f of allFilesSet) {
    if (isTestFile(f)) {
      const base = basename(f)
        .replace(/\.(test|spec)\.[^.]+$/i, "")
        .replace(/_test\.[^.]+$/i, "")
        .replace(/^test_/i, "")
        .replace(/\.[^.]+$/, "")
        .toLowerCase();
      if (base) testKeys.add(`${packagePrefix(f)}::${base}`);
    }
  }

  return {
    totalLoc,
    locByPath,
    largestFiles: largestFiles.slice(0, limits.largest),
    todoClusters: todoClusters.slice(0, limits.todos),
    escapeHatchClusters: escapeHatchClusters.slice(0, limits.hatches),
    testKeys,
    packagePrefix,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const identity = getRepoIdentity(args.repo);
  const root = identity.root;

  const limits =
    args.effort === "quick"
      ? { scanCap: 600, commits: 400, hotspots: 12, pairs: 10, largest: 12, todos: 10, hatches: 10 }
      : args.effort === "deep"
        ? { scanCap: 5000, commits: 2500, hotspots: 35, pairs: 25, largest: 30, todos: 25, hatches: 25 }
        : { scanCap: 2000, commits: 1200, hotspots: 20, pairs: 15, largest: 20, todos: 15, hatches: 15 };

  const scopeCheck = validateScopes(root, args.scopes);
  if (args.scopes.length > 0 && scopeCheck.existing.length === 0) {
    console.log(
      JSON.stringify(
        {
          error: "none_of_requested_scopes_exist",
          repo: identity.repoName,
          missing_scopes: scopeCheck.missing,
        },
        null,
        2
      )
    );
    process.exit(2);
  }

  const allFiles = listAllRepoFiles(root, identity.isGit);
  const allFilesSet = new Set(allFiles);
  const allSourceFiles = allFiles.filter(isSourceFile);

  let branchDiff = null;
  let scopedFiles = allFiles.filter((f) => matchesScopes(f, scopeCheck.existing));
  let directImporters = [];

  if (args.branch && identity.isGit) {
    branchDiff = detectBranchDiff(root, args.base);
    const branchSet = new Set(branchDiff.changed_files);
    scopedFiles = scopedFiles.filter((f) => branchSet.has(f));
    directImporters = findDirectImporters(root, allSourceFiles, scopedFiles);
    branchDiff.direct_importers = directImporters;
  } else if (scopeCheck.existing.length > 0) {
    const scopedSource = scopedFiles.filter(isSourceFile);
    directImporters = findDirectImporters(root, allSourceFiles, scopedSource, 25);
  }

  const scopedSourceFiles = scopedFiles.filter(isSourceFile);
  const scopedSourceSet = new Set(scopedSourceFiles);

  // Language counts
  const langCounts = {};
  for (const f of scopedSourceFiles) {
    const ext = extname(f).toLowerCase();
    langCounts[ext] = (langCounts[ext] || 0) + 1;
  }

  // Git metadata & history
  const branchName = identity.isGit ? tryGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]) : null;
  const commitSha = identity.isGit ? tryGit(root, ["rev-parse", "--short", "HEAD"]) : null;
  const statusOut = identity.isGit ? tryGit(root, ["status", "--porcelain"]) : null;
  const dirtyCount = statusOut ? statusOut.split("\n").filter(Boolean).length : 0;

  const gitHistory = identity.isGit
    ? parseGitHistory(root, args.since, scopedSourceSet, limits.commits)
    : { commits_analyzed: 0, hotspots: [], co_change_pairs: [] };

  // Prioritize hotspots first when capping file content scan on very large repos
  const hotspotOrder = new Set(gitHistory.hotspots.map((h) => h.path));
  const orderedToScan = [
    ...gitHistory.hotspots.map((h) => h.path).filter((p) => scopedSourceSet.has(p)),
    ...scopedSourceFiles.filter((p) => !hotspotOrder.has(p)),
  ].slice(0, limits.scanCap);

  const scan = scanSourceFiles(root, orderedToScan, allFilesSet, limits);

  // Enrich hotspots with LOC and package-scoped test-presence hint
  const topHotspots = gitHistory.hotspots.slice(0, limits.hotspots).map((h) => {
    const base = basename(h.path).replace(/\.[^.]+$/, "").toLowerCase();
    return {
      ...h,
      loc: scan.locByPath.get(h.path) ?? null,
      has_matching_test_name: scan.testKeys.has(`${scan.packagePrefix(h.path)}::${base}`),
    };
  });

  const testGapCandidates = topHotspots
    .filter((h) => !h.has_matching_test_name && !CONFIG_FILE_PATTERN.test(h.path) && (h.commits >= 4 || h.fix_commits >= 2))
    .slice(0, 10)
    .map((h) => ({ path: h.path, commits: h.commits, fix_commits: h.fix_commits, loc: h.loc }));

  const docsAndIntent = allFiles.filter((f) => DOC_INTENT_PATTERN.test(f)).sort().slice(0, 40);
  const tooling = discoverTooling(root, allFiles);

  // Top-level directory breakdown for sharding guidance
  const dirCounts = {};
  for (const f of scopedSourceFiles) {
    const parts = f.split("/");
    const top = parts.length > 1 ? parts.slice(0, Math.min(2, parts.length - 1)).join("/") : ".";
    dirCounts[top] = (dirCounts[top] || 0) + 1;
  }
  const topDirs = Object.entries(dirCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([dir, files]) => ({ dir, files }));

  const priorMemo = loadPriorMemo(identity);
  const questLedger = loadQuestLedger(root);

  const output = {
    repo: {
      name: identity.repoName,
      slug: identity.repoSlug,
      root: identity.root,
      is_git: identity.isGit,
      branch: branchName,
      commit: commitSha || "working tree (no git)",
      dirty_files_count: dirtyCount,
      remote_normalized: identity.normalizedKey,
      memo_path: identity.memoPath,
    },
    scope: {
      effort: args.effort,
      mode: args.branch ? "branch" : scopeCheck.existing.length ? "scoped" : "full",
      requested_paths: args.scopes,
      effective_paths: args.branch
        ? scopedFiles
        : scopeCheck.existing.length
          ? scopeCheck.existing
          : ["."],
      missing_paths: scopeCheck.missing,
      total_repo_files: allFiles.length,
      scoped_source_files: scopedSourceFiles.length,
      scanned_source_files: orderedToScan.length,
      scanned_loc_estimate: scan.totalLoc,
      direct_importers: directImporters,
      recommended_strategy:
        scopedSourceFiles.length >= 200
          ? "sharded-by-package-plus-cross-boundary-pass"
          : "direct-cluster-read",
      top_directories: topDirs,
      languages: langCounts,
    },
    branch_diff: branchDiff,
    docs_and_intent: docsAndIntent,
    tooling,
    signals: {
      git_commits_analyzed: gitHistory.commits_analyzed,
      git_window: args.since,
      hotspots: topHotspots,
      co_change_pairs: gitHistory.co_change_pairs.slice(0, limits.pairs),
      largest_files: scan.largestFiles,
      todo_clusters: scan.todoClusters,
      escape_hatch_clusters: scan.escapeHatchClusters,
      test_gap_candidates: testGapCandidates,
    },
    prior_memory: {
      found: priorMemo.found,
      path: priorMemo.path,
      migrated_from_legacy: priorMemo.migratedFromLegacy,
      last_audit: priorMemo.data?.last_audit ?? null,
      open_findings_count: priorMemo.data?.open_findings?.length ?? 0,
      open_findings: priorMemo.data?.open_findings ?? [],
      rejected_count: priorMemo.data?.rejected?.length ?? 0,
      rejected: priorMemo.data?.rejected ?? [],
      investigate_count: priorMemo.data?.investigate?.length ?? 0,
      investigate: priorMemo.data?.investigate ?? [],
      quest_ledger_found: questLedger.found,
      quest_ledger_path: questLedger.found ? questLedger.path : null,
      quest_ledger_count: questLedger.data?.quests?.length ?? 0,
    },
  };

  console.log(JSON.stringify(output, null, 2));
}

main();
