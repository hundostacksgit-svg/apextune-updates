/*
 * Creative audio filters — underwater, telephone, cathedral, robot and the
 * rest of the sounds people actually ask for.
 *
 * This is the counterpart to audio-repair.js. That one makes bad audio sound
 * right; this one makes right audio sound deliberately wrong. Both matter, and
 * most editors ship neither without a plug-in.
 *
 * Everything here is a Web Audio graph rather than a sample-by-sample loop,
 * which is what lets one implementation serve both jobs:
 *
 *   • live preview, on an AudioContext, while you scrub the timeline
 *   • the export, on an OfflineAudioContext, faster than realtime
 *
 * Those two contexts expose the same node types, so `buildAudioChain` is
 * handed whichever one is asking and neither path has its own idea of what
 * "underwater" sounds like. A filter that previews differently from how it
 * exports is worse than no filter at all.
 *
 * A chain is always wet/dry: `input` fans out to a dry gain and to the effect,
 * and both meet at `output`. Setting mix to 0 is therefore a true bypass, not
 * "the effect turned down".
 */

/* ------------------------------------------------------------------ *
 * The catalogue
 *
 * Seventeen of them. `pro` marks the four that need the pitch shifter — the
 * one piece of this that is genuinely expensive to run. The other thirteen are
 * free.
 * ------------------------------------------------------------------ */
