# Technical Debt Report: example-api

## Scope

- **Audited at**: 2026-06-12 on commit `abc1234`
- **Effort level**: quick
- **Scope inspected**: `src/routes`, `src/auth`, `scripts`
- **Not audited**: frontend app, deployment configuration
- **Verification commands discovered**: `npm test` -> not run during this sample

## Executive Summary

- Highest leverage: consolidate authorization checks that are duplicated across route handlers.
- Smallest safe first step: extract a single `requireAccountAccess` helper and characterize current route behavior before changing callers.
- Tooling debt is low-risk and worth fixing next because generated client files have no documented regeneration path.

## Recommended Paydown Sequence

| Order | Finding | Why first | Effort | Risk | Verification gate |
|-------|---------|-----------|--------|------|-------------------|
| 1 | DEBT-01 | Reduces repeated auth mistakes on critical routes | M | MED | `npm test -- auth` |
| 2 | DEBT-02 | Makes generated code reviewable and reproducible | S | LOW | `npm run generate && git diff --exit-code` |

## Debt Ledger

| ID | Finding | Category | Current cost | Payoff | Effort | Risk | Confidence | Evidence |
|----|---------|----------|--------------|--------|--------|------|------------|----------|
| DEBT-01 | Centralize repeated account authorization | Boundaries and Ownership | Route handlers copy subtly different checks | One trusted auth boundary | M | MED | HIGH | `src/routes/accounts.ts:42` |
| DEBT-02 | Document generated client regeneration | Tooling, CI, and Developer Workflow Debt | Reviewers cannot tell whether generated code is current | Reproducible updates | S | LOW | HIGH | `scripts/generate-client.ts:1` |

## Findings

### DEBT-01: Centralize repeated account authorization

- **Category**: Boundaries and Ownership
- **Evidence**:
  - `src/routes/accounts.ts:42` - route-local account ownership check.
  - `src/routes/billing.ts:31` - similar check with different error handling.
  - `src/routes/invites.ts:58` - third copy with a separate admin condition.
- **Current cost**: Security-sensitive authorization behavior has to be updated in several files, which makes drift likely.
- **Payoff**: One helper can encode the account access contract and make future route additions safer.
- **Suggested slice**: Add characterization tests around the three route behaviors, then extract one helper without changing response semantics.
- **Verification gate**: `npm test -- auth` should pass before and after extraction.
- **Effort**: M
- **Fix risk**: MED - route behavior must remain compatible.
- **Confidence**: HIGH - repeated checks are visible in active route handlers.
- **Owner/scope**: API routes and auth boundary.

### DEBT-02: Document generated client regeneration

- **Category**: Tooling, CI, and Developer Workflow Debt
- **Evidence**:
  - `scripts/generate-client.ts:1` - generator exists.
  - `src/generated/client.ts:1` - generated output is checked in.
  - `package.json:12` - no script exposes the generator.
- **Current cost**: Generated diffs are hard to review because maintainers cannot reproduce them from a documented command.
- **Payoff**: Regeneration becomes mechanical and CI can catch stale output.
- **Suggested slice**: Add a package script and a short generated-code note, then verify the generated file is unchanged.
- **Verification gate**: `npm run generate && git diff --exit-code`.
- **Effort**: S
- **Fix risk**: LOW - documentation and script wiring only.
- **Confidence**: HIGH - generator and checked-in output both exist.
- **Owner/scope**: API tooling.

## Investigate Later

| Candidate | Signal | What would prove it |
|-----------|--------|---------------------|
| Test fixture drift | Similar fixtures in two packages | Compare setup helpers and recent failure history |

## Considered and Rejected

- `src/generated/client.ts`: large file, but not debt by itself because it is generated output.

## Notes for Implementers

- Start with tests for current authorization behavior before extracting helpers.
- Keep generated-file changes in a separate commit from route behavior changes.
