#!/usr/bin/env node
// Durable audit memory manager (schema v2, backward-compatible with v1 memos).
// Zero external dependencies; Node 18+.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  extractAnchors,
  findSecretLeaks,
  getRepoIdentity,
  loadPriorMemo,
  loadQuestLedger,
  matchPriorFinding,
} from "./lib/common.mjs";

export function isInEffectiveScope(anchors, mode, effectivePaths) {
  if (mode === "full") return true;
  if (!Array.isArray(effectivePaths) || !effectivePaths.length || effectivePaths.includes(".")) {
    return false;
  }
  return anchors.some((a) =>
    effectivePaths.some((p) => a.path === p || a.path.startsWith(`${p.replace(/\/+$/, "")}/`))
  );
}

export function computeDelta(findings, priorMemoData, auditMeta) {
  const priorOpen = Array.isArray(priorMemoData?.open_findings) ? priorMemoData.open_findings : [];
  if (!priorOpen.length) {
    return {
      has_prior_open: false,
      new_count: findings.length,
      persisted_count: 0,
      resolved: [],
      annotated_findings: findings.map((f) => ({
        ...f,
        delta: "new",
        first_seen: auditMeta?.date || new Date().toISOString().slice(0, 10),
      })),
    };
  }

  const matchedPriorIndices = new Set();
  const annotated = findings.map((f) => {
    const match = matchPriorFinding(f, priorOpen);
    if (match) {
      const idx = priorOpen.indexOf(match);
      if (idx >= 0) matchedPriorIndices.add(idx);
      return {
        ...f,
        delta: "persisted",
        first_seen: match.first_seen || priorMemoData.last_audit?.date || auditMeta?.date,
        prior_id: match.id,
      };
    }
    return {
      ...f,
      delta: "new",
      first_seen: auditMeta?.date || new Date().toISOString().slice(0, 10),
    };
  });

  const mode = auditMeta?.mode || "full";
  const effectivePaths = auditMeta?.effective_paths || ["."];
  const resolved = [];
  for (let i = 0; i < priorOpen.length; i++) {
    if (matchedPriorIndices.has(i)) continue;
    const p = priorOpen[i];
    if (isInEffectiveScope(extractAnchors(p), mode, effectivePaths)) {
      resolved.push({
        id: p.id,
        title: p.title,
        category: p.category,
        first_seen: p.first_seen || null,
      });
    }
  }

  return {
    has_prior_open: true,
    new_count: annotated.filter((f) => f.delta === "new").length,
    persisted_count: annotated.filter((f) => f.delta === "persisted").length,
    resolved,
    annotated_findings: annotated,
  };
}

