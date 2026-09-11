/*
 * The technical half of a clip's sound: EQ, dynamics and pan.
 *
 * Deliberately separate from audio-fx.js, which is the *creative* half —
 * underwater, telephone, cathedral. Those are a look. These are the ones every
 * mix needs and nobody notices when they are right: a high-pass to get the
 * rumble out of a voice, a little presence, a compressor so the quiet lines
 * are audible without the loud ones hurting.
 *
 * All of it is native Web Audio, which matters for one specific reason: the
 * preview and the export have to agree. An approximation in the preview and a
 * different approximation offline is how a mix that sounded finished comes
 * back wrong, and there is no way to debug that from inside the app.
 *
 * There is no gate here and no limiter, and both omissions are deliberate.
 *
 * Web Audio has no gate node, and a gate faked out of a compressor is not a
 * gate — it is a compressor with a confusing label. The noise, hum and click
 * repair in audio-repair.js is what this app offers for that job, and it works
 * on the samples where it can be done properly.
 *
 * The limiter was written, measured, and taken out again. A DynamicsCompressor
 * with the ratio at its maximum is the usual trick and it does not hold a
 * ceiling: set to -12dB it let a hot tone through at -4.2dBTP. A control whose
 * whole promise is a number it does not meet is worse than no control. The
 * ceiling is enforced where it can be enforced exactly — at export, by
 * measuring the true peak and clamping the normalisation gain so it cannot be
 * broken. See engine/loudness.js.
 */

/* Six bands, laid out the way a channel strip is: two shelves at the ends and
   four bells in between, parked on the frequencies people actually reach for. */
export const EQ_BANDS = [
  { id: 'hp', label: 'Low cut', type: 'highpass', freq: 80, q: 0.7, gain: 0, fixedGain: true },
  { id: 'low', label: 'Low', type: 'lowshelf', freq: 200, q: 0.7, gain: 0 },
  { id: 'lowmid', label: 'Low mid', type: 'peaking', freq: 500, q: 1, gain: 0 },
  { id: 'mid', label: 'Mid', type: 'peaking', freq: 1600, q: 1, gain: 0 },
  { id: 'presence', label: 'Presence', type: 'peaking', freq: 4000, q: 1, gain: 0 },
  { id: 'air', label: 'Air', type: 'highshelf', freq: 10000, q: 0.7, gain: 0 },
];

export function newStrip() {
  return {
    on: false,
    eq: EQ_BANDS.map((b) => ({ id: b.id, on: b.id === 'hp' ? false : true,
      type: b.type, freq: b.freq, q: b.q, gain: b.gain })),
    comp: {
      on: false,
      threshold: -24,      // dB
      ratio: 3,
      attack: 0.006,       // seconds
      release: 0.2,
      knee: 6,
      makeup: 0,           // dB
    },
    pan: 0,                // -1 hard left, +1 hard right
    gain: 0,               // dB, the fader in the strip rather than clip volume
  };
}

/** Nothing switched on means nothing to build — the common case, made cheap. */
export function stripIsFlat(strip) {
  if (!strip || strip.on === false) return true;
  if (strip.pan) return false;
  if (strip.gain) return false;
  if (strip.comp?.on) return false;
  return !(strip.eq || []).some((b) => b.on !== false && (b.gain || b.type === 'highpass'));
}

/*
 * A signature rather than a deep compare.
 *
 * The live graph is rebuilt whenever this changes, and rebuilt on every frame
 * it would click audibly. Deep-equalling six filters plus a compressor on
 * every animation frame is the other way to get this wrong.
 */
export function stripSignature(strip) {
  if (stripIsFlat(strip)) return '';
  const eq = (strip.eq || []).map((b) =>
    `${b.id}:${b.on === false ? 0 : 1}:${b.type}:${b.freq}:${b.q}:${b.gain}`).join('|');
  const c = strip.comp || {};
  return `${eq}#${c.on ? `${c.threshold},${c.ratio},${c.attack},${c.release},${c.knee},${c.makeup}` : ''}`
       + `#${strip.pan}#${strip.gain}`;
}

const dbToGain = (db) => 10 ** (db / 20);

/* ------------------------------------------------------------------ */
/* the compressor's hidden make-up                                     */
/* ------------------------------------------------------------------ */

/*
 * DynamicsCompressorNode is not a transparent compressor.
 *
 * It applies an automatic make-up gain that is not in the spec, not settable,
 * and not small: measured here, a -37 dBFS tone came out of a compressor set
 * to -30 threshold and 8:1 at -21 dBFS. That is +15.75dB applied to material
 * entirely below the threshold — the part a compressor is supposed to leave
 * alone. Shipping that as "Compressor" with a threshold and a ratio would mean
 * somebody sets a threshold for the loud lines and watches their quiet ones
 * jump fifteen decibels, with nothing in the interface to explain it.
 *
 * So it is measured and cancelled. Below the threshold the node's gain is a
 * constant that depends only on threshold, ratio and knee, which makes it
 * cheap to find: render a below-threshold tone through one and see what comes
 * out. Measured rather than derived from Blink's source, because the source is
 * not a contract and a formula copied from it would be wrong the day it
 * changed — a measurement is right by construction on whatever browser is
 * running it.
 */
const makeupCache = new Map();
const makeupPending = new Map();

const makeupKey = (c) => `${c.threshold}|${c.ratio}|${c.knee}`;

/** The correction, or 1 when it has not been measured yet. */
export function knownMakeup(comp) {
  if (!comp?.on) return 1;
  return makeupCache.get(makeupKey(comp)) ?? 1;
}

export function makeupMeasured(comp) {
  return !comp?.on || makeupCache.has(makeupKey(comp));
}

