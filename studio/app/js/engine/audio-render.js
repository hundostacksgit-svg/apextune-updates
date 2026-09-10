/*
 * Offline audio mixing.
 *
 * The realtime exporter has to play the timeline to record it, which is why a
 * three-minute video takes three minutes. This renders the same mix through an
 * OfflineAudioContext instead — as fast as the machine can manage, sample
 * accurate, and with no dependency on the tab staying in front.
 *
 * Everything the live engine does to a clip is reproduced here: clip gain,
 * fades, track mute, ducking under voice, speed and speed ramps. If the two
 * ever disagree, the live one is what people heard while editing and this one
 * is what shipped, so they have to be the same rules — which is why both read
 * the same fields rather than each having their own idea of a mix.
 */

import { activeAt, mediaById, speedAt, sourceTime } from './project.js';
import { decode } from './media.js';

/**
 * Render the whole timeline's audio.
 * Returns an AudioBuffer, or null when nothing on the timeline makes a sound.
 */
export async function renderAudio(project, { duration, sampleRate = 48000, onProgress } = {}) {
  const clips = project.clips.filter((c) => {
    if (c.kind === 'title' || c.kind === 'sticker' || c.reversed) return false;
    const track = project.tracks.find((t) => t.id === c.trackId);
    if (!track || track.muted) return false;
    const media = mediaById(project, c.mediaId);
    return media && media.hasAudio && media.kind !== 'image' && (c.volume ?? 1) > 0.001;
  });
  if (!clips.length) return null;

  const total = Math.max(0.1, duration);
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new Ctx(2, Math.ceil(total * sampleRate), sampleRate);

  // Decode everything first: scheduling needs the buffers in hand, and doing
  // it inside the loop would serialise a dozen decodes behind each other.
  const buffers = new Map();
  let done = 0;
  for (const clip of clips) {
    const media = mediaById(project, clip.mediaId);
    if (buffers.has(media.id)) continue;
    // eslint-disable-next-line no-await-in-loop -- decodes are per file
    buffers.set(media.id, await decode(media));
    onProgress?.({ phase: 'decoding', done: ++done, total: clips.length });
  }

  const master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);

  for (const clip of clips) {
    const media = mediaById(project, clip.mediaId);
    const buffer = buffers.get(media.id);
    if (!buffer) continue;

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    source.connect(gain).connect(master);

    scheduleGain(project, clip, gain, ctx);

    const speed = clip.speedKeys?.length ? null : (clip.speed || 1);
    if (speed !== null) {
      source.playbackRate.value = Math.max(0.0625, Math.min(16, speed));
    } else {
      // A ramp is automation on playbackRate, sampled finely enough that the
      // pitch slide is smooth rather than stepped.
      const steps = Math.max(8, Math.round(clip.dur * 20));
      for (let i = 0; i <= steps; i++) {
        const local = (clip.dur * i) / steps;
        source.playbackRate.setValueAtTime(
          Math.max(0.0625, Math.min(16, speedAt(clip, local))),
          clip.start + local,
        );
      }
    }

    const offset = clip.in;
    // With a ramp the clip consumes a variable amount of source, so the length
    // to play is worked out from where sourceTime lands at the clip's end.
    const consumed = sourceTime(clip, clip.start + clip.dur) - clip.in;
    const available = Math.max(0, buffer.duration - offset);
    source.start(clip.start, Math.min(offset, buffer.duration), Math.min(consumed, available));
  }

  onProgress?.({ phase: 'mixing', done: 0, total: 1 });
  return ctx.startRendering();
}

/**
 * Clip gain over time: volume, fades, and ducking.
 *
 * Ducking is sampled rather than solved analytically because whether a voice
 * is present changes at every clip boundary; four samples a second is finer
 * than anyone can hear the step and cheap to schedule.
 */
function scheduleGain(project, clip, gainNode, ctx) {
  const track = project.tracks.find((t) => t.id === clip.trackId);
  const base = clip.volume ?? 1;
  const step = 0.25;

  gainNode.gain.setValueAtTime(levelAt(project, clip, track, base, 0), clip.start);
  for (let local = step; local < clip.dur; local += step) {
    gainNode.gain.linearRampToValueAtTime(
      levelAt(project, clip, track, base, local),
      clip.start + local,
    );
  }
  gainNode.gain.linearRampToValueAtTime(
    levelAt(project, clip, track, base, clip.dur),
    clip.start + clip.dur,
  );
  void ctx;
}

function levelAt(project, clip, track, base, local) {
  let level = base;
  if (clip.fadeIn > 0 && local < clip.fadeIn) level *= local / clip.fadeIn;
  const toEnd = clip.dur - local;
  if (clip.fadeOut > 0 && toEnd < clip.fadeOut) level *= Math.max(0, toEnd / clip.fadeOut);

  if (track?.duck) {
    const t = clip.start + local;
    const voice = activeAt(project, t).some((other) => {
      if (other.id === clip.id) return false;
      const otherTrack = project.tracks.find((tr) => tr.id === other.trackId);
      if (!otherTrack || otherTrack.kind !== 'audio' || otherTrack.duck || otherTrack.muted) return false;
      const media = mediaById(project, other.mediaId);
      return media?.hasAudio && (other.volume ?? 1) > 0.02;
    });
    if (voice) level *= 0.22;
  }
  return Math.max(0, Math.min(2, level));
}

/** Interleave an AudioBuffer into the planar-per-channel form AudioData wants. */
export function toPlanar(buffer) {
  const channels = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
  return channels;
}

/** A 16-bit PCM WAV, for "export the audio only" and for debugging a mix. */
export function toWav(buffer) {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const bytes = 44 + frames * channels * 2;
  const out = new DataView(new ArrayBuffer(bytes));
  const str = (at, s) => { for (let i = 0; i < s.length; i++) out.setUint8(at + i, s.charCodeAt(i)); };

  str(0, 'RIFF'); out.setUint32(4, bytes - 8, true); str(8, 'WAVE');
  str(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true);
  out.setUint16(22, channels, true); out.setUint32(24, buffer.sampleRate, true);
  out.setUint32(28, buffer.sampleRate * channels * 2, true);
  out.setUint16(32, channels * 2, true); out.setUint16(34, 16, true);
  str(36, 'data'); out.setUint32(40, frames * channels * 2, true);

  const data = [];
  for (let c = 0; c < channels; c++) data.push(buffer.getChannelData(c));
  let at = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      out.setInt16(at, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      at += 2;
    }
  }
  return new Blob([out.buffer], { type: 'audio/wav' });
}
