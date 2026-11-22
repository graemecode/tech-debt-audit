#!/usr/bin/env node
// Repo validator: plugin manifest, skill frontmatter, relative markdown links,
// bundled script syntax checks, and sample audit JSON validation.
// Zero dependencies; Node 18+.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateAudit } from "../skills/engineering/tech-debt-audit/scripts/lib/common.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
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

const marketplacePath = join(ROOT, ".claude-plugin", "marketplace.json");
if (existsSync(marketplacePath)) {
  try {
    const mp = JSON.parse(readFileSync(marketplacePath, "utf8"));
    if (mp.name === plugin?.name && Array.isArray(mp.plugins) && mp.plugins.some((p) => p.name === plugin?.name)) {
      ok("marketplace.json matches plugin.json");
    } else {
      fail("marketplace.json name/plugins mismatch with plugin.json");
    }
  } catch (e) {
    fail(`marketplace.json invalid JSON: ${e.message}`);
  }
}

// --- 2. SKILL.md frontmatter ---
function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1] : null;
}
function findFiles(dir, predicate) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === ".git" || name === "plans" || name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...findFiles(p, predicate));
    else if (predicate(name, p)) out.push(p);
  }
  return out;
}
const skillFiles = findFiles(join(ROOT, "skills"), (name) => name === "SKILL.md");
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

// --- 3. Relative markdown links and HTML img/source assets resolve ---
const stripFences = (text) => text.replace(/```[\s\S]*?```/g, "");
for (const file of findFiles(ROOT, (name) => name.endsWith(".md"))) {
  const text = stripFences(readFileSync(file, "utf8"));
  const relFile = file.slice(ROOT.length + 1);
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = m[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const resolved = join(dirname(file), target.split("#")[0]);
    if (existsSync(resolved)) ok(`link ok: ${target} (in ${relFile})`);
    else fail(`broken link "${target}" in ${relFile}`);
  }
  for (const m of text.matchAll(/(?:src|srcset)=["']([^"']+)["']/g)) {
    const target = m[1].trim().split(/\s+/)[0];
    if (/^(https?:|data:|#)/.test(target)) continue;
    const resolved = join(dirname(file), target.split("#")[0]);
    if (existsSync(resolved)) ok(`asset ok: ${target} (in ${relFile})`);
    else fail(`broken asset "${target}" in ${relFile}`);
  }
}

// --- 4. Syntax-check all .mjs scripts ---
for (const mjs of findFiles(ROOT, (name) => name.endsWith(".mjs"))) {
  const rel = mjs.slice(ROOT.length + 1);
  try {
    execFileSync(process.execPath, ["--check", mjs], { stdio: "pipe" });
    ok(`syntax ok: ${rel}`);
  } catch (e) {
    fail(`syntax error in ${rel}: ${e.stderr?.toString() || e.message}`);
  }
}

// --- 5. Sample audit JSON validates cleanly ---
const sampleJsonPath = join(ROOT, "examples", "001-sample-audit.json");
if (existsSync(sampleJsonPath)) {
  try {
    const sample = JSON.parse(readFileSync(sampleJsonPath, "utf8"));
    const res = validateAudit(sample);
    if (res.valid) ok("examples/001-sample-audit.json passes schema validation");
    else fail(`examples/001-sample-audit.json failed validation: ${res.errors.join("; ")}`);
  } catch (e) {
    fail(`examples/001-sample-audit.json parse error: ${e.message}`);
  }
} else {
  fail("examples/001-sample-audit.json missing");
}

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\nAll checks passed");
