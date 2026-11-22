#!/usr/bin/env node
// Deterministic validator, memory updater, quest-ledger writer, and HTML/Markdown renderer.
// Zero external dependencies; Node 18+.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  extractAnchors,
  formatTimestamp,
  getRepoIdentity,
  getSkillVersion,
  loadPriorMemo,
  loadQuestLedger,
  matchPriorFinding,
  validateAudit,
} from "./lib/common.mjs";
import { computeDelta, isInEffectiveScope, mergeRejected, saveMemo } from "./memory.mjs";
import { renderHtmlReport } from "./lib/render-html.mjs";
import { renderMarkdownReport } from "./lib/render-md.mjs";

function parseArgs(argv) {
  const opts = {
    input: null,
    repo: ".",
    format: "html",
    out: null,
    mdOut: null,
    quests: false,
    open: !process.env.CI,
    noMemory: false,
    validateOnly: false,
    skipFileCheck: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input" && argv[i + 1]) opts.input = argv[++i];
    else if (a === "--repo" && argv[i + 1]) opts.repo = argv[++i];
    else if (a === "--format" && argv[i + 1]) opts.format = argv[++i];
    else if (a === "--out" && argv[i + 1]) opts.out = argv[++i];
    else if (a === "--md-out" && argv[i + 1]) opts.mdOut = argv[++i];
    else if (a === "--quests") opts.quests = true;
    else if (a === "--open") opts.open = true;
    else if (a === "--no-open") opts.open = false;
    else if (a === "--no-memory") opts.noMemory = true;
    else if (a === "--validate-only") opts.validateOnly = true;
    else if (a === "--skip-file-check") opts.skipFileCheck = true;
    else if (!opts.input && !a.startsWith("-")) opts.input = a;
  }
  if (!["html", "markdown", "both"].includes(opts.format)) {
    console.error(`Error: invalid --format "${opts.format}" (expected html, markdown, or both)`);
    process.exit(1);
  }
  return opts;
}

function parseDebtNum(id) {
  const m = String(id || "").match(/^DEBT-(\d+)$/);
  return m ? Number(m[1]) : 0;
}

function formatDebtId(num) {
  return `DEBT-${String(num).padStart(2, "0")}`;
}

function stabilizeIdsWithLedger(findings, existingLedger) {
  const priorQuests = Array.isArray(existingLedger?.quests) ? existingLedger.quests : [];
  if (!priorQuests.length) return findings;

  let maxNum = 0;
  for (const q of priorQuests) {
    const n = parseDebtNum(q.id);
    if (n > maxNum) maxNum = n;
  }

  const usedIds = new Set();
  return findings.map((f) => {
    const match = matchPriorFinding(f, priorQuests);
    if (match && match.id && !usedIds.has(match.id)) {
      usedIds.add(match.id);
      return { ...f, id: match.id };
    }
    maxNum++;
    const newId = formatDebtId(maxNum);
    usedIds.add(newId);
    return { ...f, id: newId };
  });
}

function buildQuestLedger(identity, auditData, annotatedFindings, existingLedger, mergedRejected) {
  const isBranch = auditData.audit?.mode === "branch";
  const version = getSkillVersion();
  const priorById = new Map((existingLedger?.quests || []).map((q) => [q.id, q]));

  const currentQuests = annotatedFindings.map((f) => {
    const prior = priorById.get(f.id);
    return {
      id: f.id,
      title: f.title,
      category: f.category,
      origin: isBranch ? f.origin || null : null,
      evidence: (f.evidence || []).map((e) => ({
        path: e.path,
        line: e.line,
        symbol: e.symbol,
        note: e.note,
      })),
      current_cost: f.current_cost,
      interest_rate: f.interest_rate,
      interest_rate_reason: f.interest_rate_reason,
      payoff: f.payoff,
      falsification: f.falsification,
      slice: f.slice,
      gate: f.gate
        ? {
            command: f.gate.command,
            expected: f.gate.expected,
            status: f.gate.status,
          }
        : null,
      effort: f.effort,
      fix_risk: f.fix_risk,
      blast_radius: f.blast_radius,
      confidence: f.confidence,
      status: prior?.status && !["open", "expired"].includes(prior.status) ? prior.status : "open",
      owner_scope: f.owner_scope,
    };
  });

  // Preserve historical entries so IDs are never recycled; only expire open items that were in-scope
  const currentIds = new Set(currentQuests.map((q) => q.id));
  const mode = auditData.audit?.mode || "full";
  const effectivePaths = auditData.audit?.effective_paths || ["."];
  const preservedPrior = [];
  for (const pq of existingLedger?.quests || []) {
    if (currentIds.has(pq.id)) continue;
    const inScope = isInEffectiveScope(extractAnchors(pq), mode, effectivePaths);
    preservedPrior.push({
      ...pq,
      status: pq.status === "open" && inScope ? "expired" : pq.status,
    });
  }

  return {
    schema_version: 1,
    generated_by: `tech-debt-audit@${version}`,
    repo: identity.rawOrigin || identity.root,
    audit: {
      date: auditData.audit.date,
      commit: auditData.audit.commit,
      effort: auditData.audit.effort,
      scope: auditData.audit.scope,
      not_audited: auditData.audit.not_audited,
    },
    quests: [...currentQuests, ...preservedPrior],
    rejected: mergedRejected.map((r) => ({
      title: r.title,
      reason: r.reason,
      evidence: r.evidence,
    })),
    investigate: (auditData.investigate || []).map((i) => ({
      candidate: i.candidate,
      signal: i.signal,
      proof_needed: i.proof_needed,
    })),
  };
}

