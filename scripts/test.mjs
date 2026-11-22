#!/usr/bin/env node
// End-to-end test suite for tech-debt-audit scripts (recon, memory, render-report).
// Zero external dependencies; Node 18+.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeRepoKey } from "../skills/engineering/tech-debt-audit/scripts/lib/common.mjs";
import { createEvalFixture, scoreAudit } from "./eval-fixture.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SKILL_SCRIPTS = join(ROOT, "skills", "engineering", "tech-debt-audit", "scripts");
const RECON = join(SKILL_SCRIPTS, "recon.mjs");
const RENDER = join(SKILL_SCRIPTS, "render-report.mjs");
const MEMORY = join(SKILL_SCRIPTS, "memory.mjs");

function runNode(script, args, opts = {}) {
  try {
    const stdout = execFileSync(process.execPath, [script, ...args], {
      cwd: opts.cwd || ROOT,
      encoding: "utf8",
      env: { ...process.env, CI: "true", ...(opts.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    return {
      status: err.status ?? 1,
      stdout: err.stdout?.toString?.() || "",
      stderr: err.stderr?.toString?.() || "",
    };
  }
}

function git(cwd, args) {
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test Dev",
      GIT_AUTHOR_EMAIL: "dev@example.com",
      GIT_COMMITTER_NAME: "Test Dev",
      GIT_COMMITTER_EMAIL: "dev@example.com",
    },
  });
}

function makePlantedRepo() {
  const dir = mkdtempSync(join(tmpdir(), "tda-fixture-"));
  const cacheDir = mkdtempSync(join(tmpdir(), "tda-cache-"));

  git(dir, ["init", "-b", "main"]);
  git(dir, ["remote", "add", "origin", "git@github.com:acme/demo-api.git"]);

  mkdirSync(join(dir, "src", "auth"), { recursive: true });
  mkdirSync(join(dir, "src", "routes"), { recursive: true });
  mkdirSync(join(dir, "src", "legacy"), { recursive: true });
  mkdirSync(join(dir, "src", "generated"), { recursive: true });
  mkdirSync(join(dir, "docs", "adr"), { recursive: true });

  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "demo-api",
      scripts: {
        test: "node --test",
        typecheck: "tsc --noEmit",
        lint: "eslint .",
      },
    }, null, 2)
  );
  writeFileSync(join(dir, "AGENTS.md"), "# Agents\nKeep auth checks centralized.\n");
  writeFileSync(join(dir, "docs", "adr", "001-auth.md"), "# ADR 001\nUse single auth guard.\n");

  writeFileSync(
    join(dir, "src", "auth", "guard.ts"),
    "export function checkAccess(user: { role: string }) {\n  return user.role === 'admin';\n}\n"
  );
  writeFileSync(
    join(dir, "src", "routes", "billing.ts"),
    "import { checkAccess } from '../auth/guard';\nexport function updateBilling(u: { role: string }) {\n  if (!checkAccess(u)) throw new Error('403');\n  return true;\n}\n"
  );
  writeFileSync(
    join(dir, "src", "legacy", "migration.ts"),
    [
      "// TODO: remove legacy compat branch after Q2",
      "// FIXME: cast hides schema mismatch",
      "// TODO: rotate key AKIAIOSFODNN7EXAMPLE before launch",
      "export function legacyParse(raw: any): any {",
      "  // @ts-ignore legacy mismatch",
      "  const x = raw as unknown as Record<string, any>;",
      "  return x;",
      "}",
    ].join("\n") + "\n"
  );
  writeFileSync(
    join(dir, "src", "generated", "client.generated.ts"),
    Array.from({ length: 260 }, (_, i) => `export const GEN_${i} = ${i};`).join("\n") + "\n"
  );

  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "feat: initial service"]);

  // Co-change src/auth/guard.ts and src/routes/billing.ts across 4 commits including fixes + revert
  const commits = [
    "fix(auth): handle missing role on billing route",
    "fix(billing): align admin check with auth guard",
    "revert: undo broken billing role bypass",
    "feat(billing): tighten guard check",
  ];
  commits.forEach((msg, idx) => {
    writeFileSync(
      join(dir, "src", "auth", "guard.ts"),
      `export function checkAccess(user: { role: string }) {\n  // rev ${idx}\n  return user.role === 'admin' || user.role === 'owner';\n}\n`
    );
    writeFileSync(
      join(dir, "src", "routes", "billing.ts"),
      `import { checkAccess } from '../auth/guard';\nexport function updateBilling(u: { role: string }) {\n  // rev ${idx}\n  if (!checkAccess(u)) throw new Error('403');\n  return true;\n}\n`
    );
    git(dir, ["add", "."]);
    git(dir, ["commit", "-m", msg]);
  });

  return {
    dir,
    cacheDir,
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
      rmSync(cacheDir, { recursive: true, force: true });
    },
  };
}

