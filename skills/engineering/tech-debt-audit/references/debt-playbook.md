# Debt Playbook

Use this playbook to find technical debt with empirical evidence. Debt is a **current or compounding cost/risk** caused by a design, implementation, tooling, or process choice. A smell is not debt until you can prove its cost, interest rate, and a bounded paydown slice.

## Category Probes

### 1. Boundaries and Ownership

- Product, domain, UI, persistence, infrastructure, or transport concerns imported across layers with no stable API between them.
- Cross-directory co-change pairs (`recon.mjs -> signals.co_change_pairs`) where edits in one module routinely force lockstep edits in an unrelated module.
- Circular dependencies, broad barrel files hurting bundle/query graphs, or modules requiring callers to know internal state.
- Runtime ownership split across multiple packages/services without a documented source of truth.

### 2. Duplication and Drift

- Same validation, mapping, authorization, query, serialization, or business rule repeated in 3+ places — especially when edge cases or error handling have already diverged.
- Generated or copied code checked in without a documented, reproducible regeneration command.
- Tests duplicated around internal implementation details rather than shared behavioral contracts.

### 3. Module Shape and Abstraction Fit

- God files/classes: far larger than peer files, high fan-in/fan-out, high churn across unrelated features.
- Shallow wrappers whose interface is nearly as complex as direct use.
- Missing abstraction: the same feature change repeatedly edits 4+ files in lockstep.
- Deep conditional trees or long parameter lists hiding an explicit domain object or state machine.

### 4. State, Data Model, and Contract Drift

- Multiple sources of truth for the same state (client cache, URL, DB, derived flags disagreeing).
- Schema validators, API contracts, fixtures, and generated types out of sync.
- Compatibility branches for migrations that appear complete (or have no owner/expiry/telemetry) and were never narrowed.
- Boolean flag combinations that permit impossible states instead of discriminated unions / state machines.

### 5. Type and Safety Escape Hatches

- Clusters of `any`, `as unknown as`, `@ts-ignore`, `@ts-expect-error`, `# type: ignore`, `.unwrap()`, `unsafe {}`, or broad `catch {}` swallowing on critical or high-churn paths.
- Optional/null handling that silently masks required invariants instead of failing fast at boundaries.
- Runtime inputs crossing trust boundaries without schema validation.
- Comments explaining invariants that the type system or runtime validator could enforce directly.

### 6. Testability and Feedback Debt

- High-churn / high-fix-rate mutation, auth, money, or data-integrity paths with no meaningful tests (`recon.mjs -> signals.test_gap_candidates`).
- Tests coupled to private internals, brittle snapshots, excessive mocking, or live network/clock/filesystem dependencies.
- Slow or absent one-command verification path for the repo or package.

### 7. Dead, Legacy, and Compatibility Debt

- Unused exports, dead routes, stale feature flags, deprecated codepaths, commented-out code, or unreferenced manifest dependencies.
- Legacy compatibility paths with no owner, expiry condition, telemetry, or active callers.
- Clustered TODO/FIXME/HACK comments pointing to an abandoned migration or broken boundary (verify code still matches the comment).

### 8. Dependency and Migration Debt

- Runtime/framework/library versions near EOL or blocking security/ecosystem upgrades.
- Duplicate libraries solving the same problem (e.g., two date libs, two HTTP clients, two schema validators).
- Monorepo packages pinned inconsistently or lockfile/manifest drift.
- Schema/data migrations lacking verify, rollback, or cleanup steps.

### 9. Tooling, CI, and Developer Workflow Debt

- Missing, broken, or bypassed typecheck, lint, test, build, or CI gates.
- Uncached CI, serial test bottlenecks, or broken workspace filters slowing every PR.
- Onboarding docs missing required env vars, local services, or reproducible setup steps.
- Absent or stale `AGENTS.md` / `CLAUDE.md` instructions in repos where coding agents work.

### 10. Documentation and Decision Debt

- Active architectural invariants living only in tribal knowledge or scattered comments.
- Docs contradicting actual setup, APIs, deployment, or ownership.
- Public APIs, CLIs, packages, or data contracts lacking a reference surface.
- Accepted ADRs/RFCs where implementation materially diverged without updating the decision record.

