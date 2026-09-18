#!/usr/bin/env node
/*
 * Run the on-device planner through a bank of requests and say what it made
 * of each one.
 *
 *   node tools/ai/bench.mjs                 # every prompt, a line each, then the failures
 *   node tools/ai/bench.mjs --full          # every prompt with its whole plan
 *   node tools/ai/bench.mjs --grep mute     # only prompts containing "mute"
 *   node tools/ai/bench.mjs --report FILE   # write the full listing to FILE
 *
 * The bank is tools/ai/prompts.mjs: hundreds of things people actually type
 * — direct instructions, whole briefs, vague asks, slang, typos, questions
 * about the app, other languages, nonsense — each against a described
 * project (an empty timeline, an edited one, a folder of photos, a talking
 * head, nothing imported). A prompt can carry expectations; those are the
 * regression tests, and the exit code is the number that fail.
 *
 * Nothing here touches a browser: planner.js runs in Node as it is, which is
 * the point of it being a pure function of words and a description.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { plan } from '../../studio/app/js/ai/planner.js';
import { PROMPTS, CONTEXTS } from './prompts.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const FULL = args.includes('--full');
const GREP = opt('grep', null);
const REPORT = opt('report', null);

const here = path.dirname(fileURLToPath(import.meta.url));
void here;

/* One line per step: the operation and the arguments that matter. */
function stepLine(s) {
  const a = s.args || {};
  const bits = [];
  for (const k of ['target', 'ratio', 'targetDur', 'every', 'speed', 'look', 'effect', 'preset', 'style', 'type', 'content', 'mute', 'volume', 'saturation', 'exposure', 'scale', 'opacity', 'dur', 'what', 'order', 'rotate', 'at', 'fadeIn', 'fadeOut', 'clipLength', 'section', 'ramp', 'kind', 'value']) {
    if (a[k] !== undefined && a[k] !== null) bits.push(`${k}=${typeof a[k] === 'object' ? JSON.stringify(a[k]) : String(a[k]).slice(0, 28)}`);
  }
  return `${s.op}(${bits.join(' ')})`;
}

/*
 * Expectations, one string each:
 *   op:addTitle        a step with that operation exists
 *   !op:layout         no step with that operation
 *   only:setVolume     every step is that operation
 *   steps:0            exactly that many steps
 *   answer             the plan carries an answer (a reply, not an edit)
 *   !answer            it does not
 *   source:direct      the plan's source id
 *   warn:/regex/       a warning matching
 *   question           at least one question
 *   arg:op.key=value   a step's argument equals value (string compare)
 *   ratio:9:16         a setRatio step to that ratio
 */
function check(want, out) {
  const ops = out.steps.map((s) => s.op);
  const src = typeof out.source === 'string' ? out.source : out.source?.id || (out.template ? 'template' : 'generic');
  if (want === 'answer') return Boolean(out.answer);
  if (want === '!answer') return !out.answer;
  if (want === 'question') return (out.questions || []).length > 0;
  if (want.startsWith('op:')) return ops.includes(want.slice(3));
  if (want.startsWith('!op:')) return !ops.includes(want.slice(4));
  if (want.startsWith('only:')) return ops.length > 0 && ops.every((o) => o === want.slice(5));
  if (want.startsWith('steps:')) return ops.length === Number(want.slice(6));
  if (want.startsWith('source:')) return src === want.slice(7);
  if (want.startsWith('warn:')) {
    const m = want.match(/^warn:\/(.*)\/[a-z]*$/);
    return (out.warnings || []).some((w) => new RegExp(m ? m[1] : want.slice(5), 'i').test(w));
  }
  if (want.startsWith('ratio:')) return out.steps.some((s) => s.op === 'setRatio' && s.args?.ratio === want.slice(6));
  /* dur:20 — whichever step builds the timeline is asked for that length */
  if (want.startsWith('dur:')) return out.steps.some((s) => ['layout', 'beatCut', 'structuredCut', 'fitDuration'].includes(s.op) && String(s.args?.targetDur ?? s.args?.seconds) === want.slice(4));
  if (want.startsWith('arg:')) {
    const m = want.slice(4).match(/^(\w+)\.(\w+)=(.*)$/);
    if (!m) return false;
    return out.steps.some((s) => s.op === m[1] && String(s.args?.[m[2]]) === m[3]);
  }
  throw new Error(`unknown expectation ${want}`);
}

let failures = 0;
let total = 0;
const lines = [];
const failed = [];

for (const item of PROMPTS) {
  const p = typeof item === 'string' ? { p: item } : item;
  if (GREP && !p.p.toLowerCase().includes(GREP.toLowerCase())) continue;
  const ctxName = p.c || 'fresh';
  const ctx = CONTEXTS[ctxName];
  if (!ctx) throw new Error(`no context ${ctxName}`);
  total++;

  let out;
  try {
    out = plan(p.p, ctx);
  } catch (err) {
    out = { steps: [], warnings: [`THREW: ${err.message}`], questions: [], summary: 'threw', source: 'threw' };
  }
  const src = typeof out.source === 'string' ? out.source : out.source?.id || (out.template ? `template:${out.template.id}` : 'generic');
  const wants = p.want || [];
  const bad = wants.filter((w) => !check(w, out));
  if (bad.length) { failures++; failed.push({ p, bad, out }); }

  const head = `${bad.length ? '✗' : '·'} [${ctxName}] ${JSON.stringify(p.p.length > 90 ? `${p.p.slice(0, 87)}…` : p.p)}`;
  const body = [
    `    ${src} — ${out.summary || ''}`,
    ...(out.answer ? [`    answer: ${String(out.answer).replace(/\s+/g, ' ').slice(0, 220)}`] : []),
    ...out.steps.map((s) => `    - ${stepLine(s)}`),
    ...(out.questions || []).map((q) => `    ? ${q}`),
    ...(out.warnings || []).map((w) => `    ! ${w}`),
    ...(bad.length ? [`    EXPECTED ${bad.join(', ')}`] : []),
  ];
  lines.push(head, ...body, '');
  if (FULL || bad.length) console.log([head, ...body].join('\n'));
  else console.log(`${head}  →  ${src}: ${out.steps.map((s) => s.op).join(', ') || (out.answer ? 'answer' : 'nothing')}`);
}

if (REPORT) fs.writeFileSync(REPORT, lines.join('\n'));
console.log(`\n${total} prompts, ${failures} failed expectations${REPORT ? `, full listing in ${REPORT}` : ''}`);
process.exit(failures ? 1 : 0);
