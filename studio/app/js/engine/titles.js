/*
 * Text, titles and captions.
 *
 * All of it renders straight to canvas, which means what you see in the viewer
 * is literally what the exporter draws — no separate text engine to disagree
 * with the preview. Word wrapping, stroke, shadow and the per-word animations
 * are all here.
 */

import { WEB_FONTS } from './fonts-library.js';

/*
 * The six system stacks stay at the top of the list and keep their ids.
 *
 * They are the ones that need no network and never fail, so they stay the
 * defaults and the fallbacks — and projects already reference them by id, so
 * renaming or reordering them would change what existing work looks like.
 */
export const SYSTEM_FONTS = [
  { id: 'sans',    name: 'Inter / system',  group: 'On this device', stack: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,system-ui,sans-serif' },
  { id: 'impact',  name: 'Impact',          group: 'On this device', stack: 'Impact,"Haettenschweiler","Arial Narrow Bold",sans-serif' },
  { id: 'serif',   name: 'Serif',           group: 'On this device', stack: 'Georgia,"Times New Roman",serif' },
  { id: 'mono',    name: 'Mono',            group: 'On this device', stack: 'ui-monospace,"SF Mono",Menlo,Consolas,monospace' },
  { id: 'rounded', name: 'Rounded',         group: 'On this device', stack: '"SF Pro Rounded","Segoe UI",Verdana,sans-serif' },
  { id: 'cond',    name: 'Condensed',       group: 'On this device', stack: '"Arial Narrow","Helvetica Neue",sans-serif' },
];

export const FONTS = [...SYSTEM_FONTS, ...WEB_FONTS];
export const FONT_BY_ID = Object.fromEntries(FONTS.map((f) => [f.id, f]));

/** Group -> fonts, so two hundred typefaces can be browsed rather than scrolled. */
export const FONT_GROUPS = FONTS.reduce((acc, f) => {
  (acc[f.group || 'More'] ||= []).push(f);
  return acc;
}, {});

/**
 * Every font id a project's text and captions actually use.
 *
 * The exporter calls this to wait for those faces before drawing anything.
 * Only the fonts in use, never the whole library — two hundred families is
 * tens of megabytes, and a project with one title needs exactly one of them.
 */
export function fontsUsedBy(project) {
  const ids = new Set();
  for (const clip of project?.clips || []) {
    if (clip.text?.font) ids.add(clip.text.font);
    for (const t of clip.texts || []) if (t.font) ids.add(t.font);
  }
  // A cue names a style, and the style names the font — so resolve through it
  // rather than looking for a font on the cue that is not there.
  for (const cue of project?.captions || []) {
    const style = CAPTION_STYLES[cue?.style || 'tiktok'];
    if (cue?.font) ids.add(cue.font);
    else if (style?.font) ids.add(style.font);
  }
  return [...ids];
}

/* Caption styles that match what each platform's own editor produces, so a
   video posted from here doesn't look out of place next to native ones. */
export const CAPTION_STYLES = {
  tiktok:   { name: 'TikTok', font: 'sans', weight: 800, size: 0.055, color: '#ffffff',
              stroke: '#000000', strokeWidth: 0.16, box: null, anim: 'wordPop', align: 'center', y: 0.72 },
  youtube:  { name: 'YouTube', font: 'sans', weight: 700, size: 0.042, color: '#ffffff',
              stroke: null, strokeWidth: 0, box: 'rgba(0,0,0,.78)', anim: 'none', align: 'center', y: 0.85 },
  bold:     { name: 'Bold box', font: 'impact', weight: 400, size: 0.062, color: '#ffffff',
              stroke: '#000000', strokeWidth: 0.2, box: null, anim: 'pop', align: 'center', y: 0.5 },
  karaoke:  { name: 'Karaoke', font: 'sans', weight: 800, size: 0.052, color: '#ffffff',
              stroke: '#000000', strokeWidth: 0.14, box: null, anim: 'karaoke', align: 'center', y: 0.7,
              highlight: '#00d1ff' },
  clean:    { name: 'Clean', font: 'sans', weight: 600, size: 0.038, color: '#ffffff',
              stroke: null, strokeWidth: 0, box: null, shadow: true, anim: 'fade', align: 'center', y: 0.88 },
};

export const ANIMS = [
  ['none', 'None'], ['fade', 'Fade in'], ['pop', 'Pop'], ['slideUp', 'Slide up'], ['slideDown', 'Slide down'],
  ['slideLeft', 'From the right'], ['slideRight', 'From the left'], ['zoomIn', 'Zoom in'], ['zoomOut', 'Zoom out'],
  ['blurIn', 'Blur in'], ['spinIn', 'Spin in'], ['flipIn', 'Flip in'], ['dropIn', 'Drop in'], ['riseUp', 'Rise'],
  ['rubber', 'Rubber band'], ['typewriter', 'Typewriter'], ['scramble', 'Scramble'], ['wordPop', 'Word by word'],
  ['wordSlide', 'Words slide in'], ['karaoke', 'Karaoke highlight'], ['letterPop', 'Letter by letter'],
  ['letterFall', 'Letters fall'], ['letterRise', 'Letters rise'], ['wave', 'Wave'], ['tracking', 'Tracking in'],
  ['wipe', 'Wipe reveal'], ['glitch', 'Glitch'], ['flicker', 'Neon flicker'], ['shake', 'Shake'], ['bounce', 'Bounce'],
  ['pulse', 'Pulse (loops)'], ['breathe', 'Breathe (loops)'], ['swing', 'Swing (loops)'], ['jitter', 'Jitter (loops)'],
  ['blink', 'Blink (loops)'],
];
export const ANIM_NAME = Object.fromEntries(ANIMS);

/* ------------------------------------------------------------------ */
/* text animators                                                      */
/* ------------------------------------------------------------------ */

/*
 * Per-character animators with a range selector — the mechanism kinetic
 * typography is made of, and the one the animations above cannot express:
 * each of those is a whole-line move with a fixed stagger, whereas an
 * animator is a property (opacity, position, scale, rotation, tracking,
 * blur) with an amount, applied to whichever characters the selector
 * covers, and the selector's edges are what you animate. Key the start
 * from 0% to 100% and the letters arrive one by one; key the offset and a
 * wave rolls through them; switch the unit to words and the same thing
 * happens a word at a time.
 *
 * The amount for a character is decided by where it sits (0 at the first
 * character, 1 at the last, or shuffled when `random` is on) against the
 * selector's range, softened at each edge over `edge`, and shaped across
 * the range (square, ramps, triangle, round). Every number here resolves
 * through the reader the renderer hands drawText, so any of them can be
 * keyed or driven by an expression.
 */
export const ANIMATOR_PROPS = [
  ['opacity', 'Opacity'], ['y', 'Position Y'], ['x', 'Position X'], ['scale', 'Scale'],
  ['rotate', 'Rotation'], ['tracking', 'Tracking'], ['blur', 'Blur'],
];
export const SELECTOR_SHAPES = [
  ['square', 'Square'], ['rampUp', 'Ramp up'], ['rampDown', 'Ramp down'], ['triangle', 'Triangle'], ['round', 'Round'],
];
/* The amount's meaning per property, for the panel's slider. */
export const ANIMATOR_RANGE = {
  opacity: { min: 0, max: 1, step: 0.01, def: 0, fmt: (v) => `${Math.round(v * 100)}%` },
  y: { min: -1, max: 1, step: 0.01, def: 0.3, fmt: (v) => `${Math.round(v * 100)}%` },
  x: { min: -1, max: 1, step: 0.01, def: -0.3, fmt: (v) => `${Math.round(v * 100)}%` },
  scale: { min: 0, max: 4, step: 0.02, def: 0, fmt: (v) => `${Math.round(v * 100)}%` },
  rotate: { min: -360, max: 360, step: 1, def: 90, fmt: (v) => `${Math.round(v)}°` },
  tracking: { min: -1, max: 3, step: 0.02, def: 1, fmt: (v) => `${Math.round(v * 100)}%` },
  blur: { min: 0, max: 3, step: 0.05, def: 1, fmt: (v) => `${v.toFixed(1)}` },
};

export function defaultAnimator(prop = 'opacity', from = null) {
  return {
    prop,
    from: from ?? ANIMATOR_RANGE[prop]?.def ?? 0,
    selector: { start: 0, end: 1, offset: 0, edge: 0.15, shape: 'square', unit: 'chars', random: 0 },
  };
}

const smoothstep = (x) => { const u = Math.max(0, Math.min(1, x)); return u * u * (3 - 2 * u); };

/*
 * How much the selector covers position u (0..1 through the text).
 *
 * The soft edge only exists where a boundary is inside the text. A range
 * that starts at 0% covers the first letter fully, and one that ends at 100%
 * covers the last: an edge softened there would leave the first and last
 * letters half-selected for ever, so "fade up by character" from a full
 * selector would start with its two end letters already showing. The edge
 * appears the moment the boundary moves inward, which is when there is
 * something for it to soften.
 */
export function selectorAmount(u, sel) {
  const lo = (sel.start ?? 0) + (sel.offset ?? 0), hi = (sel.end ?? 1) + (sel.offset ?? 0);
  if (hi <= lo) return 0;
  if (u < lo || u > hi) return 0;
  const edge = Math.max(0.0005, sel.edge ?? 0.15);
  let a = (lo > 0 ? smoothstep((u - lo) / edge) : 1) * (hi < 1 ? smoothstep((hi - u) / edge) : 1);
  const p = (u - lo) / (hi - lo);
  switch (sel.shape) {
    case 'rampUp': a *= p; break;
    case 'rampDown': a *= 1 - p; break;
    case 'triangle': a *= 1 - Math.abs(p * 2 - 1); break;
    case 'round': a *= Math.sin(p * Math.PI); break;
    default: break;
  }
  return Math.max(0, Math.min(1, a));
}

/* Resolve every number of every animator through the reader, once per draw. */
function resolveAnimators(list, read) {
  return (list || []).map((an, k) => ({
    prop: an.prop,
    from: read(`animators.${k}.from`, an.from ?? 0),
    unit: an.selector?.unit || 'chars',
    random: an.selector?.random || 0,
    sel: {
      start: read(`animators.${k}.selector.start`, an.selector?.start ?? 0),
      end: read(`animators.${k}.selector.end`, an.selector?.end ?? 1),
      offset: read(`animators.${k}.selector.offset`, an.selector?.offset ?? 0),
      edge: read(`animators.${k}.selector.edge`, an.selector?.edge ?? 0.15),
      shape: an.selector?.shape || 'square',
    },
  }));
}

/*
 * The per-character modifiers from every animator, for the character at
 * `idx` of `n` (or the word it belongs to). Units match drawChars: dx and
 * dy in quarter font-sizes, scale a multiplier, rot in radians, blur in
 * font-sizes, track in font-sizes of extra advance.
 */
function animatorState(animators, idx, n, wordIdx, wordCount) {
  const out = { alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0, blur: 0, track: 0 };
  for (const an of animators) {
    const byWord = an.unit === 'words';
    const i = byWord ? wordIdx : idx, count = byWord ? wordCount : n;
    const u = an.random ? hash(i * 17.3 + an.random * 7.7) : count > 1 ? i / (count - 1) : 0;
    const a = selectorAmount(u, an.sel);
    if (a <= 0) continue;
    switch (an.prop) {
      case 'opacity': out.alpha *= 1 - a * (1 - an.from); break;
      case 'y': out.dy += a * an.from; break;
      case 'x': out.dx += a * an.from; break;
      case 'scale': out.scale *= 1 + a * (an.from - 1); break;
      case 'rotate': out.rot += (a * an.from * Math.PI) / 180; break;
      case 'tracking': out.track += a * an.from; break;
      case 'blur': out.blur += a * an.from; break;
      default: break;
    }
  }
  return out;
}

/*
 * Finished pieces: the animators and keys that make a classic move. Each
 * `build(clip, dur)` writes onto a title clip — the animators onto its text
 * and the keys onto the clip — so the panel and the AI make the same thing.
 */
export const TEXT_ANIMATOR_PRESETS = [
  { id: 'fadeByChar', name: 'Fade up by character', note: 'Each letter fades up in turn, with a soft edge.',
    build(clip, dur) { setAnimators(clip, [defaultAnimator('opacity', 0)], { start: [[0, 0], [Math.min(1, dur * 0.45), 1]] }); } },
  { id: 'riseByChar', name: 'Rise by character', note: 'Letters rise into place and fade up, one after another.',
    build(clip, dur) { setAnimators(clip, [defaultAnimator('opacity', 0), defaultAnimator('y', 0.35)], { start: [[0, 0], [Math.min(1, dur * 0.45), 1]] }, 0.2); } },
  { id: 'fallByChar', name: 'Fall by character', note: 'Letters drop in from above, turning as they land.',
    build(clip, dur) { setAnimators(clip, [defaultAnimator('opacity', 0), defaultAnimator('y', -0.6), defaultAnimator('rotate', -20)], { start: [[0, 0], [Math.min(1.1, dur * 0.5), 1]] }, 0.2); } },
  { id: 'scaleByWord', name: 'Scale in by word', note: 'Each word grows from nothing, word by word.',
    build(clip, dur) { const list = [defaultAnimator('scale', 0), defaultAnimator('opacity', 0)]; list.forEach((a) => { a.selector.unit = 'words'; }); setAnimators(clip, list, { start: [[0, 0], [Math.min(1, dur * 0.4), 1]] }, 0.35); } },
  { id: 'zoomByWord', name: 'Zoom out by word', note: 'Words land from huge, one at a time.',
    build(clip, dur) { const list = [defaultAnimator('scale', 3), defaultAnimator('opacity', 0)]; list.forEach((a) => { a.selector.unit = 'words'; }); setAnimators(clip, list, { start: [[0, 0], [Math.min(1, dur * 0.4), 1]] }, 0.35); } },
  { id: 'rotateIn', name: 'Rotate in', note: 'Letters swing in from ninety degrees.',
    build(clip, dur) { setAnimators(clip, [defaultAnimator('rotate', 90), defaultAnimator('opacity', 0)], { start: [[0, 0], [Math.min(1, dur * 0.45), 1]] }, 0.25); } },
  { id: 'blurIn', name: 'Blur in', note: 'Letters resolve out of a blur, left to right.',
    build(clip, dur) { setAnimators(clip, [defaultAnimator('blur', 1.2), defaultAnimator('opacity', 0)], { start: [[0, 0], [Math.min(1, dur * 0.45), 1]] }, 0.3); } },
  { id: 'trackingIn', name: 'Tracking in', note: 'Spread wide, tightening into place — the cinematic title.',
    build(clip, dur) { const an = defaultAnimator('tracking', 1.4); setAnimators(clip, [an], {}); clip.keyframes['text.animators.0.from'] = [{ t: 0, v: 1.4, ease: 'out' }, { t: Math.min(1.2, dur * 0.5), v: 0, ease: 'out' }]; } },
  { id: 'trackingOut', name: 'Tracking out', note: 'Tight, then spreading wide and fading — the cinematic exit.',
    build(clip, dur) { const an = defaultAnimator('tracking', 0); setAnimators(clip, [an, defaultAnimator('opacity', 1)], {}); clip.keyframes['text.animators.0.from'] = [{ t: Math.max(0, dur - 1), v: 0, ease: 'in' }, { t: dur, v: 1.6, ease: 'in' }]; clip.keyframes['text.animators.1.from'] = [{ t: Math.max(0, dur - 0.8), v: 1, ease: 'in' }, { t: dur, v: 0, ease: 'in' }]; } },
  { id: 'randomPop', name: 'Random pop', note: 'Letters pop in, in a random order.',
    build(clip, dur) { const list = [defaultAnimator('scale', 0), defaultAnimator('opacity', 0)]; list.forEach((a) => { a.selector.random = 3; }); setAnimators(clip, list, { start: [[0, 0], [Math.min(1, dur * 0.45), 1]] }, 0.12); } },
  { id: 'typewriterHard', name: 'Typewriter', note: 'Letters appear one at a time with a hard edge.',
    build(clip, dur) { setAnimators(clip, [defaultAnimator('opacity', 0)], { start: [[0, 0], [Math.min(1.4, dur * 0.6), 1]] }, 0.001); } },
  { id: 'slideFromLeft', name: 'Slide in from the left', note: 'Letters slide in from the left and fade up.',
    build(clip, dur) { setAnimators(clip, [defaultAnimator('x', -0.5), defaultAnimator('opacity', 0)], { start: [[0, 0], [Math.min(1, dur * 0.45), 1]] }, 0.25); } },
  { id: 'waveLoop', name: 'Wave (loops)', note: 'A bump rolls through the letters, forever.',
    build(clip) { const an = defaultAnimator('y', -0.16); an.selector = { ...an.selector, start: 0, end: 0.35, edge: 0.12, shape: 'round' }; setAnimators(clip, [an], {}); clip.expressions ||= {}; clip.expressions['text.animators.0.selector.offset'] = 'mod(local * 0.7, 1.7) - 0.35'; } },
  { id: 'jitterLoop', name: 'Jitter (loops)', note: 'Every letter shivers on its own, forever.',
    build(clip) { const an = defaultAnimator('y', 0.05); an.selector = { ...an.selector, start: 0, end: 1, random: 5 }; setAnimators(clip, [an, { ...defaultAnimator('rotate', 4), selector: { ...defaultAnimator().selector, random: 9 } }], {}); clip.expressions ||= {}; clip.expressions['text.animators.0.from'] = 'noise(local * 14) * 0.06'; clip.expressions['text.animators.1.from'] = 'noise(local * 11, 3) * 6'; } },
  { id: 'beatBounce', name: 'Bounce on the beat', note: 'The letters jump on every beat of the music, rippling left to right.',
    build(clip) { const an = defaultAnimator('y', -0.2); an.selector = { ...an.selector, start: 0, end: 1, shape: 'square', edge: 0.3 }; setAnimators(clip, [an, defaultAnimator('scale', 1.12)], {}); clip.expressions ||= {}; clip.expressions['text.animators.0.from'] = '-0.2 * beatPulse(9)'; clip.expressions['text.animators.1.from'] = '1 + beatPulse(9) * 0.14'; } },
  { id: 'audioScale', name: 'Scale with the music', note: 'Every letter grows with the level of the sound.',
    build(clip) { setAnimators(clip, [defaultAnimator('scale', 1)], {}); clip.expressions ||= {}; clip.expressions['text.animators.0.from'] = '1 + audioSmooth("all", 0.06) * 0.35'; } },
];
export const TEXT_ANIMATOR_BY_ID = Object.fromEntries(TEXT_ANIMATOR_PRESETS.map((p) => [p.id, p]));

/* Put animators on a title clip, with the selector's `start` keyed if asked, and one edge softness for all. */
function setAnimators(clip, list, keysFor, edge = 0.15) {
  clip.text ||= defaultText();
  clip.text.animators = list.map((a) => ({ ...a, selector: { ...a.selector, edge: a.selector.edge === 0.15 ? edge : a.selector.edge } }));
  clip.keyframes ||= {};
  for (const k of Object.keys(clip.keyframes)) if (k.startsWith('text.animators.')) delete clip.keyframes[k];
  if (clip.expressions) for (const k of Object.keys(clip.expressions)) if (k.startsWith('text.animators.')) delete clip.expressions[k];
  if (keysFor.start) {
    list.forEach((_, i) => { clip.keyframes[`text.animators.${i}.selector.start`] = keysFor.start.map(([t, v]) => ({ t, v, ease: 'ease' })); });
  }
  // A whole-title animation on top of animators would fight them.
  clip.text.anim = 'none';
}

/** The lanes a title with animators can animate. */
export function animatorProps(text) {
  const out = [];
  (text?.animators || []).forEach((an, k) => {
    const name = ANIMATOR_PROPS.find(([id]) => id === an.prop)?.[1] || an.prop;
    const r = ANIMATOR_RANGE[an.prop] || ANIMATOR_RANGE.opacity;
    const pct = (v) => `${Math.round(v * 100)}%`;
    out.push({ prop: `text.animators.${k}.from`, label: `${name} amount`, min: r.min, max: r.max, step: r.step, def: r.def, fmt: r.fmt });
    out.push({ prop: `text.animators.${k}.selector.start`, label: `${name} · start`, min: 0, max: 1, step: 0.005, def: 0, fmt: pct });
    out.push({ prop: `text.animators.${k}.selector.end`, label: `${name} · end`, min: 0, max: 1, step: 0.005, def: 1, fmt: pct });
    out.push({ prop: `text.animators.${k}.selector.offset`, label: `${name} · offset`, min: -1, max: 1, step: 0.005, def: 0, fmt: pct });
    out.push({ prop: `text.animators.${k}.selector.edge`, label: `${name} · softness`, min: 0, max: 1, step: 0.005, def: 0.15, fmt: pct });
  });
  return out;
}

/* The ones that move each character on its own. They draw through a different
   path, because a whole-line transform cannot make one letter arrive late. */
const PER_CHAR = new Set(['letterPop', 'letterFall', 'letterRise', 'wave', 'scramble', 'glitch', 'tracking']);

export function defaultText(content = 'Your text here') {
  return {
    content,
    font: 'sans',
    weight: 800,
    size: 0.07,          // fraction of frame height, so it scales with any ratio
    color: '#ffffff',
    stroke: '#000000',
    strokeWidth: 0.14,   // fraction of font size
    box: null,           // background colour, or null
    shadow: true,
    align: 'center',
    x: 0.5,
    y: 0.5,
    anim: 'pop',
    animDur: 0.45,
    lineHeight: 1.18,
    maxWidth: 0.86,
    letterSpacing: 0,
    uppercase: false,

    /*
     * The style layer. Everything below is off by default, so a title made
     * before these existed draws exactly as it did.
     *
     * opacity      — the whole title, translucent
     * gradient     — [colour, colour, …] replacing the fill, top to bottom at
     *                gradientAngle degrees; "shaded" is a gradient of one hue
     * glow         — a coloured halo, glowBlur in fractions of the size
     * extrude      — a 3D block behind the face, extrudeDepth in fractions of
     *                the size, along extrudeAngle
     * outline2     — a second, outer outline behind the first
     */
    opacity: 1,
    gradient: null,
    gradientAngle: 90,
    glow: null,
    glowBlur: 0.35,
    extrude: null,
    extrudeDepth: 0.08,
    extrudeAngle: 45,
    outline2: null,
    outline2Width: 0.08,
    styleId: null,       // which library style this came from, for the chip
  };
}

/* ------------------------------------------------------------------ */
/* layout                                                              */
/* ------------------------------------------------------------------ */

function wrap(ctx, text, maxWidth) {
  const paragraphs = String(text).split('\n');
  const lines = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); continue; }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const test = `${line} ${words[i]}`;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = words[i]; }
      else line = test;
    }
    lines.push(line);
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/* animation                                                           */
/* ------------------------------------------------------------------ */