function makeValidAudit(repoDir, overrides = {}) {
  return {
    schema_version: 2,
    audit: {
      repo_name: "demo-api",
      date: "2026-11-22",
      commit: "abc1234",
      effort: "standard",
      mode: "full",
      scope: ".",
      effective_paths: ["."],
      not_audited: "none",
      verification_commands: [{ command: "npm test", status: "observed: 2 passed" }],
      ...(overrides.audit || {}),
    },
    executive_summary: ["Centralize auth guard coupling and remove legacy escape hatches."],
    findings: overrides.findings ?? [
      {
        id: "DEBT-01",
        title: "Decouple billing route from auth guard internals",
        category: "Boundaries and Ownership",
        owner_scope: "auth & billing",
        origin: null,
        evidence: [
          { path: "src/auth/guard.ts", line: 1, symbol: "checkAccess", note: "Guard logic co-changes with billing." },
          { path: "src/routes/billing.ts", line: 2, symbol: "updateBilling", note: "Caller depends on guard semantics." },
        ],
        current_cost: "Role changes break billing and require lockstep edits.",
        interest_rate: "HIGH",
        interest_rate_reason: "5 commits, 2 fixes, 1 revert in recent history; 100% co-change coupling.",
        payoff: "Stable authorization contract with independent testing.",
        falsification: "Checked ADR 001 and git log; coupling is accidental, not documented.",
        slice: "Add unit tests for checkAccess and return a typed AccessDecision.",
        why_this_order: "Highest interest rate hotspot with repeated fixes and a revert.",
        gate: { command: "npm test", expected: "auth and billing tests pass", status: "observed", observed_result: "passed" },
        effort: "S",
        fix_risk: "LOW",
        fix_risk_reason: "Only one caller in repo.",
        blast_radius: "package",
        confidence: "HIGH",
        confidence_reason: "Verified both files and git history directly.",
      },
      {
        id: "DEBT-02",
        title: "Remove type escape hatches in legacy migration parser",
        category: "Type and Safety Escape Hatches",
        owner_scope: "legacy migration",
        origin: null,
        evidence: [
          { path: "src/legacy/migration.ts", line: 4, symbol: "legacyParse", note: "Uses any, @ts-ignore, and double cast." },
        ],
        current_cost: "Schema mismatches pass silently at runtime.",
        interest_rate: "MED",
        interest_rate_reason: "Cluster of 3 TODO/FIXME markers and 4 type escape hatches.",
        payoff: "Runtime validation catches malformed migration payloads early.",
        falsification: "Checked callers and docs; no compatibility requirement justifies unchecked any.",
        slice: "Replace any signature with unknown and validate expected keys.",
        why_this_order: "Contained single-file fix after primary auth hotspot.",
        gate: { command: "npm run typecheck", expected: "0 type errors", status: "proposed" },
        effort: "S",
        fix_risk: "LOW",
        fix_risk_reason: "Isolated helper function.",
        blast_radius: "local",
        confidence: "HIGH",
        confidence_reason: "Direct code inspection.",
      },
    ],
    investigate: [{ candidate: "No test suite yet", signal: "Zero test files in repo.", proof_needed: "Confirm CI test runner." }],
    rejected: [{ title: "client.generated.ts size", reason: "Generated file.", evidence: "src/generated/client.generated.ts:1" }],
    revived_rejections: [],
    implementer_notes: ["Land DEBT-01 before DEBT-02."],
  };
}

test("normalizeRepoKey matches SSH and HTTPS forms identically", () => {
  assert.equal(
    normalizeRepoKey("git@github.com:GraemeCode/tech-debt-audit.git"),
    normalizeRepoKey("https://github.com/graemecode/tech-debt-audit")
  );
  assert.equal(
    normalizeRepoKey("ssh://git@github.com/graemecode/tech-debt-audit.git"),
    "github.com/graemecode/tech-debt-audit"
  );
});

