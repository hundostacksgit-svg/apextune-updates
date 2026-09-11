/*
 * Live previews for every effect, look, transition and animation.
 *
 * Why these are drawn and not shipped
 * -----------------------------------
 * The obvious way to show what a filter does is to ship a picture of it. With
 * 316 effects, 118 looks, 107 transitions and a wall of text animations, that
 * is well over five hundred images — and if any of them is to be legible it is
 * not a small one. That is tens of megabytes in the repository, on every
 * install, and in every phone's cache, for pictures.
 *
 * It is also the kind of thing that goes quietly wrong. A shipped screenshot
 * is a claim about what an effect does, and the moment somebody tunes that
 * effect the claim is stale. Nobody re-renders five hundred PNGs to fix a
 * glow, so the previews slowly stop matching the app.
 *
 * So nothing is shipped. Every preview here is the real effect, running on a
 * real frame, at thumbnail size. It costs no bytes at all, it cannot drift
 * from what the effect actually does, and when there is footage on the
 * timeline the previews are of *your* footage rather than somebody's stock
 * mountain — which is the version people can actually judge.
 *
 * Keeping it cheap
 * ----------------
 * A preview is ~120x68. That is about 1/250th of a 1080p frame, so drawing one
 * costs a fraction of a millisecond even for the effects that are expensive at
 * full size. On top of that:
 *
 *   • Nothing renders until it scrolls into view.
 *   • Every result is cached, and the cache is capped and evicted.
 *   • Animated previews only animate while they are on screen and only one at
 *     a time under the pointer, so a panel of two hundred chips is not two
 *     hundred animation loops.
 */

import { EFFECTS, makeEffect } from './effects.js';
import { LOOK_BY_ID, resolved, cssFilter, applyPasses } from './filters.js';
import { TRANSITIONS } from './transitions.js';

export const PREVIEW_W = 120;
export const PREVIEW_H = 68;

/* ------------------------------------------------------------------ *
 * The source frame
 * ------------------------------------------------------------------ */

let userFrame = null;     // a frame from the person's own footage, when we have one
let builtIn = null;

/**
 * A synthetic frame with something for every effect to bite on.
 *
 * Built rather than shipped, and built deliberately: a flat gradient makes a
 * blur look like nothing happened, a greyscale image makes every duotone look
 * identical, and a picture with no hard edges makes a sharpen, an outline and
 * an emboss indistinguishable. This has a full luminance range, saturated and
 * desaturated regions, hard geometric edges, a face-like oval for skin tones,
 * and fine detail — so a preview of any effect shows something true about it.
 */
function buildFrame() {
  const c = document.createElement('canvas');
  c.width = PREVIEW_W * 2;                 // 2x, so a retina chip is still sharp
  c.height = PREVIEW_H * 2;
  const x = c.getContext('2d');
  const W = c.width, H = c.height;

  const sky = x.createLinearGradient(0, 0, W * 0.3, H);
  sky.addColorStop(0, '#11224e');
  sky.addColorStop(0.45, '#6b3fa0');
  sky.addColorStop(0.75, '#e0603a');
  sky.addColorStop(1, '#ffd08a');
  x.fillStyle = sky;
  x.fillRect(0, 0, W, H);

  // A sun: a small very bright region, which is what a glow or a bloom needs.
  const sun = x.createRadialGradient(W * 0.74, H * 0.3, 0, W * 0.74, H * 0.3, H * 0.28);
  sun.addColorStop(0, '#ffffff');
  sun.addColorStop(0.4, '#fff0c0');
  sun.addColorStop(1, 'rgba(255,220,140,0)');
  x.fillStyle = sun;
  x.fillRect(0, 0, W, H);

  // Hills: hard edges and near-black shadow, for contrast and edge detection.
  x.fillStyle = '#1d2f3d';
  x.beginPath();
  x.moveTo(0, H * 0.72);
  x.lineTo(W * 0.28, H * 0.5);
  x.lineTo(W * 0.5, H * 0.68);
  x.lineTo(W * 0.72, H * 0.44);
  x.lineTo(W, H * 0.66);
  x.lineTo(W, H); x.lineTo(0, H);
  x.closePath(); x.fill();

  x.fillStyle = '#0a1119';
  x.beginPath();
  x.moveTo(0, H * 0.86);
  x.lineTo(W * 0.4, H * 0.76);
  x.lineTo(W * 0.68, H * 0.9);
  x.lineTo(W, H * 0.8);
  x.lineTo(W, H); x.lineTo(0, H);
  x.closePath(); x.fill();

  // A face-shaped oval in a skin tone. Portrait effects that only touch skin
  // would otherwise preview as doing nothing at all.
  x.fillStyle = '#d9a07a';
  x.beginPath();
  x.ellipse(W * 0.24, H * 0.6, W * 0.075, H * 0.17, 0, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#2a1a12';
  x.beginPath(); x.ellipse(W * 0.215, H * 0.56, W * 0.011, H * 0.02, 0, 0, 7); x.fill();
  x.beginPath(); x.ellipse(W * 0.265, H * 0.56, W * 0.011, H * 0.02, 0, 0, 7); x.fill();

  // Saturated chips, so hue shifts, isolates and channel swaps read.
  const chips = ['#ff2d55', '#34c759', '#0a84ff', '#ffd60a'];
  chips.forEach((col, i) => {
    x.fillStyle = col;
    x.fillRect(W * (0.44 + i * 0.075), H * 0.78, W * 0.05, H * 0.09);
  });

  // Fine detail, for sharpen, pixelate, halftone and anything that resamples.
  x.strokeStyle = 'rgba(255,255,255,.5)';
  x.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    x.beginPath();
    x.moveTo(W * 0.82, H * (0.52 + i * 0.032));
    x.lineTo(W * 0.97, H * (0.52 + i * 0.032));
    x.stroke();
  }
  return c;
}

