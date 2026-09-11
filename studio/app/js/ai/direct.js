/*
 * Understanding a specific instruction, offline.
 *
 * There are two brains behind the assistant. When a Worker is configured the
 * request goes to a real language model, which understands anything; this is
 * the other one, and it runs on the device with no network at all.
 *
 * It used to only recognise whole styles — "make it an anime edit" — so a
 * sentence like "mute the third clip and slow the last one to half speed" fell
 * through to a generic template. That is the thing that made the assistant
 * feel like it could only follow premade lines.
 *
 * This file does not try to be a language model. It does one thing a language
 * model does not need to be asked for: it recognises *direct instructions* —
 * a verb, a target, and a value — and turns them into the exact operations
 * apply.js runs. Between them they cover what people actually type.
 *
 * Where it cannot work out what somebody meant, it says so and hands over,
 * rather than guessing. A wrong edit applied confidently is worse than an
 * honest "I did not follow that".
 */

/* ------------------------------------------------------------------ *
 * Which clips
 * ------------------------------------------------------------------ */

const ORDINALS = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6,
  seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5,
};

/**
 * Pull a target out of a phrase.
 *
 * Returns undefined when nothing was named, which means "all" — "add grain"
 * with no target is a whole-timeline instruction and should stay one.
 */
export function parseTarget(text) {
  const s = ` ${String(text || '').toLowerCase()} `;

  if (/\b(this|the selected|selected|these)\s+(clip|one|shot|clips|ones|shots)\b/.test(s)) return 'selected';
  if (/\b(every|all|each)\s+(clip|shot|one)\b|\bto (all|everything)\b|\bthe whole (thing|timeline|video)\b/.test(s)) return 'all';
  if (/\b(last|final|ending)\s+(clip|shot|one)\b/.test(s)) return 'last';
  if (/\b(first|opening|starting)\s+(clip|shot|one)\b/.test(s)) return 'first';
  if (/\bevery other\b|\balternate\b/.test(s)) return 'odd';

  // "the last two", "the first three"
  const many = s.match(/\b(last|first)\s+(\d+|two|three|four|five)\s+(clips|shots|ones)\b/);
  if (many) {
    const words = { two: 2, three: 3, four: 4, five: 5 };
    const n = Number(many[2]) || words[many[2]] || 2;
    return many[1] === 'first' ? `1-${n}` : { tail: n };
  }

  // "clips 2 to 5", "clips 2-5"
  const range = s.match(/\bclips?\s+(\d+)\s*(?:-|–|to|through|thru)\s*(\d+)\b/);
  if (range) return `${range[1]}-${range[2]}`;

  // "clip 3", "shot 3", "the 3rd clip", "the third one"
  const numbered = s.match(/\b(?:clip|shot)\s+(\d+)\b/) || s.match(/\bnumber\s+(\d+)\b/);
  if (numbered) return Number(numbered[1]);

  for (const [word, n] of Object.entries(ORDINALS)) {
    if (new RegExp(`\\b${word}\\s+(clip|shot|one)\\b`).test(s)) return n;
  }

  // "from 3 to 8 seconds", "between 2s and 5s", "the first 10 seconds"
  const span = s.match(/\b(?:from|between)\s+([\d.]+)\s*s?\s*(?:to|and|-|–)\s*([\d.]+)\s*s(?:ec|econds)?\b/);
  if (span) return { from: Number(span[1]), to: Number(span[2]) };
  const head = s.match(/\bfirst\s+([\d.]+)\s*s(?:ec|econds)?\b/);
  if (head) return { from: 0, to: Number(head[1]) };
  const after = s.match(/\bafter\s+([\d.]+)\s*s(?:ec|econds)?\b/);
  if (after) return { from: Number(after[1]), to: Infinity };

  return undefined;
}

/* ------------------------------------------------------------------ *
 * Numbers
 * ------------------------------------------------------------------ */

const NUMBER_WORDS = {
  half: 0.5, double: 2, twice: 2, triple: 3, quarter: 0.25,
  one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10,
};

