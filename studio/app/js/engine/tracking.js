/*
 * Motion tracking.
 *
 * Draw a box round something, press Track, and this follows it through the
 * clip and hands back a path you can pin text, a sticker or a blur to.
 *
 * How it works, honestly: this is normalised cross-correlation over an image
 * pyramid, with sub-pixel peak fitting, periodic scale search and a slowly
 * updated template. That is classical computer vision, not a neural network —
 * no model to download, nothing sent anywhere, and it runs on a phone. It is
 * also what the tracker in most editors is doing underneath, and it is very
 * good at what people actually track: a face, a phone screen, a logo, a car,
 * a number plate.
 *
 * Where it struggles, and the UI says so rather than producing a silently
 * wrong path: the subject leaving frame, a hard cut inside the range, heavy
 * motion blur, or something that changes shape completely (a person turning
 * right round). Confidence is reported per frame, and a run that loses the
 * target stops and tells you where.
 */

const ANALYSIS_WIDTH = 480;      // everything below works at this width
const SEARCH_RADIUS = 0.55;      // of the template size, per level
const SCALE_STEPS = [0.94, 1, 1.06];
const TEMPLATE_BLEND = 0.12;     // how fast the template adapts
const LOST_THRESHOLD = 0.32;     // NCC below this for several frames = lost

/* ------------------------------------------------------------------ */
/* frame access                                                        */
/* ------------------------------------------------------------------ */

class FrameReader {
  constructor(video, width = ANALYSIS_WIDTH) {
    this.video = video;
    const ratio = (video.videoHeight || 9) / (video.videoWidth || 16);
    this.w = width;
    this.h = Math.max(2, Math.round(width * ratio));
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  }

  seek(time) {
    return new Promise((resolve) => {
      const target = Math.max(0, Math.min(time, (this.video.duration || 0) - 0.02));
      if (Math.abs(this.video.currentTime - target) < 0.004) { resolve(true); return; }
      const done = () => { clearTimeout(bail); resolve(true); };
      const bail = setTimeout(() => {
        this.video.removeEventListener('seeked', done);
        resolve(false);
      }, 2500);
      this.video.addEventListener('seeked', done, { once: true });
      try { this.video.currentTime = target; } catch { clearTimeout(bail); resolve(false); }
    });
  }

  /** Luma plane for the current frame. Tracking on brightness alone is both
   *  faster and steadier than tracking on colour. */
  luma() {
    this.ctx.drawImage(this.video, 0, 0, this.w, this.h);
    const { data } = this.ctx.getImageData(0, 0, this.w, this.h);
    const out = new Float32Array(this.w * this.h);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      out[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    }
    return out;
  }
}

/* ------------------------------------------------------------------ */
/* patches and correlation                                             */
/* ------------------------------------------------------------------ */

/** Pull a w×h patch centred on (cx, cy), sampled at `scale`. */
function patchAt(plane, planeW, planeH, cx, cy, pw, ph, scale = 1) {
  const out = new Float32Array(pw * ph);
  const sw = pw * scale, sh = ph * scale;
  const x0 = cx - sw / 2, y0 = cy - sh / 2;
  for (let y = 0; y < ph; y++) {
    const sy = Math.round(y0 + (y / ph) * sh);
    const row = Math.max(0, Math.min(planeH - 1, sy)) * planeW;
    for (let x = 0; x < pw; x++) {
      const sx = Math.round(x0 + (x / pw) * sw);
      out[y * pw + x] = plane[row + Math.max(0, Math.min(planeW - 1, sx))];
    }
  }
  return out;
}

function stats(patch) {
  let sum = 0;
  for (let i = 0; i < patch.length; i++) sum += patch[i];
  const mean = sum / patch.length;
  let ss = 0;
  for (let i = 0; i < patch.length; i++) { const d = patch[i] - mean; ss += d * d; }
  return { mean, norm: Math.sqrt(ss) || 1e-6 };
}

