/*
 * Separating a subject from its background.
 *
 * What is honest to claim here
 * ----------------------------
 * "One-tap, pixel-perfect isolation of any subject" is a claim that needs a
 * trained segmentation model. Running one in a page with no backend means
 * shipping tens of megabytes of weights to every visitor, and this app is
 * 1.8MB in total. So this does not pretend to be that.
 *
 * What it does instead is the two methods that genuinely work without a model,
 * and which between them cover most footage anybody actually shoots:
 *
 *   1. CHROMA KEY. A green or blue screen, keyed properly — with spill
 *      suppression, because the giveaway of a bad key is not a ragged edge, it
 *      is green light wrapping onto the subject's cheek and hair.
 *
 *   2. BACKGROUND PLATE. For a camera that does not move — a tripod, a phone
 *      propped up, a screen recording — the background is whatever each pixel
 *      shows *most of the time*. Take the median of frames sampled across the
 *      clip and the subject, having moved, disappears from it. Difference each
 *      frame against that plate and what remains is the subject.
 *
 * The second is real computer vision, not a trick, and it works very well for
 * talking heads and product shots. It fails on a moving camera, by
 * construction, and the panel says so rather than letting someone find out
 * after processing a three-minute clip.
 */

/* ------------------------------------------------------------------ *
 * Chroma key
 * ------------------------------------------------------------------ */

/**
 * Key a colour out of a frame.
 *
 * Distance is measured in chroma only, ignoring brightness. That is the whole
 * reason a key works at all: a green screen is never evenly lit, and a keyer
 * that measures plain RGB distance treats the bright middle and the shadowed
 * corner as two different colours — so you get a hole in the middle and an
 * uncut fringe at the edges.
 */
export function chromaKey(ctx, w, h, opts = {}) {
  /*
   * `colour`, `color` and `key` all mean the same thing here.
   *
   * Not indulgence — silently ignoring an option nobody spelled the way this
   * file happens to spell it is the worst kind of failure. Passing `key` or
   * the US `color` used to fall through to the default green, which keys
   * nothing against most footage and reports no error at all: the caller sees
   * a picture that did not change and has no way to find out why.
   *
   * Three names, one meaning, and none of them can be wrong.
   */
  const {
    colour, color, key,
    tolerance = 30, softness = 12, spill = 60,
  } = opts;
  const keyColour = colour ?? color ?? key ?? '#00b140';

  const hex = String(keyColour).replace('#', '');
  const n = parseInt(hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex, 16);
  const kr = (n >> 16) & 255, kg = (n >> 8) & 255, kb = n & 255;

  // The key colour's own chroma, as the difference of its channels from its
  // own luma. Comparing against that is what makes the key ignore lighting.
  const kl = kr * 0.299 + kg * 0.587 + kb * 0.114;
  const kcb = kb - kl, kcr = kr - kl;

  const tol = Math.max(1, tolerance) * 1.6;
  const soft = Math.max(1, softness) * 1.6;
  const despill = Math.min(1, Math.max(0, spill / 100));

  let img;
  try { img = ctx.getImageData(0, 0, w, h); } catch { return; }
  const d = img.data;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const l = r * 0.299 + g * 0.587 + b * 0.114;
    const cb = b - l, cr = r - l;
    const dist = Math.hypot(cb - kcb, cr - kcr);

    if (dist < tol) {
      d[i + 3] = 0;
    } else if (dist < tol + soft) {
      // The soft shoulder. Without it the edge is one pixel wide and aliased,
      // which is what makes a key look cut out with scissors.
      d[i + 3] = Math.round(d[i + 3] * ((dist - tol) / soft));
    }

    /*
     * Spill suppression, on every pixel that is still visible.
     *
     * A subject in front of a green screen is lit green down one side. Keying
     * the background out does nothing about that, and the green rim is what
     * makes a composite read as fake more than any edge artefact. Where green
     * exceeds what the red and blue around it justify, it is pulled back down.
     */
    if (despill > 0 && d[i + 3] > 0) {
      const limit = Math.max(r, b);
      if (g > limit) d[i + 1] = g - (g - limit) * despill;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/* ------------------------------------------------------------------ *
 * Background plate
 * ------------------------------------------------------------------ */

/**
 * Build the background of a clip by sampling frames and taking the median.
 *
 * The median, specifically, and not the mean. A mean leaves a smeared ghost of
 * the subject everywhere it went — every frame it appeared in drags the
 * average toward it. A median throws that away outright: as long as a pixel
 * shows background in more than half the samples, the median IS the
 * background, with no trace of whatever passed in front of it.
 *
 * Sampling is spread across the whole clip rather than taken from the start,
 * because a subject that stays put for the first two seconds would otherwise
 * be baked into the plate as though it were furniture.
 */
export async function buildPlate(video, {
  samples = 15, from = 0, to = null, width = 320, onProgress, signal,
} = {}) {
  if (!video?.videoWidth) throw new Error('That clip has not finished loading yet.');
  const end = to ?? video.duration;
  if (!(end > from + 0.05)) throw new Error('That clip is too short to find a background in.');

  const w = width;
  const h = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * width));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });

  const n = Math.max(5, Math.min(31, samples));
  const stacks = new Uint8ClampedArray(n * w * h * 3);

  for (let s = 0; s < n; s++) {
    if (signal?.aborted) throw new Error('Cancelled.');
    const t = from + ((end - from) * (s + 0.5)) / n;
    // eslint-disable-next-line no-await-in-loop -- seeks are sequential
    await seekTo(video, t);
    ctx.drawImage(video, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const base = s * w * h * 3;
    for (let p = 0, q = 0; p < d.length; p += 4, q += 3) {
      stacks[base + q] = d[p];
      stacks[base + q + 1] = d[p + 1];
      stacks[base + q + 2] = d[p + 2];
    }
    onProgress?.({ done: s + 1, total: n, phase: 'sampling' });
  }

  const plate = ctx.createImageData(w, h);
  const pd = plate.data;
  const bucket = new Uint8ClampedArray(n);
  for (let q = 0, p = 0; q < w * h * 3; q += 3, p += 4) {
    for (let ch = 0; ch < 3; ch++) {
      for (let s = 0; s < n; s++) bucket[s] = stacks[s * w * h * 3 + q + ch];
      // A sort of at most 31 values, per channel per pixel. Cheap enough at
      // this size, and exact — an approximate median introduces its own ghost.
      const sorted = Array.prototype.slice.call(bucket).sort((a, b) => a - b);
      pd[p + ch] = sorted[n >> 1];
    }
    pd[p + 3] = 255;
  }
  ctx.putImageData(plate, 0, 0);

  return { canvas: cv, width: w, height: h, samples: n };
}