export const AUDIO_FX = {
  underwater: {
    name: 'Underwater',
    group: 'World',
    blurb: 'Muffled and swimming, with the wobble of something heard through water.',
    defaults: { depth: 0.7, wobble: 0.5 },
    params: [
      { key: 'depth', label: 'Depth', min: 0.2, max: 1, step: 0.02 },
      { key: 'wobble', label: 'Wobble', min: 0, max: 1, step: 0.02 },
    ],
  },
  muffled: {
    name: 'Through a wall',
    group: 'World',
    blurb: 'The party in the next room. Bass gets through, words do not.',
    defaults: { depth: 0.6 },
    params: [{ key: 'depth', label: 'Thickness', min: 0.2, max: 1, step: 0.02 }],
  },
  telephone: {
    name: 'Telephone',
    group: 'World',
    blurb: 'Narrow, tinny and a little crushed. The classic phone-call voice.',
    defaults: { grit: 0.35 },
    params: [{ key: 'grit', label: 'Grit', min: 0, max: 1, step: 0.02 }],
  },
  radio: {
    name: 'Old radio',
    group: 'World',
    blurb: 'A wartime wireless: mid-heavy, driven, with a resonant peak.',
    defaults: { grit: 0.55 },
    params: [{ key: 'grit', label: 'Drive', min: 0, max: 1, step: 0.02 }],
  },
  megaphone: {
    name: 'Megaphone',
    group: 'World',
    blurb: 'Shouted through a cone. Honky, loud and unmistakably outdoors.',
    defaults: { grit: 0.7 },
    params: [{ key: 'grit', label: 'Drive', min: 0, max: 1, step: 0.02 }],
  },
  vinyl: {
    name: 'Vinyl',
    group: 'World',
    blurb: 'Warm, band-limited, with surface crackle underneath.',
    defaults: { crackle: 0.4 },
    params: [{ key: 'crackle', label: 'Crackle', min: 0, max: 1, step: 0.02 }],
  },

  room: {
    name: 'Small room',
    group: 'Space',
    blurb: 'A short, tight reflection. Puts a voice somewhere instead of nowhere.',
    defaults: { size: 0.35 },
    params: [{ key: 'size', label: 'Size', min: 0.1, max: 1, step: 0.02 }],
  },
  cathedral: {
    name: 'Cathedral',
    group: 'Space',
    blurb: 'A long stone tail. Enormous, and it takes its time.',
    defaults: { size: 0.85 },
    params: [{ key: 'size', label: 'Size', min: 0.3, max: 1, step: 0.02 }],
  },
  stadium: {
    name: 'Stadium',
    group: 'Space',
    blurb: 'A slap back off the far stand, then the wash of the whole bowl.',
    defaults: { size: 0.7 },
    params: [{ key: 'size', label: 'Size', min: 0.3, max: 1, step: 0.02 }],
  },
  slowed: {
    name: 'Slowed + reverb',
    group: 'Space',
    blurb: 'The late-night edit sound: warm, wide and washed out.',
    /* The tempo half of this look is the clip's own speed control, because
       slowing the audio without slowing the picture would put them out of
       sync. The audio panel sets both together. */
    defaults: { size: 0.6 },
    params: [{ key: 'size', label: 'Wash', min: 0.2, max: 1, step: 0.02 }],
    alsoSetsSpeed: 0.85,
  },
  wide: {
    name: 'Wide',
    group: 'Space',
    blurb: 'Opens a mono recording out across the stereo field.',
    defaults: { width: 0.6 },
    params: [{ key: 'width', label: 'Width', min: 0, max: 1, step: 0.02 }],
  },

  robot: {
    name: 'Robot',
    group: 'Machine',
    blurb: 'Ring modulation. A voice with the humanity multiplied out of it.',
    defaults: { rate: 0.4 },
    params: [{ key: 'rate', label: 'Frequency', min: 0, max: 1, step: 0.02 }],
  },
  bitcrush: {
    name: '8-bit',
    group: 'Machine',
    blurb: 'Quantised down to a handful of levels, like a console from 1989.',
    defaults: { bits: 0.45 },
    params: [{ key: 'bits', label: 'Crush', min: 0, max: 1, step: 0.02 }],
  },

  chipmunk: {
    name: 'Chipmunk',
    group: 'Pitch',
    pro: true,
    blurb: 'Up seven semitones, at the same speed. The voice changes, the timing does not.',
    defaults: { semitones: 7 },
    params: [{ key: 'semitones', label: 'Semitones', min: 1, max: 12, step: 1 }],
  },
  deep: {
    name: 'Deep voice',
    group: 'Pitch',
    pro: true,
    blurb: 'Down seven semitones without dragging the timing with it.',
    defaults: { semitones: -7 },
    params: [{ key: 'semitones', label: 'Semitones', min: -12, max: -1, step: 1 }],
  },
  nightcore: {
    name: 'Nightcore',
    group: 'Pitch',
    pro: true,
    blurb: 'Pitched up and brightened, the way the sped-up edits sound.',
    defaults: { semitones: 4 },
    params: [{ key: 'semitones', label: 'Semitones', min: 1, max: 8, step: 1 }],
    alsoSetsSpeed: 1.25,
  },
  alien: {
    name: 'Alien',
    group: 'Pitch',
    pro: true,
    blurb: 'Pitched, ring-modulated and flanged. Nothing that lives here.',
    defaults: { semitones: -5, rate: 0.6 },
    params: [
      { key: 'semitones', label: 'Pitch', min: -12, max: 12, step: 1 },
      { key: 'rate', label: 'Warp', min: 0, max: 1, step: 0.02 },
    ],
  },
};

export const FX_IDS = Object.keys(AUDIO_FX);
export const FREE_FX = FX_IDS.filter((id) => !AUDIO_FX[id].pro);

/** A fresh effect record for a clip, with the catalogue's defaults filled in. */
export function makeAudioFx(id) {
  const spec = AUDIO_FX[id];
  if (!spec) return null;
  return { id, mix: 1, params: { ...spec.defaults } };
}

/** One line of plain English, for the timeline chip and the plan summary. */
export function describeAudioFx(fx) {
  if (!fx || !AUDIO_FX[fx.id]) return '';
  const spec = AUDIO_FX[fx.id];
  const pct = Math.round((fx.mix ?? 1) * 100);
  return pct >= 99 ? spec.name : `${spec.name} at ${pct}%`;
}

/** Read a parameter, falling back to the catalogue default. */
function p(fx, key, fallback = 0) {
  const v = fx?.params?.[key];
  const spec = AUDIO_FX[fx?.id];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const dflt = spec?.defaults?.[key];
  return typeof dflt === 'number' ? dflt : fallback;
}

/* ------------------------------------------------------------------ *
 * Building blocks
 * ------------------------------------------------------------------ */

