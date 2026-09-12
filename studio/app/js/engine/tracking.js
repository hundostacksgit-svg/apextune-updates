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
const ROT_STEPS = [-0.14, 0.14]; // radians, tried only when the match weakens
const TEMPLATE_BLEND = 0.12;     // how fast the template adapts
const LOST_THRESHOLD = 0.32;     // NCC below this for several frames = lost
const RECOVER_THRESHOLD = 0.5;   // NCC needed to say "found it again"
const MAX_LOST_FRAMES = 14;      // how long to keep predicting before giving up (~1s at 15fps)
const VELOCITY_DAMP = 0.85;      // prediction trusts the last motion this much

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

  /** Raw RGBA for the current frame. Only the face finder wants colour. */
  rgba() {
    this.ctx.drawImage(this.video, 0, 0, this.w, this.h);
    return this.ctx.getImageData(0, 0, this.w, this.h).data;
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

/**
 * Pull a w×h patch centred on (cx, cy), sampled at `scale`, turned by `angle`.
 *
 * Rotation is sampled here rather than by rotating the template, so the
 * template stays what it was and only the place we look changes — a subject
 * that turns its head twenty degrees is still the same subject.
 */
function patchAt(plane, planeW, planeH, cx, cy, pw, ph, scale = 1, angle = 0) {
  const out = new Float32Array(pw * ph);
  const sw = pw * scale, sh = ph * scale;
  if (!angle) {
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
  const cos = Math.cos(angle), sin = Math.sin(angle);
  for (let y = 0; y < ph; y++) {
    const ly = (y / ph - 0.5) * sh;
    for (let x = 0; x < pw; x++) {
      const lx = (x / pw - 0.5) * sw;
      const sx = Math.round(cx + lx * cos - ly * sin);
      const sy = Math.round(cy + lx * sin + ly * cos);
      const row = Math.max(0, Math.min(planeH - 1, sy)) * planeW;
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

/**
 * Normalised cross-correlation of two equal-sized patches, −1..1.
 *
 * A candidate with no detail in it — a wall, the inside of a passing bar —
 * has a variance of nearly nothing, and dividing by it turned the score into
 * whatever the rounding noise happened to be, often thousands. The search
 * then took the flat patch as the best match in the frame and the box ran
 * away along a velocity it had never actually seen. Flat means "no match",
 * and says so.
 */
function ncc(a, aStats, b) {
  const bStats = stats(b);
  if (bStats.norm / Math.sqrt(b.length) < 2) return 0;
  let acc = 0;
  for (let i = 0; i < a.length; i++) acc += (a[i] - aStats.mean) * (b[i] - bStats.mean);
  return Math.max(-1, Math.min(1, acc / (aStats.norm * bStats.norm)));
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

function searchAround(plane, planeW, planeH, template, tStats, pw, ph, cx, cy, radius, step, scale, angle = 0) {
  let best = { score: -2, x: cx, y: cy, scale, angle };
  const scores = new Map();
  for (let dy = -radius; dy <= radius; dy += step) {
    for (let dx = -radius; dx <= radius; dx += step) {
      const x = cx + dx, y = cy + dy;
      const candidate = patchAt(plane, planeW, planeH, x, y, pw, ph, scale, angle);
      const score = ncc(template, tStats, candidate);
      scores.set(`${dx},${dy}`, score);
      if (score > best.score) best = { score, x, y, scale, angle };
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

  const points = [{ t: from, x: box.x, y: box.y, scale: 1, rot: 0, confidence: 1 }];
  let lostRun = 0;
  let lostAt = null;
  let scoreSum = 0;
  let scoreCount = 0;
  let angle = 0;
  let vx = 0, vy = 0;                 // analysis pixels per step, from the last accepted move
  let lastGood = 0;                   // index into `points` of the last confident point
  let recovered = 0;                  // how many times the subject came back after being lost
  let emaScore = 1;                   // how well this subject normally matches
  const maxStep = Math.max(pw, ph) * 0.6;   // no real subject moves further than this in one step

  for (let i = 1; i <= total; i++) {
    if (signal?.aborted) break;
    const t = Math.min(end, from + i * step);
    // eslint-disable-next-line no-await-in-loop -- frames must be read in order
    const ok = await reader.seek(t);
    if (!ok) break;
    // eslint-disable-next-line no-await-in-loop
    const plane = reader.luma();

    /*
     * Look where the subject is heading, not where it was.
     *
     * A fast pan moves a subject further per frame than the search radius,
     * and a search centred on the old position finds the background instead.
     * Centring it on the predicted position — last position plus damped
     * velocity — is what lets the same radius follow a car, or a hand.
     */
    const px = cx + vx * VELOCITY_DAMP, py = cy + vy * VELOCITY_DAMP;

    // Coarse pass over a wide radius on a big step, then a fine pass. This is
    // the pyramid: it finds fast movement without correlating every pixel.
    const radius = Math.max(6, Math.round(Math.max(pw, ph) * SEARCH_RADIUS));
    let best = searchAround(plane, reader.w, reader.h, template, tStats, pw, ph, px, py, radius, 3, scale, angle);
    best = searchAround(plane, reader.w, reader.h, template, tStats, pw, ph, best.x, best.y, 3, 1, scale, angle);

    /*
     * Every other frame, allow the box to grow or shrink — cumulatively.
     *
     * The steps used to be absolute (0.94, 1, 1.06), so the box could never
     * be more than six percent off its starting size; a subject walking
     * towards the camera doubles, and the template ended up matching a
     * quarter of it, off-centre. Each step now multiplies the current scale,
     * within sane bounds.
     */
    if (i % 2 === 0) {
      for (const f of SCALE_STEPS) {
        if (f === 1) continue;
        const s2 = Math.max(0.35, Math.min(3, scale * f));
        if (s2 === scale) continue;
        const candidate = patchAt(plane, reader.w, reader.h, best.x, best.y, pw, ph, s2, angle);
        const score = ncc(template, tStats, candidate);
        if (score > best.score + 0.015) { best = { ...best, score, scale: s2 }; }
      }
    }

    /*
     * Has the subject turned?
     *
     * Read against the original appearance, never the adapted template: a
     * template that has been blending in frames at a slightly wrong angle
     * agrees with itself at that angle, and the estimate sticks. Every few
     * frames, and whenever the match weakens, two angles either side of the
     * current one are tried against the original and the best is kept.
     */
    if (i % 3 === 0 || best.score < 0.62) {
      let bestRot = { score: ncc(original, originalStats, patchAt(plane, reader.w, reader.h, best.x, best.y, pw, ph, best.scale, angle)), angle };
      for (const dr of [-0.2, -0.1, 0.1, 0.2]) {
        const a1 = angle + dr;
        const score = ncc(original, originalStats, patchAt(plane, reader.w, reader.h, best.x, best.y, pw, ph, best.scale, a1));
        if (score > bestRot.score + 0.015) bestRot = { score, angle: a1 };
      }
      if (bestRot.angle !== angle) {
        best = { ...best, angle: bestRot.angle };
        // The adapted template was built at the old angle; start it again.
        template = original.slice();
        tStats = { ...originalStats };
        best.score = Math.max(best.score, bestRot.score);
      }
    }

    // If the adapted template has drifted onto something else, the original
    // frame is usually still the better match — check and snap back.
    const againstOriginal = ncc(original, originalStats,
      patchAt(plane, reader.w, reader.h, best.x, best.y, pw, ph, best.scale, best.angle));
    if (againstOriginal > best.score + 0.08) {
      template = original.slice();
      tStats = { ...originalStats };
      best.score = againstOriginal;
    }

    /*
     * Lost, or hidden?
     *
     * A subject that walks behind a lamp post is gone for four frames and
     * back. The old tracker stopped there and called the whole rest of the
     * shot lost. Now it keeps moving the box along the last known velocity
     * and, each frame, looks for the *original* appearance in a wide ring
     * around where the subject ought to be. When it turns up again, the
     * frames in between are filled by a straight line between the two ends
     * — which is what a subject behind a post actually did.
     */
    const lostIf = Math.max(LOST_THRESHOLD, emaScore * 0.55);
    let jumped = false;
    if (best.score < lostIf) {
      lostRun++;
      const wide = Math.round(Math.max(pw, ph) * 1.6);
      const again = searchAround(plane, reader.w, reader.h, original, originalStats, pw, ph, px, py, wide, 4, scale, angle);
      if (again.score >= RECOVER_THRESHOLD) {
        best = searchAround(plane, reader.w, reader.h, original, originalStats, pw, ph, again.x, again.y, 4, 1, scale, angle);
        template = original.slice();
        tStats = { ...originalStats };
        // Straighten the guessed points between the last sure one and here.
        const gap = points.length - 1 - lastGood;
        if (gap > 0) {
          const a = points[lastGood];
          for (let g = 1; g <= gap; g++) {
            const f = g / (gap + 1);
            const pt = points[lastGood + g];
            pt.x = Number((a.x + (best.x / reader.w - a.x) * f).toFixed(5));
            pt.y = Number((a.y + (best.y / reader.h - a.y) * f).toFixed(5));
            pt.confidence = 0.25;
            pt.filled = true;
          }
        }
        lostRun = 0;
        recovered++;
        jumped = true;
      } else if (lostRun > MAX_LOST_FRAMES) {
        lostAt = t;
        break;
      } else {
        // Keep the box coasting as it was — and slowing, so a subject that
        // has genuinely gone does not take the box off the frame with it.
        best = { ...best, x: px, y: py, score: 0 };
        vx *= 0.8; vy *= 0.8;
      }
    }

    if (best.score >= lostIf && lostRun > 0) {
      // Found again by the ordinary search after a stretch of guessing.
      const gap = points.length - 1 - lastGood;
      if (gap > 0) {
        const a0 = points[lastGood];
        for (let g = 1; g <= gap; g++) {
          const f = g / (gap + 1);
          const pt = points[lastGood + g];
          pt.x = Number((a0.x + (best.x / reader.w - a0.x) * f).toFixed(5));
          pt.y = Number((a0.y + (best.y / reader.h - a0.y) * f).toFixed(5));
          pt.confidence = 0.25;
          pt.filled = true;
        }
        recovered++;
      }
      lostRun = 0;
    }
    /*
     * Velocity is learned only from ordinary, confident moves — smoothed, and
     * capped at what a real subject can do in one step. A recovery jump is
     * the box catching up, not the subject moving, and one frame of a bad
     * match must not become the direction the box coasts in when the subject
     * next disappears: that is exactly how it ended up two thousand pixels
     * off the frame.
     */
    if (best.score >= lostIf && !jumped) {
      const dx = Math.max(-maxStep, Math.min(maxStep, best.x - cx));
      const dy = Math.max(-maxStep, Math.min(maxStep, best.y - cy));
      vx = vx * 0.5 + dx * 0.5; vy = vy * 0.5 + dy * 0.5;
      emaScore = emaScore * 0.9 + best.score * 0.1;
    }
    cx = best.x; cy = best.y; scale = best.scale; angle = best.angle ?? angle;
    scoreSum += Math.max(0, best.score); scoreCount++;

    if (best.score >= lostIf) {
      lostRun = 0;
      // Blend the current appearance in slowly so lighting and angle changes
      // don't accumulate into a lost track.
      const fresh = patchAt(plane, reader.w, reader.h, cx, cy, pw, ph, scale, angle);
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
      rot: Number(angle.toFixed(4)),
      confidence: Number(Math.max(0, best.score).toFixed(3)),
    });
    if (best.score >= lostIf) lastGood = points.length - 1;

    if (i % 3 === 0) {
      onProgress?.({ done: i, total, t, confidence: best.score });
      // eslint-disable-next-line no-await-in-loop -- keeps the UI alive
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // A run that ended while still guessing: drop the guesses off the tail.
  // Better to say "lost it here" than to hand back a box sliding on alone.
  if (lostAt !== null || (points.length - 1 > lastGood)) {
    const trailing = points.length - 1 - lastGood;
    if (trailing > 0 && lostAt === null && lostRun > 0) {
      points.splice(lastGood + 1, trailing);
    }
  }

  return {
    points,
    lostAt,
    recovered,
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
  const came = track.recovered ? ` It lost the subject and found it again ${track.recovered === 1 ? 'once' : `${track.recovered} times`}, filling the gap.` : '';
  if (track.mean > 0.8) return { ok: true, text: `Locked on — ${track.frames} points, very confident.${came}` };
  if (track.mean > 0.6) return { ok: true, text: `Tracked ${track.frames} points. Solid.${came}` };
  if (track.mean > 0.45) {
    return { ok: true, text: `Tracked ${track.frames} points, but it is not certain. Check it, and try a smaller box on something with more contrast if it wanders.` };
  }
  return {
    ok: false,
    text: 'The match was weak the whole way through. Pick a box with more detail in it — an eye, a logo, a corner — rather than a flat area.',
  };
}

/* ------------------------------------------------------------------ *
 * Finding something worth tracking, without being told
 * ------------------------------------------------------------------ */

/*
 * "Smart tracking" means you press one button instead of drawing a box.
 *
 * There is no model here and none is needed. What makes a region trackable is
 * a measurable property of the pixels, and it is the same property professional
 * trackers use to place their own points: a patch you can locate again next
 * frame must have detail running in *two* directions. A flat wall has none and
 * slides anywhere. A straight edge has one, so a patch on it can slide along
 * that edge without the match getting any worse — the aperture problem, and the
 * reason a tracker placed on the side of a building drifts sideways forever.
 *
 * The measure is the smaller eigenvalue of the structure tensor over the patch
 * (Shi and Tomasi, 1994). Large in both directions means a corner, which is the
 * one thing that can be located unambiguously.
 *
 * Trackability alone would happily pick a corner of the wallpaper. So it is
 * weighted by two more things:
 *
 *   • How differently the region moves from the frame as a whole. The subject
 *     is the part that does not move with the background.
 *   • How close it is to the middle, gently — people frame what they mean.
 */

/** Shi–Tomasi cornerness over a cell: the smaller eigenvalue of [[gxx,gxy],[gxy,gyy]]. */
function cornerness(plane, w, h, x0, y0, cw, ch) {
  let gxx = 0, gyy = 0, gxy = 0, n = 0;
  const x1 = Math.min(w - 1, x0 + cw), y1 = Math.min(h - 1, y0 + ch);
  for (let y = Math.max(1, y0); y < y1; y += 2) {
    for (let x = Math.max(1, x0); x < x1; x += 2) {
      const i = y * w + x;
      const gx = plane[i + 1] - plane[i - 1];
      const gy = plane[i + w] - plane[i - w];
      gxx += gx * gx; gyy += gy * gy; gxy += gx * gy;
      n++;
    }
  }
  if (!n) return 0;
  gxx /= n; gyy /= n; gxy /= n;
  const tr = gxx + gyy;
  const det = gxx * gyy - gxy * gxy;
  // The smaller root of the characteristic polynomial. Guarded, because
  // floating point can make the discriminant very slightly negative.
  const disc = Math.max(0, tr * tr / 4 - det);
  return tr / 2 - Math.sqrt(disc);
}

/** Mean absolute difference over a cell — how much this part of the frame moved. */
function cellMotion(a, b, w, h, x0, y0, cw, ch) {
  let sum = 0, n = 0;
  const x1 = Math.min(w, x0 + cw), y1 = Math.min(h, y0 + ch);
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = y * w + x;
      sum += Math.abs(a[i] - b[i]);
      n++;
    }
  }
  return n ? sum / n : 0;
}

/**
 * Pick something worth tracking in this clip.
 *
 * Returns a box in the same 0..1 coordinates `trackBox` takes, plus why it was
 * chosen — the panel shows that, because a tracker that silently picks the
 * wrong thing is far more annoying than one that says what it locked onto.
 *
 * Returns null rather than guessing when nothing in the frame is trackable —
 * a locked-off shot of a blank wall genuinely has nothing to follow, and
 * saying so beats producing a track that drifts.
 */
/* ------------------------------------------------------------------ */
/* finding a face                                                      */
/* ------------------------------------------------------------------ */

/*
 * Skin, in a form that works on everybody.
 *
 * Written in YCbCr rather than RGB on purpose. In RGB, "skin" means a band of
 * brightness, and a band of brightness is a rule about how pale somebody is —
 * it finds one group of people and misses everyone else, which is both wrong
 * and the classic way this gets built. Skin of every complexion sits in
 * roughly the same small region of *chroma*; what changes between people is
 * luma, and luma is exactly the axis this ignores. The same reason the
 * vectorscope carries a skin-tone line at 123° rather than a brightness range.
 *
 * The luma bounds that remain are only there to throw out pure black and
 * blown-out white, where chroma is meaningless because there is none.
 */
function isSkin(r, g, b) {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  if (y < 26 || y > 247) return false;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return cb >= 77 && cb <= 133 && cr >= 133 && cr <= 180;
}

/**
 * The largest head-shaped run of skin in a frame.
 *
 * Deliberately not a neural face detector. One would be more accurate and
 * would also be twenty megabytes of weights fetched before anybody could press
 * the button — on an app whose whole promise is that nothing is uploaded and
 * nothing is waited for. This finds the biggest connected region of skin
 * chroma and checks it is shaped like a head: taller than it is wide, roughly
 * filled in, and not a whole wall of it.
 *
 * It will happily lock onto a large hand, and says so through `confidence`
 * rather than pretending. For the thing people actually do with it — keeping a
 * blur or a filter on somebody's face through a shot — a head-sized box that
 * is occasionally a shoulder is worth far more than a download.
 */
export function findFaceIn(rgba, w, h) {
  const mask = new Uint8Array(w * h);
  let skinCount = 0;
  for (let i = 0, p = 0; p < mask.length; i += 4, p++) {
    if (isSkin(rgba[i], rgba[i + 1], rgba[i + 2])) { mask[p] = 1; skinCount++; }
  }
  // Nothing, or everything — a close-up of an arm filling the frame is not a
  // face and neither is a beige wall.
  if (skinCount < w * h * 0.004 || skinCount > w * h * 0.72) return null;

  /*
   * Flood fill, iteratively.
   *
   * A recursive fill is three lines shorter and blows the stack on a large
   * region — which is precisely the region this is looking for.
   */
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let best = null;

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    let n = 0, minX = w, maxX = 0, minY = h, maxY = 0;

    while (top) {
      const p = stack[--top];
      const x = p % w, y = (p / w) | 0;
      n++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[top++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[top++] = p + 1; }
      if (y > 0 && mask[p - w] && !seen[p - w]) { seen[p - w] = 1; stack[top++] = p - w; }
      if (y < h - 1 && mask[p + w] && !seen[p + w]) { seen[p + w] = 1; stack[top++] = p + w; }
    }

    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    if (n < w * h * 0.004) continue;
    const aspect = bh / bw;                     // heads are taller than wide
    const fill = n / (bw * bh);                 // and roughly solid
    if (aspect < 0.72 || aspect > 2.6) continue;
    if (fill < 0.38) continue;

    // Size first, then how head-like it is, then how central. A face at the
    // edge of frame is still a face; a cheek-sized patch in the middle is not.
    const size = n / (w * h);
    const shape = 1 - Math.min(1, Math.abs(aspect - 1.28) / 1.0);
    const cx = (minX + maxX) / 2 / w, cy = (minY + maxY) / 2 / h;
    const centre = 1 - Math.min(1, Math.hypot(cx - 0.5, cy - 0.42) * 1.5);
    const score = Math.sqrt(size) * (0.5 + 0.34 * shape + 0.16 * centre) * (0.6 + 0.4 * fill);
    if (!best || score > best.score) {
      best = { score, n, minX, maxX, minY, maxY, bw, bh, size, shape, fill, centre };
    }
  }
  if (!best) return null;

  /*
   * Grow the box upward and outward before handing it over.
   *
   * Skin chroma finds the face and stops at the hairline, so a box drawn on
   * the mask alone cuts the top of the head off — which looks exactly like a
   * mistake when a blur is pinned to it, because it is one.
   */
  const padX = best.bw * 0.22, padTop = best.bh * 0.42, padBottom = best.bh * 0.1;
  const x0 = Math.max(0, best.minX - padX), x1 = Math.min(w, best.maxX + padX);
  const y0 = Math.max(0, best.minY - padTop), y1 = Math.min(h, best.maxY + padBottom);

  return {
    box: {
      x: (x0 + x1) / 2 / w,
      y: (y0 + y1) / 2 / h,
      w: Math.min(0.9, (x1 - x0) / w),
      h: Math.min(0.9, (y1 - y0) / h),
    },
    confidence: Math.min(1, best.shape * 0.5 + best.fill * 0.3 + Math.min(1, best.size * 14) * 0.2),
    coverage: best.size,
  };
}

/** The same thing, against a video element at a given moment. */
export async function findFace(video, { at = 0 } = {}) {
  if (!video?.videoWidth) throw new Error('That clip has not finished loading yet.');
  const reader = new FrameReader(video);
  await reader.seek(at);
  return findFaceIn(reader.rgba(), reader.w, reader.h);
}

export async function findTarget(video, { at = 0, gap = 0.25 } = {}) {
  if (!video?.videoWidth) throw new Error('That clip has not finished loading yet.');
  const reader = new FrameReader(video);
  const w = reader.w, h = reader.h;

  await reader.seek(at);

  /*
   * A face wins, when there is one.
   *
   * When somebody presses "find it for me" on a shot with a person in it, they
   * mean the person — every time. The corner detector below is very good at
   * finding the highest-contrast thing in frame and that is routinely a
   * doorframe. Checked first, and only trusted when it is confident: a weak
   * face guess is worse than an honest edge.
   */
  const face = findFaceIn(reader.rgba(), w, h);
  if (face && face.confidence > 0.42 && face.coverage < 0.45) {
    return {
      box: face.box,
      why: 'the face in the shot',
      confidence: face.confidence,
      kind: 'face',
    };
  }

  const first = reader.luma();
  // A second frame a little later is what separates the subject from the set.
  // If the clip is too short for one, trackability alone still works.
  let second = null;
  const later = Math.min(at + gap, (video.duration || at) - 0.02);
  if (later > at + 0.01) {
    await reader.seek(later);
    second = reader.luma();
  }

  const COLS = 12, ROWS = 12;
  const cw = Math.floor(w / COLS), ch = Math.floor(h / ROWS);
  if (cw < 4 || ch < 4) return null;

  const cells = [];
  let maxCorner = 0, maxMotion = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x0 = c * cw, y0 = r * ch;
      const corner = cornerness(first, w, h, x0, y0, cw, ch);
      const motion = second ? cellMotion(first, second, w, h, x0, y0, cw, ch) : 0;
      maxCorner = Math.max(maxCorner, corner);
      maxMotion = Math.max(maxMotion, motion);
      cells.push({ c, r, corner, motion });
    }
  }
  if (maxCorner < 12) return null;          // genuinely nothing to hold onto

  // The typical motion, so "moves differently from the background" has a
  // baseline. The median rather than the mean: one violently moving cell
  // should not redefine what normal is.
  const sorted = cells.map((x) => x.motion).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;

  let best = null;
  for (const cell of cells) {
    const track = cell.corner / maxCorner;
    // How much this cell stands out from the background's motion, either by
    // moving when the frame is still or by holding still when it pans.
    const distinct = maxMotion > 2
      ? Math.min(1, Math.abs(cell.motion - median) / (maxMotion - median || 1))
      : 0;
    const dx = (cell.c + 0.5) / COLS - 0.5;
    const dy = (cell.r + 0.5) / ROWS - 0.5;
    const centre = 1 - Math.min(1, Math.hypot(dx, dy) * 1.6);

    // Trackability is the veto: a region that cannot be followed is useless no
    // matter how interesting it is, so it multiplies rather than adds.
    const score = track * (0.45 + 0.4 * distinct + 0.25 * centre);
    if (!best || score > best.score) best = { ...cell, score, track, distinct, centre };
  }
  if (!best || best.track < 0.28) return null;

  // A box around the winning cell, a little larger than the cell itself: the
  // matcher wants some context around the feature, not the feature alone.
  const box = {
    x: (best.c + 0.5) / COLS,
    y: (best.r + 0.5) / ROWS,
    w: Math.min(0.35, (cw * 2.2) / w),
    h: Math.min(0.35, (ch * 2.2) / h),
  };

  const why = best.distinct > 0.5
    ? 'the part of the frame moving differently from the background'
    : best.centre > 0.7
      ? 'the most trackable detail near the middle of the frame'
      : 'the strongest trackable detail in the frame';

  return {
    box, why, kind: 'detail',
    confidence: Math.min(1, best.track * (0.5 + best.distinct * 0.5)),
  };
}

/**
 * Find something and track it, in one call.
 *
 * This is what the one-press button runs. Failures are separated on purpose:
 * "there is nothing here to follow" and "I lost it half way" need different
 * answers from the person, and collapsing them into "tracking failed" tells
 * them nothing about which.
 */
export async function autoTrack(video, opts = {}) {
  const target = await findTarget(video, { at: opts.from || 0 });
  if (!target) {
    throw new Error(
      'Nothing in this shot is distinct enough to follow — it is too flat, too '
      + 'blurred or too evenly lit. Drawing a box by hand around something with '
      + 'a hard edge will work where this cannot.');
  }
  const track = await trackBox(video, { ...opts, box: target.box });
  return { ...track, auto: true, why: target.why, confidence: target.confidence };
}