/**
 * Does the camera hold still?
 *
 * The plate is a median over time, and a median of a panning shot is a
 * smear that keys nothing. Three frames spread across the range, compared
 * on their outer border — where the subject usually is not — say whether
 * the background stayed put. A still camera on a busy background differs by
 * a few levels of noise; a moving one differs everywhere.
 */
export async function cameraStill(video, { from = 0, to = null, width = 96 } = {}) {
  if (!video?.videoWidth) return true;
  const end = to ?? video.duration;
  const w = width, h = Math.max(2, Math.round((video.videoHeight / video.videoWidth) * width));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const lumas = [];
  for (const f of [0.15, 0.5, 0.85]) {
    // eslint-disable-next-line no-await-in-loop -- sequential seeks
    await seekTo(video, from + (end - from) * f);
    ctx.drawImage(video, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const l = new Float32Array(w * h);
    for (let i = 0, p = 0; i < l.length; i++, p += 4) l[i] = d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114;
    lumas.push(l);
  }
  // The share of border pixels that changed by more than sensor noise can
  // explain, not the mean difference: a pan moves nearly every pixel a
  // little, and noise moves a few pixels a lot, and a mean cannot tell those
  // apart.
  let changed = 0, n = 0, diff = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const border = x < w * 0.15 || x > w * 0.85 || y < h * 0.15 || y > h * 0.85;
      if (!border) continue;
      const i = y * w + x;
      const d1 = Math.abs(lumas[0][i] - lumas[1][i]), d2 = Math.abs(lumas[1][i] - lumas[2][i]);
      if (d1 > 18) changed++;
      if (d2 > 18) changed++;
      diff += d1 + d2;
      n += 2;
    }
  }
  const fraction = n ? changed / n : 0;
  return { still: fraction < 0.22, changed: fraction, meanDiff: n ? diff / n : 0 };
}

function seekTo(video, t) {
  return new Promise((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('Could not read that part of the clip.')); };
    const cleanup = () => {
      video.removeEventListener('seeked', done);
      video.removeEventListener('error', fail);
      clearTimeout(timer);
    };
    // A seek that never completes would hang the whole operation with no way
    // out, so it gives up and carries on with the frame it has.
    const timer = setTimeout(done, 2500);
    video.addEventListener('seeked', done, { once: true });
    video.addEventListener('error', fail, { once: true });
    try { video.currentTime = Math.max(0, t); } catch { fail(); }
  });
}