/** Normalised cross-correlation of two equal-sized patches, −1..1. */
function ncc(a, aStats, b) {
  const bStats = stats(b);
  let acc = 0;
  for (let i = 0; i < a.length; i++) acc += (a[i] - aStats.mean) * (b[i] - bStats.mean);
  return acc / (aStats.norm * bStats.norm);
}

/**
 * Sub-pixel peak: fit a parabola through the best score and its neighbours.
 * Without this a track jitters by a whole pixel every frame and pinned text
 * visibly buzzes.
 */
function subpixel(left, centre, right) {
  const denom = left - 2 * centre + right;
  if (Math.abs(denom) < 1e-9) return 0;
  const delta = (0.5 * (left - right)) / denom;
  return Math.abs(delta) < 1 ? delta : 0;
}

/* ------------------------------------------------------------------ */
/* the search                                                          */
/* ------------------------------------------------------------------ */

function searchAround(plane, planeW, planeH, template, tStats, pw, ph, cx, cy, radius, step, scale) {
  let best = { score: -2, x: cx, y: cy, scale };
  const scores = new Map();
  for (let dy = -radius; dy <= radius; dy += step) {
    for (let dx = -radius; dx <= radius; dx += step) {
      const x = cx + dx, y = cy + dy;
      const candidate = patchAt(plane, planeW, planeH, x, y, pw, ph, scale);
      const score = ncc(template, tStats, candidate);
      scores.set(`${dx},${dy}`, score);
      if (score > best.score) best = { score, x, y, scale };
    }
  }

  // Refine to sub-pixel using the scores either side of the winner.
  const dx = Math.round(best.x - cx), dy = Math.round(best.y - cy);
  const at = (ox, oy) => scores.get(`${ox},${oy}`) ?? best.score;
  if (step === 1) {
    best.x += subpixel(at(dx - 1, dy), best.score, at(dx + 1, dy));
    best.y += subpixel(at(dx, dy - 1), best.score, at(dx, dy + 1));
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Track a box through a video.
 *
 * `box` is in 0..1 of the frame: { x, y, w, h } with x/y the centre.
 * Returns { points: [{ t, x, y, scale, confidence }], lostAt, mean }.
 * Positions come back in the same 0..1 frame space, so they survive any
 * resolution change and can be applied to a clip at any size.
 */
export async function trackBox(video, {
  box, from = 0, to = null, fps = 15, onProgress, signal,
} = {}) {
  if (!video?.videoWidth) throw new Error('That clip has not finished loading yet.');
  const reader = new FrameReader(video);
  const end = to ?? video.duration;
  const step = 1 / Math.max(2, fps);
  const total = Math.max(1, Math.ceil((end - from) / step));
  if (!(end > from)) throw new Error('The range to track is empty.');

  // Template size in analysis pixels, clamped: too small and it latches onto
  // noise, too large and it cannot follow anything that moves quickly.
  const pw = Math.max(12, Math.min(96, Math.round(box.w * reader.w)));
  const ph = Math.max(12, Math.min(96, Math.round(box.h * reader.h)));

  await reader.seek(from);
  let first = reader.luma();
  let cx = box.x * reader.w;
  let cy = box.y * reader.h;
  let scale = 1;

  let template = patchAt(first, reader.w, reader.h, cx, cy, pw, ph, 1);
  let tStats = stats(template);

  /*
   * Two things go wrong before tracking even starts, and both used to end as a
   * baffling "lost it at 0.1s".
   *
   * The first frame of a file can be blank — some encoders open on black, and a
   * screen recording often does. Nudge forward and try again rather than
   * locking onto nothing.
   */
  if (tStats.norm / template.length < 0.4) {
    const nudged = Math.min(from + step * 2, end - step);
    if (nudged > from) {
      // eslint-disable-next-line no-await-in-loop -- one retry, deliberately
      await reader.seek(nudged);
      first = reader.luma();
      template = patchAt(first, reader.w, reader.h, cx, cy, pw, ph, 1);
      tStats = stats(template);
    }
  }

  /*
   * The second is a box with nothing in it — flat sky, a white wall, an
   * out-of-focus background. Correlation is meaningless there and the honest
   * answer is to say so, with the fix, instead of producing a path that is
   * quietly wrong.
   */
  const contrast = tStats.norm / Math.sqrt(template.length);
  if (contrast < 3.5) {
    throw new Error(
      'There is not enough detail in that box to follow. '
      + 'Put it on something with an edge or a pattern — an eye, a logo, a corner, a number plate — '
      + 'rather than a flat area like sky, skin or a plain wall.',
    );
  }

  const original = template.slice();
  const originalStats = { ...tStats };

  const points = [{ t: from, x: box.x, y: box.y, scale: 1, confidence: 1 }];
  let lostRun = 0;
  let lostAt = null;
  let scoreSum = 0;
  let scoreCount = 0;

  for (let i = 1; i <= total; i++) {
    if (signal?.aborted) break;
    const t = Math.min(end, from + i * step);
    // eslint-disable-next-line no-await-in-loop -- frames must be read in order
    const ok = await reader.seek(t);
    if (!ok) break;
    // eslint-disable-next-line no-await-in-loop
    const plane = reader.luma();

    // Coarse pass over a wide radius on a big step, then a fine pass. This is
    // the pyramid: it finds fast movement without correlating every pixel.
    const radius = Math.max(6, Math.round(Math.max(pw, ph) * SEARCH_RADIUS));
    let best = searchAround(plane, reader.w, reader.h, template, tStats, pw, ph, cx, cy, radius, 3, scale);
    best = searchAround(plane, reader.w, reader.h, template, tStats, pw, ph, best.x, best.y, 3, 1, scale);

    // Every few frames, allow the box to grow or shrink.
    if (i % 4 === 0) {
      for (const s of SCALE_STEPS) {
        if (s === scale) continue;
        const candidate = patchAt(plane, reader.w, reader.h, best.x, best.y, pw, ph, s);
        const score = ncc(template, tStats, candidate);
        if (score > best.score + 0.02) { best = { ...best, score, scale: s }; }
      }
    }

    // If the adapted template has drifted onto something else, the original
    // frame is usually still the better match — check and snap back.
    const againstOriginal = ncc(original, originalStats,
      patchAt(plane, reader.w, reader.h, best.x, best.y, pw, ph, best.scale));
    if (againstOriginal > best.score + 0.08) {
      template = original.slice();
      tStats = { ...originalStats };
      best.score = againstOriginal;
    }

    cx = best.x; cy = best.y; scale = best.scale;
    scoreSum += best.score; scoreCount++;

    if (best.score < LOST_THRESHOLD) {
      lostRun++;
      if (lostRun >= 4) { lostAt = t; break; }
    } else {
      lostRun = 0;
      // Blend the current appearance in slowly so lighting and angle changes
      // don't accumulate into a lost track.
      const fresh = patchAt(plane, reader.w, reader.h, cx, cy, pw, ph, scale);
      for (let k = 0; k < template.length; k++) {
        template[k] = template[k] * (1 - TEMPLATE_BLEND) + fresh[k] * TEMPLATE_BLEND;
      }
      tStats = stats(template);
    }

    points.push({
      t: Number(t.toFixed(4)),
      x: Number((cx / reader.w).toFixed(5)),
      y: Number((cy / reader.h).toFixed(5)),
      scale: Number(scale.toFixed(4)),
      confidence: Number(Math.max(0, best.score).toFixed(3)),
    });

    if (i % 3 === 0) {
      onProgress?.({ done: i, total, t, confidence: best.score });
      // eslint-disable-next-line no-await-in-loop -- keeps the UI alive
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  return {
    points,
    lostAt,
    mean: scoreCount ? scoreSum / scoreCount : 0,
    frames: points.length,
  };
}

/** Smooth a path. Tracking is accurate but twitchy; this is what makes pinned
 *  text look attached rather than nervous. */
export function smoothTrack(points, strength = 0.5) {
  if (points.length < 3 || strength <= 0) return points;
  const window = Math.max(1, Math.round(strength * 4));
  return points.map((pt, i) => {
    let sx = 0, sy = 0, ss = 0, n = 0;
    for (let k = -window; k <= window; k++) {
      const p = points[i + k];
      if (!p) continue;
      sx += p.x; sy += p.y; ss += p.scale; n++;
    }
    return { ...pt, x: sx / n, y: sy / n, scale: ss / n };
  });
}

/* ------------------------------------------------------------------ */
/* applying a track                                                    */
/* ------------------------------------------------------------------ */

/**
 * Pin something to a track.
 *
 * `mode`:
 *   'transform' — the clip itself follows (a sticker, a title, a logo).
 *   'effect'    — an effect's x/y follow it (blur a face, hide a plate).
 *
 * Written as ordinary keyframes on the clip, so the result is editable by hand
 * afterwards and undoes in one step like anything else.
 */
export function applyTrack(clip, track, {
  mode = 'transform', effectId = 'blurRegion', offset = { x: 0, y: 0 },
  followScale = false, clipStart = 0,
} = {}) {
  const points = track.points || track;
  if (!points.length) return 0;

  const write = (prop, value, t) => {
    const list = clip.keyframes[prop] || (clip.keyframes[prop] = []);
    list.push({ t: Math.max(0, t), v: value, ease: 'linear' });
  };

  if (mode === 'transform') {
    delete clip.keyframes['transform.x'];
    delete clip.keyframes['transform.y'];
    if (followScale) delete clip.keyframes['transform.scale'];
    const base = points[0];
    for (const p of points) {
      const local = p.t - clipStart;
      // Positions are relative to where the pinned thing started, so a title
      // sitting in the corner stays in the corner and just moves with the shot.
      write('transform.x', (p.x - base.x) + offset.x, local);
      write('transform.y', (p.y - base.y) + offset.y, local);
      if (followScale) write('transform.scale', (clip.transform.scale || 1) * (p.scale / base.scale), local);
    }
  } else {
    const px = `effects.${effectId}.x`;
    const py = `effects.${effectId}.y`;
    delete clip.keyframes[px];
    delete clip.keyframes[py];
    for (const p of points) {
      const local = p.t - clipStart;
      write(px, p.x * 100, local);          // effect params are 0..100
      write(py, p.y * 100, local);
    }
  }

  for (const key of Object.keys(clip.keyframes)) {
    clip.keyframes[key].sort((a, b) => a.t - b.t);
  }
  return points.length;
}

/** Plain-English verdict on a finished track. */
export function describeTrack(track) {
  if (!track.points?.length) return { ok: false, text: 'Nothing was tracked.' };
  if (track.lostAt !== null && track.lostAt !== undefined) {
    // Losing it immediately means the lock never took, which has a different
    // cause and a different fix from losing it halfway through.
    if (track.frames <= 5) {
      return {
        ok: false,
        text: 'It never got a lock. Draw the box tighter around something with a clear edge or pattern, '
          + 'and make sure the playhead is on a frame where you can actually see it.',
      };
    }
    return {
      ok: false,
      text: `Lost it at ${track.lostAt.toFixed(1)}s — the path up to there is kept. `
        + 'That usually means the subject left the frame, turned away, or there is a cut inside the range.',
    };
  }
  if (track.mean > 0.8) return { ok: true, text: `Locked on — ${track.frames} points, very confident.` };
  if (track.mean > 0.6) return { ok: true, text: `Tracked ${track.frames} points. Solid.` };
  if (track.mean > 0.45) {
    return { ok: true, text: `Tracked ${track.frames} points, but it is not certain. Check it, and try a smaller box on something with more contrast if it wanders.` };
  }
  return {
    ok: false,
    text: 'The match was weak the whole way through. Pick a box with more detail in it — an eye, a logo, a corner — rather than a flat area.',
  };
}
