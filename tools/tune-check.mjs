#!/usr/bin/env node
/*
 * Sanity checks for OmniDx Tune that run anywhere, with no Windows and no
 * PowerShell to hand. A real parse and a report-mode run happen on a Windows
 * runner in .github/workflows/tune-check.yml; this is the part that can run
 * before every commit.
 *
 *   node tools/tune-check.mjs
 *
 * Checks: the two scripts are pure ASCII (they are fetched over the wire and
 * a missing charset would mangle anything else); brackets, braces and
 * parentheses balance outside strings, comments and here-strings; every
 * function the main flow calls is defined; the key checksum agrees between
 * the browser module and the Python tool; tune/config.json parses and its
 * version matches the script's.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const ok = (msg) => console.log('  ok  ' + msg);
const bad = (msg) => { failed++; console.log('  FAIL ' + msg); };

function ascii(file) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  const hits = [...text].filter((c) => c.charCodeAt(0) > 127);
  if (hits.length) bad(`${file} has ${hits.length} non-ASCII characters: ${[...new Set(hits)].join(' ')}`);
  else ok(`${file} is ASCII`);
  return text;
}

/* A small PowerShell tokenizer: enough to skip strings, comments and
   here-strings so the bracket count is about code, not prose. */
function balance(file, text) {
  const stack = [];
  const pairs = { ')': '(', ']': '[', '}': '{' };
  let i = 0, line = 1;
  const lineOf = () => line;
  while (i < text.length) {
    const c = text[i], n = text[i + 1];
    if (c === '\n') { line++; i++; continue; }
    if (c === '<' && n === '#') { const e = text.indexOf('#>', i + 2); line += (text.slice(i, e).match(/\n/g) || []).length; i = e + 2; continue; }
    if (c === '#') { const e = text.indexOf('\n', i); i = e < 0 ? text.length : e; continue; }
    if ((c === '@' && (n === "'" || n === '"')) && text[i + 2] === '\n') {
      const close = '\n' + n + '@';
      const e = text.indexOf(close, i + 3);
      if (e < 0) { bad(`${file}:${line} here-string never closes`); return; }
      line += (text.slice(i, e).match(/\n/g) || []).length; i = e + close.length; continue;
    }
    if (c === "'") { let j = i + 1; while (j < text.length) { if (text[j] === "'" && text[j + 1] === "'") { j += 2; continue; } if (text[j] === "'") break; if (text[j] === '\n') line++; j++; } i = j + 1; continue; }
    if (c === '"') { let j = i + 1; while (j < text.length) { if (text[j] === '`') { j += 2; continue; } if (text[j] === '"' && text[j + 1] === '"') { j += 2; continue; } if (text[j] === '"') break; if (text[j] === '\n') line++; j++; } i = j + 1; continue; }
    if ('([{'.includes(c)) stack.push([c, line]);
    else if (')]}'.includes(c)) {
      const top = stack.pop();
      if (!top || top[0] !== pairs[c]) { bad(`${file}:${line} unexpected '${c}'${top ? ` (open '${top[0]}' from line ${top[1]})` : ''}`); return; }
    }
    i++;
  }
  if (stack.length) { bad(`${file}: '${stack[stack.length - 1][0]}' opened at line ${stack[stack.length - 1][1]} never closes`); return; }
  ok(`${file} brackets balance`);
}

function definedFunctions(file, text) {
  const defined = new Set([...text.matchAll(/^function ([A-Za-z][\w-]*)/gm)].map((m) => m[1]));
  const main = text.slice(text.indexOf('function Main'));
  const called = new Set([...main.matchAll(/^\s+([A-Z][a-z]+-[A-Za-z]+)\b/gm)].map((m) => m[1]));
  const builtin = /^(Write|Read|Get|Set|New|Start|Stop|Test|Join|Remove|Restart|Enable|Disable|Register|Unregister|Add|Select|Sort|Where|Measure|Out|Copy|Invoke|ConvertTo|ConvertFrom)-/;
  const missing = [...called].filter((f) => !defined.has(f) && !builtin.test(f));
  if (missing.length) bad(`${file}: Main calls undefined ${missing.join(', ')}`);
  else ok(`${file}: every function Main calls is defined (${defined.size} functions)`);
}

async function keys() {
  const m = await import(path.join(root, 'studio/assets/tunekey.js'));
  const js = m.checksum('TUNE', 'ABCDEFGHJKLM') + ' ' + m.checksum('SQUAD', 'ABCDEFGHJKLM');
  const py = execFileSync('python3', ['-c', `
import importlib.util,sys
spec=importlib.util.spec_from_file_location('k','${path.join(root, 'tools/make-tune-key.py')}');k=importlib.util.module_from_spec(spec);spec.loader.exec_module(k)
print(k.checksum('TUNE','ABCDEFGHJKLM'),k.checksum('SQUAD','ABCDEFGHJKLM'))`]).toString().trim();
  if (js === py) ok(`key checksum agrees between the browser and the Python tool (${js})`);
  else bad(`key checksum differs: browser ${js}, python ${py}`);
  const order = await m.keyForOrder('tune', 'abc123XYZ');
  const pyOrder = execFileSync('python3', [path.join(root, 'tools/make-tune-key.py'), '--order', 'abc123XYZ']).toString().trim();
  if (m.pretty(order) === pyOrder) ok(`order-derived key agrees (${pyOrder})`);
  else bad(`order-derived key differs: browser ${m.pretty(order)}, python ${pyOrder}`);
}

function config(scriptText) {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'tune/config.json'), 'utf8'));
  const v = /\$script:Version = '([^']+)'/.exec(scriptText)?.[1];
  if (cfg.version === v) ok(`tune/config.json version ${v} matches the script`);
  else bad(`tune/config.json version ${cfg.version} but the script says ${v}`);
  if (typeof cfg.api !== 'string') bad('tune/config.json: api must be a string');
  const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'tune/omnidx.ps1'))).digest('hex');
  if (cfg.sha256 === digest) ok(`tune/config.json sha256 matches the script (${digest.slice(0, 12)})`);
  else bad(`tune/config.json sha256 is stale: run python3 tools/tune-stamp.py`);
}

console.log('OmniDx Tune checks');
const script = ascii('tune/omnidx.ps1');
const go = ascii('go.ps1');
balance('tune/omnidx.ps1', script);
balance('go.ps1', go);
definedFunctions('tune/omnidx.ps1', script);
await keys();
config(script);
console.log(failed ? `${failed} problem(s)` : 'all good');
process.exit(failed ? 1 : 0);
