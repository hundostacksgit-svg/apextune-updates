/*
 * Expressions: a property driven by a formula instead of by hand.
 *
 * The thing After Effects people cannot live without. `wiggle(2, 10)` on a
 * position is a hand-held camera; `loopOut()` on three keys is a bounce that
 * goes on forever; `value * audio()` is a logo that breathes with the music.
 * A keyframe says what a value is at one moment; an expression says what it
 * is at every moment, and the two compose — the expression reads the
 * keyframed value as `value` and can leave it alone, add to it or replace it.
 *
 * This is its own small language, not JavaScript. A project file is data
 * that travels between devices and between people, and running arbitrary
 * script out of one would let a shared project read the account on whoever
 * opened it. So the parser accepts numbers, strings, arithmetic, comparison,
 * a ternary, and calls to the functions listed below — nothing reaches the
 * page. It is parsed once per source text and evaluated as closures, so a
 * frame costs a handful of function calls per expression.
 *
 * Everything is deterministic in `time`. wiggle() is smooth noise seeded by
 * the property it sits on, random() hashes the frame number: scrub backwards
 * and you see the same picture, export and you get the same picture. Nothing
 * here integrates from frame to frame.
 *
 * The evaluation context — what `value`, `time`, `audio()`, `beat`,
 * `layer()` mean — is supplied by whoever calls evaluate(); this file knows
 * nothing about the project so that project.js can import it without a
 * cycle.
 */

/* ------------------------------------------------------------------ */
/* tokens                                                              */
/* ------------------------------------------------------------------ */

const T = { num: 1, str: 2, id: 3, op: 4, end: 5 };
const OPS = ['||', '&&', '==', '!=', '<=', '>=', '**', '+', '-', '*', '/', '%', '^', '<', '>', '!', '?', ':', '(', ')', ',', '.', '[', ']'];

function tokenize(src) {
  const out = [];
  let i = 0;
  const s = String(src);
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === ';') { i++; continue; }
    if ((c >= '0' && c <= '9') || (c === '.' && s[i + 1] >= '0' && s[i + 1] <= '9')) {
      const m = s.slice(i).match(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i);
      out.push({ t: T.num, v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1, v = '';
      while (j < s.length && s[j] !== c) { v += s[j]; j++; }
      if (j >= s.length) throw new Error('A string is missing its closing quote.');
      out.push({ t: T.str, v });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const m = s.slice(i).match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
      out.push({ t: T.id, v: m[0] });
      i += m[0].length;
      continue;
    }
    const op = OPS.find((o) => s.startsWith(o, i));
    if (!op) throw new Error(`Unexpected "${c}".`);
    out.push({ t: T.op, v: op });
    i += op.length;
  }
  out.push({ t: T.end });
  return out;
}

/* ------------------------------------------------------------------ */
/* parsing, straight to closures                                       */
/* ------------------------------------------------------------------ */

/*
 * Each parse function returns a closure (ctx) => value. There is no AST to
 * walk at run time, which is what keeps an expression on every clip in a
 * montage cheap enough to evaluate sixty times a second.
 */
