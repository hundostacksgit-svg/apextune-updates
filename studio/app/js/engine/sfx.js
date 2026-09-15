/*
 * Sound effects, made rather than shipped.
 *
 * The sounds an edit reaches for — a whoosh into a cut, a riser into the
 * drop, a boom on the hit, a sub drop, a tape stop, a shutter, a click —
 * are short and simple enough to synthesise on the spot, so none of them
 * is a file in the download and none of them costs a request. Each recipe
 * schedules a few Web Audio nodes into an OfflineAudioContext; the result
 * is normalised, turned into a WAV and imported through the same path as
 * any upload, so it gets a waveform, a duration and a place in the pool.
 *
 * They are deliberately plain: a whoosh is filtered noise with a sweep, a
 * boom is a falling sine under a burst. Plain reads as clean in a mix, and
 * every one of them can be pitched, filtered and shaped afterwards by the
 * audio filters like anything else on the timeline.
 */

import { bufferToWav } from './beatmaker.js';

const RATE = 44100;

function noiseBuffer(ctx, seconds = 2) {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 1234;
  for (let i = 0; i < d.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = (seed / 0x7fffffff) * 2 - 1; }
  return buf;
}

/* ---- building blocks: each returns nothing, schedules into ctx ---- */

function noiseSweep(ctx, noise, { at = 0, len = 0.6, from = 300, to = 6000, q = 1.2, gain = 0.6, attack = 0.02, type = 'bandpass', shape = 'swell' }) {
  const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(from, at); f.frequency.exponentialRampToValueAtTime(to, at + len);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  if (shape === 'swell') { g.gain.exponentialRampToValueAtTime(gain, at + len * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, at + len); }
  else if (shape === 'hit') { g.gain.exponentialRampToValueAtTime(gain, at + attack); g.gain.exponentialRampToValueAtTime(0.0001, at + len); }
  else { g.gain.exponentialRampToValueAtTime(gain, at + attack); g.gain.setValueAtTime(gain, at + len * 0.85); g.gain.exponentialRampToValueAtTime(0.0001, at + len); }
  s.connect(f).connect(g).connect(ctx.destination); s.start(at); s.stop(at + len + 0.02);
}

function tone(ctx, { at = 0, len = 0.5, from = 220, to = null, type = 'sine', gain = 0.5, attack = 0.005, decay = null }) {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(from, at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + len);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + (decay || len));
  o.connect(g).connect(ctx.destination); o.start(at); o.stop(at + (decay || len) + 0.02);
}

function click(ctx, { at = 0, gain = 0.5, freq = 2400, len = 0.012 }) {
  tone(ctx, { at, len, from: freq, type: 'square', gain, attack: 0.001 });
}

/* ---- the library ---- */

