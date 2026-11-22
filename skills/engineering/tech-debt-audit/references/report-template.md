# Technical Debt Report Content Checklist (Markdown Fallback)

By default, generate reports deterministically via `scripts/render-report.mjs` using [audit-schema.md](audit-schema.md) (`--format html`, `--format markdown`, or `--format both`).

Use this template directly **only** as a fallback when Node script execution is unavailable in the host environment. Default Markdown output still goes to the OS temp directory unless the user explicitly requests an in-repo file.

```markdown
# Technical Debt Report: <repo>

## Scope

- **Audited at**: <YYYY-MM-DD> on commit `<sha>`
- **Effort level**: quick | standard | deep (full | branch | scoped)
- **Scope inspected**: <packages, directories, branch changes, or whole repo>
- **Not audited**: <important exclusions>
- **Verification commands discovered**: `<command>` -> <observed status or "not run">
- **Prior audit**: <date and commit from audit memory, with N rejected candidates honored; or "none found">
- **Delta vs prior audit**: <R resolved, N new, P persisted; omit on first run>

## Executive Summary

- <3-6 bullets. Highest-leverage debt, why it matters, recommended order, honest uncertainty.>

## Recommended Paydown Sequence

| Order | Finding | Why first | Interest | Effort | Risk | Verification gate |
|-------|---------|-----------|----------|--------|------|-------------------|
| 1 | DEBT-01: <title> | <reason> | HIGH/MED/LOW | S/M/L | LOW/MED/HIGH | `<command>` (observed/proposed) |

## Debt Ledger

| ID | Finding | Category | Owner/Scope | Interest | Effort | Risk | Confidence | Evidence |
|----|---------|----------|-------------|----------|--------|------|------------|----------|
| DEBT-01 | <short title> | <category> | <owner/scope> | HIGH/MED/LOW | S/M/L | LOW/MED/HIGH | HIGH/MED/LOW | `file:line` |

## Findings

### DEBT-01: <imperative title>

- **Category**: <category>
- **Owner/scope**: <area> (blast radius: `local|package|cross-package|external`)
- **Origin** (branch audits only): introduced | amplified | pre-existing
- **Evidence**:
  - `path/file.ext:line` (`symbol`) - <what is there>
- **Current cost**: <specific maintenance cost or production risk>
- **Interest rate**: HIGH/MED/LOW - <churn/defect/co-change rationale>
- **Payoff**: <what improves if addressed>
- **Falsification check**: <what was checked to disprove it>
- **Suggested slice**: <smallest coherent paydown step>
- **Verification gate** (observed/proposed): `<command>` should <expected result>
- **Effort**: S/M/L
- **Fix risk**: LOW/MED/HIGH - <why>
- **Confidence**: HIGH/MED/LOW - <why>

## Investigate Later

| Candidate | Signal | What would prove it |
|-----------|--------|---------------------|
| <name> | <evidence> | <next read/check> |

## Considered and Rejected

- `<candidate>`: <reason> (`<evidence>`)

## Notes for Implementers

- <order constraints, prerequisite tests, risky boundaries>
```