/**
 * An impulse response for the convolver, generated rather than shipped.
 *
 * A downloaded impulse would be a megabyte the app has to fetch before a
 * filter works offline, which defeats the point. Noise under an exponential
 * decay is the standard synthetic reverb and it is convincing enough that
 * nobody asks where the church was.
 */
function impulse(ctx, seconds, decay, { bright = 0.5 } = {}) {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(seconds * rate));
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    // A little low-pass inside the tail: real rooms lose treble as the sound
    // bounces, and noise with a flat spectrum reads as a hiss, not a hall.
    let last = 0;
    const smooth = 1 - bright;
    for (let i = 0; i < len; i++) {
      const n = Math.random() * 2 - 1;
      last = last * smooth + n * (1 - smooth);
      data[i] = last * (1 - i / len) ** decay;
    }
    // Two early reflections give the tail a size. Without them a long reverb
    // sounds like a synthesiser pad rather than a space.
    const early = [0.013, 0.029];
    for (const t of early) {
      const at = Math.floor(t * rate * (1 + ch * 0.17));
      if (at < len) data[at] += 0.45 * (1 - ch * 0.2);
    }
  }
  return buf;
}

/** A soft-clipping curve. `amount` 0..1 goes from barely-there to crunchy. */
function driveCurve(amount) {
  const k = 1 + amount * 60;
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

/** A staircase curve: the sound of too few bits. */
function crushCurve(levels) {
  const n = 2048;
  const curve = new Float32Array(n);
  const steps = Math.max(2, Math.round(levels));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.round(x * steps) / steps;
  }
  return curve;
}

/** White noise on a loop, for vinyl crackle. */
function noiseSource(ctx, seconds = 2) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    // Mostly silence with occasional pops is what a record sounds like;
    // continuous hiss is what a broken cable sounds like.
    const pop = Math.random() < 0.0016 ? (Math.random() * 2 - 1) : 0;
    data[i] = pop + (Math.random() * 2 - 1) * 0.012;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  return src;
}

/**
 * Sawtooth and triangle waves with a known phase at t=0.
 *
 * The pitch shifter needs its two delay lines exactly half a cycle apart and
 * its crossfade peaking on the flat part of each ramp. `OscillatorNode` gives
 * no phase control, so the waves are built from their Fourier coefficients,
 * where phase is just which side of the series the terms sit on. Starting
 * every oscillator at the same instant then locks the whole thing together —
 * which matters, because a shifter whose windows drift produces a warble that
 * changes every time you export.
 */
function phasedWaves(ctx, harmonics = 24) {
  const n = harmonics + 1;
  const sawA = { real: new Float32Array(n), imag: new Float32Array(n) };
  const sawB = { real: new Float32Array(n), imag: new Float32Array(n) };
  const tri = { real: new Float32Array(n), imag: new Float32Array(n) };
  const k = 2 / Math.PI;
  for (let i = 1; i < n; i++) {
    sawA.imag[i] = ((i % 2 === 1) ? k : -k) / i;   // rises through zero at t=0
    sawB.imag[i] = -k / i;                          // the same ramp, half a cycle later
    if (i % 2 === 1) tri.real[i] = (8 / (Math.PI * Math.PI)) / (i * i); // peaks at t=0
  }
  return {
    sawA: ctx.createPeriodicWave(sawA.real, sawA.imag, { disableNormalization: true }),
    sawB: ctx.createPeriodicWave(sawB.real, sawB.imag, { disableNormalization: true }),
    tri: ctx.createPeriodicWave(tri.real, tri.imag, { disableNormalization: true }),
  };
}

/**
 * A pitch shifter that does not change the length of the clip.
 *
 * Two delay lines whose delay ramps continuously — one filling while the other
 * empties — crossfaded so you only ever hear the smooth part of each ramp. A
 * delay that shortens plays the source slightly fast, which is a pitch rise
 * without a tempo change; lengthening does the opposite.
 *
 * This is the classic technique rather than a phase vocoder because a vocoder
 * needs a worker, a window of latency and a lot of maths for a filter people
 * reach for to sound like a chipmunk. The characteristic light warble is part
 * of how this effect is supposed to sound.
 */
