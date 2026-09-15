/*
 * Learn an edit's format from a finished video.
 *
 * Drop in a video you like — a TikTok you saved, a trailer, someone else's
 * edit — and this works out *how it was cut*: where the shots change, how long
 * each one holds, whether the cuts sit on the music, what the grade is doing,
 * how much the camera moves, whether there are captions burnt in. That comes
 * back as a style profile, and planFromReference turns the profile into an
 * ordinary plan that rebuilds the same structure using your own clips.
 *
 * What this is, precisely
 * ----------------------
 * It copies **structure**, not content. Nothing from the reference ends up in
 * your video: not a frame, not a sound, not a caption. What transfers is the
 * shape of the edit — the rhythm, the pacing, the ratio, the approximate look.
 * That distinction is the whole point. Copying the shape of an edit is how
 * every editor has always learned; lifting the footage is someone else's work.
 *
 * It is also the honest limit of the technique. A profile cannot tell you which
 * specific transition plugin someone used, or read text off the screen, or know
 * why a cut lands where it does. It measures what is measurable and says so.
 *
 * How it measures
 * ---------------
 * Frames are sampled small (96x54 is plenty — shot changes are a global event,
 * not a detail one) and each becomes a 64-bin colour histogram plus a handful
 * of scalars. Shot boundaries are peaks in the distance between consecutive
 * histograms, judged against a *local* threshold rather than a fixed one, since
 * a dark handheld interior and a bright locked-off exterior have completely
 * different baseline noise and one global number gets both wrong.
 */

import { detectBeats } from './media.js';
import { LOOKS } from './filters.js';

/*
 * How densely to sample, and how fast to play while doing it.
 *
 * These two numbers trade accuracy against time, and they are set where they
 * are because getting them wrong is invisible: the analysis still returns a
 * confident-looking answer, it is just missing cuts.
 *
 * Fast cutting bottoms out around 6-8 shots a second, so 15 samples a second
 * puts at least two inside the shortest shot anyone actually cuts. Playing at
 * 2x rather than 4x matters more than it looks — above roughly 2x Chrome starts
 * dropping presented frames under load, and a dropped frame at a shot boundary
 * is a cut that silently never happened. Slower and denser costs a few seconds
 * on a 30-second clip and buys an answer that does not change between runs.
 */
const SAMPLE_FPS = 15;
const ANALYSIS_RATE = 2;
const W = 96;
const H = 54;

/* Two shots cannot be closer than this. Below ~0.1s the eye reads it as a
   flash frame rather than a cut, and detectors that allow it produce runs of
   phantom shots through any burst of camera shake. */
const MIN_SHOT = 0.12;

/* ------------------------------------------------------------------ *
 * Sampling
 * ------------------------------------------------------------------ */

/**
 * Walk the video and return one record per sampled frame.
 *
 * Played rather than seeked. Seeking to 360 timestamps means 360 decoder
 * flushes and takes longer than watching the video would; playing it fast with
 * requestVideoFrameCallback hands us frames as the decoder produces them, with
 * the true presentation time attached, and gets through a 30-second clip in a
 * few seconds. Browsers without that callback fall back to seeking, which is
 * slow but correct.
 */
async function sampleFrames(video, { onProgress, signal } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const frames = [];
  const duration = video.duration;
  const grab = (t) => {
    ctx.drawImage(video, 0, 0, W, H);
    frames.push({ t, ...describeFrame(ctx.getImageData(0, 0, W, H).data) });
  };

  if (typeof video.requestVideoFrameCallback === 'function') {
    await new Promise((resolve, reject) => {
      let last = -Infinity;
      const step = 1 / SAMPLE_FPS;
      const onFrame = (_now, meta) => {
        if (signal?.aborted) { video.pause(); reject(new Error('cancelled')); return; }
        const t = meta.mediaTime;
        if (t - last >= step * 0.9) { last = t; grab(t); onProgress?.(t / duration); }
        if (video.ended || t >= duration - 0.02) { video.pause(); resolve(); return; }
        video.requestVideoFrameCallback(onFrame);
      };
      video.requestVideoFrameCallback(onFrame);
      video.muted = true;
      video.playbackRate = ANALYSIS_RATE;
      video.play().catch(reject);
      video.addEventListener('ended', () => resolve(), { once: true });
    });
  } else {
    const step = 1 / SAMPLE_FPS;
    for (let t = 0; t < duration; t += step) {
      if (signal?.aborted) throw new Error('cancelled');
      // eslint-disable-next-line no-await-in-loop -- one seek at a time is the point
      await seek(video, t);
      grab(video.currentTime);
      onProgress?.(t / duration);
    }
  }

  frames.sort((a, b) => a.t - b.t);
  return frames;
}

