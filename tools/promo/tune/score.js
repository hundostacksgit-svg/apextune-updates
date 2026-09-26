/*
 * The tutorial's sound: an original score and the room's own noises, rendered
 * offline at 48 kHz from the same timeline as the picture.
 *
 * The score is in D minor at 100 BPM (Dm9, Bbmaj9, Fmaj9, Cadd9, a bar each).
 * It arrives with the desktop, drops out when Windows asks for rights, comes
 * back when the app opens, lifts when the run starts, stops for the result,
 * and ends on the major chord under the address. Keys, clicks, whooshes and
 * hits sit where the picture puts them.
 *
 * Nothing sampled, nothing licensed: every sound is made here.
 */
import * as T from './timeline.js';
import { createSynth } from './synth.js';

const { CUE, BAR, BEAT } = T;
const SR = 48000;

// D minor, a bar per chord: [bass root, pad voicing, arp tones]
const CHORDS = {
  Dm: [38, [50, 53, 57, 60, 64], [62, 65, 69, 72]],
  Bb: [34, [46, 50, 53, 57, 60], [58, 62, 65, 69]],
  F: [41, [53, 57, 60, 64, 67], [65, 69, 72, 76]],
  C: [36, [48, 55, 60, 62, 64], [60, 64, 67, 72]],
};
const PROG = ['Dm', 'Bb', 'F', 'C'];
const chordAt = (bar) => CHORDS[PROG[bar % 4]];
const BARS = Math.ceil(T.DURATION / BAR);

// What plays in each bar. a = the light groove, b = the full one, br = break, half = half-time.
function section(bar) {
  if (bar <= 1) return 'intro';
  if (bar <= 3) return 'title';
  if (bar <= 8) return 'a';
  if (bar === 9) return 'br';
  if (bar === 10) return 'half';
  if (bar <= 14) return 'a';
  if (bar <= 18) return 'b';
  if (bar === 19) return 'done';
  if (bar === 20) return 'filt';
  if (bar <= 24) return 'b';
  if (bar <= 26) return 'a';
  return 'outro';
}

