/*
 * The sound of one TikTok cut: the tutorial's instruments and chords at 120
 * BPM, a four-on-the-floor groove from the first frame (TikTok gives a video
 * about a second), and every hit, whoosh, key and click where the picture
 * puts it. Keys and clicks come from the tutorial's own timeline, moved to
 * wherever this cut plays that moment and at the speed it plays it.
 */
import * as T from './timeline.js';
import { SHORTS, BEAT } from './shorts.js';
import { createSynth } from './synth.js';

const SR = 48000;
const BAR = BEAT * 4;
const CHORDS = [
  [38, [50, 53, 57, 60, 64], [62, 65, 69, 72]],
  [34, [46, 50, 53, 57, 60], [58, 62, 65, 69]],
  [41, [53, 57, 60, 64, 67], [65, 69, 72, 76]],
  [36, [48, 55, 60, 62, 64], [60, 64, 67, 72]],
];

export async function renderShortScore(id) {
  const S = SHORTS.find((s) => s.id === id);
  const ctx = new OfflineAudioContext(2, Math.ceil((S.dur + 0.25) * SR), SR);
  let seed = 7; for (const ch of id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = T.rng(seed);
  const $ = createSynth(ctx, rnd, BEAT);
  const hum = () => (rnd() - 0.5) * 0.006;
  const bars = Math.round(S.dur / BAR);

  // ---- music
  for (let b = 0; b < bars; b++) {
    const t = b * BAR, last = b === bars - 1, [root, voicing, arp] = CHORDS[b % 4];
    $.pad(t, voicing, BAR, last ? 1.1 : 0.85, last ? 1300 : 1700, b === 0 ? 0.03 : 0.1);
    if (last) {
      // The last bar breathes: one kick, the pad, a falling line on the bell that leads back into the first frame.
      $.kick(t, 0.9); $.sub(t, root + 12, BAR, 0.7);
      [arp[3] + 12, arp[2] + 12, arp[1] + 12, arp[0] + 12].forEach((m, i) => $.bell(t + i * BEAT, m, 0.6, (i - 1.5) * 0.3, 1.2));
      continue;
    }
    for (let s = 0; s < 16; s++) {
      const st = Math.max(0, t + s * (BEAT / 4) + (s % 2 ? (BEAT / 4) * 0.1 : 0) + hum());
      if (s % 4 === 0) $.kick(st, s === 0 ? 1 : 0.9);
      if (s === 4 || s === 12) $.snare(st, 0.9);
      if (s % 4 === 2) $.hat(st, 0.95, true, 0.18);
      else $.hat(st, s % 2 ? 0.4 : 0.55, false, -0.15);
      if (s % 4 === 2) $.bassNote(st, root + (s === 14 && b % 2 ? 12 : 0), BEAT * 0.45, 1.05, 600);
    }
    const seq = [0, 2, 1, 3, 2, 1, 3, 2];
    [0, 3, 6, 8, 11, 14].forEach((s, i) => $.pluck(Math.max(0, t + s * (BEAT / 4) + hum()), arp[seq[(i + b) % seq.length]] + 12, 0.6, ((i % 3) - 1) * 0.3, 0.4));
    if (b % 4 === 3) for (let k = 0; k < 4; k++) $.snare(t + BAR - BEAT + k * (BEAT / 4), 0.22 + k * 0.1);
  }

  // ---- the edit's own hits
  $.impact(0, 0.7);
  for (const p of S.punches || []) $.impact(p, 0.4);
  for (const w of S.whips || []) $.whoosh(w.t - 0.2, 0.46, w.dir > 0 ? -0.6 : 0.6, w.dir > 0 ? 0.6 : -0.6, 1);
  for (const k of S.keys || []) k.keys.forEach((_, j) => $.key(k.t + 0.2 + j * 0.25, true, -0.05));
  for (const bx of S.boxes || []) $.blip(bx.a + 0.05, 86, 0.8);
  for (const c of S.cards || []) {
    if (c.type === 'count') {
      $.riser(Math.max(0.1, c.a - 1.4), c.a, 0.7); $.impact(c.a, 0.8);
      for (let i = 0; i < 16; i++) { const p = i / 15; $.blip(c.a + 0.35 + (1 - Math.pow(1 - p, 3)) * 0.92, 90 - i * 0.5, 0.5); }
      $.bell(c.a + 1.35, 81, 0.7, 0, 1.6);
    }
    if (c.type === 'list') c.items.forEach((_, i) => { const t0 = c.a + i * c.per; $.pop(t0, 1); $.snare(t0 + c.per / 2, 0.55); $.blip(t0 + c.per / 2 + 0.02, 79 + (i % 4) * 2, 0.8); });
    if (c.type === 'ram') { $.pop(c.a, 1); $.blip(c.a + 1.0, 84, 0.7); $.blip(c.a + 1.7, 72, 0.9); }
    if (c.type === 'cmd') { $.pop(c.a, 1); c.lines.forEach((_, j) => { for (let k = 0; k < 6; k++) $.key(c.a + 0.25 + j * 0.3 + k * 0.07, false, 0.05); }); }
    if (c.type === 'code') $.whoosh(c.a, 0.5, -0.2, 0.2, 0.6);
    if (c.type === 'games') c.games.forEach((_, j) => $.pop(c.a + 0.1 + j * 0.5, 1));
    if (c.type === 'names') c.names.forEach((_, j) => { $.pop(c.a + j * 0.25, 0.9); $.blip(c.a + j * 0.25 + 0.2, 70, 0.4); });
    if (c.type === 'end') { $.impact(c.a, 0.5); [74, 77, 81].forEach((m, i) => $.bell(c.a + 0.2 + i * 0.08, m, 0.6, (i - 1) * 0.3, 1.8)); }
  }

  // ---- the tutorial's own sounds, wherever this cut plays that moment
  const place = (e) => {
    const out = [];
    for (const sh of S.shots) {
      if (typeof sh.src === 'number') continue;
      const [from, speed] = sh.src, s1 = from + (sh.b - sh.a) * speed;
      if (e >= from && e < s1) out.push(sh.a + (e - from) / speed);
    }
    return out;
  };
  const each = (list, fn) => list.forEach((e, i) => place(e).forEach((t) => fn(t, i)));
  each(T.SEARCH_KEYS.map((k) => k.t), (t) => $.key(t, false));
  each(T.COMMAND_KEYS.map((k) => k.t), (t, i) => $.key(t, T.COMMAND_KEYS[i].ch === ' '));
  each([T.CUE.enter], (t) => $.key(t, true, 0.05));
  each([T.CUE.keyPaste - 0.13, T.CUE.keyPaste], (t) => $.key(t, false, -0.1));
  each(T.CLICKS, (t) => $.mouse(t));
  const pent = [62, 65, 67, 69, 72, 74, 77, 79, 81, 84];
  each(T.TICKS, (t, i) => $.blip(t, pent[Math.min(pent.length - 1, Math.floor((i / T.TICKS.length) * pent.length))], 0.8));
  each(T.FLIPS.map((f) => f.t), (t, i) => { $.pluck(t, [79, 81, 84, 86][i], 0.9, 0.2, 0.5); $.blip(t + 0.12, 91, 0.35); });
  each(T.CHECKS, (t, i) => $.bell(t + 0.06, [74, 77, 81, 84, 86][i], 0.55, (i - 2) * 0.2, 1.2));
  each([T.CUE.termOpen, T.CUE.elevated, T.CUE.step3], (t) => $.pop(t, 0.9));
  each([T.CUE.verified + 0.4], (t) => $.bell(t, 74, 0.55, 0.2, 1.4));

  // A few milliseconds of fade so the loop has no click.
  $.master.gain.setValueAtTime(0.9, S.dur - 0.06); $.master.gain.linearRampToValueAtTime(0, S.dur);
  const buf = await ctx.startRendering();
  return wav(buf, Math.round(S.dur * SR));
}

function wav(buf, n) {
  const ch = [buf.getChannelData(0), buf.getChannelData(1)];
  let peak = 0; for (const c of ch) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(c[i]));
  const gain = peak > 0 ? 0.89 / peak : 1;
  const out = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
  out.setUint32(24, SR, true); out.setUint32(28, SR * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * 4, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (const c of ch) { const v = Math.max(-1, Math.min(1, c[i] * gain)); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  return out.buffer;
}