function seek(video, t) {
  return new Promise((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('seek failed')); };
    const cleanup = () => {
      video.removeEventListener('seeked', done);
      video.removeEventListener('error', fail);
    };
    video.addEventListener('seeked', done, { once: true });
    video.addEventListener('error', fail, { once: true });
    video.currentTime = Math.min(t, Math.max(0, video.duration - 0.01));
  });
}

/**
 * Reduce one frame to a histogram and a few scalars.
 *
 * The histogram is 4x4x4 in RGB. Coarse on purpose: fine bins make the distance
 * between two frames of the same shot jump around as grain moves, which is
 * exactly the noise the cut detector then has to fight.
 */
function describeFrame(px) {
  const hist = new Float32Array(64);
  let lumaSum = 0, lumaSqSum = 0, satSum = 0, warmSum = 0;
  let edge = 0, edgeLower = 0;
  const n = W * H;

  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = px[p], g = px[p + 1], b = px[p + 2];
    hist[((r >> 6) << 4) | ((g >> 6) << 2) | (b >> 6)]++;

    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumaSum += luma;
    lumaSqSum += luma * luma;

    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    satSum += max === 0 ? 0 : (max - min) / max;
    warmSum += (r - b) / 255;

    // Horizontal gradient. Burnt-in captions are a band of hard vertical edges
    // sitting in one horizontal strip, which is a very different signature from
    // the smooth gradients of most footage.
    const x = i % W;
    if (x > 0) {
      const d = Math.abs(luma - (0.2126 * px[p - 4] + 0.7152 * px[p - 3] + 0.0722 * px[p - 2]));
      if (d > 48) {
        edge++;
        if (i / n > 0.62) edgeLower++;   // lower third, where captions live
      }
    }
  }

  for (let i = 0; i < 64; i++) hist[i] /= n;
  const mean = lumaSum / n;
  return {
    hist,
    luma: mean / 255,
    contrast: Math.sqrt(Math.max(0, lumaSqSum / n - mean * mean)) / 128,
    sat: satSum / n,
    warm: warmSum / n,
    edge: edge / n,
    edgeLower: edgeLower / n,
  };
}

/** L1 distance between two normalised histograms, 0..2 → scaled to 0..1. */
function histDistance(a, b) {
  let d = 0;
  for (let i = 0; i < 64; i++) d += Math.abs(a[i] - b[i]);
  return d / 2;
}

/**
 * How different two frames are, across several measures at once.
 *
 * A colour histogram alone misses the cut between two dark shots. Most pixels
 * in both land in the same handful of near-black bins, so the histogram barely
 * moves even though the picture changed completely — and night scenes, concert
 * footage and anything shot indoors at the wrong hour are full of those cuts.
 *
 * The other measures fail in different places, which is the point of combining
 * them: mean brightness catches a dark-to-dark change of exposure but not a
 * pan across a wall, edge density catches a change of subject at constant
 * brightness, warmth catches a grade or a location change. A cut usually moves
 * several at once; camera shake inside one shot moves none of them much.
 */
function frameDistance(a, b) {
  return histDistance(a.hist, b.hist)
    + 1.8 * Math.abs(a.luma - b.luma)
    + 1.2 * Math.abs(a.sat - b.sat)
    + 1.2 * Math.abs(a.warm - b.warm)
    + 2.5 * Math.abs(a.edge - b.edge);
}

