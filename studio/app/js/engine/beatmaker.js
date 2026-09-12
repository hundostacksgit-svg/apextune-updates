/*
 * A beat, made to order.
 *
 * Why this exists: a montage is cut to music, and the moment somebody has
 * clips but no track is the moment the whole idea stalls. We cannot ship
 * songs — every one belongs to somebody — but we can make a beat: kick,
 * snare, hats, a bass line, in a style and at a tempo, rendered offline into
 * a real audio file that the media pool treats like any other. Its beat grid
 * is known exactly, because we drew it, so cuts land on it to the sample.
 *
 * It is not trying to be a hit. It is trying to be a good enough bed that the
 * edit has a pulse, with the tempo the genre wants, so a person can hear the
 * cut working and swap in their own song afterwards — the cuts stay where
 * they are, and "sync to the music" re-times them.
 *
 * Everything is synthesised: sines with envelopes for the kick and bass,
 * filtered noise for the snare and hats, a short saw for the 808 slide. No
 * samples, so nothing to download and nothing to licence.
 */

export const BEAT_STYLES = {
  phonk: { name: 'Phonk', bpm: 132, blurb: 'Cowbell, sliding 808, half-time snare. The drift edit.' },
  trap: { name: 'Trap', bpm: 140, blurb: 'Rolling hats, deep 808, snare on the three.' },
  drill: { name: 'Drill', bpm: 142, blurb: 'Sliding bass, off-grid hats, sparse and cold.' },
  house: { name: 'House', bpm: 126, blurb: 'Four to the floor, open hat on the off-beat.' },
  hype: { name: 'Hype', bpm: 150, blurb: 'Fast, driving, every beat a hit. Sports and gaming.' },
  cinematic: { name: 'Cinematic', bpm: 90, blurb: 'Slow pulse, low boom, a ticking shaker, a riser into every eighth bar.' },
  lofi: { name: 'Lo-fi', bpm: 84, blurb: 'Lazy swing, soft kick, dusty hats.' },
  dnb: { name: 'Drum & bass', bpm: 174, blurb: 'Two-step break at speed. Velocity edits.' },
};

/** The pattern for a style: sixteen steps per bar, 1 = hit. */
function patterns(style) {
  const K = (s) => s.split('').map((c) => (c === 'x' ? 1 : c === 'o' ? 0.6 : 0));
  switch (style) {
    case 'phonk': return {
      kick:  K('x...x...x...x...'), snare: K('....x.......x...'), hat: K('x.x.x.x.x.x.x.x.'),
      bell:  K('x..x..x...x.x...'), bass:  K('x.....x.x.....x.'), swing: 0.08,
    };
    case 'trap': return {
      kick:  K('x......x..x.....'), snare: K('....x.......x...'), hat: K('xxxxxxxxxxxxxxxx'),
      bell:  K('................'), bass:  K('x......x..x.....'), swing: 0,
    };
    case 'drill': return {
      kick:  K('x.....x...x.....'), snare: K('...x.....x......'), hat: K('x.xx.x.xx.x.x.xx'),
      bell:  K('................'), bass:  K('x.....x...x...x.'), swing: 0.12,
    };
    case 'house': return {
      kick:  K('x...x...x...x...'), snare: K('....x.......x...'), hat: K('..x...x...x...x.'),
      bell:  K('................'), bass:  K('x.x.x.x.x.x.x.x.'), swing: 0,
    };
    case 'hype': return {
      kick:  K('x.x.x.x.x.x.x.x.'), snare: K('....x.......x..o'), hat: K('xxxxxxxxxxxxxxxx'),
      bell:  K('x.......x.......'), bass:  K('x.x.x.x.x.x.x.x.'), swing: 0,
    };
    case 'cinematic': return {
      // A boom on one, the hit on three, and a ticking shaker with a soft rim on two and
      // four: the pulse a trailer cut breathes on. Without the rim the only period is two
      // beats, and "a cut every beat" has nothing to mean.
      kick:  K('x.......x.......'), snare: K('....o...x...o...'), hat: K('x.x.x.x.x.x.x.x.'),
      bell:  K('................'), bass:  K('x...............'), swing: 0,
    };
    case 'lofi': return {
      kick:  K('x.....x.x.......'), snare: K('....x.......x...'), hat: K('x.x.x.x.x.x.x.x.'),
      bell:  K('................'), bass:  K('x.......x.....x.'), swing: 0.18,
    };
    case 'dnb': return {
      kick:  K('x.........x.....'), snare: K('....x.......x...'), hat: K('x.x.x.x.x.x.x.x.'),
      bell:  K('................'), bass:  K('x.........x.....'), swing: 0,
    };
    default: return patterns('trap');
  }
}

