/*
 * The WebCodecs exporter.
 *
 * This is the good path: frames are encoded one at a time as fast as the
 * machine manages, so a three-minute video does not take three minutes, the
 * tab can be in the background, and nothing is dropped if the machine hiccups.
 * The realtime MediaRecorder path stays as the fallback for browsers without
 * WebCodecs or without the codecs we need.
 *
 * Two things here are unusual and deliberate:
 *
 * 1. The muxer is self-tested before it is trusted. On first use it encodes a
 *    handful of frames, muxes them, and checks a real <video> element can load
 *    the result. A container bug that produces an unplayable file would be
 *    catastrophic — someone renders for ten minutes and gets a dead file — so
 *    this path refuses to run until it has proved itself once, and falls back
 *    silently if it cannot.
 *
 * 2. Codec support is asked for, never assumed. Chrome ships H.264 and AAC;
 *    Chromium built without proprietary codecs does not, and HEVC depends on
 *    the hardware. The export dialog shows what this machine actually has.
 */

import { Mp4Muxer, formatFor, CODEC_BOX } from './muxer.js';
import { Renderer } from './render.js';
import { renderAudio, toPlanar } from './audio-render.js';
import { duration as projectDuration, activeAt, mediaById } from './project.js';
import { tc } from '../ui.js';

export function available() {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

/* ------------------------------------------------------------------ */
/* what this machine can do                                            */
/* ------------------------------------------------------------------ */

/* Ordered by what people want out the other end: H.264 plays everywhere,
   HEVC is smaller at the same quality where it is supported, AV1 and VP9 are
   excellent and less universally accepted by editing software. */
/*
 * `muxable` is the important column.
 *
 * H.264 and HEVC hand back a decoder configuration (avcC / hvcC) with their
 * first chunk, which is exactly what the MP4 sample entry needs. VP9 and AV1
 * do not: their vpcC / av1C has to be synthesised by reading the bitstream,
 * and a vp09 track without one is a file Chrome will happily play back to you
 * and ffmpeg, QuickTime and every NLE will reject.
 *
 * Shipping that would be the worst kind of bug — it looks fine to the person
 * who made it and is broken for everyone they send it to. So those two are
 * marked unmuxable and their exports go through the WebM path instead, which
 * genuinely plays everywhere.
 */
const VIDEO_CANDIDATES = [
  { id: 'h264', label: 'H.264', codec: 'avc1.640028', muxable: true,
    note: 'Plays everywhere. The safe choice.' },
  { id: 'h264b', label: 'H.264 (baseline)', codec: 'avc1.42001f', muxable: true,
    note: 'Older devices and phones.' },
  { id: 'hevc', label: 'H.265 / HEVC', codec: 'hvc1.1.6.L93.B0', muxable: true,
    note: 'Half the size at the same quality, where it is supported.' },
  { id: 'hevc10', label: 'H.265 10-bit', codec: 'hvc1.2.4.L120.B0', muxable: true,
    note: 'Ten-bit colour. Needs hardware support.' },
  { id: 'av1', label: 'AV1', codec: 'av01.0.08M.08', muxable: false,
    note: 'Smallest files, but this browser cannot give us the header an MP4 needs — exported as WebM.' },
  { id: 'vp9', label: 'VP9', codec: 'vp09.00.10.08', muxable: false,
    note: 'Open codec, but this browser cannot give us the header an MP4 needs — exported as WebM.' },
];

const AUDIO_CANDIDATES = [
  { id: 'aac', label: 'AAC', codec: 'mp4a.40.2' },
  { id: 'opus', label: 'Opus', codec: 'opus' },
];

let cachedProbe = null;

export async function probe({ width = 1920, height = 1080, framerate = 30 } = {}) {
  if (cachedProbe) return cachedProbe;
  const video = [];
  const audio = [];

  if (available()) {
    for (const candidate of VIDEO_CANDIDATES) {
      try {
        // eslint-disable-next-line no-await-in-loop -- a handful of cheap checks
        const support = await VideoEncoder.isConfigSupported({
          codec: candidate.codec, width, height, bitrate: 8_000_000, framerate,
        });
        // An unmuxable codec is no use to us: the fast path writes MP4, and the
        // realtime path already produces WebM better than we could here.
        if (support.supported && candidate.muxable) video.push(candidate);
      } catch { /* unsupported codec strings throw rather than answer */ }
    }
    for (const candidate of AUDIO_CANDIDATES) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const support = await AudioEncoder.isConfigSupported({
          codec: candidate.codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 192000,
        });
        if (support.supported) audio.push(candidate);
      } catch { /* same */ }
    }
  }

  cachedProbe = {
    video,
    audio,
    // MP4 needs a codec MP4 can carry, and the muxer only writes AAC audio.
    canMp4: video.some((v) => formatFor(v.codec)) ,
    canMuxAudio: audio.some((a) => a.id === 'aac'),
  };
  return cachedProbe;
}

