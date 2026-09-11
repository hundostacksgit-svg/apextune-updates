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
  tolerance = 26, softness = 14, feather = 2,
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
    // The mask is written into the plate copy's own buffer as white-on-black,
    // so it can be drawn as an image and blurred by the compositor.
    fd[i] = fd[i + 1] = fd[i + 2] = alpha;
    fd[i + 3] = 255;
  }
  sctx.putImageData(frame, 0, 0);

  const mask = document.createElement('canvas');
  mask.width = w; mask.height = h;
  const mctx = mask.getContext('2d');
  // Feathering happens here, on the way up to full size — cheaper than
  // blurring a 4K mask, and the softness is in the right proportion either way.
  if (feather > 0) mctx.filter = `blur(${feather}px)`;
  mctx.drawImage(small, 0, 0, w, h);
  mctx.filter = 'none';

  // Turn the greyscale mask into alpha on the frame.
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const octx = out.getContext('2d');
  octx.drawImage(ctx.canvas, 0, 0);
  octx.globalCompositeOperation = 'destination-in';
  // `luminosity` first would be ideal; instead the mask is drawn with its own
  // luminance as alpha, which `destination-in` against a white-on-black image
  // achieves once the mask is converted.
  const maskAlpha = mctx.getImageData(0, 0, w, h);
  const md = maskAlpha.data;
  for (let i = 0; i < md.length; i += 4) {
    md[i + 3] = md[i];
    md[i] = md[i + 1] = md[i + 2] = 255;
  }
  mctx.putImageData(maskAlpha, 0, 0);
  octx.drawImage(mask, 0, 0);
  octx.globalCompositeOperation = 'source-over';

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(out, 0, 0);
}
