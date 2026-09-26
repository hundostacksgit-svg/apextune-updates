/*
 * Audio repair.
 *
 * The four things people leave an editor for a DAW to do: get rid of the
 * hiss, get rid of the mains hum, get rid of the clicks, and make the level
 * stop wandering. All four are done here, offline, on the decoded buffer.
 *
 * These are the actual algorithms, not presets over a lowpass filter:
 *
 *   Noise reduction — spectral subtraction. An FFT of the noise alone gives a
 *   per-band profile; every subsequent frame has that profile subtracted from
 *   its magnitudes, with a floor so the result is quieter noise rather than
 *   the underwater warble that over-subtraction produces.
 *
 *   Hum removal — narrow notch filters at the mains frequency and its
 *   harmonics. 50Hz in most of the world, 60Hz in the Americas, and it picks
 *   whichever is actually present rather than asking.
 *
 *   De-click — a click is a sample that breaks the local trend far harder than
 *   its neighbours. Found by second derivative against a running median, and
 *   repaired by interpolating across it rather than muting it.
 *
 *   Levelling — RMS-following gain with a slow attack and release, then a
 *   limiter so the result cannot clip. Loudness, not peak: it is what makes
 *   two people recorded at different distances sound like one conversation.
 */

/* ------------------------------------------------------------------ */
/* FFT                                                                 */
/* ------------------------------------------------------------------ */

/** In-place iterative radix-2 FFT. Real and imaginary parts in two arrays. */
function fft(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (inverse ? 2 : -2) * Math.PI / len;
    const wr = Math.cos(angle), wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k], ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br; im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

const FRAME = 1024;
const HOP = FRAME / 4;                    // 75% overlap: no audible framing

/** Hann window, precomputed — it is used on every frame twice. */
const WINDOW = (() => {
  const w = new Float32Array(FRAME);
  for (let i = 0; i < FRAME; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1));
  return w;
})();

/* ------------------------------------------------------------------ */
/* noise reduction                                                     */
/* ------------------------------------------------------------------ */

/**
 * Learn what the noise sounds like.
 *
 * Given no hint, the quietest half-second in the recording is used — which is
 * almost always a gap between words, and almost always exactly the right
 * answer. A hint is better when there is one.
 */