/* ------------------------------------------------------------------ *
 * Shot boundaries
 * ------------------------------------------------------------------ */

/**
 * Find the boundaries between shots, and say what kind each one is.
 *
 * A boundary is a spike in frame-to-frame histogram distance. The trick is what
 * counts as a spike: a fixed threshold that works on a clean talking head
 * shreds a handheld night scene into dozens of false shots, and one loose
 * enough for the night scene misses every soft cut in the talking head. So the
 * threshold is local — the median of the surrounding window plus a multiple of
 * that window's spread. Median rather than mean, because the window usually
 * contains the very spikes we are measuring against and a mean lets them drag
 * the baseline up over themselves.
 *
 * Hard cuts and dissolves are then the *same* event measured differently, which
 * is why they are found together rather than by two separate passes. A cut puts
 * all its change in one frame; a dissolve spreads the identical amount of
 * change over half a second. Detecting them separately means the dissolve's
 * midpoint also trips the cut detector and the same transition gets counted
 * twice — once as each kind. Measuring the *width* of the disturbance around
 * each boundary settles it in one pass: narrow is a cut, wide is a dissolve,
 * and nothing is ever both.
 */
function findBoundaries(frames, { sensitivity = 1 } = {}) {
  if (frames.length < 3) return { cuts: [], dissolves: [] };
  const d = new Float32Array(frames.length);
  for (let i = 1; i < frames.length; i++) d[i] = frameDistance(frames[i - 1], frames[i]);

  const half = Math.max(4, Math.round(SAMPLE_FPS * 0.75));
  const baseline = (i) => {
    const lo = Math.max(1, i - half), hi = Math.min(d.length, i + half);
    const w = Array.from(d.slice(lo, hi)).sort((a, b) => a - b);
    const median = w[w.length >> 1];
    const mad = w.map((v) => Math.abs(v - median)).sort((a, b) => a - b)[w.length >> 1] || 1e-4;
    return { median, mad };
  };

  /*
   * Nothing at the very start or the very end counts.
   *
   * The first frame is the start of the first shot, not a boundary — there is
   * nothing before it to have cut away from. Encoders make this matter in
   * practice as well as in principle: the opening fraction of a second of a
   * recorded file is the rate controller settling, which shifts the whole
   * picture's colour and reads as one enormous frame-to-frame change. Without
   * this guard a single unbroken shot intermittently reports a cut at 0.05s,
   * and it depends on the encoder's mood, which is the worst kind of bug to
   * chase.
   */
  const guard = Math.max(0.15, 2 / SAMPLE_FPS);
  const endsAt = frames.at(-1).t;

  const cuts = [];
  const dissolves = [];
  let last = -Infinity;

  for (let i = 2; i < frames.length - 1; i++) {
    if (frames[i].t < guard || frames[i].t > endsAt - guard) continue;
    const { median, mad } = baseline(i);
    const peak = median + (4.5 / sensitivity) * mad;
    /*
     * The absolute floor is a backstop against a dead-still shot where the
     * local spread is almost zero, not the real gate — the adaptive threshold
     * above is.
     *
     * It has to be low, because a colour histogram barely moves across a cut
     * between two *dark* shots: most pixels land in the same few near-black
     * bins whichever scene they belong to, so a night interior cutting to a
     * night exterior produces a fraction of the distance a daylight cut does.
     * Set the floor where a bright cut suggests and every dark cut in the
     * video is silently dropped.
     *
     * It is scaled to `frameDistance`, which sums five measures and so runs
     * several times larger than a histogram distance alone. A floor carried
     * over from the single-measure version lets encoder noise through on a
     * locked-off shot and invents boundaries in footage that has none.
     */
    const floor = 0.14 / sensitivity;
    if (!(d[i] > peak && d[i] > floor)) continue;

    /*
     * The peak has to dominate a real neighbourhood, not just beat the two
     * frames touching it.
     *
     * One shot change does not produce one spike. Decoders present frames
     * unevenly — more so when the file is being played fast to analyse it — so
     * the change smears across two or three samples, and comparing only with
     * the immediate neighbours lets the second-largest of them through as a
     * separate boundary. The result is an edit that intermittently reports one
     * more cut than it has, differently on each run. Requiring the winner of
     * the whole minimum-shot window removes the double without loosening what
     * counts as a boundary at all.
     */
    const reach = Math.max(2, Math.round(MIN_SHOT * SAMPLE_FPS));
    let dominant = true;
    for (let k = Math.max(1, i - reach); k <= Math.min(d.length - 1, i + reach); k++) {
      if (k !== i && d[k] > d[i]) { dominant = false; break; }
    }
    if (!dominant) continue;

    const t = frames[i].t;
    if (t - last < MIN_SHOT) continue;
    last = t;

    /*
     * How wide is the disturbance? Measured against the peak itself, not
     * against the baseline.
     *
     * The two shapes differ in where their energy sits, not in how far above
     * quiet they rise. A hard cut spends everything in one frame and its
     * neighbours fall straight back to baseline; a dissolve spreads the same
     * total across ten frames that are all a similar, middling size. So the
     * question is "are the neighbours comparable to the peak", and the bar has
     * to be a fraction of the peak to ask it.
     *
     * A baseline-relative bar answers a different question — "are the
     * neighbours above quiet" — which a hard cut's shoulders clear easily,
     * because a cut disturbs the frames either side of it too. That labels
     * ordinary hard cuts as dissolves, and since the two are reported in
     * separate lists, every one it mislabels looks like a cut the detector
     * failed to find.
     */
    const shoulder = Math.max(median + 2.5 * mad, d[i] * 0.4);
    let width = 1;
    for (let k = i - 1; k > 0 && d[k] > shoulder && i - k <= SAMPLE_FPS; k--) width++;
    for (let k = i + 1; k < d.length && d[k] > shoulder && k - i <= SAMPLE_FPS; k++) width++;

    // Three sampled frames of sustained change is a quarter of a second at our
    // sample rate — longer than any cut, shorter than any dissolve worth the
    // name.
    (width >= 3 ? dissolves : cuts).push(t);
  }

  return { cuts, dissolves };
}

