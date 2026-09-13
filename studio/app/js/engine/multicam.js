/*
 * Multicam: several angles of the same moment, cut between live.
 *
 * The three parts, in the order they matter:
 *
 *   **Sync.** Two cameras started at different times. Lining them up by hand
 *   means finding a clap in both and nudging until it stops flamming, which is
 *   ten minutes per angle and never quite right. Doing it by sound is exact
 *   and takes a second, because both cameras heard the same room.
 *
 *   **The angle viewer.** Every angle at once, live, while the timeline plays.
 *   Without it you are cutting blind — you can only see the angle you already
 *   chose, so choosing a different one means stopping, switching, and playing
 *   again.
 *
 *   **Live switching.** Press a number while it plays and the cut lands at
 *   that moment. That is the whole workflow: you watch it once, tapping as you
 *   go, and the edit is done. Everything after is trimming.
 *
 * A multicam clip is one clip on the timeline that knows which angle is live
 * at each moment. It is not a group of overlapping clips with visibility
 * toggles — that version cannot be trimmed as a unit, ripples wrongly, and
 * turns a six-angle shoot into six tracks nobody can read.
 */

import { uid } from '../ui.js';
import { addClip, clipById } from './project.js';
import { decode } from './media.js';

/* ------------------------------------------------------------------ */
/* syncing by sound                                                     */
/* ------------------------------------------------------------------ */

/*
 * Correlated on an onset envelope, not on the waveform.
 *
 * Two cameras recording the same room produce very different waveforms — a
 * different mic, a different distance, a different automatic gain — so the
 * samples do not line up even when the timing does. What they agree on is
 * *when things happened*: a door closing is a spike in both, at the same
 * moment, whatever it sounds like. So the signals are reduced to "how much did
 * the energy rise just now", which throws away timbre and level and keeps
 * timing, and that is what gets correlated.
 */
const HOP = 512;

function onsetEnvelope(buffer) {
  const data = buffer.getChannelData(0);
  const frames = Math.floor(data.length / HOP);
  const env = new Float32Array(frames);
  let prev = 0;
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const start = f * HOP;
    for (let i = start; i < start + HOP; i++) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / HOP);
    env[f] = Math.max(0, rms - prev);          // half-wave rectified difference
    prev = rms;
  }
  return { env, rate: buffer.sampleRate / HOP };
}

/*
 * How the score works, and the two ways of getting it wrong.
 *
 * **Dividing by the overlap length** sounds like a fair average and is a trap:
 * at an extreme lag the signals overlap by a handful of frames, and two spikes
 * that happen to coincide there produce an enormous average. Pointed at two
 * angles 1.2 seconds apart, that version confidently answered -5.85 seconds,
 * having matched the tail of one against the head of the other.
 *
 * **A Pearson correlation over the overlap** fixes the scale problem and
 * introduces a worse one. An onset envelope is nearly all zeroes — sixteen
 * nonzero frames in six hundred is typical — and with a signal that sparse,
 * lining up any single spike of one against any single spike of the other
 * gives a correlation of 0.9. Every lag that matches one spike scores about as
 * well as the lag that matches fourteen, so the peak never stands out and the
 * answer is a coin toss between a dozen equally "perfect" alignments.
 *
 * What actually works is the plain dot product of two envelopes normalised to
 * unit energy *once, globally*. Each coincident onset adds to the total, so
 * fourteen matches beat one by a factor of fourteen, which is exactly the
 * behaviour wanted. The bias it has — longer overlaps can accumulate more — is
 * fine and arguably right: an explanation that uses more of the recording is a
 * better explanation. A minimum overlap keeps that bias bounded.
 */
function normalise(env) {
  let energy = 0;
  for (let i = 0; i < env.length; i++) energy += env[i] * env[i];
  const norm = Math.sqrt(energy) || 1;
  const out = new Float32Array(env.length);
  for (let i = 0; i < env.length; i++) out[i] = env[i] / norm;
  return out;
}

function scoreAt(A, B, lag, minOverlap) {
  const from = Math.max(0, -lag);
  const to = Math.min(A.length, B.length - lag);
  if (to - from < minOverlap) return null;
  let sum = 0;
  for (let i = from; i < to; i++) sum += A[i] * B[i + lag];
  return sum;
}

