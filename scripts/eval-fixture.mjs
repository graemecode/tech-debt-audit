#!/usr/bin/env node
// Ground-truth behavioral eval fixture & scorer for tech-debt-audit.
// Creates a realistic git repo with 5 planted real debts and 5 planted non-debt traps,
// and scores any agent's audit JSON on recall, trap avoidance, citation accuracy, and gate verification.
// Zero external dependencies; Node 18+.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateAudit } from "../skills/engineering/tech-debt-audit/scripts/lib/common.mjs";

export const PLANTED_DEBTS = [
  {
    id: "auth-duplication",
    label: "Duplicated diverging auth checks across route handlers",
    paths: ["src/routes/accounts.js", "src/routes/billing.js", "src/routes/invites.js"],
    keywords: ["auth", "authorization", "access", "role", "ownership", "403", "404"],
  },
  {
    id: "pricing-hotspot-untested",
    label: "Untested high-churn pricing calculation with repeated fixes/reverts",
    paths: ["src/billing/pricing.js"],
    keywords: ["pricing", "price", "cent", "round", "test", "billing", "discount"],
  },
  {
    id: "legacy-compat-no-expiry",
    label: "Stale v1 migration compatibility branch with no expiry/owner",
    paths: ["src/migrations/v1Compat.js"],
    keywords: ["compat", "legacy", "migration", "v1", "expiry"],
  },
  {
    id: "unchecked-webhook-boundary",
    label: "Unvalidated webhook trust boundary swallowing errors",
    paths: ["src/webhooks/ingest.js"],
    keywords: ["webhook", "ingest", "validat", "swallow", "catch", "trust", "schema"],
  },
  {
    id: "unwired-generator",
    label: "Checked-in generated SDK with no documented script/CI recipe",
    paths: ["scripts/generate-sdk.mjs", "package.json"],
    keywords: ["generat", "sdk", "script", "reproduc"],
  },
];

export const PLANTED_TRAPS = [
  {
    id: "trap-adr-sqlite",
    label: "Documented ADR tradeoff: synchronous SQLite store",
    paths: ["src/db/store.js"],
    keywords: ["sqlite", "sync", "store.js"],
  },
  {
    id: "trap-generated-size",
    label: "Generated file size alone (sdk.generated.js)",
    paths: ["src/generated/sdk.generated.js"],
    keywords: ["size", "large", "god file", "loc", "lines"],
    excludeKeywords: ["generat", "script", "reproduc", "ci"],
  },
  {
    id: "trap-test-fixture-dup",
    label: "Intentional test fixture duplication for isolation",
    paths: ["test/fixtures/accounts.fixture.js", "test/fixtures/billing.fixture.js"],
    keywords: ["fixture"],
  },
  {
    id: "trap-dormant-util",
    label: "Dormant, tested utility with minor style quirk",
    paths: ["src/utils/slug.js"],
    keywords: ["slug"],
  },
  {
    id: "trap-stale-todo",
    label: "Stale TODO comment in health.js already implemented",
    paths: ["src/routes/health.js"],
    keywords: ["health", "todo", "sha"],
  },
];

function git(cwd, args) {
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Eval Maintainer",
      GIT_AUTHOR_EMAIL: "eval@example.com",
      GIT_COMMITTER_NAME: "Eval Maintainer",
      GIT_COMMITTER_EMAIL: "eval@example.com",
    },
  });
}