function parse(src) {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const isOp = (v) => toks[p].t === T.op && toks[p].v === v;
  const expect = (v) => { if (!isOp(v)) throw new Error(`Expected "${v}".`); p++; };

  function ternary() {
    const cond = orExpr();
    if (isOp('?')) {
      p++;
      const a = ternary();
      expect(':');
      const b = ternary();
      return (c) => (truthy(cond(c)) ? a(c) : b(c));
    }
    return cond;
  }
  function orExpr() {
    let left = andExpr();
    while (isOp('||')) { p++; const r = andExpr(); const l = left; left = (c) => (truthy(l(c)) ? 1 : (truthy(r(c)) ? 1 : 0)); }
    return left;
  }
  function andExpr() {
    let left = eqExpr();
    while (isOp('&&')) { p++; const r = eqExpr(); const l = left; left = (c) => (truthy(l(c)) && truthy(r(c)) ? 1 : 0); }
    return left;
  }
  function eqExpr() {
    let left = cmpExpr();
    while (isOp('==') || isOp('!=')) {
      const op = next().v; const r = cmpExpr(); const l = left;
      left = op === '==' ? (c) => (l(c) === r(c) ? 1 : 0) : (c) => (l(c) !== r(c) ? 1 : 0);
    }
    return left;
  }
  function cmpExpr() {
    let left = addExpr();
    while (isOp('<') || isOp('>') || isOp('<=') || isOp('>=')) {
      const op = next().v; const r = addExpr(); const l = left;
      left = op === '<' ? (c) => (l(c) < r(c) ? 1 : 0)
        : op === '>' ? (c) => (l(c) > r(c) ? 1 : 0)
          : op === '<=' ? (c) => (l(c) <= r(c) ? 1 : 0)
            : (c) => (l(c) >= r(c) ? 1 : 0);
    }
    return left;
  }
  function addExpr() {
    let left = mulExpr();
    while (isOp('+') || isOp('-')) {
      const op = next().v; const r = mulExpr(); const l = left;
      left = op === '+' ? (c) => l(c) + r(c) : (c) => l(c) - r(c);
    }
    return left;
  }
  function mulExpr() {
    let left = powExpr();
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = next().v; const r = powExpr(); const l = left;
      left = op === '*' ? (c) => l(c) * r(c)
        : op === '/' ? (c) => { const d = r(c); return d === 0 ? 0 : l(c) / d; }
          : (c) => { const d = r(c); return d === 0 ? 0 : l(c) % d; };
    }
    return left;
  }
  function powExpr() {
    const base = unary();
    if (isOp('^') || isOp('**')) { p++; const e = powExpr(); return (c) => base(c) ** e(c); }
    return base;
  }
  function unary() {
    if (isOp('-')) { p++; const v = unary(); return (c) => -v(c); }
    if (isOp('+')) { p++; return unary(); }
    if (isOp('!')) { p++; const v = unary(); return (c) => (truthy(v(c)) ? 0 : 1); }
    return postfix();
  }
  function postfix() {
    let node = primary();
    for (;;) {
      if (isOp('(')) {
        p++;
        const args = [];
        if (!isOp(')')) { args.push(ternary()); while (isOp(',')) { p++; args.push(ternary()); } }
        expect(')');
        const fn = node;
        node = (c) => call(fn(c), args.map((a) => a(c)), c);
        continue;
      }
      if (isOp('.')) {
        p++;
        const tok = next();
        if (tok.t !== T.id) throw new Error('Expected a name after ".".');
        const obj = node; const key = tok.v;
        node = (c) => member(obj(c), key, c);
        continue;
      }
      if (isOp('[')) {
        p++;
        const idx = ternary();
        expect(']');
        const obj = node;
        node = (c) => member(obj(c), idx(c), c);
        continue;
      }
      return node;
    }
  }
  function primary() {
    const tok = next();
    if (tok.t === T.num) { const v = tok.v; return () => v; }
    if (tok.t === T.str) { const v = tok.v; return () => v; }
    if (tok.t === T.id) { const name = tok.v; return (c) => lookup(name, c); }
    if (tok.t === T.op && tok.v === '(') { const inner = ternary(); expect(')'); return inner; }
    if (tok.t === T.op && tok.v === '[') {
      const items = [];
      if (!isOp(']')) { items.push(ternary()); while (isOp(',')) { p++; items.push(ternary()); } }
      expect(']');
      return (c) => items.map((f) => f(c));
    }
    throw new Error(tok.t === T.end ? 'The expression ends too early.' : `Unexpected "${tok.v}".`);
  }

  const body = ternary();
  if (peek().t !== T.end) throw new Error(`Unexpected "${peek().v}" at the end.`);
  return body;
}

const truthy = (v) => v !== 0 && v !== '' && v !== null && v !== undefined && v !== false;

