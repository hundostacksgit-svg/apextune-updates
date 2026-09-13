/*
 * Finding the cuts in a video that has already been cut.
 *
 * The specific job: somebody exported an edit, or downloaded one, and wants
 * the pieces back. Premiere calls it scene edit detection and it is the one
 * feature that turns a flat file back into an edit — without it the only way
 * to get at the shots is to scrub and split by hand, which for a three-minute
 * sequence is twenty minutes of nobody's time well spent.
 *
 * It looks for hard cuts, not for dissolves. A hard cut is a single frame
 * where everything changes at once, which is a sharp spike in the difference
 * between neighbouring frames; a dissolve is that same change spread over
 * twenty frames and is indistinguishable from a fast pan. Claiming to find
 * both would mean cutting in the middle of every whip pan in the file.
 */

const ANALYSIS_WIDTH = 96;        // a thumbnail is plenty: a cut is not subtle

/**
 * Scan a video element and return the times, in seconds, where a cut happens.
 *
 * `step` is how often it looks. The default of 1/12th of a second is about
 * three frames at 25fps — fine enough to place a cut within a frame or two,
 * coarse enough that a three-minute file is a few hundred reads rather than
 * five thousand.
 */
export async function findCuts(video, {
  from = 0, to = null, step = 1 / 12, sensitivity = 0.5, signal = null, onProgress = null,
} = {}) {
  if (!video?.videoWidth) throw new Error('That clip has not finished loading yet.');
  const end = Math.min(to ?? video.duration ?? 0, video.duration ?? 0);
  if (!(end > from + 0.2)) return [];

  const w = ANALYSIS_WIDTH;
  const h = Math.max(2, Math.round(w * ((video.videoHeight || 9) / (video.videoWidth || 16))));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const seek = (time) => new Promise((resolve) => {
    const target = Math.max(0, Math.min(time, (video.duration || 0) - 0.02));
    if (Math.abs(video.currentTime - target) < 0.004) { resolve(true); return; }
    const done = () => { clearTimeout(bail); resolve(true); };
    const bail = setTimeout(() => { video.removeEventListener('seeked', done); resolve(false); }, 2500);
    video.addEventListener('seeked', done, { once: true });
    try { video.currentTime = target; } catch { clearTimeout(bail); resolve(false); }
  });

  /*
   * A coarse colour histogram, not the pixels.
   *
   * Comparing pixels directly makes every pan and every handheld wobble look
   * like a cut, because every pixel did change. A histogram asks a different
   * question — "is this the same *place*" — and a pan through one room barely
   * moves it while a cut to another room moves it completely.
   */
  const BINS = 4;                                   // 4x4x4 = 64 buckets
  const histogram = () => {
    ctx.drawImage(video, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const hist = new Float32Array(BINS * BINS * BINS);
    for (let i = 0; i < d.length; i += 4) {
      const r = (d[i] * BINS) >> 8, g = (d[i + 1] * BINS) >> 8, b = (d[i + 2] * BINS) >> 8;
      hist[r * BINS * BINS + g * BINS + b] += 1;
    }
    const total = d.length / 4;
    for (let i = 0; i < hist.length; i++) hist[i] /= total;
    return hist;
  };

  /* Total variation: half the sum of absolute differences, so it runs 0 to 1
     and reads as "what fraction of the picture is somewhere else now". */
  const distance = (a, b) => {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
    return sum / 2;
  };

  const times = [];
  const scores = [];
  let previous = null;
  const steps = Math.ceil((end - from) / step);

  for (let i = 0; i <= steps; i++) {
    if (signal?.aborted) throw new Error('Stopped');
    const at = Math.min(end, from + i * step);
    // eslint-disable-next-line no-await-in-loop -- one frame at a time, by nature
    const landed = await seek(at);
    if (!landed) continue;
    const hist = histogram();
    if (previous) { times.push(at); scores.push(distance(previous, hist)); }
    previous = hist;
    if (onProgress && i % 8 === 0) onProgress(i / steps);
  }
  if (!scores.length) return [];

  /*
   * The threshold comes from the file, not from a constant.
   *
   * A locked-off interview and a handheld skate video have completely
   * different amounts of ordinary frame-to-frame change, and one fixed number
   * either misses every cut in the first or finds a hundred in the second. The
   * median is what "normal" looks like in *this* file; a cut has to stand well
   * clear of it.
   */
  const sorted = [...scores].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const high = sorted[Math.floor(sorted.length * 0.9)];
  // sensitivity 0 is cautious, 1 finds everything; 0.5 is the default.
  const margin = 1.8 - sensitivity * 1.1;
  const threshold = Math.max(0.18, median + Math.max(high - median, 0.08) * margin);

  const cuts = [];
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] < threshold) continue;
    /*
     * Never a cut in the first fifth of a second.
     *
     * The first comparison is between the frame the decoder happened to be
     * showing and the first one actually sought to, and those routinely differ
     * completely — a colour bar against the opening shot. It reads as a cut
     * every time, and splitting there leaves a two-frame sliver at the head of
     * the clip. A real cut that early is not worth having either.
     */
    if (times[i] - from < 0.2) continue;
    // A cut is a spike, so it has to beat its neighbours too — otherwise a
    // slow ramp of change registers as several cuts in a row.
    const before = i > 0 ? scores[i - 1] : 0;
    const after = i < scores.length - 1 ? scores[i + 1] : 0;
    if (scores[i] < before || scores[i] < after) continue;
    // And never two within a third of a second: that is a flash, not two cuts.
    if (cuts.length && times[i] - cuts[cuts.length - 1] < 0.34) continue;
    cuts.push(times[i]);
  }
  return cuts;
}

/**
 * Split a clip at every cut found inside it.
 *
 * Returns how many splits were made. Times come back in source time, so they
 * are mapped through the clip's own in point and speed before being used —
 * a clip trimmed to the middle of a file would otherwise be cut in the wrong
 * places, and every one of them would be subtly wrong rather than obviously.
 */
export function splitAtCuts(project, clipId, sourceCuts, splitClip) {
  const clip = project.clips.find((c) => c.id === clipId);
  if (!clip) return 0;
  const speed = clip.speed || 1;
  const timeline = sourceCuts
    .map((st) => clip.start + (st - clip.in) / speed)
    .filter((t) => t > clip.start + 0.08 && t < clip.start + clip.dur - 0.08)
    .sort((a, b) => b - a);              // last first, so earlier ones stay put

  let made = 0;
  for (const at of timeline) {
    // Whichever piece now contains this moment is the one to cut.
    const target = project.clips.find((c) =>
      c.trackId === clip.trackId && at > c.start + 0.04 && at < c.start + c.dur - 0.04);
    if (target && splitClip(project, target.id, at)) made++;
  }
  return made;
}