export function createEvalFixture(targetDir) {
  const dir = resolve(targetDir);
  mkdirSync(dir, { recursive: true });
  git(dir, ["init", "-b", "main"]);
  git(dir, ["remote", "add", "origin", "https://github.com/eval/planted-debt-api.git"]);

  const dirs = [
    "src/routes",
    "src/billing",
    "src/migrations",
    "src/webhooks",
    "src/db",
    "src/utils",
    "src/generated",
    "scripts",
    "docs/adr",
    "test/fixtures",
  ];
  for (const d of dirs) mkdirSync(join(dir, d), { recursive: true });

  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name: "planted-debt-api",
        type: "module",
        scripts: {
          test: "node --test test/*.test.js",
        },
      },
      null,
      2
    ) + "\n"
  );

  writeFileSync(
    join(dir, "AGENTS.md"),
    [
      "# Repo Conventions",
      "- Test fixtures in `test/fixtures/` are intentionally duplicated per domain for isolation.",
      "- Read `docs/adr/` before proposing infrastructure changes.",
      "- Run `npm test` to verify behavior.",
    ].join("\n") + "\n"
  );

  writeFileSync(
    join(dir, "docs/adr/001-sqlite-sync.md"),
    [
      "# ADR 001: Synchronous SQLite Storage",
      "Status: Accepted (reviewed 2026-10)",
      "Decision: Keep synchronous single-writer SQLite in `src/db/store.js` until sustained traffic exceeds 500 RPS (current peak: 4 RPS).",
      "Rationale: Simplicity, zero ops overhead, deterministic local tests.",
    ].join("\n") + "\n"
  );

  writeFileSync(
    join(dir, "src/db/store.js"),
    "// Synchronous in-memory/SQLite-style store per ADR 001\nexport class SyncStore {\n  constructor() { this.rows = new Map(); }\n  getSync(id) { return this.rows.get(id) ?? null; }\n  putSync(id, val) { this.rows.set(id, val); }\n}\n"
  );

  writeFileSync(
    join(dir, "src/utils/slug.js"),
    "export function toSlug(input) {\n  var out = '';\n  var s = String(input).toLowerCase();\n  for (var i = 0; i < s.length; i++) {\n    var c = s[i];\n    out += (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') ? c : '-';\n  }\n  return out.replace(/-+/g, '-').replace(/^-|-$/g, '');\n}\n"
  );

  writeFileSync(
    join(dir, "src/routes/health.js"),
    "// TODO: return build sha in health response\nexport function healthHandler() {\n  return { ok: true, sha: process.env.BUILD_SHA || 'dev' };\n}\n"
  );

  writeFileSync(
    join(dir, "test/fixtures/accounts.fixture.js"),
    "export const sampleAccount = { id: 'acc_1', orgId: 'org_1', role: 'admin', active: true };\n"
  );
  writeFileSync(
    join(dir, "test/fixtures/billing.fixture.js"),
    "export const sampleBillingAccount = { id: 'acc_1', orgId: 'org_1', role: 'admin', active: true };\n"
  );

  writeFileSync(
    join(dir, "test/slug.test.js"),
    "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { toSlug } from '../src/utils/slug.js';\ntest('toSlug normalizes text', () => { assert.equal(toSlug('Hello World!'), 'hello-world'); });\n"
  );

  writeFileSync(
    join(dir, "scripts/generate-sdk.mjs"),
    "#!/usr/bin/env node\n// Undocumented generator for src/generated/sdk.generated.js (not wired in package.json)\nconsole.log('// generated sdk');\n"
  );
  writeFileSync(
    join(dir, "src/generated/sdk.generated.js"),
    "// AUTO-GENERATED by scripts/generate-sdk.mjs — do not hand-edit\n" +
      Array.from({ length: 320 }, (_, i) => `export const ENDPOINT_${i} = '/v1/resource/${i}';`).join("\n") +
      "\n"
  );

  writeFileSync(
    join(dir, "src/migrations/v1Compat.js"),
    [
      "// TODO: remove v1 legacy payload fallback after 2024 Q3 migration",
      "// HACK: kept for compatibility; unclear if any caller still sends legacy_id",
      "export function normalizeAccountRecord(row) {",
      "  if (row && row.legacy_id && !row.id) {",
      "    return { ...row, id: String(row.legacy_id), migratedAt: 'legacy' };",
      "  }",
      "  return row;",
      "}",
    ].join("\n") + "\n"
  );

  writeFileSync(
    join(dir, "src/webhooks/ingest.js"),
    [
      "// @ts-ignore untrusted payload shape",
      "export function ingestWebhook(rawBody, store) {",
      "  try {",
      "    const payload = JSON.parse(rawBody);",
      "    // No signature or schema check; silently drops malformed events",
      "    store.putSync(payload.data.event.id, payload.data.event);",
      "    return { accepted: true };",
      "  } catch {",
      "    return { accepted: true };",
      "  }",
      "}",
    ].join("\n") + "\n"
  );

  writeFileSync(
    join(dir, "src/routes/accounts.js"),
    "import { normalizeAccountRecord } from '../migrations/v1Compat.js';\nexport function getAccount(req, store) {\n  if (!req.user || (req.user.accountId !== req.params.id && req.user.role !== 'admin')) {\n    return { status: 403, error: 'forbidden' };\n  }\n  return { status: 200, data: normalizeAccountRecord(store.getSync(req.params.id)) };\n}\n"
  );
  writeFileSync(
    join(dir, "src/routes/billing.js"),
    "import { computeTotalCents } from '../billing/pricing.js';\nexport function getBilling(req) {\n  if (!req.user || (req.user.accountId !== req.params.id && req.user.role !== 'superadmin')) {\n    return { status: 404, error: 'not_found' };\n  }\n  return { status: 200, total: computeTotalCents(req.items || [], req.discount || 0) };\n}\n"
  );
  writeFileSync(
    join(dir, "src/routes/invites.js"),
    "export function createInvite(req) {\n  if (!req.user || req.user.accountId !== req.params.id) {\n    return { status: 401, error: 'unauthorized' };\n  }\n  return { status: 201, invited: req.body?.email };\n}\n"
  );
  writeFileSync(
    join(dir, "src/billing/pricing.js"),
    "export function computeTotalCents(items, discountPct) {\n  const subtotal = items.reduce((s, it) => s + it.price * it.qty, 0);\n  return subtotal * (1 - discountPct / 100);\n}\n"
  );

  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "feat: initial planted-debt-api"]);

  // Build realistic git history: auth co-change + pricing fix/revert churn
  const authFixes = [
    "fix(auth): allow admin role on accounts route",
    "fix(billing): align superadmin check with accounts route",
    "fix(invites): block cross-account invites",
    "feat(routes): include billing check on account updates",
  ];
  authFixes.forEach((msg, i) => {
    writeFileSync(
      join(dir, "src/routes/accounts.js"),
      `import { normalizeAccountRecord } from '../migrations/v1Compat.js';\nexport function getAccount(req, store) {\n  // auth-rev ${i}\n  if (!req.user || (req.user.accountId !== req.params.id && req.user.role !== 'admin')) {\n    return { status: 403, error: 'forbidden' };\n  }\n  return { status: 200, data: normalizeAccountRecord(store.getSync(req.params.id)) };\n}\n`
    );
    writeFileSync(
      join(dir, "src/routes/billing.js"),
      `import { computeTotalCents } from '../billing/pricing.js';\nexport function getBilling(req) {\n  // auth-rev ${i}\n  if (!req.user || (req.user.accountId !== req.params.id && req.user.role !== 'superadmin')) {\n    return { status: 404, error: 'not_found' };\n  }\n  return { status: 200, total: computeTotalCents(req.items || [], req.discount || 0) };\n}\n`
    );
    git(dir, ["add", "src/routes/accounts.js", "src/routes/billing.js"]);
    git(dir, ["commit", "-m", msg]);
  });

  const pricingChurn = [
    "fix(pricing): handle zero discount edge case",
    "fix(pricing): clamp negative subtotal",
    "revert: undo broken tax rounding in pricing",
    "fix(pricing): avoid NaN when items empty",
  ];
  pricingChurn.forEach((msg, i) => {
    writeFileSync(
      join(dir, "src/billing/pricing.js"),
      `export function computeTotalCents(items, discountPct) {\n  // pricing-rev ${i}\n  const subtotal = (items || []).reduce((s, it) => s + it.price * it.qty, 0);\n  return Math.max(0, subtotal * (1 - (discountPct || 0) / 100));\n}\n`
    );
    git(dir, ["add", "src/billing/pricing.js"]);
    git(dir, ["commit", "-m", msg]);
  });

  return dir;
}