function pitchShift(ctx, semitones, started) {
  const ratio = 2 ** (semitones / 12);
  const input = ctx.createGain();
  const output = ctx.createGain();
  if (!Number.isFinite(ratio) || Math.abs(ratio - 1) < 0.001) {
    input.connect(output);
    return { input, output };
  }

  const win = 0.085;                                   // seconds of delay sweep
  const rate = Math.abs(1 - ratio) / win;              // sweeps per second
  const dir = Math.sign(1 - ratio);                    // shorten to go up
  const { sawA, sawB, tri } = phasedWaves(ctx);

  const make = (wave) => {
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(wave);
    osc.frequency.value = rate;
    started.push(osc);
    return osc;
  };

  const scale = (node, by) => {
    const g = ctx.createGain();
    g.gain.value = by;
    node.connect(g);
    return g;
  };

  const branch = (wave, fadePolarity) => {
    const delay = ctx.createDelay(win + 0.05);
    delay.delayTime.value = win / 2;
    scale(make(wave), (win / 2) * dir).connect(delay.delayTime);

    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    scale(fade, 0.5 * fadePolarity).connect(gain.gain);

    input.connect(delay).connect(gain).connect(output);
  };

  const fade = make(tri);
  branch(sawA, 1);    // loudest when its delay is mid-sweep
  branch(sawB, -1);   // and exactly the other way round

  return { input, output };
}

/* ------------------------------------------------------------------ *
 * The chain
 * ------------------------------------------------------------------ */

/**
 * Build the node graph for one effect.
 *
 * @param ctx    an AudioContext (preview) or OfflineAudioContext (export)
 * @param fx     { id, mix, params } from the clip
 * @returns      { input, output, start(when) } or null if there is nothing to do
 *
 * Nothing is started here: an OfflineAudioContext wants every oscillator
 * started at 0, a live context wants them started now, and the caller is the
 * only one that knows which it is.
 */