export function learnNoise(channel, sampleRate, { from = null, to = null } = {}) {
  let start = from !== null ? Math.floor(from * sampleRate) : null;
  let end = to !== null ? Math.floor(to * sampleRate) : null;

  if (start === null) {
    const win = Math.floor(sampleRate * 0.5);
    let best = Infinity, bestAt = 0;
    for (let at = 0; at + win < channel.length; at += Math.floor(win / 2)) {
      let sum = 0;
      for (let i = at; i < at + win; i += 4) sum += channel[i] * channel[i];
      if (sum < best) { best = sum; bestAt = at; }
    }
    start = bestAt;
    end = bestAt + win;
  }

  const profile = new Float32Array(FRAME / 2 + 1);
  const re = new Float32Array(FRAME);
  const im = new Float32Array(FRAME);
  let frames = 0;

  for (let at = start; at + FRAME <= Math.min(end, channel.length); at += HOP) {
    for (let i = 0; i < FRAME; i++) { re[i] = channel[at + i] * WINDOW[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k <= FRAME / 2; k++) profile[k] += Math.hypot(re[k], im[k]);
    frames++;
  }
  if (frames) for (let k = 0; k < profile.length; k++) profile[k] /= frames;
  return { profile, at: start / sampleRate, frames };
}

/**
 * Spectral subtraction.
 *
 * `amount` scales how much of the profile is removed. Above about 2.5 the
 * artefacts cost more than the noise did, which is why the panel's slider tops
 * out below that rather than letting someone ruin a take.
 */
export function reduceNoise(channel, profile, { amount = 1.5, floor = 0.08 } = {}) {
  const out = new Float32Array(channel.length);
  const norm = new Float32Array(channel.length);
  const re = new Float32Array(FRAME);
  const im = new Float32Array(FRAME);

  for (let at = 0; at + FRAME <= channel.length; at += HOP) {
    for (let i = 0; i < FRAME; i++) { re[i] = channel[at + i] * WINDOW[i]; im[i] = 0; }
    fft(re, im);

    for (let k = 0; k <= FRAME / 2; k++) {
      const mag = Math.hypot(re[k], im[k]);
      if (mag < 1e-12) continue;
      // Subtract, but never below `floor` of the original: silence where noise
      // used to be is what makes over-processed audio sound like a bad phone
      // line, and a quiet noise floor sounds natural.
      const cleaned = Math.max(mag - profile[k] * amount, mag * floor);
      const scale = cleaned / mag;
      re[k] *= scale; im[k] *= scale;
      if (k > 0 && k < FRAME / 2) {
        const mirror = FRAME - k;
        re[mirror] *= scale; im[mirror] *= scale;
      }
    }

    fft(re, im, true);
    for (let i = 0; i < FRAME; i++) {
      out[at + i] += re[i] * WINDOW[i];
      norm[at + i] += WINDOW[i] * WINDOW[i];
    }
  }

  // Undo the windowing gain. Overlap-add without this is quieter in the middle
  // of every frame than at its edges, which reads as a tremolo.
  for (let i = 0; i < out.length; i++) {
    out[i] = norm[i] > 1e-6 ? out[i] / norm[i] : channel[i];
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* hum removal                                                         */
/* ------------------------------------------------------------------ */

/** 50Hz or 60Hz — whichever is actually in the recording. */
export function detectHum(channel, sampleRate) {
  const size = 8192;
  const re = new Float32Array(size);
  const im = new Float32Array(size);
  const at = Math.floor(channel.length / 3);
  for (let i = 0; i < size && at + i < channel.length; i++) re[i] = channel[at + i];
  fft(re, im);

  const binOf = (hz) => Math.round((hz * size) / sampleRate);
  const magAt = (bin) => (bin > 0 && bin < size / 2 ? Math.hypot(re[bin], im[bin]) : 0);
  const energyAt = (hz) => {
    let sum = 0;
    for (let h = 1; h <= 4; h++) {
      const bin = binOf(hz * h);
      for (let k = bin - 1; k <= bin + 1; k++) sum += magAt(k);
    }
    return sum;
  };

  /*
   * The reference has to be the spectrum's own floor, not another band.
   *
   * Comparing 50/60Hz against, say, 55Hz and its harmonics sounds reasonable
   * until one of those harmonics lands on the voice — 220Hz is a common
   * speaking pitch and the fourth harmonic of 55. Then the reference is huge,
   * the ratio collapses, and obvious hum is declared absent.
   *
   * The median magnitude across the low band cannot be fooled that way: a
   * handful of loud bins barely move a median, which is exactly the property
   * wanted here.
   */
  const low = [];
  for (let hz = 20; hz <= 500; hz += 5) low.push(magAt(binOf(hz)));
  low.sort((a, b) => a - b);
  const floorLevel = low[Math.floor(low.length / 2)] || 1e-9;

  const fifty = energyAt(50);
  const sixty = energyAt(60);
  const best = fifty > sixty ? 50 : 60;
  // 12 harmonic-bins' worth of median floor is what "no hum" looks like.
  const strength = Math.max(fifty, sixty) / (floorLevel * 12 + 1e-9);
  return { frequency: best, present: strength > 3, strength: Number(strength.toFixed(2)) };
}

/** Biquad notch, applied in both directions so it adds no phase shift. */
export function removeHum(channel, sampleRate, frequency, { harmonics = 4, q = 30 } = {}) {
  let signal = channel;
  for (let h = 1; h <= harmonics; h++) {
    const hz = frequency * h;
    if (hz >= sampleRate / 2) break;
    signal = notch(signal, sampleRate, hz, q);
    signal = reverse(notch(reverse(signal), sampleRate, hz, q));
  }
  return signal;
}

function notch(input, sampleRate, hz, q) {
  const w0 = (2 * Math.PI * hz) / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const b0 = 1, b1 = -2 * Math.cos(w0), b2 = 1;
  const a0 = 1 + alpha, a1 = -2 * Math.cos(w0), a2 = 1 - alpha;
  const out = new Float32Array(input.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x0 = input[i];
    const y0 = (b0 / a0) * x0 + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    out[i] = y0;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
  }
  return out;
}

function reverse(input) {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = input[input.length - 1 - i];
  return out;
}

/* ------------------------------------------------------------------ */
/* de-click                                                            */
/* ------------------------------------------------------------------ */

/**
 * Find and repair clicks.
 *
 * A click is a sample whose second derivative dwarfs the local average — a
 * step the signal had no business taking. Repair is cubic interpolation across
 * the damaged span, which is inaudible; muting leaves a hole you can hear.
 */
export function deClick(channel, { sensitivity = 1 } = {}) {
  const out = Float32Array.from(channel);
  const n = out.length;
  if (n < 8) return out;

  const window = 256;
  let repaired = 0;

  for (let at = 1; at < n - 2; at++) {
    const d2 = Math.abs(out[at + 1] - 2 * out[at] + out[at - 1]);
    if (d2 < 0.02) continue;

    // Local energy decides the bar: a loud passage legitimately contains big
    // jumps, and treating those as clicks destroys transients.
    let local = 0, count = 0;
    for (let k = Math.max(1, at - window); k < Math.min(n - 1, at + window); k += 4) {
      local += Math.abs(out[k + 1] - 2 * out[k] + out[k - 1]);
      count++;
    }
    const average = local / Math.max(1, count);
    if (d2 < average * 8 * sensitivity) continue;

    const from = Math.max(1, at - 1);
    const to = Math.min(n - 2, at + 2);
    const a = out[from - 1], b = out[to + 1];
    for (let k = from; k <= to; k++) {
      const f = (k - from + 1) / (to - from + 2);
      out[k] = a + (b - a) * f;
    }
    repaired++;
    at = to + 1;
  }
  return { data: out, repaired };
}

/* ------------------------------------------------------------------ */
/* levelling                                                           */
/* ------------------------------------------------------------------ */

/**
 * Even out the level.
 *
 * A slow RMS follower drives the gain, so quiet delivery comes up and loud
 * delivery comes down without the pumping a fast compressor gives you. A
 * limiter at the end catches whatever is left, because a levelled track that
 * clips is worse than an uneven one.
 */
export function levelAudio(channel, sampleRate, { target = 0.14, maxGain = 6, ceiling = 0.97 } = {}) {
  const out = new Float32Array(channel.length);
  const attack = Math.exp(-1 / (sampleRate * 0.05));    // 50ms
  const release = Math.exp(-1 / (sampleRate * 0.4));    // 400ms
  const gate = target * 0.06;                            // below this it is silence

  let envelope = 0;
  let gain = 1;
  for (let i = 0; i < channel.length; i++) {
    const level = Math.abs(channel[i]);
    const coeff = level > envelope ? attack : release;
    envelope = level + coeff * (envelope - level);

    // Silence is left alone. Lifting the gain during a pause is how automatic
    // levelling turns room tone into a roar.
    const wanted = envelope > gate ? Math.min(maxGain, target / (envelope + 1e-9)) : gain;
    gain += (wanted - gain) * 0.0006;
    out[i] = channel[i] * gain;
  }

  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > ceiling) {
    const scale = ceiling / peak;
    for (let i = 0; i < out.length; i++) out[i] *= scale;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* the whole chain                                                     */
/* ------------------------------------------------------------------ */

/**
 * Repair a buffer. Returns a new AudioBuffer and a plain-English report of
 * what was actually done, which matters — "noise reduction: on" tells someone
 * nothing, and "removed 60Hz hum and 41 clicks" tells them whether to trust it.
 */
export async function repair(buffer, options = {}) {
  const {
    noise = 0, hum = true, clicks = true, level = true,
    noiseRange = null, onProgress,
  } = options;

  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const out = new Ctx(buffer.numberOfChannels, buffer.length, buffer.sampleRate)
    .createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);

  const report = { noise: null, hum: null, clicks: 0, levelled: false };

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    let data = Float32Array.from(buffer.getChannelData(c));
    onProgress?.({ phase: 'analysing', channel: c });

    if (hum) {
      const found = detectHum(data, buffer.sampleRate);
      if (found.present) {
        data = removeHum(data, buffer.sampleRate, found.frequency);
        report.hum = found.frequency;
      }
    }

    if (noise > 0) {
      onProgress?.({ phase: 'reducing noise', channel: c });
      const learned = learnNoise(data, buffer.sampleRate, noiseRange || {});
      if (learned.frames) {
        data = reduceNoise(data, learned.profile, { amount: noise });
        report.noise = { amount: noise, learnedAt: Number(learned.at.toFixed(2)) };
      }
    }

    if (clicks) {
      onProgress?.({ phase: 'removing clicks', channel: c });
      const done = deClick(data);
      data = done.data;
      report.clicks += done.repaired;
    }

    if (level) {
      onProgress?.({ phase: 'levelling', channel: c });
      data = levelAudio(data, buffer.sampleRate);
      report.levelled = true;
    }

    out.copyToChannel(data, c);
    // Yield between channels so a stereo file does not lock the tab.
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 0));
  }

  return { buffer: out, report };
}

/** The report, in words someone can act on. */
export function describeRepair(report) {
  const bits = [];
  if (report.hum) bits.push(`removed ${report.hum}Hz mains hum`);
  if (report.noise) bits.push(`reduced background noise (learned from the quiet part at ${report.noise.learnedAt}s)`);
  if (report.clicks) bits.push(`repaired ${report.clicks} click${report.clicks === 1 ? '' : 's'}`);
  if (report.levelled) bits.push('evened out the level');
  if (!bits.length) return 'Nothing needed repairing — the audio was already clean.';
  return `${bits.join(', ').replace(/,([^,]*)$/, ' and$1')}.`;
}