/** The frame previews are drawn from: the person's own, when there is one. */
export function sourceFrame() {
  if (userFrame) return userFrame;
  if (!builtIn) builtIn = buildFrame();
  return builtIn;
}

/**
 * Offer a frame from the project to preview against.
 *
 * A preview of your own shot is worth several of a stock one — you can tell
 * whether a grade suits *this* footage, which is the actual question. Called
 * whenever media is imported; silently ignored if the image cannot be used.
 */
export function useProjectFrame(src) {
  if (!src) { userFrame = null; invalidate(); return; }
  try {
    const c = document.createElement('canvas');
    c.width = PREVIEW_W * 2;
    c.height = PREVIEW_H * 2;
    const x = c.getContext('2d');
    // Cover, not stretch: a squashed preview misrepresents every effect on it.
    const scale = Math.max(c.width / src.width, c.height / src.height);
    const w = src.width * scale, h = src.height * scale;
    x.drawImage(src, (c.width - w) / 2, (c.height - h) / 2, w, h);
    userFrame = c;
    invalidate();
  } catch {
    // A tainted or not-yet-decoded image is not worth an error; the built-in
    // frame is a perfectly good preview.
  }
}

/* ------------------------------------------------------------------ *
 * Cache
 * ------------------------------------------------------------------ */

const cache = new Map();
/*
 * Sized above the whole library, on purpose.
 *
 * There are ~316 effects, ~118 looks and ~107 transitions, and a preview is
 * about 32KB of canvas. Cap the cache below that total and scrolling a panel
 * evicts the chips you are about to scroll back to, so every pass re-renders
 * everything and the cache does nothing. 1400 covers the lot with headroom for
 * the animated frames, at a few tens of megabytes worst case — and it only
 * ever holds what was actually looked at.
 */
const CACHE_MAX = 1400;

function invalidate() { cache.clear(); liveliest.clear(); }

function cached(key, make) {
  const hit = cache.get(key);
  if (hit) return hit;
  const made = make();
  // Oldest out first. A Map iterates in insertion order, so the first key is
  // the coldest — no timestamps to keep and no sorting to do.
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, made);
  return made;
}

function blank() {
  const c = document.createElement('canvas');
  c.width = PREVIEW_W * 2; c.height = PREVIEW_H * 2;
  return c;
}

/* ------------------------------------------------------------------ *
 * Renderers
 * ------------------------------------------------------------------ */

/*
 * When to sample an effect for its still preview.
 *
 * A flash, an impact frame, a film burn and a hit spark are dormant for most
 * of a clip by design — that is what makes them punctuation. Sampling them at
 * a fixed moment catches them switched off, and a chip showing an untouched
 * frame reads as an effect that does nothing. So the still is the liveliest
 * of a few moments: whichever one differs most from the source.
 *
 * Worked out once per effect and remembered, because finding it costs several
 * renders and the answer never changes.
 */
