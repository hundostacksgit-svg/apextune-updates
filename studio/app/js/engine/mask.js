/*
 * Masks: shapes that say where an effect or a grade is allowed to happen.
 *
 * Resolve calls them power windows, After Effects calls them masks, Premiere
 * puts them in the effect controls. They are the same idea and it is the one
 * the app had no answer to at all: every grade and every effect applied to the
 * whole frame, which is fine for a look and useless for "brighten his face"
 * or "take the sky down two stops".
 *
 * Three shapes, because three cover the work: a rectangle for a horizon or a
 * sign, an ellipse for a face or a vignette, and a polygon for everything
 * neither of those fits. All three feather, rotate, invert, and animate — the
 * corners are ordinary keyframed properties, so a mask follows a moving
 * subject with the same machinery a position does, and a motion track can be
 * pinned straight onto one.
 *
 * The qualifier is the other half of a secondary. A shape says *where*; a
 * qualifier says *what colour*, and between them you can grade one jacket in a
 * crowd. Together they intersect, which is how every colourist expects them to
 * behave: the window limits the qualifier to a region rather than fighting it.
 */

import { valueAt } from './project.js';

export const SHAPES = ['rect', 'ellipse', 'polygon'];

let seq = 0;
export function newMask(shape = 'ellipse') {
  seq += 1;
  return {
    id: `mk${Date.now().toString(36)}${seq}`,
    shape: SHAPES.includes(shape) ? shape : 'ellipse',
    /* Everything is a fraction of the frame, never pixels: a mask drawn on a
       1080p preview has to mean the same thing in a 4K export. */
    x: 0.5, y: 0.5, w: 0.4, h: 0.4,
    angle: 0,
    feather: 0.08,
    invert: false,
    opacity: 1,
    /* Only used by the polygon: points as fractions of the frame. */
    points: null,
    /* What it limits: 'grade' (a power window), 'clip' (cuts the picture
       itself out), or an effect's id. */
    target: 'grade',
    on: true,
  };
}

/** A mask's live geometry at a moment, with any keyframed corner resolved. */
export function maskAt(clip, mask, t) {
  const read = (k) => valueAt(clip, `masks.${mask.id}.${k}`, t, mask[k]);
  return {
    ...mask,
    x: read('x'), y: read('y'), w: read('w'), h: read('h'),
    angle: read('angle'), feather: read('feather'), opacity: read('opacity'),
  };
}

/** Every mask on a clip aimed at one target, in draw order. */
export function masksFor(clip, target) {
  return (clip.masks || []).filter((m) => m.on !== false && (m.target || 'grade') === target);
}

export function hasMask(clip, target) { return masksFor(clip, target).length > 0; }

/* ------------------------------------------------------------------ */
/* painting the shape                                                  */
/* ------------------------------------------------------------------ */

/*
 * The feather is a real gradient, not a blurred fill.
 *
 * ctx.filter = 'blur()' on the mask would be simpler and is what the first
 * version did; it costs a full-frame convolution every frame and softens the
 * shape unevenly once it is rotated. A gradient is exact, free, and rotates
 * with the shape because it is drawn in the shape's own transformed space.
 */