test("recon.mjs detects hotspots, co-change pairs, escape hatches, docs, tooling, excludes generated files, and redacts secrets", () => {
  const fx = makePlantedRepo();
  try {
    const res = runNode(RECON, ["--repo", fx.dir, "--effort", "standard"], {
      env: { TECH_DEBT_AUDIT_CACHE_DIR: fx.cacheDir },
    });
    assert.equal(res.status, 0, res.stderr);
    const data = JSON.parse(res.stdout);

    assert.equal(data.repo.is_git, true);
    assert.equal(data.repo.remote_normalized, "github.com/acme/demo-api");
    assert.ok(data.docs_and_intent.includes("AGENTS.md"));
    assert.ok(data.docs_and_intent.includes("docs/adr/001-auth.md"));
    assert.ok(data.tooling.verification_commands.some((v) => v.command === "npm run test"));

    // Generated file excluded from largest_files and hotspots
    assert.equal(data.signals.largest_files.some((f) => f.path.includes("generated")), false);

    // Hotspots detect fix & revert counts
    const guardHotspot = data.signals.hotspots.find((h) => h.path === "src/auth/guard.ts");
    assert.ok(guardHotspot, "expected guard.ts in hotspots");
    assert.equal(guardHotspot.commits, 5);
    assert.equal(guardHotspot.fix_commits, 2);
    assert.equal(guardHotspot.revert_commits, 1);

    // Cross-directory co-change coupling detected
    assert.ok(
      data.signals.co_change_pairs.some(
        (p) =>
          (p.file_a === "src/auth/guard.ts" && p.file_b === "src/routes/billing.ts") ||
          (p.file_b === "src/auth/guard.ts" && p.file_a === "src/routes/billing.ts")
      ),
      "expected cross-dir co-change pair between auth/guard.ts and routes/billing.ts"
    );

    // Escape hatches & TODO secret redaction
    assert.ok(data.signals.escape_hatch_clusters.some((e) => e.path === "src/legacy/migration.ts"));
    const todoCluster = data.signals.todo_clusters.find((t) => t.path === "src/legacy/migration.ts");
    assert.ok(todoCluster);
    assert.equal(JSON.stringify(todoCluster).includes("AKIAIOSFODNN7EXAMPLE"), false, "secret must be redacted in recon output");
    assert.ok(JSON.stringify(todoCluster).includes("[redacted"));
  } finally {
    fx.cleanup();
  }
});

test("recon.mjs supports branch mode importers, missing scope reporting, and non-git repos", () => {
  const fx = makePlantedRepo();
  const nonGitDir = mkdtempSync(join(tmpdir(), "tda-nongit-"));
  try {
    // Missing scope returns exit 2 with nearby candidates
    const missing = runNode(RECON, ["--repo", fx.dir, "--scope", "src/nonexistent"], {
      env: { TECH_DEBT_AUDIT_CACHE_DIR: fx.cacheDir },
    });
    assert.equal(missing.status, 2);
    const missData = JSON.parse(missing.stdout);
    assert.equal(missData.error, "none_of_requested_scopes_exist");
    assert.ok(missData.missing_scopes[0].nearby.includes("auth"));

    // Branch mode detects changed files + direct importers
    git(fx.dir, ["checkout", "-b", "feat/guard-tweak"]);
    writeFileSync(
      join(fx.dir, "src", "auth", "guard.ts"),
      "export function checkAccess(user: { role: string }) {\n  return user.role === 'admin';\n}\n"
    );
    git(fx.dir, ["add", "src/auth/guard.ts"]);
    git(fx.dir, ["commit", "-m", "chore: tweak guard"]);

    const br = runNode(RECON, ["--repo", fx.dir, "--branch", "--base", "main"], {
      env: { TECH_DEBT_AUDIT_CACHE_DIR: fx.cacheDir },
    });
    assert.equal(br.status, 0, br.stderr);
    const brData = JSON.parse(br.stdout);
    assert.equal(brData.scope.mode, "branch");
    assert.deepEqual(brData.branch_diff.changed_files, ["src/auth/guard.ts"]);
    assert.ok(brData.branch_diff.direct_importers.includes("src/routes/billing.ts"));

    // Non-git fallback works cleanly
    writeFileSync(join(nonGitDir, "index.js"), "export const ok = true;\n");
    const ng = runNode(RECON, ["--repo", nonGitDir], {
      env: { TECH_DEBT_AUDIT_CACHE_DIR: fx.cacheDir },
    });
    assert.equal(ng.status, 0, ng.stderr);
    const ngData = JSON.parse(ng.stdout);
    assert.equal(ngData.repo.is_git, false);
    assert.equal(ngData.scope.scoped_source_files, 1);
  } finally {
    fx.cleanup();
    rmSync(nonGitDir, { recursive: true, force: true });
  }
});