/* ---- instruments ---- */

function kick(ctx, at, gain = 1) {
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(150, at); o.frequency.exponentialRampToValueAtTime(42, at + 0.11);
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.42);
  // A click on the front so it cuts through on a phone speaker.
  const c = ctx.createOscillator(); c.type = 'square'; c.frequency.value = 900;
  const cg = ctx.createGain(); cg.gain.setValueAtTime(gain * 0.25, at); cg.gain.exponentialRampToValueAtTime(0.001, at + 0.02);
  o.connect(g).connect(ctx.destination); c.connect(cg).connect(ctx.destination);
  o.start(at); o.stop(at + 0.45); c.start(at); c.stop(at + 0.03);
}

function noiseBuffer(ctx, seconds = 1) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 9;
  for (let i = 0; i < d.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = (seed / 0x7fffffff) * 2 - 1; }
  return buf;
}

/*
 * A snare that is a backbeat, not a tick. Filtered noise on its own is
 * quiet — a band-pass throws most of white noise away — so it is driven
 * hard, given a body in the low mids, and both layers get a wooden knock at
 * the front. The point is not loudness for its own sake: on two and four
 * this is the hit the beat is felt on, and a montage cut to it has to hear
 * it as clearly as the kick.
 */
function snare(ctx, noise, at, gain = 1, { bright = true } = {}) {
  const s = ctx.createBufferSource(); s.buffer = noise;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = bright ? 1900 : 1300; f.Q.value = 0.45;
  const g = ctx.createGain(); g.gain.setValueAtTime(gain * 2.2, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.2);
  s.connect(f).connect(g).connect(ctx.destination); s.start(at); s.stop(at + 0.22);
  // The body under the noise: a pitched knock that drops, like a drum shell.
  const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(240, at); o.frequency.exponentialRampToValueAtTime(150, at + 0.06);
  const og = ctx.createGain(); og.gain.setValueAtTime(gain * 0.95, at); og.gain.exponentialRampToValueAtTime(0.001, at + 0.16);
  o.connect(og).connect(ctx.destination); o.start(at); o.stop(at + 0.18);
  // The front: a two-millisecond click so it reads on a phone speaker.
  const c = ctx.createOscillator(); c.type = 'square'; c.frequency.value = 1400;
  const cg = ctx.createGain(); cg.gain.setValueAtTime(gain * 0.3, at); cg.gain.exponentialRampToValueAtTime(0.001, at + 0.012);
  c.connect(cg).connect(ctx.destination); c.start(at); c.stop(at + 0.02);
}

function hat(ctx, noise, at, gain = 1, open = false) {
  const s = ctx.createBufferSource(); s.buffer = noise;
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
  const g = ctx.createGain(); g.gain.setValueAtTime(gain * 0.35, at); g.gain.exponentialRampToValueAtTime(0.001, at + (open ? 0.28 : 0.05));
  s.connect(f).connect(g).connect(ctx.destination); s.start(at); s.stop(at + (open ? 0.3 : 0.06));
}

function bell(ctx, at, gain = 1) {
  // The phonk cowbell: two detuned squares, short.
  for (const fr of [560, 845]) {
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = fr;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain * 0.18, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.14);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 800; f.Q.value = 1.5;
    o.connect(f).connect(g).connect(ctx.destination); o.start(at); o.stop(at + 0.16);
  }
}

function bass(ctx, at, note, len, gain = 1, { slide = false, style = 'trap' } = {}) {
  const o = ctx.createOscillator(); o.type = style === 'house' ? 'sawtooth' : 'sine';
  const f0 = 55 * 2 ** (note / 12);
  o.frequency.setValueAtTime(slide ? f0 * 1.5 : f0, at);
  if (slide) o.frequency.exponentialRampToValueAtTime(f0, at + Math.min(0.25, len * 0.6));
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain * 0.7, at + 0.01);
  g.gain.setValueAtTime(gain * 0.7, at + len * 0.7); g.gain.exponentialRampToValueAtTime(0.001, at + len);
  const sat = ctx.createWaveShaper();
  const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = (i / 255) * 2 - 1; curve[i] = Math.tanh(2.2 * x); } sat.curve = curve;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = style === 'house' ? 420 : 240;
  o.connect(sat).connect(lp).connect(g).connect(ctx.destination); o.start(at); o.stop(at + len + 0.02);
}

function riser(ctx, noise, at, len, gain = 0.5) {
  const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
  f.frequency.setValueAtTime(300, at); f.frequency.exponentialRampToValueAtTime(6000, at + len);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + len); g.gain.setValueAtTime(0.0001, at + len + 0.01);
  s.connect(f).connect(g).connect(ctx.destination); s.start(at); s.stop(at + len + 0.02);
}

