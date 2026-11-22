# Canonical Audit JSON Schema (`schema_version: 2`)

Write this JSON to a temporary file (e.g. `/tmp/tech-debt-input-<repo>.json`) and pass it to `scripts/render-report.mjs`. This single intermediate representation drives validation, HTML rendering, Markdown rendering, `.tech-debt/ledger.json` (`--quests`), and durable cache memory.

## Shape

```json
{
  "schema_version": 2,
  "audit": {
    "repo_name": "example-api",
    "date": "2026-11-22",
    "commit": "abc1234",
    "effort": "quick|standard|deep",
    "mode": "full|branch|scoped",
    "scope": "src/routes, src/auth, scripts",
    "effective_paths": ["src/routes", "src/auth", "scripts"],
    "coverage": {
      "inspected": ["src/routes", "src/auth", "scripts"],
      "deferred": ["src/workers (budgeted for follow-up)"],
      "out_of_scope": ["frontend app", "deployment configuration"]
    },
    "not_audited": "frontend app, deployment configuration",
    "verification_commands": [
      { "command": "npm test -- auth", "status": "observed: 14 passed" },
      { "command": "npx tsc --noEmit", "status": "observed: 0 errors" }
    ]
  },
  "executive_summary": [
    "Highest leverage: ...",
    "Smallest safe first step: ..."
  ],
  "findings": [
    {
      "id": "DEBT-01",
      "title": "Centralize repeated account authorization",
      "category": "Boundaries and Ownership",
      "owner_scope": "API routes & auth boundary",
      "origin": null,
      "evidence": [
        {
          "path": "src/routes/accounts.ts",
          "line": 42,
          "symbol": "getAccountHandler",
          "note": "Route-local ownership check duplicates admin bypass logic."
        }
      ],
      "current_cost": "Security-sensitive auth checks must be updated in 3 route files, causing edge-case drift.",
      "interest_rate": "HIGH",
      "interest_rate_reason": "Touched in 11 commits (4 fix commits) over 6 months; co-changes with billing.ts in 5 commits.",
      "payoff": "Single auth boundary eliminates repeated bugs and makes new route handlers safe by default.",
      "falsification": "Checked all 3 route handlers, auth middleware, and git log -n 5; no ADR documents per-route divergence and error codes differ accidentally.",
      "slice": "Add characterization tests for the 3 routes, then extract requireAccountAccess without changing HTTP status codes.",
      "out_of_scope": ["Changing HTTP error status codes", "Rewriting unrelated auth middleware"],
      "stop_conditions": [
        "Baseline `npm test -- auth` fails before your edits",
        "Any cited route handler has already been refactored to shared middleware"
      ],
      "why_this_order": "Highest interest rate on a security-critical boundary with a clean bounded first slice.",
      "gate": {
        "command": "npm test -- auth",
        "expected": "all auth and route characterization tests pass",
        "status": "observed",
        "observed_result": "14 passed in 1.2s before changes"
      },
      "effort": "M",
      "fix_risk": "MED",
      "fix_risk_reason": "HTTP error status semantics across 3 live routes must remain backward-compatible.",
      "blast_radius": "package",
      "confidence": "HIGH",
      "confidence_reason": "Verified all 3 handlers directly and ran existing auth test suite."
    }
  ],
  "investigate": [
    {
      "candidate": "Test fixture drift",
      "signal": "Similar fixture factories in packages/api and packages/worker.",
      "proof_needed": "Compare recent test failure history and fixture edit co-changes."
    }
  ],
  "rejected": [
    {
      "title": "Large generated API client",
      "reason": "Generated from documented OpenAPI build step; size is not hand-maintained debt.",
      "evidence": "src/generated/client.ts:1"
    }
  ],
  "revived_rejections": [],
  "implementer_notes": [
    "Add characterization tests before extracting helpers.",
    "Keep generated-file script wiring in a separate commit from route changes."
  ],
  "recon_summary": {
    "hotspots": [
      { "path": "src/routes/accounts.ts", "commits": 11, "fix_commits": 4, "revert_commits": 0, "loc": 240 }
    ],
    "co_change_pairs": [
      { "file_a": "src/routes/accounts.ts", "file_b": "src/routes/billing.ts", "co_commits": 5, "coupling_ratio": 0.45 }
    ]
  }
}
```

## Validation Rules Enforced by `render-report.mjs`

- `findings` must be ordered in **recommended paydown order** (index 0 = Order 1).
- `id`: unique `DEBT-NN` (`DEBT-01`, `DEBT-02`, ...). In `quests` mode with an existing `.tech-debt/ledger.json`, `render-report.mjs` automatically preserves prior IDs for overlapping findings and never recycles IDs.
- `category`: must exactly match one of the 10 categories in [debt-playbook.md](debt-playbook.md).
- `evidence[]`: every entry requires `path`, positive integer `line`, `symbol` (function/class/type name or `"(module)"`), and `note`. When `--repo` is provided, `render-report.mjs` verifies that every `path` exists inside the repo and `line <= file line count`.
- `interest_rate`: `HIGH` | `MED` | `LOW`, backed by `interest_rate_reason` (churn, fix/revert rate, co-change coupling, or active roadmap drag).
- `falsification`: required non-empty description of what was checked to try to disprove the finding.
- `blast_radius`: `local` (single file/module) | `package` (multiple files in one package) | `cross-package` (multiple packages/services) | `external` (public API, DB schema, wire protocol, or CLI contract).
- `gate`: either `null` (manual verification only) or `{ command, expected, status: "observed" | "proposed", observed_result? }`. Use `"observed"` **only** when the command actually ran read-only during this audit.
- `origin`: required (`"introduced"` | `"amplified"` | `"pre-existing"`) when `audit.mode === "branch"`; `null` otherwise.
- `effective_paths`: copy `scope.effective_paths` from `recon.mjs` so scoped/branch runs never falsely mark out-of-scope prior findings as resolved.
- `recon_summary`: optional top hotspots & co-change pairs copied from `recon.mjs` for transparency in the HTML report appendix.
- **Input hygiene & bounds**: max 5MB JSON input, max nesting depth 32, required strings must contain visible non-whitespace characters, and forbidden control or invisible bidi/format characters (`\u202E`, etc.) fail validation.
- **Executor handoff fields** (optional, strongly recommended): `out_of_scope` (array of strings) and `stop_conditions` (array of strings) feed directly into the HTML report's **Copy Agent Prompt** handoff alongside a mechanical `git rev-parse --short HEAD` drift check.
- **Secret guardrail**: any string matching private keys, AWS/GitHub/Slack/Google/Stripe-style keys, embedded URL credentials, or JWTs causes validation to fail immediately.