const liveliest = new Map();

function bestTime(id) {
  if (liveliest.has(id)) return liveliest.get(id);
  const def = EFFECTS[id];
  if (!def) { liveliest.set(id, 0.55); return 0.55; }

  const src = sourceFrame();
  const probe = document.createElement('canvas');
  probe.width = 48; probe.height = 27;
  const g = probe.getContext('2d', { willReadFrequently: true });
  const read = () => g.getImageData(0, 0, probe.width, probe.height).data;

  g.drawImage(src, 0, 0, probe.width, probe.height);
  const base = read();

  let best = 0.55, bestDiff = -1;
  for (const t of [0.02, 0.09, 0.2, 0.45, 0.7, 1.1, 1.7]) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none';
    g.clearRect(0, 0, probe.width, probe.height);
    g.drawImage(src, 0, 0, probe.width, probe.height);
    const inst = makeEffect(id);
    try {
      def.draw(g, probe.width, probe.height, inst.params, {
        local: t, fps: 30,
        clip: { id: 'probe', start: 0, dur: 3, effects: [inst] },
        redrawClip: () => src,
        beatPhase: (t * 2) % 1,
      });
    } catch { continue; }
    const now = read();
    let diff = 0;
    for (let i = 0; i < now.length; i += 4) diff += Math.abs(now[i] - base[i]);
    if (diff > bestDiff) { bestDiff = diff; best = t; }
  }
  liveliest.set(id, best);
  return best;
}

/** One effect at its default settings, drawn on the sample frame. */
export function effectThumb(id, t) {
  if (t === undefined) t = bestTime(id);
  return cached(`fx:${id}:${t}:${userFrame ? 'u' : 'b'}`, () => {
    const out = blank();
    const ctx = out.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(sourceFrame(), 0, 0, out.width, out.height);
    const def = EFFECTS[id];
    if (!def) return out;
    const inst = makeEffect(id);
    try {
      def.draw(ctx, out.width, out.height, inst.params, {
        local: t, fps: 30,
        clip: { id: 'preview', start: 0, dur: 3, effects: [inst] },
        // Motion blur asks for the clip at another moment. A preview has no
        // timeline behind it, so it gets the frame it already has — which is
        // the honest answer for a still preview of a motion effect.
        redrawClip: () => sourceFrame(),
        beatPhase: (t * 2) % 1,
      });
    } catch {
      // A preview that fails is a chip with an unfiltered picture on it, which
      // is far better than a panel that will not render.
    }
    return out;
  });
}

/**
 * One colour look, put through the renderer's own grading path.
 *
 * `resolved`, `cssFilter` and `applyPasses` are exactly what the viewer and the
 * exporter use. Reimplementing the grade here — even approximately — would mean
 * a preview that quietly disagrees with the thing it is previewing, which is
 * the whole failure mode a live preview exists to avoid.
 */
export function lookThumb(id) {
  return cached(`look:${id}:${userFrame ? 'u' : 'b'}`, () => {
    const out = blank();
    const ctx = out.getContext('2d', { willReadFrequently: true });
    const look = LOOK_BY_ID[id];
    if (!look) { ctx.drawImage(sourceFrame(), 0, 0, out.width, out.height); return out; }

    const colour = resolved({ ...(look.color || {}), look: id });
    try {
      ctx.filter = cssFilter(colour) || 'none';
      ctx.drawImage(sourceFrame(), 0, 0, out.width, out.height);
      ctx.filter = 'none';
      // Split toning, vignette and the rest of the passes CSS cannot express —
      // often the half of a look that gives it its character.
      applyPasses(ctx, out.width, out.height, colour);
    } catch {
      ctx.filter = 'none';
      ctx.drawImage(sourceFrame(), 0, 0, out.width, out.height);
    }
    return out;
  });
}

/**
 * One transition, at a given point through it.
 *
 * Two versions of the sample frame are used as the outgoing and incoming
 * shots, tinted apart, so a wipe or a slide is legible at thumbnail size. Two
 * near-identical frames would make most of the library look like nothing
 * happening.
 */
