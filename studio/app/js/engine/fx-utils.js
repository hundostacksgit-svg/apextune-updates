/*
 * The scratch canvases and small helpers every effect shares.
 *
 * This lives in its own file so effects.js and effects-library.js can both use
 * it without importing each other. That is not tidiness for its own sake: they
 * must share one pool. Two pools means two sets of full-size canvases, and at
 * 4K a single spare frame is 33MB — enough that a handful of duplicates is the
 * difference between an export that finishes and a tab that is killed.
 */

const pool = [];

/**
 * A reusable off-screen canvas at the frame's size.
 *
 * Allocating one per frame is what turns a smooth scrub into a stutter, so
 * they are pooled by index and only resized when the frame size actually
 * changes. An effect picks its own indices; two effects never run at the same
 * instant, so they can reuse the same slots.
 */
export function scratch(w, h, index = 0) {
  while (pool.length <= index) {
    const c = document.createElement('canvas');
    pool.push({ canvas: c, ctx: c.getContext('2d', { willReadFrequently: false }) });
  }
  const slot = pool[index];
  if (slot.canvas.width !== w || slot.canvas.height !== h) {
    slot.canvas.width = w;
    slot.canvas.height = h;
  } else {
    slot.ctx.clearRect(0, 0, w, h);
  }
  return slot;
}

/** Copy the current frame out so an effect can composite against itself. */
export function snapshot(ctx, w, h, index = 0) {
  const s = scratch(w, h, index);
  s.ctx.clearRect(0, 0, w, h);
  s.ctx.drawImage(ctx.canvas, 0, 0);
  return s.canvas;
}

/** Isolate one colour channel of `src` onto a scratch canvas. */
export function channel(src, w, h, which, index) {
  const s = scratch(w, h, index);
  s.ctx.clearRect(0, 0, w, h);
  s.ctx.drawImage(src, 0, 0);
  s.ctx.globalCompositeOperation = 'multiply';
  s.ctx.fillStyle = which === 'r' ? '#ff0000' : which === 'g' ? '#00ff00' : '#0000ff';
  s.ctx.fillRect(0, 0, w, h);
  s.ctx.globalCompositeOperation = 'source-over';
  return s.canvas;
}

/**
 * A repeatable pseudo-random from a seed.
 *
 * Every effect that looks random has to be deterministic, or the preview and
 * the export draw different frames from the same timeline position — and the
 * person only finds out after waiting for a render.
 */
export function noise(seed) {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/** Same idea, in 0..1 rather than -1..1. */
export function noise01(seed) {
  return noise(seed) * 0.5 + 0.5;
}

export const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function hexToRgba(hex, alpha) {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp01(alpha)})`;
}

/**
 * Run a pixel operation on a copy of the frame, at reduced resolution when the
 * frame is large.
 *
 * Per-pixel JavaScript on a 4K frame is eight million iterations per effect per
 * frame, which no amount of care makes fast. Working at a capped width and
 * scaling back up costs detail an effect like a threshold or a duotone does not
 * have anyway — and keeps the scrub interactive, which the person notices.
 */
export function pixels(src, w, h, cap, fn, index = 1) {
  const scale = Math.min(1, cap / Math.max(w, h));
  const sw = Math.max(1, Math.round(w * scale));
  const sh = Math.max(1, Math.round(h * scale));
  const s = scratch(sw, sh, index);
  s.ctx.clearRect(0, 0, sw, sh);
  s.ctx.drawImage(src, 0, 0, sw, sh);
  let img;
  try { img = s.ctx.getImageData(0, 0, sw, sh); } catch { return null; }
  fn(img.data, sw, sh);
  s.ctx.putImageData(img, 0, 0);
  return s.canvas;
}

/**
 * A cell size that keeps a per-cell effect affordable, and looks the same at
 * every resolution.
 *
 * Two problems, one answer. A dot size chosen while looking at a 640-wide
 * preview produces dots a third the size in a 1080p export, so the effect the
 * person approved is not the one they get — the size has to scale with the
 * frame. And scaled or not, a 4px cell at 4K is two million little draws,
 * which no amount of care makes fast, so the count is capped as well.
 *
 * The cap only ever grows cells. It never makes them smaller than asked, so a
 * deliberately coarse mosaic stays coarse.
 */
export function cellSize(want, w, h, budget = 16000) {
  const scaled = Math.max(2, want * (Math.max(w, h) / 900));
  const cells = (w / scaled) * (h / scaled);
  return cells <= budget ? scaled : scaled * Math.sqrt(cells / budget);
}

/**
 * Edge detection: the frame minus a blurred copy of itself.
 *
 * Done at a capped size and scaled back up, because the difference of two
 * blurred things carries no detail finer than the blur — running it at 4K
 * costs eight times what 1080p does and produces the same lines.
 */
export function edgeMap(src, w, h, radius, index) {
  const scale = Math.min(1, 900 / Math.max(w, h));
  const sw = Math.max(1, Math.round(w * scale)), sh = Math.max(1, Math.round(h * scale));
  const s = scratch(sw, sh, index);
  s.ctx.filter = `blur(${Math.max(0.5, radius * scale).toFixed(2)}px)`;
  s.ctx.drawImage(src, 0, 0, sw, sh);
  s.ctx.filter = 'none';
  s.ctx.globalCompositeOperation = 'difference';
  s.ctx.drawImage(src, 0, 0, sw, sh);
  s.ctx.globalCompositeOperation = 'source-over';
  return s.canvas;
}

/**
 * A blurred copy of the frame, computed small and returned small.
 *
 * A blur destroys detail by definition, so computing one at 4K and then
 * blurring it produces the same picture as computing it at 900 pixels and
 * scaling up — for eight times the work. The radius is scaled to match, so the
 * blur covers the same fraction of the frame whatever the export size, which
 * also fixes a subtler bug: a glow tuned against a small preview used to come
 * out tighter in a large export.
 *
 * The caller draws the result stretched, since it does not match pixel for
 * pixel: `ctx.drawImage(b, 0, 0, b.width, b.height, 0, 0, w, h)`.
 */
export function blurred(src, w, h, radius, extra, index, cap = 900) {
  const k = Math.min(1, cap / Math.max(w, h));
  const bw = Math.max(1, Math.round(w * k)), bh = Math.max(1, Math.round(h * k));
  const s = scratch(bw, bh, index);
  s.ctx.filter = `blur(${Math.max(0.3, radius * k).toFixed(2)}px)${extra ? ` ${extra}` : ''}`;
  s.ctx.drawImage(src, 0, 0, bw, bh);
  s.ctx.filter = 'none';
  return s.canvas;
}

/** Draw a whole canvas stretched to the frame, whatever size it came back. */
export function stretch(ctx, img, w, h) {
  ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, w, h);
}