/** A multiplier from "2x", "half speed", "0.5", "double". */
function parseMultiplier(s) {
  const x = s.match(/\b([\d.]+)\s*(?:x|times)\b/);
  if (x) return Number(x[1]);
  const pct = s.match(/\b([\d.]+)\s*%/);
  if (pct) return Number(pct[1]) / 100;
  for (const [word, v] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(s)) return v;
  }
  const plain = s.match(/\b([\d.]+)\s*(?:speed)?\b/);
  if (plain && Number(plain[1]) > 0 && Number(plain[1]) <= 10) return Number(plain[1]);
  return null;
}

/** Seconds from "2 seconds", "1.5s", "half a second". */
function parseSeconds(s) {
  const m = s.match(/\b([\d.]+)\s*s(?:ec|ecs|econd|econds)?\b/);
  if (m) return Number(m[1]);
  if (/\bhalf a second\b/.test(s)) return 0.5;
  return null;
}

/* ------------------------------------------------------------------ *
 * The instructions
 * ------------------------------------------------------------------ */

/*
 * Each rule is a phrasing, and what it means.
 *
 * Ordered most specific first, because "make it black and white" and "make it
 * faster" both start with "make it" and the first match wins. A rule returns
 * the step it produces, or null if the sentence matched its verb but not
 * enough to act on — which is how "speed it up" (to what?) asks instead of
 * guessing a number.
 */