/* ------------------------------------------------------------------ */
/* the vocabulary                                                      */
/* ------------------------------------------------------------------ */

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/* Smooth 1-D value noise in −1..1, continuous in x, seeded. */
function hash1(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function vnoise(x, seed) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash1(i + seed * 57.13) * 2 - 1;
  const b = hash1(i + 1 + seed * 57.13) * 2 - 1;
  return a + (b - a) * u;
}
/* Fractal sum, so wiggle(…, octaves) has the texture people expect. */
function fnoise(x, seed, octaves = 1, mult = 0.5) {
  let v = 0, amp = 1, freq = 1, norm = 0;
  for (let o = 0; o < Math.max(1, Math.min(6, Math.round(octaves))); o++) {
    v += vnoise(x * freq, seed + o * 11) * amp;
    norm += amp;
    amp *= mult; freq *= 2;
  }
  return norm ? v / norm : 0;
}

const easeIO = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const easeIn = (x) => x * x * x;
const easeOut = (x) => 1 - (1 - x) ** 3;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/* linear(t, a, b) or linear(t, tMin, tMax, v1, v2) — After Effects' signatures. */
function ramp(args, fn) {
  const t = num(args[0]);
  if (args.length >= 5) {
    const [, t0, t1, v0, v1] = args.map((a) => num(a));
    const u = t1 === t0 ? 1 : clamp01((t - t0) / (t1 - t0));
    return v0 + (v1 - v0) * fn(u);
  }
  const v0 = num(args[1]), v1 = num(args[2], 1);
  return v0 + (v1 - v0) * fn(clamp01(t));
}

/*
 * The functions. Each receives the evaluated arguments and the context. They
 * are plain and pure; a function that needs the property's keys or the
 * project's audio reads them from the context the caller built.
 */