/**
 * Shrink by `factor` for the coarse pass, keeping the loudest frame in each
 * block rather than the average.
 *
 * Averaging is the obvious choice and it destroys the signal. A door closing
 * is one or two frames tall out of a hundred; average eight frames and that
 * spike becomes an eighth of itself, spread across a bin, and two recordings
 * whose spikes fall either side of a bin boundary stop overlapping at all.
 * Taking the maximum keeps every spike at full height in whichever bin it
 * lands in, which is what a coarse pass needs: approximately where, not
 * exactly where.
 */
function decimate(env, factor) {
  if (factor <= 1) return env;
  const out = new Float32Array(Math.floor(env.length / factor));
  for (let i = 0; i < out.length; i++) {
    let peak = 0;
    for (let j = 0; j < factor; j++) {
      const v = env[i * factor + j];
      if (v > peak) peak = v;
    }
    out[i] = peak;
  }
  return out;
}

/**
 * A little smearing, so a near miss still counts.
 *
 * Two cameras rarely agree to the frame: different sample rates, different
 * codecs, different clocks. A spike one frame apart in two recordings has zero
 * correlation with a raw envelope and a strong one with a slightly smeared
 * pair, and one frame at eighty-six frames a second is well inside the error
 * anybody would accept from an automatic sync.
 */
function smear(env) {
  const out = new Float32Array(env.length);
  for (let i = 0; i < env.length; i++) {
    const a = env[i - 1] || 0, b = env[i], c = env[i + 1] || 0;
    out[i] = a * 0.5 + b + c * 0.5;
  }
  return out;
}

/**
 * How much later `b` started than `a`, in seconds, and how sure we are.
 *
 * Positive means b's recording began after a's, so an event they both caught
 * appears earlier in b's own clock.
 *
 * Two passes, because one is either too slow or too coarse. A full-resolution
 * search across two minutes of possible offsets on a ten-minute take is
 * billions of multiply-adds; a coarse-only search is accurate to a tenth of a
 * second, which is three frames out and visible on a clap. So: max-pool by
 * eight, search the whole range, then search full resolution near the winner.
 */
export function offsetBetween(bufA, bufB, { maxLag = 120 } = {}) {
  const rawA = onsetEnvelope(bufA);
  const rawB = onsetEnvelope(bufB);
  if (rawA.env.length < 16 || rawB.env.length < 16) return { offset: 0, confidence: 0 };

  const A = normalise(smear(rawA.env));
  const B = normalise(smear(rawB.env));
  const rate = rawA.rate;
  const shortest = Math.min(A.length, B.length);

  /*
   * A quarter of the shorter recording, and never fewer than 32 frames.
   *
   * Any lag leaving less than that overlapping is not considered at all, which
   * is what stops a tail-against-head match from winning on a coincidence.
   */
  const minOverlap = Math.max(32, Math.floor(shortest * 0.25));
  const maxFrames = Math.min(Math.round(maxLag * rate), shortest - minOverlap);
  if (maxFrames < 1) return { offset: 0, confidence: 0 };

  const STEP = 8;
  const ca = decimate(A, STEP);
  const cb = decimate(B, STEP);
  const coarseMin = Math.max(8, Math.floor(minOverlap / STEP));
  const coarseRange = Math.floor(maxFrames / STEP);

  const coarse = [];
  let bestCoarse = 0, bestScore = -Infinity;
  for (let lag = -coarseRange; lag <= coarseRange; lag++) {
    const v = scoreAt(ca, cb, lag, coarseMin);
    if (v === null) continue;
    coarse.push({ lag, v });
    if (v > bestScore) { bestScore = v; bestCoarse = lag; }
  }
  if (!coarse.length) return { offset: 0, confidence: 0 };

  // Refine at full resolution, two coarse steps either side: max-pooling can
  // put the winner a bin out, and thirty-two extra correlations removes it.
  let best = bestCoarse * STEP, fineScore = -Infinity;
  for (let lag = bestCoarse * STEP - STEP * 2; lag <= bestCoarse * STEP + STEP * 2; lag++) {
    const v = scoreAt(A, B, lag, minOverlap);
    if (v !== null && v > fineScore) { fineScore = v; best = lag; }
  }
  const peak = Number.isFinite(fineScore) ? fineScore : bestScore;

  /*
   * Confidence: how far the winner stands out from the rest of the curve.
   *
   * Compared against the best score *outside a guard band*, not against the
   * literal second-best. The lags either side of the winner are nearly as good
   * by construction — they are the same alignment off by a frame — so using
   * them would report every answer, right or wrong, as barely better than its
   * neighbour. Half a second is wide enough to clear the peak's own shoulders
   * and narrow enough to catch a genuine rival.
   *
   * It matters because a rhythmic recording correlates with itself at every
   * bar: the peak is tall, and so are twenty others, and the only honest
   * report is "I am not sure".
   */
  const guard = Math.max(2, Math.round(0.5 * rate / STEP));
  let rival = 0;
  for (const c of coarse) {
    if (Math.abs(c.lag - bestCoarse) <= guard) continue;
    if (c.v > rival) rival = c.v;
  }
  const confidence = peak > 0 ? Math.max(0, Math.min(1, (peak - rival) / peak)) : 0;

  return { offset: -best / rate, confidence, score: peak };
}