test("render-report.mjs catches hallucinated paths, out-of-bounds lines, secret leaks, and escapes XSS", () => {
  const fx = makePlantedRepo();
  try {
    const tmpInput = join(fx.cacheDir, "input.json");

    // 1. Hallucinated file path
    const badPath = makeValidAudit(fx.dir);
    badPath.findings[0].evidence[0].path = "src/hallucinated.ts";
    writeFileSync(tmpInput, JSON.stringify(badPath));
    const r1 = runNode(RENDER, ["--input", tmpInput, "--repo", fx.dir, "--validate-only"]);
    assert.notEqual(r1.status, 0);
    assert.match(r1.stderr, /file does not exist/);

    // 2. Out-of-bounds line number
    const badLine = makeValidAudit(fx.dir);
    badLine.findings[0].evidence[0].line = 9999;
    writeFileSync(tmpInput, JSON.stringify(badLine));
    const r2 = runNode(RENDER, ["--input", tmpInput, "--repo", fx.dir, "--validate-only"]);
    assert.notEqual(r2.status, 0);
    assert.match(r2.stderr, /exceeds file length/);

    // 3. Secret leak blocked
    const leak = makeValidAudit(fx.dir);
    leak.findings[0].current_cost = "Found token ghp_abcdefghijklmnopqrstuvwxyz123456 in logs";
    writeFileSync(tmpInput, JSON.stringify(leak));
    const r3 = runNode(RENDER, ["--input", tmpInput, "--repo", fx.dir, "--validate-only"]);
    assert.notEqual(r3.status, 0);
    assert.match(r3.stderr, /potential secret detected/);

    // 4. XSS payload escaped in both HTML body and embedded JSON script tag
    const xss = makeValidAudit(fx.dir);
    xss.findings[0].title = "Fix </script><img src=x onerror=alert(1)> injection";
    writeFileSync(tmpInput, JSON.stringify(xss));
    const outHtml = join(fx.cacheDir, "xss-report.html");
    const r4 = runNode(
      RENDER,
      ["--input", tmpInput, "--repo", fx.dir, "--format", "html", "--out", outHtml, "--no-open", "--no-memory"],
      { env: { TECH_DEBT_AUDIT_CACHE_DIR: fx.cacheDir } }
    );
    assert.equal(r4.status, 0, r4.stderr);
    const html = readFileSync(outHtml, "utf8");
    assert.equal(html.includes("<img src=x onerror=alert(1)>"), false, "raw HTML tag must not appear");
    assert.equal(html.includes("</script><img"), false, "script breakout must not appear");
    assert.ok(html.includes("\\u003c/script\\u003e"), "embedded JSON must escape angle brackets");
  } finally {
    fx.cleanup();
  }
});

