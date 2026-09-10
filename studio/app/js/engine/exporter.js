/*
 * Export.
 *
 * Two paths, picked automatically:
 *
 *   realtime — the project has sound. The canvas and the audio graph are
 *              captured together as they play, which is the only way to get a
 *              muxed A/V file out of a browser without shipping a 30 MB
 *              transcoder. A three-minute video takes three minutes.
 *
 *   precise  — the project is silent. Frames are drawn and pushed one at a
 *              time, so the result is frame-exact and usually finishes faster
 *              than real time. Nothing is dropped if the machine hiccups.
 *
 * If anything fails partway, whatever has been encoded so far is still a
 * playable file and is offered as one, together with the timecode and the clip
 * it stopped on. Losing an hour of rendering to a one-line error is the single
 * most-repeated export complaint about every other editor, and it does not
 * happen here.
 */

import { Renderer } from './render.js';
import { duration as projectDuration, activeAt, mediaById } from './project.js';
import { tc } from '../ui.js';

export const PRESETS = [
  { id: 'tiktok',  name: 'TikTok / Reels / Shorts', w: 1080, h: 1920, fps: 30, tier: 'free',
    note: 'What every vertical platform wants.' },
  { id: 'yt1080',  name: 'YouTube 1080p',           w: 1920, h: 1080, fps: 30, tier: 'free',
    note: 'The safe default for landscape.' },
  { id: 'square',  name: 'Square 1080',             w: 1080, h: 1080, fps: 30, tier: 'free',
    note: 'Feed posts and ads.' },
  { id: 'ig45',    name: 'Instagram feed 4:5',      w: 1080, h: 1350, fps: 30, tier: 'free',
    note: 'Takes the most screen in a feed.' },
  { id: 'yt60',    name: 'YouTube 1080p60',         w: 1920, h: 1080, fps: 60, tier: 'creator',
    note: 'Gameplay and anything fast.' },
  { id: 'uhd',     name: '4K UHD',                  w: 3840, h: 2160, fps: 30, tier: 'creator',
    note: 'Only worth it if your source is 4K.' },
  { id: 'uhdv',    name: '4K vertical',             w: 2160, h: 3840, fps: 30, tier: 'creator',
    note: 'Vertical, at full resolution.' },
  { id: 'draft',   name: 'Draft 540p',              w: 540,  h: 960,  fps: 30, tier: 'free',
    note: 'Fast, small, for showing someone.' },
];

export const QUALITY = {
  high:   { label: 'High — best looking',     bpp: 0.14 },
  medium: { label: 'Medium — good balance',   bpp: 0.09 },
  low:    { label: 'Small file — for sharing', bpp: 0.05 },
};

/** The best container this browser will actually produce. */
export function pickMime() {
  const wanted = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',   // widest compatibility when offered
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const type of wanted) {
    if (window.MediaRecorder?.isTypeSupported?.(type)) return type;
  }
  return '';
}

export function extensionFor(mime) {
  return mime.includes('mp4') ? 'mp4' : 'webm';
}

function bitrate(w, h, fps, quality) {
  const bpp = QUALITY[quality]?.bpp ?? QUALITY.medium.bpp;
  return Math.round(w * h * fps * bpp);
}

/** Does anything on this timeline make a sound? Decides which path we take. */
export function hasAudio(project) {
  return project.clips.some((c) => {
    if (c.reversed) return false;
    const track = project.tracks.find((t) => t.id === c.trackId);
    if (track?.muted) return false;
    const m = mediaById(project, c.mediaId);
    return m && m.hasAudio && m.kind !== 'image' && (c.volume ?? 1) > 0.001;
  });
}

/**
 * Run an export. Resolves to { blob, mime, mode, seconds, partial }.
 *
 * `onProgress({ done, total, phase, seconds })` fires a few times a second, and
 * `cancel()` on the returned handle stops cleanly and still hands back what was
 * rendered.
 */
