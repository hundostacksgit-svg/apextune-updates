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
    node.playsInline = true;
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
 */
function onsetEnvelope(buffer, hop = 512) {
  const data = buffer.getChannelData(0);
  const frames = Math.floor(data.length / hop);
  const env = new Float32Array(frames);
  let prev = 0;
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const start = f * hop;
    for (let i = start; i < start + hop; i++) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / hop);
    env[f] = Math.max(0, rms - prev);      // half-wave rectified difference
    prev = rms;
  }
  return { env, rate: buffer.sampleRate / hop };
}

/**
 * Tempo and a beat grid.
 *
 * Autocorrelation over the onset envelope finds the period; the phase is then
 * chosen by testing every offset within one beat and keeping whichever lines up
 * best with the onsets we actually measured. Returns a grid, not raw onsets,
 * because cutting on a grid looks intentional and cutting on raw onsets looks
 * nervous.
 */
export function detectBeats(buffer, { min = 70, max = 180 } = {}) {
  if (!buffer) return null;
  const { env, rate } = onsetEnvelope(buffer);
  if (env.length < 8) return null;

  const loLag = Math.floor((60 / max) * rate);
  const hiLag = Math.ceil((60 / min) * rate);
  let bestLag = loLag, bestScore = -Infinity;
  for (let lag = loLag; lag <= hiLag; lag++) {
    let score = 0;
    for (let i = 0; i + lag < env.length; i++) score += env[i] * env[i + lag];
    score /= (env.length - lag);
    if (score > bestScore) { bestScore = score; bestLag = lag; }
  }

  let bestPhase = 0, phaseScore = -Infinity;
  for (let phase = 0; phase < bestLag; phase++) {
    let score = 0;
    for (let i = phase; i < env.length; i += bestLag) score += env[i];
    if (score > phaseScore) { phaseScore = score; bestPhase = phase; }
  }

  const period = bestLag / rate;
  const bpm = Math.round((60 / period) * 10) / 10;
  const beats = [];
  for (let t = bestPhase / rate; t < buffer.duration; t += period) beats.push(Number(t.toFixed(4)));
  return { bpm, period, beats, confidence: Math.min(1, bestScore * 400) };
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
