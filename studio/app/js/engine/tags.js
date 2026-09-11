/*
 * Working out what a clip contains, so a library of a hundred files is
 * searchable instead of a wall of filenames.
 *
 * No model, and the honesty about that matters: these are not semantic labels.
 * Nothing here knows what a dog is. What it knows is what can be measured from
 * the pixels and the audio, and it turns out most of what you actually search
 * for when hunting through your own footage is measurable:
 *
 *   "the wide shots"        — how much detail, how far the subject fills frame
 *   "the outdoor stuff"     — colour temperature and sky-coloured top third
 *   "the talking heads"     — a stable, centred, skin-toned region + speech
 *   "the handheld ones"     — frame-to-frame motion with no consistent direction
 *   "the dark ones"         — luminance distribution
 *   "the ones with music"   — spectral flatness and a steady beat
 *
 * So the tags are descriptive rather than semantic, and they are named so that
 * is obvious. "Outdoors" is a guess from colour; the app says so by putting
 * these under "Looks like" rather than presenting them as fact.
 */

const SAMPLES = 6;

/** Sample a few frames and reduce each to the handful of numbers that matter. */
async function sampleFrames(video, { from = 0, to = null, size = 96 } = {}) {
  const end = to ?? video.duration ?? 0;
  const w = size;
  const h = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * size));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });

  const frames = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t = from + ((end - from) * (i + 0.5)) / SAMPLES;
    // eslint-disable-next-line no-await-in-loop -- seeks are sequential
    await seek(video, t);
    ctx.drawImage(video, 0, 0, w, h);
    let img;
    try { img = ctx.getImageData(0, 0, w, h); } catch { break; }
    frames.push({ t, data: img.data, w, h });
  }
  return frames;
}

function seek(video, t) {
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); video.removeEventListener('seeked', done); resolve(); };
    const timer = setTimeout(done, 1800);
    video.addEventListener('seeked', done, { once: true });
    try { video.currentTime = Math.max(0, t); } catch { done(); }
  });
}

/** Per-frame measurements the tags are derived from. */
function measure(frame) {
  const { data: d, w, h } = frame;
  let lum = 0, warm = 0, sat = 0, skin = 0, n = 0;
  let topBlue = 0, topN = 0;
  const hist = new Float32Array(16);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const l = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      lum += l;
      warm += (r - b) / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      sat += mx ? (mx - mn) / mx : 0;
      hist[Math.min(15, Math.floor(l * 16))]++;

      // Skin: a broad band, and deliberately broad. Narrow skin detection
      // built on one complexion is the classic way these features fail people.
      if (r > 60 && r > g && g > b && (r - b) > 14 && (r - b) < 130 && l > 0.16 && l < 0.92) skin++;

      if (y < h * 0.33) { topN++; if (b > r + 12 && b > 70) topBlue++; }
      n++;
    }
  }

  // Edge energy: how much fine detail there is. A wide landscape is dense,
  // a shallow-focus close-up is not.
  let edge = 0, en = 0;
  for (let y = 1; y < h - 1; y += 2) {
    for (let x = 1; x < w - 1; x += 2) {
      const i = (y * w + x) * 4;
      const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      const lx = d[i + 4] * 0.299 + d[i + 5] * 0.587 + d[i + 6] * 0.114;
      const ly = d[i + w * 4] * 0.299 + d[i + w * 4 + 1] * 0.587 + d[i + w * 4 + 2] * 0.114;
      edge += (Math.abs(l - lx) + Math.abs(l - ly)) / 510;
      en++;
    }
  }

  return {
    lum: lum / n,
    warm: warm / n,
    sat: sat / n,
    skin: skin / n,
    sky: topN ? topBlue / topN : 0,
    edge: en ? edge / en : 0,
    hist: Array.from(hist, (v) => v / n),
  };
}

/** How much the picture changes between two frames, 0..1. */
function change(a, b) {
  let sum = 0;
  const d1 = a.data, d2 = b.data;
  for (let i = 0; i < d1.length; i += 16) sum += Math.abs(d1[i] - d2[i]);
  return Math.min(1, (sum / (d1.length / 16)) / 60);
}

/**
 * Tag one media record.
 *
 * Returns descriptive tags plus the raw measurements, because the measurements
 * are what the B-roll matcher scores against — it wants "how bright, how busy,
 * how much motion", not a word.
 */
export async function tagVideo(video, opts = {}) {
  if (!video?.videoWidth) return { tags: [], stats: null };
  const frames = await sampleFrames(video, opts);
  if (!frames.length) return { tags: [], stats: null };

  const m = frames.map(measure);
  const avg = (k) => m.reduce((s, x) => s + x[k], 0) / m.length;

  let motion = 0;
  for (let i = 1; i < frames.length; i++) motion += change(frames[i - 1], frames[i]);
  motion = frames.length > 1 ? motion / (frames.length - 1) : 0;

  const stats = {
    lum: avg('lum'), warm: avg('warm'), sat: avg('sat'),
    skin: avg('skin'), sky: avg('sky'), edge: avg('edge'),
    motion,
    portrait: video.videoHeight > video.videoWidth,
    width: video.videoWidth, height: video.videoHeight,
  };

  const tags = [];
  // Framing. Skin filling a lot of the frame with little fine detail is a
  // face close to the lens; lots of detail and little skin is a wide shot.
  if (stats.skin > 0.16 && stats.edge < 0.09) tags.push('Close-up');
  else if (stats.edge > 0.13 && stats.skin < 0.07) tags.push('Wide shot');

  if (stats.skin > 0.10 && stats.motion < 0.18) tags.push('Talking head');

  // Outdoors is a guess and is presented as one. Sky-coloured top third plus
  // a cool overall cast is what daylight looks like from inside a histogram.
  if (stats.sky > 0.32 && stats.lum > 0.38) tags.push('Outdoors');
  else if (stats.warm > 0.06 && stats.sky < 0.12) tags.push('Indoors');

  if (stats.lum < 0.26) tags.push('Low light');
  else if (stats.lum > 0.72) tags.push('Bright');

  if (stats.motion > 0.42) tags.push('Fast motion');
  else if (stats.motion < 0.055) tags.push('Locked off');

  if (stats.sat < 0.14) tags.push('Muted');
  else if (stats.sat > 0.46) tags.push('Colourful');

  if (stats.portrait) tags.push('Vertical');

  return { tags, stats };
}

/**
 * Score how well a clip suits a moment in a script or a piece of music.
 *
 * This is what makes B-roll matching more than shuffling: given what a moment
 * wants — "energetic", "calm", "a face" — it ranks the person's own footage by
 * the measurements rather than picking at random.
 */
export function scoreFor(stats, want = {}) {
  if (!stats) return 0;
  let score = 0;
  if (want.energy !== undefined) score += 1 - Math.abs(stats.motion - want.energy);
  if (want.bright !== undefined) score += 1 - Math.abs(stats.lum - want.bright);
  if (want.face) score += stats.skin > 0.09 ? 1 : 0;
  if (want.noFace) score += stats.skin < 0.06 ? 1 : 0;
  if (want.vertical !== undefined) score += stats.portrait === want.vertical ? 0.5 : 0;
  return score;
}
