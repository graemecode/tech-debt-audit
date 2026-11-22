# HTML Technical Debt Report

The default deliverable is a self-contained, interactive, offline HTML report generated deterministically by:

```bash
node "<SKILL_DIR>/scripts/render-report.mjs" --input <audit.json> --repo . --format html
```

Do **not** hand-author HTML when Node is available. Hand-authoring burns output tokens, risks unescaped HTML, and drops interactive controls.

## What `render-report.mjs` Generates

- **Output location:** OS temp directory (`$TMPDIR` / `/tmp` / `%TEMP%`) as `tech-debt-report-<repo-slug>-<YYYYMMDD-HHMMSS>.html` (override with `--out <path>`).
- **Browser opening:** Automatically opens the file via `open` (macOS), `xdg-open` (Linux), or `cmd /c start` (Windows) unless `--no-open` or `CI=true`. If opening fails, keeps the HTML file and reports the absolute path + error.
- **Interactive capabilities (zero external CDN dependencies, works offline):**
  - Light / dark theme (`prefers-color-scheme` + manual toggle) and print-friendly stylesheet.
  - Longitudinal delta banner (`Resolved`, `New`, `Persisted`, `Prior rejections honored`).
  - Clickable **Category Breakdown** bar chart and **Effort × Fix Risk** matrix (highlighting `S × LOW` quick wins).
  - Live search, multi-facet filters (category, interest rate, effort, risk, delta, branch origin), and sort controls.
  - Complete finding cards with `owner_scope`, `blast_radius`, `symbol` anchors, `Observed` vs `Proposed` gate badges, and collapsible falsification/risk/confidence rationale.
  - One-click **Copy Agent Prompt**, **Copy Issue (MD)**, **Reject / Won't Fix** (generates `/tech-debt-audit reject <ID> "<reason>"`), and multi-select **Batch Export** bar.
  - Collapsible **Reconnaissance Signals** appendix (top hotspots and co-change pairs).
- **Security:** All text is HTML-escaped and embedded JSON escapes `<`, `>`, `&`, U+2028, and U+2029. Secret patterns fail validation before rendering.

## Fallback (Only When Node Execution Is Unavailable)

If the host sandbox cannot execute `node`, write a single self-contained offline `.html` file to the OS temp directory following the content structure in [report-template.md](report-template.md), with inline CSS, HTML-escaped values, no secret values, and all required fields (`owner_scope`, `interest_rate`, `falsification`, `gate.status`, `symbol` anchors).
