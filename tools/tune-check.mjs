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
 * version matches the script's; every kind of change the script records has
 * a handler in the undo script; every control the window code touches is in
 * the XAML and in the FindName list; every flag the bootstrapper passes is a
 * switch the script declares.
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
  const page = fs.readFileSync(path.join(root, 'studio/activate/activate.js'), 'utf8');
  if (/keyForOrder|makeKey\(/.test(page) || /keyForOrder/.test(fs.readFileSync(path.join(root, 'studio/assets/tunekey.js'), 'utf8'))) bad('the key page must never make a key itself; only the licence server issues keys');
  else ok('the key page makes no keys of its own');
}

/* The copy the Windows check published, when there is one: go.ps1 fetches
   that copy and checks it against the hash next to it, so the two files must
   agree, and the script must be the plain ASCII, LF-only text the hash was
   taken over. */
function verified() {
  const vp = path.join(root, 'tune/verified.json');
  const sp = path.join(root, 'tune/verified.ps1');
  if (!fs.existsSync(vp) && !fs.existsSync(sp)) { ok('no verified copy published yet: go.ps1 fetches the newest script until the Windows check publishes one'); return; }
  if (!fs.existsSync(vp) || !fs.existsSync(sp)) { bad('tune/verified.json and tune/verified.ps1 must exist together'); return; }
  const v = JSON.parse(fs.readFileSync(vp, 'utf8'));
  const bytes = fs.readFileSync(sp);
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  if (v.sha256 === digest) ok(`tune/verified.json sha256 matches tune/verified.ps1 (v${v.version}, checked ${v.when}, commit ${v.sha})`);
  else bad('tune/verified.json sha256 does not match tune/verified.ps1');
  const text = bytes.toString('latin1');
  if (/[^\x00-\x7f]/.test(text)) bad('tune/verified.ps1 is not ASCII');
  if (text.includes('\r')) bad('tune/verified.ps1 has CR line endings; the hash must be over LF text');
  if (!/function Main/.test(text)) bad('tune/verified.ps1 does not look like the tune');
}

/* Out-String wraps at the console width, and a check that reads its output
   then depends on the build machine's CPU name; every capture in the Windows
   check reads at full width. */
/* Every public page is in the sitemap and every private one is kept out of search; a page added
   to the site's builder that nobody added to sitemap.xml would otherwise be published unlisted. */
function sitemapAgrees() {
  const at = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  const site = at('sitemap.xml');
  const robots = at('robots.txt');
  const builder = at('tools/build-site.py');
  const pages = [...builder.matchAll(/^\s+'([a-z-]*\/?)index\.html': /gm)].map((m) => m[1]);
  const missing = pages.filter((p) => !['account/'].includes(p) && !site.includes(`<loc>https://omnidx.net/studio/${p}</loc>`));
  if (missing.length) bad(`sitemap.xml is missing ${missing.map((p) => 'studio/' + p).join(', ')}`);
  else ok(`sitemap.xml lists every public page the builder writes (${pages.length - 1})`);
  const hidden = ['activate', 'account', 'admin'].filter((p) => !robots.includes(`Disallow: /studio/${p}/`));
  if (hidden.length) bad(`robots.txt no longer keeps ${hidden.join(', ')} out of search`);
  else ok('robots.txt keeps the key page, the account page and the owner page out of search');
}