function findingMatchesSpec(finding, spec) {
  const paths = (finding.evidence || []).map((e) => String(e.path || "").replace(/^\.\//, ""));
  const text = `${finding.title || ""} ${finding.current_cost || ""} ${finding.slice || ""} ${paths.join(" ")}`.toLowerCase();
  const pathHit = spec.paths.some((sp) => paths.some((p) => p === sp || p.endsWith(sp)));
  if (!pathHit) return false;
  if (spec.excludeKeywords?.some((ek) => text.includes(ek))) return false;
  return spec.keywords.some((kw) => text.includes(kw));
}

function rejectedMatchesTrap(rejectedItem, trap) {
  const text = `${rejectedItem.title || ""} ${rejectedItem.reason || ""} ${rejectedItem.evidence || ""}`.toLowerCase();
  const pathHit = trap.paths.some((sp) => text.includes(sp.toLowerCase()) || text.includes(sp.split("/").pop().toLowerCase()));
  return pathHit || trap.keywords.some((kw) => text.includes(kw));
}

export function scoreAudit(auditData, repoDir = null) {
  const val = validateAudit(auditData, { repoRoot: repoDir });
  const findings = Array.isArray(auditData.findings) ? auditData.findings : [];
  const rejected = Array.isArray(auditData.rejected) ? auditData.rejected : [];

  const matchedDebts = [];
  const missedDebts = [];
  for (const debt of PLANTED_DEBTS) {
    const hit = findings.find((f) => findingMatchesSpec(f, debt));
    if (hit) matchedDebts.push({ debt: debt.id, finding_id: hit.id, title: hit.title });
    else missedDebts.push(debt.id);
  }

  const triggeredTraps = [];
  const explicitlyRejectedTraps = [];
  for (const trap of PLANTED_TRAPS) {
    const badHit = findings.find((f) => findingMatchesSpec(f, trap));
    if (badHit) triggeredTraps.push({ trap: trap.id, finding_id: badHit.id, title: badHit.title });
    if (rejected.some((r) => rejectedMatchesTrap(r, trap))) {
      explicitlyRejectedTraps.push(trap.id);
    }
  }

  const recall = matchedDebts.length / PLANTED_DEBTS.length;
  const trapAvoidance = (PLANTED_TRAPS.length - triggeredTraps.length) / PLANTED_TRAPS.length;
  const trapRejectionBonus = explicitlyRejectedTraps.length / PLANTED_TRAPS.length;
  const observedGateRate = findings.length
    ? findings.filter((f) => f.gate?.status === "observed").length / findings.length
    : 0;
  const citationValidity = val.valid ? 1 : 0;

  // Weighted 0-100 score: Recall 40, Trap avoidance 25, Citation/schema 15, Observed gates 10, Explicit trap rejections 10
  const score = Math.round(
    recall * 40 +
      trapAvoidance * 25 +
      citationValidity * 15 +
      observedGateRate * 10 +
      trapRejectionBonus * 10
  );

  return {
    score,
    valid: val.valid,
    validation_errors: val.errors,
    recall: Number((recall * 100).toFixed(1)),
    trap_avoidance: Number((trapAvoidance * 100).toFixed(1)),
    observed_gate_rate: Number((observedGateRate * 100).toFixed(1)),
    matched_debts: matchedDebts,
    missed_debts: missedDebts,
    triggered_traps: triggeredTraps,
    explicitly_rejected_traps: explicitlyRejectedTraps,
  };
}

if (process.argv[1] && resolve(process.argv[1]).endsWith("eval-fixture.mjs")) {
  const [cmd, target, ...rest] = process.argv.slice(2);
  if (cmd === "create" && target) {
    const created = createEvalFixture(target);
    console.log(JSON.stringify({ ok: true, fixture_dir: created, planted_debts: PLANTED_DEBTS.length, planted_traps: PLANTED_TRAPS.length }, null, 2));
  } else if (cmd === "score" && target) {
    const repoIdx = rest.indexOf("--repo");
    const repoDir = repoIdx >= 0 ? rest[repoIdx + 1] : null;
    const audit = JSON.parse(readFileSync(target, "utf8"));
    const result = scoreAudit(audit, repoDir);
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exit(1);
  } else {
    console.error("Usage:\n  node scripts/eval-fixture.mjs create <dir>\n  node scripts/eval-fixture.mjs score <audit.json> [--repo <dir>]");
    process.exit(1);
  }
}
