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

const { CUE, BAR, BEAT } = T;
const SR = 48000;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

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
  const master = ctx.createGain(); master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 3; comp.attack.value = 0.006; comp.release.value = 0.18;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 28;
  master.connect(hp).connect(comp).connect(ctx.destination);

  const music = ctx.createGain(); music.gain.value = 0.85;
  const duck = ctx.createGain(); duck.gain.value = 1;
  music.connect(duck).connect(master);
  const drums = ctx.createGain(); drums.gain.value = 0.9; drums.connect(master);
  const sfx = ctx.createGain(); sfx.gain.value = 0.9; sfx.connect(master);

  // Reverb: a generated room, darkened, about two seconds.
  const ir = ctx.createBuffer(2, Math.floor(SR * 2.4), SR);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c); let lp = 0;
    for (let i = 0; i < d.length; i++) { const n = rnd() * 2 - 1; lp += (n - lp) * 0.35; d[i] = lp * Math.pow(1 - i / d.length, 3.2) * (i < SR * 0.012 ? i / (SR * 0.012) : 1); }
  }
  const verb = ctx.createConvolver(); verb.buffer = ir;
  const verbIn = ctx.createGain(); verbIn.gain.value = 0.9;
  const verbOut = ctx.createGain(); verbOut.gain.value = 0.42;
  verbIn.connect(verb).connect(verbOut).connect(master);
  // Delay: a dotted eighth, ping-ponged.
  const dl = ctx.createDelay(2), dr = ctx.createDelay(2), fbl = ctx.createGain(), fbr = ctx.createGain(), dIn = ctx.createGain(), dOut = ctx.createGain();
  dl.delayTime.value = BEAT * 0.75; dr.delayTime.value = BEAT * 0.75; fbl.gain.value = 0.38; fbr.gain.value = 0.38; dOut.gain.value = 0.32;
  const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 3200;
  const merger = ctx.createChannelMerger(2);
  dIn.connect(dlp).connect(dl); dl.connect(fbl).connect(dr); dr.connect(fbr).connect(dl);
  dl.connect(merger, 0, 0); dr.connect(merger, 0, 1); merger.connect(dOut).connect(master); dOut.connect(verbIn);

  // White noise, reused.
  const noise = ctx.createBuffer(1, SR * 2, SR);
  { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; }
  const noiseSrc = (t, dur) => { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; s.start(t, rnd() * 1.5); s.stop(t + dur + 0.05); return s; };
  const pan = (v) => { const p = ctx.createStereoPanner(); p.pan.value = v; return p; };
  const env = (g, t, a, peak, d, sus = 0) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + d); };

  // ---- instruments
  function kick(t, v = 1) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(155, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.11); o.frequency.exponentialRampToValueAtTime(40, t + 0.4);
    env(g, t, 0.002, 0.95 * v, 0.42); o.connect(g).connect(drums); o.start(t); o.stop(t + 0.5);
    const n = noiseSrc(t, 0.02), f = ctx.createBiquadFilter(), ng = ctx.createGain(); f.type = 'highpass'; f.frequency.value = 2500;
    env(ng, t, 0.0005, 0.18 * v, 0.012); n.connect(f).connect(ng).connect(drums);
    // The kick pulls the music down for a moment: the pump everything sits on.
    duck.gain.setValueAtTime(1, t); duck.gain.linearRampToValueAtTime(0.5, t + 0.012); duck.gain.linearRampToValueAtTime(1, t + 0.26);
  }
  function snare(t, v = 1) {
    const n = noiseSrc(t, 0.3), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.7;
    env(g, t, 0.001, 0.42 * v, 0.2); n.connect(bp).connect(g).connect(pan(0.05)).connect(drums);
    const sendg = ctx.createGain(); sendg.gain.value = 0.35; g.connect(sendg).connect(verbIn);
    const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(210, t); o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
    env(og, t, 0.001, 0.28 * v, 0.09); o.connect(og).connect(drums); o.start(t); o.stop(t + 0.15);
    // Clap layered on top: three quick bursts.
    for (let k = 0; k < 3; k++) {
      const c = noiseSrc(t + k * 0.011, 0.05), cf = ctx.createBiquadFilter(), cg = ctx.createGain(); cf.type = 'bandpass'; cf.frequency.value = 1300; cf.Q.value = 1.2;
      env(cg, t + k * 0.011, 0.0008, (k === 2 ? 0.3 : 0.18) * v, k === 2 ? 0.16 : 0.02); c.connect(cf).connect(cg).connect(drums); if (k === 2) cg.connect(verbIn);
    }
  }
  function hat(t, v = 1, open = false, p = 0.2) {
    const n = noiseSrc(t, open ? 0.35 : 0.08), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'highpass'; f.frequency.value = open ? 6500 : 7800;
    env(g, t, 0.001, (open ? 0.12 : 0.1) * v, open ? 0.28 : 0.045); n.connect(f).connect(g).connect(pan(p)).connect(drums);
  }
  function bassNote(t, m, dur, v = 1, cutoff = 520) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'sine'; o.frequency.value = mtof(m); o2.frequency.value = mtof(m);
    f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff * 1.6, t); f.frequency.exponentialRampToValueAtTime(cutoff, t + 0.12); f.Q.value = 2;
    const g2 = ctx.createGain(); g2.gain.value = 0.9; o2.connect(g2).connect(g);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3 * v, t + 0.01); g.gain.setValueAtTime(0.26 * v, t + dur * 0.8); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(f).connect(g).connect(music); o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  function pad(t, notes, dur, v = 1, cutoff = 1400, attack = 0.5) {
    const out = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 0.6;
    // Equal-power crossfade into the next bar's chord: no dip between bars.
    out.gain.setValueAtTime(0, t); out.gain.setTargetAtTime(0.055 * v, t, attack / 3); out.gain.setValueAtTime(0.055 * v, t + dur); out.gain.setTargetAtTime(0, t + dur, 0.09);
    notes.forEach((m, i) => {
      for (const det of [-9, 0, 8]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det + (rnd() - 0.5) * 3;
        const p = pan(((i + (det > 0 ? 1 : det < 0 ? -1 : 0) * 0.5) / notes.length - 0.5) * 0.9);
        o.connect(p).connect(f); o.start(t); o.stop(t + dur + 0.6);
      }
    });
    f.connect(out).connect(music);
    const s = ctx.createGain(); s.gain.value = 0.8; out.connect(s).connect(verbIn);
  }
  function pluck(t, m, v = 1, p = 0, send = 0.5) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'triangle'; o2.type = 'square'; o.frequency.value = mtof(m); o2.frequency.value = mtof(m) * 1.002;
    const g2 = ctx.createGain(); g2.gain.value = 0.18; o2.connect(g2).connect(f);
    f.type = 'lowpass'; f.frequency.setValueAtTime(4200, t); f.frequency.exponentialRampToValueAtTime(900, t + 0.2);
    env(g, t, 0.003, 0.13 * v, 0.22); o.connect(f).connect(g).connect(pan(p)).connect(music);
    const sd = ctx.createGain(); sd.gain.value = send; g.connect(sd).connect(dIn);
    o.start(t); o2.start(t); o.stop(t + 0.35); o2.stop(t + 0.35);
  }
  function bell(t, m, v = 1, p = 0, len = 1.6) {
    const out = ctx.createGain(); out.gain.value = 0.11 * v; out.connect(pan(p)).connect(music);
    const s = ctx.createGain(); s.gain.value = 0.9; out.connect(s).connect(verbIn); const sd = ctx.createGain(); sd.gain.value = 0.35; out.connect(sd).connect(dIn);
    [[1, 1, len], [2.0, 0.35, len * 0.6], [3.01, 0.18, len * 0.4], [5.4, 0.06, len * 0.2]].forEach(([r, a, d]) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = mtof(m) * r;
      env(g, t, 0.002, a, d); o.connect(g).connect(out); o.start(t); o.stop(t + d + 0.1);
    });
  }
  function sub(t, m, dur, v = 1) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = mtof(m);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22 * v, t + 0.8); g.gain.setValueAtTime(0.22 * v, t + dur - 0.6); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(music); o.start(t); o.stop(t + dur + 0.1);
  }
  function riser(t0, t1, v = 1) {
    const n = noiseSrc(t0, t1 - t0 + 0.1), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'bandpass'; f.Q.value = 2.5; f.frequency.setValueAtTime(300, t0); f.frequency.exponentialRampToValueAtTime(7000, t1);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.16 * v, t1 - 0.02); g.gain.linearRampToValueAtTime(0, t1 + 0.03);
    n.connect(f).connect(g).connect(sfx); const s = ctx.createGain(); s.gain.value = 0.6; g.connect(s).connect(verbIn);
    const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(180, t0); o.frequency.exponentialRampToValueAtTime(900, t1);
    og.gain.setValueAtTime(0.0001, t0); og.gain.exponentialRampToValueAtTime(0.035 * v, t1 - 0.02); og.gain.linearRampToValueAtTime(0, t1 + 0.02);
    o.connect(og).connect(sfx); o.start(t0); o.stop(t1 + 0.05);
  }
  function reverseSwell(t1, len = 1.4, v = 1) {
    const t0 = t1 - len, n = noiseSrc(t0, len + 0.05), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'highpass'; f.frequency.value = 3500;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.09 * v, t1 - 0.01); g.gain.linearRampToValueAtTime(0, t1 + 0.01);
    n.connect(f).connect(g).connect(sfx); g.connect(verbIn);
  }
  function impact(t, v = 1) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(88, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.9);
    env(g, t, 0.003, 0.7 * v, 1.3); o.connect(g).connect(sfx); o.start(t); o.stop(t + 1.5);
    const n = noiseSrc(t, 0.8), f = ctx.createBiquadFilter(), ng = ctx.createGain(); f.type = 'lowpass'; f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.6);
    env(ng, t, 0.002, 0.28 * v, 0.7); n.connect(f).connect(ng).connect(sfx); ng.connect(verbIn);
  }
  function whoosh(t, dur, p0, p1, v = 1) {
    const n = noiseSrc(t, dur + 0.1), f = ctx.createBiquadFilter(), g = ctx.createGain(), p = ctx.createStereoPanner();
    f.type = 'bandpass'; f.Q.value = 1.1; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2600, t + dur * 0.55); f.frequency.exponentialRampToValueAtTime(700, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32 * v, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    p.pan.setValueAtTime(p0, t); p.pan.linearRampToValueAtTime(p1, t + dur);
    n.connect(f).connect(g).connect(p).connect(sfx); const s = ctx.createGain(); s.gain.value = 0.4; g.connect(s).connect(verbIn);
  }
  function pop(t, v = 1) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(760, t + 0.07);
    env(g, t, 0.004, 0.07 * v, 0.1); o.connect(g).connect(sfx); o.start(t); o.stop(t + 0.15);
    const n = noiseSrc(t, 0.12), f = ctx.createBiquadFilter(), ng = ctx.createGain(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.8;
    env(ng, t, 0.01, 0.05 * v, 0.1); n.connect(f).connect(ng).connect(sfx);
  }
  // A mechanical keyboard, close-miked: the switch's click, the keycap's thock, the release.
  function key(t, big = false, p = -0.08) {
    const v = 0.75 + rnd() * 0.35, out = pan(p + (rnd() - 0.5) * 0.08); out.connect(sfx);
    const c = noiseSrc(t, 0.02), cf = ctx.createBiquadFilter(), cg = ctx.createGain(); cf.type = 'bandpass'; cf.frequency.value = 3000 + rnd() * 1800; cf.Q.value = 1.3;
    env(cg, t, 0.0004, 0.2 * v, 0.006); c.connect(cf).connect(cg).connect(out);
    const th = noiseSrc(t + 0.002, 0.06), tf = ctx.createBiquadFilter(), tg = ctx.createGain(); tf.type = 'lowpass'; tf.frequency.value = big ? 700 : 1100;
    env(tg, t + 0.002, 0.001, (big ? 0.34 : 0.22) * v, big ? 0.05 : 0.03); th.connect(tf).connect(tg).connect(out);
    const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.setValueAtTime((big ? 150 : 210) + rnd() * 40, t); o.frequency.exponentialRampToValueAtTime(big ? 90 : 130, t + 0.04);
    env(og, t, 0.001, (big ? 0.2 : 0.12) * v, 0.04); o.connect(og).connect(out); o.start(t); o.stop(t + 0.07);
    const r = t + 0.055 + rnd() * 0.035, rs = noiseSrc(r, 0.015), rf = ctx.createBiquadFilter(), rg = ctx.createGain(); rf.type = 'bandpass'; rf.frequency.value = 2400; rf.Q.value = 1;
    env(rg, r, 0.0004, 0.07 * v, 0.006); rs.connect(rf).connect(rg).connect(out);
  }
  function mouse(t) {
    const out = pan(0.15); out.connect(sfx);
    for (const [dt, a] of [[0, 0.22], [0.075, 0.1]]) {
      const n = noiseSrc(t + dt, 0.01), f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'highpass'; f.frequency.value = 2200;
      env(g, t + dt, 0.0003, a, 0.004); n.connect(f).connect(g).connect(out);
      const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.value = 3600 - dt * 6000; env(og, t + dt, 0.0003, a * 0.3, 0.006); o.connect(og).connect(out); o.start(t + dt); o.stop(t + dt + 0.02);
    }
  }
  function blip(t, m, v = 1) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = mtof(m);
    env(g, t, 0.002, 0.045 * v, 0.07); o.connect(g).connect(pan(0.25)).connect(sfx); const s = ctx.createGain(); s.gain.value = 0.5; g.connect(s).connect(dIn);
    o.start(t); o.stop(t + 0.12);
  }

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