const ease = (x) => 1 - (1 - x) ** 3;
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
/* Elastic: overshoots and settles. The rubber band, the pop with a spring. */
const elastic = (x) => (x === 0 || x === 1 ? x : 2 ** (-10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI / 3)) + 1);
/* A cheap deterministic hash, so a glitch is the same every frame you scrub to. */
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/**
 * Returns the per-frame drawing modifiers for an animation at local time t.
 * Everything is expressed as offsets and multipliers so the draw code below
 * stays one path regardless of which animation is running.
 *
 * `perChar(i, n)` is only set for the per-character animations and gives the
 * transform for character i of n, in the same units.
 */
function animState(anim, t, dur, clipDur) {
  const inP = Math.min(1, Math.max(0, t / Math.max(0.05, dur)));
  const outStart = clipDur - dur;
  const outP = clipDur > dur * 2 ? Math.min(1, Math.max(0, (t - outStart) / Math.max(0.05, dur))) : 0;
  const inOut = ease(inP) * (1 - ease(outP));
  const base = {
    alpha: 1, scale: 1, dy: 0, dx: 0, rot: 0, skew: 0, blur: 0, reveal: 1, wipe: 1, spacing: 0,
    wordIndex: Infinity, wordSlide: false, karaoke: -1, perChar: null, rgb: 0,
  };
  // Stagger for the per-character ones: each letter starts a little after the
  // one before, and the whole word has finished inside `dur`.
  const stagger = (i, n, spread = 0.7) => {
    const per = (dur * spread) / Math.max(1, n);
    const local = (t - i * per) / Math.max(0.05, dur * (1 - spread));
    return Math.min(1, Math.max(0, local));
  };

  switch (anim) {
    case 'fade':
      return { ...base, alpha: inOut };
    case 'pop': {
      const s = inP < 1 ? 0.6 + ease(inP) * 0.46 : 1;      // overshoots to 1.06 then settles
      return { ...base, alpha: inOut, scale: inP < 1 ? Math.min(s, 1.06) : 1 };
    }
    case 'slideUp':
      return { ...base, alpha: inOut, dy: (1 - ease(inP)) * 0.09 };
    case 'slideDown':
      return { ...base, alpha: inOut, dy: -(1 - ease(inP)) * 0.09 };
    case 'slideLeft':
      return { ...base, alpha: inOut, dx: (1 - ease(inP)) * 0.18 };
    case 'slideRight':
      return { ...base, alpha: inOut, dx: -(1 - ease(inP)) * 0.18 };
    case 'zoomIn':
      return { ...base, alpha: inOut, scale: 0.3 + ease(inP) * 0.7 };
    case 'zoomOut':
      return { ...base, alpha: inOut, scale: 2.2 - ease(inP) * 1.2 };
    case 'blurIn':
      return { ...base, alpha: inOut, blur: (1 - ease(inP)) * 0.6 };
    case 'spinIn':
      return { ...base, alpha: inOut, rot: (1 - ease(inP)) * Math.PI * 0.75, scale: 0.5 + ease(inP) * 0.5 };
    case 'flipIn':
      return { ...base, alpha: inOut, skew: (1 - ease(inP)) * 1.2, scale: 0.85 + ease(inP) * 0.15 };
    case 'dropIn': {
      // Falls from above and lands with a bounce.
      const p = inP;
      const b = p < 1 ? Math.abs(Math.sin(p * Math.PI * 1.5)) * (1 - p) ** 2 * 0.12 : 0;
      return { ...base, alpha: Math.min(1, inP * 3) * (1 - ease(outP)), dy: -((1 - p) ** 2) * 0.4 + b };
    }
    case 'riseUp':
      return { ...base, alpha: inOut, dy: (1 - easeInOut(inP)) * 0.25, scale: 0.92 + ease(inP) * 0.08 };
    case 'rubber':
      return { ...base, alpha: inOut, scale: inP < 1 ? 0.2 + elastic(inP) * 0.8 : 1 };
    case 'typewriter':
      return { ...base, reveal: inP };
    case 'scramble':
      // Letters land one by one; the ones still in the air show random glyphs.
      return { ...base, perChar: (i, n) => ({ settled: stagger(i, n, 0.85) >= 1, alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0 }) };
    case 'wordPop':
      return { ...base, wordIndex: inP };
    case 'wordSlide':
      return { ...base, wordIndex: inP, wordSlide: true };
    case 'karaoke':
      return { ...base, karaoke: clipDur > 0 ? t / clipDur : 0 };
    case 'letterPop':
      return { ...base, alpha: 1 - ease(outP), perChar: (i, n) => { const p = stagger(i, n); return { alpha: ease(p), scale: p < 1 ? Math.min(0.4 + ease(p) * 0.68, 1.08) : 1, dx: 0, dy: 0, rot: 0 }; } };
    case 'letterFall':
      return { ...base, alpha: 1 - ease(outP), perChar: (i, n) => { const p = stagger(i, n); return { alpha: Math.min(1, p * 3), dy: -(1 - ease(p)) * 0.35, dx: 0, scale: 1, rot: (1 - ease(p)) * 0.4 * (i % 2 ? 1 : -1) }; } };
    case 'letterRise':
      return { ...base, alpha: 1 - ease(outP), perChar: (i, n) => { const p = stagger(i, n); return { alpha: ease(p), dy: (1 - ease(p)) * 0.3, dx: 0, scale: 1, rot: 0 }; } };
    case 'wave':
      return { ...base, alpha: inOut, perChar: (i) => ({ alpha: 1, dy: Math.sin(t * 6 + i * 0.6) * 0.035, dx: 0, scale: 1, rot: Math.sin(t * 6 + i * 0.6) * 0.06 }) };
    case 'tracking':
      // Starts spread wide and tightens into place. The cinematic title card.
      return { ...base, alpha: inOut, spacing: (1 - ease(inP)) * 0.5, perChar: (i) => ({ alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0, i }) };
    case 'wipe':
      return { ...base, wipe: ease(inP), alpha: 1 - ease(outP) };
    case 'glitch': {
      // Bursts of displacement that settle. Deterministic on t, so scrubbing
      // back to a frame shows the same tear.
      const burst = inP < 1 ? (1 - inP) : (hash(Math.floor(t * 9)) > 0.86 ? 0.25 : 0);
      return { ...base, alpha: inOut, rgb: burst * 0.02,
        perChar: (i) => { const h = hash(i * 7 + Math.floor(t * 24)); return { alpha: 1, dx: (h - 0.5) * burst * 0.06, dy: (hash(i * 3 + Math.floor(t * 24)) - 0.5) * burst * 0.03, scale: 1, rot: 0 }; } };
    }
    case 'flicker': {
      // A neon tube warming up: stutters, then holds, with the odd dip after.
      const warm = inP < 1 ? (hash(Math.floor(t * 30)) > 0.45 ? 1 : 0.15) : (hash(Math.floor(t * 4)) > 0.93 ? 0.4 : 1);
      return { ...base, alpha: warm * (1 - ease(outP)) };
    }
    case 'shake': {
      const a = Math.sin(t * 34) * 0.006 * (1 - inP * 0.5);
      return { ...base, dx: a, dy: Math.cos(t * 41) * 0.005, alpha: ease(inP) };
    }
    case 'bounce': {
      const b = inP < 1 ? Math.abs(Math.sin(inP * Math.PI * 2)) * (1 - inP) * 0.06 : 0;
      return { ...base, dy: -b, alpha: ease(inP) };
    }
    case 'pulse':
      return { ...base, alpha: inOut, scale: 1 + Math.max(0, Math.sin(t * 5.2)) ** 6 * 0.12 };
    case 'breathe':
      return { ...base, alpha: inOut, scale: 1 + Math.sin(t * 1.6) * 0.04 };
    case 'swing':
      return { ...base, alpha: inOut, rot: Math.sin(t * 2.4) * 0.07 };
    case 'jitter':
      return { ...base, alpha: inOut, dx: (hash(Math.floor(t * 20)) - 0.5) * 0.008, dy: (hash(Math.floor(t * 20) + 99) - 0.5) * 0.008 };
    case 'blink':
      return { ...base, alpha: (Math.floor(t * 2.5) % 2 === 0 ? 1 : 0.12) * (1 - ease(outP)) };
    default:
      return base;
  }
}

