import { escapeHtml, getSkillVersion } from "./common.mjs";

function safeJsonForScript(obj) {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function riskClass(val) {
  if (val === "HIGH") return "sev-bad";
  if (val === "MED") return "sev-warn";
  return "sev-good";
}

function confClass(val) {
  if (val === "HIGH") return "sev-good";
  if (val === "MED") return "sev-warn";
  return "sev-bad";
}

function interestClass(val) {
  if (val === "HIGH") return "sev-bad";
  if (val === "MED") return "sev-warn";
  return "sev-neutral";
}

function renderCategoryBars(findings) {
  if (!findings.length) return `<p class="muted">No actionable findings.</p>`;
  const counts = new Map();
  for (const f of findings) {
    counts.set(f.category, (counts.get(f.category) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const max = sorted[0][1] || 1;
  return `<div class="bars">${sorted
    .map(([cat, count]) => {
      const pct = Math.max(8, Math.round((count / max) * 100));
      return `<button type="button" class="bar-row" data-filter-category="${escapeHtml(cat)}" title="Filter by ${escapeHtml(cat)}">
        <span class="bar-label">${escapeHtml(cat)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${pct}%"></span></span>
        <span class="bar-count">${count}</span>
      </button>`;
    })
    .join("")}</div>`;
}

function renderMatrix(findings) {
  const efforts = ["S", "M", "L"];
  const risks = ["LOW", "MED", "HIGH"];
  const grid = {};
  for (const e of efforts) {
    for (const r of risks) grid[`${e}:${r}`] = 0;
  }
  for (const f of findings) {
    const k = `${f.effort}:${f.fix_risk}`;
    if (k in grid) grid[k]++;
  }
  return `<div class="matrix-wrap">
    <div class="matrix">
      <div class="m-corner">Effort \\ Risk</div>
      <div class="m-head">LOW</div>
      <div class="m-head">MED</div>
      <div class="m-head">HIGH</div>
      ${efforts
        .map(
          (e) =>
            `<div class="m-row-head">${e}</div>` +
            risks
              .map((r) => {
                const c = grid[`${e}:${r}`];
                const quickWin = e === "S" && r === "LOW" && c > 0 ? " m-quickwin" : "";
                const active = c > 0 ? " m-has" : "";
                return `<button type="button" class="m-cell${active}${quickWin}" data-filter-effort="${e}" data-filter-risk="${r}" title="${c} finding(s) with Effort ${e}, Risk ${r}">${c || "·"}</button>`;
              })
              .join("")
        )
        .join("")}
    </div>
    <p class="matrix-hint">Click any cell or category bar to filter findings. Highlighted S×LOW = quick wins.</p>
  </div>`;
}

function renderGateBadge(gate) {
  if (!gate) return `<span class="badge sev-neutral">No automated gate</span>`;
  if (gate.status === "observed") {
    return `<span class="badge sev-good" title="Verification command was executed read-only during this audit">Observed gate</span>`;
  }
  return `<span class="badge sev-warn" title="Verification command was inferred but not run during this audit">Proposed gate</span>`;
}

function renderFindingCard(f, isBranch, showDelta) {
  const searchBlob = [
    f.id,
    f.title,
    f.category,
    f.owner_scope,
    f.current_cost,
    f.slice,
    ...(f.evidence || []).map((e) => `${e.path} ${e.symbol} ${e.note}`),
  ]
    .join(" ")
    .toLowerCase();

  const originBadge =
    isBranch && f.origin
      ? `<span class="badge origin-${escapeHtml(f.origin)}">Origin: ${escapeHtml(f.origin)}</span>`
      : "";

  const deltaBadge =
    showDelta && f.delta
      ? f.delta === "new"
        ? `<span class="badge sev-accent">NEW</span>`
        : `<span class="badge sev-neutral" title="First seen ${escapeHtml(f.first_seen || "prior run")}">PERSISTED</span>`
      : "";

  const gateHtml = f.gate
    ? `<p><strong>Verification gate:</strong> <code>${escapeHtml(f.gate.command)}</code> &rarr; ${escapeHtml(f.gate.expected)} ${renderGateBadge(f.gate)}${
        f.gate.observed_result
          ? `<br><span class="muted">Observed: ${escapeHtml(f.gate.observed_result)}</span>`
          : ""
      }</p>`
    : `<p><strong>Verification gate:</strong> <span class="muted">None (manual review required)</span></p>`;

  const evidenceItems = (f.evidence || [])
    .map(
      (e) =>
        `<li><code>${escapeHtml(e.path)}:${e.line}</code> <span class="sym">${escapeHtml(e.symbol)}</span> — ${escapeHtml(e.note)}</li>`
    )
    .join("");

  return `<article class="finding" id="${escapeHtml(f.id)}"
    data-id="${escapeHtml(f.id)}"
    data-category="${escapeHtml(f.category)}"
    data-effort="${escapeHtml(f.effort)}"
    data-risk="${escapeHtml(f.fix_risk)}"
    data-confidence="${escapeHtml(f.confidence)}"
    data-interest="${escapeHtml(f.interest_rate)}"
    data-origin="${escapeHtml(f.origin || "")}"
    data-delta="${escapeHtml(f.delta || "")}"
    data-order="${f._order}"
    data-search="${escapeHtml(searchBlob)}">
    <div class="finding-head">
      <div class="finding-title-wrap">
        <label class="select-box" title="Select for batch handoff">
          <input type="checkbox" class="finding-select" value="${escapeHtml(f.id)}">
          <span class="sr-only">Select ${escapeHtml(f.id)}</span>
        </label>
        <div>
          <h3><span class="finding-id">${escapeHtml(f.id)}</span> ${escapeHtml(f.title)}</h3>
          <div class="finding-sub">Owner/scope: <strong>${escapeHtml(f.owner_scope)}</strong> &middot; Blast radius: <code>${escapeHtml(f.blast_radius)}</code></div>
        </div>
      </div>
      <div class="badges">
        ${deltaBadge}
        ${originBadge}
        <span class="badge">${escapeHtml(f.category)}</span>
        <span class="badge ${interestClass(f.interest_rate)}">Interest ${escapeHtml(f.interest_rate)}</span>
        <span class="badge">Effort ${escapeHtml(f.effort)}</span>
        <span class="badge ${riskClass(f.fix_risk)}">Risk ${escapeHtml(f.fix_risk)}</span>
        <span class="badge ${confClass(f.confidence)}">Conf ${escapeHtml(f.confidence)}</span>
      </div>
    </div>

    <div class="finding-body">
      <p><strong>Current cost:</strong> ${escapeHtml(f.current_cost)}</p>
      <p><strong>Interest rate:</strong> ${escapeHtml(f.interest_rate_reason)}</p>
      <p><strong>Payoff:</strong> ${escapeHtml(f.payoff)}</p>
      <p><strong>Suggested slice:</strong> ${escapeHtml(f.slice)}</p>
      ${gateHtml}
      <div class="evidence-block">
        <strong>Evidence:</strong>
        <ul class="evidence">${evidenceItems}</ul>
      </div>
      <details class="rigor-details">
        <summary>Falsification check, risk &amp; confidence rationale</summary>
        <div class="rigor-body">
          <p><strong>Falsification check:</strong> ${escapeHtml(f.falsification)}</p>
          <p><strong>Fix risk (${escapeHtml(f.fix_risk)}):</strong> ${escapeHtml(f.fix_risk_reason)}</p>
          <p><strong>Confidence (${escapeHtml(f.confidence)}):</strong> ${escapeHtml(f.confidence_reason)}</p>
        </div>
      </details>
    </div>

    <div class="finding-actions">
      <button type="button" class="btn btn-primary" data-action="copy-prompt" data-id="${escapeHtml(f.id)}">Copy Agent Prompt</button>
      <button type="button" class="btn" data-action="copy-issue" data-id="${escapeHtml(f.id)}">Copy Issue (MD)</button>
      <button type="button" class="btn btn-ghost" data-action="reject" data-id="${escapeHtml(f.id)}">Reject / Won't Fix</button>
    </div>
  </article>`;
}

export function renderHtmlReport(auditData, context = {}) {
  const audit = auditData.audit;
  const findings = (context.annotatedFindings || auditData.findings || []).map((f, idx) => ({
    ...f,
    _order: idx + 1,
  }));
  const delta = context.delta || { has_prior_open: false, new_count: findings.length, persisted_count: 0, resolved: [] };
  const isBranch = audit.mode === "branch";
  const skillVersion = getSkillVersion();
  const priorInfo = context.priorSummary || "none found";
  const highInterestCount = findings.filter((f) => f.interest_rate === "HIGH").length;
  const highConfCount = findings.filter((f) => f.confidence === "HIGH").length;
  const observedGateCount = findings.filter((f) => f.gate?.status === "observed").length;

  const uniqueCategories = [...new Set(findings.map((f) => f.category))];
  const modeLabel =
    audit.mode === "branch" ? "Branch Audit" : audit.mode === "scoped" ? "Scoped Audit" : "Full Audit";

  const deltaBannerHtml = delta.has_prior_open
    ? `<section class="delta-banner" aria-label="Changes since prior audit">
        <div class="delta-pills">
          <span class="delta-title">Delta vs prior audit:</span>
          <span class="badge sev-good">Resolved: ${delta.resolved.length}</span>
          <span class="badge sev-accent">New: ${delta.new_count}</span>
          <span class="badge sev-neutral">Persisted: ${delta.persisted_count}</span>
          ${context.priorRejectionsHonored ? `<span class="badge sev-neutral">Prior rejections honored: ${context.priorRejectionsHonored}</span>` : ""}
        </div>
        ${
          delta.resolved.length
            ? `<details class="delta-resolved"><summary>View ${delta.resolved.length} resolved finding(s)</summary><ul>${delta.resolved
                .map((r) => `<li><code>${escapeHtml(r.id)}</code> ${escapeHtml(r.title)} <span class="muted">(${escapeHtml(r.category)})</span></li>`)
                .join("")}</ul></details>`
            : ""
        }
      </section>`
    : "";

  const paydownRows = findings.length
    ? findings
        .map(
          (f) => `<tr>
          <td class="num">${f._order}</td>
          <td><a href="#${escapeHtml(f.id)}"><strong>${escapeHtml(f.id)}</strong></a>: ${escapeHtml(f.title)}${
            isBranch && f.origin ? ` <span class="badge origin-${escapeHtml(f.origin)}">${escapeHtml(f.origin)}</span>` : ""
          }</td>
          <td>${escapeHtml(f.why_this_order)}</td>
          <td><span class="badge ${interestClass(f.interest_rate)}">${escapeHtml(f.interest_rate)}</span></td>
          <td><span class="badge">${escapeHtml(f.effort)}</span></td>
          <td><span class="badge ${riskClass(f.fix_risk)}">${escapeHtml(f.fix_risk)}</span></td>
          <td>${
            f.gate
              ? `<code>${escapeHtml(f.gate.command)}</code> ${renderGateBadge(f.gate)}`
              : `<span class="muted">manual</span>`
          }</td>
        </tr>`
        )
        .join("")
    : `<tr><td colspan="7" class="muted">No actionable technical debt worth paying down in this scope.</td></tr>`;

  const ledgerRows = findings.length
    ? findings
        .map(
          (f) => `<tr>
          <td><a href="#${escapeHtml(f.id)}"><code>${escapeHtml(f.id)}</code></a></td>
          <td>${escapeHtml(f.title)}${isBranch && f.origin ? ` (${escapeHtml(f.origin)})` : ""}</td>
          <td>${escapeHtml(f.category)}</td>
          <td>${escapeHtml(f.owner_scope)}</td>
          <td>${escapeHtml(f.interest_rate)}</td>
          <td>${escapeHtml(f.effort)}</td>
          <td>${escapeHtml(f.fix_risk)}</td>
          <td>${escapeHtml(f.confidence)}</td>
          <td><code>${escapeHtml(f.evidence[0]?.path)}:${f.evidence[0]?.line}</code></td>
        </tr>`
        )
        .join("")
    : `<tr><td colspan="9" class="muted">None.</td></tr>`;

  const investigateHtml = auditData.investigate?.length
    ? `<table>
        <thead><tr><th>Candidate</th><th>Signal</th><th>What would prove it</th></tr></thead>
        <tbody>${auditData.investigate
          .map(
            (i) =>
              `<tr><td><strong>${escapeHtml(i.candidate)}</strong></td><td>${escapeHtml(i.signal)}</td><td>${escapeHtml(i.proof_needed)}</td></tr>`
          )
          .join("")}</tbody>
      </table>`
    : `<p class="muted">None.</p>`;

  const rejectedHtml = auditData.rejected?.length
    ? `<ul class="plain-list">${auditData.rejected
        .map(
          (r) =>
            `<li><strong>${escapeHtml(r.title)}</strong> ${
              r.source === "human" ? `<span class="badge sev-accent">human</span>` : ""
            } — ${escapeHtml(r.reason)} <code class="muted">${escapeHtml(r.evidence)}</code></li>`
        )
        .join("")}</ul>`
    : `<p class="muted">None.</p>`;

  const notesHtml = auditData.implementer_notes?.length
    ? `<ul class="plain-list">${auditData.implementer_notes.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>`
    : `<p class="muted">No additional constraints.</p>`;

  const verCmdHtml = audit.verification_commands?.length
    ? audit.verification_commands
        .map((v) =>
          typeof v === "string"
            ? `<code>${escapeHtml(v)}</code>`
            : `<code>${escapeHtml(v.command)}</code> &rarr; ${escapeHtml(v.status || "discovered")}`
        )
        .join(" &middot; ")
    : "none discovered";

  const reconAppendixHtml = auditData.recon_summary
    ? `<details class="appendix">
        <summary>Reconnaissance Signals (Hotspots &amp; Co-Change Coupling)</summary>
        <div class="appendix-body">
          ${
            auditData.recon_summary.hotspots?.length
              ? `<h4>Top Churn &times; Defect Hotspots</h4><ul>${auditData.recon_summary.hotspots
                  .map(
                    (h) =>
                      `<li><code>${escapeHtml(h.path)}</code> — ${h.commits} commits, ${h.fix_commits} fixes${
                        h.revert_commits ? `, ${h.revert_commits} reverts` : ""
                      }${h.loc ? `, ${h.loc} LOC` : ""}</li>`
                  )
                  .join("")}</ul>`
              : ""
          }
          ${
            auditData.recon_summary.co_change_pairs?.length
              ? `<h4>Cross-Directory Co-Change Coupling</h4><ul>${auditData.recon_summary.co_change_pairs
                  .map(
                    (p) =>
                      `<li><code>${escapeHtml(p.file_a)}</code> &harr; <code>${escapeHtml(p.file_b)}</code> — ${p.co_commits} co-commits (${Math.round(
                        p.coupling_ratio * 100
                      )}% coupling)</li>`
                  )
                  .join("")}</ul>`
              : ""
          }
        </div>
      </details>`
    : "";

  const clientPayload = {
    repo_name: audit.repo_name,
    commit: audit.commit,
    findings: findings.map((f) => ({
      id: f.id,
      title: f.title,
      category: f.category,
      owner_scope: f.owner_scope,
      current_cost: f.current_cost,
      interest_rate: f.interest_rate,
      interest_rate_reason: f.interest_rate_reason,
      payoff: f.payoff,
      slice: f.slice,
      effort: f.effort,
      fix_risk: f.fix_risk,
      fix_risk_reason: f.fix_risk_reason,
      blast_radius: f.blast_radius,
      confidence: f.confidence,
      gate: f.gate,
      evidence: f.evidence,
    })),
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Technical Debt Report: ${escapeHtml(audit.repo_name)}</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f6f6f3;
      --panel: #ffffff;
      --panel-2: #fafaf8;
      --ink: #182026;
      --muted: #5c6975;
      --line: #dce1dc;
      --accent: #0f766e;
      --accent-soft: #e6f4f1;
      --bad: #b42318;
      --bad-bg: #fef3f2;
      --bad-line: #f4c7c3;
      --warn: #b54708;
      --warn-bg: #fffaeb;
      --warn-line: #f9dbaf;
      --good: #067647;
      --good-bg: #ecfdf3;
      --good-line: #abefc6;
      --shadow: 0 1px 2px rgba(16, 24, 40, 0.05);
    }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) {
        --bg: #0f1216;
        --panel: #161b22;
        --panel-2: #1c222b;
        --ink: #e6edf3;
        --muted: #8b949e;
        --line: #2a323d;
        --accent: #2dd4bf;
        --accent-soft: #132a28;
        --bad: #f87171;
        --bad-bg: #2a1416;
        --bad-line: #5c2326;
        --warn: #fbbf24;
        --warn-bg: #2a2111;
        --warn-line: #5b4318;
        --good: #4ade80;
        --good-bg: #11261b;
        --good-line: #1f4d35;
        --shadow: none;
      }
    }
    :root[data-theme="dark"] {
      --bg: #0f1216;
      --panel: #161b22;
      --panel-2: #1c222b;
      --ink: #e6edf3;
      --muted: #8b949e;
      --line: #2a323d;
      --accent: #2dd4bf;
      --accent-soft: #132a28;
      --bad: #f87171;
      --bad-bg: #2a1416;
      --bad-line: #5c2326;
      --warn: #fbbf24;
      --warn-bg: #2a2111;
      --warn-line: #5b4318;
      --good: #4ade80;
      --good-bg: #11261b;
      --good-line: #1f4d35;
      --shadow: none;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
      color: var(--ink);
      background: var(--bg);
      font-variant-numeric: tabular-nums;
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    code {
      font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      background: var(--panel-2);
      border: 1px solid var(--line);
      border-radius: 4px;
      padding: 1px 5px;
    }
    header {
      padding: 28px 36px 22px;
      border-bottom: 1px solid var(--line);
      background: var(--panel);
    }
    .header-top {
      max-width: 1220px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }
    .header-inner { max-width: 1220px; margin: 0 auto; }
    main { max-width: 1220px; margin: 0 auto; padding: 24px 24px 96px; }
    h1 { margin: 0 0 6px; font-size: 28px; line-height: 1.15; letter-spacing: -0.015em; }
    h2 { margin: 30px 0 12px; font-size: 18px; letter-spacing: -0.01em; }
    h3 { margin: 0 0 4px; font-size: 16px; line-height: 1.3; }
    h4 { margin: 14px 0 6px; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
    p { margin: 0 0 8px; }
    .muted { color: var(--muted); }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }

    .card, .meta, .summary, .kpi-grid, .viz-grid, .table-wrap, .finding, .note, .delta-banner, .filter-bar, .appendix {
      border: 1px solid var(--line);
      background: var(--panel);
      border-radius: 10px;
      box-shadow: var(--shadow);
    }
    .meta { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); margin-top: 16px; overflow: hidden; }
    .meta div { padding: 12px 14px; border-right: 1px solid var(--line); }
    .meta div:last-child { border-right: 0; }
    .label { display: block; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 3px; }

    .delta-banner { padding: 14px 16px; margin-bottom: 18px; border-left: 4px solid var(--accent); }
    .delta-pills { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .delta-title { font-weight: 600; font-size: 13px; }
    .delta-resolved { margin-top: 8px; font-size: 13px; }
    .delta-resolved summary { cursor: pointer; color: var(--muted); }

    .summary { padding: 18px 20px; border-left: 4px solid var(--accent); margin-bottom: 18px; }
    .summary h2 { margin-top: 0; }
    .summary ul { margin: 8px 0 0; padding-left: 18px; }
    .summary li { margin-bottom: 5px; }

    .kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); overflow: hidden; margin-bottom: 18px; }
    .metric { padding: 14px 16px; border-right: 1px solid var(--line); }
    .metric:last-child { border-right: 0; }
    .metric strong { display: block; font-size: 26px; line-height: 1.2; }
    .metric small { color: var(--muted); font-size: 12px; }

    .viz-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 0; overflow: hidden; margin-bottom: 18px; }
    .viz-pane { padding: 16px 18px; border-right: 1px solid var(--line); }
    .viz-pane:last-child { border-right: 0; }
    .viz-pane h3 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin-bottom: 10px; }

    .bars { display: flex; flex-direction: column; gap: 6px; }
    .bar-row {
      display: grid; grid-template-columns: minmax(140px, 1.3fr) 1fr 28px; align-items: center; gap: 10px;
      background: transparent; border: 0; padding: 3px 4px; border-radius: 6px; cursor: pointer; text-align: left; color: inherit; font: inherit;
    }
    .bar-row:hover { background: var(--panel-2); }
    .bar-label { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bar-track { height: 8px; background: var(--panel-2); border-radius: 999px; overflow: hidden; border: 1px solid var(--line); }
    .bar-fill { display: block; height: 100%; background: var(--accent); border-radius: 999px; }
    .bar-count { font-size: 12px; font-weight: 600; text-align: right; color: var(--muted); }

    .matrix { display: grid; grid-template-columns: 82px repeat(3, 1fr); gap: 5px; align-items: center; }
    .m-corner, .m-head, .m-row-head { font-size: 11px; text-transform: uppercase; color: var(--muted); font-weight: 600; }
    .m-head { text-align: center; }
    .m-cell {
      height: 32px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel-2);
      color: var(--muted); font: 600 13px/1 inherit; cursor: pointer;
    }
    .m-cell:hover { border-color: var(--accent); }
    .m-has { color: var(--ink); background: var(--accent-soft); border-color: var(--accent); }
    .m-quickwin { background: var(--good-bg); color: var(--good); border-color: var(--good-line); }
    .matrix-hint { font-size: 11px; color: var(--muted); margin: 8px 0 0; }

    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 12px; border-bottom: 1px solid var(--line); vertical-align: top; text-align: left; font-size: 13px; }
    th { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .05em; background: var(--panel-2); }
    tr:last-child td { border-bottom: 0; }
    td.num { font-weight: 700; width: 42px; }

    .filter-bar {
      padding: 12px 14px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 14px;
      position: sticky; top: 8px; z-index: 20;
    }
    .filter-bar input[type="search"], .filter-bar select {
      background: var(--panel-2); color: var(--ink); border: 1px solid var(--line); border-radius: 6px;
      padding: 6px 10px; font: 13px/1.3 inherit;
    }
    .filter-bar input[type="search"] { flex: 1 1 200px; min-width: 160px; }
    .filter-count { font-size: 12px; color: var(--muted); margin-left: auto; }

    .finding { padding: 18px 20px; margin: 14px 0; transition: border-color .15s; }
    .finding:target { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
    .finding.hidden { display: none; }
    .finding-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 12px; }
    .finding-title-wrap { display: flex; align-items: flex-start; gap: 10px; }
    .finding-id { color: var(--accent); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px; margin-right: 4px; }
    .finding-sub { font-size: 12px; color: var(--muted); margin-top: 2px; }
    .select-box { padding-top: 3px; cursor: pointer; }
    .select-box input { width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; }

    .badges { display: flex; flex-wrap: wrap; gap: 5px; justify-content: flex-end; }
    .badge {
      display: inline-flex; align-items: center; padding: 2px 8px; border: 1px solid var(--line);
      border-radius: 999px; font-size: 11px; font-weight: 600; white-space: nowrap; background: var(--panel-2);
    }
    .sev-bad { color: var(--bad); background: var(--bad-bg); border-color: var(--bad-line); }
    .sev-warn { color: var(--warn); background: var(--warn-bg); border-color: var(--warn-line); }
    .sev-good { color: var(--good); background: var(--good-bg); border-color: var(--good-line); }
    .sev-accent { color: var(--accent); background: var(--accent-soft); border-color: var(--accent); }
    .sev-neutral { color: var(--muted); }
    .origin-introduced { color: var(--bad); background: var(--bad-bg); border-color: var(--bad-line); }
    .origin-amplified { color: var(--warn); background: var(--warn-bg); border-color: var(--warn-line); }
    .origin-pre-existing { color: var(--muted); }

    .evidence-block { margin-top: 10px; }
    .evidence { margin: 6px 0 0; padding-left: 18px; }
    .evidence li { margin-bottom: 4px; font-size: 13px; }
    .sym { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: var(--accent); padding: 1px 5px; background: var(--accent-soft); border-radius: 4px; }

    .rigor-details { margin-top: 10px; border-top: 1px dashed var(--line); padding-top: 8px; }
    .rigor-details summary { cursor: pointer; font-size: 12px; color: var(--muted); font-weight: 500; }
    .rigor-body { margin-top: 8px; font-size: 13px; color: var(--muted); }
    .rigor-body strong { color: var(--ink); }

    .finding-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
    .btn {
      display: inline-flex; align-items: center; gap: 6px; padding: 6px 11px; border-radius: 6px;
      border: 1px solid var(--line); background: var(--panel-2); color: var(--ink);
      font: 500 12px/1.2 inherit; cursor: pointer;
    }
    .btn:hover { border-color: var(--accent); }
    .btn-primary { background: var(--accent); color: #ffffff; border-color: var(--accent); }
    :root[data-theme="dark"] .btn-primary { color: #07221f; }
    .btn-ghost { background: transparent; color: var(--muted); }

    .note { padding: 14px 18px; }
    .plain-list { margin: 4px 0; padding-left: 18px; }
    .plain-list li { margin-bottom: 6px; }

    .appendix { padding: 12px 16px; margin-top: 16px; }
    .appendix summary { cursor: pointer; font-weight: 600; font-size: 14px; }
    .appendix-body ul { margin: 4px 0 8px; padding-left: 18px; font-size: 13px; }

    .batch-bar {
      position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%);
      background: var(--ink); color: var(--panel); padding: 10px 16px; border-radius: 999px;
      display: none; align-items: center; gap: 10px; z-index: 50; box-shadow: 0 10px 30px rgba(0,0,0,.25);
    }
    .batch-bar.visible { display: flex; }
    .batch-bar .btn { background: var(--panel); color: var(--ink); border-color: transparent; }
    .batch-bar .btn-primary { background: var(--accent); color: #ffffff; }

    .toast {
      position: fixed; top: 18px; right: 18px; background: var(--ink); color: var(--panel);
      padding: 10px 14px; border-radius: 8px; font-size: 13px; opacity: 0; pointer-events: none;
      transition: opacity .2s; z-index: 60;
    }
    .toast.show { opacity: 1; }

    footer { max-width: 1220px; margin: 24px auto 0; padding: 0 24px 36px; font-size: 12px; color: var(--muted); display: flex; justify-content: space-between; }

    @media (max-width: 820px) {
      header { padding: 20px 16px; }
      main { padding: 16px 14px 90px; }
      .meta, .kpi-grid, .viz-grid { grid-template-columns: 1fr; }
      .meta div, .metric, .viz-pane { border-right: 0; border-bottom: 1px solid var(--line); }
      .meta div:last-child, .metric:last-child, .viz-pane:last-child { border-bottom: 0; }
      .finding-head { flex-direction: column; }
      .badges { justify-content: flex-start; }
      .filter-bar { position: static; }
    }
    @media print {
      .filter-bar, .finding-actions, .batch-bar, .theme-toggle, .select-box, .toast { display: none !important; }
      .finding { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <header>
    <div class="header-top">
      <div>
        <h1>Technical Debt Report: ${escapeHtml(audit.repo_name)}</h1>
        <p class="muted">${escapeHtml(modeLabel)} &middot; Evidence-backed, falsification-vetted, ranked by interest rate and payoff.</p>
      </div>
      <button type="button" class="btn theme-toggle" id="themeToggle">Toggle theme</button>
    </div>
    <div class="header-inner">
      <section class="meta">
        <div><span class="label">Audited</span>${escapeHtml(audit.date)}</div>
        <div><span class="label">Commit</span><code>${escapeHtml(audit.commit)}</code></div>
        <div><span class="label">Effort</span>${escapeHtml(audit.effort)}</div>
        <div><span class="label">Scope</span>${escapeHtml(audit.scope)}</div>
        <div><span class="label">Prior Audit</span>${escapeHtml(priorInfo)}</div>
      </section>
    </div>
  </header>

  <main>
    ${deltaBannerHtml}

    <section class="summary">
      <h2>Executive Summary</h2>
      <ul>${(auditData.executive_summary || []).map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>
    </section>

    <section class="kpi-grid" aria-label="Audit totals">
      <div class="metric"><span class="label">Actionable Findings</span><strong>${findings.length}</strong><small>${observedGateCount}/${findings.length} observed gates</small></div>
      <div class="metric"><span class="label">High Interest Rate</span><strong>${highInterestCount}</strong><small>Active churn / defect drag</small></div>
      <div class="metric"><span class="label">High Confidence</span><strong>${highConfCount}</strong><small>Direct verified evidence</small></div>
      <div class="metric"><span class="label">Investigate Later</span><strong>${auditData.investigate?.length || 0}</strong><small>${auditData.rejected?.length || 0} rejected as non-debt</small></div>
    </section>

    <section class="viz-grid" aria-label="Debt distribution">
      <div class="viz-pane">
        <h3>By Category</h3>
        ${renderCategoryBars(findings)}
      </div>
      <div class="viz-pane">
        <h3>Effort &times; Fix Risk</h3>
        ${renderMatrix(findings)}
      </div>
    </section>

    <h2>Coverage &amp; Verification</h2>
    <section class="note">
      <p><strong>Not audited:</strong> ${escapeHtml(audit.not_audited)}</p>
      <p><strong>Verification commands discovered:</strong> ${verCmdHtml}</p>
    </section>

    <h2>Recommended Paydown Sequence</h2>
    <section class="table-wrap">
      <table>
        <thead>
          <tr><th>#</th><th>Finding</th><th>Why first</th><th>Interest</th><th>Effort</th><th>Risk</th><th>Verification gate</th></tr>
        </thead>
        <tbody>${paydownRows}</tbody>
      </table>
    </section>

    <h2>Findings</h2>
    <section class="filter-bar" aria-label="Filter findings">
      <input type="search" id="fSearch" placeholder="Search findings, files, symbols, owners...">
      <select id="fCategory"><option value="">All categories</option>${uniqueCategories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}</select>
      <select id="fInterest"><option value="">Any interest</option><option value="HIGH">Interest: HIGH</option><option value="MED">Interest: MED</option><option value="LOW">Interest: LOW</option></select>
      <select id="fEffort"><option value="">Any effort</option><option value="S">Effort: S</option><option value="M">Effort: M</option><option value="L">Effort: L</option></select>
      <select id="fRisk"><option value="">Any risk</option><option value="LOW">Risk: LOW</option><option value="MED">Risk: MED</option><option value="HIGH">Risk: HIGH</option></select>
      ${delta.has_prior_open ? `<select id="fDelta"><option value="">All statuses</option><option value="new">New only</option><option value="persisted">Persisted only</option></select>` : ""}
      ${isBranch ? `<select id="fOrigin"><option value="">All origins</option><option value="introduced">Introduced</option><option value="amplified">Amplified</option><option value="pre-existing">Pre-existing</option></select>` : ""}
      <select id="fSort">
        <option value="order">Sort: Paydown order</option>
        <option value="interest">Sort: Highest interest</option>
        <option value="effort">Sort: Smallest effort</option>
        <option value="risk">Sort: Lowest risk</option>
      </select>
      <button type="button" class="btn btn-ghost" id="fReset">Reset</button>
      <span class="filter-count" id="fCount">Showing ${findings.length} of ${findings.length}</span>
    </section>

    <div id="findingsList">
      ${findings.length ? findings.map((f) => renderFindingCard(f, isBranch, delta.has_prior_open)).join("") : `<section class="note"><p class="muted">No actionable technical debt found above the vetting threshold.</p></section>`}
    </div>

    <h2>Debt Ledger</h2>
    <section class="table-wrap">
      <table>
        <thead>
          <tr><th>ID</th><th>Finding</th><th>Category</th><th>Owner / Scope</th><th>Interest</th><th>Effort</th><th>Risk</th><th>Conf</th><th>Primary Evidence</th></tr>
        </thead>
        <tbody>${ledgerRows}</tbody>
      </table>
    </section>

    <h2>Investigate Later</h2>
    <section class="table-wrap">${investigateHtml}</section>

    <h2>Considered and Rejected</h2>
    <section class="note">${rejectedHtml}</section>

    <h2>Notes for Implementers</h2>
    <section class="note">${notesHtml}</section>

    ${reconAppendixHtml}
  </main>

  <div class="batch-bar" id="batchBar">
    <span id="batchCount">0 selected</span>
    <button type="button" class="btn btn-primary" id="batchCopyPrompt">Copy Combined Agent Prompt</button>
    <button type="button" class="btn" id="batchCopyMd">Copy Markdown Checklist</button>
    <button type="button" class="btn" id="batchClear">Clear</button>
  </div>

  <div class="toast" id="toast" role="status" aria-live="polite"></div>

  <footer>
    <span>Generated by tech-debt-audit v${escapeHtml(skillVersion)}</span>
    <span>Self-contained offline report &middot; Repo content treated as data</span>
  </footer>

  <script id="audit-data" type="application/json">${safeJsonForScript(clientPayload)}</script>
  <script>
    (() => {
      const data = JSON.parse(document.getElementById("audit-data").textContent);
      const byId = new Map(data.findings.map((f) => [f.id, f]));
      const list = document.getElementById("findingsList");
      const cards = () => [...list.querySelectorAll(".finding")];
      const toastEl = document.getElementById("toast");
      let toastTimer;

      function showToast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
      }

      async function copyText(text, label) {
        try {
          await navigator.clipboard.writeText(text);
          showToast(label);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
          showToast(label);
        }
      }

      function buildAgentPrompt(f) {
        const ev = (f.evidence || []).map((e) => "- " + e.path + ":" + e.line + " (" + e.symbol + "): " + e.note).join("\\n");
        const gate = f.gate ? f.gate.command + " -> " + f.gate.expected + " (" + f.gate.status + ")" : "Manual verification required";
        return [
          "Pay down technical debt item " + f.id + ": " + f.title,
          "",
          "Repo: " + data.repo_name + " (audited at " + data.commit + ")",
          "Scope/Owner: " + f.owner_scope + " | Effort: " + f.effort + " | Risk: " + f.fix_risk + " | Blast radius: " + f.blast_radius,
          "",
          "Current cost: " + f.current_cost,
          "Interest rate (" + f.interest_rate + "): " + f.interest_rate_reason,
          "Target payoff: " + f.payoff,
          "",
          "Evidence:",
          ev,
          "",
          "Suggested bounded slice:",
          f.slice,
          "",
          "Risk constraint (" + f.fix_risk + "): " + f.fix_risk_reason,
          "Verification gate: " + gate,
          "",
          "Keep the diff bounded to this slice. Preserve existing behavior unless explicitly fixing a bug, verify with the gate above, and summarize what changed."
        ].join("\\n");
      }

      function buildIssueMd(f) {
        const ev = (f.evidence || []).map((e) => "- \`" + e.path + ":" + e.line + "\` (\`" + e.symbol + "\`) — " + e.note).join("\\n");
        const gate = f.gate ? "\`" + f.gate.command + "\` — " + f.gate.expected : "Manual verification";
        return [
          "## [" + f.id + "] " + f.title,
          "",
          "- **Category:** " + f.category,
          "- **Owner/Scope:** " + f.owner_scope,
          "- **Interest Rate:** " + f.interest_rate + " (" + f.interest_rate_reason + ")",
          "- **Effort / Risk / Blast Radius:** " + f.effort + " / " + f.fix_risk + " / " + f.blast_radius,
          "",
          "### Current Cost",
          f.current_cost,
          "",
          "### Evidence",
          ev,
          "",
          "### Suggested Paydown Slice",
          f.slice,
          "",
          "### Verification Gate",
          gate
        ].join("\\n");
      }

      // Filtering & sorting
      const rankEffort = { S: 1, M: 2, L: 3 };
      const rankRisk = { LOW: 1, MED: 2, HIGH: 3 };
      const rankInterest = { HIGH: 1, MED: 2, LOW: 3 };
      const el = (id) => document.getElementById(id);

      function applyFilters() {
        const q = (el("fSearch")?.value || "").trim().toLowerCase();
        const cat = el("fCategory")?.value || "";
        const intr = el("fInterest")?.value || "";
        const eff = el("fEffort")?.value || "";
        const risk = el("fRisk")?.value || "";
        const delt = el("fDelta")?.value || "";
        const orig = el("fOrigin")?.value || "";
        const sort = el("fSort")?.value || "order";

        const all = cards();
        all.sort((a, b) => {
          if (sort === "interest") return (rankInterest[a.dataset.interest] || 9) - (rankInterest[b.dataset.interest] || 9) || Number(a.dataset.order) - Number(b.dataset.order);
          if (sort === "effort") return (rankEffort[a.dataset.effort] || 9) - (rankEffort[b.dataset.effort] || 9) || Number(a.dataset.order) - Number(b.dataset.order);
          if (sort === "risk") return (rankRisk[a.dataset.risk] || 9) - (rankRisk[b.dataset.risk] || 9) || Number(a.dataset.order) - Number(b.dataset.order);
          return Number(a.dataset.order) - Number(b.dataset.order);
        });

        let shown = 0;
        for (const c of all) {
          list.appendChild(c);
          const ok =
            (!q || c.dataset.search.includes(q)) &&
            (!cat || c.dataset.category === cat) &&
            (!intr || c.dataset.interest === intr) &&
            (!eff || c.dataset.effort === eff) &&
            (!risk || c.dataset.risk === risk) &&
            (!delt || c.dataset.delta === delt) &&
            (!orig || c.dataset.origin === orig);
          c.classList.toggle("hidden", !ok);
          if (ok) shown++;
        }
        if (el("fCount")) el("fCount").textContent = "Showing " + shown + " of " + all.length;
      }

      for (const id of ["fSearch", "fCategory", "fInterest", "fEffort", "fRisk", "fDelta", "fOrigin", "fSort"]) {
        el(id)?.addEventListener("input", applyFilters);
        el(id)?.addEventListener("change", applyFilters);
      }

      el("fReset")?.addEventListener("click", () => {
        for (const id of ["fSearch", "fCategory", "fInterest", "fEffort", "fRisk", "fDelta", "fOrigin"]) {
          if (el(id)) el(id).value = "";
        }
        if (el("fSort")) el("fSort").value = "order";
        applyFilters();
      });

      document.querySelectorAll("[data-filter-category]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (el("fCategory")) el("fCategory").value = btn.dataset.filterCategory;
          applyFilters();
          el("findingsList")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });

      document.querySelectorAll("[data-filter-effort][data-filter-risk]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (el("fEffort")) el("fEffort").value = btn.dataset.filterEffort;
          if (el("fRisk")) el("fRisk").value = btn.dataset.filterRisk;
          applyFilters();
          el("findingsList")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });

      // Card actions
      list.addEventListener("click", (ev) => {
        const btn = ev.target.closest("[data-action]");
        if (!btn) return;
        const f = byId.get(btn.dataset.id);
        if (!f) return;
        if (btn.dataset.action === "copy-prompt") {
          copyText(buildAgentPrompt(f), "Copied agent prompt for " + f.id);
        } else if (btn.dataset.action === "copy-issue") {
          copyText(buildIssueMd(f), "Copied Markdown issue for " + f.id);
        } else if (btn.dataset.action === "reject") {
          const reason = window.prompt("Why should " + f.id + " be marked Won't Fix / Rejected?", "intentional tradeoff");
          if (reason && reason.trim()) {
            const safeReason = reason.trim().replace(/"/g, "'");
            copyText('/tech-debt-audit reject ' + f.id + ' "' + safeReason + '"', "Copied reject command — paste in your agent");
          }
        }
      });

      // Batch selection
      const batchBar = el("batchBar");
      const getSelected = () => [...document.querySelectorAll(".finding-select:checked")].map((cb) => byId.get(cb.value)).filter(Boolean);

      function updateBatch() {
        const sel = getSelected();
        batchBar.classList.toggle("visible", sel.length > 0);
        el("batchCount").textContent = sel.length + " selected";
      }
      list.addEventListener("change", (ev) => {
        if (ev.target.classList.contains("finding-select")) updateBatch();
      });
      el("batchClear")?.addEventListener("click", () => {
        document.querySelectorAll(".finding-select:checked").forEach((cb) => { cb.checked = false; });
        updateBatch();
      });
      el("batchCopyPrompt")?.addEventListener("click", () => {
        const sel = getSelected();
        if (!sel.length) return;
        const combined = "Pay down these " + sel.length + " selected technical debt slices in order, verifying each before starting the next:\\n\\n" + sel.map(buildAgentPrompt).join("\\n\\n---\\n\\n");
        copyText(combined, "Copied combined agent prompt (" + sel.length + " items)");
      });
      el("batchCopyMd")?.addEventListener("click", () => {
        const sel = getSelected();
        if (!sel.length) return;
        const md = sel.map((f) => "- [ ] **" + f.id + "**: " + f.title + " (" + f.effort + ", Risk " + f.fix_risk + ") — " + f.slice).join("\\n");
        copyText(md, "Copied Markdown checklist (" + sel.length + " items)");
      });

      // Theme toggle
      el("themeToggle")?.addEventListener("click", () => {
        const root = document.documentElement;
        const cur = root.getAttribute("data-theme");
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const next = cur ? (cur === "dark" ? "light" : "dark") : (prefersDark ? "light" : "dark");
        root.setAttribute("data-theme", next);
      });
    })();
  </script>
</body>
</html>
`;
}