function openInBrowser(filePath) {
  try {
    if (process.platform === "darwin") {
      execFileSync("open", [filePath], { stdio: "ignore", timeout: 5000 });
    } else if (process.platform === "win32") {
      execFileSync("cmd", ["/c", "start", "", filePath], { stdio: "ignore", timeout: 5000 });
    } else {
      execFileSync("xdg-open", [filePath], { stdio: "ignore", timeout: 5000 });
    }
    return { opened: true, open_error: null };
  } catch (err) {
    return { opened: false, open_error: err?.message || String(err) };
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.input) {
    console.error("Usage: node render-report.mjs --input <audit.json|-> [--repo <dir>] [--format html|markdown|both] [--out <path>] [--md-out <path>] [--quests] [--no-open] [--validate-only]");
    process.exit(1);
  }

  let rawJson;
  try {
    rawJson = opts.input === "-" ? readFileSync(0, "utf8") : readFileSync(opts.input, "utf8");
  } catch (err) {
    console.error(`Error reading input: ${err.message}`);
    process.exit(1);
  }

  let auditData;
  try {
    auditData = JSON.parse(rawJson);
  } catch (err) {
    console.error(`Error parsing JSON: ${err.message}`);
    process.exit(1);
  }

  const identity = getRepoIdentity(opts.repo);
  const validation = validateAudit(auditData, {
    repoRoot: opts.skipFileCheck ? null : identity.root,
  });

  if (!validation.valid) {
    console.error("Audit JSON validation failed:");
    for (const err of validation.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  if (opts.validateOnly) {
    console.log(JSON.stringify({ ok: true, valid: true, warnings: validation.warnings }, null, 2));
    return;
  }

  const priorMemo = loadPriorMemo(identity);
  const existingLedger = loadQuestLedger(identity.root);

  // Stabilize IDs against existing quest ledger if present
  let findings = auditData.findings || [];
  if (existingLedger.found && existingLedger.data) {
    findings = stabilizeIdsWithLedger(findings, existingLedger.data);
  }

  const delta = computeDelta(findings, priorMemo.data, auditData.audit);
  const priorRejectedCount = priorMemo.data?.rejected?.length || 0;
  const mergedRejected = mergeRejected(
    priorMemo.data?.rejected,
    auditData.rejected,
    auditData.revived_rejections || []
  );

  const priorSummary = priorMemo.found && priorMemo.data?.last_audit
    ? `${priorMemo.data.last_audit.date} (${priorMemo.data.last_audit.commit}), ${priorRejectedCount} prior rejection(s) honored`
    : priorMemo.found
      ? `${priorRejectedCount} prior rejection(s) honored`
      : "none found";

  const renderContext = {
    annotatedFindings: delta.annotated_findings,
    delta,
    priorSummary,
    priorRejectionsHonored: priorRejectedCount,
  };

  // Merge prior rejections into rendered rejected list so the report shows full settled state
  const auditForRender = {
    ...auditData,
    rejected: mergedRejected,
  };

  const ts = formatTimestamp();
  let htmlPath = null;
  let markdownPath = null;
  let questLedgerPath = null;
  let openResult = { opened: false, open_error: null };

  if (opts.format === "html" || opts.format === "both") {
    htmlPath = opts.out
      ? resolve(opts.out)
      : join(tmpdir(), `tech-debt-report-${identity.repoSlug}-${ts}.html`);
    mkdirSync(dirname(htmlPath), { recursive: true });
    writeFileSync(htmlPath, renderHtmlReport(auditForRender, renderContext), "utf8");
  }

  if (opts.format === "markdown" || opts.format === "both") {
    markdownPath = opts.mdOut
      ? resolve(opts.mdOut)
      : join(tmpdir(), `tech-debt-report-${identity.repoSlug}-${ts}.md`);
    mkdirSync(dirname(markdownPath), { recursive: true });
    writeFileSync(markdownPath, renderMarkdownReport(auditForRender, renderContext), "utf8");
  }

  if (opts.quests) {
    questLedgerPath = join(identity.root, ".tech-debt", "ledger.json");
    const ledgerObj = buildQuestLedger(
      identity,
      auditData,
      delta.annotated_findings,
      existingLedger.data,
      mergedRejected
    );
    mkdirSync(dirname(questLedgerPath), { recursive: true });
    writeFileSync(questLedgerPath, JSON.stringify(ledgerObj, null, 2) + "\n", "utf8");
  }

  let memoResult = { saved: false, path: null, error: null };
  if (!opts.noMemory) {
    try {
      const saved = saveMemo(identity, auditData, priorMemo.data, delta, htmlPath || markdownPath);
      memoResult = { saved: true, path: saved.path, error: null };
    } catch (err) {
      memoResult = { saved: false, path: identity.memoPath, error: err?.message || String(err) };
    }
  }

  if (htmlPath && opts.open) {
    openResult = openInBrowser(htmlPath);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        html_path: htmlPath,
        markdown_path: markdownPath,
        quest_ledger_path: questLedgerPath,
        memo_saved: memoResult.saved,
        memo_path: memoResult.path,
        memo_error: memoResult.error,
        opened: openResult.opened,
        open_error: openResult.open_error,
        findings_count: delta.annotated_findings.length,
        delta: {
          has_prior_open: delta.has_prior_open,
          resolved: delta.resolved.length,
          new: delta.new_count,
          persisted: delta.persisted_count,
        },
        warnings: validation.warnings,
      },
      null,
      2
    )
  );
}

main();