export const SFX = [
  // Movement
  { id: 'whooshShort', name: 'Whoosh, short', group: 'Whooshes', seconds: 0.45, blurb: 'A quick pass, into a cut.',
    render: (ctx, n) => noiseSweep(ctx, n, { len: 0.42, from: 400, to: 5000, gain: 0.7 }) },
  { id: 'whooshLong', name: 'Whoosh, long', group: 'Whooshes', seconds: 1.0, blurb: 'A slower pass, for a wide move.',
    render: (ctx, n) => noiseSweep(ctx, n, { len: 0.95, from: 250, to: 4000, q: 0.9, gain: 0.65 }) },
  { id: 'whooshRise', name: 'Whoosh, rising', group: 'Whooshes', seconds: 0.7, blurb: 'Climbs into the next shot.',
    render: (ctx, n) => noiseSweep(ctx, n, { len: 0.65, from: 200, to: 9000, q: 2, gain: 0.6 }) },
  { id: 'whooshFall', name: 'Whoosh, falling', group: 'Whooshes', seconds: 0.7, blurb: 'Drops away out of a shot.',
    render: (ctx, n) => noiseSweep(ctx, n, { len: 0.65, from: 8000, to: 200, q: 2, gain: 0.6, shape: 'hit', attack: 0.03 }) },
  { id: 'swish', name: 'Swish', group: 'Whooshes', seconds: 0.3, blurb: 'Light and high. A text move, a sticker.',
    render: (ctx, n) => noiseSweep(ctx, n, { len: 0.26, from: 3000, to: 10000, q: 3, gain: 0.45 }) },
  { id: 'doubleWhoosh', name: 'Double whoosh', group: 'Whooshes', seconds: 0.8, blurb: 'Two passes, for a whip pan.',
    render: (ctx, n) => { noiseSweep(ctx, n, { at: 0, len: 0.32, from: 400, to: 6000, gain: 0.6 }); noiseSweep(ctx, n, { at: 0.36, len: 0.38, from: 6000, to: 300, gain: 0.55, shape: 'hit', attack: 0.02 }); } },

  // Hits
  { id: 'impactBoom', name: 'Boom', group: 'Hits', seconds: 1.8, blurb: 'The cinematic hit. Low, long tail.',
    render: (ctx, n) => { tone(ctx, { len: 1.6, from: 90, to: 32, gain: 0.9, attack: 0.004 }); noiseSweep(ctx, n, { len: 0.35, from: 2000, to: 120, q: 0.7, gain: 0.5, shape: 'hit', attack: 0.005 }); } },
  { id: 'impactHit', name: 'Hit', group: 'Hits', seconds: 0.7, blurb: 'Shorter and sharper than the boom.',
    render: (ctx, n) => { tone(ctx, { len: 0.55, from: 140, to: 45, gain: 0.85, attack: 0.003 }); noiseSweep(ctx, n, { len: 0.18, from: 4000, to: 300, q: 0.8, gain: 0.55, shape: 'hit', attack: 0.003 }); } },
  { id: 'subDrop', name: 'Sub drop', group: 'Hits', seconds: 1.6, blurb: 'A sine falling below hearing. Felt on the drop.',
    render: (ctx) => tone(ctx, { len: 1.5, from: 110, to: 24, gain: 0.95, attack: 0.02 }) },
  { id: 'cinematicHit', name: 'Cinematic hit', group: 'Hits', seconds: 2.4, blurb: 'Boom under a metallic ring.',
    render: (ctx, n) => { tone(ctx, { len: 2.0, from: 70, to: 30, gain: 0.9, attack: 0.004 }); for (const f of [523, 782, 1046]) tone(ctx, { len: 2.2, from: f, type: 'triangle', gain: 0.12, attack: 0.002 }); noiseSweep(ctx, n, { len: 0.25, from: 3000, to: 200, gain: 0.45, shape: 'hit', attack: 0.003 }); } },
  { id: 'punch', name: 'Punch', group: 'Hits', seconds: 0.35, blurb: 'A thud for a zoom punch or an impact frame.',
    render: (ctx, n) => { tone(ctx, { len: 0.3, from: 180, to: 50, gain: 0.8, attack: 0.002 }); noiseSweep(ctx, n, { len: 0.08, from: 1500, to: 400, gain: 0.4, shape: 'hit', attack: 0.002 }); } },
  { id: 'braam', name: 'Braam', group: 'Hits', seconds: 2.6, blurb: 'The trailer horn. Use once.',
    render: (ctx, n) => { for (const f of [55, 82.5, 110, 165]) tone(ctx, { len: 2.4, from: f, type: 'sawtooth', gain: 0.22, attack: 0.08, decay: 2.4 }); noiseSweep(ctx, n, { len: 2.2, from: 200, to: 900, q: 0.6, gain: 0.25, shape: 'hold', attack: 0.1 }); } },

  // Risers
  { id: 'riser1', name: 'Riser, 1 bar', group: 'Risers', seconds: 2.0, blurb: 'Two seconds of build into a hit.',
    render: (ctx, n) => noiseSweep(ctx, n, { len: 2.0, from: 200, to: 8000, q: 1.4, gain: 0.7 }) },
  { id: 'riser2', name: 'Riser, 2 bars', group: 'Risers', seconds: 4.0, blurb: 'Four seconds. The drop is coming.',
    render: (ctx, n) => { noiseSweep(ctx, n, { len: 4.0, from: 150, to: 9000, q: 1.4, gain: 0.7 }); tone(ctx, { len: 4.0, from: 110, to: 440, type: 'sawtooth', gain: 0.12, attack: 1.5, decay: 4.0 }); } },
  { id: 'riserLong', name: 'Riser, long', group: 'Risers', seconds: 8.0, blurb: 'Eight seconds, for a slow build.',
    render: (ctx, n) => { noiseSweep(ctx, n, { len: 8.0, from: 100, to: 10000, q: 1.2, gain: 0.7 }); tone(ctx, { len: 8.0, from: 55, to: 440, type: 'triangle', gain: 0.15, attack: 3, decay: 8 }); } },
  { id: 'downlifter', name: 'Downlifter', group: 'Risers', seconds: 2.0, blurb: 'The riser in reverse: settles after a hit.',
    render: (ctx, n) => noiseSweep(ctx, n, { len: 2.0, from: 8000, to: 150, q: 1.2, gain: 0.6, shape: 'hit', attack: 0.05 }) },
  { id: 'reverseCymbal', name: 'Reverse cymbal', group: 'Risers', seconds: 1.5, blurb: 'Swells and cuts dead on the beat.',
    render: (ctx, n) => { const s = ctx.createBufferSource(); s.buffer = n; s.loop = true; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 5000; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.7, 1.45); g.gain.setValueAtTime(0.0001, 1.46); s.connect(f).connect(g).connect(ctx.destination); s.start(0); s.stop(1.5); } },

  // Glitch and tape
  { id: 'glitchStutter', name: 'Glitch stutter', group: 'Glitch & tape', seconds: 0.6, blurb: 'Chopped bursts for a glitch cut.',
    render: (ctx, n) => { for (let i = 0; i < 8; i++) noiseSweep(ctx, n, { at: i * 0.07, len: 0.035, from: 800 + i * 600, to: 1200 + i * 600, q: 4, gain: 0.5, shape: 'hit', attack: 0.002 }); } },
  { id: 'tapeStop', name: 'Tape stop', group: 'Glitch & tape', seconds: 0.9, blurb: 'A tone cluster winding down to nothing.',
    render: (ctx) => { for (const f of [220, 330, 440]) tone(ctx, { len: 0.85, from: f, to: f / 12, type: 'triangle', gain: 0.25, attack: 0.01 }); } },
  { id: 'staticBurst', name: 'Static burst', group: 'Glitch & tape', seconds: 0.35, blurb: 'A crackle of interference.',
    render: (ctx, n) => noiseSweep(ctx, n, { len: 0.3, from: 3000, to: 3000, q: 0.3, gain: 0.55, shape: 'hold', attack: 0.004, type: 'highpass' }) },
  { id: 'recordScratch', name: 'Record scratch', group: 'Glitch & tape', seconds: 0.45, blurb: 'The needle across the record.',
    render: (ctx, n) => { noiseSweep(ctx, n, { len: 0.2, from: 900, to: 4500, q: 6, gain: 0.55, shape: 'hit', attack: 0.01 }); noiseSweep(ctx, n, { at: 0.2, len: 0.22, from: 4500, to: 500, q: 6, gain: 0.5, shape: 'hit', attack: 0.01 }); } },
  { id: 'dataBurst', name: 'Data burst', group: 'Glitch & tape', seconds: 0.5, blurb: 'Fast square blips, like a modem.',
    render: (ctx) => { for (let i = 0; i < 12; i++) tone(ctx, { at: i * 0.04, len: 0.03, from: 600 + ((i * 7919) % 11) * 180, type: 'square', gain: 0.25, attack: 0.002 }); } },

  // Small
  { id: 'click', name: 'Click', group: 'Small', seconds: 0.08, blurb: 'A UI click. Buttons, cursors, counters.',
    render: (ctx) => click(ctx, { gain: 0.5 }) },
  { id: 'pop', name: 'Pop', group: 'Small', seconds: 0.15, blurb: 'A sticker landing.',
    render: (ctx) => tone(ctx, { len: 0.12, from: 900, to: 300, gain: 0.6, attack: 0.002 }) },
  { id: 'ding', name: 'Ding', group: 'Small', seconds: 1.3, blurb: 'A clean bell. A point made.',
    render: (ctx) => { tone(ctx, { len: 1.2, from: 1318, type: 'sine', gain: 0.5, attack: 0.002 }); tone(ctx, { len: 0.8, from: 2637, type: 'sine', gain: 0.18, attack: 0.002 }); } },
  { id: 'shutter', name: 'Camera shutter', group: 'Small', seconds: 0.2, blurb: 'Two clicks, for a freeze frame.',
    render: (ctx, n) => { click(ctx, { at: 0, gain: 0.5, freq: 1800 }); noiseSweep(ctx, n, { at: 0.01, len: 0.05, from: 3000, to: 1500, gain: 0.35, shape: 'hit', attack: 0.002 }); click(ctx, { at: 0.12, gain: 0.45, freq: 1400 }); } },
  { id: 'typewriter', name: 'Typewriter key', group: 'Small', seconds: 0.12, blurb: 'One key, for typed-on text.',
    render: (ctx, n) => { click(ctx, { gain: 0.4, freq: 1200, len: 0.008 }); noiseSweep(ctx, n, { at: 0.004, len: 0.06, from: 2500, to: 900, gain: 0.35, shape: 'hit', attack: 0.002 }); } },
  { id: 'heartbeat', name: 'Heartbeat', group: 'Small', seconds: 1.1, blurb: 'Two beats. Tension.',
    render: (ctx) => { tone(ctx, { at: 0, len: 0.25, from: 70, to: 40, gain: 0.8, attack: 0.01 }); tone(ctx, { at: 0.32, len: 0.22, from: 60, to: 38, gain: 0.6, attack: 0.01 }); } },
  { id: 'tick', name: 'Ticking clock', group: 'Small', seconds: 2.0, blurb: 'Four ticks, a second apart… half a second.',
    render: (ctx) => { for (let i = 0; i < 4; i++) click(ctx, { at: i * 0.5, gain: 0.4, freq: i % 2 ? 1500 : 2100, len: 0.01 }); } },

  // Beds
  { id: 'droneLow', name: 'Low drone', group: 'Beds', seconds: 6.0, blurb: 'A held low note under a slow section.',
    render: (ctx) => { for (const f of [55, 55.4, 110.3]) tone(ctx, { len: 6, from: f, type: 'sine', gain: 0.25, attack: 1.2, decay: 6 }); } },
  { id: 'droneDark', name: 'Dark drone', group: 'Beds', seconds: 6.0, blurb: 'The same, with an edge. Horror and tension.',
    render: (ctx, n) => { for (const f of [41, 41.6, 61.7]) tone(ctx, { len: 6, from: f, type: 'sawtooth', gain: 0.14, attack: 1.5, decay: 6 }); noiseSweep(ctx, n, { len: 6, from: 120, to: 260, q: 3, gain: 0.12, shape: 'hold', attack: 2 }); } },
  { id: 'windBed', name: 'Wind', group: 'Beds', seconds: 6.0, blurb: 'Six seconds of moving air.',
    render: (ctx, n) => { noiseSweep(ctx, n, { len: 6, from: 300, to: 700, q: 0.8, gain: 0.35, shape: 'hold', attack: 1.5 }); noiseSweep(ctx, n, { at: 2, len: 4, from: 900, to: 400, q: 1.5, gain: 0.2, shape: 'swell' }); } },
];