## Falsification Checklist (Mandatory Before Inclusion)

Before adding any candidate to `findings`, actively try to **disprove** it:

1. **Re-read exact code:** Verify the exact `path:line` and capture the enclosing `symbol` name.
2. **Check all callers & dynamic entry points:** Before calling code dead or unused, check barrel re-exports, dynamic `import()`, string-based router/DI registries, framework file-based routing, config files, and package exports.
3. **Check git archaeology:** Run `git log -n 5 --oneline -- <file>` (or `git blame -L <start>,<end> <file>`) to check whether the apparent oddity was an intentional hotfix, compatibility shim, or explicit product decision.
4. **Check docs & prior rejections:** Cross-check `docs_and_intent` and `prior_memory.rejected`.
5. **Record the falsification check** concisely in the finding's `falsification` field. If you cannot verify it directly, downgrade the item to `investigate`.

## Rejection Rules

Reject or downgrade a candidate when:

- It is a style/taste preference with no measurable cost.
- The repo clearly standardized on the pattern and it is not causing defects or friction.
- The code is generated, vendored, fixture data, or intentionally duplicated for test/package isolation.
- Dormant code nobody touches (`LOW` interest rate) unless it carries an active security, compliance, or data-loss risk.
- There is no coherent paydown slice smaller than a rewrite.
- Evidence is suggestive but incomplete -> move to `investigate`, never `findings`.

## Calibrated Rubrics

### Interest Rate (How fast this debt compounds)

- **HIGH**: Active hotspot (frequent recent commits, repeated `fix:`/`revert` commits, or cross-directory co-change coupling), active incident/security surface, or blocking imminent roadmap work.
- **MED**: Moderate touch frequency, recurring onboarding/review friction, or slows CI/test feedback for every developer.
- **LOW**: Rarely touched module; include only if risk/security/compliance impact justifies action, otherwise reject or move to `investigate`.

### Effort

- **S**: Hours (single focused PR, <= ~150 LOC net change, straightforward verification).
- **M**: ~1-2 days (multi-file refactor or characterization tests + extraction).
- **L**: Multi-day (cross-package contract change, migration with widen/narrow steps; must still propose a bounded first slice).

### Fix Risk & Blast Radius

- **Fix Risk**: `LOW` (pure local cleanup/tooling, strong tests, easily reversible) | `MED` (live behavior/routes/state touched, requires characterization tests) | `HIGH` (auth, money, persistence schema, or hard-to-reverse contract).
- **Blast Radius**: `local` (single file/module) | `package` (multiple files in one package) | `cross-package` (multiple packages/services) | `external` (public API, DB schema, wire protocol, or CLI contract).

### Prioritization Formula

Order findings from highest to lowest leverage:

1. High-interest debt blocking safe change on critical paths.
2. Debt causing recurrent bugs, reverts, or duplicated fixes across boundaries.
3. Debt weakening or slowing verification/CI feedback loops.
4. High-churn modules with low/no test coverage.
5. Small, low-risk slices that unlock larger paydowns (prerequisites first).

Discount for low confidence, high fix risk, wide blast radius, or lack of an observed verification gate. For `branch` audits, order `introduced` -> `amplified` -> `pre-existing`.

## Read-Only Static Analyzers (Run Only When Already Installed)

Prefer running cheap, read-only checks discovered by `recon.mjs` (never install packages):

- **JS/TS**: `tsc --noEmit`, `knip` (unused files/exports/deps), `madge --circular`, `eslint` / `biome check`, targeted `vitest run <file>` / `jest <file>`.
- **Python**: `ruff check .`, `mypy` / `pyright`, `vulture` (dead code), `pytest --collect-only` or targeted `pytest <file>`.
- **Go**: `go vet ./...`, `golangci-lint run`, targeted `go test ./pkg/...`.
- **Rust**: `cargo check --all-targets`, `cargo clippy --all-targets`.

Tag any finding's verification gate `"status": "observed"` only if you actually executed the command read-only during this audit; otherwise tag `"status": "proposed"`.