const FUNCS = {
  wiggle(a, c) {
    const freq = num(a[0], 1), amp = num(a[1], 0), oct = num(a[2], 1), mult = num(a[3], 0.5);
    return c.value + fnoise(c.time * freq, c.seed, oct, mult) * amp;
  },
  /* A wiggle that is zero at time 0 and grows in, for things that must start still. */
  wiggleIn(a, c) {
    const freq = num(a[0], 1), amp = num(a[1], 0), over = num(a[2], 0.5);
    return c.value + fnoise(c.time * freq, c.seed, 1) * amp * clamp01(c.local / Math.max(0.01, over));
  },
  loopOut(a, c) { return loop(a, c, 'out'); },
  loopIn(a, c) { return loop(a, c, 'in'); },
  /* Overshoot after the last key, the classic inertial bounce. */
  inertia(a, c) {
    const amp = num(a[0], 0.1), freq = num(a[1], 2.5), decay = num(a[2], 5);
    const k = c.keys;
    if (!k || !k.times.length) return c.value;
    const last = k.times[k.times.length - 1];
    const dt = c.local - last;
    if (dt <= 0) return c.value;
    const v = k.velocity(last);
    return c.value + (amp * v / Math.max(0.001, freq)) * Math.sin(freq * dt * 2 * Math.PI) / Math.exp(decay * dt);
  },
  linear(a) { return ramp(a, (u) => u); },
  ease(a) { return ramp(a, easeIO); },
  easeIn(a) { return ramp(a, easeIn); },
  easeOut(a) { return ramp(a, easeOut); },
  clamp(a) { const lo = num(a[1]), hi = num(a[2], 1); return Math.max(Math.min(lo, hi), Math.min(Math.max(lo, hi), num(a[0]))); },
  lerp(a) { return num(a[0]) + (num(a[1]) - num(a[0])) * num(a[2]); },
  mix(a) { return num(a[0]) + (num(a[1]) - num(a[0])) * num(a[2]); },
  abs(a) { return Math.abs(num(a[0])); },
  floor(a) { return Math.floor(num(a[0])); },
  ceil(a) { return Math.ceil(num(a[0])); },
  round(a) { return Math.round(num(a[0])); },
  min(a) { return Math.min(...a.map((v) => num(v))); },
  max(a) { return Math.max(...a.map((v) => num(v))); },
  sqrt(a) { return Math.sqrt(Math.max(0, num(a[0]))); },
  pow(a) { return num(a[0]) ** num(a[1], 1); },
  sin(a) { return Math.sin(num(a[0])); },
  cos(a) { return Math.cos(num(a[0])); },
  tan(a) { return Math.tan(num(a[0])); },
  atan2(a) { return Math.atan2(num(a[0]), num(a[1])); },
  exp(a) { return Math.exp(num(a[0])); },
  log(a) { return Math.log(Math.max(1e-9, num(a[0]))); },
  sign(a) { return Math.sign(num(a[0])); },
  mod(a) { const d = num(a[1], 1); return d === 0 ? 0 : ((num(a[0]) % d) + d) % d; },
  degreesToRadians(a) { return (num(a[0]) * Math.PI) / 180; },
  radiansToDegrees(a) { return (num(a[0]) * 180) / Math.PI; },
  /* Per-frame random, so it is the same on the export as under the scrub. */
  random(a, c) {
    const lo = a.length >= 2 ? num(a[0]) : 0;
    const hi = a.length >= 2 ? num(a[1]) : (a.length === 1 ? num(a[0], 1) : 1);
    return lo + (hi - lo) * hash1(Math.floor(c.time * c.fps) * 7.31 + c.seed * 3.7);
  },
  /* Smooth noise, −1..1, for anything wiggle's signature does not fit. */
  noise(a, c) { return fnoise(num(a[0]), c.seed + num(a[1]), num(a[2], 1)); },
  /* The time held to a lower frame rate: value at snap(time, 8) steps eight times a second. */
  posterizeTime(a, c) { const f = Math.max(0.01, num(a[0], 8)); return Math.floor(c.time * f) / f; },
  /* 1 on the beat, decaying to 0 before the next one; 0 without a beat grid. */
  beatPulse(a, c) {
    if (c.beat === null || c.beat === undefined) return 0;
    const decay = num(a[0], 6);
    return Math.exp(-decay * c.beat * (c.beatPeriod || 0.5));
  },
  /* The music's level right now, 0..1: audio(), audio("low"|"mid"|"high"), or a band 0..31. */
  audio(a, c) { return c.audio ? num(c.audio(a[0] ?? 'all', 0)) : 0; },
  /* The same, averaged over the last `seconds`, so it moves without jittering. */
  audioSmooth(a, c) { return c.audio ? num(c.audio(a[0] ?? 'all', num(a[1], 0.12))) : 0; },
  /* Another layer's animated property at this moment, by the layer's name. */
  layer(a, c) { return c.layer ? c.layer(String(a[0] ?? '')) : null; },
  /* The keyed value at another time — for delays and echoes of a move. */
  valueAtTime(a, c) { return c.keys ? c.keys.at(num(a[0], c.local)) : c.value; },
  /* Convenience: 0 until `at`, then 1 — a switch. */
  step(a, c) { return c.local >= num(a[0]) ? 1 : 0; },
  /* A pulse that repeats: 1 at each multiple of `period`, decaying. */
  pulse(a, c) {
    const period = Math.max(0.01, num(a[0], 1)), decay = num(a[1], 6);
    const phase = ((c.local % period) + period) % period;
    return Math.exp(-decay * phase);
  },
};

/* loopOut / loopIn, over the property's own keys. */
function loop(a, c, dir) {
  const mode = String(a[0] ?? 'cycle');
  const k = c.keys;
  if (!k || k.times.length < 2) return c.value;
  const first = k.times[0], last = k.times[k.times.length - 1];
  const span = last - first;
  if (span <= 0) return c.value;
  const t = c.local;
  if (dir === 'out' && t <= last) return c.value;
  if (dir === 'in' && t >= first) return c.value;
  const outside = dir === 'out' ? t - last : first - t;
  const n = Math.floor(outside / span) + 1;
  const within = outside - (n - 1) * span;
  let tt;
  if (mode === 'pingpong') {
    const forward = n % 2 === 1;
    tt = dir === 'out'
      ? (forward ? last - within : first + within)
      : (forward ? first + within : last - within);
  } else if (mode === 'continue') {
    const edge = dir === 'out' ? last : first;
    const v = k.velocity(edge);
    return c.value + v * (dir === 'out' ? outside : -outside);
  } else {
    tt = dir === 'out' ? first + within : last - within;
  }
  let out = k.at(tt);
  if (mode === 'offset') out += n * (k.at(last) - k.at(first)) * (dir === 'out' ? 1 : -1);
  return out;
}

