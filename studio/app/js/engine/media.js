/*
 * Bringing files in, and everything we learn about them.
 *
 * Import does four things: store the bytes, work out what the file is, make
 * pictures of it for the timeline, and decode its audio. The audio decode is
 * what the beat-sync, silence-removal and waveform features all stand on, so
 * it happens once and the result is cached on the media record.
 *
 * Nothing here uploads anything. Object URLs point at bytes in this tab.
 */

import { uid } from '../ui.js';
import * as store from '../store.js';

const POOL = () => document.getElementById('media-pool');

/*
 * Runtime handles live here, not on the media record.
 *
 * A project document has to survive structuredClone — that is how undo works —
 * and an AudioBuffer cannot be cloned at all. Keeping blobs, object URLs and
 * decoded audio in a side table keyed by media id means the document stays
 * plain JSON, so it clones, serialises and saves without anything having to
 * remember to strip fields first.
 */
const runtime = new Map();

function slot(id) {
  let rec = runtime.get(id);
  if (!rec) { rec = {}; runtime.set(id, rec); }
  return rec;
}

/** Attach bytes to a media record. Revokes any URL it replaces. */
export function attach(media, { blob, objectUrl, proxyUrl } = {}) {
  const rec = slot(media.id);
  if (objectUrl && rec.objectUrl && rec.objectUrl !== objectUrl) URL.revokeObjectURL(rec.objectUrl);
  if (proxyUrl && rec.proxyUrl && rec.proxyUrl !== proxyUrl) URL.revokeObjectURL(rec.proxyUrl);
  if (blob) rec.blob = blob;
  if (objectUrl) rec.objectUrl = objectUrl;
  if (proxyUrl) rec.proxyUrl = proxyUrl;
  return rec;
}

/*
 * Preview uses the proxy when there is one; export never does.
 *
 * That split is the entire point — a proxy exists so scrubbing is smooth on a
 * laptop, and an export that quietly used the 540p copy would be a disaster
 * nobody notices until the video is posted.
 */
let useProxies = true;
export function setProxyMode(on) { useProxies = Boolean(on); }
export function proxyMode() { return useProxies; }

export function urlOf(media, { preferProxy = false } = {}) {
  if (!media) return null;
  const rec = runtime.get(media.id);
  if (!rec) return null;
  if (preferProxy && useProxies && rec.proxyUrl) return rec.proxyUrl;
  return rec.objectUrl || null;
}

export function hasProxy(media) { return Boolean(media && runtime.get(media.id)?.proxyUrl); }
export function blobOf(media) { return media ? runtime.get(media.id)?.blob || null : null; }
export function bufferOf(media) { return media ? runtime.get(media.id)?.buffer || null : null; }

/** True once bytes are available — i.e. the media can actually be drawn. */
export function isReady(media) { return Boolean(urlOf(media)); }

export function forget(mediaId) {
  const rec = runtime.get(mediaId);
  if (rec?.objectUrl) URL.revokeObjectURL(rec.objectUrl);
  if (rec?.proxyUrl) URL.revokeObjectURL(rec.proxyUrl);
  runtime.delete(mediaId);
}

export const KIND = {
  video: (t) => t.startsWith('video/'),
  audio: (t) => t.startsWith('audio/'),
  image: (t) => t.startsWith('image/'),
};

export function kindOf(file) {
  const t = file.type || '';
  if (KIND.video(t)) return 'video';
  if (KIND.audio(t)) return 'audio';
  if (KIND.image(t)) return 'image';
  // Some phones hand over an empty MIME type; fall back to the extension.
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', '3gp'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'opus'].includes(ext)) return 'audio';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'avif', 'bmp'].includes(ext)) return 'image';
  return null;
}

/* ------------------------------------------------------------------ */
/* import                                                              */
/* ------------------------------------------------------------------ */

/**
 * Import one file. Returns a media record ready to drop on the timeline.
 * `onProgress` reports which stage we're at so the UI can say something
 * truthful instead of an indeterminate spinner.
 */