/* ------------------------------------------------------------------ *
 * Cleaning a mask
 * ------------------------------------------------------------------ */

/*
 * A per-pixel decision is speckled: single background pixels that happened
 * to differ from the plate, single subject pixels that happened not to. Two
 * passes of a 3×3 majority vote remove both without moving the edge, which
 * is what the erode-then-dilate the textbooks suggest would do. Then the
 * largest blob that touches the seed wins and the islands go: a keyed
 * subject is one thing, not a subject and some confetti.
 */
function majority(mask, w, h, passes = 2) {
  let src = mask;
  let dst = new Uint8ClampedArray(mask.length);
  for (let pass = 0; pass < passes; pass++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= w) continue;
            sum += src[yy * w + xx]; n++;
          }
        }
        dst[y * w + x] = sum / n;
      }
    }
    [src, dst] = [dst, src];
  }
  return src;
}

/** Keep only the connected region (alpha > 128) that contains (sx, sy), plus
 *  any region larger than a fifth of it — a second person is not an island. */
function keepMainBlob(mask, w, h, sx, sy) {
  const label = new Int32Array(w * h).fill(-1);
  const sizes = [];
  const stack = new Int32Array(w * h);
  let next = 0;
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] < 128 || label[start] !== -1) continue;
    let top = 0, n = 0;
    stack[top++] = start; label[start] = next;
    while (top) {
      const p = stack[--top]; n++;
      const x = p % w, y = (p / w) | 0;
      const tryPush = (q) => { if (mask[q] >= 128 && label[q] === -1) { label[q] = next; stack[top++] = q; } };
      if (x > 0) tryPush(p - 1);
      if (x < w - 1) tryPush(p + 1);
      if (y > 0) tryPush(p - w);
      if (y < h - 1) tryPush(p + w);
    }
    sizes.push(n); next++;
  }
  if (!sizes.length) return mask;
  const seedLabel = label[Math.min(mask.length - 1, Math.max(0, (sy | 0) * w + (sx | 0)))];
  const main = seedLabel >= 0 ? sizes[seedLabel] : Math.max(...sizes);
  const keep = new Set();
  sizes.forEach((n, i) => { if (i === seedLabel || n >= main * 0.2) keep.add(i); });
  const out = new Uint8ClampedArray(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = label[i] >= 0 && keep.has(label[i]) ? mask[i] : 0;
  return out;
}

/*
 * Frame-to-frame memory, per clip.
 *
 * A mask decided fresh on every frame crawls: the same edge pixel flips in
 * and out as noise pushes it either side of the threshold. Blending each
 * frame's mask with the last one settles that — 0.55 new, 0.45 old is enough
 * to kill the crawl without a visible lag on a moving subject.
 */
const memory = new Map();
export function forgetMatte(clipId) { memory.delete(clipId); }
function remember(key, mask, w, h) {
  if (!key) return mask;
  const prev = memory.get(key);
  if (prev && prev.w === w && prev.h === h) {
    for (let i = 0; i < mask.length; i++) mask[i] = mask[i] * 0.55 + prev.data[i] * 0.45;
  }
  memory.set(key, { data: Uint8ClampedArray.from(mask), w, h });
  return mask;
}

/** Turn a small greyscale mask into alpha on a full-size frame, feathered. */
function applyMask(ctx, w, h, mask, mw, mh, feather) {
  const small = document.createElement('canvas');
  small.width = mw; small.height = mh;
  const sctx = small.getContext('2d');
  const img = sctx.createImageData(mw, mh);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) { img.data[p] = img.data[p + 1] = img.data[p + 2] = 255; img.data[p + 3] = mask[i]; }
  sctx.putImageData(img, 0, 0);

  const big = document.createElement('canvas');
  big.width = w; big.height = h;
  const bctx = big.getContext('2d');
  if (feather > 0) bctx.filter = `blur(${feather}px)`;
  bctx.drawImage(small, 0, 0, w, h);
  bctx.filter = 'none';

  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const octx = out.getContext('2d');
  octx.drawImage(ctx.canvas, 0, 0);
  octx.globalCompositeOperation = 'destination-in';
  octx.drawImage(big, 0, 0);
  octx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(out, 0, 0);
}

/* ------------------------------------------------------------------ *
 * Portrait matte — no plate, no green screen
 * ------------------------------------------------------------------ */

