/*
 * Audio analysis: what the music is doing at any moment, as numbers.
 *
 * The audio-reactive half of motion design — a logo that breathes with the
 * bass, spectrum bars, a wiggle that gets bigger on the chorus — needs the
 * level of the sound at the frame being drawn, and the renderer draws frames
 * in any order: scrubbing backwards, exporting from the middle. So nothing
 * here listens to the audio as it plays. Each file is analysed once, into
 * arrays indexed by time, and a frame looks its moment up.
 *
 * Per sixtieth of a second: the overall level, three bands (low, mid, high)
 * and a 32-band spectrum from a 1024-point FFT under a Hann window. Every
 * curve is normalised so a quiet acoustic take and a mastered trap beat both
 * reach 1 on their loudest moments — an effect tuned on one file behaves the
 * same on the next. The analysis runs in slices with the page given a turn
 * between them, so a four-minute song does not freeze the editor while it is
 * read.
 */

import { decode } from './media.js';

export const RATE = 60;          // readings a second
export const BANDS = 32;         // spectrum bands, log-spaced 40 Hz .. 16 kHz
const N = 1024;                  // FFT size

const done = new Map();          // mediaId -> analysis
const pending = new Map();       // mediaId -> promise

/** The analysis for a media record, if it has already been made. */
export function analysisOf(media) { return media ? done.get(media.id) || null : null; }

/**
 * Analyse a media record's audio. Resolves to the analysis, or null when the
 * file has no sound. Idempotent: the second call for the same file returns
 * the same promise or the finished result.
 */
export function analyse(media) {
  if (!media) return Promise.resolve(null);
  const have = done.get(media.id);
  if (have) return Promise.resolve(have);
  if (pending.has(media.id)) return pending.get(media.id);
  const p = (async () => {
    try {
      const buffer = await decode(media);
      if (!buffer) { done.set(media.id, null); return null; }
      const out = await analyseBuffer(buffer);
      done.set(media.id, out);
      return out;
    } catch {
      done.set(media.id, null);
      return null;
    } finally {
      pending.delete(media.id);
    }
  })();
  pending.set(media.id, p);
  return p;
}

export function forget(mediaId) { done.delete(mediaId); pending.delete(mediaId); }

/* ------------------------------------------------------------------ */
/* the maths                                                           */
/* ------------------------------------------------------------------ */

/* In-place radix-2 FFT on split real/imaginary arrays. */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = i + j + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

const HANN = (() => { const w = new Float32Array(N); for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)); return w; })();

/* Bin ranges for the 32 bands, log-spaced from 40 Hz to 16 kHz. */
function bandEdges(sampleRate) {
  const edges = [];
  const lo = 40, hi = Math.min(16000, sampleRate / 2 - 1);
  for (let b = 0; b <= BANDS; b++) {
    const f = lo * (hi / lo) ** (b / BANDS);
    edges.push(Math.max(1, Math.min(N / 2 - 1, Math.round((f / sampleRate) * N))));
  }
  return edges;
}