const RULES = [
  {
    id: 'mute',
    test: (s) => /\b(mute|silence|kill the (audio|sound))\b/.test(s) && !/\bun-?mute\b/.test(s),
    build: (s, target) => ({ op: 'setVolume', args: { target, mute: true },
      label: `Mute ${describe(target)}`, detail: 'The picture stays; the sound goes.' }),
  },
  {
    id: 'unmute',
    test: (s) => /\bun-?mute\b|\bbring the (sound|audio) back\b/.test(s),
    build: (s, target) => ({ op: 'setVolume', args: { target, mute: false },
      label: `Unmute ${describe(target)}`, detail: 'Sound back on.' }),
  },
  {
    id: 'volume',
    test: (s) => /\b(volume|louder|quieter|turn it (up|down))\b/.test(s),
    build: (s, target) => {
      let v = null;
      const pct = s.match(/\b([\d.]+)\s*%/);
      if (pct) v = Number(pct[1]) / 100;
      else if (/\blouder|turn it up\b/.test(s)) v = 1.4;
      else if (/\bquieter|turn it down\b/.test(s)) v = 0.6;
      if (v === null) return null;
      return { op: 'setVolume', args: { target, volume: v },
        label: `Volume to ${Math.round(v * 100)}% on ${describe(target)}`, detail: '' };
    },
  },
  {
    id: 'speed',
    test: (s) => /\b(speed|slow|fast|faster|slower|slo-?mo|slow motion)\b/.test(s),
    build: (s, target) => {
      let v = parseMultiplier(s);
      if (v === null) {
        if (/\bslow(er)?\b|\bslo-?mo\b|\bslow motion\b/.test(s)) v = 0.5;
        else if (/\bfast(er)?\b|\bspeed it up\b/.test(s)) v = 2;
      }
      if (!v) return null;
      // "slow it down 2x" means half speed, not double.
      if (/\bslow/.test(s) && v > 1) v = 1 / v;
      return { op: 'setClipSpeed', args: { target, speed: v },
        label: `${v}× on ${describe(target)}`,
        detail: v < 1 ? 'Longer on the timeline, because the shot now takes more time.'
          : 'Shorter on the timeline, and everything after it moves up.' };
    },
  },
  {
    id: 'blackwhite',
    test: (s) => /\bblack and white\b|\bb\s*&\s*w\b|\bgreyscale\b|\bgrayscale\b|\bmonochrome\b|\bdesaturat/.test(s),
    build: (s, target) => ({ op: 'setColor', args: { target, saturation: -100 },
      label: `Black and white on ${describe(target)}`, detail: 'Saturation all the way down.' }),
  },
  {
    id: 'brightness',
    test: (s) => /\b(bright(er|en)?|dark(er|en)?|expos)/.test(s),
    build: (s, target) => {
      const up = /\bbright/.test(s);
      const amt = Number((s.match(/\b(\d+)\s*%/) || [])[1]);
      const v = (amt ? Math.min(100, amt) : 25) * (up ? 1 : -1);
      return { op: 'setColor', args: { target, exposure: v },
        label: `${up ? 'Brighter' : 'Darker'} on ${describe(target)}`, detail: `Exposure ${v > 0 ? '+' : ''}${v}.` };
    },
  },
  {
    id: 'saturation',
    test: (s) => /\b(saturat|more colou?r|less colou?r|vivid|punchy colou?r)/.test(s),
    build: (s, target) => {
      const down = /\bless|de-?satur/.test(s);
      return { op: 'setColor', args: { target, saturation: down ? -40 : 35 },
        label: `${down ? 'Less' : 'More'} colour on ${describe(target)}`, detail: '' };
    },
  },
  {
    id: 'contrast',
    test: (s) => /\bcontrast\b|\bflat(ter)?\b|\bpunchy\b/.test(s),
    build: (s, target) => {
      const down = /\bless contrast|flat/.test(s);
      return { op: 'setColor', args: { target, contrast: down ? -30 : 35 },
        label: `${down ? 'Less' : 'More'} contrast on ${describe(target)}`, detail: '' };
    },
  },
  {
    id: 'warmth',
    test: (s) => /\b(warm|cool|cold|orange|blue)(er)?\b.*\b(it|clip|shot|look|grade|tone)\b|\bwarm(er|th)\b|\bcool(er)\b/.test(s),
    build: (s, target) => {
      const warm = /\bwarm|orange\b/.test(s);
      return { op: 'setColor', args: { target, temperature: warm ? 30 : -30 },
        label: `${warm ? 'Warmer' : 'Cooler'} on ${describe(target)}`, detail: '' };
    },
  },
  {
    id: 'delete',
    // Plurals matter here. \bclip\b does not match "clips" — there is no word
    // boundary between the p and the s — so "delete the last two clips", the
    // most natural way to say it, matched nothing at all.
    test: (s) => /\b(delete|remove|get rid of|cut out|drop)\b.*\b(clips?|shots?|ones?|it|them)\b/.test(s),
    build: (s, target) => {
      if (target === undefined) return null;      // "delete it" — delete what?
      return { op: 'deleteClips', args: { target },
        label: `Remove ${describe(target)}`, detail: 'The gap closes behind it.' };
    },
  },
  {
    id: 'trim',
    test: (s) => /\b(trim|shorten|make .* (\d|two|three) seconds?|cut .* (down|to))\b/.test(s),
    build: (s, target) => {
      const secs = parseSeconds(s);
      if (!secs) return null;
      return { op: 'trimClips', args: { target, dur: secs },
        label: `${secs}s on ${describe(target)}`, detail: 'Everything after it moves up.' };
    },
  },
  {
    id: 'zoom',
    test: (s) => /\b(zoom|scale|bigger|smaller|punch in)\b/.test(s),
    build: (s, target) => {
      let v = parseMultiplier(s);
      if (v === null) v = /\bout|smaller\b/.test(s) ? 0.8 : 1.25;
      return { op: 'setTransform', args: { target, scale: v },
        label: `Scale ${v}× on ${describe(target)}`, detail: '' };
    },
  },
  {
    id: 'opacity',
    test: (s) => /\b(opacity|transparen|fade it|see-?through)\b/.test(s),
    build: (s, target) => {
      const pct = s.match(/\b([\d.]+)\s*%/);
      const v = pct ? Number(pct[1]) / 100 : /\bhalf\b/.test(s) ? 0.5 : 0.6;
      return { op: 'setTransform', args: { target, opacity: v },
        label: `${Math.round(v * 100)}% opacity on ${describe(target)}`, detail: '' };
    },
  },
  {
    id: 'fade',
    test: (s) => /\bfade (in|out|both)?\b/.test(s),
    build: (s, target) => {
      const secs = parseSeconds(s) || 0.5;
      const args = { target };
      if (/\bfade in\b/.test(s)) args.fadeIn = secs;
      else if (/\bfade out\b/.test(s)) args.fadeOut = secs;
      else { args.fadeIn = secs; args.fadeOut = secs; }
      return { op: 'setVolume', args,
        label: `Fade on ${describe(target)}`, detail: `${secs}s.` };
    },
  },
  {
    id: 'clearEffects',
    test: (s) => /\b(remove|take off|clear|get rid of)\b.*\b(effects?|filters?)\b/.test(s),
    build: (s, target) => ({ op: 'removeEffect', args: { target },
      label: `Clear effects on ${describe(target)}`, detail: '' }),
  },
  {
    id: 'reverseOrder',
    test: (s) => /\breverse the order\b|\bbackwards order\b|\bflip the order\b/.test(s),
    build: () => ({ op: 'reorderClips', args: { order: 'reverse' },
      label: 'Reverse the order of the clips', detail: '' }),
  },
];