function paintOne(ctx, m, w, h) {
  const cx = m.x * w, cy = m.y * h;
  const rx = Math.max(0.5, (m.w * w) / 2);
  const ry = Math.max(0.5, (m.h * h) / 2);
  const feather = Math.max(0, Math.min(0.95, m.feather ?? 0));

  ctx.save();
  ctx.translate(cx, cy);
  if (m.angle) ctx.rotate((m.angle * Math.PI) / 180);
  ctx.globalAlpha = Math.max(0, Math.min(1, m.opacity ?? 1));

  if (m.shape === 'ellipse') {
    if (feather < 0.004) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      // Scaled to a circle so one radial gradient serves any aspect.
      ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(0, 0, rx * (1 - feather), 0, 0, rx);
      g.addColorStop(0, '#fff');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
    }
  } else if (m.shape === 'rect') {
    /*
     * A rectangle's softness is a blur, not a stack of gradients.
     *
     * The first version drew four edge gradients and four corner radials to
     * avoid the blur pass. It worked and it was forty lines of arithmetic that
     * had to be right at every aspect and rotation — and a blur on a rectangle
     * is exactly even anyway, which is the only thing the gradients bought.
     * The ellipse keeps its gradient because there a blur is *not* even once
     * the shape is stretched.
     */
    if (feather > 0.004) ctx.filter = `blur(${(feather * Math.min(rx, ry) * 0.8).toFixed(1)}px)`;
    ctx.fillStyle = '#fff';
    const fx = rx * feather * 0.6, fy = ry * feather * 0.6;
    ctx.fillRect(-rx + fx, -ry + fy, (rx - fx) * 2, (ry - fy) * 2);
    ctx.filter = 'none';
  } else {
    const pts = m.points?.length >= 3 ? m.points : squarePoints();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    pts.forEach((p, i) => {
      const px = (p.x - 0.5) * 2 * rx, py = (p.y - 0.5) * 2 * ry;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
    // A polygon's softness does need a blur: there is no gradient that follows
    // an arbitrary outline, and the shapes are small enough for it to be cheap.
    if (feather > 0.004) ctx.filter = `blur(${(feather * Math.min(rx, ry) * 0.9).toFixed(1)}px)`;
    ctx.fill();
    ctx.filter = 'none';
  }
  ctx.restore();
}

function squarePoints() {
  return [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.15 }, { x: 0.85, y: 0.9 }, { x: 0.15, y: 0.8 }];
}

/*
 * One canvas, reused. A fresh full-size canvas per frame is 8MB of garbage at
 * 1080p and 33MB at 4K, sixty times a second.
 */
/*
 * One pad per purpose, and never one shared between them.
 *
 * The shape matte and the colour matte are both built here and then
 * intersected, so a single shared canvas means the second call wipes the first
 * and the intersection silently becomes whichever ran last. Keyed by name.
 */
const pads = new Map();
function scratchMask(w, h, name = 'shape') {
  let pad = pads.get(name);
  if (!pad || pad.canvas.width !== w || pad.canvas.height !== h) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    pad = { canvas, ctx: canvas.getContext('2d', { willReadFrequently: false }) };
    pads.set(name, pad);
  }
  pad.ctx.setTransform(1, 0, 0, 1, 0, 0);
  pad.ctx.globalAlpha = 1;
  pad.ctx.globalCompositeOperation = 'source-over';
  pad.ctx.filter = 'none';
  pad.ctx.clearRect(0, 0, w, h);
  return pad;
}

/**
 * The matte for a clip's masks: white where the treatment applies.
 *
 * Returns null when there are none, so the renderer can skip the whole
 * compositing path rather than multiplying by a canvas of solid white.
 *
 * The canvas it returns is reused — a fresh one per frame is 8MB of garbage at
 * 1080p, sixty times a second — so it is only valid until the next call with
 * the same `pad`. Hold two mattes at once and you must name two pads, which is
 * exactly what combinedMatte does.
 */
export function maskMatte(clip, target, w, h, t, pad = 'shape') {
  const list = masksFor(clip, target);
  if (!list.length) return null;

  const { canvas, ctx } = scratchMask(w, h, pad);
  /*
   * Inverted masks are painted as holes in a full frame, not as a separate
   * pass. Several masks where some are inverted then behave the way anybody
   * expects: two ordinary windows add together, and an inverted one cuts out
   * of whatever is already there.
   */
  const anyNormal = list.some((m) => !m.invert);
  if (!anyNormal) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }

  for (const raw of list) {
    const m = maskAt(clip, raw, t);
    if (m.invert) {
      // Cut this shape out of whatever is already there — the full frame when
      // every mask is inverted, or the other windows when some are not.
      ctx.globalCompositeOperation = 'destination-out';
      paintOne(ctx, m, w, h);
      ctx.globalCompositeOperation = 'source-over';
    } else {
      paintOne(ctx, m, w, h);
    }
  }
  return canvas;
}

