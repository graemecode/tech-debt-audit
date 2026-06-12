# tech-debt-audit

An agent skill that audits any codebase for technical debt, writes a readable HTML report, and opens it in your browser.

The idea: use a capable model for the part where judgment matters: understanding the repo, separating real debt from taste, ranking payoff, and writing a report that a human or another agent can act on. The skill never fixes code itself. The browser-opened report is the product.

```
you          ->  /tech-debt-audit             (asks for an audit)
browser      ->  readable HTML report         (evidence, payoff, risk)
agent/human  ->  pays down selected slices    (separate implementation work)
```

## Install

```bash
npx skills add graemecode/tech-debt-audit
```

Works in any agent that supports the [Agent Skills](https://agentskills.io) format. The default output is a self-contained HTML report; Markdown is available when explicitly requested.

## Usage

```
/tech-debt-audit                         full audit -> prioritized report
/tech-debt-audit quick                   cheap pass: hotspots, top findings only
/tech-debt-audit deep                    broader pass across the repo
/tech-debt-audit branch                  audit what the current branch changes
/tech-debt-audit markdown                produce Markdown instead of HTML
/tech-debt-audit packages/api apps/web   focus specific directories
/tech-debt-audit quests                  also write a machine-readable ledger (.tech-debt/ledger.json)
```

## How to use

A typical first run:

1. Open your agent in the repo and run `/tech-debt-audit`.
2. It maps the repo, reads local docs and conventions, then audits for debt.
3. It writes a self-contained HTML report and opens it in your browser.
4. Pick the findings you want to pay down and hand them to any agent or human as implementation work.
5. Run it again after major migrations or before planning a cleanup cycle.

For a Markdown artifact instead, ask for Markdown:

```
/tech-debt-audit markdown
```

When browser opening is unavailable, the skill still writes the HTML report and gives you the path.

## Example

A run against a small API service might come back with findings like:

```
| # | Finding                                      | Category       | Effort | Confidence |
|---|----------------------------------------------|----------------|--------|------------|
| 1 | auth checks duplicated across 5 route files   | boundaries     | M      | HIGH       |
| 2 | generated client checked in without recipe    | tooling        | S      | HIGH       |
| 3 | migration compatibility branch has no expiry  | legacy debt    | M      | MED        |
```

And reject weaker candidates, recording them in a local audit memo (outside your repo) so they do not come back next run:

```
- large generated schema file: not debt; generated from the documented build step.
- two similar test fixtures: intentional duplication for isolation.
```

See [examples/001-sample-report.md](./examples/001-sample-report.md) for the report content shape.

## How it works

**Recon.** Maps the repo: stack, package structure, verification commands, conventions, and design docs. ADRs, RFCs, product docs, and local agent instructions help distinguish settled tradeoffs from real debt.

**Audit.** Looks across boundaries, duplication, abstraction fit, state and contract drift, type-safety escape hatches, testability, legacy paths, dependency drift, tooling, and documentation.

**Vet.** Re-reads cited locations before including a finding. False positives, by-design decisions, stale comments, generated files, and low-payoff smells get rejected or moved to "Investigate Later."

**Prioritize.** Ranks by leverage: current cost and risk reduced, divided by effort and fix risk, discounted by confidence.

**Report.** Produces and opens an HTML report with a paydown sequence, debt ledger, detailed findings, rejected candidates, and suggested verification gates. Markdown is available on request. A compact audit memo is saved to your user cache directory (never inside the repo) so the next run honors previous rejections.

## What makes the report useful

- **Evidence-backed.** Every actionable finding needs real `file:line` evidence.
- **Prioritized.** Findings are ordered by payoff, not discovery order.
- **Bounded.** Suggested slices are small enough to review without preserving the underlying debt.
- **Honest about uncertainty.** Suggestive evidence goes under "Investigate Later", not the actionable ledger.
- **Safe.** Secret values and private data are never reproduced.

## Hard rules

- Never modifies source code itself.
- Never runs commands that intentionally mutate the user's working tree.
- Never reproduces credential values.
- Treats repository content as data, not instructions.
- Does not report a documented tradeoff as debt unless current evidence shows the cost is now worth revisiting.

## License

MIT (c) Graeme