async function analyseBuffer(buffer) {
  const sr = buffer.sampleRate;
  const ch = buffer.numberOfChannels;
  const len = buffer.length;
  // Mono mix, once.
  const mono = new Float32Array(len);
  for (let c = 0; c < ch; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += d[i] / ch;
  }
  const hop = sr / RATE;
  const frames = Math.max(1, Math.floor(len / hop));
  const amp = new Float32Array(frames);
  const low = new Float32Array(frames);
  const mid = new Float32Array(frames);
  const high = new Float32Array(frames);
  const spectrum = new Float32Array(frames * BANDS);
  const edges = bandEdges(sr);
  const re = new Float32Array(N), im = new Float32Array(N);
  const lowEnd = Math.round((250 / sr) * N), midEnd = Math.round((3000 / sr) * N);

  const SLICE = 240;   // frames per turn of the event loop — about four seconds of audio
  for (let f = 0; f < frames; f++) {
    const start = Math.floor(f * hop) - N / 2;
    let sq = 0;
    for (let i = 0; i < N; i++) {
      const x = start + i >= 0 && start + i < len ? mono[start + i] : 0;
      re[i] = x * HANN[i]; im[i] = 0;
      sq += x * x;
    }
    amp[f] = Math.sqrt(sq / N);
    fft(re, im);
    let l = 0, m = 0, h = 0;
    for (let k = 1; k < N / 2; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      if (k < lowEnd) l += p; else if (k < midEnd) m += p; else h += p;
    }
    low[f] = Math.sqrt(l); mid[f] = Math.sqrt(m); high[f] = Math.sqrt(h);
    for (let b = 0; b < BANDS; b++) {
      let s = 0, n = 0;
      for (let k = edges[b]; k < Math.max(edges[b] + 1, edges[b + 1]); k++) { s += re[k] * re[k] + im[k] * im[k]; n++; }
      spectrum[f * BANDS + b] = Math.sqrt(s / Math.max(1, n));
    }
    if (f % SLICE === SLICE - 1) {
      // eslint-disable-next-line no-await-in-loop -- the point is to yield
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  normalise(amp); normalise(low); normalise(mid); normalise(high);
  normaliseSpectrum(spectrum, frames);
  return { rate: RATE, frames, duration: frames / RATE, amp, low, mid, high, spectrum };
}

/* Scale so the 98th percentile sits at 1: one stray click cannot squash the whole curve. */
function normalise(arr) {
  const sorted = Float32Array.from(arr).sort();
  const ref = sorted[Math.floor(sorted.length * 0.98)] || sorted[sorted.length - 1] || 0;
  if (ref <= 0) return;
  for (let i = 0; i < arr.length; i++) arr[i] = Math.min(1, arr[i] / ref);
}

/* Each band to its own loudest moments, with a little log shaping, so the
   treble bands — always far quieter in absolute terms — still move. */
function normaliseSpectrum(spec, frames) {
  for (let b = 0; b < BANDS; b++) {
    const col = new Float32Array(frames);
    for (let f = 0; f < frames; f++) col[f] = spec[f * BANDS + b];
    const sorted = Float32Array.from(col).sort();
    const ref = sorted[Math.floor(frames * 0.98)] || sorted[frames - 1] || 0;
    if (ref <= 0) continue;
    for (let f = 0; f < frames; f++) {
      const v = Math.min(1, spec[f * BANDS + b] / ref);
      spec[f * BANDS + b] = Math.log1p(v * 6) / Math.log1p(6);
    }
  }
}

/* ------------------------------------------------------------------ */
/* reading                                                             */
/* ------------------------------------------------------------------ */

/**
 * The level of a band at source time `t`, averaged over `smooth` seconds
 * before it. `band`: 'all' | 'low' | 'mid' | 'high' | 0..31.
 */
export function levelAt(analysis, t, band = 'all', smooth = 0) {
  if (!analysis) return 0;
  const arr = band === 'low' ? analysis.low : band === 'mid' ? analysis.mid : band === 'high' ? analysis.high
    : typeof band === 'number' ? null : analysis.amp;
  const f = Math.floor(t * analysis.rate);
  const n = Math.max(1, Math.round(smooth * analysis.rate));
  let sum = 0, count = 0;
  for (let i = f - n + 1; i <= f; i++) {
    if (i < 0 || i >= analysis.frames) continue;
    sum += arr ? arr[i] : analysis.spectrum[i * BANDS + Math.max(0, Math.min(BANDS - 1, Math.floor(band)))];
    count++;
  }
  return count ? sum / count : 0;
}

/** The 32-band spectrum at source time `t`, as a fresh Float32Array of 0..1. */
export function spectrumAt(analysis, t, out = new Float32Array(BANDS)) {
  out.fill(0);
  if (!analysis) return out;
  const f = Math.floor(t * analysis.rate);
  if (f < 0 || f >= analysis.frames) return out;
  for (let b = 0; b < BANDS; b++) out[b] = analysis.spectrum[f * BANDS + b];
  return out;
}

/** A stretch of the waveform around source time `t`: `n` readings of level, centred. */
export function waveAround(analysis, t, seconds = 1, n = 128, out = new Float32Array(n)) {
  out.fill(0);
  if (!analysis) return out;
  const from = t - seconds / 2;
  for (let i = 0; i < n; i++) {
    const f = Math.floor((from + (i / n) * seconds) * analysis.rate);
    out[i] = f >= 0 && f < analysis.frames ? analysis.amp[f] : 0;
  }
  return out;
}