/* ------------------------------------------------------------------ *
 * Reading the result
 * ------------------------------------------------------------------ */

function stats(xs) {
  if (!xs.length) return { mean: 0, median: 0, min: 0, max: 0, sd: 0 };
  const sorted = [...xs].sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  return { mean, median: sorted[sorted.length >> 1], min: sorted[0], max: sorted.at(-1), sd };
}

const PACE = [
  { max: 0.4, id: 'frenetic', name: 'Frenetic', note: 'faster than three cuts a second' },
  { max: 0.9, id: 'fast', name: 'Fast', note: 'about a cut a second' },
  { max: 2.2, id: 'punchy', name: 'Punchy', note: 'a cut every second or two' },
  { max: 4.5, id: 'steady', name: 'Steady', note: 'a few seconds a shot' },
  { max: Infinity, id: 'slow', name: 'Slow', note: 'long, held shots' },
];

/**
 * Is this cut to music, and on what subdivision?
 *
 * Tries each subdivision of the detected beat and asks how many cuts land near
 * one. A confident answer needs most cuts to agree — an edit that happens to
 * hit a few beats by chance is not a beat-synced edit, and claiming it is would
 * produce a rebuild that feels wrong for reasons the person cannot name.
 */
function beatFit(cuts, beats) {
  if (!beats?.beats?.length || cuts.length < 4) return null;
  const period = beats.period;
  let best = null;

  for (const every of [1, 2, 4, 8]) {
    const grid = every * period;
    const tolerance = Math.min(0.09, grid * 0.16);
    let hits = 0;
    for (const t of cuts) {
      const phase = ((t - beats.beats[0]) % grid + grid) % grid;
      if (Math.min(phase, grid - phase) <= tolerance) hits++;
    }
    const ratio = hits / cuts.length;
    if (!best || ratio > best.ratio) best = { every, ratio, grid };
  }
  return best && best.ratio >= 0.55 ? best : null;
}