export async function importFile(file, { onProgress } = {}) {
  const kind = kindOf(file);
  if (!kind) throw new Error(`${file.name} isn't a video, image or audio file we can read.`);

  onProgress?.('reading');
  const hash = await store.fingerprint(file);
  const objectUrl = URL.createObjectURL(file);

  onProgress?.('probing');
  const probe = kind === 'image' ? await probeImage(objectUrl) : await probeAV(objectUrl, kind);

  const id = uid('m');
  const media = {
    id,
    hash,
    name: file.name,
    kind,
    type: file.type,
    size: file.size,
    duration: kind === 'image' ? 5 : probe.duration,
    width: probe.width,
    height: probe.height,
    hasAudio: kind === 'audio' ? true : probe.hasAudio,
    poster: null,
    filmstrip: null,
    peaks: null,
    addedAt: Date.now(),
  };
  attach(media, { blob: file, objectUrl });

  onProgress?.('storing');
  await store.putMedia(hash, file, { name: file.name, kind, duration: media.duration });

  onProgress?.('thumbnails');
  if (kind === 'video') {
    media.poster = await frameAt(objectUrl, Math.min(0.6, media.duration * 0.1), 320);
    media.filmstrip = await filmstrip(objectUrl, media.duration, 10, 160);
  } else if (kind === 'image') {
    media.poster = await imageThumb(objectUrl, 320);
  }

  return media;
}

/** Re-attach stored bytes to a project opened from the database. */
export async function rehydrate(media) {
  if (urlOf(media)) { media.missing = false; return media; }
  const rec = await store.getMedia(media.hash);
  if (!rec) { media.missing = true; return media; }
  attach(media, { blob: rec.blob, objectUrl: URL.createObjectURL(rec.blob) });
  media.missing = false;
  return media;
}

/* ------------------------------------------------------------------ */
/* probing                                                             */
/* ------------------------------------------------------------------ */

function probeAV(url, kind) {
  return new Promise((resolve, reject) => {
    const node = document.createElement(kind === 'audio' ? 'audio' : 'video');
    node.preload = 'metadata';
    node.muted = true;
    node.src = url;
    const done = async () => {
      // Screen recordings and anything MediaRecorder made routinely report
      // Infinity here until the browser scans to the end. Without this they
      // import as zero-length clips and look corrupt when they are fine.
      let duration = node.duration;
      if (!Number.isFinite(duration) || duration <= 0 || duration >= 86400) {
        const { resolveDuration } = await import('./proxy.js');
        duration = await resolveDuration(node);
      }
      resolve({
        duration: Number.isFinite(duration) ? duration : 0,
        width: node.videoWidth || 0,
        height: node.videoHeight || 0,
        // No portable "has an audio track" flag exists; these cover the
        // browsers that expose anything at all, and audio files are a given.
        hasAudio: kind === 'audio'
          || node.mozHasAudio === true
          || (node.webkitAudioDecodedByteCount ?? 0) > 0
          || (node.audioTracks?.length ?? 1) > 0,
      });
      cleanup();
    };
    const fail = () => { cleanup(); reject(new Error('That file could not be decoded by this browser.')); };
    const cleanup = () => {
      node.removeEventListener('loadedmetadata', done);
      node.removeEventListener('error', fail);
    };
    node.addEventListener('loadedmetadata', () => { done().catch(fail); });
    node.addEventListener('error', fail);
    setTimeout(() => { if (node.readyState === 0) fail(); }, 20000);
  });
}

function probeImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ duration: 5, width: img.naturalWidth, height: img.naturalHeight, hasAudio: false });
    img.onerror = () => reject(new Error('That image could not be read.'));
    img.src = url;
  });
}

/* ------------------------------------------------------------------ */
/* thumbnails                                                          */
/* ------------------------------------------------------------------ */

export function frameAt(url, time, width = 200) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'auto'; v.muted = true; v.playsInline = true; v.src = url;
    const bail = setTimeout(() => resolve(null), 9000);
    v.addEventListener('loadeddata', () => { v.currentTime = Math.min(time, Math.max(0, v.duration - 0.05)); });
    v.addEventListener('seeked', () => {
      clearTimeout(bail);
      try {
        const h = Math.round(width * (v.videoHeight / v.videoWidth || 0.5625));
        const cv = document.createElement('canvas');
        cv.width = width; cv.height = h;
        cv.getContext('2d').drawImage(v, 0, 0, width, h);
        resolve(cv.toDataURL('image/jpeg', 0.7));
      } catch { resolve(null); }
      v.src = '';
    }, { once: true });
    v.addEventListener('error', () => { clearTimeout(bail); resolve(null); });
  });
}

