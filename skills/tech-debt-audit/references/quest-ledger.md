# Quest Ledger (quests mode)

In `quests` mode, after vetting and prioritizing, additionally write a machine-readable ledger to `.tech-debt/ledger.json` in the repo root. The ledger is a stable contract for downstream tooling — issue-sync bots, paydown trackers, or gamified quest layers — that turns findings into work items and verifies paydown. Two rules shape everything here:

- **Emit facts, never scores.** Points, rewards, and rankings are computed by whatever consumes the ledger; they never appear in it. This keeps the audit un-gameable.
- **The `quests` keyword is the explicit request for an in-repo artifact** that Hard Rule 1 requires. Without it, never write into the audited repo.

## Writing the ledger

- Read the existing `.tech-debt/ledger.json` first if present. Reuse `id` values for findings whose evidence overlaps a prior entry; assign the next free `DEBT-NN` to new findings. Never recycle an id.
- Carry rejected candidates and investigate-later items into the ledger (in quests mode the ledger is the shared memory; still maintain the cache memo per "Persist Audit Memory").
- Findings without a machine-checkable verification gate get `"gate": null` — they are real debt but downstream tooling should skip them for anything score-like.
- JSON only, UTF-8, two-space indent. Never include secret values in `note` fields.

## Shape (`schema_version: 1`)

```json
{
  "schema_version": 1,
  "generated_by": "tech-debt-audit@<version from plugin.json>",
  "repo": "<origin URL, or absolute path when there is no remote>",
  "audit": {
    "date": "<YYYY-MM-DD>",
    "commit": "<short SHA, or \"working-tree\">",
    "effort": "quick|standard|deep",
    "scope": "<mirrors the report's Scope inspected line>",
    "not_audited": "<important exclusions>"
  },
  "quests": [
    {
      "id": "DEBT-01",
      "title": "<imperative title>",
      "category": "<debt-playbook category>",
      "origin": "introduced|amplified|pre-existing|null  (branch audits only; null otherwise)",
      "evidence": [{ "path": "src/file.ts", "line": 42, "note": "<what is there now>" }],
      "current_cost": "<what maintainers pay today>",
      "payoff": "<what improves if paid down>",
      "slice": "<smallest coherent paydown step>",
      "gate": { "command": "<command>", "expected": "<machine-checkable result>" },
      "effort": "S|M|L",
      "fix_risk": "LOW|MED|HIGH",
      "confidence": "HIGH|MED|LOW",
      "status": "open|rejected|expired  (downstream tooling owns claimed/verifying/verified)",
      "owner_scope": "<area if inferable>"
    }
  ],
  "rejected": [{ "title": "<candidate>", "reason": "<one line>", "evidence": "<file or area>" }],
  "investigate": [{ "candidate": "<name>", "signal": "<evidence>", "proof_needed": "<next check>" }]
}
```

This file is the canonical, self-contained definition of the shape. Downstream consumers should validate against it and treat `schema_version` as the compatibility key; bump it only on breaking changes.
