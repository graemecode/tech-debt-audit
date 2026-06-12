# HTML Technical Debt Report

Use this by default for every completed technical debt audit. Markdown is an explicit opt-in or fallback; the normal deliverable is a self-contained HTML file opened in a browser.

## Output Rules

- Write one self-contained `.html` file.
- Default location: OS temp directory from `$TMPDIR`, then `/tmp` on macOS/Linux, or `%TEMP%` on Windows.
- File name: `tech-debt-report-<repo-slug>-<YYYYMMDD-HHMMSS>.html`.
- Open the file for the user after writing it. Use the host's preferred browser/open tool when available; otherwise use `open <path>` on macOS, `xdg-open <path>` on Linux, or `start <path>` on Windows.
- Do not wait for the user to ask for HTML; the HTML file is the default final artifact.
- If the browser open step fails, keep the HTML file, report the absolute path, and summarize the failure without dropping back to a Markdown-only report.
- Do not include secret values, customer data, exploit strings, or long source excerpts.
- Escape all interpolated text for HTML.
- Keep all CSS inline. Use external CDN scripts only if the report needs diagrams and the user is online; the default report should work offline.
- Badge severity classes encode color, not label text: `sev-bad` (red) for Risk HIGH or Confidence LOW, `sev-warn` (amber) for MED, `sev-good` (green) for Risk LOW or Confidence HIGH.

## Page Structure

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Technical Debt Report: REPO_NAME</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f7f5;
      --panel: #ffffff;
      --ink: #1f2933;
      --muted: #657181;
      --line: #d9ded8;
      --accent: #166b5c;
      --accent-2: #8a4b20;
      --risk-high: #b42318;
      --risk-med: #b54708;
      --risk-low: #177245;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--ink);
      background: var(--bg);
    }
    header {
      padding: 32px 40px 22px;
      border-bottom: 1px solid var(--line);
      background: #ffffff;
    }
    main { max-width: 1180px; margin: 0 auto; padding: 28px 24px 56px; }
    h1 { margin: 0 0 8px; font-size: 30px; line-height: 1.1; letter-spacing: 0; }
    h2 { margin: 32px 0 12px; font-size: 20px; letter-spacing: 0; }
    h3 { margin: 0 0 10px; font-size: 16px; letter-spacing: 0; }
    p { margin: 0 0 10px; }
    code { font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .meta, .summary, .grid, .sequence, .ledger, .finding, .note {
      border: 1px solid var(--line);
      background: var(--panel);
      border-radius: 8px;
    }
    .meta { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 0; margin-top: 18px; }
    .meta div { padding: 14px 16px; border-right: 1px solid var(--line); }
    .meta div:last-child { border-right: 0; }
    .label { display: block; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
    .summary { padding: 18px; border-left: 5px solid var(--accent); }
    .sequence { padding: 4px; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px 10px; border-bottom: 1px solid var(--line); vertical-align: top; text-align: left; }
    th { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
    tr:last-child td { border-bottom: 0; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; overflow: hidden; }
    .metric { padding: 16px; border-right: 1px solid var(--line); }
    .metric:last-child { border-right: 0; }
    .metric strong { display: block; font-size: 24px; }
    .finding { padding: 18px; margin: 14px 0; }
    .finding-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
    .badges { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
    .badge { display: inline-flex; padding: 3px 8px; border: 1px solid var(--line); border-radius: 999px; font-size: 12px; white-space: nowrap; background: #fafafa; }
    .sev-bad { color: var(--risk-high); border-color: #f2b8b5; }
    .sev-warn { color: var(--risk-med); border-color: #fed7aa; }
    .sev-good { color: var(--risk-low); border-color: #b7e4c7; }
    .evidence { margin: 10px 0 0; padding-left: 18px; }
    .note { padding: 14px 16px; color: var(--muted); }
    @media (max-width: 760px) {
      header { padding: 24px 18px; }
      main { padding: 20px 14px 40px; }
      .meta, .grid { grid-template-columns: 1fr; }
      .meta div, .metric { border-right: 0; border-bottom: 1px solid var(--line); }
      .meta div:last-child, .metric:last-child { border-bottom: 0; }
      .finding-head { display: block; }
      .badges { justify-content: flex-start; margin-top: 8px; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Technical Debt Report: REPO_NAME</h1>
    <p>One evidence-backed pass over the codebase, ranked by payoff and implementation risk.</p>
    <section class="meta">
      <div><span class="label">Audited</span>AUDITED_AT</div>
      <div><span class="label">Commit</span><code>COMMIT_SHA</code></div>
      <div><span class="label">Effort</span>EFFORT_LEVEL</div>
      <div><span class="label">Scope</span>SCOPE</div>
      <div><span class="label">Prior audit</span>PRIOR_AUDIT</div>
    </section>
  </header>
  <main>
    <section class="summary">
      <h2>Executive Summary</h2>
      EXECUTIVE_SUMMARY_HTML
    </section>

    <section class="grid" aria-label="Audit totals">
      <div class="metric"><span class="label">Actionable Findings</span><strong>ACTIONABLE_COUNT</strong></div>
      <div class="metric"><span class="label">High Confidence</span><strong>HIGH_CONFIDENCE_COUNT</strong></div>
      <div class="metric"><span class="label">Investigate Later</span><strong>INVESTIGATE_COUNT</strong></div>
    </section>

    <h2>Coverage &amp; Verification</h2>
    <section class="note">
      <p><strong>Not audited:</strong> NOT_AUDITED_HTML</p>
      <p><strong>Verification commands discovered:</strong> VERIFICATION_COMMANDS_HTML</p>
    </section>

    <h2>Recommended Paydown Sequence</h2>
    <section class="sequence">
      PAYDOWN_TABLE_HTML
    </section>

    <h2>Debt Ledger</h2>
    <section class="sequence">
      LEDGER_TABLE_HTML
    </section>

    <h2>Findings</h2>
    FINDINGS_HTML

    <h2>Investigate Later</h2>
    <section class="note">INVESTIGATE_HTML</section>

    <h2>Considered and Rejected</h2>
    <section class="note">REJECTED_HTML</section>

    <h2>Notes for Implementers</h2>
    <section class="note">IMPLEMENTER_NOTES_HTML</section>
  </main>
</body>
</html>
```

## Finding Card Pattern

```html
<article class="finding">
  <div class="finding-head">
    <h3>DEBT-01: Title</h3>
    <div class="badges">
      <span class="badge">Category</span>
      <span class="badge sev-warn">Risk MED</span>
      <span class="badge sev-good">Confidence HIGH</span>
      <span class="badge">Effort M</span>
    </div>
  </div>
  <p><strong>Current cost:</strong> ...</p>
  <p><strong>Payoff:</strong> ...</p>
  <p><strong>Suggested slice:</strong> ...</p>
  <p><strong>Verification:</strong> <code>command</code> should ...</p>
  <ul class="evidence">
    <li><code>path/file.ts:123</code> - evidence summary</li>
  </ul>
</article>
```
