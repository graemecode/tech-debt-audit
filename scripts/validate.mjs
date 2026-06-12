#!/usr/bin/env node
// Repo validator: plugin manifest, skill frontmatter, relative markdown links.
// Zero dependencies; Node 18+.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
let failures = 0;
const fail = (msg) => { failures++; console.error(`FAIL ${msg}`); };
const ok = (msg) => console.log(`OK   ${msg}`);

// --- 1. plugin.json ---
const pluginPath = join(ROOT, ".claude-plugin", "plugin.json");
let plugin;
try {
  plugin = JSON.parse(readFileSync(pluginPath, "utf8"));
  ok("plugin.json parses");
} catch (e) {
  fail(`plugin.json unreadable or invalid JSON: ${e.message}`);
}
if (plugin) {
  for (const field of ["name", "description", "version"]) {
    if (typeof plugin[field] === "string" && plugin[field].trim()) ok(`plugin.json has ${field}`);
    else fail(`plugin.json missing or empty: ${field}`);
  }
  const skillDir = join(ROOT, "skills", plugin.name);
  if (existsSync(skillDir)) ok(`skills/${plugin.name}/ exists`);
  else fail(`no skills/${plugin.name}/ directory matching plugin name`);
}

// --- 2. SKILL.md frontmatter ---
function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1] : null;
}
for (const entry of readdirSync(join(ROOT, "skills"))) {
  const skillFile = join(ROOT, "skills", entry, "SKILL.md");
  if (!existsSync(skillFile)) { fail(`skills/${entry}/ has no SKILL.md`); continue; }
  const fm = parseFrontmatter(readFileSync(skillFile, "utf8"));
  if (!fm) { fail(`skills/${entry}/SKILL.md has no frontmatter`); continue; }
  ok(`skills/${entry}/SKILL.md has frontmatter`);
  const name = fm.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  if (name === entry) ok(`SKILL.md name matches directory (${entry})`);
  else fail(`SKILL.md name "${name}" != directory "${entry}"`);
  if (fm.match(/^description:\s*\S+/m)) ok("SKILL.md has description");
  else fail("SKILL.md description missing or empty");
  const skillVersion = fm.match(/version:\s*"?([^"\n]+)"?/)?.[1]?.trim();
  if (plugin && skillVersion && skillVersion === plugin.version)
    ok(`versions agree (${skillVersion})`);
  else fail(`version mismatch: SKILL.md "${skillVersion}" vs plugin.json "${plugin?.version}"`);
}

// --- 3. Relative markdown links resolve ---
function mdFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === ".git" || name === "plans" || name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...mdFiles(p));
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}
const stripFences = (text) => text.replace(/```[\s\S]*?```/g, "");
for (const file of mdFiles(ROOT)) {
  const text = stripFences(readFileSync(file, "utf8"));
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = m[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const resolved = join(dirname(file), target.split("#")[0]);
    if (existsSync(resolved)) ok(`link ok: ${target} (in ${file.slice(ROOT.length + 1)})`);
    else fail(`broken link "${target}" in ${file.slice(ROOT.length + 1)}`);
  }
}

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\nAll checks passed");