test("longitudinal delta, scoped preservation, quest ID stability, and human reject closed loop", () => {
  const fx = makePlantedRepo();
  try {
    const env = { TECH_DEBT_AUDIT_CACHE_DIR: fx.cacheDir };
    const inputPath = join(fx.cacheDir, "audit.json");
    const outHtml = join(fx.cacheDir, "report.html");

    // Run 1: Full audit + quests -> creates DEBT-01 and DEBT-02
    writeFileSync(inputPath, JSON.stringify(makeValidAudit(fx.dir)));
    const r1 = runNode(RENDER, ["--input", inputPath, "--repo", fx.dir, "--out", outHtml, "--quests", "--no-open"], { env });
    assert.equal(r1.status, 0, r1.stderr);
    const j1 = JSON.parse(r1.stdout);
    assert.equal(j1.delta.has_prior_open, false);
    assert.ok(existsSync(join(fx.dir, ".tech-debt", "ledger.json")));

    // Run 2: Scoped audit on src/auth only (DEBT-02 in src/legacy is out of scope -> must NOT be resolved or expired!)
    const scopedAudit = makeValidAudit(fx.dir, {
      audit: { mode: "scoped", scope: "src/auth", effective_paths: ["src/auth"] },
      findings: [makeValidAudit(fx.dir).findings[0]],
    });
    writeFileSync(inputPath, JSON.stringify(scopedAudit));
    const r2 = runNode(RENDER, ["--input", inputPath, "--repo", fx.dir, "--out", outHtml, "--quests", "--no-open"], { env });
    assert.equal(r2.status, 0, r2.stderr);
    const j2 = JSON.parse(r2.stdout);
    assert.equal(j2.delta.resolved, 0, "out-of-scope DEBT-02 must not be marked resolved");
    assert.equal(j2.delta.persisted, 1);

    const ledgerAfterScoped = JSON.parse(readFileSync(join(fx.dir, ".tech-debt", "ledger.json"), "utf8"));
    const q2 = ledgerAfterScoped.quests.find((q) => q.id === "DEBT-02");
    assert.equal(q2.status, "open", "out-of-scope quest must stay open, not expired");

    // Run 3: Full audit where DEBT-01 is fixed, DEBT-02 persists (re-numbered by LLM as DEBT-01 with drifted line), and a brand-new finding appears
    const drifted = makeValidAudit(fx.dir).findings[1];
    drifted.id = "DEBT-01"; // LLM tries to renumber; quests mode must stabilize back to DEBT-02!
    drifted.evidence[0].line = 5; // drifted line, same symbol legacyParse
    const brandNew = {
      ...makeValidAudit(fx.dir).findings[0],
      id: "DEBT-02",
      title: "Add CI workflow gate for billing routes",
      category: "Tooling, CI, and Developer Workflow Debt",
      evidence: [{ path: "package.json", line: 1, symbol: "scripts", note: "No CI workflow enforces test script." }],
    };
    const run3Audit = makeValidAudit(fx.dir, { findings: [drifted, brandNew] });
    writeFileSync(inputPath, JSON.stringify(run3Audit));
    const r3 = runNode(RENDER, ["--input", inputPath, "--repo", fx.dir, "--out", outHtml, "--quests", "--no-open"], { env });
    assert.equal(r3.status, 0, r3.stderr);
    const j3 = JSON.parse(r3.stdout);
    assert.equal(j3.delta.resolved, 1, "DEBT-01 should be marked resolved");
    assert.equal(j3.delta.persisted, 1, "DEBT-02 should be marked persisted via symbol anchor");
    assert.equal(j3.delta.new, 1, "new finding should be marked new");

    const ledger3 = JSON.parse(readFileSync(join(fx.dir, ".tech-debt", "ledger.json"), "utf8"));
    assert.ok(ledger3.quests.some((q) => q.id === "DEBT-02" && q.title.includes("escape hatches")), "DEBT-02 ID preserved");
    assert.ok(ledger3.quests.some((q) => q.id === "DEBT-03" && q.title.includes("CI workflow")), "new finding gets DEBT-03 without recycling DEBT-01");
    assert.ok(ledger3.quests.some((q) => q.id === "DEBT-01" && q.status === "expired"), "resolved prior quest marked expired");

    // Run 4: Human rejects DEBT-02 via memory.mjs -> updates both cache memo and .tech-debt/ledger.json
    const rej = runNode(MEMORY, ["reject", "--repo", fx.dir, "--id", "DEBT-02", "--reason", "scheduled for full deletion next month"], { env });
    assert.equal(rej.status, 0, rej.stderr);
    const rejJson = JSON.parse(rej.stdout);
    assert.equal(rejJson.ok, true);
    assert.equal(rejJson.quest_ledger_updated, true);

    const statusRes = runNode(MEMORY, ["status", "--repo", fx.dir], { env });
    const statusJson = JSON.parse(statusRes.stdout);
    assert.ok(statusJson.rejected.some((r) => r.source === "human" && r.reason.includes("full deletion")));
    assert.equal(statusJson.open_findings.some((f) => f.id === "DEBT-02"), false);

    const ledger4 = JSON.parse(readFileSync(join(fx.dir, ".tech-debt", "ledger.json"), "utf8"));
    assert.equal(ledger4.quests.find((q) => q.id === "DEBT-02").status, "rejected");
  } finally {
    fx.cleanup();
  }
});