/**
 * The nearest look in our own library.
 *
 * Honest about what this can be: our looks are *adjustments* applied on top of
 * footage, while the reference is already graded, so there is no exact answer —
 * we cannot know what it looked like before. What we can do is measure which
 * direction it has been pushed and pick the look that pushes the same way.
 * Reported as "closest", never as "the look they used".
 */
function matchLook(avg) {
  const want = {
    saturation: (avg.sat - 0.32) * 160,
    contrast: (avg.contrast - 0.24) * 190,
    temperature: avg.warm * 190,
    exposure: (avg.luma - 0.45) * 90,
  };

  let best = { id: 'none', score: Infinity };
  for (const look of LOOKS) {
    if (look.id === 'none') continue;
    const c = look.color || {};
    let score = 0;
    for (const key of ['saturation', 'contrast', 'temperature', 'exposure']) {
      score += ((c[key] || 0) - (want[key] || 0)) ** 2;
    }
    if (score < best.score) best = { id: look.id, name: look.name, score };
  }
  // Nothing close enough is a real answer too — a neutral grade should come
  // back as neutral rather than as whichever look happened to be least wrong.
  const flat = Math.abs(want.saturation) < 9 && Math.abs(want.contrast) < 9
    && Math.abs(want.temperature) < 9;
  return flat ? { id: 'none', name: 'None (already neutral)' } : best;
}

/* ------------------------------------------------------------------ *
 * The public call
 * ------------------------------------------------------------------ */

/**
 * Analyse a reference video.
 *
 * @param file      a File or Blob the person dropped in
 * @param options   { onProgress(0..1, label), signal }
 * @returns         a style profile — see the shape at the bottom of this file
 */