/* ------------------------------------------------------------------ */
/* draw                                                                */
/* ------------------------------------------------------------------ */

/**
 * Paint a text object onto ctx sized w×h. `t` is seconds since the clip
 * started and `clipDur` its length — both only matter for the animations.
 */
export function drawText(ctx, w, h, text, t = 0, clipDur = 3, read = null) {
  const st = { ...defaultText(), ...text };
  const size = Math.max(8, st.size * h);
  const font = FONT_BY_ID[st.font]?.stack || FONTS[0].stack;
  const a = animState(st.anim, t, st.animDur ?? 0.45, clipDur);
  if (a.alpha <= 0.002) return;
  // Per-character animators, every number resolved through the reader when there is one.
  const animators = st.animators?.length ? resolveAnimators(st.animators, read || ((_, fb) => fb)) : [];
  // The frame's own time drives anything random-looking, so two renders of
  // the same moment draw the same glyphs — in the export and under the scrub.
  const prevClock = renderClock;
  renderClock = t;

  ctx.save();
  ctx.globalAlpha = a.alpha * Math.max(0, Math.min(1, st.opacity ?? 1));
  ctx.font = `${st.weight} ${size}px ${font}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = st.align;
  const spacing = (st.letterSpacing || 0) + a.spacing;
  if (spacing) ctx.letterSpacing = `${(spacing * size).toFixed(2)}px`;
  if (a.blur > 0.01) ctx.filter = `blur(${(a.blur * size * 0.25).toFixed(1)}px)`;

  let content = String(st.content ?? '');
  if (st.uppercase) content = content.toUpperCase();
  if (st.anim === 'typewriter') content = content.slice(0, Math.ceil(content.length * a.reveal));

  const lines = wrap(ctx, content, st.maxWidth * w);
  const lineH = size * (st.lineHeight ?? 1.18);
  const cx = st.x * w + a.dx * w;
  const cy = st.y * h + a.dy * h;
  const totalH = lines.length * lineH;
  const top = cy - totalH / 2 + lineH / 2;

  ctx.translate(cx, cy);
  ctx.scale(a.scale, a.scale);
  if (a.rot) ctx.rotate(a.rot);
  if (a.skew) ctx.transform(1, 0, a.skew, 1, 0, 0);
  ctx.translate(-cx, -cy);

  // A wipe reveal is a clip that widens across the block from the left.
  if (a.wipe < 1) {
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width), 0) + size;
    const left = st.align === 'left' ? cx - size * 0.5 : st.align === 'right' ? cx - widest + size * 0.5 : cx - widest / 2;
    ctx.beginPath();
    ctx.rect(left, top - lineH, widest * a.wipe, totalH + lineH);
    ctx.clip();
  }

  // background box, sized to the widest line
  if (st.box) {
    const pad = size * 0.32;
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width), 0);
    const bx = st.align === 'left' ? cx - pad : st.align === 'right' ? cx - widest - pad : cx - widest / 2 - pad;
    ctx.fillStyle = st.box;
    roundRect(ctx, bx, top - lineH / 2 - pad * 0.5, widest + pad * 2, totalH + pad, size * 0.16);
    ctx.fill();
  }

  // Where each line's characters sit in the whole text, for the animators.
  const layout = { offsets: [], n: 0, wordBase: [], words: 0 };
  for (const line of lines) {
    layout.offsets.push(layout.n);
    layout.wordBase.push(layout.words);
    layout.n += [...line].length;
    layout.words += line.split(' ').filter(Boolean).length;
  }

  lines.forEach((line, i) => {
    const y = top + i * lineH;
    if (a.perChar || PER_CHAR.has(st.anim) || animators.length) {
      drawChars(ctx, line, cx, y, size, st, a, lines.length, i, animators, layout);
    } else if (st.anim === 'wordPop' || st.anim === 'wordSlide' || st.anim === 'karaoke') {
      drawWords(ctx, line, cx, y, size, st, a, lines.length, i);
    } else {
      paintLine(ctx, line, cx, y, size, st);
    }
  });

  ctx.restore();
  renderClock = prevClock;
}

/**
 * One run of text with the whole style on it, in the order the layers stack:
 * the 3D block furthest back, then the outer outline, the outline, the glow,
 * and the face on top. Shadow is a property of the face, so it is set last —
 * a shadow under every extrusion step would be a smear.
 */
function paintLine(ctx, line, x, y, size, st, { colour = null } = {}) {
  if (!line) return;
  ctx.save();

  if (st.extrude && st.extrudeDepth > 0) {
    const steps = Math.max(1, Math.round(st.extrudeDepth * size * 0.5));
    const ang = ((st.extrudeAngle ?? 45) * Math.PI) / 180;
    const ox = Math.cos(ang), oy = Math.sin(ang);
    const total = st.extrudeDepth * size;
    ctx.fillStyle = st.extrude;
    for (let k = steps; k >= 1; k--) {
      const d = (k / steps) * total;
      ctx.fillText(line, x + ox * d, y + oy * d);
    }
  }

  if (st.outline2 && st.outline2Width > 0) {
    ctx.lineWidth = size * ((st.strokeWidth || 0) + st.outline2Width);
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeStyle = st.outline2;
    ctx.strokeText(line, x, y);
  }

  if (st.stroke && st.strokeWidth > 0) {
    ctx.lineWidth = size * st.strokeWidth;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeStyle = st.stroke;
    ctx.strokeText(line, x, y);
  }

  if (st.glow) {
    // Twice, because one pass of a soft shadow is a faint tint and neon is
    // not faint.
    ctx.shadowColor = st.glow;
    ctx.shadowBlur = size * (st.glowBlur ?? 0.35);
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = st.glow;
    ctx.fillText(line, x, y);
    ctx.fillText(line, x, y);
    ctx.shadowBlur = 0;
  } else if (st.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = size * 0.22;
    ctx.shadowOffsetY = size * 0.045;
  }

  ctx.fillStyle = colour || fillFor(ctx, line, x, y, size, st);
  ctx.fillText(line, x, y);
  ctx.restore();
}

/** Solid colour, or a gradient sized to this run of text. */
function fillFor(ctx, line, x, y, size, st) {
  if (!st.gradient || !st.gradient.length) return st.color;
  const w = ctx.measureText(line).width || size;
  const left = st.align === 'left' ? x : st.align === 'right' ? x - w : x - w / 2;
  const ang = ((st.gradientAngle ?? 90) * Math.PI) / 180;
  // The gradient axis runs through the middle of the text block at `angle`,
  // long enough to cover it whichever way it points.
  const half = Math.max(w, size) / 2;
  const cx = left + w / 2;
  const dx = Math.cos(ang) * half, dy = Math.sin(ang) * half;
  const g = ctx.createLinearGradient(cx - dx, y - dy, cx + dx, y + dy);
  const stops = st.gradient;
  stops.forEach((c, i) => g.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), c));
  return g;
}

/** Word-by-word reveal and karaoke share this path; they differ only in which
 *  words are visible and which one is highlighted. */
function drawWords(ctx, line, cx, y, size, st, a, lineCount, lineIndex) {
  const words = line.split(' ').filter(Boolean);
  if (!words.length) return;
  const space = ctx.measureText(' ').width;
  const widths = words.map((word) => ctx.measureText(word).width);
  const total = widths.reduce((s, v) => s + v, 0) + space * (words.length - 1);
  let x = st.align === 'left' ? cx : st.align === 'right' ? cx - total : cx - total / 2;

  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';

  const shown = a.wordIndex === Infinity ? words.length
    : Math.ceil(a.wordIndex * words.length * lineCount) - lineIndex * words.length;
  const active = a.karaoke >= 0 ? Math.floor(a.karaoke * words.length * lineCount) - lineIndex * words.length : -1;

  words.forEach((word, i) => {
    if (a.wordIndex !== Infinity && i >= shown) { x += widths[i] + space; return; }
    const isActive = active === i;
    // A karaoke with no highlight colour set is a karaoke that does nothing
    // visible, so the brand blue stands in until somebody picks one.
    const colour = isActive ? (st.highlight || '#00d1ff') : null;
    // The newest word slides in from below when the animation asks for it.
    let dy = 0;
    if (a.wordSlide && a.wordIndex !== Infinity && i === shown - 1) {
      const frac = (a.wordIndex * words.length * lineCount) - (lineIndex * words.length + i);
      dy = (1 - Math.min(1, Math.max(0, frac))) * size * 0.35;
    }
    paintLine(ctx, word, x, y + dy, size, st, { colour });
    x += widths[i] + space;
  });

  ctx.textAlign = prevAlign;
}

/*
 * One character at a time.
 *
 * Each glyph is measured and placed by hand, then drawn through paintLine so
 * it carries the whole style — a 3D extrusion on a letter that is still
 * falling into place has to fall with it.
 */
const SCRAMBLE = 'ABCDEFGHJKLMNPQRSTUVWXYZ023456789#%&';
function drawChars(ctx, line, cx, y, size, st, a, lineCount, lineIndex, animators = [], layout = null) {
  const chars = [...line];
  if (!chars.length) return;
  const widths = chars.map((c) => ctx.measureText(c).width);
  const n = layout ? layout.n : chars.length * lineCount;
  const base = layout ? layout.offsets[lineIndex] : lineIndex * chars.length;

  // The animators' per-character state, once, because tracking changes
  // where every character after it sits and the line must stay centred.
  let states = null, extra = 0;
  if (animators.length) {
    states = [];
    let word = layout ? layout.wordBase[lineIndex] : 0;
    chars.forEach((ch, i) => {
      if (i > 0 && chars[i - 1] === ' ' && ch !== ' ') word++;
      const s = animatorState(animators, base + i, n, word, layout ? layout.words : 1);
      states.push(s);
      extra += s.track * size * 0.5;
    });
  }
  const total = widths.reduce((s, v) => s + v, 0) + extra;
  let x = st.align === 'left' ? cx : st.align === 'right' ? cx - total : cx - total / 2;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';

  chars.forEach((ch, i) => {
    const idx = base + i;
    const c0 = a.perChar ? a.perChar(idx, n) : { alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0 };
    const an = states ? states[i] : null;
    const c = an ? {
      ...c0, alpha: c0.alpha * an.alpha, dx: c0.dx + an.dx, dy: c0.dy + an.dy,
      scale: c0.scale * an.scale, rot: (c0.rot || 0) + an.rot, blur: an.blur,
    } : c0;
    let glyph = ch;
    if (st.anim === 'scramble' && c.settled === false && ch !== ' ') {
      glyph = SCRAMBLE[Math.floor(hash(idx * 13 + Math.floor(performanceNow() * 18)) * SCRAMBLE.length)];
    }
    if (c.alpha > 0.003 && ch !== ' ' && c.scale > 0.001) {
      ctx.save();
      ctx.globalAlpha *= Math.max(0, Math.min(1, c.alpha));
      if (c.blur > 0.01) ctx.filter = `blur(${(c.blur * size * 0.3).toFixed(1)}px)`;
      const gx = x + widths[i] / 2, gy = y;
      ctx.translate(gx + c.dx * size * 4, gy + c.dy * size * 4);
      if (c.rot) ctx.rotate(c.rot);
      if (c.scale !== 1) ctx.scale(c.scale, c.scale);
      ctx.translate(-widths[i] / 2, 0);
      // A glitch tears the colour channels apart by a few pixels.
      if (a.rgb > 0) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        paintLine(ctx, glyph, -a.rgb * size * 2, 0, size, { ...st, glow: null, extrude: null, outline2: null, stroke: null, shadow: false }, { colour: 'rgba(255,40,80,.85)' });
        paintLine(ctx, glyph, a.rgb * size * 2, 0, size, { ...st, glow: null, extrude: null, outline2: null, stroke: null, shadow: false }, { colour: 'rgba(0,209,255,.85)' });
        ctx.restore();
      }
      paintLine(ctx, glyph, 0, 0, size, st);
      ctx.restore();
    }
    x += widths[i] + (an ? an.track * size * 0.5 : 0);
  });
  ctx.textAlign = prevAlign;
}

/* The clock the scramble reads: the frame's time, set by drawText for the
   duration of a draw. Exported so a preview can pin it explicitly. */
let renderClock = 0;
export function setTextClock(seconds) { renderClock = seconds ?? 0; }
function performanceNow() { return renderClock || 0; }

function roundRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/* ------------------------------------------------------------------ */
/* title presets                                                       */
/* ------------------------------------------------------------------ */

export const TITLE_PRESETS = [
  { id: 'headline', name: 'Big headline', tier: 'free',
    text: { size: 0.085, weight: 800, anim: 'pop', uppercase: true, y: 0.5, letterSpacing: -0.02 } },
  { id: 'lower', name: 'Lower third', tier: 'free',
    text: { size: 0.042, weight: 700, anim: 'slideUp', align: 'left', x: 0.08, y: 0.82, stroke: null,
            box: 'rgba(0,0,0,.7)' } },
  { id: 'subtitle', name: 'Subtitle', tier: 'free',
    text: { size: 0.038, weight: 600, anim: 'fade', y: 0.88, stroke: null, shadow: true } },
  { id: 'hook', name: 'Hook (top)', tier: 'free',
    text: { size: 0.058, weight: 800, anim: 'wordPop', y: 0.2, strokeWidth: 0.16 } },
  { id: 'counter', name: 'List number', tier: 'free',
    text: { size: 0.12, weight: 800, anim: 'bounce', y: 0.28, content: '1' } },
  { id: 'quote', name: 'Quote', tier: 'creator',
    text: { size: 0.05, weight: 600, anim: 'typewriter', y: 0.5, stroke: null, shadow: true, maxWidth: 0.7 } },
  { id: 'glitchy', name: 'Glitch title', tier: 'creator',
    text: { size: 0.075, weight: 800, anim: 'shake', uppercase: true, color: '#00d1ff', stroke: '#7a5cff' } },
  { id: 'endcard', name: 'End card', tier: 'creator',
    text: { size: 0.06, weight: 800, anim: 'pop', y: 0.44, uppercase: true } },
];
