import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const SKILL_ROOT = resolve(__dirname, "..", "..");

export const CATEGORIES = [
  "Boundaries and Ownership",
  "Duplication and Drift",
  "Module Shape and Abstraction Fit",
  "State, Data Model, and Contract Drift",
  "Type and Safety Escape Hatches",
  "Testability and Feedback Debt",
  "Dead, Legacy, and Compatibility Debt",
  "Dependency and Migration Debt",
  "Tooling, CI, and Developer Workflow Debt",
  "Documentation and Decision Debt",
];

export const EFFORT_VALUES = ["S", "M", "L"];
export const RISK_VALUES = ["LOW", "MED", "HIGH"];
export const CONFIDENCE_VALUES = ["HIGH", "MED", "LOW"];
export const INTEREST_RATE_VALUES = ["HIGH", "MED", "LOW"];
export const BLAST_RADIUS_VALUES = ["local", "package", "cross-package", "external"];
export const ORIGIN_VALUES = ["introduced", "amplified", "pre-existing"];
export const AUDIT_EFFORT_VALUES = ["quick", "standard", "deep"];
export const GATE_STATUS_VALUES = ["observed", "proposed"];

export function getSkillVersion() {
  try {
    const skillMd = readFileSync(join(SKILL_ROOT, "SKILL.md"), "utf8");
    const fm = skillMd.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
    const ver = fm.match(/version:\s*"?([^"\n]+)"?/)?.[1]?.trim();
    return ver || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function sha256Short(input, len = 8) {
  return createHash("sha256").update(String(input)).digest("hex").slice(0, len);
}

export function normalizeRepoKey(remoteOrPath) {
  const raw = String(remoteOrPath || "").trim();
  if (!raw) return "";

  // scp-like git SSH: git@github.com:org/repo.git
  const scpMatch = raw.match(/^(?:[^@\s]+@)?([a-zA-Z0-9.-]+):([^/].+)$/);
  if (scpMatch && !raw.includes("://") && !/^[a-zA-Z]:\\/.test(raw)) {
    const host = scpMatch[1].toLowerCase();
    const repoPath = scpMatch[2].replace(/\.git$/i, "").replace(/\/+$/, "").toLowerCase();
    return `${host}/${repoPath}`;
  }

  // URL forms: https://, http://, ssh://, git://
  if (/^(?:https?|ssh|git):\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      const host = u.hostname.toLowerCase();
      const repoPath = u.pathname
        .replace(/^\/+/, "")
        .replace(/\.git$/i, "")
        .replace(/\/+$/, "")
        .toLowerCase();
      return `${host}/${repoPath}`;
    } catch {
      // fall through
    }
  }

  return resolve(raw);
}

export function slugify(text) {
  return (
    String(text || "repo")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "repo"
  );
}

export function getCacheDir() {
  if (process.env.TECH_DEBT_AUDIT_CACHE_DIR) {
    return resolve(process.env.TECH_DEBT_AUDIT_CACHE_DIR);
  }
  if (process.platform === "win32") {
    const base = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
    return join(base, "tech-debt-audit");
  }
  const base = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(base, "tech-debt-audit");
}

export function tryGit(repoDir, args, opts = {}) {
  try {
    return execFileSync("git", args, {
      cwd: repoDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: opts.maxBuffer ?? 20 * 1024 * 1024,
      timeout: opts.timeout ?? 15000,
    }).trim();
  } catch {
    return null;
  }
}

