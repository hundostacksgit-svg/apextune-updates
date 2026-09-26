/*
 * Proxies, and awkward source files.
 *
 * Two problems that look unrelated and are both about the same thing —
 * a file the browser can play but not play *well*:
 *
 *   Proxies. Editing 4K on a five-year-old laptop stutters because every
 *   scrub decodes a 4K frame. A proxy is a 540p copy used for preview only;
 *   export always goes back to the original. Other editors make this a chore
 *   you do first — here it happens on its own, in the background, and the
 *   editor is usable the whole time.
 *
 *   Variable frame rate. Phone video and screen recordings are routinely VFR:
 *   the file says 30fps and the frames arrive whenever they feel like it.
 *   Editors that count frames drift out of sync on these, which is the usual
 *   cause of "the audio slips over ten minutes". Everything here is driven by
 *   timestamps rather than frame counts, so VFR is handled by construction —
 *   what is left is telling the truth about it, and fixing the broken duration
 *   metadata those files also tend to carry.
 */

import { Mp4Muxer, formatFor, CODEC_BOX } from './muxer.js';
import { urlOf, attach } from './media.js';
import * as store from '../store.js';

const PROXY_HEIGHT = 540;
const PROXY_FPS = 30;

/* ------------------------------------------------------------------ */
/* duration and VFR                                                    */
/* ------------------------------------------------------------------ */

/**
 * Get a usable duration out of a video element.
 *
 * MediaRecorder output, many screen recorders and some phone exports report
 * `Infinity` or a nonsense number until the browser has scanned to the end.
 * Seeking to a huge time forces that scan. Without this a screen recording
 * imports as a zero-length clip, which looks like the file is corrupt when it
 * is perfectly fine.
 */
export function resolveDuration(video) {
  return new Promise((resolve) => {
    const current = video.duration;
    if (Number.isFinite(current) && current > 0 && current < 86400) { resolve(current); return; }

    const bail = setTimeout(() => { cleanup(); resolve(Number.isFinite(video.duration) ? video.duration : 0); }, 5000);
    const onDuration = () => {
      if (!Number.isFinite(video.duration) || video.duration >= 86400) return;
      cleanup();
      const found = video.duration;
      try { video.currentTime = 0; } catch { /* it will settle on its own */ }
      resolve(found);
    };
    const cleanup = () => {
      clearTimeout(bail);
      video.removeEventListener('durationchange', onDuration);
    };
    video.addEventListener('durationchange', onDuration);
    try { video.currentTime = 1e101; } catch { cleanup(); resolve(0); }
  });
}

/**
 * Is this file variable frame rate, and by how much?
 *
 * Sampled with requestVideoFrameCallback, which reports each frame's real
 * presentation time. A constant-rate file has near-identical gaps; a VFR one
 * does not. Nothing downstream needs to change — the editor is timestamp-based
 * — but it is worth saying so, because "why is my screen recording 12fps in
 * places" has a real answer.
 */
export function inspectFrameRate(video, { samples = 40 } = {}) {
  return new Promise((resolve) => {
    if (!video.requestVideoFrameCallback) { resolve(null); return; }
    const times = [];
    let cancelled = false;
    const bail = setTimeout(() => { cancelled = true; finish(); }, 4000);

    const onFrame = (_now, meta) => {
      times.push(meta.mediaTime);
      if (times.length >= samples || cancelled) { finish(); return; }
      video.requestVideoFrameCallback(onFrame);
    };

    const finish = () => {
      clearTimeout(bail);
      video.pause();
      if (times.length < 8) { resolve(null); return; }
      const gaps = [];
      for (let i = 1; i < times.length; i++) {
        const gap = times[i] - times[i - 1];
        if (gap > 0.0005) gaps.push(gap);
      }
      if (!gaps.length) { resolve(null); return; }
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const spread = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
      resolve({
        fps: Number((1 / mean).toFixed(2)),
        // A tenth of the mean gap is well beyond ordinary decoder jitter.
        variable: spread > mean * 0.1,
        jitter: Number((spread / mean).toFixed(3)),
      });
    };

    video.muted = true;
    video.play().then(() => video.requestVideoFrameCallback(onFrame)).catch(() => resolve(null));
  });
}

/* ------------------------------------------------------------------ */
/* proxies                                                             */
/* ------------------------------------------------------------------ */

/** Is a proxy worth making for this file, and can we make one? */
export function shouldProxy(media, { minHeight = 1200 } = {}) {
  if (media.kind !== 'video') return false;
  if (media.proxyHash) return false;
  return (media.height || 0) >= minHeight;
}