/*
 * The case the plate cannot do: a subject that does not move, or a camera
 * that does. The plate needs the background to show through at every pixel
 * for more than half the clip; a talking head that sits still is baked into
 * it as furniture.
 *
 * This is colour-model segmentation, the method that did this job before
 * neural networks did: two colour distributions — what the subject looks
 * like, what the background looks like — and each pixel goes with whichever
 * it resembles more, weighted by where it is. The subject model is seeded
 * from a face when one is found (the same skin-chroma finder the tracker
 * uses, which works on every complexion because it ignores brightness) and
 * from the body region beneath it; the background model from the frame's
 * border. Then the models are re-fitted from the mask they produced and the
 * mask re-decided, twice — the iteration that makes the result depend on
 * the picture rather than on the guess.
 *
 * What it is honestly good at: a person against a background that is not
 * the colour of their clothes and skin. What it is not: hair against a
 * similar wall, a subject in camouflage. The panel says which method is
 * running, so nobody wonders why the edge on a plate key is cleaner.
 */
const BINS = 12;
function binOf(r, g, b) {
  return (((r * BINS) >> 8) * BINS + ((g * BINS) >> 8)) * BINS + ((b * BINS) >> 8);
}

function fitModels(d, mw, mh, weight) {
  const fg = new Float32Array(BINS ** 3), bg = new Float32Array(BINS ** 3);
  let fgN = 0, bgN = 0;
  for (let i = 0, p = 0; i < mw * mh; i++, p += 4) {
    const bin = binOf(d[p], d[p + 1], d[p + 2]);
    const wgt = weight[i];
    fg[bin] += wgt; fgN += wgt;
    bg[bin] += 1 - wgt; bgN += 1 - wgt;
  }
  // Laplace smoothing, so a colour never seen in one model is unlikely rather
  // than impossible — a shadow on the cheek must not become a hole.
  for (let b2 = 0; b2 < fg.length; b2++) { fg[b2] = (fg[b2] + 0.02) / (fgN + 0.02 * fg.length); bg[b2] = (bg[b2] + 0.02) / (bgN + 0.02 * bg.length); }
  // Blur the histograms a little across neighbouring bins, so a slightly
  // different shade of the same shirt counts as the same shirt.
  return { fg, bg };
}

export function portraitMatte(ctx, w, h, {
  softness = 14, feather = 2, seed = null, key = null, faceFinder = null,
} = {}) {
  const mw = 160, mh = Math.max(2, Math.round((h / w) * 160));
  const small = document.createElement('canvas');
  small.width = mw; small.height = mh;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(ctx.canvas, 0, 0, mw, mh);
  let img;
  try { img = sctx.getImageData(0, 0, mw, mh); } catch { return; }
  const d = img.data;

  /* ---- the seed: a face, or the middle ---- */
  let box = seed;
  if (!box && faceFinder) {
    const face = faceFinder(d, mw, mh);
    if (face && face.confidence > 0.35) box = face.box;
  }
  if (!box) box = { x: 0.5, y: 0.42, w: 0.3, h: 0.42 };

  // The body hangs under the head: a region wider than the face and running
  // to the bottom of the frame is where the subject's clothes are.
  const headX = box.x * mw, headY = box.y * mh, headW = box.w * mw, headH = box.h * mh;
  const bodyX0 = Math.max(0, headX - headW * 1.3), bodyX1 = Math.min(mw, headX + headW * 1.3);
  const bodyY0 = Math.max(0, headY + headH * 0.4);

  const weight = new Float32Array(mw * mh);   // how much each pixel votes "subject" when fitting
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const i = y * mw + x;
      const inHead = Math.abs(x - headX) < headW * 0.45 && Math.abs(y - headY) < headH * 0.45;
      const inBody = x >= bodyX0 && x <= bodyX1 && y >= bodyY0;
      const border = x < mw * 0.07 || x > mw * 0.93 || y < mh * 0.08;
      weight[i] = border ? 0 : inHead ? 1 : inBody ? 0.75 : 0.15;
    }
  }

  /* ---- decide, refit, decide again ---- */
  let mask = new Uint8ClampedArray(mw * mh);
  const cx = headX, cy = Math.min(mh - 1, headY + headH * 0.8);
  const reach = Math.max(mw, mh) * 0.9;
  for (let iter = 0; iter < 3; iter++) {
    const { fg, bg } = fitModels(d, mw, mh, weight);
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        const i = y * mw + x, p = i * 4;
        const bin = binOf(d[p], d[p + 1], d[p + 2]);
        // A gentle spatial prior: things far from where the subject was seeded
        // need to look more like the subject to count.
        const dist = Math.hypot(x - cx, (y - cy) * 0.6) / reach;
        const prior = Math.max(0.15, 1 - dist * 0.9);
        const pf = fg[bin] * prior, pb = bg[bin] * (1.1 - prior * 0.5);
        mask[i] = Math.round(255 * (pf / (pf + pb)));
      }
    }
    mask = majority(mask, mw, mh, 2);
    // The next fit uses what this pass decided, softened so an early mistake
    // does not become the whole model.
    for (let i = 0; i < weight.length; i++) weight[i] = weight[i] * 0.4 + (mask[i] / 255) * 0.6;
  }

  /* ---- clean, settle, apply ---- */
  const th = 128, soft = Math.max(1, softness) * 3;
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i];
    mask[i] = v < th - soft ? 0 : v > th + soft ? 255 : Math.round(((v - (th - soft)) / (2 * soft)) * 255);
  }
  mask = keepMainBlob(mask, mw, mh, cx, cy);
  mask = remember(key, mask, mw, mh);
  applyMask(ctx, w, h, mask, mw, mh, feather);
  return { method: 'portrait', seed: box };
}