/**
 * Line up several angles against the first one.
 *
 * Returns one entry per media id, in the order given, each with the seconds
 * that angle has to be shifted by to agree with the first. The first is always
 * zero — somebody has to be the reference, and the alternative is choosing one
 * by a heuristic nobody can predict.
 */
export async function syncAngles(project, mediaIds, { maxLag = 120, onProgress } = {}) {
  const out = [];
  const first = project.media.find((m) => m.id === mediaIds[0]);
  if (!first) return out;

  onProgress?.({ done: 0, total: mediaIds.length, name: first.name });
  const refBuf = await decode(first);
  out.push({ mediaId: first.id, offset: 0, confidence: 1, reference: true });

  for (let i = 1; i < mediaIds.length; i++) {
    const rec = project.media.find((m) => m.id === mediaIds[i]);
    if (!rec) continue;
    onProgress?.({ done: i, total: mediaIds.length, name: rec.name });
    // eslint-disable-next-line no-await-in-loop -- each decode is large; in
    // series keeps peak memory to two buffers rather than all of them.
    const buf = await decode(rec);
    if (!refBuf || !buf) {
      /*
       * No sound on one of them, so there is nothing to line up against.
       *
       * Zero rather than a guess, and `confidence: 0` so the panel can say
       * "this one needs doing by hand" instead of quietly stacking it at the
       * top and letting somebody discover it in the export.
       */
      out.push({ mediaId: rec.id, offset: 0, confidence: 0, silent: true });
      continue;
    }
    const { offset, confidence } = offsetBetween(refBuf, buf, { maxLag });
    out.push({ mediaId: rec.id, offset, confidence });
  }
  onProgress?.({ done: mediaIds.length, total: mediaIds.length });
  return out;
}

/* ------------------------------------------------------------------ */
/* the multicam clip                                                    */
/* ------------------------------------------------------------------ */

/**
 * Build one clip that carries every angle.
 *
 * `dur` is the overlap — the stretch of time every angle actually covers.
 * Beyond it some cameras have stopped, and a multicam that runs past the
 * shortest angle is a clip that goes black when you switch to the wrong one.
 */
export function makeMulticam(project, { angles, trackId, start = 0, name = 'Multicam' }) {
  if (!angles?.length) return null;

  /*
   * Every angle's span in one common clock.
   *
   * `offset` means "this angle started this many seconds later than the
   * reference did", which is what the correlation measures. So in common time
   * the angle covers [offset, offset + its length], and the overlap is the
   * stretch every camera was actually running.
   *
   * The sign here is worth being explicit about because getting it backwards
   * produces a clip that looks plausible and is out of sync by twice the
   * offset — the most expensive kind of wrong, since it only shows up when
   * somebody watches the cut.
   */
  const spans = angles.map((a) => {
    const rec = project.media.find((m) => m.id === a.mediaId);
    if (!rec) return null;
    return { from: a.offset, to: a.offset + (rec.duration || 0) };
  }).filter(Boolean);
  if (!spans.length) return null;

  const from = Math.max(...spans.map((s) => s.from));
  const to = Math.min(...spans.map((s) => s.to));
  const dur = Math.max(0.2, to - from);

  const clip = addClip(project, {
    mediaId: angles[0].mediaId, trackId, start, dur, in: 0,
  });
  clip.kind = 'multicam';
  clip.name = name;
  /*
   * `in` per angle, worked out once here.
   *
   * The clip's own `in` stays 0 and each angle carries where *it* has to start
   * so that local time zero is the same instant in all of them. Doing it here
   * means the renderer never has to think about sync — it asks which angle and
   * gets an in point that is already right.
   */
  clip.angles = angles.map((a) => ({
    id: uid('ang'),
    mediaId: a.mediaId,
    offset: a.offset,
    // Common time `from` is this angle's own time `from - offset`.
    in: Math.max(0, from - a.offset),
    label: a.label || null,
    confidence: a.confidence ?? null,
  }));
  clip.angle = 0;
  clip.cuts = [];                              // [{ at, angle }] in clip-local seconds
  return clip;
}

