# Quest Ledger (`quests` mode)

In `quests` mode, `scripts/render-report.mjs --quests` writes a machine-readable ledger to `.tech-debt/ledger.json` in the repo root. The ledger is a stable contract for downstream tooling — issue-sync bots, paydown trackers, or gamified quest layers — that turns findings into work items and verifies paydown.

Two rules shape everything here:

- **Emit facts, never scores.** Points, rewards, and rankings are computed by downstream consumers; they never appear in the ledger.
- **`quests` is the explicit opt-in for an in-repo artifact** required by Hard Rule 1. Without `--quests`, never write `.tech-debt/ledger.json`.

## Lifecycle & ID Stability

Handled automatically by `scripts/render-report.mjs --quests`:

- Reads existing `.tech-debt/ledger.json` before writing.
- Reuses `id` values for findings matching a prior entry (by `path::symbol` anchor or path + title overlap); assigns the next unused `DEBT-NN` to new findings. Never recycles an ID.
- On `scoped` or `branch` runs, preserves prior open entries outside the audited scope untouched (only marks in-scope missing entries as `expired`).
- Carries `rejected` and `investigate` entries into the ledger while keeping the out-of-repo cache memo synced.
- `scripts/memory.mjs reject` also updates matching entries in `.tech-debt/ledger.json` (`status: "rejected"`) when the file already exists.
- Findings without a machine-checkable gate get `"gate": null`.
- `generated_by` reads `metadata.version` directly from `SKILL.md` (no runtime dependency on `.claude-plugin/plugin.json`).

## Shape (`schema_version: 1`, backward-compatible)

```json
{
  "schema_version": 1,
  "generated_by": "tech-debt-audit@<version from SKILL.md>",
  "repo": "<origin URL, or absolute path when there is no remote>",
  "audit": {
    "date": "<YYYY-MM-DD>",
    "commit": "<short SHA, or \"working tree (no git)\">",
    "effort": "quick|standard|deep",
    "scope": "<mirrors the report's Scope inspected line>",
    "not_audited": "<important exclusions>"
  },
  "quests": [
    {
      "id": "DEBT-01",
      "title": "<imperative title>",
      "category": "<debt-playbook category>",
      "origin": "introduced|amplified|pre-existing|null",
      "evidence": [
        { "path": "src/file.ts", "line": 42, "symbol": "fnName", "note": "<what is there now>" }
      ],
      "current_cost": "<what maintainers pay today>",
      "interest_rate": "HIGH|MED|LOW",
      "interest_rate_reason": "<churn/defect/co-change evidence>",
      "payoff": "<what improves if paid down>",
      "falsification": "<what was checked to disprove it>",
      "slice": "<smallest coherent paydown step>",
      "gate": { "command": "<command>", "expected": "<machine-checkable result>", "status": "observed|proposed" },
      "effort": "S|M|L",
      "fix_risk": "LOW|MED|HIGH",
      "blast_radius": "local|package|cross-package|external",
      "confidence": "HIGH|MED|LOW",
      "status": "open|rejected|expired",
      "owner_scope": "<area if inferable>"
    }
  ],
  "rejected": [{ "title": "<candidate>", "reason": "<one line>", "evidence": "<file or area>" }],
  "investigate": [{ "candidate": "<name>", "signal": "<evidence>", "proof_needed": "<next check>" }]
}
```

Downstream tooling owns workflow statuses beyond `open|rejected|expired` (e.g. `claimed`, `verifying`, `verified`) — `render-report.mjs` preserves non-`open` downstream statuses across re-runs.
