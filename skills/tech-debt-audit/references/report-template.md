# Technical Debt Report Content Checklist

Use this structure as the content checklist for both HTML and Markdown reports. HTML is the default output; Markdown is for explicit Markdown requests or fallback situations. Keep it concise, but do not remove evidence.

```markdown
# Technical Debt Report: <repo/package/scope>

## Scope

- **Audited at**: <date> on commit `<sha>` (or "working tree, SHA unavailable")
- **Effort level**: quick | standard | deep
- **Scope inspected**: <packages, directories, branch changes, or whole repo>
- **Not audited**: <important exclusions>
- **Verification commands discovered**: `<command>` -> <known status or "not run">

## Executive Summary

<3-6 bullets. State the highest-leverage debt, why it matters, and the recommended paydown order. Do not bury uncertainty.>

## Recommended Paydown Sequence

| Order | Finding | Why first | Effort | Risk | Verification gate |
|-------|---------|-----------|--------|------|-------------------|
| 1 | DEBT-01 | <reason> | S/M/L | LOW/MED/HIGH | `<command>` |

## Debt Ledger

| ID | Finding | Category | Current cost | Payoff | Effort | Risk | Confidence | Evidence |
|----|---------|----------|--------------|--------|--------|------|------------|----------|
| DEBT-01 | <short title> | <category> | <cost> | <payoff> | S/M/L | LOW/MED/HIGH | HIGH/MED/LOW | `file:line` |

## Findings

### DEBT-01: <imperative title>

- **Category**: <category>
- **Evidence**:
  - `path/file.ext:line` - <what is there>
  - `path/other.ext:line` - <what is there>
- **Current cost**: <specific maintenance cost or production risk>
- **Payoff**: <what improves if addressed>
- **Suggested slice**: <smallest coherent paydown step>
- **Verification gate**: `<command>` should <expected result>
- **Effort**: S/M/L
- **Fix risk**: LOW/MED/HIGH - <why>
- **Confidence**: HIGH/MED/LOW - <why>
- **Owner/scope**: <area if inferable>

## Investigate Later

Findings with suggestive but incomplete evidence. Do not mix these with actionable debt.

| Candidate | Signal | What would prove it |
|-----------|--------|---------------------|
| <name> | <evidence> | <next read/check> |

## Considered and Rejected

- `<candidate>`: not debt because <reason>.

## Notes for Implementers

- Suggested branch/order constraints, prerequisite tests, risky boundaries, and commands future implementers should run.
- Mention when a full implementation plan should be written before coding.
```

## Report Quality Checklist

- Every actionable finding has `file:line` evidence.
- Findings are ranked by payoff, not discovery order.
- The report names what was not audited.
- Rejected items explain why they should not come back next run.
- No secret values, customer data, or runnable misuse steps are included.
- Suggested slices are small enough to review, but not so small that they preserve the debt.
