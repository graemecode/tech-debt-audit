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
}

// --- 2. SKILL.md frontmatter (skills live at skills/<category>/<name>/SKILL.md) ---
function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1] : null;
}
function findSkillFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...findSkillFiles(p));
    else if (name === "SKILL.md") out.push(p);
  }
  return out;
}
const skillFiles = findSkillFiles(join(ROOT, "skills"));
if (skillFiles.length) ok(`found ${skillFiles.length} skill(s) under skills/`);
else fail("no SKILL.md found under skills/");
if (plugin) {
  if (skillFiles.some((f) => dirname(f).endsWith(`/${plugin.name}`)))
    ok(`a skill directory matches plugin name (${plugin.name})`);
  else fail(`no skill directory matching plugin name "${plugin.name}"`);
}
for (const skillFile of skillFiles) {
  const entry = dirname(skillFile).split("/").pop();
  const rel = skillFile.slice(ROOT.length + 1);
  const fm = parseFrontmatter(readFileSync(skillFile, "utf8"));
  if (!fm) { fail(`${rel} has no frontmatter`); continue; }
  ok(`${rel} has frontmatter`);
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