export function exportProject(project, {
  preset, quality = 'medium', audioEngine, onProgress, onFirstFrame,
} = {}) {
  const total = projectDuration(project);
  if (total <= 0.05) return Promise.reject(new Error('There is nothing on the timeline to export yet.'));

  const mime = pickMime();
  if (!window.MediaRecorder || !mime) {
    return Promise.reject(new Error(
      'This browser cannot record video. Chrome, Edge or a recent Safari will work — or use the desktop app.',
    ));
  }

  const canvas = document.createElement('canvas');
  canvas.width = preset.w;
  canvas.height = preset.h;
  const renderer = new Renderer(canvas);
  renderer.resize(preset.w, preset.h);

  const withAudio = hasAudio(project) && audioEngine;
  const mode = withAudio ? 'realtime' : 'precise';
  const fps = preset.fps;

  const chunks = [];
  let cancelled = false;
  let recorder = null;
  let stopReason = null;

  const handle = {
    cancel(reason = 'cancelled') { cancelled = true; stopReason = reason; try { recorder?.stop(); } catch { /* already stopped */ } },
    mode,
    mime,
  };

  handle.promise = new Promise((resolve, reject) => {
    // captureStream(0) gives us a track we drive by hand, which is what makes
    // the precise path frame-exact. In realtime we let the browser pull frames.
    const stream = canvas.captureStream(withAudio ? fps : 0);
    const videoTrack = stream.getVideoTracks()[0];

    if (withAudio) {
      const mix = audioEngine.exportStream();
      for (const track of mix.getAudioTracks()) stream.addTrack(track);
    }

    try {
      recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: bitrate(preset.w, preset.h, fps, quality),
        audioBitsPerSecond: 192000,
      });
    } catch (err) {
      reject(new Error(`This browser refused the recording settings (${err.message}). Try a lower preset.`));
      return;
    }

    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onerror = (e) => {
      stopReason = `the encoder failed (${e.error?.name || 'unknown'})`;
      try { recorder.stop(); } catch { /* already stopping */ }
    };
    recorder.onstop = () => {
      audioEngine?.stopAll();
      const blob = new Blob(chunks, { type: mime });
      if (!blob.size) {
        reject(new Error('Nothing was recorded. If a tab was in the background the browser may have paused it — keep this tab visible while exporting.'));
        return;
      }
      resolve({
        blob, mime, mode,
        seconds: total,
        partial: Boolean(stopReason),
        reason: stopReason,
      });
    };

    // A timeslice means chunks land continuously rather than in one lump at the
    // end. That is what makes a partial file possible after a failure.
    recorder.start(1000);

    if (withAudio) runRealtime(); else runPrecise();

    /* -------- realtime: play the timeline and record what comes out ------- */
    function runRealtime() {
      const startedAt = performance.now();
      let first = true;
      audioEngine.ensure();
      audioEngine.resume();

      const frame = () => {
        if (cancelled) { finish(); return; }
        const t = (performance.now() - startedAt) / 1000;
        if (t >= total) { finish(); return; }
        renderer.draw(project, t, { playing: true, forExport: false });
        audioEngine.sync(project, t, true);
        if (first) { first = false; onFirstFrame?.(canvas); }
        onProgress?.({ done: t, total, phase: 'recording', seconds: t, mode });
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }

    /* -------- precise: one frame at a time, as fast as decoding allows ---- */
    async function runPrecise() {
      const frames = Math.ceil(total * fps);
      onFirstFrame?.(canvas);
      for (let i = 0; i < frames; i++) {
        if (cancelled) break;
        const t = i / fps;
        try {
          // eslint-disable-next-line no-await-in-loop -- frames are sequential by definition
          await renderer.settle(project, t);
          renderer.draw(project, t, { playing: false, forExport: true });
          videoTrack.requestFrame?.();
        } catch (err) {
          stopReason = `${err.message} at ${tc(t, fps)} (${describeAt(project, t)})`;
          break;
        }
        if (i % 5 === 0) {
          onProgress?.({ done: t, total, phase: 'rendering', seconds: t, mode });
          // eslint-disable-next-line no-await-in-loop -- yields to the compositor
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      finish();
    }

    function finish() {
      onProgress?.({ done: total, total, phase: 'finishing', seconds: total, mode });
      // Give the encoder a moment to flush its last frames before stopping.
      setTimeout(() => { try { recorder.stop(); } catch { /* already stopped */ } }, 260);
    }
  });

  return handle;
}

/** Which clip is on screen at t — so a failure names something recognisable. */
function describeAt(project, t) {
  const clips = activeAt(project, t);
  if (!clips.length) return 'empty timeline';
  const c = clips[0];
  const m = mediaById(project, c.mediaId);
  return m?.name || c.text?.content?.slice(0, 30) || 'a clip';
}

/** Hand the finished file to the user. */
export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function safeName(name, ext) {
  const base = String(name || 'omnidx-export')
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'omnidx-export';
  return `${base}.${ext}`;
}