export function getRepoIdentity(repoDir) {
  const absPath = resolve(repoDir);
  const gitRoot = tryGit(absPath, ["rev-parse", "--show-toplevel"]);
  const root = gitRoot ? resolve(gitRoot) : absPath;
  const isGit = Boolean(gitRoot);
  const rawOrigin = isGit ? tryGit(root, ["config", "--get", "remote.origin.url"]) : null;
  const normalizedKey = normalizeRepoKey(rawOrigin || root);
  const repoName = basename(root);
  const repoSlug = slugify(repoName);
  const cacheDir = getCacheDir();

  const memoSlug = `${repoSlug}-${sha256Short(normalizedKey)}`;
  const memoPath = join(cacheDir, `${memoSlug}.json`);

  // Backward compatibility with v1.x memos keyed by raw origin URL or raw path
  const legacySeed = rawOrigin || root;
  const legacySlug = `${repoSlug}-${sha256Short(legacySeed)}`;
  const legacyMemoPath = legacySlug !== memoSlug ? join(cacheDir, `${legacySlug}.json`) : null;

  return {
    root,
    isGit,
    repoName,
    repoSlug,
    rawOrigin: rawOrigin || null,
    normalizedKey,
    cacheDir,
    memoPath,
    legacyMemoPath,
  };
}

export function loadPriorMemo(identity) {
  const candidates = [identity.memoPath, identity.legacyMemoPath].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        const parsed = JSON.parse(readFileSync(p, "utf8"));
        return {
          found: true,
          path: p,
          migratedFromLegacy: p === identity.legacyMemoPath,
          data: normalizeMemoData(parsed),
        };
      } catch {
        // ignore corrupt file
      }
    }
  }
  return { found: false, path: identity.memoPath, migratedFromLegacy: false, data: null };
}

export function normalizeMemoData(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    schema_version: Number(raw.schema_version) || 1,
    repo: raw.repo || "",
    normalized_repo: raw.normalized_repo || normalizeRepoKey(raw.repo || ""),
    last_audit: raw.last_audit || null,
    open_findings: Array.isArray(raw.open_findings) ? raw.open_findings : [],
    rejected: Array.isArray(raw.rejected) ? raw.rejected : [],
    investigate: Array.isArray(raw.investigate) ? raw.investigate : [],
  };
}

export function loadQuestLedger(repoRoot) {
  const ledgerPath = join(repoRoot, ".tech-debt", "ledger.json");
  if (!existsSync(ledgerPath)) return { found: false, path: ledgerPath, data: null };
  try {
    return { found: true, path: ledgerPath, data: JSON.parse(readFileSync(ledgerPath, "utf8")) };
  } catch {
    return { found: false, path: ledgerPath, data: null };
  }
}

const SECRET_RULES = [
  { name: "private-key", regex: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/ },
  { name: "aws-access-key", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "github-token", regex: /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/ },
  { name: "api-secret-sk", regex: /\bsk-(?:live|test|proj)?-?[A-Za-z0-9_-]{24,}\b/ },
  { name: "slack-token", regex: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/ },
  { name: "google-api-key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "url-embedded-creds", regex: /\bhttps?:\/\/[^/\s:@]{2,}:[^/\s@]{8,}@[^\s/]+/ },
  { name: "jwt-token", regex: /\beyJ[A-Za-z0-9_-]{12,}\.eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/ },
];

export function findSecretLeaks(value, pathPrefix = "$") {
  const leaks = [];
  if (typeof value === "string") {
    for (const rule of SECRET_RULES) {
      if (rule.regex.test(value)) {
        leaks.push({ path: pathPrefix, rule: rule.name });
      }
    }
    return leaks;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      leaks.push(...findSecretLeaks(value[i], `${pathPrefix}[${i}]`));
    }
    return leaks;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      leaks.push(...findSecretLeaks(v, `${pathPrefix}.${k}`));
    }
  }
  return leaks;
}