export async function renderScore() {
  const ctx = new OfflineAudioContext(2, Math.ceil((T.DURATION + 0.5) * SR), SR);
  const rnd = T.rng(4242);

  // ---- buses: music (ducked by the kick), sfx, reverb, delay, master
  const { master, music, duck, drums, sfx, verbIn, dIn, noiseSrc, pan, env, kick, snare, hat, bassNote, pad, pluck, bell, sub, riser, reverseSwell, impact, whoosh, pop, key, mouse, blip } = createSynth(ctx, rnd, BEAT);
  // ---- the arrangement, bar by bar
  const hum = () => (rnd() - 0.5) * 0.008;
  for (let b = 0; b < BARS; b++) {
    const t = b * BAR, sec = section(b), [root, voicing, arp] = chordAt(b), next = section(b + 1);
    if (t > T.DURATION) break;
    // Pads everywhere, darker in the intro and the break.
    const cutoff = { intro: 700, title: 1000, br: 650, half: 900, filt: 800, done: 1600, outro: 1500 }[sec] || 1300;
    const pv = { intro: 0.8, title: 1, br: 0.85, outro: 1.15, done: 1.2 }[sec] || 0.9;
    if (b < BARS - 1) pad(t, voicing, BAR, pv, cutoff, b === 0 ? 1.8 : 0.12);
    else pad(t, voicing, T.DURATION - t - 1.2, 1.1, 1200, 0.3);
    if (sec === 'intro' || sec === 'title' || sec === 'outro' || sec === 'br') sub(t, root + 12, BAR + 0.3, sec === 'br' ? 0.6 : 0.8);

    // Drums
    const groove = sec === 'a' || sec === 'b' || sec === 'filt' || sec === 'half';
    if (groove) {
      for (let s = 0; s < 16; s++) {
        const st = t + s * (BEAT / 4) + (s % 2 ? BEAT / 4 * 0.12 : 0) + hum();
        const beat = s / 4;
        if (sec === 'half') { if (s === 0 || s === 10) kick(st, 0.85); if (s % 2 === 0) hat(st, s % 4 === 2 ? 1 : 0.55); continue; }
        if (s === 0 || s === 8 || (s === 10 && sec === 'b') || (s === 6 && b % 2 === 1)) kick(st, s === 0 ? 1 : 0.85);
        if (sec !== 'filt' && (s === 4 || s === 12)) snare(st, 1);
        if (s % 2 === 0) hat(st, beat % 1 === 0.5 ? 1 : 0.6, false, 0.22);
        else if (sec === 'b') hat(st, 0.35, false, -0.18);
        if (sec === 'b' && s === 14) hat(st, 0.8, true, 0.25);
      }
    }
    if (sec === 'done') {
      // Drums play the first beat, then a fill that stops dead on Done's hit.
      kick(t, 1); hat(t + BEAT / 2, 0.8);
      for (let k = 0; k < 2; k++) snare(t + BEAT * 0.5 + k * BEAT / 8, 0.35 + k * 0.2);
    }

    // Bass
    if (groove || sec === 'done') {
      const pat = sec === 'half' ? [[0, 1.5], [2.5, 1]] : sec === 'done' ? [[0, 1]] : [[0, 0.75], [0.75, 0.5], [1.5, 0.4], [2, 0.75], [3, 0.4], [3.5, 0.4]];
      for (const [bt, len] of pat) bassNote(t + bt * BEAT + hum(), root + (bt === 3.5 ? 12 : 0), len * BEAT * 0.95, 1, sec === 'filt' ? 320 : 520);
    }
    // Arp in the full sections
    if (sec === 'b') {
      const seq = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 3, 1, 2];
      for (let s = 0; s < 16; s++) pluck(t + s * BEAT / 4 + hum(), arp[seq[s]] + (s >= 8 && b % 2 ? 12 : 0), s % 4 === 0 ? 1 : 0.7, ((s % 4) - 1.5) * 0.25, 0.45);
    }
    if (sec === 'a' && b % 2 === 1) for (let s = 0; s < 4; s++) pluck(t + (2 + s * 0.5) * BEAT, arp[3 - s], 0.55, 0.3, 0.6);
    // Drum fills into the next section
    if (groove && next !== sec && ['a', 'b'].includes(next)) for (let k = 0; k < 4; k++) snare(t + BAR - BEAT + k * BEAT / 4, 0.25 + k * 0.12);
  }

  // The outro's melody, on the bell, with the delay behind it.
  const hook = [[27, 0, 76, 1], [27, 1, 74, 0.5], [27, 1.5, 72, 0.5], [27, 2, 67, 1], [27, 3, 72, 1],
    [28, 0, 74, 1.5], [28, 1.5, 72, 0.5], [28, 2, 69, 1], [28, 3, 65, 1],
    [29, 0, 70, 1], [29, 1, 69, 0.5], [29, 1.5, 67, 0.5], [29, 2, 65, 2],
    [30, 0, 69, 4]];
  for (const [b, bt, m, len] of hook) bell(b * BAR + bt * BEAT, m, 1, 0.1, Math.max(1.2, len * BEAT * 2.2));

  // ---- moments
  bell(CUE.open1, 62, 0.8, -0.2, 2.5); bell(CUE.open1 + 0.02, 69, 0.5, 0.2, 2.5);
  bell(CUE.open2, 65, 0.8, 0.2, 2.5); bell(CUE.open2 + 0.02, 72, 0.5, -0.2, 2.5);
  reverseSwell(CUE.title, 1.8, 1); impact(CUE.title, 0.55);
  // The light across the logo
  { const t = CUE.title + 0.7, n = noiseSrc(t, 1.2), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'bandpass'; f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(11000, t + 1); f.Q.value = 4;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1); n.connect(f).connect(g).connect(pan(0)).connect(sfx); g.connect(verbIn); }
  riser(CUE.desk - 2.2, CUE.desk, 0.8); impact(CUE.desk, 0.7);
  whoosh(CUE.startClick + 0.06, 0.3, 0, 0, 0.35);
  pop(CUE.termOpen); pop(CUE.elevated, 0.8);
  riser(CUE.enter + 0.1, CUE.verify, 0.5);
  // Secure desktop: the room drops.
  { const t = CUE.uac, n = noiseSrc(t, 0.8), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'lowpass'; f.frequency.value = 380;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8); n.connect(f).connect(g).connect(sfx); }
  impact(CUE.verify, 0.35);
  bell(CUE.verified + 0.4, 74, 0.55, 0.2, 1.8);
  riser(CUE.step3 - 1.6, CUE.step3, 0.6); impact(CUE.step3, 0.75); pop(CUE.step3 + 0.02, 0.9);
  bell(CUE.probe + 0.05, 69, 0.4, -0.2, 1.2);
  riser(CUE.runClick - 2.4, CUE.runClick, 0.9); impact(CUE.runClick, 1);
  // Each heading of the run: a small blip, climbing as the run goes.
  const pent = [62, 65, 67, 69, 72, 74, 77, 79, 81, 84];
  T.TICKS.forEach((t, i) => blip(t, pent[Math.min(pent.length - 1, Math.floor(i / T.TICKS.length * pent.length))], 0.9));
  // Done: the hit, a chord, the count rolling down, then a bell where it lands.
  impact(CUE.done, 0.9);
  [74, 77, 81, 84].forEach((m, i) => bell(CUE.done + i * 0.07, m, 0.7, (i - 1.5) * 0.3, 2.2));
  { const r0 = CUE.done + 0.5 + 0.35, r1 = r0 + 1.0; for (let i = 0; i < 16; i++) { const p = i / 15, t = r0 + (1 - Math.pow(1 - p, 3)) * (r1 - r0) * 0.92; blip(t, 88 - i * 0.5, 0.5); } bell(r1, 81, 0.6, 0, 1.6); }
  riser(CUE.step7 - 2.4, CUE.step7 - 0.2, 0.5);
  for (const [t, d, p0, p1] of T.WHOOSH) whoosh(t, d, p0, p1, 1);
  T.FLIPS.forEach((f, i) => { pluck(f.t, [79, 81, 84, 86][i], 0.9, 0.2, 0.5); blip(f.t + 0.12, 91, 0.35); });
  T.CHECKS.forEach((t, i) => bell(t + 0.06, [74, 77, 81, 84, 86][i], 0.55, (i - 2) * 0.2, 1.2));
  impact(CUE.outro, 0.9); reverseSwell(CUE.outro, 1.2, 0.9);
  { const t = CUE.outro + 0.8, n = noiseSrc(t, 1.2), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'bandpass'; f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(11000, t + 1); f.Q.value = 4;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1); n.connect(f).connect(g).connect(sfx); g.connect(verbIn); }
  impact(CUE.card, 0.35);

  // ---- hands on the keyboard and the mouse
  for (const k of T.SEARCH_KEYS) key(k.t, false);
  for (const k of T.COMMAND_KEYS) key(k.t, k.ch === ' ');
  key(CUE.enter, true, 0.05);
  key(CUE.keyPaste - 0.13, false, -0.2); key(CUE.keyPaste, false, -0.05);
  for (const t of T.CLICKS) mouse(t);

  // The last chord rings out; the room fades with the picture.
  master.gain.setValueAtTime(0.9, CUE.end - 2.2); master.gain.linearRampToValueAtTime(0, CUE.end + 0.3);
  master.gain.setValueAtTime(0, 0); master.gain.linearRampToValueAtTime(0.9, 0.25);

  const buf = await ctx.startRendering();
  return wav(buf);
}

// 16-bit PCM WAV, peak-normalised to -1 dBFS (loudness is set by ffmpeg afterwards).
function wav(buf) {
  const ch = [buf.getChannelData(0), buf.getChannelData(1)], n = ch[0].length;
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