/**
 * Render a beat. Returns { buffer, bpm, beats, bars, style }.
 *
 * The bass follows a four-bar progression in the style's key, the pattern
 * repeats per bar with a fill on every fourth, and cinematic gets a riser
 * into every eighth bar. The last beat is a hit, not a fade — a montage
 * ends on something.
 */
export async function renderBeat({ style = 'trap', bpm = null, seconds = 30, sampleRate = 44100 } = {}) {
  const spec = BEAT_STYLES[style] || BEAT_STYLES.trap;
  const tempo = Math.max(60, Math.min(200, bpm || spec.bpm));
  const beatLen = 60 / tempo, stepLen = beatLen / 4;
  const bars = Math.max(2, Math.ceil(seconds / (beatLen * 4)));
  const total = bars * 4 * beatLen + 1.0;
  const ctx = new OfflineAudioContext(2, Math.ceil(total * sampleRate), sampleRate);
  const noise = noiseBuffer(ctx, 1.5);
  const pat = patterns(style);
  const progression = style === 'cinematic' ? [0, -5, -3, -7] : style === 'house' ? [0, 0, 5, 3] : [0, 0, -2, -4];
  const beats = [];

  for (let bar = 0; bar < bars; bar++) {
    const barAt = bar * 4 * beatLen;
    const fill = (bar + 1) % 4 === 0;
    const note = progression[bar % progression.length];
    for (let step = 0; step < 16; step++) {
      const swing = (step % 2 === 1) ? pat.swing * stepLen : 0;
      const at = barAt + step * stepLen + swing;
      if (step % 4 === 0) beats.push(Number(at.toFixed(4)));
      if (pat.kick[step]) kick(ctx, at, pat.kick[step]);
      if (pat.snare[step] || (fill && step >= 12 && step % 2 === 0)) snare(ctx, noise, at, pat.snare[step] || 0.7, { bright: style !== 'lofi' });
      if (pat.hat[step]) hat(ctx, noise, at, pat.hat[step] * (style === 'lofi' ? 0.6 : 1), style === 'house' && step % 4 === 2);
      if (pat.bell[step]) bell(ctx, at, pat.bell[step]);
      if (pat.bass[step]) {
        // Hold until the next bass hit, or the end of the bar.
        let next = 16; for (let s = step + 1; s < 16; s++) if (pat.bass[s]) { next = s; break; }
        bass(ctx, at, note, (next - step) * stepLen * 0.95, 1, { slide: style === 'phonk' || style === 'drill', style });
      }
    }
    if (style === 'cinematic' && (bar + 1) % 8 === 0 && bar + 1 < bars) riser(ctx, noise, barAt, 4 * beatLen, 0.35);
    if ((style === 'hype' || style === 'dnb') && fill) riser(ctx, noise, barAt + 2 * beatLen, 2 * beatLen, 0.25);
  }
  // The final hit.
  const endAt = bars * 4 * beatLen;
  kick(ctx, endAt, 1.1); snare(ctx, noise, endAt, 1);
  beats.push(Number(endAt.toFixed(4)));

  const buffer = await ctx.startRendering();
  // Normalise to a sane level, so it sits under a voice rather than over it.
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) { const d = buffer.getChannelData(ch); for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i])); }
  const norm = peak > 0 ? 0.85 / peak : 1;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) { const d = buffer.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] *= norm; }
  return { buffer, bpm: tempo, beats, bars, style, seconds: buffer.duration };
}

/** An AudioBuffer as a WAV file, so the media pool can import it like any upload. */
export function bufferToWav(buffer, name = 'beat.wav') {
  const ch = buffer.numberOfChannels, n = buffer.length, rate = buffer.sampleRate;
  const bytes = 44 + n * ch * 2;
  const ab = new ArrayBuffer(bytes); const v = new DataView(ab);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, bytes - 8, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * ch * 2, true);
  let o = 44;
  const chans = []; for (let c = 0; c < ch; c++) chans.push(buffer.getChannelData(c));
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, chans[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new File([ab], name, { type: 'audio/wav' });
}

/** Which style suits a montage genre. */
export function styleForGenre(genre) {
  return {
    anime: 'trap', phonk: 'phonk', velocity: 'dnb', cinematic: 'cinematic', trailer: 'cinematic', sports: 'hype',
    gaming: 'hype', travel: 'house', vlog: 'lofi', lofi: 'lofi', drill: 'drill', horror: 'cinematic', wedding: 'cinematic',
    car: 'phonk', fitness: 'hype', glitch: 'dnb', meme: 'trap', music: 'house', product: 'house', photo: 'lofi',
  }[genre] || 'trap';
}
