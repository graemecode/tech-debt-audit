# Technical Debt Report: example-api

## Scope

- **Audited at**: 2026-11-22 on commit `abc1234`
- **Effort level**: quick (scoped)
- **Scope inspected**: src/routes, src/auth, scripts
- **Not audited**: frontend app, deployment configuration
- **Verification commands discovered**: `npm test -- auth` -> observed: 14 passed; `npx tsc --noEmit` -> observed: 0 errors
- **Prior audit**: none found

## Executive Summary

- Highest leverage: consolidate account authorization checks duplicated across 3 high-churn route handlers with diverging edge cases.
- Smallest safe first step: add characterization tests for the 3 routes, then extract a single requireAccountAccess helper without changing HTTP semantics.
- Low-risk tooling win next: expose the checked-in client generator as a package script so reviewers can verify generated diffs mechanically.

## Recommended Paydown Sequence

| Order | Finding | Why first | Interest | Effort | Risk | Verification gate |
|-------|---------|-----------|----------|--------|------|-------------------|
| 1 | DEBT-01: Centralize repeated account authorization | Highest interest rate on a security-critical boundary with a clean bounded first slice. | HIGH | M | MED | `npm test -- auth` (observed) |
| 2 | DEBT-02: Document and wire generated client regeneration | Small, low-risk tooling fix that eliminates recurring PR review friction. | MED | S | LOW | `npm run generate:client && git diff --exit-code` (proposed) |

## Debt Ledger

| ID | Finding | Category | Owner/Scope | Interest | Effort | Risk | Confidence | Evidence |
|----|---------|----------|-------------|----------|--------|------|------------|----------|
| DEBT-01 | Centralize repeated account authorization | Boundaries and Ownership | API routes & auth boundary | HIGH | M | MED | HIGH | `src/routes/accounts.ts:42` |
| DEBT-02 | Document and wire generated client regeneration | Tooling, CI, and Developer Workflow Debt | API tooling | MED | S | LOW | HIGH | `scripts/generate-client.ts:1` |

## Findings

### DEBT-01: Centralize repeated account authorization

- **Category**: Boundaries and Ownership
- **Owner/scope**: API routes & auth boundary (blast radius: `package`)
- **Evidence**:
  - `src/routes/accounts.ts:42` (`getAccountHandler`) - Route-local account ownership check.
  - `src/routes/billing.ts:31` (`updateBillingHandler`) - Similar ownership check returning 404 instead of 403 on mismatch.
  - `src/routes/invites.ts:58` (`createInviteHandler`) - Third copy with an extra role branch omitted from accounts.ts.
- **Current cost**: Security-sensitive authorization rules must be patched across 3 route files, and error/admin edge cases have already diverged.
- **Interest rate**: HIGH - Touched in 11 commits (4 fix commits) over 6 months; accounts.ts and billing.ts co-changed in 5 commits.
- **Payoff**: One trusted auth boundary prevents repeated permission bugs and makes new routes safe by default.
- **Falsification check**: Checked auth middleware, route callers, and git log -n 5 across all 3 files; no ADR documents intentional status-code divergence.
- **Suggested slice**: Add characterization tests locking current responses for all 3 routes, then extract requireAccountAccess without altering status codes.
- **Verification gate** (observed): `npm test -- auth` -> all existing and new route characterization tests pass (observed: 14 passed in 1.1s before changes)
- **Effort**: M
- **Fix risk**: MED - Live route HTTP error status semantics must stay backward-compatible for clients.
- **Confidence**: HIGH - Verified all 3 route handlers directly and ran the existing auth suite.

### DEBT-02: Document and wire generated client regeneration

- **Category**: Tooling, CI, and Developer Workflow Debt
- **Owner/scope**: API tooling (blast radius: `local`)
- **Evidence**:
  - `scripts/generate-client.ts:1` (`(module)`) - Generator exists in scripts/.
  - `src/generated/client.ts:1` (`(module)`) - Generated output is checked into git.
  - `package.json:12` (`scripts`) - No script exposes the generator or verifies cleanliness in CI.
- **Current cost**: Reviewers cannot reproduce generated client diffs or verify that checked-in client code matches the schema.
- **Interest rate**: MED - src/generated/client.ts changed in 6 API PRs over the last quarter with manual regeneration notes.
- **Payoff**: Regeneration becomes a one-command check that CI can enforce automatically.
- **Falsification check**: Checked package.json, Makefile, and .github/workflows; no hidden CI step invokes scripts/generate-client.ts.
- **Suggested slice**: Add a generate:client script in package.json, document it in README, and verify git diff --exit-code.
- **Verification gate** (proposed): `npm run generate:client && git diff --exit-code` -> exits 0 with no unstaged diff against checked-in client
- **Effort**: S
- **Fix risk**: LOW - Package script wiring and docs only; no runtime behavior change.
- **Confidence**: HIGH - Generator, checked-in output, and package.json were all verified directly.

## Investigate Later

| Candidate | Signal | What would prove it |
|-----------|--------|---------------------|
| Test fixture drift | Similar fixture factories exist in two route test directories. | Compare recent test failure history and fixture edit co-changes. |

## Considered and Rejected

- `src/generated/client.ts size`: Large file, but generated output rather than hand-maintained debt. (`src/generated/client.ts:1`)

## Notes for Implementers

- Start with characterization tests for current authorization behavior before extracting helpers.
- Keep generated-file script wiring in a separate commit from route behavior changes.