function call(fn, args, c) {
  if (typeof fn === 'function') return fn(args, c);
  throw new Error('That is not a function.');
}

function member(obj, key, c) {
  if (obj === null || obj === undefined) return 0;
  if (Array.isArray(obj)) { const v = obj[Math.floor(num(key))]; return v === undefined ? 0 : v; }
  if (typeof obj === 'object') {
    const v = obj[String(key)];
    if (typeof v === 'function') return (args) => v(args, c);
    return v === undefined ? 0 : v;
  }
  return 0;
}

function lookup(name, c) {
  switch (name) {
    case 'value': return c.value;
    case 'time': return c.time;
    case 'local': return c.local;
    case 'inPoint': return c.inPoint;
    case 'outPoint': return c.outPoint;
    case 'duration': return c.duration;
    case 'index': return c.index;
    case 'fps': return c.fps;
    case 'frame': return Math.floor(c.time * c.fps);
    case 'beat': return c.beat === null || c.beat === undefined ? 0 : c.beat;
    case 'bpm': return c.bpm || 0;
    case 'PI': case 'pi': return Math.PI;
    case 'E': return Math.E;
    case 'true': return 1;
    case 'false': return 0;
    case 'Math': return MATH;
    case 'thisLayer': case 'thisComp': return c.self || {};
    default:
      if (Object.prototype.hasOwnProperty.call(FUNCS, name)) return FUNCS[name];
      throw new Error(`"${name}" is not something an expression knows.`);
  }
}

const MATH = {
  PI: Math.PI, E: Math.E,
  sin: (a) => Math.sin(num(a[0])), cos: (a) => Math.cos(num(a[0])), tan: (a) => Math.tan(num(a[0])),
  abs: (a) => Math.abs(num(a[0])), floor: (a) => Math.floor(num(a[0])), ceil: (a) => Math.ceil(num(a[0])),
  round: (a) => Math.round(num(a[0])), sqrt: (a) => Math.sqrt(Math.max(0, num(a[0]))),
  pow: (a) => num(a[0]) ** num(a[1], 1), min: (a) => Math.min(...a.map((v) => num(v))), max: (a) => Math.max(...a.map((v) => num(v))),
  atan2: (a) => Math.atan2(num(a[0]), num(a[1])), exp: (a) => Math.exp(num(a[0])), log: (a) => Math.log(Math.max(1e-9, num(a[0]))),
};

/* ------------------------------------------------------------------ */
/* the public face                                                     */
/* ------------------------------------------------------------------ */

const cache = new Map();   // source text -> compiled closure, or an Error

/** Parse without evaluating: null when it is fine, or the problem as text. */
export function check(src) {
  try { compile(src); return null; } catch (err) { return err.message; }
}

function compile(src) {
  const key = String(src);
  let fn = cache.get(key);
  if (fn === undefined) {
    try { fn = parse(key); } catch (err) { fn = err; }
    if (cache.size > 2000) cache.clear();
    cache.set(key, fn);
  }
  if (fn instanceof Error) throw fn;
  return fn;
}

/**
 * Evaluate `src` in `ctx`. Returns a finite number, or `ctx.value` when the
 * expression fails — one broken formula must not take the frame down, and
 * the property simply behaving as keyframed is the least surprising failure.
 *
 * ctx: { value, time, local, inPoint, outPoint, duration, index, fps, seed,
 *        keys: { times, at(t), velocity(t) } | null,
 *        beat: 0..1 | null, beatPeriod, bpm,
 *        audio: (band, smooth) => 0..1 | null,
 *        layer: (name) => object | null }
 */
export function evaluate(src, ctx) {
  let fn;
  try { fn = compile(src); } catch { return ctx.value; }
  try {
    const out = fn(ctx);
    if (typeof out === 'number') return Number.isFinite(out) ? out : ctx.value;
    if (typeof out === 'string') { const n = Number(out); return Number.isFinite(n) ? n : ctx.value; }
    if (Array.isArray(out)) { const n = Number(out[0]); return Number.isFinite(n) ? n : ctx.value; }
    return ctx.value;
  } catch {
    return ctx.value;
  }
}