/* ------------------------------------------------------------------ */
/* the qualifier                                                       */
/* ------------------------------------------------------------------ */

export function newQualifier() {
  return {
    on: false,
    hue: { centre: 30, width: 40, soft: 20 },       // degrees
    sat: { low: 0.15, high: 1, soft: 0.12 },        // 0..1
    lum: { low: 0.1, high: 0.95, soft: 0.1 },       // 0..1
    invert: false,
    blur: 2,                                        // soften the key's edges
  };
}

export function qualifierIsOn(q) { return Boolean(q?.on); }

/* A band with soft shoulders: 1 inside, 0 outside, a ramp between. The whole
   qualifier is three of these multiplied together. */
function band(v, low, high, soft) {
  if (soft <= 0) return v >= low && v <= high ? 1 : 0;
  if (v < low - soft || v > high + soft) return 0;
  if (v < low) return (v - (low - soft)) / soft;
  if (v > high) return ((high + soft) - v) / soft;
  return 1;
}

/*
 * Hue wraps, so the distance is the short way round the circle.
 *
 * The first version wrote this as `180 - |((h - c + 540) % 360) - 180|`, which
 * is the *long* way round: picking red at hue 0 gave a distance of 180 and
 * selected nothing at all. The qualifier keyed a solid black matte and looked
 * like it was simply broken rather than inverted.
 */
function hueBand(hDeg, centre, width, soft) {
  let d = Math.abs(hDeg - centre) % 360;
  if (d > 180) d = 360 - d;
  return band(d, 0, width / 2, soft);
}

/** RGB to hue in degrees, saturation and lightness in 0..1. */
export function rgbToHsl(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 1e-6) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0));
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

/**
 * Build a matte from a frame's own colours.
 *
 * Runs on the pixels, which is the only place colour selection can happen, and
 * is therefore the one part of this that costs real time — about 9ms on a
 * 1080p frame. Only ever called when the qualifier is switched on.
 */
/* The output buffer, reused. createImageData allocates two megabytes, and
   allocating that per frame is most of what a garbage collector then does. */
let keyBuf = null;
function keyImage(ctx, w, h) {
  if (!keyBuf || keyBuf.width !== w || keyBuf.height !== h) keyBuf = ctx.createImageData(w, h);
  return keyBuf;
}

/**
 * Build a matte from a frame's own colours.
 *
 * Everything happens at half resolution above 720p and the blur happens there
 * too, which is the whole performance story: keying 1080p at full size with a
 * full-size blur measured 117ms — seven frames' budget to key one — and the
 * blur alone was 33ms of it.
 *
 * It costs nothing visually because the matte is deliberately soft. Every
 * qualifier in every grading tool blurs its key, since a hard per-pixel
 * selection turns every compression artefact into a hole; a blurred matte
 * scaled up is indistinguishable from one blurred at full size, and the
 * upscale itself adds a little more softness for free.
 */
