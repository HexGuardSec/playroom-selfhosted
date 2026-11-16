// Quick checks before contributing: syntax, complete translations, no secrets in the repository
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
let errors = 0;
const fail = (msg) => {
  errors++;
  console.error(`✗ ${msg}`);
};

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (['node_modules', 'data', '.git'].includes(e.name)) return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}
const files = walk(ROOT);

// 1. Syntax of every JavaScript file
for (const f of files.filter((f) => f.endsWith('.js'))) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    fail(`${path.relative(ROOT, f)} : ${e.stderr.toString().split('\n')[4] || 'syntax error'}`);
  }
}

// 2. Every language has exactly the same keys as English
const keys = (src) => new Set([...src.matchAll(/'([a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)*)':\s/g)].map((m) => m[1]));
const i18n = fs.readFileSync(path.join(ROOT, 'public/i18n.js'), 'utf8');
const en = keys(i18n.slice(i18n.indexOf('D.en = {'), i18n.indexOf('D.fr = {')));
const langs = { fr: i18n.slice(i18n.indexOf('D.fr = {'), i18n.indexOf('// ---------- Moteur')) };
for (const f of fs.readdirSync(path.join(ROOT, 'public/lang'))) langs[f.replace('.js', '')] = fs.readFileSync(path.join(ROOT, 'public/lang', f), 'utf8');
for (const [lang, src] of Object.entries(langs)) {
  const k = keys(src);
  const missing = [...en].filter((x) => !k.has(x));
  const extra = [...k].filter((x) => !en.has(x));
  if (missing.length) fail(`${lang}: missing keys ${missing.join(', ')}`);
  if (extra.length) fail(`${lang}: unknown keys ${extra.join(', ')}`);
}

// 3. No secrets file and nothing that looks like a key
for (const f of files) {
  const rel = path.relative(ROOT, f);
  if (/^\.env($|\.)/.test(path.basename(f)) && path.basename(f) !== '.env.example') fail(`${rel}: secrets file, do not publish it`);
  if (!/\.(js|json|md|yml|sh|example|html|css)$/.test(f) || rel.startsWith('test')) continue;
  const text = fs.readFileSync(f, 'utf8');
  if (/(STEAM_API_KEY|PSN_NPSSO|OPENXBL_API_KEY|IGDB_CLIENT_SECRET)=\S{8,}/.test(text)) fail(`${rel}: an API key seems to be hard-coded`);
}

console.log(errors ? `\n${errors} problem(s) found` : `✓ ${files.length} files checked, ${Object.keys(langs).length + 1} complete languages, no secrets`);
process.exit(errors ? 1 : 0);