export async function canProxy() {
  if (typeof VideoEncoder === 'undefined') return false;
  try {
    const support = await VideoEncoder.isConfigSupported({
      codec: 'avc1.42001f', width: 960, height: PROXY_HEIGHT, bitrate: 2e6, framerate: PROXY_FPS,
    });
    return Boolean(support.supported);
  } catch { return false; }
}

/**
 * Build a 540p proxy.
 *
 * Frames come from a plain <video> element drawn to a canvas, so this works
 * with anything the browser can play — no demuxer, no format-specific code,
 * and VFR sources are handled because we ask for a time and take whatever
 * frame is there.
 */
export async function buildProxy(media, { onProgress, signal } = {}) {
  const src = urlOf(media);
  if (!src) throw new Error('That file is not loaded.');
  if (!await canProxy()) throw new Error('This browser has no H.264 encoder, so proxies are not available here.');

  const video = document.createElement('video');
  video.src = src;
  video.muted = true;
  video.playsInline = true;
  await new Promise((resolve, reject) => {
    video.addEventListener('loadeddata', resolve, { once: true });
    video.addEventListener('error', () => reject(new Error('that file could not be decoded')), { once: true });
    setTimeout(() => reject(new Error('that file took too long to open')), 20000);
  });

  const duration = await resolveDuration(video);
  if (!duration) throw new Error('that file has no usable duration');

  const scale = PROXY_HEIGHT / (video.videoHeight || PROXY_HEIGHT);
  // Even dimensions: H.264 requires them and an odd width fails at configure().
  const width = Math.max(2, Math.round((video.videoWidth * scale) / 2) * 2);
  const height = Math.max(2, Math.round(PROXY_HEIGHT / 2) * 2);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const format = formatFor('avc1.42001f');
  const muxer = new Mp4Muxer({
    video: { format, codecBox: CODEC_BOX[format], width, height, rate: PROXY_FPS, needsPrivate: true },
  });

  let failed = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      if (meta?.decoderConfig?.description) muxer.setVideoDescription(meta.decoderConfig.description);
      muxer.addVideo(chunk);
    },
    error: (err) => { failed = err; },
  });
  encoder.configure({
    codec: 'avc1.42001f', width, height,
    bitrate: Math.round(width * height * PROXY_FPS * 0.07),
    framerate: PROXY_FPS,
    latencyMode: 'realtime',      // proxies are for scrubbing, not for looking at
  });

  const frames = Math.ceil(duration * PROXY_FPS);
  for (let i = 0; i < frames; i++) {
    if (signal?.aborted) break;
    if (failed) throw new Error(`the encoder stopped: ${failed.message}`);
    const t = i / PROXY_FPS;
    // eslint-disable-next-line no-await-in-loop -- frames are sequential
    await seek(video, Math.min(t, duration - 0.01));
    ctx.drawImage(video, 0, 0, width, height);
    const frame = new VideoFrame(canvas, {
      timestamp: Math.round((i * 1e6) / PROXY_FPS),
      duration: Math.round(1e6 / PROXY_FPS),
    });
    encoder.encode(frame, { keyFrame: i % (PROXY_FPS * 2) === 0 });
    frame.close();
    if (i % 10 === 0) {
      onProgress?.({ done: i, total: frames });
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  await encoder.flush();
  encoder.close();
  video.src = '';

  const blob = muxer.finish();
  const hash = `proxy-${media.hash}`;
  await store.putMedia(hash, new File([blob], `${media.name}.proxy.mp4`, { type: 'video/mp4' }),
    { proxyFor: media.hash, height });
  return { hash, size: blob.size, width, height };
}

/** Park a video on a frame. Resolves either way — a seek that never lands
 *  should cost one duplicated frame, not the whole proxy. */
function seek(video, time) {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - time) < 0.002) { resolve(); return; }
    const done = () => { clearTimeout(bail); resolve(); };
    const bail = setTimeout(done, 1200);
    video.addEventListener('seeked', done, { once: true });
    try { video.currentTime = time; } catch { done(); }
  });
}

/** Attach a stored proxy so the renderer picks it up. */
export async function loadProxy(media) {
  if (!media.proxyHash) return false;
  const record = await store.getMedia(media.proxyHash);
  if (!record) { media.proxyHash = null; return false; }
  attach(media, { proxyUrl: URL.createObjectURL(record.blob) });
  return true;
}