/* A stable seed from a clip id and property name, so two wiggles on two
   layers never move in step and a wiggle stays the same on every open. */
export function seedFor(clipId, prop) {
  let h = 2166136261;
  const s = `${clipId}|${prop}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 100000;
}

/*
 * The presets people reach for, as source text with a name. Each is a
 * complete, working expression for the property it is offered on; the
 * editor shows them as chips so nobody has to remember a signature.
 */
export const PRESETS = [
  { id: 'wiggle', name: 'Wiggle', src: 'wiggle(2, 0.03)', for: ['transform.x', 'transform.y'], note: 'Hand-held drift: twice a second, three percent of the frame.' },
  { id: 'wiggleRot', name: 'Wiggle rotation', src: 'wiggle(1.5, 4)', for: ['transform.rotate'], note: 'A gentle sway of four degrees.' },
  { id: 'wiggleScale', name: 'Breathing scale', src: 'value + sin(time * 2) * 0.03', for: ['transform.scale'], note: 'Slow breathing, three percent in and out.' },
  { id: 'loop', name: 'Loop the keys', src: 'loopOut("cycle")', for: null, note: 'After the last key, the animation starts again from the first.' },
  { id: 'pingpong', name: 'Ping-pong the keys', src: 'loopOut("pingpong")', for: null, note: 'After the last key, it plays back to the first, and so on.' },
  { id: 'offset', name: 'Loop and climb', src: 'loopOut("offset")', for: null, note: 'Each loop starts where the last one ended — a rotation that keeps turning.' },
  { id: 'inertia', name: 'Overshoot and settle', src: 'inertia(0.12, 2.5, 5)', for: null, note: 'After the last key, it overshoots and bounces to rest.' },
  { id: 'beat', name: 'Pop on the beat', src: 'value + beatPulse(8) * 0.12', for: ['transform.scale'], note: 'Jumps twelve percent on every beat of the music and relaxes.' },
  { id: 'beatOpacity', name: 'Flash on the beat', src: 'value * (0.6 + beatPulse(10) * 0.4)', for: ['transform.opacity'], note: 'Brightens on the beat.' },
  { id: 'audio', name: 'Scale with the music', src: 'value + audioSmooth("all", 0.08) * 0.25', for: ['transform.scale'], note: 'Grows with the level of the sound.' },
  { id: 'audioBass', name: 'Kick with the bass', src: 'value + audio("low") * 0.2', for: ['transform.scale'], note: 'Reacts to the low end only.' },
  { id: 'audioRot', name: 'Tilt with the music', src: 'value + (audio("mid") - 0.4) * 12', for: ['transform.rotate'], note: 'Leans with the mids.' },
  { id: 'spin', name: 'Spin forever', src: 'value + time * 90', for: ['transform.rotate'], note: 'A quarter turn a second, without a single key.' },
  { id: 'drift', name: 'Drift right', src: 'value + local * 0.02', for: ['transform.x'], note: 'Two percent of the frame a second.' },
  { id: 'fadeInOut', name: 'Fade in and out', src: 'min(ease(local, 0, 0.5, 0, 1), ease(local, duration - 0.5, duration, 1, 0))', for: ['transform.opacity'], note: 'Half a second at each end, no keys.' },
  { id: 'blink', name: 'Blink', src: 'value * (mod(local, 0.6) < 0.3 ? 1 : 0.15)', for: ['transform.opacity'], note: 'On and off, a little under twice a second.' },
  { id: 'stutter', name: 'Stop-motion', src: 'valueAtTime(posterizeTime(8) - inPoint)', for: null, note: 'The animation holds eight times a second, like stop motion.' },
  { id: 'shakeDecay', name: 'Shake and settle', src: 'value + noise(local * 25) * 0.05 * exp(-local * 3)', for: ['transform.x', 'transform.y'], note: 'A hit that shakes hard and dies away over a second.' },
];

export function presetsFor(prop) {
  return PRESETS.filter((p) => !p.for || p.for.includes(prop));
}