export function tokenize(str) {
  return new Set(
    String(str || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );
}

export function jaccard(setA, setB) {
  if (!setA.size && !setB.size) return 0;
  let inter = 0;
  for (const x of setA) {
    if (setB.has(x)) inter++;
  }
  const union = setA.size + setB.size - inter;
  return union ? inter / union : 0;
}

export function extractAnchors(finding) {
  const ev = Array.isArray(finding.evidence)
    ? finding.evidence
    : Array.isArray(finding.anchors)
      ? finding.anchors
      : [];
  return ev.map((e) => ({
    path: String(e.path || "").replace(/^\.\//, ""),
    symbol: String(e.symbol || "").trim(),
    line: Number(e.line) || 0,
  }));
}

export function matchPriorFinding(finding, priorList) {
  if (!Array.isArray(priorList) || !priorList.length) return null;
  const anchors = extractAnchors(finding);
  const paths = new Set(anchors.map((a) => a.path).filter(Boolean));
  const pathSymbols = new Set(
    anchors
      .filter((a) => a.path && a.symbol && a.symbol !== "(module)")
      .map((a) => `${a.path}::${a.symbol}`)
  );
  const titleTokens = tokenize(finding.title);

  let best = null;
  let bestScore = 0;

  for (const prior of priorList) {
    const pAnchors = extractAnchors(prior);
    const pPaths = new Set(pAnchors.map((a) => a.path).filter(Boolean));
    const pPathSymbols = new Set(
      pAnchors
        .filter((a) => a.path && a.symbol && a.symbol !== "(module)")
        .map((a) => `${a.path}::${a.symbol}`)
    );

    // 1. Strongest: exact path::symbol overlap
    let symbolOverlap = 0;
    for (const ps of pathSymbols) {
      if (pPathSymbols.has(ps)) symbolOverlap++;
    }
    if (symbolOverlap > 0) {
      const score = 10 + symbolOverlap;
      if (score > bestScore) {
        bestScore = score;
        best = prior;
      }
      continue;
    }

    // 2. Path overlap + same ID or similar title/category
    let pathOverlap = 0;
    for (const p of paths) {
      if (pPaths.has(p)) pathOverlap++;
    }
    const titleSim = jaccard(titleTokens, tokenize(prior.title));
    if (pathOverlap > 0 && (finding.id === prior.id || titleSim >= 0.4 || finding.category === prior.category && titleSim >= 0.25)) {
      const score = 3 + pathOverlap + titleSim;
      if (score > bestScore) {
        bestScore = score;
        best = prior;
      }
    }
  }

  return best;
}

export const MAX_AUDIT_BYTES = 5 * 1024 * 1024;
export const MAX_NESTING_DEPTH = 32;
const VISIBLE_CONTENT = /[^\p{White_Space}\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/u;
const FORBIDDEN_CTRL = /[\p{Cf}\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;

export function hasVisibleContent(str) {
  return typeof str === "string" && VISIBLE_CONTENT.test(str);
}

export function findControlCharIssues(value, pathPrefix = "$", depth = 0) {
  const issues = [];
  if (depth > MAX_NESTING_DEPTH) {
    issues.push(`${pathPrefix}: exceeds max nesting depth (${MAX_NESTING_DEPTH})`);
    return issues;
  }
  if (typeof value === "string") {
    if (FORBIDDEN_CTRL.test(value)) {
      issues.push(`${pathPrefix}: contains forbidden control or invisible bidi/format character`);
    }
    return issues;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      issues.push(...findControlCharIssues(value[i], `${pathPrefix}[${i}]`, depth + 1));
    }
    return issues;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      issues.push(...findControlCharIssues(v, `${pathPrefix}.${k}`, depth + 1));
    }
  }
  return issues;
}

export function validateAudit(data, opts = {}) {
  const errors = [];
  const warnings = [];
  const reqStr = (obj, field, prefix) => {
    if (!hasVisibleContent(obj?.[field])) {
      errors.push(`${prefix}.${field}: required non-empty visible string`);
    }
  };

  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Root value must be a JSON object"], warnings };
  }

  for (const issue of findControlCharIssues(data)) {
    errors.push(issue);
  }

  if (data.schema_version !== 2) {
    errors.push(`schema_version: expected 2, got ${JSON.stringify(data.schema_version)}`);
  }

  const audit = data.audit;
  if (!audit || typeof audit !== "object") {
    errors.push("audit: required object");
  } else {
    reqStr(audit, "repo_name", "audit");
    reqStr(audit, "date", "audit");
    reqStr(audit, "commit", "audit");
    reqStr(audit, "scope", "audit");
    reqStr(audit, "not_audited", "audit");
    if (!AUDIT_EFFORT_VALUES.includes(audit.effort)) {
      errors.push(`audit.effort: must be one of ${AUDIT_EFFORT_VALUES.join(", ")}`);
    }
    if (audit.mode && !["full", "branch", "scoped"].includes(audit.mode)) {
      errors.push(`audit.mode: must be full, branch, or scoped`);
    }
    if (!Array.isArray(audit.verification_commands)) {
      errors.push("audit.verification_commands: required array (may be empty)");
    }
  }

  if (!Array.isArray(data.executive_summary) || data.executive_summary.length === 0) {
    errors.push("executive_summary: required non-empty array of bullet strings");
  }

  if (!Array.isArray(data.findings)) {
    errors.push("findings: required array");
  } else {
    const isBranch = audit?.mode === "branch";
    const seenIds = new Set();
    const repoRoot = opts.repoRoot ? resolve(opts.repoRoot) : null;
    const lineCountCache = new Map();

    for (let i = 0; i < data.findings.length; i++) {
      const f = data.findings[i];
      const p = `findings[${i}]`;
      if (!f || typeof f !== "object") {
        errors.push(`${p}: must be an object`);
        continue;
      }
      reqStr(f, "id", p);
      if (typeof f.id === "string") {
        if (!/^DEBT-\d{2,}$/.test(f.id)) {
          errors.push(`${p}.id: must match DEBT-NN (e.g. DEBT-01), got "${f.id}"`);
        }
        if (seenIds.has(f.id)) {
          errors.push(`${p}.id: duplicate id "${f.id}"`);
        }
        seenIds.add(f.id);
      }
      reqStr(f, "title", p);
      if (!CATEGORIES.includes(f.category)) {
        errors.push(`${p}.category: invalid "${f.category}"; must be one of the 10 playbook categories`);
      }
      reqStr(f, "current_cost", p);
      if (!INTEREST_RATE_VALUES.includes(f.interest_rate)) {
        errors.push(`${p}.interest_rate: must be one of ${INTEREST_RATE_VALUES.join(", ")}`);
      }
      reqStr(f, "interest_rate_reason", p);
      reqStr(f, "payoff", p);
      reqStr(f, "falsification", p);
      reqStr(f, "slice", p);
      reqStr(f, "why_this_order", p);
      if (!EFFORT_VALUES.includes(f.effort)) {
        errors.push(`${p}.effort: must be one of ${EFFORT_VALUES.join(", ")}`);
      }
      if (!RISK_VALUES.includes(f.fix_risk)) {
        errors.push(`${p}.fix_risk: must be one of ${RISK_VALUES.join(", ")}`);
      }
      reqStr(f, "fix_risk_reason", p);
      if (!BLAST_RADIUS_VALUES.includes(f.blast_radius)) {
        errors.push(`${p}.blast_radius: must be one of ${BLAST_RADIUS_VALUES.join(", ")}`);
      }
      if (!CONFIDENCE_VALUES.includes(f.confidence)) {
        errors.push(`${p}.confidence: must be one of ${CONFIDENCE_VALUES.join(", ")}`);
      }
      reqStr(f, "confidence_reason", p);
      reqStr(f, "owner_scope", p);

      if (f.out_of_scope !== undefined) {
        if (!Array.isArray(f.out_of_scope) || f.out_of_scope.some((x) => !hasVisibleContent(x))) {
          errors.push(`${p}.out_of_scope: must be an array of non-empty strings when provided`);
        }
      }
      if (f.stop_conditions !== undefined) {
        if (!Array.isArray(f.stop_conditions) || f.stop_conditions.some((x) => !hasVisibleContent(x))) {
          errors.push(`${p}.stop_conditions: must be an array of non-empty strings when provided`);
        }
      }

      if (isBranch) {
        if (!ORIGIN_VALUES.includes(f.origin)) {
          errors.push(`${p}.origin: required for branch audits (${ORIGIN_VALUES.join(", ")})`);
        }
      } else if (f.origin !== undefined && f.origin !== null && !ORIGIN_VALUES.includes(f.origin)) {
        errors.push(`${p}.origin: must be null or one of ${ORIGIN_VALUES.join(", ")}`);
      }

      if (f.gate !== null && f.gate !== undefined) {
        if (typeof f.gate !== "object") {
          errors.push(`${p}.gate: must be null or object`);
        } else {
          reqStr(f.gate, "command", `${p}.gate`);
          reqStr(f.gate, "expected", `${p}.gate`);
          if (!GATE_STATUS_VALUES.includes(f.gate.status)) {
            errors.push(`${p}.gate.status: must be "observed" or "proposed"`);
          }
        }
      }

      if (!Array.isArray(f.evidence) || f.evidence.length === 0) {
        errors.push(`${p}.evidence: required non-empty array of evidence anchors`);
      } else {
        for (let j = 0; j < f.evidence.length; j++) {
          const ev = f.evidence[j];
          const ep = `${p}.evidence[${j}]`;
          reqStr(ev, "path", ep);
          reqStr(ev, "symbol", ep);
          reqStr(ev, "note", ep);
          if (!Number.isInteger(ev.line) || ev.line < 1) {
            errors.push(`${ep}.line: must be a positive integer`);
          }
          if (repoRoot && typeof ev.path === "string" && ev.path.trim()) {
            const cleanRel = ev.path.replace(/^\.\//, "");
            const fullPath = resolve(repoRoot, cleanRel);
            if (!fullPath.startsWith(repoRoot)) {
              errors.push(`${ep}.path: escapes repository root ("${ev.path}")`);
            } else if (!existsSync(fullPath)) {
              errors.push(`${ep}.path: file does not exist in repo ("${cleanRel}")`);
            } else if (Number.isInteger(ev.line) && ev.line >= 1) {
              let lines = lineCountCache.get(fullPath);
              if (lines === undefined) {
                try {
                  lines = readFileSync(fullPath, "utf8").split("\n").length;
                } catch {
                  lines = -1;
                }
                lineCountCache.set(fullPath, lines);
              }
              if (lines > 0 && ev.line > lines) {
                errors.push(`${ep}.line: line ${ev.line} exceeds file length (${lines} lines) in "${cleanRel}"`);
              }
            }
          }
        }
      }
    }
  }

  if (!Array.isArray(data.investigate)) {
    errors.push("investigate: required array");
  } else {
    for (let i = 0; i < data.investigate.length; i++) {
      reqStr(data.investigate[i], "candidate", `investigate[${i}]`);
      reqStr(data.investigate[i], "signal", `investigate[${i}]`);
      reqStr(data.investigate[i], "proof_needed", `investigate[${i}]`);
    }
  }

  if (!Array.isArray(data.rejected)) {
    errors.push("rejected: required array");
  } else {
    for (let i = 0; i < data.rejected.length; i++) {
      reqStr(data.rejected[i], "title", `rejected[${i}]`);
      reqStr(data.rejected[i], "reason", `rejected[${i}]`);
      reqStr(data.rejected[i], "evidence", `rejected[${i}]`);
    }
  }

  if (!Array.isArray(data.implementer_notes)) {
    errors.push("implementer_notes: required array");
  }

  const leaks = findSecretLeaks(data);
  for (const leak of leaks) {
    errors.push(`${leak.path}: potential secret detected (${leak.rule}); remove secret value and cite file:line + credential type only`);
  }

  if (Array.isArray(data.findings) && data.findings.length > 0) {
    const unverifiedGates = data.findings.filter((f) => f?.gate?.status === "proposed").length;
    if (unverifiedGates === data.findings.length) {
      warnings.push("All verification gates are marked 'proposed'; run at least one cheap read-only check when possible.");
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