export async function analyseReference(file, { onProgress, signal } = {}) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = url;
  video.crossOrigin = 'anonymous';
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;

  try {
    await new Promise((resolve, reject) => {
      video.addEventListener('loadedmetadata', resolve, { once: true });
      video.addEventListener('error', () => reject(new Error(
        'That file could not be opened. Try an MP4 or MOV exported from the app you saved it in.',
      )), { once: true });
    });

    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error('That video has no readable length — some screen recorders do this. Re-export it and try again.');
    }
    if (video.duration > 600) {
      throw new Error('That video is over ten minutes. Trim it to the section whose style you want and try again.');
    }

    onProgress?.(0.02, 'Reading the video');
    const frames = await sampleFrames(video, {
      signal,
      onProgress: (p) => onProgress?.(0.02 + p * 0.62, 'Watching for cuts'),
    });
    if (frames.length < 6) {
      throw new Error('Too few frames came back to judge anything. The file may be corrupt.');
    }

    /*
     * How long the video really is, measured rather than believed.
     *
     * `video.duration` comes from the container header, and for anything a
     * phone or a screen recorder produced that header is frequently wrong — not
     * missing, which is easy to spot, but *overstated*, which is not. Recordings
     * from MediaRecorder do it routinely: a six-second clip announcing nearly
     * nine.
     *
     * Everything downstream is a rate. Cuts per second, shot length, pace,
     * whether the cuts sit on the beat — all of them divide by this number, so
     * a duration 47% too long reports a fast edit as a steady one and rebuilds
     * it at the wrong speed. Nothing looks broken; the answer is just wrong.
     *
     * The last frame we were actually handed is ground truth. If the header
     * claims materially more than that, the header is the thing that is wrong.
     */
    const measured = frames.at(-1).t + 1 / SAMPLE_FPS;
    const reported = video.duration;
    const duration = (!Number.isFinite(reported) || reported > measured * 1.05)
      ? measured
      : reported;

    onProgress?.(0.66, 'Finding the cuts');
    const { cuts, dissolves } = findBoundaries(frames);

    onProgress?.(0.74, 'Listening to the audio');
    let beats = null;
    try {
      beats = await referenceBeats(file);
    } catch {
      beats = null;               // silent video, or a codec we cannot decode
    }

    onProgress?.(0.9, 'Working out the style');

    /* --- shot structure --- */
    const marks = [0, ...cuts, duration];
    const shots = [];
    for (let i = 1; i < marks.length; i++) {
      const len = marks[i] - marks[i - 1];
      if (len >= MIN_SHOT) shots.push({ start: marks[i - 1], dur: len });
    }
    const lengths = shots.map((s) => s.dur);
    const shotStats = stats(lengths);
    const pace = PACE.find((p) => shotStats.median <= p.max);

    /* --- picture --- */
    const avg = {
      luma: stats(frames.map((f) => f.luma)).mean,
      contrast: stats(frames.map((f) => f.contrast)).mean,
      sat: stats(frames.map((f) => f.sat)).mean,
      warm: stats(frames.map((f) => f.warm)).mean,
    };
    const look = matchLook(avg);

    /*
     * --- movement inside the shots ---
     *
     * Frames next to a boundary are excluded: the change there is the edit, not
     * the camera, and counting it would make every fast-cut edit look like it
     * was shot running. The window has to be wider than the boundary itself,
     * because a cut disturbs the frame before and after it as well.
     *
     * Median, not mean. Whatever the exclusion misses is a handful of very
     * large values, and a mean lets those few frames outvote the hundreds that
     * actually describe how much the camera moves.
     */
    const boundaries = [...cuts, ...dissolves];
    const exclude = 1.6 / SAMPLE_FPS;
    const steps = [];
    for (let i = 1; i < frames.length; i++) {
      if (boundaries.some((c) => Math.abs(c - frames[i].t) < exclude)) continue;
      steps.push(frameDistance(frames[i - 1], frames[i]));
    }
    const motion = steps.length ? stats(steps).median : 0;

    /* --- captions --- */
    const lowerEdge = stats(frames.map((f) => f.edgeLower)).mean;
    const overallEdge = stats(frames.map((f) => f.edge)).mean;
    const captions = lowerEdge > 0.012 && lowerEdge > overallEdge * 0.42;

    const ratio = pickRatio(video.videoWidth, video.videoHeight);
    if (duration !== reported) {
      // Worth surfacing: it changes every number in the profile.
      console.info(`[reference] header said ${reported?.toFixed?.(2)}s, frames say ${measured.toFixed(2)}s — using the frames.`);
    }
    const onBeat = beatFit(cuts, beats);

    return {
      source: { name: file.name || 'reference', width: video.videoWidth, height: video.videoHeight },
      duration,
      ratio,
      cuts,
      dissolves,
      shots,
      shotStats,
      cutsPerSecond: cuts.length / duration,
      pace: { id: pace.id, name: pace.name, note: pace.note },
      // A low spread means every shot is nearly the same length, which is the
      // signature of a template rather than a hand-cut edit — and it rebuilds
      // very differently.
      even: shotStats.mean > 0 && shotStats.sd / shotStats.mean < 0.45,
      look,
      colour: avg,
      motion,
      captions,
      beats,
      onBeat,
      frames: frames.length,
    };
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

/** Tempo of the reference's own audio, if it has any. */
async function referenceBeats(file) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  try {
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
    return detectBeats(buffer);
  } finally {
    ctx.close?.();
  }
}

function pickRatio(w, h) {
  if (!w || !h) return '16:9';
  const r = w / h;
  const options = [['9:16', 9 / 16], ['1:1', 1], ['4:5', 0.8], ['16:9', 16 / 9], ['21:9', 21 / 9]];
  return options.reduce((best, [id, v]) =>
    Math.abs(v - r) < Math.abs(best[1] - r) ? [id, v] : best, options[0])[0];
}

/* ------------------------------------------------------------------ *
 * Describing it
 * ------------------------------------------------------------------ */