/**
 * Measure and cache the node's built-in gain for one parameter set.
 *
 * Costs a 0.15s offline render the first time each distinct setting is seen
 * and nothing afterwards. Safe to call as often as you like.
 */
export async function measureMakeup(comp) {
  if (!comp?.on) return 1;
  const key = makeupKey(comp);
  if (makeupCache.has(key)) return makeupCache.get(key);
  if (makeupPending.has(key)) return makeupPending.get(key);

  const job = (async () => {
    try {
      const rate = 44100;
      const len = Math.round(rate * 0.15);
      const ctx = new OfflineAudioContext(1, len, rate);
      // Forty decibels below the threshold: far enough under it that no part
      // of the knee reaches, whatever shape the knee is.
      const amp = dbToGain(comp.threshold - 40);
      const buf = ctx.createBuffer(1, len, rate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = amp * Math.sin((2 * Math.PI * 220 * i) / rate);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const node = ctx.createDynamicsCompressor();
      node.threshold.value = comp.threshold;
      node.ratio.value = comp.ratio;
      node.knee.value = comp.knee;
      node.attack.value = comp.attack ?? 0.003;
      node.release.value = comp.release ?? 0.25;
      src.connect(node).connect(ctx.destination);
      src.start(0);
      const out = await ctx.startRendering();

      // The back half only, so the attack envelope settling is not measured.
      const o = out.getChannelData(0);
      let sum = 0;
      const from = Math.round(len * 0.5);
      for (let i = from; i < len; i++) sum += o[i] * o[i];
      const outRms = Math.sqrt(sum / (len - from));
      const inRms = amp / Math.SQRT2;
      const gain = inRms > 0 ? outRms / inRms : 1;
      // A wild answer means something is wrong; 1 is the safe wrong answer.
      const safe = Number.isFinite(gain) && gain > 0.01 && gain < 1000 ? gain : 1;
      makeupCache.set(key, safe);
      return safe;
    } catch {
      makeupCache.set(key, 1);
      return 1;
    } finally {
      makeupPending.delete(key);
    }
  })();
  makeupPending.set(key, job);
  return job;
}

/** Measure whatever this strip needs, so the next build is already corrected. */
export function warmStrip(strip) {
  if (strip?.comp?.on) return measureMakeup(strip.comp);
  return Promise.resolve(1);
}

/**
 * Build the strip as a Web Audio graph.
 *
 * Returns `{ input, output }`, or null when there is nothing to build. The
 * same function serves the live context and the offline render context, which
 * is what keeps the preview and the export honest about each other.
 */
export function buildStrip(ctx, strip) {
  if (stripIsFlat(strip)) return null;

  const input = ctx.createGain();
  let head = input;
  const add = (node) => { head.connect(node); head = node; return node; };

  for (const band of strip.eq || []) {
    if (band.on === false) continue;
    // A bell or a shelf at zero does nothing but cost a node; a filter always
    // does something, so it is kept whatever its numbers say.
    if (!band.gain && band.type !== 'highpass' && band.type !== 'lowpass') continue;
    const f = ctx.createBiquadFilter();
    f.type = band.type;
    f.frequency.value = band.freq;
    f.Q.value = band.q ?? 0.7;
    if (band.type !== 'highpass' && band.type !== 'lowpass') f.gain.value = band.gain;
    add(f);
  }

  if (strip.comp?.on) {
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = strip.comp.threshold;
    c.ratio.value = strip.comp.ratio;
    c.attack.value = strip.comp.attack;
    c.release.value = strip.comp.release;
    c.knee.value = strip.comp.knee;
    add(c);

    /*
     * Cancel what the node added on its own, then apply what was asked for.
     *
     * Until the measurement has run this is 1, so the first frames after a
     * change can be loud — which is why warmStrip() is called when a setting
     * changes rather than when the sound starts.
     */
    const auto = knownMakeup(strip.comp);
    if (Math.abs(auto - 1) > 0.001) {
      const fix = ctx.createGain();
      fix.gain.value = 1 / auto;
      add(fix);
    }

    if (strip.comp.makeup) {
      /*
       * Make-up gain is separate and manual.
       *
       * A compressor turns the loud parts down, so the whole thing is quieter
       * than it went in, and without this the control reads as "make it worse".
       * It is manual because an automatic one would fight the loudness
       * normalisation for control of the same decibel — and because the node's
       * own automatic make-up is exactly the surprise being cancelled two
       * lines above.
       */
      const g = ctx.createGain();
      g.gain.value = dbToGain(strip.comp.makeup);
      add(g);
    }
  }

  if (strip.pan) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, strip.pan));
    add(p);
  }

  if (strip.gain) {
    const g = ctx.createGain();
    g.gain.value = dbToGain(strip.gain);
    add(g);
  }

  return { input, output: head };
}

/** A line for the panel saying what the strip is doing, or that it is not. */
export function describeStrip(strip) {
  if (stripIsFlat(strip)) return 'Flat — nothing is being done to the sound.';
  const bits = [];
  const eq = (strip.eq || []).filter((b) => b.on !== false && (b.gain || b.type === 'highpass'));
  if (eq.length) bits.push(`${eq.length} EQ band${eq.length === 1 ? '' : 's'}`);
  if (strip.comp?.on) bits.push(`compressed ${strip.comp.ratio}:1`);
  if (strip.pan) bits.push(`panned ${Math.abs(Math.round(strip.pan * 100))}% ${strip.pan < 0 ? 'left' : 'right'}`);
  if (strip.gain) bits.push(`${strip.gain > 0 ? '+' : ''}${strip.gain}dB`);
  return bits.join(' · ');
}
