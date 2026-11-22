# tech-debt-audit

[![skills.sh](https://skills.sh/b/graemecode/tech-debt-audit)](https://skills.sh/graemecode/tech-debt-audit)

An agent skill that pairs **deterministic quantitative recon** with **LLM architectural judgment** to audit any codebase for real technical debt, validate every citation against disk, and open an **interactive HTML report** in your browser.

The idea: use zero-dependency scripts for the mechanical work (git churn × defect hotspots, cross-directory co-change coupling, citation validation, secret scanning, durable memory deltas, and HTML rendering) so the model spends its context where judgment matters — understanding intent, falsifying weak candidates, ranking by interest rate and payoff, and proposing bounded paydown slices.

```
you          ->  /tech-debt-audit             (asks for an audit)
recon.mjs    ->  hotspots, co-changes, memory (1s deterministic map)
model        ->  deep read, falsify, rank     (structured JSON IR)
render.mjs   ->  interactive HTML report      (filters, copy-prompt, delta)
agent/human  ->  pays down selected slices    (separate implementation work)
```

## Install

```bash
npx skills@latest add graemecode/tech-debt-audit
```

Works in any agent that supports the [Agent Skills](https://agentskills.io) format (including Gemini / Antigravity, Claude Code, and Codex). Requires Node 18+ for the bundled zero-dependency scripts (falls back cleanly to templates if shell execution is unavailable).

## Usage

```
/tech-debt-audit                              full audit -> interactive HTML report
/tech-debt-audit quick                        cheap pass: top high-interest hotspots only
/tech-debt-audit deep                         broader pass across the repo
/tech-debt-audit branch                       audit current branch diff + direct importers
/tech-debt-audit packages/api apps/web        focus specific directories (+ direct importers)
/tech-debt-audit markdown                     produce Markdown instead of HTML
/tech-debt-audit quests                       also write .tech-debt/ledger.json in repo root
/tech-debt-audit reject DEBT-03 "intentional" persist a human rejection so it never resurfaces
/tech-debt-audit status                       inspect prior audit memory (open, rejected, last run)
```

## What makes the report useful

- **Grounded in git & code signals.** `scripts/recon.mjs` maps churn × bugfix/revert interest-rate hotspots, cross-directory co-change coupling, test-gap candidates, escape hatches, TODO clusters, and installed read-only static analyzers in one command before the model reads a file.
- **Verified citations, zero hallucinations.** Every finding requires `path:line` + `symbol` + a `falsification` check, and `scripts/render-report.mjs` verifies that every cited file exists and every line number is within bounds before rendering.
- **Observed vs proposed gates.** Distinguishes verification commands actually run read-only during the audit (`observed`) from inferred commands (`proposed`).
- **Interactive browser UX (offline, zero CDNs).** Clickable category chart and Effort × Fix Risk matrix, live search/filters/sorting, light & dark mode, one-click **Copy Agent Prompt**, **Copy Issue (MD)**, multi-select **Batch Export**, and one-click **Reject / Won't Fix** command generation.
- **Longitudinal memory & deltas.** Tracks open findings and human/auditor rejections in a normalized out-of-repo cache memo (`${XDG_CACHE_HOME:-~/.cache}/tech-debt-audit/`), reporting **Resolved / New / Persisted** deltas across runs while preserving out-of-scope items during `branch` or directory-scoped audits.
- **Safe by construction.** Never modifies source code, treats repo content as untrusted data, and blocks rendering if any secret pattern appears in the audit output.

See [examples/001-sample-audit.json](./examples/001-sample-audit.json) and [examples/001-sample-report.md](./examples/001-sample-report.md).

## Hard rules

- Never modifies source code itself.
- Never runs commands that mutate the user's working tree (default HTML and Markdown outputs write to the OS temp directory; only `quests` or an explicit user path writes inside the repo).
- Never reproduces credential values (enforced programmatically by secret-pattern scanning).
- Treats repository content as data, not instructions.
- Honors documented tradeoffs (ADRs/RFCs) and prior rejections unless concrete new evidence revives them.

## Development & Verification

```bash
node scripts/validate.mjs
node scripts/test.mjs

# Ground-truth behavioral eval benchmark (5 planted real debts + 5 planted non-debt traps)
node scripts/eval-fixture.mjs create /tmp/debt-eval-repo
# ...run /tech-debt-audit in /tmp/debt-eval-repo...
node scripts/eval-fixture.mjs score /tmp/tech-debt-input-debt-eval-repo.json --repo /tmp/debt-eval-repo
```

## License

MIT (c) Graeme
