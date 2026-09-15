/*
 * How loud something actually is, in the units the platforms use.
 *
 * Peak metering answers "will it clip", which the meters already do. It does
 * not answer "will YouTube turn this down", and that is the question that
 * decides whether an edit sounds as intended once it is posted. Every platform
 * normalises to a loudness target now and quietly attenuates anything above
 * it — so a mix mastered loud does not play loud, it plays turned down, with
 * the dynamics squashed for nothing.
 *
 * This is ITU-R BS.1770-4, which is what all of them measure with: K-weighted
 * mean square, in 400ms blocks overlapping by 75%, gated twice — an absolute
 * gate at -70 LUFS to drop silence, then a relative gate 10 LU below the
 * ungated mean to drop the quiet parts that would otherwise drag a dialogue
 * mix down. The gating is the part people leave out, and leaving it out
 * reports a number two or three LU low on anything with pauses in it.
 */

/* Where the platforms normalise to, as published. Anything louder than the
   target is turned down by the difference; quieter is usually left alone. */
export const TARGETS = [
  { id: 'youtube', name: 'YouTube', lufs: -14, peak: -1,
    note: 'Also what Spotify, Amazon and Deezer use.' },
  { id: 'tiktok', name: 'TikTok & Reels', lufs: -14, peak: -1,
    note: 'Short-form platforms sit around the same place.' },
  { id: 'apple', name: 'Apple Podcasts', lufs: -16, peak: -1,
    note: 'Spoken word, where a little more range is expected.' },
  { id: 'broadcast', name: 'Broadcast (EBU R128)', lufs: -23, peak: -1,
    note: 'European television. Much quieter than anything online.' },
  { id: 'atsc', name: 'Broadcast (ATSC A/85)', lufs: -24, peak: -2,
    note: 'North American television.' },
];

export function targetById(id) { return TARGETS.find((t) => t.id === id) || TARGETS[0]; }

/* ------------------------------------------------------------------ */
/* K-weighting                                                         */
/* ------------------------------------------------------------------ */

/*
 * Two filters, in this order: a high shelf standing in for the acoustic effect
 * of a head, then a high-pass. The coefficients in the standard are given at
 * 48kHz; at any other rate they have to be redesigned, not reused, or the
 * weighting is wrong by a decibel or more at the top end.
 */
function shelfCoeffs(rate) {
  const f0 = 1681.974450955533;
  const G = 3.999843853973347;
  const Q = 0.7071752369554196;
  const K = Math.tan((Math.PI * f0) / rate);
  const vh = 10 ** (G / 20);
  const vb = vh ** 0.4996667741545416;
  const a0 = 1 + K / Q + K * K;
  return {
    b: [(vh + (vb * K) / Q + K * K) / a0, (2 * (K * K - vh)) / a0, (vh - (vb * K) / Q + K * K) / a0],
    a: [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0],
  };
}

function highpassCoeffs(rate) {
  const f0 = 38.13547087602444;
  const Q = 0.5003270373238773;
  const K = Math.tan((Math.PI * f0) / rate);
  return {
    b: [1, -2, 1],
    a: [1, (2 * (K * K - 1)) / (1 + K / Q + K * K), (1 - K / Q + K * K) / (1 + K / Q + K * K)],
  };
}

function biquad(samples, { b, a }) {
  const out = new Float32Array(samples.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x0 = samples[i];
    const y0 = b[0] * x0 + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    out[i] = y0;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
  }
  return out;
}

/* The weight each channel carries in the sum. Left and right count equally;
   the surround channels count for more, which is why the standard lists them
   separately. Stereo is all this app produces, so both are 1. */
const CHANNEL_WEIGHT = [1, 1, 1, 1.41, 1.41];

/* ------------------------------------------------------------------ */
/* the measurement                                                     */
/* ------------------------------------------------------------------ */

/**
 * Integrated loudness of an AudioBuffer, in LUFS.
 *
 * Returns -Infinity for silence rather than a very negative number, because
 * "there is nothing here" and "this is very quiet" want different answers from
 * the panel.
 */
export function integratedLufs(buffer) {
  const rate = buffer.sampleRate;
  const shelf = shelfCoeffs(rate);
  const hp = highpassCoeffs(rate);

  const blockLen = Math.round(rate * 0.4);
  const hopLen = Math.round(rate * 0.1);                 // 75% overlap
  if (buffer.length < blockLen) return -Infinity;

  const channels = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    channels.push(biquad(biquad(buffer.getChannelData(c), shelf), hp));
  }

  // Mean square per block, summed across channels with their weights.
  const blocks = [];
  for (let start = 0; start + blockLen <= buffer.length; start += hopLen) {
    let sum = 0;
    for (let c = 0; c < channels.length; c++) {
      const data = channels[c];
      let acc = 0;
      for (let i = start; i < start + blockLen; i++) acc += data[i] * data[i];
      sum += (CHANNEL_WEIGHT[c] ?? 1) * (acc / blockLen);
    }
    blocks.push(sum);
  }
  if (!blocks.length) return -Infinity;

  const loudnessOf = (ms) => (ms > 0 ? -0.691 + 10 * Math.log10(ms) : -Infinity);

  // Absolute gate: anything below -70 LUFS is silence, not quiet.
  const above = blocks.filter((ms) => loudnessOf(ms) > -70);
  if (!above.length) return -Infinity;

  // Relative gate: 10 LU below the mean of what survived the absolute gate.
  const meanAbs = above.reduce((s, v) => s + v, 0) / above.length;
  const relative = loudnessOf(meanAbs) - 10;
  const kept = above.filter((ms) => loudnessOf(ms) > relative);
  if (!kept.length) return loudnessOf(meanAbs);

  const mean = kept.reduce((s, v) => s + v, 0) / kept.length;
  return loudnessOf(mean);
}