export const SFX_BY_ID = Object.fromEntries(SFX.map((s) => [s.id, s]));
export const SFX_GROUPS = [...new Set(SFX.map((s) => s.group))];

/** Render one sound. Returns { buffer, seconds }. */
export async function renderSfx(id, { sampleRate = RATE } = {}) {
  const def = SFX_BY_ID[id];
  if (!def) throw new Error(`No sound "${id}"`);
  const ctx = new OfflineAudioContext(1, Math.ceil((def.seconds + 0.05) * sampleRate), sampleRate);
  def.render(ctx, noiseBuffer(ctx, Math.max(2, def.seconds + 0.1)));
  const buffer = await ctx.startRendering();
  const d = buffer.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const norm = peak > 0 ? 0.8 / peak : 1;
  for (let i = 0; i < d.length; i++) d[i] *= norm;
  return { buffer, seconds: buffer.duration };
}

/** The same, as a file the pool can import. */
export async function sfxFile(id) {
  const made = await renderSfx(id);
  return bufferToWav(made.buffer, `${SFX_BY_ID[id].name}.wav`);
}

export const SFX_PROBLEMS = [];
for (const s of SFX) {
  if (!s.id || !s.name || !s.group || !(s.seconds > 0) || typeof s.render !== 'function') SFX_PROBLEMS.push(`${s.id || '?'}: incomplete`);
}
if (SFX_PROBLEMS.length) {
  // eslint-disable-next-line no-console -- a build-time mistake shipped to runtime
  console.warn(`[sfx] ${SFX_PROBLEMS.length} problem(s):\n  ${SFX_PROBLEMS.join('\n  ')}`);
}