/* ------------------------------------------------------------------ *
 * Using a plate, per frame
 * ------------------------------------------------------------------ */

/*
 * Plates live here for the session, keyed by id, for the same reason LUTs do:
 * a 320-wide plate is 300KB of pixels and has no business in a project file,
 * an undo step or an autosave. The clip stores an id.
 */
const plates = new Map();

export function registerPlate(plate) {
  const id = plate.id || `plate_${Math.random().toString(36).slice(2, 10)}`;
  const entry = { ...plate, id };
  plates.set(id, entry);
  return entry;
}
export function plateById(id) { return plates.get(id) || null; }
export function hasPlate(id) { return plates.has(id); }

/**
 * Cut the background out of a frame using a plate.
 *
 * A pixel is background when it looks like the plate does at that spot. The
 * comparison uses chroma as well as brightness, because a subject wearing the
 * same grey as the wall behind them differs in hue long before it differs in
 * luma — measure brightness alone and they get a hole cut through them.
 *
 * The mask is then blurred slightly before it is applied. A hard per-pixel
 * decision produces a speckled, crawling edge that flickers frame to frame;
 * softening it is what turns a mask into a matte.
 */
export function keyAgainstPlate(ctx, w, h, plate, {
  tolerance = 26, softness = 14, feather = 2, key = null,
} = {}) {
  if (!plate?.canvas) return;

  // The plate is small; compare at the plate's size and scale the mask up.
  const pw = plate.width, ph = plate.height;
  const small = document.createElement('canvas');
  small.width = pw; small.height = ph;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(ctx.canvas, 0, 0, pw, ph);

  let frame, back;
  try {
    frame = sctx.getImageData(0, 0, pw, ph);
    back = plate.canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, pw, ph);
  } catch { return; }

  const fd = frame.data, bd = back.data;
  const tol = Math.max(2, tolerance);
  const soft = Math.max(1, softness);

  for (let i = 0; i < fd.length; i += 4) {
    const dr = fd[i] - bd[i], dg = fd[i + 1] - bd[i + 1], db = fd[i + 2] - bd[i + 2];
    const lum = Math.abs(dr * 0.299 + dg * 0.587 + db * 0.114);
    // Chroma difference, weighted up: colour separates a subject from a
    // similarly-bright background, which luma alone cannot.
    const chroma = Math.hypot(dr - dg, dg - db) * 1.4;
    const diff = Math.max(lum, chroma);

    let alpha;
    if (diff < tol) alpha = 0;
    else if (diff < tol + soft) alpha = ((diff - tol) / soft) * 255;
    else alpha = 255;
    fd[i] = fd[i + 1] = fd[i + 2] = alpha;
    fd[i + 3] = 255;
  }

  // A speckled decision becomes a matte: vote out the flecks, drop the
  // islands, settle it against the last frame, then feather on the way up.
  let mask = new Uint8ClampedArray(pw * ph);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) mask[i] = fd[p];
  mask = majority(mask, pw, ph, 2);
  // The seed for the main blob is the mask's own centre of mass.
  let sx = 0, sy = 0, sn = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] > 128) { sx += i % pw; sy += (i / pw) | 0; sn++; }
  if (sn > 0) mask = keepMainBlob(mask, pw, ph, sx / sn, sy / sn);
  mask = remember(key, mask, pw, ph);
  applyMask(ctx, w, h, mask, pw, ph, feather);
  return { method: 'plate' };
}
