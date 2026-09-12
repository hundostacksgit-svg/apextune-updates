/*
 * Speed ramps.
 *
 * A ramp is the shape of a clip's speed over its length: fast into a moment,
 * slow through it, fast out. The model already carries one — `speedKeys`,
 * a list of { t, v } in clip-local seconds that sourceTime() integrates — so
 * a ramp preset is only a shape that produces those keys for a given length.
 *
 * Shapes are written in fractions of the clip, not seconds, so "Velocity" on
 * a two-second shot and on a ten-second shot is the same gesture at a
 * different size. That is also what makes them safe to apply before the
 * length is final: re-applying after a trim reshapes the ramp to fit.
 *
 * Every shape is checked at load: its first key at 0, its last at 1, every
 * speed positive and finite. A key at 1.2 would leave the tail of the clip
 * on the last speed with nothing to say so; a speed of 0 would be the freeze
 * that project.js explains at length is a trap.
 */

import { speedAt } from './project.js';

const K = (t, v) => ({ t, v });

export const SPEED_RAMPS = [
  { id: 'velocity', name: 'Velocity', group: 'Ramps', emoji: '🌀', tier: 'creator',
    blurb: 'Fast in, slow through the moment, fast out. The velocity edit.',
    shape: [K(0, 2.4), K(0.32, 0.35), K(0.62, 0.35), K(1, 2.4)] },
  { id: 'slowmo-hit', name: 'Slow-mo hit', group: 'Ramps', emoji: '🎯', tier: 'creator',
    blurb: 'Normal, then time stops on the hit, then normal again.',
    shape: [K(0, 1), K(0.4, 1), K(0.5, 0.22), K(0.78, 0.22), K(0.9, 1), K(1, 1)] },
  { id: 'bullet-time', name: 'Bullet time', group: 'Ramps', emoji: '🔫', tier: 'creator',
    blurb: 'Almost frozen in the middle, everything else at speed.',
    shape: [K(0, 1.6), K(0.42, 0.12), K(0.58, 0.12), K(1, 1.6)] },
  { id: 'punch', name: 'Punch', group: 'Ramps', emoji: '👊', tier: 'creator',
    blurb: 'A quick shove faster and back. Cuts feel like they hit.',
    shape: [K(0, 1), K(0.1, 3), K(0.3, 1), K(1, 1)] },
  { id: 'kickback', name: 'Kickback', group: 'Ramps', emoji: '🏎', tier: 'creator',
    blurb: 'Starts slow and takes off.',
    shape: [K(0, 0.4), K(0.6, 0.4), K(1, 2.6)] },
  { id: 'land', name: 'Land', group: 'Ramps', emoji: '🛬', tier: 'creator',
    blurb: 'Comes in fast and settles to normal.',
    shape: [K(0, 2.6), K(0.4, 1), K(1, 1)] },
  { id: 'ease-in', name: 'Ease in', group: 'Ramps', emoji: '↗', tier: 'free',
    blurb: 'Slow motion that gently returns to real time.',
    shape: [K(0, 0.35), K(1, 1)] },
  { id: 'ease-out', name: 'Ease out', group: 'Ramps', emoji: '↘', tier: 'free',
    blurb: 'Real time that gently slows to a crawl.',
    shape: [K(0, 1), K(1, 0.3)] },
  { id: 'dip', name: 'Dip', group: 'Ramps', emoji: '〰', tier: 'free',
    blurb: 'A gentle slow-down in the middle. Subtle, cinematic.',
    shape: [K(0, 1), K(0.5, 0.55), K(1, 1)] },
  { id: 'double-tap', name: 'Double tap', group: 'Ramps', emoji: '✌️', tier: 'creator',
    blurb: 'Two slow moments in one shot.',
    shape: [K(0, 1.4), K(0.22, 0.3), K(0.34, 1.4), K(0.66, 1.4), K(0.78, 0.3), K(1, 1.4)] },
  { id: 'stutter', name: 'Stutter', group: 'Ramps', emoji: '⚡', tier: 'creator',
    blurb: 'Fast-slow-fast-slow. The glitch-edit rhythm.',
    shape: [K(0, 3), K(0.125, 0.4), K(0.25, 3), K(0.375, 0.4), K(0.5, 3), K(0.625, 0.4), K(0.75, 3), K(0.875, 0.4), K(1, 3)] },
  { id: 'timelapse', name: 'Timelapse', group: 'Ramps', emoji: '⏩', tier: 'free',
    blurb: 'Accelerates all the way to four times.',
    shape: [K(0, 1), K(1, 4)] },
  { id: 'hyper', name: 'Hyperlapse', group: 'Ramps', emoji: '🚀', tier: 'creator',
    blurb: 'Fast throughout, faster in the middle.',
    shape: [K(0, 2), K(0.5, 4), K(1, 2)] },
  { id: 'reveal', name: 'Reveal', group: 'Ramps', emoji: '🎬', tier: 'free',
    blurb: 'Opens in slow motion, then plays out at speed.',
    shape: [K(0, 0.25), K(0.3, 0.25), K(0.45, 1), K(1, 1)] },
  { id: 'freeze-go', name: 'Hold and go', group: 'Ramps', emoji: '⏯', tier: 'creator',
    blurb: 'Nearly still for a beat, then off.',
    shape: [K(0, 0.08), K(0.25, 0.08), K(0.35, 1.2), K(1, 1.2)] },
  { id: 'heartbeat', name: 'Heartbeat', group: 'Ramps', emoji: '💓', tier: 'creator',
    blurb: 'Two quick pulses of speed, like a beat.',
    shape: [K(0, 1), K(0.15, 2.4), K(0.25, 1), K(0.4, 2.4), K(0.5, 1), K(1, 1)] },
];