export function transitionThumb(id, p = 0.5) {
  const key = `tr:${id}:${p.toFixed(2)}:${userFrame ? 'u' : 'b'}`;
  return cached(key, () => {
    const out = blank();
    const ctx = out.getContext('2d', { willReadFrequently: true });
    const from = tinted('#2b4fd6', 0.42);
    const to = tinted('#f0632a', 0.42);
    const def = TRANSITIONS[id];
    if (!def) { ctx.drawImage(from, 0, 0); return out; }
    try { def.draw(ctx, out.width, out.height, from, to, p); }
    catch { ctx.drawImage(from, 0, 0); }
    return out;
  });
}

function tinted(colour, amount) {
  return cached(`tint:${colour}:${userFrame ? 'u' : 'b'}`, () => {
    const c = blank();
    const x = c.getContext('2d');
    x.drawImage(sourceFrame(), 0, 0, c.width, c.height);
    x.globalCompositeOperation = 'color';
    x.globalAlpha = amount;
    x.fillStyle = colour;
    x.fillRect(0, 0, c.width, c.height);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';
    return c;
  });
}

/* ------------------------------------------------------------------ *
 * Attaching previews to a panel
 * ------------------------------------------------------------------ */

/*
 * One observer for the whole app.
 *
 * A panel of three hundred chips creating three hundred observers is three
 * hundred times the bookkeeping for the same answer. One observer, and chips
 * register with it.
 */
let io = null;
const pending = new WeakMap();

function observer() {
  if (io) return io;
  io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const draw = pending.get(entry.target);
      if (draw) { draw(); pending.delete(entry.target); }
      io.unobserve(entry.target);
    }
  }, { rootMargin: '200px' });   // a screen's warning, so scrolling never shows a blank
  return io;
}

/**
 * Give every chip in `host` a live preview of what it does.
 *
 * `kind` picks the renderer: 'fx', 'look' or 'transition'. The chip keeps its
 * label — a preview tells you what something looks like, the name tells you
 * what to call it, and a grid of unlabelled thumbnails is unsearchable.
 *
 * Animated kinds start moving on hover or touch and stop when the pointer
 * leaves, so a panel is never running two hundred animation loops.
 */
export function attachPreviews(host, kind = 'fx', selector = null) {
  const attr = { fx: 'data-fx', look: 'data-look', transition: 'data-trans' }[kind];
  if (!attr || !host) return;

  for (const chip of host.querySelectorAll(selector || `[${attr}]`)) {
    if (chip.dataset.previewed) continue;
    chip.dataset.previewed = '1';
    const id = chip.getAttribute(attr);

    const cv = document.createElement('canvas');
    cv.className = 'chip-prev';
    cv.width = PREVIEW_W * 2;
    cv.height = PREVIEW_H * 2;
    // Decorative: the chip's text already names it, so a screen reader
    // announcing "canvas" here would be noise.
    cv.setAttribute('aria-hidden', 'true');
    chip.prepend(cv);

    const paint = (frame) => {
      const g = cv.getContext('2d');
      g.clearRect(0, 0, cv.width, cv.height);
      g.drawImage(frame, 0, 0, cv.width, cv.height);
    };

    pending.set(chip, () => {
      try {
        if (kind === 'fx') paint(effectThumb(id));
        else if (kind === 'look') paint(lookThumb(id));
        else paint(transitionThumb(id, 0.45));
      } catch { /* a chip without a picture still works */ }
    });
    observer().observe(chip);

    if (kind === 'transition' || kind === 'fx') {
      let raf = 0, t0 = 0;
      const stop = () => {
        if (!raf) return;
        cancelAnimationFrame(raf); raf = 0;
        try { paint(kind === 'fx' ? effectThumb(id) : transitionThumb(id, 0.45)); } catch { /* keep the last frame */ }
      };
      const tick = (now) => {
        if (!t0) t0 = now;
        const secs = (now - t0) / 1000;
        try {
          if (kind === 'transition') paint(transitionThumb(id, (secs / 1.1) % 1));
          else paint(effectThumb(id, Math.round(secs * 12) / 12));
        } catch { stop(); return; }
        raf = requestAnimationFrame(tick);
      };
      const start = () => { if (!raf) { t0 = 0; raf = requestAnimationFrame(tick); } };

      chip.addEventListener('pointerenter', start);
      chip.addEventListener('pointerleave', stop);
      // On a touch screen there is no hover, so a press plays it. The listener
      // is passive: this must never interfere with scrolling a panel.
      chip.addEventListener('touchstart', start, { passive: true });
      chip.addEventListener('touchend', stop, { passive: true });
      chip.addEventListener('touchcancel', stop, { passive: true });
    }
  }
}