/*
 * A band-limited interpolator for true peak.
 *
 * The first version interpolated linearly between neighbouring samples, which
 * cannot work and quietly reported the sample peak instead: linear
 * interpolation is monotonic between its endpoints, so it can never produce a
 * value larger than the larger of the two — and finding values larger than the
 * samples is the entire purpose.
 *
 * A windowed sinc does find them, because it reconstructs the waveform the
 * samples actually describe rather than joining them with straight lines. Four
 * phases, twelve taps each, Blackman-windowed: that is the smallest kernel
 * that gets within a couple of tenths of a decibel of the standard's filter,
 * and a couple of tenths is inside the margin the ceiling exists to provide.
 */
const TP_PHASES = 4;
const TP_TAPS = 12;
const TP_KERNEL = (() => {
  const k = [];
  for (let phase = 0; phase < TP_PHASES; phase++) {
    const frac = phase / TP_PHASES;
    const taps = new Float32Array(TP_TAPS);
    let sum = 0;
    for (let i = 0; i < TP_TAPS; i++) {
      const x = i - TP_TAPS / 2 + 1 - frac;
      const sinc = Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      // Blackman, over the whole kernel rather than per tap.
      const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (TP_TAPS - 1))
              + 0.08 * Math.cos((4 * Math.PI * i) / (TP_TAPS - 1));
      taps[i] = sinc * w;
      sum += taps[i];
    }
    // Normalised so a constant signal comes back unchanged rather than scaled.
    if (Math.abs(sum) > 1e-9) for (let i = 0; i < TP_TAPS; i++) taps[i] /= sum;
    k.push(taps);
  }
  return k;
})();

/**
 * True peak, in dBTP.
 *
 * Sample peak is not the same thing: a waveform can pass between two samples
 * higher than either of them, and a converter reconstructing it will clip
 * where the file did not. This is why a delivery ceiling is quoted in dBTP and
 * set below zero — the headroom is for the peaks that are not in the file.
 */
export function truePeakDb(buffer) {
  let peak = 0;
  const half = TP_TAPS / 2;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const v = Math.abs(d[i]);
      if (v > peak) peak = v;
    }
    // The interpolated positions between every pair of samples.
    for (let i = 0; i < d.length; i++) {
      for (let phase = 1; phase < TP_PHASES; phase++) {
        const taps = TP_KERNEL[phase];
        let acc = 0;
        for (let k = 0; k < TP_TAPS; k++) {
          /*
           * Held at the edges, not zero-padded.
           *
           * Zero-padding invents a step from silence to whatever the first
           * sample is, and a sinc rings at a step — a block of solid full
           * scale measured 0.95dB *over* full scale, all of it manufactured
           * at the two ends by the padding. Repeating the edge sample has no
           * discontinuity to ring at.
           */
          let idx = i + k - half + 1;
          if (idx < 0) idx = 0;
          else if (idx >= d.length) idx = d.length - 1;
          acc += d[idx] * taps[k];
        }
        const v = Math.abs(acc);
        if (v > peak) peak = v;
      }
    }
  }
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

/**
 * What to do about it: the gain that hits the target without breaking the
 * ceiling, and an honest word about whether both can be had at once.
 */
export function normalisationFor(buffer, target) {
  const lufs = integratedLufs(buffer);
  const peak = truePeakDb(buffer);
  if (!Number.isFinite(lufs)) {
    return { lufs, peak, gainDb: 0, limited: false, silent: true };
  }
  const wanted = target.lufs - lufs;
  /*
   * The ceiling wins when the two disagree.
   *
   * Turning a quiet mix up to -14 can push its peaks past 0dBTP, and a clipped
   * delivery is worse than a quiet one — the platform would only turn it down
   * again anyway, leaving the distortion behind. So the gain stops at whatever
   * the ceiling allows and the panel says it did.
   */
  const headroom = target.peak - peak;
  const gainDb = Math.min(wanted, headroom);
  return {
    lufs, peak, gainDb,
    limited: gainDb < wanted - 0.05,
    shortfall: Math.max(0, wanted - gainDb),
    silent: false,
  };
}

/** A number for the panel: "-18.3 LUFS", or "silent". */
export function formatLufs(v) {
  return Number.isFinite(v) ? `${v.toFixed(1)} LUFS` : 'silent';
}