/* ------------------------------------------------------------------ */
/* the self-test                                                       */
/* ------------------------------------------------------------------ */

let selfTestResult = null;

/**
 * Prove the encode-and-mux path produces a file a player will accept, before
 * anyone spends ten minutes on a render that turns out to be a dead file.
 */
export async function selfTest(codec) {
  if (selfTestResult && selfTestResult.codec === codec) return selfTestResult.ok;

  const format = formatFor(codec);
  if (!format) { selfTestResult = { codec, ok: false }; return false; }

  try {
    const W = 320, H = 240, FRAMES = 6;
    const muxer = new Mp4Muxer({
      video: { format, codecBox: CODEC_BOX[format], width: W, height: H, rate: 30, needsPrivate: true },
    });

    let sawDescription = false;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        if (meta?.decoderConfig?.description) {
          muxer.setVideoDescription(meta.decoderConfig.description);
          sawDescription = true;
        }
        muxer.addVideo(chunk);
      },
      error: () => { throw new Error('encoder failed'); },
    });
    encoder.configure({ codec, width: W, height: H, bitrate: 1_000_000, framerate: 30 });

    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    for (let i = 0; i < FRAMES; i++) {
      ctx.fillStyle = `hsl(${i * 40} 70% 50%)`;
      ctx.fillRect(0, 0, W, H);
      const frame = new VideoFrame(cv, { timestamp: (i * 1e6) / 30, duration: 1e6 / 30 });
      encoder.encode(frame, { keyFrame: i === 0 });
      frame.close();
    }
    await encoder.flush();
    encoder.close();

    const blob = muxer.finish();
    if (blob.size < 200) throw new Error('produced an empty file');
    /*
     * No codec configuration means the sample entry has no avcC/hvcC, and the
     * file is only playable by the browser that made it. Checking this matters
     * more than the playback check below, because the playback check passes on
     * exactly the files that are broken for everybody else.
     */
    if (!sawDescription) throw new Error('the encoder gave no codec configuration');

    // The real test: can a player load it and agree on the duration?
    const ok = await new Promise((resolve) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(blob);
      const done = (value) => { URL.revokeObjectURL(url); resolve(value); };
      const bail = setTimeout(() => done(false), 4000);
      video.addEventListener('loadedmetadata', () => {
        clearTimeout(bail);
        done(video.videoWidth === W && video.videoHeight === H);
      }, { once: true });
      video.addEventListener('error', () => { clearTimeout(bail); done(false); }, { once: true });
      video.src = url;
      video.load();
    });

    selfTestResult = { codec, ok };
    return ok;
  } catch {
    selfTestResult = { codec, ok: false };
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* export                                                              */
/* ------------------------------------------------------------------ */

/**
 * Render and encode the whole project.
 *
 * Returns a handle with .promise and .cancel(), matching the realtime
 * exporter so the dialog does not care which one it got.
 */
export function exportWithCodecs(project, { preset, quality = 'medium', codec, audioCodec, onProgress, onFirstFrame } = {}) {
  const total = projectDuration(project);
  const fps = preset.fps;
  const frames = Math.ceil(total * fps);

  const canvas = document.createElement('canvas');
  canvas.width = preset.w;
  canvas.height = preset.h;
  const renderer = new Renderer(canvas);
  renderer.resize(preset.w, preset.h);
  renderer.fps = fps;

  let cancelled = false;
  const handle = {
    mode: 'precise',
    mime: 'video/mp4',
    cancel() { cancelled = true; },
  };

  handle.promise = (async () => {
    const format = formatFor(codec);
    const bpp = { high: 0.14, medium: 0.09, low: 0.05 }[quality] ?? 0.09;
    const bitrate = Math.round(preset.w * preset.h * fps * bpp);

    /* ---- audio first: it is fast, and knowing whether there is any decides
            whether the muxer needs a second track ---- */
    onProgress?.({ done: 0, total, phase: 'mixing audio', mode: 'precise' });
    let mixed = null;
    if (audioCodec) {
      try {
        mixed = await renderAudio(project, { duration: total, sampleRate: 48000 });
      } catch {
        mixed = null;      // a mix that will not render must not stop the video
      }
    }

    const muxer = new Mp4Muxer({
      video: { format, codecBox: CODEC_BOX[format], width: preset.w, height: preset.h, rate: fps, needsPrivate: true },
      audio: mixed ? { sampleRate: 48000, channels: 2 } : null,
    });

    /* ---- encoders ---- */
    let encodeError = null;
    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => {
        if (meta?.decoderConfig?.description) muxer.setVideoDescription(meta.decoderConfig.description);
        muxer.addVideo(chunk);
      },
      error: (err) => { encodeError = err; },
    });
    videoEncoder.configure({
      codec, width: preset.w, height: preset.h, bitrate, framerate: fps,
      latencyMode: 'quality',
    });

    let audioEncoder = null;
    if (mixed) {
      audioEncoder = new AudioEncoder({
        output: (chunk, meta) => {
          if (meta?.decoderConfig?.description) muxer.setAudioDescription(meta.decoderConfig.description);
          muxer.addAudio(chunk);
        },
        error: (err) => { encodeError = err; },
      });
      audioEncoder.configure({ codec: audioCodec, sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 });
    }

    /* ---- video ---- */
    for (let i = 0; i < frames; i++) {
      if (cancelled) break;
      if (encodeError) throw new Error(`the encoder stopped: ${encodeError.message}`);

      const t = i / fps;
      try {
        await renderer.settle(project, t);
        renderer.draw(project, t, { playing: false, forExport: true });
      } catch (err) {
        throw new Error(`${err.message} at ${tc(t, fps)} (${describeAt(project, t)})`);
      }
      if (i === 0) onFirstFrame?.(canvas);

      const frame = new VideoFrame(canvas, {
        timestamp: Math.round((i * 1e6) / fps),
        duration: Math.round(1e6 / fps),
      });
      // A keyframe every two seconds keeps the file seekable without bloating it.
      videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();

      // Let the encoder drain rather than queueing a thousand frames into RAM.
      if (videoEncoder.encodeQueueSize > 8) {
        await new Promise((r) => setTimeout(r, 4));
      }
      if (i % 4 === 0) {
        onProgress?.({ done: t, total, phase: 'rendering', mode: 'precise' });
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    /* ---- audio ---- */
    if (mixed && audioEncoder && !cancelled) {
      onProgress?.({ done: total, total, phase: 'encoding audio', mode: 'precise' });
      const planar = toPlanar(mixed);
      const CHUNK = 1024;
      const channels = planar.length;
      for (let at = 0; at < mixed.length; at += CHUNK) {
        if (cancelled) break;
        const size = Math.min(CHUNK, mixed.length - at);
        // AudioData wants one flat planar buffer: all of channel 0, then all
        // of channel 1.
        const flat = new Float32Array(size * channels);
        for (let c = 0; c < channels; c++) flat.set(planar[c].subarray(at, at + size), c * size);
        const data = new AudioData({
          format: 'f32-planar',
          sampleRate: mixed.sampleRate,
          numberOfFrames: size,
          numberOfChannels: channels,
          timestamp: Math.round((at / mixed.sampleRate) * 1e6),
          data: flat,
        });
        audioEncoder.encode(data);
        data.close();
        if (at % (CHUNK * 64) === 0) await new Promise((r) => setTimeout(r, 0));
      }
    }

    onProgress?.({ done: total, total, phase: 'finishing', mode: 'precise' });
    await videoEncoder.flush();
    videoEncoder.close();
    if (audioEncoder) { await audioEncoder.flush(); audioEncoder.close(); }

    const blob = muxer.finish();
    if (!blob.size) throw new Error('Nothing was encoded.');

    return {
      blob,
      mime: 'video/mp4',
      mode: 'precise',
      seconds: total,
      partial: cancelled,
      reason: cancelled ? 'you stopped it' : null,
      codec,
      hasAudio: Boolean(mixed),
    };
  })();

  return handle;
}

function describeAt(project, t) {
  const clips = activeAt(project, t);
  if (!clips.length) return 'empty timeline';
  const media = mediaById(project, clips[0].mediaId);
  return media?.name || clips[0].text?.content?.slice(0, 30) || 'a clip';
}
