# Debt Playbook

Use this playbook to find technical debt with evidence. Debt is a current cost or risk caused by a design, implementation, tooling, or process choice. A smell is not debt until you can show the cost, risk, or repeated maintenance friction.

## Category Probes

### 1. Boundaries and Ownership

- Product, domain, UI, persistence, infrastructure, or transport concerns imported across layers with no stable API between them.
- Circular dependencies, broad barrel files, or modules that require callers to know implementation details.
- Runtime ownership split across multiple packages/services without a documented source of truth.
- A concept named differently across layers, forcing maintainers to translate mentally.

### 2. Duplication and Drift

- Same validation, mapping, authorization, styling, query, serialization, or business rule repeated in 3+ places.
- Similar files that have diverged in edge cases or error handling.
- Generated or copied code checked in without regeneration instructions.
- Tests duplicated around implementation details rather than shared behavior.

### 3. Module Shape and Abstraction Fit

- God files/classes: much larger than peer files, high fan-in/fan-out, many unrelated reasons to change.
- Shallow wrappers: abstractions whose interface is nearly as complex as direct use.
- Missing abstraction: the same change regularly requires edits in several files in lockstep.
- Deep conditional logic or long parameter lists representing hidden domain objects or state machines.

### 4. State, Data Model, and Contract Drift

- Multiple sources of truth for the same state.
- Schema validators, API contracts, fixtures, and client types disagree.
- Compatibility branches for migrations that appear complete but were never narrowed.
- Status flags or booleans that allow impossible state combinations.

### 5. Type and Safety Escape Hatches

- Clusters of `any`, unchecked casts, force unwraps, `@ts-ignore`, broad exception swallowing, or stringly typed keys on critical paths.
- Optional/null handling that hides required data instead of enforcing invariants.
- Runtime inputs crossing trust boundaries without schema validation.
- Comments explaining invariants that types or validators could enforce.

### 6. Testability and Feedback Debt

- Critical mutation/auth/money/data paths with no meaningful tests.
- High-churn modules without characterization tests.
- Tests coupled to internals, brittle snapshots, excessive mocking, real network/time/filesystem dependencies, or order dependence.
- No fast one-command verification path for the repo or package.

### 7. Dead, Legacy, and Compatibility Debt

- Unused exports, dead routes, stale feature flags, deprecated codepaths, commented-out code, or manifest dependencies no longer imported.
- Legacy path kept for compatibility without owner, expiry condition, telemetry, or migration evidence.
- TODO/FIXME/HACK comments that cluster around one abandoned migration or known broken boundary.

### 8. Dependency and Migration Debt

- Major runtime/framework/library versions near EOL or blocking ecosystem updates.
- Duplicate dependencies solving the same problem.
- Deprecated APIs with announced removal timelines.
- Monorepo packages pinned inconsistently or lockfile/manifest drift.
- Migration code missing verify, rollback, or cleanup steps.

### 9. Tooling, CI, and Developer Workflow Debt

- Missing or broken typecheck, lint, formatter, test, build, or CI gates.
- Slow feedback loops from uncached CI, serial test jobs, or unclear package filters.
- Onboarding docs missing required env vars, setup steps, or local service assumptions.
- Agent instructions absent or stale in repos where agents are expected to work.

### 10. Documentation and Decision Debt

- Active architectural decisions that exist only in code comments or tribal knowledge.
- Docs that contradict the code on setup, APIs, deployment, or ownership.
- Public APIs, CLIs, packages, or data contracts with no reference surface.
- ADRs/RFCs that were accepted but implementation materially diverged without an update.

## Finding Format

Every candidate finding should fit this shape before it reaches the report:

```markdown
### [DEBT-NN] Imperative title

- **Category**: one of the playbook categories
- **Evidence**: `path/file.ext:line` - what is there now; repeat for 2-5 strongest locations
- **Current cost**: what maintainers pay today: bugs, slow changes, risky releases, unclear ownership, slow feedback, duplicated work
- **Payoff**: what improves if paid down now
- **Suggested slice**: smallest coherent paydown step; not a full implementation plan
- **Effort**: S (hours) / M (day-ish) / L (multi-day)
- **Fix risk**: LOW / MED / HIGH, with why
- **Confidence**: HIGH / MED / LOW, based on direct evidence quality
- **Owner/scope**: package, subsystem, or team-sized area if inferable
- **Origin** (branch audits only): introduced / amplified / pre-existing relative to the merge base
```

## Evidence Rules

- Cite real `file:line` evidence. Do not report generic smells.
- Prefer 2-5 strong examples over exhaustive lists; add "and N similar sites" only after measuring or sampling.
- Use git churn to raise priority, not as standalone proof.
- Search TODO/FIXME/HACK/legacy/deprecated comments, but verify code still makes the comment true.
- Treat design docs, ADRs, RFCs, and project vocabulary as evidence. They can turn an apparent smell into a documented tradeoff, or expose drift between plan and reality.
- Do not copy secrets, private customer data, or exploit payloads into the report.

## Rejection Rules

Reject or downgrade a candidate when:

- It is only a preference or style disagreement.
- The repo has clearly standardized on the pattern and it is not causing measurable friction.
- The cited code is generated, vendored, test fixture data, or intentionally duplicated for isolation.
- The problem has no plausible paydown slice smaller than a rewrite.
- The evidence is suggestive but not enough; move it to "Investigate" instead.

Record important rejected items in the report with a one-line reason.

## Prioritization Rubric

Rank by leverage:

1. Debt blocking safe change in critical paths.
2. Debt causing duplicated fixes, recurrent bugs, or release risk.
3. Debt that makes verification weak or slow.
4. Debt with high churn and low test coverage.
5. Debt whose first paydown slice is small and easy to verify.

Discount for low confidence, high fix risk, unclear ownership, or lack of a credible verification gate. Prefer prerequisite work such as characterization tests or contract consolidation before broad refactors.

## Useful Read-Only Signals

Adapt commands to the repo and platform:

```bash
rg --files
rg -n "TODO|FIXME|HACK|XXX|deprecated|legacy|temporary|workaround|tech debt|cleanup" .
git log --oneline -30
git log --name-only --pretty=format: --since="6 months ago" | sort | uniq -c | sort -nr | head -40
git grep -n "any\\|@ts-ignore\\|eslint-disable\\|as unknown\\|force unwrap" -- ':!node_modules'
```

Language-specific checks are useful only when read-only and cheap: typecheck without emit, lint in check mode, test list/dry-run, dependency audit, unused dependency tools that do not rewrite manifests, and package graph inspection.