export function buildAudioChain(ctx, fx) {
  if (!fx || !AUDIO_FX[fx.id]) return null;
  const mix = Math.max(0, Math.min(1, fx.mix ?? 1));
  if (mix <= 0.001) return null;

  const input = ctx.createGain();
  const output = ctx.createGain();
  const started = [];

  const dry = ctx.createGain();
  dry.gain.value = 1 - mix;
  input.connect(dry).connect(output);

  const wet = ctx.createGain();
  wet.gain.value = mix;
  wet.connect(output);

  // `head` is where the next node in the effect path attaches.
  let head = input;
  const add = (node) => { head.connect(node); head = node; return node; };
  const lp = (freq, q = 1) => {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = q;
    return add(f);
  };
  const hp = (freq, q = 1) => {
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = freq; f.Q.value = q;
    return add(f);
  };
  const peak = (freq, gainDb, q = 1) => {
    const f = ctx.createBiquadFilter();
    f.type = 'peaking'; f.frequency.value = freq; f.gain.value = gainDb; f.Q.value = q;
    return add(f);
  };
  const shape = (curve) => {
    const s = ctx.createWaveShaper();
    s.curve = curve; s.oversample = '4x';
    return add(s);
  };
  const trim = (v) => {
    const g = ctx.createGain();
    g.gain.value = v;
    return add(g);
  };
  const reverb = (seconds, decay, bright) => {
    const c = ctx.createConvolver();
    c.buffer = impulse(ctx, seconds, decay, { bright });
    c.normalize = true;
    return add(c);
  };
  const pitch = (semitones) => {
    const unit = pitchShift(ctx, semitones, started);
    head.connect(unit.input);
    head = unit.output;
    return head;
  };

  switch (fx.id) {
    case 'underwater': {
      const depth = p(fx, 'depth');
      const wobble = p(fx, 'wobble');
      hp(90);
      const filter = lp(1400 - depth * 1050, 3.2 + depth * 3);
      if (wobble > 0.01) {
        // A slow sweep of the cut-off is what separates "underwater" from
        // "someone put a blanket over the microphone".
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.55 + wobble * 0.9;
        const amt = ctx.createGain();
        amt.gain.value = wobble * 320;
        lfo.connect(amt).connect(filter.frequency);
        started.push(lfo);
      }
      peak(220, 5, 0.9);
      reverb(1.5, 2.4, 0.28);
      trim(1.5);
      break;
    }

    case 'muffled': {
      const depth = p(fx, 'depth');
      lp(900 - depth * 550, 0.9);
      hp(60);
      peak(140, 4 + depth * 4, 0.8);
      reverb(0.7, 2.6, 0.3);
      trim(1.6);
      break;
    }

    /*
     * The drive comes before the band-limiting on all three of these, and the
     * order is the whole trick.
     *
     * A waveshaper is non-linear, so distorting a signal generates new
     * frequencies right across the spectrum — including below and above
     * whatever you filtered first. Filter-then-distort therefore un-does its
     * own band-limit and the result is just "loud", not "on a phone". Real
     * phone lines, valve sets and megaphone horns all clip first and are
     * band-limited last by the codec or the speaker, so doing it in that order
     * is both the honest model and the one that actually sounds right.
     */
    case 'telephone': {
      shape(driveCurve(0.2 + p(fx, 'grit') * 0.4));
      hp(320, 0.9);
      // Two poles, not one. A real phone line is 300-3400Hz with a wall at
      // each end; a single biquad leaves enough 8kHz through to still sound
      // like a room mic with the treble down.
      lp(3400, 0.7);
      lp(3400, 0.7);
      peak(1600, 6, 1.4);
      trim(0.45);            // pays back the +6dB peak above
      break;
    }

    case 'radio': {
      const grit = p(fx, 'grit');
      shape(driveCurve(0.3 + grit * 0.55));
      hp(420, 1.1);
      lp(2600, 1.1);
      peak(1100, 8, 2.2);
      // A trace of hiss under it. Real valve sets were never quiet.
      const hiss = noiseSource(ctx, 2);
      const hissGain = ctx.createGain();
      hissGain.gain.value = grit * 0.05;
      const hissBand = ctx.createBiquadFilter();
      hissBand.type = 'bandpass'; hissBand.frequency.value = 1500; hissBand.Q.value = 0.7;
      hiss.connect(hissBand).connect(hissGain).connect(wet);
      started.push(hiss);
      trim(0.38);            // pays back the +8dB peak above
      break;
    }

    case 'megaphone': {
      const grit = p(fx, 'grit');
      shape(driveCurve(0.45 + grit * 0.5));
      hp(500, 1.2);
      lp(4000, 1.2);
      peak(2000, 9, 3);
      reverb(0.42, 3, 0.55);
      trim(1.1);
      break;
    }

    case 'vinyl': {
      const crackle = p(fx, 'crackle');
      hp(75, 0.8);
      lp(7800, 0.8);
      peak(320, 3, 0.8);
      const noise = noiseSource(ctx, 3);
      const nGain = ctx.createGain();
      nGain.gain.value = crackle * 0.85;
      const nTone = ctx.createBiquadFilter();
      nTone.type = 'bandpass'; nTone.frequency.value = 3400; nTone.Q.value = 0.5;
      noise.connect(nTone).connect(nGain).connect(wet);
      started.push(noise);
      trim(1.15);
      break;
    }

    case 'room':
      reverb(0.35 + p(fx, 'size') * 0.6, 3.2, 0.55);
      trim(1.4);
      break;

    case 'cathedral':
      hp(70);
      reverb(1.8 + p(fx, 'size') * 4.2, 1.9, 0.32);
      trim(1.5);
      break;

    case 'stadium': {
      const size = p(fx, 'size');
      const slap = ctx.createDelay(1);
      slap.delayTime.value = 0.09 + size * 0.13;
      const fb = ctx.createGain();
      fb.gain.value = 0.28;
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass'; tone.frequency.value = 3000;
      slap.connect(tone).connect(fb).connect(slap);
      add(slap);
      reverb(1.4 + size * 2.4, 2.1, 0.4);
      trim(1.35);
      break;
    }

    case 'slowed':
      lp(9000, 0.7);
      peak(180, 4, 0.8);
      reverb(1.1 + p(fx, 'size') * 2.2, 2.3, 0.36);
      trim(1.45);
      break;

    case 'wide': {
      // A Haas widener: one side delayed by a few milliseconds reads as space
      // rather than as an echo, because the ear fuses anything under ~25ms.
      const width = p(fx, 'width');
      const split = ctx.createChannelSplitter(2);
      const merge = ctx.createChannelMerger(2);
      const dl = ctx.createDelay(0.05);
      const dr = ctx.createDelay(0.05);
      dl.delayTime.value = 0.0;
      dr.delayTime.value = 0.004 + width * 0.016;
      const tilt = ctx.createBiquadFilter();
      tilt.type = 'highshelf'; tilt.frequency.value = 3500; tilt.gain.value = width * 3;
      head.connect(split);
      split.connect(dl, 0);
      split.connect(dr, 1);
      dl.connect(merge, 0, 0);
      dr.connect(tilt).connect(merge, 0, 1);
      head = merge;
      break;
    }

    case 'robot': {
      // Ring modulation: multiply the signal by a tone. A GainNode whose gain
      // is driven by an oscillator is exactly that multiply.
      const ring = ctx.createGain();
      ring.gain.value = 0;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 30 + p(fx, 'rate') * 220;
      osc.connect(ring.gain);
      started.push(osc);
      add(ring);
      hp(110);
      trim(1.7);
      break;
    }

    case 'bitcrush': {
      const bits = p(fx, 'bits');
      shape(crushCurve(2 + (1 - bits) ** 2 * 46));
      lp(6500 - bits * 3800, 0.8);
      trim(1.1);
      break;
    }

    case 'chipmunk':
    case 'deep':
      pitch(p(fx, 'semitones'));
      if (fx.id === 'deep') peak(160, 4, 0.8);
      break;

    case 'nightcore':
      pitch(p(fx, 'semitones'));
      peak(6500, 4, 0.8);
      reverb(0.6, 3, 0.5);
      trim(1.25);
      break;

    case 'alien': {
      pitch(p(fx, 'semitones'));
      const ring = ctx.createGain();
      ring.gain.value = 0.45;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 55 + p(fx, 'rate') * 190;
      const depth = ctx.createGain();
      depth.gain.value = 0.55;
      osc.connect(depth).connect(ring.gain);
      started.push(osc);
      add(ring);

      const flange = ctx.createDelay(0.02);
      flange.delayTime.value = 0.004;
      const sweep = ctx.createOscillator();
      sweep.type = 'sine';
      sweep.frequency.value = 0.25;
      const sweepAmt = ctx.createGain();
      sweepAmt.gain.value = 0.0028;
      sweep.connect(sweepAmt).connect(flange.delayTime);
      started.push(sweep);
      const fb = ctx.createGain();
      fb.gain.value = 0.5;
      flange.connect(fb).connect(flange);
      add(flange);
      trim(1.5);
      break;
    }

    default:
      return null;
  }

  head.connect(wet);

  return {
    input,
    output,
    /** Start every generator. Pass 0 offline, ctx.currentTime live. */
    start(when = 0) {
      for (const node of started) {
        try { node.start(when); } catch { /* already running */ }
      }
    },
    stop() {
      for (const node of started) {
        try { node.stop(); } catch { /* never started, or already stopped */ }
      }
    },
  };
}

/**
 * A stable string for one effect's settings.
 *
 * The live engine rebuilds a clip's chain only when this changes — rebuilding
 * every frame would click, and never rebuilding would ignore the slider you
 * are dragging.
 */
export function fxSignature(fx) {
  if (!fx || !AUDIO_FX[fx.id]) return '';
  const spec = AUDIO_FX[fx.id];
  const parts = (spec.params || []).map((prm) => `${prm.key}=${p(fx, prm.key)}`);
  return `${fx.id}|${(fx.mix ?? 1).toFixed(3)}|${parts.join(',')}`;
}