test("recon.mjs ignores Rust tests.rs and inline #[cfg(test)] unwrap calls", () => {
  const dir = mkdtempSync(join(tmpdir(), "tda-rust-"));
  const cacheDir = mkdtempSync(join(tmpdir(), "tda-rust-cache-"));
  try {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "src", "tests.rs"),
      "fn t() { let a = Some(1).unwrap(); let b = Some(2).unwrap(); let c = Some(3).unwrap(); }\n"
    );
    writeFileSync(
      join(dir, "src", "lib.rs"),
      "pub fn prod() -> i32 { 1 }\n#[cfg(test)]\nmod tests {\n  fn t() { Some(1).unwrap(); Some(2).unwrap(); Some(3).unwrap(); }\n}\n"
    );
    const res = runNode(RECON, ["--repo", dir], { env: { TECH_DEBT_AUDIT_CACHE_DIR: cacheDir } });
    assert.equal(res.status, 0, res.stderr);
    const data = JSON.parse(res.stdout);
    assert.equal(data.signals.escape_hatch_clusters.length, 0, "Rust test files and #[cfg(test)] blocks must not inflate escape hatches");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("eval-fixture.mjs creates planted repo and scores recall and trap avoidance", () => {
  const dir = mkdtempSync(join(tmpdir(), "tda-eval-"));
  const cacheDir = mkdtempSync(join(tmpdir(), "tda-eval-cache-"));
  try {
    createEvalFixture(dir);
    // Recon runs cleanly on eval fixture and detects pricing hotspot
    const reconRes = runNode(RECON, ["--repo", dir], { env: { TECH_DEBT_AUDIT_CACHE_DIR: cacheDir } });
    assert.equal(reconRes.status, 0, reconRes.stderr);
    const recon = JSON.parse(reconRes.stdout);
    assert.ok(recon.signals.hotspots.some((h) => h.path === "src/billing/pricing.js"));
    assert.ok(recon.docs_and_intent.includes("docs/adr/001-sqlite-sync.md"));

    // Score a trap-triggering audit vs clean partial audit
    const badAudit = {
      schema_version: 2,
      audit: {
        repo_name: "planted-debt-api",
        date: "2026-11-22",
        commit: recon.repo.commit,
        effort: "standard",
        mode: "full",
        scope: ".",
        effective_paths: ["."],
        not_audited: "none",
        verification_commands: [{ command: "npm test", status: "observed: 1 passed" }],
      },
      executive_summary: ["Sample"],
      findings: [
        {
          id: "DEBT-01",
          title: "Replace sync SQLite store",
          category: "Boundaries and Ownership",
          owner_scope: "db",
          origin: null,
          evidence: [{ path: "src/db/store.js", line: 2, symbol: "SyncStore", note: "Sync calls" }],
          current_cost: "Blocks event loop",
          interest_rate: "LOW",
          interest_rate_reason: "Low",
          payoff: "Async",
          falsification: "Missed ADR",
          slice: "Rewrite",
          why_this_order: "First",
          gate: { command: "npm test", expected: "pass", status: "observed" },
          effort: "L",
          fix_risk: "HIGH",
          fix_risk_reason: "Big",
          blast_radius: "package",
          confidence: "LOW",
          confidence_reason: "Low",
        },
      ],
      investigate: [],
      rejected: [],
      implementer_notes: [],
    };
    const scored = scoreAudit(badAudit, dir);
    assert.equal(scored.valid, true);
    assert.equal(scored.triggered_traps.length, 1);
    assert.equal(scored.triggered_traps[0].trap, "trap-adr-sqlite");
    assert.equal(scored.recall, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(cacheDir, { recursive: true, force: true });
  }
});

test("render-report.mjs emits valid inline JS, handles zero findings cleanly, and matches sample markdown", () => {
  const fx = makePlantedRepo();
  try {
    const tmpInput = join(fx.cacheDir, "zero.json");
    const outHtml = join(fx.cacheDir, "zero.html");
    const zeroAudit = makeValidAudit(fx.dir, { findings: [] });
    writeFileSync(tmpInput, JSON.stringify(zeroAudit));
    const res = runNode(
      RENDER,
      ["--input", tmpInput, "--repo", fx.dir, "--format", "html", "--out", outHtml, "--no-open", "--no-memory"],
      { env: { TECH_DEBT_AUDIT_CACHE_DIR: fx.cacheDir } }
    );
    assert.equal(res.status, 0, res.stderr);
    const html = readFileSync(outHtml, "utf8");
    assert.ok(html.includes("No actionable technical debt"));

    // Verify embedded JSON and inline client JS syntax
    const dataMatch = html.match(/<script id="audit-data" type="application\/json">([\s\S]*?)<\/script>/);
    assert.ok(dataMatch, "missing audit-data JSON block");
    assert.deepEqual(JSON.parse(dataMatch[1]).findings, []);
    const jsMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(jsMatch, "missing inline client script");
    const tmpJs = join(fx.cacheDir, "client-check.js");
    writeFileSync(tmpJs, jsMatch[1], "utf8");
    execFileSync(process.execPath, ["--check", tmpJs], { stdio: "pipe" });
  } finally {
    fx.cleanup();
  }
});