export function qualifierMatte(ctx, w, h, q) {
  if (!qualifierIsOn(q)) return null;

  const scale = w * h > 700_000 ? 0.5 : 1;
  const kw = Math.max(2, Math.round(w * scale));
  const kh = Math.max(2, Math.round(h * scale));

  let readCtx = ctx;
  if (scale !== 1) {
    const small = scratchMask(kw, kh, 'key-src');
    small.ctx.drawImage(ctx.canvas, 0, 0, kw, kh);
    readCtx = small.ctx;
  }

  const d = readCtx.getImageData(0, 0, kw, kh).data;
  const out = keyImage(readCtx, kw, kh);
  const o = out.data;

  /*
   * Written out flat rather than through rgbToHsl.
   *
   * That helper returns an object, and half a million objects a frame is half
   * a million allocations the collector has to walk. The same arithmetic
   * inline, with the constants hoisted out of the loop, is several times
   * faster. rgbToHsl stays for everything that reads one pixel rather than all
   * of them.
   */
  const hc = q.hue.centre, hw = q.hue.width / 2, hs = q.hue.soft;
  const sl = q.sat.low, sh = q.sat.high, ss = q.sat.soft;
  const ll = q.lum.low, lh = q.lum.high, ls = q.lum.soft;
  const inv = q.invert;
  const greyPass = band(0, sl, sh, ss);          // constant: grey has no hue

  for (let i = 0; i < d.length; i += 4) {
    const rn = d[i] / 255, gn = d[i + 1] / 255, bn = d[i + 2] / 255;
    const max = rn > gn ? (rn > bn ? rn : bn) : (gn > bn ? gn : bn);
    const min = rn < gn ? (rn < bn ? rn : bn) : (gn < bn ? gn : bn);
    const l = (max + min) / 2;
    const delta = max - min;

    let a;
    if (delta < 1e-6) {
      // Grey has no hue to match, so only the saturation band can pass it —
      // and a qualifier with any saturation floor at all will not.
      a = greyPass * band(l, ll, lh, ls);
    } else {
      const lumPass = band(l, ll, lh, ls);
      if (lumPass === 0) a = 0;
      else {
        const sat = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
        const satPass = band(sat, sl, sh, ss);
        if (satPass === 0) a = 0;
        else {
          let hue;
          if (max === rn) hue = ((gn - bn) / delta + (gn < bn ? 6 : 0)) * 60;
          else if (max === gn) hue = ((bn - rn) / delta + 2) * 60;
          else hue = ((rn - gn) / delta + 4) * 60;
          let hd = Math.abs(hue - hc) % 360;
          if (hd > 180) hd = 360 - hd;
          a = band(hd, 0, hw, hs) * satPass * lumPass;
        }
      }
    }
    if (inv) a = 1 - a;
    o[i] = 255; o[i + 1] = 255; o[i + 2] = 255; o[i + 3] = a * 255;
  }

  const keyed = scratchMask(kw, kh, 'key-out');
  keyed.ctx.putImageData(out, 0, 0);

  // Softened at the small size, where a blur is six milliseconds rather than
  // thirty-three.
  if (q.blur > 0.1) {
    const soft = scratchMask(kw, kh, 'soften');
    soft.ctx.filter = `blur(${Math.max(0.5, q.blur * scale).toFixed(2)}px)`;
    soft.ctx.drawImage(keyed.canvas, 0, 0);
    soft.ctx.filter = 'none';
    keyed.ctx.clearRect(0, 0, kw, kh);
    keyed.ctx.drawImage(soft.canvas, 0, 0);
  }

  if (scale === 1) return keyed.canvas;

  const { canvas, ctx: mctx } = scratchMask(w, h, 'qualifier');
  mctx.imageSmoothingEnabled = true;
  mctx.imageSmoothingQuality = 'high';
  mctx.drawImage(keyed.canvas, 0, 0, kw, kh, 0, 0, w, h);
  return canvas;
}

/**
 * Shape and colour together, intersected.
 *
 * A window limits a qualifier rather than competing with it — "this colour,
 * but only over there" — which is what every colourist means by the two
 * together, and the reason a secondary is usable at all on a busy frame.
 */
export function combinedMatte(clip, target, ctx, w, h, t) {
  const shape = maskMatte(clip, target, w, h, t);
  const q = clip.color?.qualifier;
  if (!qualifierIsOn(q)) return shape;

  const colour = qualifierMatte(ctx, w, h, q);
  if (!colour) return shape;
  if (!shape) return colour;

  // Both: keep only where they agree.
  const merged = scratchMask(w, h, 'both');
  merged.ctx.drawImage(colour, 0, 0);
  merged.ctx.globalCompositeOperation = 'destination-in';
  merged.ctx.drawImage(shape, 0, 0);
  merged.ctx.globalCompositeOperation = 'source-over';
  return merged.canvas;
}