/** A strip of frames for the clip body on the timeline. */
export async function filmstrip(url, duration, count = 10, width = 140) {
  if (!duration || duration <= 0) return null;
  const v = document.createElement('video');
  v.preload = 'auto'; v.muted = true; v.playsInline = true; v.src = url;
  await new Promise((res) => {
    v.addEventListener('loadeddata', res, { once: true });
    v.addEventListener('error', res, { once: true });
    setTimeout(res, 9000);
  });
  if (!v.videoWidth) return null;

  const h = Math.round(width * (v.videoHeight / v.videoWidth));
  const cv = document.createElement('canvas');
  cv.width = width; cv.height = h;
  const ctx = cv.getContext('2d');
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = (duration * (i + 0.5)) / count;
    // eslint-disable-next-line no-await-in-loop -- seeks must be sequential
    const ok = await seek(v, Math.min(t, duration - 0.05));
    if (!ok) break;
    ctx.drawImage(v, 0, 0, width, h);
    out.push(cv.toDataURL('image/jpeg', 0.55));
  }
  v.src = '';
  return out.length ? out : null;
}

function seek(video, t) {
  return new Promise((resolve) => {
    const done = () => { clearTimeout(bail); resolve(true); };
    const bail = setTimeout(() => { video.removeEventListener('seeked', done); resolve(false); }, 4000);
    video.addEventListener('seeked', done, { once: true });
    video.currentTime = t;
  });
}