function workflowWidth() {
  const wf = fs.readFileSync(path.join(root, '.github/workflows/tune-check.yml'), 'utf8');
  const bare = wf.split('\n').filter((l) => /\| Out-String\s*$/.test(l));
  if (bare.length) bad(`tune-check.yml: ${bare.length} Out-String without -Width (a long line would wrap and fail a check): ${bare[0].trim()}`);
  else ok('tune-check.yml reads every captured output at full width');
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

/* A change the script records with no undo handler would be a change nobody
   can put back. The undo script is the here-string $script:UndoScript; the
   record types come from every Record @{ type = '...' } outside it. */
function undoCovers(file, text) {
  const start = text.indexOf("$script:UndoScript = @'");
  const end = text.indexOf("\n'@", start);
  const undo = text.slice(start, end);
  const outside = text.slice(0, start) + text.slice(end);
  const types = new Set([...outside.matchAll(/Record @\{ type = '([a-z-]+)'/g)].map((m) => m[1]));
  const missing = [...types].filter((t) => !new RegExp(`^\\s+'${t}' \\{`, 'm').test(undo));
  if (missing.length) bad(`${file}: undo.ps1 has no handler for recorded type(s) ${missing.join(', ')}`);
  else ok(`${file}: undo.ps1 handles every recorded change type (${[...types].sort().join(' ')})`);
}

/* The window: every x:Name in the XAML is looked up, and every $ui.Name the
   code uses exists in the XAML. A typo here only shows when a real person
   clicks. */
function windowNames(file, text) {
  const start = text.indexOf("$script:Xaml = @'");
  const end = text.indexOf("\n'@", start);
  const xaml = text.slice(start, end);
  // Lower-case names are template parts (the button's border), not controls.
  const named = new Set([...xaml.matchAll(/x:Name="([A-Z][A-Za-z]+)"/g)].map((m) => m[1]));
  const gui = text.slice(text.indexOf('function Show-Gui'), text.indexOf('function Get-ProcessCount'));
  const lookedUp = new Set([...gui.matchAll(/'([A-Z][A-Za-z]+)'/g)].map((m) => m[1]).filter((n) => named.has(n)));
  const used = new Set([...gui.matchAll(/\$ui\.([A-Za-z]+)/g)].map((m) => m[1]));
  const notLookedUp = [...named].filter((n) => !lookedUp.has(n));
  const notInXaml = [...used].filter((n) => !named.has(n));
  if (notLookedUp.length) bad(`${file}: XAML names never looked up: ${notLookedUp.join(', ')}`);
  if (notInXaml.length) bad(`${file}: window code uses controls the XAML does not have: ${notInXaml.join(', ')}`);
  if (!notLookedUp.length && !notInXaml.length) ok(`${file}: the window's ${named.size} named controls are all looked up and all exist`);
}

/* go.ps1 passes flags through by name; each must be a switch the script has. */
function flags(scriptText, goText) {
  const m = /\^\(([A-Za-z|]+)\)\$/.exec(goText);
  const names = m ? m[1].split('|') : [];
  const switches = new Set([...scriptText.matchAll(/\[switch\]\$([A-Za-z]+)/g)].map((x) => x[1]));
  const missing = names.filter((n) => !switches.has(n));
  if (!names.length) bad('go.ps1: could not find the flag list');
  else if (missing.length) bad(`go.ps1 passes flags the script does not declare: ${missing.join(', ')}`);
  else ok(`go.ps1's ${names.length} flags are all switches the script declares`);
  const modes = new Set([...goText.matchAll(/^\s+'([a-z]+)'\s+\{ & \$block/gm)].map((x) => x[1]));
  for (const mode of ['undo', 'undolast', 'report', 'status', 'check', 'support', 'app', 'extreme']) if (!modes.has(mode)) bad(`go.ps1: mode '${mode}' is not handled`);
  ok(`go.ps1 handles modes ${[...modes].join(' ')}`);
}

/* The changelog's newest entry must be the version being shipped, and the
   site's game count must be the script's. */
function siteAgrees(scriptText) {
  const v = /\$script:Version = '([^']+)'/.exec(scriptText)?.[1];
  const log = fs.readFileSync(path.join(root, 'studio/changelog/index.html'), 'utf8');
  const top = /class="eyebrow"[^>]*>v(\d+\.\d+\.\d+)/.exec(log)?.[1];
  if (top === v) ok(`the changelog's newest entry is v${v}`);
  else bad(`the changelog's newest entry is v${top} but the script is v${v}: add an entry`);
  const gamesBlock = scriptText.slice(scriptText.indexOf('$script:Games = @('), scriptText.indexOf('function Get-GameRoots'));
  const inScript = [...gamesBlock.matchAll(/@\{ name = '/g)].length;
  const cfg = fs.readFileSync(path.join(root, 'studio/assets/config.js'), 'utf8');
  const gamesJs = /games: \[([\s\S]*?)\]/.exec(cfg)?.[1] || '';
  const onSite = [...gamesJs.matchAll(/'[^']+'/g)].length;
  if (inScript === onSite) ok(`${inScript} game profiles in the script, ${onSite} on the site`);
  else bad(`${inScript} game profiles in the script but ${onSite} on the site (studio/assets/config.js)`);
  for (const page of ['studio/index.html', 'studio/pricing/index.html']) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    for (const m of html.matchAll(/data-games>(\d+)</g)) if (Number(m[1]) !== inScript) bad(`${page} says ${m[1]} games; the script has ${inScript}`);
  }
}

console.log('OmniDx Tune checks');
const script = ascii('tune/omnidx.ps1');
const go = ascii('go.ps1');
balance('tune/omnidx.ps1', script);
balance('go.ps1', go);
balance('edition.ps1', ascii('edition.ps1'));
definedFunctions('tune/omnidx.ps1', script);
undoCovers('tune/omnidx.ps1', script);
windowNames('tune/omnidx.ps1', script);
flags(script, go);
siteAgrees(script);
await keys();
config(script);
verified();
workflowWidth();
sitemapAgrees();
console.log(failed ? `${failed} problem(s)` : 'all good');
process.exit(failed ? 1 : 0);