/** Plain sentences a person can check against the video they just watched. */
export function describeReference(p) {
  const lines = [];
  const secs = (n) => `${n.toFixed(n < 10 ? 1 : 0)}s`;

  lines.push(`${p.cuts.length} cut${p.cuts.length === 1 ? '' : 's'} in ${secs(p.duration)} — `
    + `${p.pace.name.toLowerCase()}, ${p.pace.note}.`);
  lines.push(`Shots run ${secs(p.shotStats.min)} to ${secs(p.shotStats.max)}, `
    + `typically ${secs(p.shotStats.median)}.`);
  if (p.even) lines.push('Every shot is close to the same length — a template-style edit, not a hand cut.');
  if (p.dissolves.length) {
    lines.push(`${p.dissolves.length} of the changes are dissolves or fades rather than hard cuts.`);
  }
  if (p.onBeat) {
    lines.push(`Cut to the music: ${Math.round(p.onBeat.ratio * 100)}% of cuts land on `
      + `every ${p.onBeat.every === 1 ? 'beat' : `${p.onBeat.every} beats`}`
      + `${p.beats?.bpm ? ` at ${p.beats.bpm} BPM` : ''}.`);
  } else if (p.beats?.bpm) {
    lines.push(`Music at ${p.beats.bpm} BPM, but the cuts do not follow it.`);
  }
  lines.push(`Shot ${p.ratio}${p.ratio === '9:16' ? ' — vertical, made for phones' : ''}.`);
  if (p.look.id !== 'none') lines.push(`Closest grade in our library: ${p.look.name}.`);
  lines.push(p.motion > 0.055
    ? 'A lot of movement inside the shots — handheld, or heavy push-ins.'
    : p.motion > 0.022 ? 'Gentle movement inside the shots.' : 'Mostly locked-off shots.');
  if (p.captions) lines.push('Captions burnt into the lower third.');
  return lines;
}

/* ------------------------------------------------------------------ *
 * Turning a profile into an edit
 * ------------------------------------------------------------------ */

/**
 * Build a plan that gives your clips the reference's structure.
 *
 * Deliberately built from the same operations the AI panel and the one-tap
 * styles already use, so everything it produces is a normal timeline edit you
 * can drag, trim or undo — not a special mode with its own rules.
 */