export function mergeRejected(priorRejected, newRejected, revivedTitles = []) {
  const revivedSet = new Set(revivedTitles.map((t) => String(t).toLowerCase().trim()));
  const byKey = new Map();

  for (const r of priorRejected || []) {
    const key = String(r.title || "").toLowerCase().trim();
    if (!key || revivedSet.has(key)) continue;
    byKey.set(key, {
      title: r.title,
      reason: r.reason,
      evidence: r.evidence || "",
      source: r.source || "auditor",
      recorded_at: r.recorded_at || null,
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  for (const r of newRejected || []) {
    const key = String(r.title || "").toLowerCase().trim();
    if (!key) continue;
    const existing = byKey.get(key);
    byKey.set(key, {
      title: r.title,
      reason: r.reason,
      evidence: r.evidence || existing?.evidence || "",
      source: existing?.source === "human" ? "human" : r.source || "auditor",
      recorded_at: existing?.recorded_at || today,
    });
  }

  return [...byKey.values()];
}

export function saveMemo(identity, auditData, priorMemoData, delta, reportPath) {
  const mode = auditData.audit?.mode || "full";
  const effectivePaths = auditData.audit?.effective_paths || ["."];
  const today = auditData.audit?.date || new Date().toISOString().slice(0, 10);

  const currentOpen = (delta?.annotated_findings || auditData.findings || []).map((f) => ({
    id: f.id,
    title: f.title,
    category: f.category,
    effort: f.effort,
    fix_risk: f.fix_risk,
    interest_rate: f.interest_rate,
    confidence: f.confidence,
    owner_scope: f.owner_scope,
    first_seen: f.first_seen || today,
    last_seen: today,
    anchors: extractAnchors(f),
  }));

  // For scoped/branch runs, preserve prior open findings outside the current scope
  const preservedOutOfScope = [];
  if (mode !== "full" && Array.isArray(priorMemoData?.open_findings)) {
    for (const p of priorMemoData.open_findings) {
      if (!isInEffectiveScope(extractAnchors(p), mode, effectivePaths)) {
        preservedOutOfScope.push(p);
      }
    }
  }

  const mergedRejected = mergeRejected(
    priorMemoData?.rejected,
    auditData.rejected,
    auditData.revived_rejections || []
  );

  const memo = {
    schema_version: 2,
    repo: identity.rawOrigin || identity.root,
    normalized_repo: identity.normalizedKey,
    last_audit: {
      date: today,
      commit: auditData.audit?.commit || "unknown",
      effort: auditData.audit?.effort || "standard",
      mode,
      scope: auditData.audit?.scope || ".",
      report_path: reportPath || null,
    },
    open_findings: [...currentOpen, ...preservedOutOfScope],
    rejected: mergedRejected,
    investigate: auditData.investigate || [],
  };

  mkdirSync(dirname(identity.memoPath), { recursive: true });
  writeFileSync(identity.memoPath, JSON.stringify(memo, null, 2) + "\n", "utf8");
  return { saved: true, path: identity.memoPath, memo };
}

function parseCliArgs(argv) {
  const cmd = argv[0];
  const opts = { repo: ".", id: null, title: null, reason: null, evidence: null };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo" && argv[i + 1]) opts.repo = argv[++i];
    else if (a === "--id" && argv[i + 1]) opts.id = argv[++i];
    else if (a === "--title" && argv[i + 1]) opts.title = argv[++i];
    else if (a === "--reason" && argv[i + 1]) opts.reason = argv[++i];
    else if (a === "--evidence" && argv[i + 1]) opts.evidence = argv[++i];
    else if (!opts.id && /^DEBT-\d+/i.test(a)) opts.id = a.toUpperCase();
    else if (!opts.reason && !a.startsWith("-")) opts.reason = a;
  }
  return { cmd, opts };
}

function runCli() {
  const { cmd, opts } = parseCliArgs(process.argv.slice(2));
  if (!cmd || !["status", "reject", "unreject"].includes(cmd)) {
    console.error(
      "Usage:\n" +
        "  node memory.mjs status [--repo <dir>]\n" +
        '  node memory.mjs reject [--repo <dir>] --id <DEBT-NN> --reason "<why>" [--title "<title>"] [--evidence "<file:line>"]\n' +
        '  node memory.mjs unreject [--repo <dir>] --title "<match>"'
    );
    process.exit(1);
  }

  const identity = getRepoIdentity(opts.repo);
  const prior = loadPriorMemo(identity);
  const memo = prior.data || {
    schema_version: 2,
    repo: identity.rawOrigin || identity.root,
    normalized_repo: identity.normalizedKey,
    last_audit: null,
    open_findings: [],
    rejected: [],
    investigate: [],
  };

  if (cmd === "status") {
    console.log(
      JSON.stringify(
        {
          repo: identity.repoName,
          normalized_repo: identity.normalizedKey,
          memo_path: identity.memoPath,
          found: prior.found,
          migrated_from_legacy: prior.migratedFromLegacy,
          last_audit: memo.last_audit,
          open_findings: memo.open_findings,
          rejected: memo.rejected,
          investigate: memo.investigate,
        },
        null,
        2
      )
    );
    return;
  }

  if (cmd === "reject") {
    if (!opts.reason || !opts.reason.trim()) {
      console.error("Error: --reason is required");
      process.exit(1);
    }
    const leaks = findSecretLeaks({ reason: opts.reason, title: opts.title, evidence: opts.evidence });
    if (leaks.length) {
      console.error(`Error: potential secret detected in input (${leaks[0].rule})`);
      process.exit(1);
    }

    let matched = null;
    if (opts.id) {
      matched = memo.open_findings.find((f) => f.id?.toUpperCase() === opts.id.toUpperCase());
    }
    if (!matched && opts.title) {
      const needle = opts.title.toLowerCase();
      matched = memo.open_findings.find((f) => f.title?.toLowerCase().includes(needle));
    }

    const title = opts.title || matched?.title || opts.id;
    if (!title) {
      console.error("Error: provide --id <DEBT-NN> or --title <text>");
      process.exit(1);
    }
    const evidence =
      opts.evidence ||
      (matched?.anchors?.length ? matched.anchors.map((a) => `${a.path}:${a.line}`).join(", ") : opts.id || "manual");

    memo.schema_version = 2;
    memo.repo = identity.rawOrigin || identity.root;
    memo.normalized_repo = identity.normalizedKey;
    memo.open_findings = memo.open_findings.filter((f) => f !== matched);
    memo.rejected = mergeRejected(memo.rejected, [
      {
        title,
        reason: opts.reason.trim(),
        evidence,
        source: "human",
      },
    ]);

    mkdirSync(dirname(identity.memoPath), { recursive: true });
    writeFileSync(identity.memoPath, JSON.stringify(memo, null, 2) + "\n", "utf8");

    // Also sync to .tech-debt/ledger.json if it already exists in the repo
    let ledgerUpdated = false;
    const ledger = loadQuestLedger(identity.root);
    if (ledger.found && ledger.data && Array.isArray(ledger.data.quests)) {
      const q = ledger.data.quests.find(
        (x) => (opts.id && x.id?.toUpperCase() === opts.id.toUpperCase()) || x.title === title
      );
      if (q) {
        q.status = "rejected";
        ledger.data.rejected = mergeRejected(ledger.data.rejected, [
          { title, reason: opts.reason.trim(), evidence, source: "human" },
        ]);
        writeFileSync(ledger.path, JSON.stringify(ledger.data, null, 2) + "\n", "utf8");
        ledgerUpdated = true;
      }
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          action: "rejected",
          title,
          reason: opts.reason.trim(),
          evidence,
          memo_path: identity.memoPath,
          quest_ledger_updated: ledgerUpdated,
        },
        null,
        2
      )
    );
    return;
  }

  if (cmd === "unreject") {
    if (!opts.title) {
      console.error("Error: --title is required for unreject");
      process.exit(1);
    }
    const needle = opts.title.toLowerCase();
    const before = memo.rejected.length;
    memo.rejected = memo.rejected.filter((r) => !String(r.title || "").toLowerCase().includes(needle));
    const removed = before - memo.rejected.length;
    if (removed > 0 && existsSync(identity.memoPath)) {
      writeFileSync(identity.memoPath, JSON.stringify(memo, null, 2) + "\n", "utf8");
    }
    console.log(JSON.stringify({ ok: true, removed, memo_path: identity.memoPath }, null, 2));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli();
}
