function escCell(val) {
  return String(val ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .trim();
}

export function renderMarkdownReport(auditData, context = {}) {
  const audit = auditData.audit;
  const findings = context.annotatedFindings || auditData.findings || [];
  const delta = context.delta || { has_prior_open: false, new_count: findings.length, persisted_count: 0, resolved: [] };
  const isBranch = audit.mode === "branch";
  const priorInfo = context.priorSummary || "none found";

  const verCmds = audit.verification_commands?.length
    ? audit.verification_commands
        .map((v) =>
          typeof v === "string" ? `\`${v}\`` : `\`${v.command}\` -> ${v.status || "discovered"}`
        )
        .join("; ")
    : "none discovered";

  const lines = [];
  lines.push(`# Technical Debt Report: ${audit.repo_name}`);
  lines.push("");
  lines.push("## Scope");
  lines.push("");
  lines.push(`- **Audited at**: ${audit.date} on commit \`${audit.commit}\``);
  lines.push(`- **Effort level**: ${audit.effort} (${audit.mode || "full"})`);
  lines.push(`- **Scope inspected**: ${audit.scope}`);
  lines.push(`- **Not audited**: ${audit.not_audited}`);
  lines.push(`- **Verification commands discovered**: ${verCmds}`);
  lines.push(`- **Prior audit**: ${priorInfo}`);
  if (delta.has_prior_open) {
    lines.push(
      `- **Delta vs prior audit**: ${delta.resolved.length} resolved, ${delta.new_count} new, ${delta.persisted_count} persisted`
    );
  }
  lines.push("");

  lines.push("## Executive Summary");
  lines.push("");
  for (const b of auditData.executive_summary || []) {
    lines.push(`- ${b}`);
  }
  lines.push("");

  if (delta.has_prior_open && delta.resolved.length) {
    lines.push("## Resolved Since Prior Audit");
    lines.push("");
    for (const r of delta.resolved) {
      lines.push(`- \`${r.id}\`: ${r.title} (${r.category})`);
    }
    lines.push("");
  }

  lines.push("## Recommended Paydown Sequence");
  lines.push("");
  lines.push("| Order | Finding | Why first | Interest | Effort | Risk | Verification gate |");
  lines.push("|-------|---------|-----------|----------|--------|------|-------------------|");
  if (findings.length) {
    findings.forEach((f, idx) => {
      const originSuffix = isBranch && f.origin ? ` (${f.origin})` : "";
      const gateStr = f.gate
        ? `\`${f.gate.command}\` (${f.gate.status})`
        : "manual";
      lines.push(
        `| ${idx + 1} | ${escCell(f.id)}: ${escCell(f.title)}${originSuffix} | ${escCell(f.why_this_order)} | ${f.interest_rate} | ${f.effort} | ${f.fix_risk} | ${escCell(gateStr)} |`
      );
    });
  } else {
    lines.push("| - | None | No actionable debt above vetting threshold | - | - | - | - |");
  }
  lines.push("");

  lines.push("## Debt Ledger");
  lines.push("");
  lines.push("| ID | Finding | Category | Owner/Scope | Interest | Effort | Risk | Confidence | Evidence |");
  lines.push("|----|---------|----------|-------------|----------|--------|------|------------|----------|");
  if (findings.length) {
    for (const f of findings) {
      const originSuffix = isBranch && f.origin ? ` (${f.origin})` : "";
      const primary = f.evidence?.[0] ? `\`${f.evidence[0].path}:${f.evidence[0].line}\`` : "-";
      lines.push(
        `| ${f.id} | ${escCell(f.title)}${originSuffix} | ${escCell(f.category)} | ${escCell(f.owner_scope)} | ${f.interest_rate} | ${f.effort} | ${f.fix_risk} | ${f.confidence} | ${primary} |`
      );
    }
  } else {
    lines.push("| - | None | - | - | - | - | - | - | - |");
  }
  lines.push("");

  lines.push("## Findings");
  lines.push("");
  if (!findings.length) {
    lines.push("No actionable technical debt worth paying down in this scope.");
    lines.push("");
  }
  for (const f of findings) {
    lines.push(`### ${f.id}: ${f.title}`);
    lines.push("");
    lines.push(`- **Category**: ${f.category}`);
    lines.push(`- **Owner/scope**: ${f.owner_scope} (blast radius: \`${f.blast_radius}\`)`);
    if (isBranch && f.origin) {
      lines.push(`- **Origin**: ${f.origin}`);
    }
    if (delta.has_prior_open && f.delta) {
      lines.push(
        `- **Status vs prior audit**: ${f.delta}${f.delta === "persisted" && f.first_seen ? ` (first seen ${f.first_seen})` : ""}`
      );
    }
    lines.push("- **Evidence**:");
    for (const e of f.evidence || []) {
      lines.push(`  - \`${e.path}:${e.line}\` (\`${e.symbol}\`) - ${e.note}`);
    }
    lines.push(`- **Current cost**: ${f.current_cost}`);
    lines.push(`- **Interest rate**: ${f.interest_rate} - ${f.interest_rate_reason}`);
    lines.push(`- **Payoff**: ${f.payoff}`);
    lines.push(`- **Falsification check**: ${f.falsification}`);
    lines.push(`- **Suggested slice**: ${f.slice}`);
    if (f.gate) {
      lines.push(
        `- **Verification gate** (${f.gate.status}): \`${f.gate.command}\` -> ${f.gate.expected}${
          f.gate.observed_result ? ` (observed: ${f.gate.observed_result})` : ""
        }`
      );
    } else {
      lines.push("- **Verification gate**: none (manual verification required)");
    }
    lines.push(`- **Effort**: ${f.effort}`);
    lines.push(`- **Fix risk**: ${f.fix_risk} - ${f.fix_risk_reason}`);
    lines.push(`- **Confidence**: ${f.confidence} - ${f.confidence_reason}`);
    lines.push("");
  }

  lines.push("## Investigate Later");
  lines.push("");
  if (auditData.investigate?.length) {
    lines.push("| Candidate | Signal | What would prove it |");
    lines.push("|-----------|--------|---------------------|");
    for (const i of auditData.investigate) {
      lines.push(`| ${escCell(i.candidate)} | ${escCell(i.signal)} | ${escCell(i.proof_needed)} |`);
    }
  } else {
    lines.push("None.");
  }
  lines.push("");

  lines.push("## Considered and Rejected");
  lines.push("");
  if (auditData.rejected?.length) {
    for (const r of auditData.rejected) {
      const tag = r.source === "human" ? " [human]" : "";
      lines.push(`- \`${r.title}\`${tag}: ${r.reason} (\`${r.evidence}\`)`);
    }
  } else {
    lines.push("None.");
  }
  lines.push("");

  lines.push("## Notes for Implementers");
  lines.push("");
  if (auditData.implementer_notes?.length) {
    for (const n of auditData.implementer_notes) {
      lines.push(`- ${n}`);
    }
  } else {
    lines.push("- None.");
  }
  lines.push("");

  return lines.join("\n");
}