export const RAMP_BY_ID = Object.fromEntries(SPEED_RAMPS.map((r) => [r.id, r]));

/** Keys for this ramp on a clip of this length. */
export function rampKeys(id, dur) {
  const ramp = RAMP_BY_ID[id];
  if (!ramp) return null;
  return ramp.shape.map((k) => ({ t: Number((k.t * dur).toFixed(4)), v: k.v }));
}

/** Source seconds a set of keys would consume across `dur`. */
function needed(keys, dur, samples = 96) {
  const clip = { speedKeys: keys, speed: 1 };
  const step = dur / samples;
  let acc = 0;
  for (let i = 0; i < samples; i++) acc += speedAt(clip, step * (i + 0.5)) * step;
  return acc;
}

/**
 * Put a ramp on a clip.
 *
 * A ramp that averages above 1× eats more source than the clip's length, and
 * a clip that runs past the end of its file shows its last frame held — which
 * reads as a freeze nobody asked for. So when the file cannot cover the ramp,
 * the clip is shortened to what the file can cover, with the ramp reshaped to
 * the new length. Returns what was done so the panel can say so.
 */
export function applyRamp(clip, id, { available = Infinity } = {}) {
  const ramp = RAMP_BY_ID[id];
  if (!ramp || !clip) return null;
  let dur = clip.dur;
  let keys = rampKeys(id, dur);
  let need = needed(keys, dur);
  let shortened = false;
  if (Number.isFinite(available) && need > available && need > 0) {
    dur = Math.max(0.2, dur * (available / need) * 0.995);
    keys = rampKeys(id, dur);
    need = needed(keys, dur);
    shortened = true;
  }
  clip.speed = 1;
  clip.frozen = false;
  clip.speedKeys = keys;
  clip.rampId = id;
  clip.dur = dur;
  return { dur, need, shortened };
}

/** Take a ramp off, back to a flat 1×. */
export function clearRamp(clip) {
  if (!clip) return;
  clip.speedKeys = null;
  clip.rampId = null;
  clip.speed = 1;
}

/** The curve, sampled, for drawing. Values are speeds; `max` for scaling. */
export function rampCurve(clip, samples = 64) {
  const out = [];
  const dur = clip?.dur || 1;
  for (let i = 0; i < samples; i++) out.push(speedAt(clip, (i / (samples - 1)) * dur));
  return { points: out, max: Math.max(1, ...out), min: Math.min(1, ...out) };
}

/** One line for the clip badge: "Velocity · 0.35× to 2.4×". */
export function describeRamp(clip) {
  if (!clip?.speedKeys?.length) return '';
  const vs = clip.speedKeys.map((k) => k.v);
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const name = RAMP_BY_ID[clip.rampId]?.name || 'Custom ramp';
  return lo === hi ? `${name} · ${lo.toFixed(2)}×` : `${name} · ${lo.toFixed(2)}× to ${hi.toFixed(2)}×`;
}

/* ------------------------------------------------------------------ */
/* validation                                                          */
/* ------------------------------------------------------------------ */

export const RAMP_PROBLEMS = [];
for (const r of SPEED_RAMPS) {
  const s = r.shape;
  if (!s?.length || s[0].t !== 0 || s.at(-1).t !== 1) RAMP_PROBLEMS.push(`${r.id}: shape must run from 0 to 1`);
  for (let i = 1; i < (s?.length || 0); i++) if (s[i].t < s[i - 1].t) RAMP_PROBLEMS.push(`${r.id}: keys out of order at ${i}`);
  for (const k of s || []) if (!(k.v > 0) || !Number.isFinite(k.v) || k.v > 16) RAMP_PROBLEMS.push(`${r.id}: bad speed ${k.v}`);
}
if (RAMP_PROBLEMS.length) {
  // eslint-disable-next-line no-console -- a build-time mistake shipped to runtime
  console.warn(`[speed-ramps] ${RAMP_PROBLEMS.length} problem(s):\n  ${RAMP_PROBLEMS.join('\n  ')}`);
}