function describe(target) {
  if (target === undefined || target === 'all') return 'every clip';
  if (target === 'selected') return 'the selected clips';
  if (target === 'first') return 'the first clip';
  if (target === 'last') return 'the last clip';
  if (target === 'odd') return 'every other clip';
  if (typeof target === 'number') return `clip ${target}`;
  if (typeof target === 'string') return `clips ${target}`;
  if (target && target.tail) return `the last ${target.tail} clips`;
  if (target && typeof target === 'object') return `${target.from}s to ${target.to}s`;
  return 'the clips';
}

/* ------------------------------------------------------------------ *
 * Reading a whole request
 * ------------------------------------------------------------------ */

/**
 * Split on the joins people actually use, so one sentence can carry several
 * instructions: "mute clip 2 and slow the last one down".
 *
 * Deliberately conservative — splitting on every comma would tear "warm, punchy
 * grade" in half. Only "and then", " and ", ", then" and full stops count.
 */
function clauses(text) {
  return String(text || '')
    /*
     * The verb list is what stops "warm and punchy" being torn in half.
     *
     * A clause only splits when what follows it opens with something that
     * looks like a new instruction. Splitting on every "and" would turn one
     * description into two fragments and report the second as unfollowed;
     * splitting on none of them would swallow a genuine second instruction
     * without saying so.
     */
    .split(/\band then\b|\.\s+|;\s*|,\s*then\b|\s+and\s+(?=(?:make|mute|un-?mute|slow|speed|delete|remove|get rid|trim|shorten|cut|zoom|scale|fade|add|put|give|apply|throw|do|turn|set|reverse|bright|dark|clear)\b)/i)
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * Turn a request into steps, when it is made of direct instructions.
 *
 * Returns null when nothing was recognised, so the caller can fall through to
 * the style planner. Returns `{ steps, unhandled }` otherwise — `unhandled`
 * lists the clauses it could not read, which the panel shows rather than
 * pretending the whole request landed.
 */
export function readInstructions(text, { clipCount = 0 } = {}) {
  const parts = clauses(text);
  if (!parts.length) return null;

  const steps = [];
  const unhandled = [];

  for (const part of parts) {
    const s = part.toLowerCase();
    let target = parseTarget(s);

    // "the last two" needs to know how many there are to become real indices.
    if (target && typeof target === 'object' && target.tail) {
      target = clipCount ? `${Math.max(1, clipCount - target.tail + 1)}-${clipCount}` : 'last';
    }

    const rule = RULES.find((r) => r.test(s));
    if (!rule) { unhandled.push(part); continue; }

    const step = rule.build(s, target);
    if (!step) { unhandled.push(part); continue; }

    if (step.args?.order === 'reverse') {
      step.args.order = Array.from({ length: clipCount }, (_, i) => clipCount - i);
    }
    steps.push(step);
  }

  if (!steps.length) return null;
  return { steps, unhandled };
}