export function planFromReference(profile, { media = [], beats = null, targetDur = null } = {}) {
  const usable = media.filter((m) => m.kind !== 'audio');
  const hasMusic = media.some((m) => m.kind === 'audio');
  const steps = [];
  const warnings = [];

  if (!usable.length) {
    return { steps: [], summary: 'Import some clips first — there is nothing to cut.', warnings: [] };
  }

  steps.push({
    op: 'setRatio', args: { ratio: profile.ratio },
    label: `Match the shape — ${profile.ratio}`,
    detail: `The reference is ${profile.ratio}.`,
  });

  const want = targetDur || profile.duration;
  const shotLen = Math.max(MIN_SHOT, profile.shotStats.median);

  if (usable.length < Math.round(want / shotLen)) {
    warnings.push(`The reference has ${profile.shots.length} shots and you have ${usable.length} clip`
      + `${usable.length === 1 ? '' : 's'}. Clips get reused and different sections of the longer ones used, `
      + 'so it will not look repetitive — but more footage would follow the pattern more closely.');
  }

  /* Cutting to the music is the single thing that makes an edit feel like its
     reference, so it wins over the measured shot length whenever both apply.
     Without music there is no grid to cut against, and `layout` lays the same
     shot length down on a plain clock instead. */
  if (profile.onBeat && beats?.beats?.length) {
    steps.push({
      op: 'beatCut', args: { every: profile.onBeat.every, targetDur: want },
      label: `Cut on every ${profile.onBeat.every === 1 ? 'beat' : `${profile.onBeat.every} beats`}`,
      detail: `The reference puts ${Math.round(profile.onBeat.ratio * 100)}% of its cuts there.`,
    });
  } else {
    if (profile.onBeat && !beats?.beats?.length) {
      warnings.push('The reference is cut to music, but there is no music on your timeline to cut against. '
        + 'Import a track and run this again to get the rhythm as well as the pacing.');
    }
    steps.push({
      op: 'layout', args: { clipLength: Number(shotLen.toFixed(2)), targetDur: want, shuffle: !profile.even },
      label: `Hold each shot about ${shotLen.toFixed(1)}s`,
      detail: profile.even
        ? 'Every shot the same length, as in the reference.'
        : 'Varying the order the way the reference varies its lengths.',
    });
  }

  if (profile.look.id !== 'none') {
    steps.push({
      op: 'applyLook', args: { look: profile.look.id },
      label: `Grade towards ${profile.look.name}`,
      detail: 'Closest match in our library — the reference is already graded, so this is an approximation.',
    });
  }

  if (profile.dissolves.length > Math.max(2, profile.cuts.length * 0.25)) {
    steps.push({
      op: 'addTransitions', args: { type: 'dissolve', dur: 0.4 },
      label: 'Dissolve between shots',
      detail: `${profile.dissolves.length} of the reference's changes are dissolves rather than hard cuts.`,
    });
  }

  if (profile.motion > 0.055) {
    steps.push({
      op: 'beatZoom', args: { amount: 0.12 },
      label: 'Push in on the cuts',
      detail: 'The reference keeps moving inside every shot.',
    });
  } else if (profile.motion > 0.022) {
    steps.push({
      op: 'kenBurns', args: { amount: 0.06 },
      label: 'Drift slowly inside each shot',
      detail: 'The reference has gentle movement rather than locked-off shots.',
    });
  }

  if (profile.pace.id === 'frenetic' || profile.pace.id === 'fast') {
    steps.push({
      op: 'impactFrames', args: { every: 8, style: 'white', length: 0.05 },
      label: 'Impact frames on the hardest hits',
      detail: 'Standard in edits cut this fast.',
    });
  }

  if (profile.captions) {
    steps.push({
      op: 'captions', args: { style: 'tiktok' },
      label: 'Captions across the lower third',
      detail: 'The reference has them burnt in.',
    });
  }

  if (hasMusic) {
    steps.push({ op: 'fitMusic', args: { fadeOut: 0.6, duck: true }, label: 'Trim the music to the edit' });
  }
  steps.push({ op: 'fadeEnds', args: { dur: 0.25 }, label: 'Tidy the first and last frame' });

  const summary = `Rebuilding a ${profile.pace.name.toLowerCase()} ${profile.ratio} edit — `
    + `${profile.cuts.length} cuts in ${profile.duration.toFixed(0)}s, `
    + `${profile.onBeat && beats?.beats?.length
        ? `on every ${profile.onBeat.every} beat${profile.onBeat.every === 1 ? '' : 's'}`
        : `about ${shotLen.toFixed(1)}s a shot`}`
    + `${profile.look.id !== 'none' ? `, graded towards ${profile.look.name}` : ''}.`;

  return { steps, summary, warnings, profile };
}

/*
 * The profile shape, for anything else that wants to read one:
 *
 *   {
 *     source:        { name, width, height },
 *     duration:      seconds,
 *     ratio:         '9:16' | '1:1' | '4:5' | '16:9' | '21:9',
 *     cuts:          [seconds],       hard cuts
 *     dissolves:     [seconds],       gradual changes
 *     shots:         [{ start, dur }],
 *     shotStats:     { mean, median, min, max, sd },
 *     cutsPerSecond: number,
 *     pace:          { id, name, note },
 *     even:          true when every shot is nearly the same length,
 *     look:          { id, name },    closest match in LOOKS
 *     colour:        { luma, contrast, sat, warm },   0..1 each
 *     motion:        0..1, movement within shots, cuts excluded
 *     captions:      boolean,
 *     beats:         detectBeats() output for the reference's own audio, or null,
 *     onBeat:        { every, ratio, grid } or null,
 *     frames:        how many were sampled
 *   }
 */