/** Which angle is live at a clip-local time. */
export function angleAt(clip, local) {
  const cuts = clip.cuts;
  if (!cuts?.length) return clip.angle || 0;
  let live = clip.angle || 0;
  for (const cut of cuts) {
    if (cut.at <= local + 0.0001) live = cut.angle; else break;
  }
  return live;
}

/** What the renderer and the audio engine should be looking at, at time t. */
export function angleView(clip, t) {
  const local = t - clip.start;
  const index = angleAt(clip, local);
  const angle = clip.angles?.[index] || clip.angles?.[0];
  if (!angle) return null;
  return { index, angle, mediaId: angle.mediaId, in: angle.in };
}

/**
 * Cut to an angle at a moment.
 *
 * Replaces a cut already within a frame of that moment rather than adding a
 * second one, because live switching means tapping while it plays and two taps
 * a few milliseconds apart are one decision, not two.
 */
export function cutTo(clip, local, index, { fps = 30 } = {}) {
  if (!clip.angles?.[index]) return clip;
  clip.cuts ||= [];
  const at = Math.max(0, Math.min(clip.dur, local));

  if (at < 1 / fps) {                          // at the very top: it is the default
    clip.angle = index;
    clip.cuts = clip.cuts.filter((c) => c.at >= 1 / fps);
    return clip;
  }

  const near = clip.cuts.find((c) => Math.abs(c.at - at) < 1 / fps);
  if (near) near.angle = index;
  else clip.cuts.push({ at, angle: index });
  clip.cuts.sort((a, b) => a.at - b.at);

  /*
   * A cut to the angle already running is not a cut.
   *
   * Live switching produces these constantly — you tap 2 because you meant to
   * and tap it again a bar later out of rhythm. Left in, they become invisible
   * edit points that split the clip on export for no reason.
   */
  let last = clip.angle || 0;
  clip.cuts = clip.cuts.filter((c) => {
    if (c.angle === last) return false;
    last = c.angle;
    return true;
  });
  return clip;
}

export function removeCut(clip, at, { fps = 30 } = {}) {
  if (!clip.cuts) return clip;
  clip.cuts = clip.cuts.filter((c) => Math.abs(c.at - at) >= 1 / fps);
  return clip;
}

/**
 * Turn the angle switches into ordinary clips.
 *
 * The escape hatch, and the reason a multicam clip is safe to commit to: at
 * any point it can be flattened into one clip per cut, each a normal clip of
 * one angle, and everything downstream — trimming, grading, effects, export —
 * works on it with no knowledge of multicam at all.
 */
export function flattenMulticam(project, clipId) {
  const clip = clipById(project, clipId);
  if (!clip || clip.kind !== 'multicam') return [];

  const points = [{ at: 0, angle: clip.angle || 0 }, ...(clip.cuts || [])];
  const made = [];
  for (let i = 0; i < points.length; i++) {
    const from = points[i].at;
    const to = i + 1 < points.length ? points[i + 1].at : clip.dur;
    if (to - from < 0.02) continue;
    const angle = clip.angles?.[points[i].angle] || clip.angles?.[0];
    if (!angle) continue;
    const piece = addClip(project, {
      mediaId: angle.mediaId,
      trackId: clip.trackId,
      start: clip.start + from,
      dur: to - from,
      in: angle.in + from,
    });
    piece.color = structuredClone(clip.color);
    piece.transform = structuredClone(clip.transform);
    piece.volume = clip.volume;
    made.push(piece);
  }
  project.clips = project.clips.filter((c) => c.id !== clip.id);
  return made;
}