function imageThumb(url, width = 240) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const h = Math.round(width * (img.naturalHeight / img.naturalWidth));
      const cv = document.createElement('canvas');
      cv.width = width; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, width, h);
      resolve(cv.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/* ------------------------------------------------------------------ */
/* element pool                                                        */
/* ------------------------------------------------------------------ */
/*
 * One decoder per clip, not per file.
 *
 * Sharing a single <video> between two clips of the same file works right up
 * until both are on screen at once — a split-screen, or a cross dissolve from a
 * shot back to itself — and then one of them silently shows the other's frame.
 * Keying by clip makes that correct. To stop a hundred-clip project opening a
 * hundred decoders, the pool is an LRU: only what's recently been drawn stays
 * alive, and everything else is torn down and rebuilt on demand.
 */

const POOL_LIMIT = 20;
const elements = new Map();          // Map preserves insertion order = LRU order

export function elementFor(media, clipId = 'shared', { preferProxy = false } = {}) {
  const src = urlOf(media, { preferProxy });
  if (!src) return null;
  // Proxy and original are different elements: swapping the src on one would
  // reset its position mid-scrub.
  const key = `${media.id}:${clipId}${preferProxy && src !== urlOf(media) ? ':proxy' : ''}`;
  const cached = elements.get(key);
  if (cached) {
    elements.delete(key);            // move to the back: most recently used
    elements.set(key, cached);
    return cached;
  }

  let node;
  if (media.kind === 'image') {
    node = new Image();
    node.src = src;
  } else {
    node = document.createElement(media.kind === 'audio' ? 'audio' : 'video');
    node.src = src;
    node.preload = 'auto';
    /*
     * Inline, both ways of saying it.
     *
     * The property is the modern spelling and the bare attribute is what iOS
     * before 10 reads. Without one of them Safari on a phone takes any play()
     * as a request to go fullscreen, which on a video editor means the
     * timeline vanishes the moment somebody presses play.
     */
    node.playsInline = true;
    node.setAttribute('playsinline', '');
    node.setAttribute('webkit-playsinline', '');
    /*
     * No AirPlay or cast route for a pooled element. These are decoders, not
     * things anybody wants to watch on a television — and a phone that routes
     * one to an external display stops handing frames back to the canvas,
     * which reads in the app as the picture freezing.
     */
    node.disableRemotePlayback = true;
    node.setAttribute('disableremoteplayback', '');
    node.muted = true;               // the audio graph takes over once built
    node.load();
  }
  POOL()?.appendChild(node);
  elements.set(key, node);

  // Evict the coldest entries. An element currently feeding the audio graph is
  // kept regardless — tearing that down mid-playback is an audible glitch.
  while (elements.size > POOL_LIMIT) {
    const [oldestKey, oldest] = elements.entries().next().value;
    if (oldest?.dataset?.wired === '1') {
      elements.delete(oldestKey);
      elements.set(oldestKey, oldest);
      break;
    }
    elements.delete(oldestKey);
    teardown(oldest);
  }
  return node;
}

function teardown(node) {
  try { node.pause?.(); node.removeAttribute('src'); node.load?.(); } catch { /* already gone */ }
  node.remove();
}

/** Every live element, for the audio engine to walk. */
export function liveElements() {
  return [...elements.entries()].map(([key, node]) => ({ key, node }));
}

/*
 * Spend a real user gesture unlocking every decoder we have.
 *
 * Phones will not start an unmuted media element without one, and the gesture
 * only counts while the browser is still handling it — a play() from inside
 * an animation frame a few hundred milliseconds later is not the same thing.
 * The transport starts its elements from an animation frame, necessarily, so
 * the gesture has to be spent up front on a play() we immediately abandon.
 *
 * The pause is synchronous and deliberate: this is not trying to play
 * anything, only to move each element into the state where a later play()
 * from a timer is allowed. Elements created after the first gesture inherit
 * the document's activation and need none of this.
 */
export function unlock() {
  for (const [, node] of elements) {
    if (!node || typeof node.play !== 'function' || !node.paused) continue;
    let p;
    try { p = node.play(); } catch { continue; }
    // A rejected promise here is the expected outcome, not a failure worth
    // reporting — the point was to ask, and asking is what unlocks it.
    p?.then?.(() => { try { node.pause(); } catch { /* already stopped */ } },
      () => { /* refused; media-clock's fallback keeps the picture moving */ });
  }
}

export function releaseFor(mediaId) {
  for (const [key, node] of [...elements.entries()]) {
    if (key.startsWith(`${mediaId}:`)) { elements.delete(key); teardown(node); }
  }
  forget(mediaId);
}

export function releaseAll() {
  for (const [, node] of [...elements.entries()]) teardown(node);
  elements.clear();
  for (const id of [...runtime.keys()]) forget(id);
}

/* ------------------------------------------------------------------ */
/* audio analysis                                                      */
/* ------------------------------------------------------------------ */

let sharedCtx = null;
function audioContext() {
  sharedCtx ||= new (window.AudioContext || window.webkitAudioContext)();
  return sharedCtx;
}

/** Decode a media file's audio. Cached on the record — it isn't cheap. */
export async function decode(media) {
  const cached = bufferOf(media);
  if (cached) return cached;
  if (!blobOf(media)) await rehydrate(media);
  const blob = blobOf(media);
  if (!blob) return null;
  try {
    const bytes = await blob.arrayBuffer();
    const buffer = await audioContext().decodeAudioData(bytes);
    slot(media.id).buffer = buffer;
    return buffer;
  } catch {
    // Silent video, or a codec this browser can decode for playback but not
    // through decodeAudioData. Not an error worth interrupting anyone over.
    media.hasAudio = false;
    return null;
  }
}

/** Peak pairs for drawing a waveform: [min, max] per bucket, −1..1. */
export function peaks(buffer, buckets = 600) {
  if (!buffer) return null;
  const data = buffer.getChannelData(0);
  const per = Math.max(1, Math.floor(data.length / buckets));
  const out = new Array(buckets * 2);
  for (let b = 0; b < buckets; b++) {
    let lo = 1, hi = -1;
    const start = b * per;
    const end = Math.min(data.length, start + per);
    for (let i = start; i < end; i++) {
      const v = data[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    out[b * 2] = end > start ? lo : 0;
    out[b * 2 + 1] = end > start ? hi : 0;
  }
  return out;
}

/**
 * Onset envelope: how much the energy rose in each short window. This is the
 * input to both beat detection and the "cut here" suggestions.
 *
 * Three bands, kept separate. The beat of almost every track lives in the
 * kick and the snare — the low and the middle — while the hi-hats above them
 * mark the subdivisions. Each band is log-compressed first so a quiet verse
 * and a loud chorus count the same, which is what lets one grid hold across
 * the whole song. `env` is the sum, for callers that want one curve; `bands`
 * is what the tempo detector reads, because the bands disagree in exactly
 * the way that tells the beat from the pattern.
 */
export function onsetEnvelope(buffer, hop = 256) {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const frames = Math.floor(data.length / hop);
  const env = new Float32Array(frames);
  const bands = [new Float32Array(frames), new Float32Array(frames), new Float32Array(frames)];
  // One-pole low-passes at 300 Hz and 2.5 kHz; the bands are the differences.
  // The split sits above an 808's fundamentals and below a snare's crack,
  // so a sustained bass note cannot mask the backbeat in the middle band.
  const aLo = Math.exp((-2 * Math.PI * 300) / sr);
  const aMid = Math.exp((-2 * Math.PI * 2500) / sr);
  let lo = 0, mid = 0, pLo = 0, pMid = 0, pHi = 0;
  for (let f = 0; f < frames; f++) {
    let sl = 0, sm = 0, sh = 0;
    const start = f * hop;
    for (let i = start; i < start + hop; i++) {
      const x = data[i];
      lo += (1 - aLo) * (x - lo);
      mid += (1 - aMid) * (x - mid);
      const m = mid - lo, h = x - mid;
      sl += lo * lo; sm += m * m; sh += h * h;
    }
    const rl = Math.log1p(60 * Math.sqrt(sl / hop));
    const rm = Math.log1p(60 * Math.sqrt(sm / hop));
    const rh = Math.log1p(60 * Math.sqrt(sh / hop));
    bands[0][f] = Math.max(0, rl - pLo);
    bands[1][f] = Math.max(0, rm - pMid);
    bands[2][f] = Math.max(0, rh - pHi);
    env[f] = bands[0][f] + bands[1][f] + 0.4 * bands[2][f];
    pLo = rl; pMid = rm; pHi = rh;
  }
  return { env, bands, rate: sr / hop };
}

/* Smooth by about twelve milliseconds and take the mean out. */
function centred(env) {
  const K = [0.054, 0.242, 0.4, 0.242, 0.054];   // Gaussian, sigma one frame
  const out = new Float32Array(env.length);
  let mean = 0;
  for (let i = 0; i < env.length; i++) mean += env[i];
  mean /= env.length || 1;
  for (let i = 0; i < env.length; i++) { let v = 0; for (let j = -2; j <= 2; j++) v += K[j + 2] * (env[i + j] || 0); out[i] = v - mean; }
  return { e: out, mean };
}

/**
 * Tempo and a beat grid.
 *
 * Autocorrelation over the onset envelope finds periods, but a drum pattern
 * has more than one, and the strongest is rarely the beat. A trap or drill
 * kick sits on a three-three-two figure whose self-similarity peaks at a
 * beat and a half; a snare on two and four repeats every two beats; hi-hats
 * repeat at every subdivision; the bar repeats loudest of all. So this is
 * done in two stages, the way a person does it:
 *
 *   1. A comb over the summed onsets — a lag, half-weight at twice the lag,
 *      a quarter at four times, which in four-four only the beat and its
 *      octaves satisfy — shaded by a mild preference for the tempos people
 *      cut to, picks the *family*: a period, its half, its double, and the
 *      three-to-two relatives that syncopation throws up.
 *   2. Within the family, the octave is settled by the hi-hats: the beat is
 *      the reading on which they are eighths, triplets or sixteenths, not
 *      thirty-seconds and not whole beats. The three-to-two relatives are
 *      settled by the snare band, which repeats at two beats and never at
 *      three.
 *
 * The onsets are smoothed by a few milliseconds before any of this, because
 * a tight electronic kick is a one-frame spike and a beat period is never a
 * whole number of frames; left sharp, the true period scores worse than a
 * period that happens to round better. The lag is then read to a fraction
 * of a frame, and the grid is fitted by least squares to the onsets it lands
 * near. Both matter: a whole-frame lag is a tempo error of up to one per
 * cent, and one per cent over a three-minute song is a cut a full beat late
 * by the end. The result is a grid, not raw onsets, because cutting on a
 * grid looks intentional and cutting on raw onsets looks nervous.
 */
export function detectBeats(buffer, { min = 60, max = 190 } = {}) {
  if (!buffer) return null;
  const { env, bands, rate } = onsetEnvelope(buffer);
  const n = env.length;
  if (n < 8) return null;

  const loLag = Math.max(2, Math.floor((60 / max) * rate));
  const hiLag = Math.ceil((60 / min) * rate);
  if (hiLag * 4 >= n) return detectBeatsShort(buffer, env, rate, loLag, hiLag);

  const correlator = (signal) => {
    const { e } = centred(signal);
    const cache = new Map();
    return (lag) => {
      const L = Math.round(lag);
      if (L < 1 || L >= n - 4) return 0;
      if (cache.has(L)) return cache.get(L);
      let s = 0;
      for (let i = 0; i + L < n; i++) s += e[i] * e[i + L];
      const v = s / (n - L);
      cache.set(L, v);
      return v;
    };
  };
  const acSum = correlator(env);
  const acMid = correlator(bands[1]);
  const acHi = correlator(bands[2]);
  const bpmOf = (lag) => (60 * rate) / lag;
  const prior = (lag) => Math.exp(-0.5 * (Math.log2(bpmOf(lag) / 120) / 0.9) ** 2);
  const comb = (ac, lag) => ac(lag) + 0.5 * ac(lag * 2) + 0.25 * ac(lag * 4);

  /*
   * 1. the family. The scan runs down to 30 BPM, well below anything that
   * will be reported: a sparse track — a cinematic pulse with a hit every
   * two beats — has its only real period there, and the family brings it
   * back into range as its double or quadruple. Searching only inside the
   * range would leave such a track to whatever noise correlates best.
   */
  const scanHi = Math.min(n >> 2, Math.ceil((60 / 30) * rate));
  let bestLag = loLag, bestScore = -Infinity, sum = 0, counted = 0;
  for (let lag = loLag; lag <= scanHi; lag++) {
    const v = comb(acSum, lag) * prior(lag);
    sum += v; counted++;
    if (v > bestScore) { bestScore = v; bestLag = lag; }
  }
  const avg = counted ? sum / counted : 0;
  const confidence = avg > 0 ? Math.max(0, Math.min(1, (bestScore / avg - 1) / 4)) : 0;

  /* 2. the subdivision: the shortest strong period in the hats */
  const subdivision = (ac) => {
    // From 75 ms — under the smoothing's reach, and sixteenths at 190 BPM are 79 ms — to half a
    // second, which is eighths at 60 BPM.
    const lo = Math.max(2, Math.round(0.075 * rate)), hi = Math.round(0.5 * rate);
    const a = new Float32Array(hi + 2);
    let top = 0;
    for (let lag = lo; lag <= hi; lag++) { a[lag] = ac(lag); if (a[lag] > top) top = a[lag]; }
    if (top <= 0) return null;
    for (let lag = lo; lag <= hi; lag++) {
      if (a[lag] >= 0.8 * top && a[lag] >= a[lag - 1] && a[lag] >= a[lag + 1]) {
        const d = a[lag - 1] - 2 * a[lag] + a[lag + 1];
        return d < 0 ? lag + 0.5 * ((a[lag - 1] - a[lag + 1]) / d) : lag;
      }
    }
    return null;
  };
  const H = subdivision(acHi) ?? subdivision(acSum);
  // How plausible a beat of `lag` is given hats every H: eighths, triplets and sixteenths are
  // normal; sextuplets rare; thirty-seconds and hats only on the beat rarer still.
  const hatFactor = (lag) => {
    if (!H) return 1;
    const r = lag / H;
    if (r < 1.5) return 0.5;
    if (r < 2.6) return 1;                       // eighths
    if (r < 3.5) return 0.8;                     // triplets: real, but the rarer reading
    if (r < 4.5) return 1;                       // sixteenths
    if (r < 6.6) return 0.6;
    return 0.35;
  };
  /*
   * Within the family — the pick, its octaves, and the three-to-two relatives
   * a syncopated kick or a swung hat throws up — the comb's own lean towards
   * the slower reading is flattened by the square root, and the hats have
   * the last word: the beat is the reading on which they are a sane
   * subdivision.
   */
  const inRange = (l) => l >= loLag && l <= hiLag;
  const family = [bestLag, bestLag / 2, bestLag / 4, bestLag * 2, (bestLag * 2) / 3, (bestLag * 3) / 2, (bestLag * 4) / 3, (bestLag * 3) / 4, bestLag / 3, (bestLag * 2) / 6]
    .map(Math.round)
    .filter((l, i, arr) => inRange(l) && arr.indexOf(l) === i);
  const score = (l) => Math.sqrt(Math.max(0, comb(acSum, l))) * prior(l) * hatFactor(l);
  let pick = bestLag, pickScore = -Infinity;
  for (const l of family) { const v = score(l); if (v > pickScore) { pickScore = v; pick = l; } }

  const drums = new Float32Array(n);
  for (let i = 0; i < n; i++) drums[i] = bands[0][i] + bands[1][i];
  return finishGrid(buffer, env, rate, refineLag(env, pick), confidence, drums);
}

/*
 * The lag to a fraction of a frame.
 *
 * A parabola over the three integer neighbours of the correlation peak gets
 * within a quarter of a frame, and a quarter of a frame per beat is a full
 * beat of drift by the end of a song. The precise answer comes from the
 * onsets themselves: every pair of onset peaks that sit a whole number of
 * beats apart is a measurement of the period, made without knowing the
 * phase, and the median of those measurements is exact to the frame rate's
 * own limit — the hits in an electronic track fall on the grid to the
 * sample, and a drummer's do not, but the median of a few hundred of them
 * is still the tempo they are playing.
 */
function refineLag(env, lag0) {
  const n = env.length;
  const K = [0.011, 0.045, 0.117, 0.201, 0.252, 0.201, 0.117, 0.045, 0.011];   // Gaussian, sigma 1.6 frames
  let mean = 0, peak = 0;
  for (let i = 0; i < n; i++) { mean += env[i]; if (env[i] > peak) peak = env[i]; }
  mean /= n || 1;
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) { let v = 0; for (let j = -4; j <= 4; j++) v += K[j + 4] * (env[i + j] || 0); e[i] = v - mean; }
  const ac = (lag) => { if (lag < 1 || lag >= n - 4) return 0; let s = 0; for (let i = 0; i + lag < n; i++) s += e[i] * e[i + lag]; return s / (n - lag); };
  const a = ac(lag0 - 1), b = ac(lag0), c = ac(lag0 + 1);
  const denom = a - 2 * b + c;
  let period = lag0;
  if (denom < 0) { const d = 0.5 * ((a - c) / denom); if (Math.abs(d) <= 1) period = lag0 + d; }

  // Onset peaks, each placed to a fraction of a frame by the parabola through
  // its three frames: an onset that straddles two frames is between them.
  const floor = Math.max(mean * 1.5, peak * 0.12);
  const peaks = [];
  for (let i = 1; i < n - 1; i++) {
    if (!(env[i] > floor && env[i] >= env[i - 1] && env[i] > env[i + 1])) continue;
    const dd = env[i - 1] - 2 * env[i] + env[i + 1];
    peaks.push(dd < 0 ? i + 0.5 * ((env[i - 1] - env[i + 1]) / dd) : i);
  }
  const reach = period * 4.2;
  const measured = [];
  for (let x = 0; x < peaks.length; x++) {
    for (let y = x + 1; y < peaks.length; y++) {
      const gap = peaks[y] - peaks[x];
      if (gap > reach) break;
      const m = Math.round(gap / period);
      if (m < 1) continue;
      const one = gap / m;
      if (Math.abs(one - period) < 0.06 * period) measured.push(one);
    }
  }
  if (measured.length < 12) return period;
  // The mean of the middle half: robust to the odd wrong pairing, and unlike
  // the median not stuck on the values a whole number of frames allows.
  measured.sort((p, q) => p - q);
  const lo = measured.length >> 2, hi = measured.length - lo;
  let acc = 0;
  for (let i = lo; i < hi; i++) acc += measured[i];
  const fitted = acc / (hi - lo);
  return Math.abs(fitted - period) < 0.06 * period ? fitted : period;
}

/* Under a few bars of audio the comb has nothing to hold on to: plain autocorrelation. */
function detectBeatsShort(buffer, env, rate, loLag, hiLag) {
  const { e } = centred(env);
  const n = e.length;
  let bestLag = loLag, bestScore = -Infinity;
  for (let lag = loLag; lag <= Math.min(hiLag, n - 4); lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += e[i] * e[i + lag];
    s /= (n - lag);
    if (s > bestScore) { bestScore = s; bestLag = lag; }
  }
  return finishGrid(buffer, env, rate, bestLag, 0.3);
}

/*
 * Phase, then a least-squares fit of the grid to the onsets it lands near.
 *
 * The phase is not simply the offset that collects the most onset energy of
 * any kind: hi-hats sit on every subdivision and would let any offset score.
 * What marks the beat is the drums — the kick and the snare — so the
 * opening bars nominate the offsets that land on the most kick and snare,
 * each is grown into a grid over the whole song by least squares, and the
 * grid that gathers the most drum energy is kept, with one prior on top: a
 * song that starts is a song that starts on a beat, so a grid through the
 * first strong hit is preferred over one that puts it between two beats.
 * That prior is what settles a pattern like drill, whose kicks and snares
 * are placed off the beat on purpose and would otherwise pull the grid a
 * half-beat late.
 */
function finishGrid(buffer, env, rate, lag, confidence, drums = null) {
  const n = env.length;
  let mean = 0, peak = 0;
  for (let i = 0; i < n; i++) { mean += env[i]; if (env[i] > peak) peak = env[i]; }
  mean /= n || 1;
  const hits = drums || env;
  const at = (arr, c) => Math.max(arr[c] || 0, arr[c - 1] || 0, arr[c + 1] || 0, arr[c - 2] || 0, arr[c + 2] || 0);
  let first = 0;
  while (first < n && env[first] < peak * 0.4) first++;
  const startsOn = (phase, period) => {
    const d = (((first - phase) % period) + period) % period;
    return 1 + 0.5 * (1 - (2 * Math.min(d, period - d)) / period);   // 1.5 on the first hit, 0.5 half a beat from it
  };

  // Nominations from the opening eight seconds.
  const span = Math.min(n, Math.round(8 * rate));
  const scored = [];
  for (let phase = 0; phase < lag; phase += 0.25) {
    let energy = 0;
    for (let t = phase; t < span; t += lag) energy += at(hits, Math.round(t));
    scored.push({ phase, score: energy * startsOn(phase, lag) });
  }
  scored.sort((a, b) => b.score - a.score);
  const nominees = [];
  for (const s of scored) { if (nominees.length >= 4) break; if (nominees.every((q) => Math.abs(q.phase - s.phase) > lag * 0.1)) nominees.push(s); }

  /*
   * Grow each nomination into a grid. Every grid beat is matched to the
   * strongest onset within ±15% of a period and a line t = phase + k·period
   * is fitted through the matches, weighted by how strong they are. The span
   * grows by doubling — eight seconds, sixteen, thirty-two, the whole song —
   * so that the grid being matched is never more than a fraction of a beat
   * off anywhere inside the span; a single pass over three minutes would be
   * matching the wrong onsets by the end. A fit only replaces the estimate
   * when it agrees with it: one that wandered off to a different tempo is a
   * fit to noise.
   */
  const grow = (phase0) => {
    let period = lag, phase = phase0;
    const win = Math.max(1, Math.round(period * 0.15));
    let drum = 0;
    for (let span2 = Math.min(n, Math.round(8 * rate)); ; span2 = Math.min(n, span2 * 2)) {
      for (let pass = 0; pass < 2; pass++) {
        let sw = 0, sk = 0, st = 0, skk = 0, skt = 0;
        drum = 0;
        for (let k = 0, t = phase; t < span2; k++, t += period) {
          const c = Math.round(t);
          drum += at(hits, c);
          let bi = -1, bv = 0;
          for (let j = Math.max(0, c - win); j <= Math.min(n - 1, c + win); j++) if (env[j] > bv) { bv = env[j]; bi = j; }
          if (bi < 0 || bv <= mean * 0.5) continue;
          sw += bv; sk += bv * k; st += bv * bi; skk += bv * k * k; skt += bv * k * bi;
        }
        const det = sw * skk - sk * sk;
        if (sw > 0 && det > 0) {
          const p2 = (sw * skt - sk * st) / det;
          const ph2 = (st - p2 * sk) / sw;
          if (Math.abs(p2 - period) / period < 0.012 && ph2 > -period && ph2 < period * 2) { period = p2; phase = ((ph2 % period) + period) % period; }
        }
      }
      if (span2 >= n) break;
    }
    return { period, phase, quality: drum * startsOn(phase, period) };
  };
  const grids = nominees.map((s) => grow(s.phase)).sort((a, b) => b.quality - a.quality);
  const { period, phase: bestPhase } = grids[0];

  const periodSec = period / rate;
  const bpm = Math.round((60 / periodSec) * 10) / 10;
  const beats = [];
  for (let t = bestPhase / rate; t < buffer.duration; t += periodSec) beats.push(Number(t.toFixed(4)));
  return { bpm, period: periodSec, beats, confidence };
}

/**
 * Stretches of near-silence, for the one-click "cut the dead air" tool.
 * The threshold is relative to the track's own loud parts, so a quiet
 * recording doesn't get treated as one long silence.
 */
export function detectSilence(buffer, { minLen = 0.35, pad = 0.08, sensitivity = 1 } = {}) {
  if (!buffer) return [];
  const data = buffer.getChannelData(0);
  const win = Math.floor(buffer.sampleRate * 0.03);
  const frames = Math.floor(data.length / win);
  const rms = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * win; i < (f + 1) * win; i++) sum += data[i] * data[i];
    rms[f] = Math.sqrt(sum / win);
  }
  const sorted = [...rms].sort((a, b) => a - b);
  const loud = sorted[Math.floor(sorted.length * 0.9)] || 0.05;
  const threshold = Math.max(0.004, loud * 0.11 * sensitivity);

  const ranges = [];
  let start = null;
  for (let f = 0; f < frames; f++) {
    const quiet = rms[f] < threshold;
    if (quiet && start === null) start = f;
    if (!quiet && start !== null) {
      pushRange(ranges, start, f, win, buffer.sampleRate, minLen, pad);
      start = null;
    }
  }
  if (start !== null) pushRange(ranges, start, frames, win, buffer.sampleRate, minLen, pad);
  return ranges;
}

function pushRange(out, fromFrame, toFrame, win, rate, minLen, pad) {
  const from = (fromFrame * win) / rate + pad;
  const to = (toFrame * win) / rate - pad;
  if (to - from >= minLen) out.push({ start: Number(from.toFixed(3)), end: Number(to.toFixed(3)) });
}

/** Loudness per second, used to place captions and to suggest where to cut. */
export function energyCurve(buffer, step = 0.25) {
  if (!buffer) return [];
  const data = buffer.getChannelData(0);
  const per = Math.floor(buffer.sampleRate * step);
  const out = [];
  for (let i = 0; i < data.length; i += per) {
    let sum = 0;
    const end = Math.min(data.length, i + per);
    for (let j = i; j < end; j++) sum += data[j] * data[j];
    out.push(Math.sqrt(sum / (end - i)));
  }
  return out;
}
