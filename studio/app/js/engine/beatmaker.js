/*
 * The music the app makes for you.
 *
 * Why this exists: a montage is cut to music, and the moment somebody has
 * clips but no track is the moment the whole idea stalls. We cannot ship
 * songs — every one belongs to somebody, and a video editor that hands you
 * other people's masters is a lawsuit with a UI. So the app writes the music
 * instead: drums, bass, chords and a melody, in a style and a key and at a
 * tempo, rendered offline into a real audio file the media pool treats like
 * any other upload.
 *
 * That turns out to be better than a stock library for the job it has to do:
 *
 *   Nothing to licence, so nothing gets muted or claimed on upload.
 *   The beat grid is known to the sample, because we drew it — "cut on the
 *   beat" lands exactly rather than nearly.
 *   A seed makes it reproducible: the same track id always renders the same
 *   track, so a project re-opened a year later sounds the same.
 *
 * It is not trying to be a hit. It is trying to be a bed good enough that the
 * edit has a pulse and a shape, and a person can hear the cut working. Swap
 * in your own song afterwards and the cuts stay where they are; "sync to the
 * music" re-times them.
 *
 * Everything is synthesised — oscillators, filtered noise, envelopes. No
 * samples, so nothing to download and nothing to licence.
 */

/* ------------------------------------------------------------------ */
/* styles                                                              */
/* ------------------------------------------------------------------ */

/*
 * A style is a tempo, a drum pattern, a harmonic world and a choice of
 * voices. The eight original ids are kept exactly as they were — templates,
 * montages and saved projects name them — and the rest are the families
 * people actually ask for by name.
 *
 *   family   groups them in the library browser
 *   scale    which notes the chords and melody are drawn from
 *   voices   which instruments play at all in this style
 *   bassKind how the low end behaves: an 808 that slides, a sub, a saw, a
 *            plucked finger bass, a walking line
 */
export const BEAT_STYLES = {
  /* --- rap and its neighbours --- */
  trap:      { name: 'Trap', bpm: 140, family: 'Rap', scale: 'minor', bassKind: '808', voices: ['pluck', 'lead'], blurb: 'Rolling hats, deep 808, snare on the three.' },
  drill:     { name: 'Drill', bpm: 142, family: 'Rap', scale: 'phrygian', bassKind: 'slide', voices: ['pluck'], blurb: 'Sliding bass, off-grid hats, sparse and cold.' },
  ukdrill:   { name: 'UK drill', bpm: 144, family: 'Rap', scale: 'phrygian', bassKind: 'slide', voices: ['pluck', 'lead'], blurb: 'Skippy hats, a bass that slides under everything.' },
  boombap:   { name: 'Boom bap', bpm: 92, family: 'Rap', scale: 'dorian', bassKind: 'walk', voices: ['keys'], blurb: 'Dusty kick and snare, an upright line, a jazz chord.' },
  phonk:     { name: 'Phonk', bpm: 132, family: 'Rap', scale: 'minor', bassKind: 'slide', voices: ['bell'], blurb: 'Cowbell, sliding 808, half-time snare. The drift edit.' },
  memphis:   { name: 'Memphis', bpm: 136, family: 'Rap', scale: 'phrygian', bassKind: '808', voices: ['bell', 'pluck'], blurb: 'Cowbell and murk, tape-slow and mean.' },
  hyperpop:  { name: 'Hyperpop', bpm: 160, family: 'Rap', scale: 'major', bassKind: 'saw', voices: ['pluck', 'lead', 'arp'], blurb: 'Bright, overdriven, too fast and glad about it.' },

  /* --- R&B and the slow end --- */
  rnb:       { name: 'R&B', bpm: 88, family: 'R&B', scale: 'minor', bassKind: 'sub', voices: ['keys', 'pad'], blurb: 'Soft kit, warm keys, room to sing over.' },
  trapsoul:  { name: 'Trap soul', bpm: 74, family: 'R&B', scale: 'minor', bassKind: '808', voices: ['keys', 'pad'], blurb: 'Half-time, wide pad, an 808 a long way down.' },
  slowjam:   { name: 'Slow jam', bpm: 68, family: 'R&B', scale: 'major', bassKind: 'sub', voices: ['keys', 'pad', 'lead'], blurb: 'Late, warm and unhurried.' },
  neosoul:   { name: 'Neo soul', bpm: 82, family: 'R&B', scale: 'dorian', bassKind: 'walk', voices: ['keys', 'pad'], blurb: 'Loose kit, seventh chords, a bass that wanders.' },

  /* --- the dance floor --- */
  house:     { name: 'House', bpm: 126, family: 'Dance', scale: 'minor', bassKind: 'saw', voices: ['pluck', 'pad'], blurb: 'Four to the floor, open hat on the off-beat.' },
  deephouse: { name: 'Deep house', bpm: 122, family: 'Dance', scale: 'dorian', bassKind: 'saw', voices: ['pad', 'keys'], blurb: 'Warm pad, soft kick, nothing in a hurry.' },
  techno:    { name: 'Techno', bpm: 132, family: 'Dance', scale: 'phrygian', bassKind: 'saw', voices: ['arp'], blurb: 'Relentless, metallic, one idea done properly.' },
  edm:       { name: 'Festival', bpm: 128, family: 'Dance', scale: 'major', bassKind: 'saw', voices: ['lead', 'pad', 'arp'], blurb: 'Big lead, big build, hands in the air.' },
  dubstep:   { name: 'Dubstep', bpm: 140, family: 'Dance', scale: 'minor', bassKind: 'growl', voices: ['lead'], blurb: 'Half-time snare, a bass that talks.' },
  dnb:       { name: 'Drum & bass', bpm: 174, family: 'Dance', scale: 'minor', bassKind: 'sub', voices: ['pad', 'pluck'], blurb: 'Two-step break at speed. Velocity edits.' },
  jerseyclub:{ name: 'Jersey club', bpm: 138, family: 'Dance', scale: 'minor', bassKind: '808', voices: ['pluck'], blurb: 'The triplet kick pattern, bed squeaks optional.' },

  /* --- global --- */
  afrobeats: { name: 'Afrobeats', bpm: 104, family: 'Global', scale: 'major', bassKind: 'pluck', voices: ['pluck', 'keys'], blurb: 'Log drum, off-beat guitar, sun on it.' },
  amapiano:  { name: 'Amapiano', bpm: 112, family: 'Global', scale: 'minor', bassKind: 'log', voices: ['keys', 'pad'], blurb: 'Log-drum bass, shakers, a piano that keeps talking.' },
  reggaeton: { name: 'Reggaeton', bpm: 96, family: 'Global', scale: 'minor', bassKind: 'sub', voices: ['pluck', 'keys'], blurb: 'Dembow, all night.' },
  dancehall: { name: 'Dancehall', bpm: 100, family: 'Global', scale: 'minor', bassKind: 'sub', voices: ['pluck'], blurb: 'The one-drop, heavy on the offbeat.' },

  /* --- bands and beds --- */
  pop:       { name: 'Pop', bpm: 118, family: 'Pop', scale: 'major', bassKind: 'pluck', voices: ['keys', 'lead', 'pad'], blurb: 'Bright, hooky, made for a chorus.' },
  indie:     { name: 'Indie', bpm: 108, family: 'Pop', scale: 'major', bassKind: 'pluck', voices: ['pluck', 'pad'], blurb: 'Jangly, honest, a little bit reverby.' },
  rock:      { name: 'Rock', bpm: 124, family: 'Pop', scale: 'minor', bassKind: 'saw', voices: ['power', 'lead'], blurb: 'Backbeat and a wall of guitars.' },
  synthwave: { name: 'Synthwave', bpm: 100, family: 'Pop', scale: 'minor', bassKind: 'saw', voices: ['arp', 'pad', 'lead'], blurb: 'Gated snare, neon arpeggio, 1984.' },
  funk:      { name: 'Funk', bpm: 106, family: 'Pop', scale: 'dorian', bassKind: 'pluck', voices: ['pluck', 'keys'], blurb: 'On the one, and stay there.' },

  /* --- quiet --- */
  lofi:      { name: 'Lo-fi', bpm: 84, family: 'Chill', scale: 'dorian', bassKind: 'walk', voices: ['keys'], blurb: 'Lazy swing, soft kick, dusty hats.' },
  jazzhop:   { name: 'Jazz hop', bpm: 88, family: 'Chill', scale: 'dorian', bassKind: 'walk', voices: ['keys', 'lead'], blurb: 'Brushed kit, seventh chords, rain outside.' },
  ambient:   { name: 'Ambient', bpm: 70, family: 'Chill', scale: 'major', bassKind: 'sub', voices: ['pad', 'lead'], blurb: 'Almost no drums. Mostly weather.' },
  cinematic: { name: 'Cinematic', bpm: 90, family: 'Score', scale: 'minor', bassKind: 'sub', voices: ['pad', 'lead'], blurb: 'Slow pulse, low boom, a ticking shaker, a riser into every eighth bar.' },
  trailer:   { name: 'Trailer', bpm: 96, family: 'Score', scale: 'phrygian', bassKind: 'sub', voices: ['pad'], blurb: 'Hits, silence, then a bigger hit.' },
  hype:      { name: 'Hype', bpm: 150, family: 'Score', scale: 'minor', bassKind: 'saw', voices: ['pluck', 'lead'], blurb: 'Fast, driving, every beat a hit. Sports and gaming.' },
  horror:    { name: 'Horror', bpm: 76, family: 'Score', scale: 'phrygian', bassKind: 'sub', voices: ['pad', 'bell'], blurb: 'A pulse, a wrong note, and space to be frightened in.' },
};

/** The style families, in the order the library browser shows them. */
export const STYLE_FAMILIES = ['Rap', 'R&B', 'Dance', 'Global', 'Pop', 'Chill', 'Score'];

/* ------------------------------------------------------------------ */
/* the drum patterns                                                   */
/* ------------------------------------------------------------------ */

/** The pattern for a style: sixteen steps per bar, 1 = hit, o = ghost. */
function patterns(style) {
  const K = (s) => s.split('').map((c) => (c === 'x' ? 1 : c === 'o' ? 0.6 : c === '-' ? 0.3 : 0));
  const P = (kick, snare, hat, bell, bass, swing = 0, open = null) =>
    ({ kick: K(kick), snare: K(snare), hat: K(hat), bell: K(bell), bass: K(bass), swing, open: open ? K(open) : null });
  switch (style) {
    /* rap */
    case 'phonk':     return P('x...x...x...x...', '....x.......x...', 'x.x.x.x.x.x.x.x.', 'x..x..x...x.x...', 'x.....x.x.....x.', 0.08);
    case 'trap':      return P('x......x..x.....', '....x.......x...', 'xxxxxxxxxxxxxxxx', '................', 'x......x..x.....');
    case 'drill':     return P('x.....x...x.....', '...x.....x......', 'x.xx.x.xx.x.x.xx', '................', 'x.....x...x...x.', 0.12);
    case 'ukdrill':   return P('x....x....x.....', '...x.....x......', 'x.xxx.x.x.xx.x.x', '................', 'x....x....x...x.', 0.14);
    case 'boombap':   return P('x.......x..x....', '....x.......x...', 'x.x.x.x.x.x.x.x.', '................', 'x.......x..x....', 0.16);
    case 'memphis':   return P('x...x..x..x.....', '....x.......x...', 'x.x.x.x.x.x.x.x.', 'x.....x...x.....', 'x...x..x..x.....', 0.06);
    case 'hyperpop':  return P('x...x...x...x..x', '....x.......x...', 'xxxxxxxxxxxxxxxx', '................', 'x...x...x...x...');
    /* R&B */
    case 'rnb':       return P('x.......x.o.....', '....x.......x...', 'x.x-x.x-x.x-x.x-', '................', 'x.......x.......', 0.10);
    case 'trapsoul':  return P('x.........x.....', '........x.......', 'x.xxx.x.x.xxx.x.', '................', 'x.........x.....');
    case 'slowjam':   return P('x.......x.......', '....x.......x...', 'x...x...x...x...', '................', 'x.......x.......', 0.12);
    case 'neosoul':   return P('x....o..x..o....', '....x.......x..o', 'x.x-x.x-x.x-x.x-', '................', 'x....o..x..o....', 0.18);
    /* dance */
    case 'house':     return P('x...x...x...x...', '....x.......x...', '..x...x...x...x.', '................', 'x.x.x.x.x.x.x.x.', 0, '..x...x...x...x.');
    case 'deephouse': return P('x...x...x...x...', '....o.......o...', '..x...x...x...x.', '................', 'x..x..x.x..x..x.', 0.04, '......x.......x.');
    case 'techno':    return P('x...x...x...x...', '................', 'x.x.x.x.x.x.x.x.', '................', 'x.x.x.x.x.x.x.x.');
    case 'edm':       return P('x...x...x...x...', '....x.......x...', 'x.x.x.x.x.x.x.x.', '................', 'x.x.x.x.x.x.x.x.', 0, '..x...x...x...x.');
    case 'dubstep':   return P('x.......x.......', '........x.......', 'x.x.x.x.x.x.x.x.', '................', 'x.......x...x...');
    case 'dnb':       return P('x.........x.....', '....x.......x...', 'x.x.x.x.x.x.x.x.', '................', 'x.........x.....');
    case 'jerseyclub':return P('x..x..x.x..x..x.', '....x.......x...', 'x.x.x.x.x.x.x.x.', '................', 'x..x..x.x..x..x.');
    /* global */
    case 'afrobeats': return P('x..x..x...x..x..', '....o...x...o...', 'x.xx.xx.x.xx.xx.', '................', 'x..x..x...x..x..', 0.06);
    case 'amapiano':  return P('x...x...x...x...', '......o.......o.', 'x.xx.xx.x.xx.xx.', '................', 'x..x....x..x....', 0.08);
    case 'reggaeton': return P('x..x..x...x..x..', '...x..x....x..x.', 'x.x.x.x.x.x.x.x.', '................', 'x.....x...x.....');
    case 'dancehall': return P('x.......x.......', '...x.......x....', 'x.x.x.x.x.x.x.x.', '................', 'x.......x.......', 0.05);
    /* bands */
    case 'pop':       return P('x.......x.......', '....x.......x...', 'x.x.x.x.x.x.x.x.', '................', 'x...x...x...x...');
    case 'indie':     return P('x.......x...x...', '....x.......x...', 'x.x.x.x.x.x.x.x.', '................', 'x.......x...x...', 0.06);
    case 'rock':      return P('x...x...x.x.....', '....x.......x...', 'x.x.x.x.x.x.x.x.', '................', 'x...x...x.x.....');
    case 'synthwave': return P('x.......x.......', '....x.......x...', 'x.x.x.x.x.x.x.x.', '................', 'x.x.x.x.x.x.x.x.');
    case 'funk':      return P('x..o..x.o..x..o.', '....x...o...x...', 'x.xxx.xxx.xxx.xx', '................', 'x..x..x.x..x..x.', 0.14);
    /* quiet */
    case 'lofi':      return P('x.....x.x.......', '....x.......x...', 'x.x.x.x.x.x.x.x.', '................', 'x.......x.....x.', 0.18);
    case 'jazzhop':   return P('x.....o.x.......', '....x.......x..o', 'x.x-x.x-x.x-x.x-', '................', 'x...o...x...o...', 0.20);
    case 'ambient':   return P('x...............', '................', '........x.......', '................', 'x...............');
    case 'cinematic': return P('x.......x.......', '....o...x...o...', 'x.x.x.x.x.x.x.x.', '................', 'x...............');
    case 'trailer':   return P('x.......x...x...', '........x.......', '................', '................', 'x.......x.......');
    case 'hype':      return P('x.x.x.x.x.x.x.x.', '....x.......x..o', 'xxxxxxxxxxxxxxxx', 'x.......x.......', 'x.x.x.x.x.x.x.x.');
    case 'horror':    return P('x.......x.......', '................', '..x...x...x...x.', '....x.......x...', 'x...............');
    default:          return patterns('trap');
  }
}

/* ------------------------------------------------------------------ */
/* harmony                                                             */
/* ------------------------------------------------------------------ */

/*
 * Four scales cover everything here. Minor for most of it, phrygian for the
 * cold and the frightening (that flat second is the whole sound of drill and
 * of horror), dorian for the jazz-leaning ones, major for the bright.
 */
const SCALES = {
  minor:    [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  dorian:   [0, 2, 3, 5, 7, 9, 10],
  major:    [0, 2, 4, 5, 7, 9, 11],
};

/*
 * Chord progressions as scale degrees, one per bar of a four-bar loop.
 *
 * Written as degrees rather than semitones so the same progression works in
 * every scale: degree 0 in minor is a minor chord, degree 0 in major is
 * major, and the seventh added on top is whatever the scale says it is. That
 * is what stops a "jazz" progression sounding wrong when the style asks for
 * phrygian.
 */
const PROGRESSIONS = [
  [0, 5, 3, 4],   // i–VI–IV–V, the one everything is built on
  [0, 3, 4, 0],   // i–IV–V–i
  [0, 6, 5, 4],   // i–VII–VI–V, the descent
  [0, 4, 5, 3],
  [0, 2, 5, 4],
  [5, 4, 0, 0],   // starts away from home
  [0, 0, 3, 4],   // sits on the root, then moves
  [0, 6, 3, 4],
];

const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/*
 * A tiny deterministic generator: the same seed always gives the same track.
 *
 * The seed is hashed and the generator warmed up before anything reads it.
 * Straight xorshift on a small integer starts very close to zero, so seeds 1
 * to 4 all chose the key of C and the same tempo — four "different" tracks in
 * the library that differed only in the melody.
 */
function rng(seed) {
  let s = ((seed >>> 0) || 1) * 2654435761 >>> 0;
  s ^= s >>> 15; s = Math.imul(s, 2246822519) >>> 0; s ^= s >>> 13;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let i = 0; i < 8; i++) next();
  return next;
}

/** Midi-ish note number to hertz, where 0 is a low A. */
const hz = (n) => 55 * 2 ** (n / 12);

/** The notes of a chord built on a scale degree, as semitone offsets. */
function chordNotes(scale, degree, { seventh = false } = {}) {
  const s = SCALES[scale] || SCALES.minor;
  const at = (i) => s[((i % 7) + 7) % 7] + 12 * Math.floor(i / 7);
  const notes = [at(degree), at(degree + 2), at(degree + 4)];
  if (seventh) notes.push(at(degree + 6));
  return notes;
}

/* ------------------------------------------------------------------ */
/* the mix bus                                                         */
/* ------------------------------------------------------------------ */

/*
 * Everything goes through one bus rather than straight at the destination.
 *
 * With drums alone the old code could normalise afterwards and be fine. Add
 * chords, a bass and a lead and the loudest transient decides the gain for
 * the whole track, so a single snare crack drags the music down to nothing.
 * A soft clip on the bus catches the peaks instead, and the normalise that
 * follows then has something sensible to work with.
 */
function makeBus(ctx) {
  /* A shelf at each end before the clip. Synthesised drums carry enormous
     energy under 200 Hz and almost none above 6 kHz, so without this the
     normalise at the end is set by the kick and everything written on top of
     it — the chords, the tune, the hats — arrives inaudible. */
  const low = ctx.createBiquadFilter();
  low.type = 'lowshelf'; low.frequency.value = 130; low.gain.value = -4.5;
  const high = ctx.createBiquadFilter();
  high.type = 'highshelf'; high.frequency.value = 5200; high.gain.value = 5;
  const air = ctx.createBiquadFilter();
  air.type = 'peaking'; air.frequency.value = 2400; air.Q.value = 0.7; air.gain.value = 2.5;
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(1.6 * x) / Math.tanh(1.6); }
  shaper.curve = curve;
  shaper.oversample = '2x';
  const out = ctx.createGain(); out.gain.value = 0.9;
  low.connect(air).connect(high).connect(shaper).connect(out).connect(ctx.destination);
  return low;
}

/** Route a voice to the bus, optionally panned. */
function to(ctx, bus, node, pan = 0) {
  if (!pan) { node.connect(bus); return; }
  const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
  node.connect(p).connect(bus);
}

/* ------------------------------------------------------------------ */
/* the drums                                                           */
/* ------------------------------------------------------------------ */

function kick(ctx, bus, at, gain = 1, { deep = false } = {}) {
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(deep ? 120 : 150, at);
  o.frequency.exponentialRampToValueAtTime(deep ? 36 : 42, at + (deep ? 0.15 : 0.11));
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.001, at + (deep ? 0.34 : 0.26));
  // A click on the front so it cuts through on a phone speaker.
  const c = ctx.createOscillator(); c.type = 'square'; c.frequency.value = 900;
  const cg = ctx.createGain(); cg.gain.setValueAtTime(gain * 0.25, at); cg.gain.exponentialRampToValueAtTime(0.001, at + 0.02);
  o.connect(g); c.connect(cg);
  to(ctx, bus, g); to(ctx, bus, cg);
  o.start(at); o.stop(at + 0.38); c.start(at); c.stop(at + 0.03);
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
 * the front. On two and four this is the hit the beat is felt on, and a
 * montage cut to it has to hear it as clearly as the kick.
 */
function snare(ctx, bus, noise, at, gain = 1, { bright = true, clap = false, gate = 0 } = {}) {
  const s = ctx.createBufferSource(); s.buffer = noise;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = bright ? 1900 : 1300; f.Q.value = clap ? 1.1 : 0.45;
  const tail = gate ? gate : (clap ? 0.13 : 0.2);
  const g = ctx.createGain(); g.gain.setValueAtTime(gain * 2.2, at); g.gain.exponentialRampToValueAtTime(0.001, at + tail);
  s.connect(f).connect(g); to(ctx, bus, g);
  s.start(at); s.stop(at + tail + 0.02);
  const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(240, at); o.frequency.exponentialRampToValueAtTime(150, at + 0.06);
  const og = ctx.createGain(); og.gain.setValueAtTime(gain * (clap ? 0.4 : 0.95), at); og.gain.exponentialRampToValueAtTime(0.001, at + 0.16);
  o.connect(og); to(ctx, bus, og); o.start(at); o.stop(at + 0.18);
  const c = ctx.createOscillator(); c.type = 'square'; c.frequency.value = 1400;
  const cg = ctx.createGain(); cg.gain.setValueAtTime(gain * 0.3, at); cg.gain.exponentialRampToValueAtTime(0.001, at + 0.012);
  c.connect(cg); to(ctx, bus, cg); c.start(at); c.stop(at + 0.02);
}

function hat(ctx, bus, noise, at, gain = 1, open = false, pan = 0) {
  const s = ctx.createBufferSource(); s.buffer = noise;
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
  const g = ctx.createGain(); g.gain.setValueAtTime(gain * 0.58, at); g.gain.exponentialRampToValueAtTime(0.001, at + (open ? 0.28 : 0.05));
  s.connect(f).connect(g); to(ctx, bus, g, pan);
  s.start(at); s.stop(at + (open ? 0.3 : 0.06));
}

function shaker(ctx, bus, noise, at, gain = 1, pan = 0) {
  const s = ctx.createBufferSource(); s.buffer = noise;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 9000; f.Q.value = 0.8;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(gain * 0.34, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.001, at + 0.07);
  s.connect(f).connect(g); to(ctx, bus, g, pan);
  s.start(at); s.stop(at + 0.09);
}

function bell(ctx, bus, at, gain = 1) {
  // The phonk cowbell: two detuned squares, short.
  for (const fr of [560, 845]) {
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = fr;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain * 0.18, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.14);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 800; f.Q.value = 1.5;
    o.connect(f).connect(g); to(ctx, bus, g);
    o.start(at); o.stop(at + 0.16);
  }
}

/* ------------------------------------------------------------------ */
/* the low end                                                         */
/* ------------------------------------------------------------------ */

/*
 * One function, five behaviours, because the bass is most of what separates
 * these styles from each other. A drill bass slides into every note; an 808
 * is a sine driven until it distorts; a house bass is a filtered saw on the
 * off-beat; a finger bass has a pluck on the front; a growl wobbles.
 */
function bassVoice(ctx, bus, at, note, len, gain = 1, kind = 'sub', tempo = 120) {
  const f0 = hz(note);
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
  const sat = ctx.createWaveShaper();
  const curve = new Float32Array(256);
  const drive = kind === '808' ? 2.8 : kind === 'growl' ? 4 : 2.2;
  for (let i = 0; i < 256; i++) { const x = (i / 255) * 2 - 1; curve[i] = Math.tanh(drive * x); }
  sat.curve = curve;

  switch (kind) {
    case 'slide':
      o.type = 'sine'; lp.frequency.value = 260;
      o.frequency.setValueAtTime(f0 * 1.5, at);
      o.frequency.exponentialRampToValueAtTime(f0, at + Math.min(0.3, len * 0.7));
      break;
    case '808':
      o.type = 'sine'; lp.frequency.value = 240;
      o.frequency.setValueAtTime(f0 * 1.12, at);
      o.frequency.exponentialRampToValueAtTime(f0, at + 0.06);
      break;
    case 'saw':
      o.type = 'sawtooth'; lp.frequency.setValueAtTime(1200, at);
      lp.frequency.exponentialRampToValueAtTime(340, at + Math.min(0.25, len));
      lp.Q.value = 6;
      break;
    case 'pluck':
      o.type = 'triangle'; lp.frequency.setValueAtTime(2200, at);
      lp.frequency.exponentialRampToValueAtTime(420, at + 0.1);
      break;
    case 'walk':
      o.type = 'triangle'; lp.frequency.value = 700;
      break;
    case 'log':
      // The amapiano log drum: a sine with a hard pitch drop and a long tail.
      o.type = 'sine'; lp.frequency.value = 300;
      o.frequency.setValueAtTime(f0 * 2.2, at);
      o.frequency.exponentialRampToValueAtTime(f0, at + 0.09);
      break;
    case 'growl': {
      o.type = 'sawtooth'; lp.Q.value = 9;
      const wob = ctx.createOscillator(); wob.type = 'sine'; wob.frequency.value = tempo / 60 * 2;
      const wg = ctx.createGain(); wg.gain.value = 500;
      wob.connect(wg).connect(lp.frequency);
      lp.frequency.value = 700;
      wob.start(at); wob.stop(at + len + 0.05);
      break;
    }
    default:
      o.type = 'sine'; lp.frequency.value = 200;
  }
  if (kind !== 'slide' && kind !== '808' && kind !== 'log') o.frequency.setValueAtTime(f0, at);

  const peak = gain * (kind === 'walk' ? 0.4 : 0.55);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.012);
  g.gain.setValueAtTime(peak, at + len * 0.7);
  g.gain.exponentialRampToValueAtTime(0.001, at + len);
  o.connect(sat).connect(lp).connect(g); to(ctx, bus, g);
  o.start(at); o.stop(at + len + 0.02);
}

/* ------------------------------------------------------------------ */
/* the middle: chords, plucks, leads                                   */
/* ------------------------------------------------------------------ */

/** A held chord, soft on the front. Two detuned saws a note for width. */
function pad(ctx, bus, at, notes, len, gain = 0.24) {
  for (const [i, n] of notes.entries()) {
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = hz(n + 24) * 2 ** (det / 1200);
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400; f.Q.value = 0.6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(gain / notes.length, at + Math.min(0.6, len * 0.3));
      g.gain.setValueAtTime(gain / notes.length, at + len * 0.75);
      g.gain.exponentialRampToValueAtTime(0.001, at + len);
      o.connect(f).connect(g);
      to(ctx, bus, g, (i - (notes.length - 1) / 2) * 0.3 + det / 40);
      o.start(at); o.stop(at + len + 0.05);
    }
  }
}

/** Keys: an electric-piano-ish strike, sine plus a bright partial that dies fast. */
function keys(ctx, bus, at, notes, len, gain = 0.38, pan = 0) {
  for (const [i, n] of notes.entries()) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz(n + 24);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain / Math.max(2, notes.length), at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0005, at + Math.min(len, 1.6));
    o.connect(g); to(ctx, bus, g, pan + (i - 1) * 0.08);
    o.start(at); o.stop(at + Math.min(len, 1.7));
    const b = ctx.createOscillator(); b.type = 'triangle'; b.frequency.value = hz(n + 36);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.0001, at);
    bg.gain.exponentialRampToValueAtTime(gain * 0.22 / Math.max(2, notes.length), at + 0.005);
    bg.gain.exponentialRampToValueAtTime(0.0005, at + 0.35);
    b.connect(bg); to(ctx, bus, bg, pan);
    b.start(at); b.stop(at + 0.4);
  }
}

/** A pluck: a saw through a fast filter sweep. One note, short. */
function pluck(ctx, bus, at, note, len, gain = 0.3, pan = 0) {
  const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(note + 24);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 7;
  f.frequency.setValueAtTime(4200, at);
  f.frequency.exponentialRampToValueAtTime(700, at + Math.min(0.3, len));
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0005, at + Math.min(len * 1.1, 0.9));
  o.connect(f).connect(g); to(ctx, bus, g, pan);
  o.start(at); o.stop(at + Math.min(len * 1.2, 1));
}

/** A power chord: root and fifth on a distorted saw pair. Rock only. */
function power(ctx, bus, at, note, len, gain = 0.26) {
  for (const [k, off] of [[0, -0.35], [7, 0.35]]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(note + 12 + k);
    const sat = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = (i / 255) * 2 - 1; curve[i] = Math.tanh(6 * x); }
    sat.curve = curve;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.01);
    g.gain.setValueAtTime(gain, at + len * 0.8);
    g.gain.exponentialRampToValueAtTime(0.001, at + len);
    o.connect(sat).connect(f).connect(g); to(ctx, bus, g, off);
    o.start(at); o.stop(at + len + 0.02);
  }
}

/** The melody voice: a square or saw with a little vibrato, and a soft top. */
function lead(ctx, bus, at, note, len, gain = 0.28, { type = 'square', pan = 0 } = {}) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz(note + 36);
  const vib = ctx.createOscillator(); vib.type = 'sine'; vib.frequency.value = 5.2;
  const vg = ctx.createGain(); vg.gain.value = hz(note + 36) * 0.006;
  vib.connect(vg).connect(o.frequency);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3200;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.02);
  g.gain.setValueAtTime(gain, at + len * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0008, at + len);
  o.connect(f).connect(g); to(ctx, bus, g, pan);
  o.start(at); o.stop(at + len + 0.02);
  vib.start(at); vib.stop(at + len + 0.02);
}

function riser(ctx, bus, noise, at, len, gain = 0.5) {
  const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
  f.frequency.setValueAtTime(300, at); f.frequency.exponentialRampToValueAtTime(6000, at + len);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + len); g.gain.setValueAtTime(0.0001, at + len + 0.01);
  s.connect(f).connect(g); to(ctx, bus, g);
  s.start(at); s.stop(at + len + 0.02);
}

/* ------------------------------------------------------------------ */
/* arrangement                                                         */
/* ------------------------------------------------------------------ */

/*
 * A track with a shape, not one bar looped until it stops.
 *
 * Sections are fractions of the whole so any length works: a fifteen-second
 * sting and a two-minute bed both get an intro that lets the picture start,
 * a main section, a break that drops the drums out so the return means
 * something, and an outro. Under six bars there is no room for that, so it
 * collapses to intro and main.
 */
function arrange(bars) {
  if (bars < 6) return (bar) => (bar === 0 ? 'intro' : bar >= bars - 1 ? 'outro' : 'main');
  const cut = (f) => Math.max(1, Math.round(bars * f));
  const introEnd = cut(0.12), buildEnd = cut(0.24), aEnd = cut(0.5), breakEnd = cut(0.62), outroAt = bars - Math.max(1, Math.round(bars * 0.08));
  return (bar) => {
    if (bar < introEnd) return 'intro';
    if (bar < buildEnd) return 'build';
    if (bar < aEnd) return 'main';
    if (bar < breakEnd) return 'break';
    if (bar < outroAt) return 'main';
    return 'outro';
  };
}

/** Which layers play in a section. */
const LAYERS = {
  intro: { drums: 0.55, hats: false, bass: false, chords: true, lead: false, perc: false },
  build: { drums: 0.8, hats: true, bass: true, chords: true, lead: false, perc: true },
  main:  { drums: 1, hats: true, bass: true, chords: true, lead: true, perc: true },
  break: { drums: 0, hats: false, bass: false, chords: true, lead: true, perc: false },
  outro: { drums: 0.7, hats: true, bass: true, chords: true, lead: false, perc: false },
};

/* ------------------------------------------------------------------ */
/* the render                                                          */
/* ------------------------------------------------------------------ */

/**
 * What a seed decides, before a note is rendered: the tempo, the key, the
 * chord progression, the melody motif and the lead's timbre.
 *
 * The library lists a track's key and tempo next to its name, and the render
 * has to agree with the listing — so both come from here rather than from two
 * copies of the same arithmetic that drift apart the first time either is
 * touched. The order of the calls into `rand` is the format: change it and
 * every track in the library becomes a different track.
 */
export function trackPlan({ style = 'trap', seed = 0, bpm = null, key = null } = {}) {
  const spec = BEAT_STYLES[style] || BEAT_STYLES.trap;
  const rand = rng(seed || 1);
  const tempo = Math.max(50, Math.min(210, bpm || spec.bpm + (seed ? Math.round((rand() - 0.5) * 8) : 0)));
  const keyIndex = key ? Math.max(0, KEYS.indexOf(key)) : (seed ? Math.floor(rand() * 12) : 0);
  const prog = PROGRESSIONS[seed ? Math.floor(rand() * PROGRESSIONS.length) : 0];
  /* An eight-note motif over two bars, drawn from the scale, mostly stepwise
     so it sounds written rather than shuffled. */
  const motif = [];
  let deg = 4;
  for (let i = 0; i < 8; i++) {
    motif.push(rand() < 0.18 ? null : deg);
    deg += [-2, -1, -1, 0, 1, 1, 2][Math.floor(rand() * 7)];
    deg = Math.max(0, Math.min(9, deg));
  }
  const leadType = ['square', 'sawtooth', 'triangle'][Math.floor(rand() * 3)];
  return { spec, rand, tempo, keyIndex, key: KEYS[keyIndex], prog, motif, leadType };
}

/** The twelve keys, in the order the seed picks from. */
export const MUSIC_KEYS = KEYS;

/**
 * Render a track. Returns { buffer, bpm, beats, bars, style, key, seed, seconds }.
 *
 * `seed` is what makes the library work: it picks the key, the progression,
 * the melody and the pattern variation, so the same id always renders the
 * same track and a project that references one still sounds right a year
 * later. Leave it out and you get the style's plain default.
 */
export async function renderBeat({ style = 'trap', bpm = null, seconds = 30, sampleRate = 44100, seed = 0, key = null } = {}) {
  const { spec, rand, tempo, keyIndex, prog, motif, leadType } = trackPlan({ style, seed, bpm, key });
  const beatLen = 60 / tempo, stepLen = beatLen / 4;
  const bars = Math.max(2, Math.ceil(seconds / (beatLen * 4)));
  const total = bars * 4 * beatLen + 1.4;
  const ctx = new OfflineAudioContext(2, Math.ceil(total * sampleRate), sampleRate);
  const bus = makeBus(ctx);
  const noise = noiseBuffer(ctx, 1.5);
  const pat = patterns(style);
  const scale = spec.scale || 'minor';
  const voices = spec.voices || [];
  const sevenths = scale === 'dorian' || spec.family === 'R&B' || spec.family === 'Chill';
  const root = keyIndex - 6;                       // keep it near the bottom of the range
  const sc = SCALES[scale];

  const sectionOf = arrange(bars);
  const beats = [];

  for (let bar = 0; bar < bars; bar++) {
    const barAt = bar * 4 * beatLen;
    const fill = (bar + 1) % 4 === 0;
    const section = sectionOf(bar);
    const L = LAYERS[section];
    const degree = prog[bar % prog.length];
    const chord = chordNotes(scale, degree, { seventh: sevenths });
    const chordRoot = root + chord[0];

    /* Chords, once a bar (twice in the busier styles). */
    if (L.chords) {
      const hits = spec.family === 'Rap' || spec.family === 'Dance' ? 1 : 2;
      for (let h = 0; h < hits; h++) {
        const at = barAt + h * (4 * beatLen / hits);
        const len = (4 * beatLen / hits) * 0.95;
        const notes = chord.map((n) => root + n);
        if (voices.includes('pad')) pad(ctx, bus, at, notes, len, section === 'break' ? 0.32 : 0.24);
        if (voices.includes('keys')) keys(ctx, bus, at, notes, len, 0.38, (rand() - 0.5) * 0.2);
        if (voices.includes('power')) power(ctx, bus, at, chordRoot, len, 0.26);
      }
      /* Plucks and arpeggios follow the chord rather than sitting on it. */
      if (voices.includes('pluck')) {
        for (let step = 2; step < 16; step += 4) {
          const at = barAt + step * stepLen;
          pluck(ctx, bus, at, root + chord[(step / 2) % chord.length], stepLen * 3, 0.28, step % 8 === 2 ? -0.35 : 0.35);
        }
      }
      if (voices.includes('arp')) {
        for (let step = 0; step < 16; step += 2) {
          const at = barAt + step * stepLen;
          const n = chord[(step / 2) % chord.length] + (step >= 8 ? 12 : 0);
          pluck(ctx, bus, at, root + n, stepLen * 1.6, 0.2, ((step / 2) % 2 ? 0.4 : -0.4));
        }
      }
    }

    /* The melody, over two bars, in the sections that carry it. */
    if (L.lead && voices.includes('lead')) {
      for (let i = 0; i < 4; i++) {
        const m = motif[(bar % 2) * 4 + i];
        if (m === null || m === undefined) continue;
        const at = barAt + i * beatLen;
        const n = root + sc[m % 7] + 12 * Math.floor(m / 7);
        lead(ctx, bus, at, n, beatLen * 0.85, section === 'break' ? 0.34 : 0.28, { type: leadType, pan: 0.12 });
      }
    }

    for (let step = 0; step < 16; step++) {
      const swing = (step % 2 === 1) ? pat.swing * stepLen : 0;
      const at = barAt + step * stepLen + swing;
      if (step % 4 === 0) beats.push(Number(at.toFixed(4)));
      if (L.drums && pat.kick[step]) kick(ctx, bus, at, pat.kick[step] * L.drums, { deep: spec.bassKind === '808' });
      if (L.drums && (pat.snare[step] || (fill && section !== 'break' && step >= 12 && step % 2 === 0))) {
        snare(ctx, bus, noise, at, (pat.snare[step] || 0.7) * L.drums, {
          bright: style !== 'lofi' && style !== 'jazzhop',
          clap: spec.family === 'Dance' || style === 'pop',
          gate: style === 'synthwave' ? 0.34 : 0,
        });
      }
      if (L.hats && pat.hat[step]) {
        hat(ctx, bus, noise, at, pat.hat[step] * (style === 'lofi' ? 0.6 : 1), pat.open ? !!pat.open[step] : false, ((step % 4) - 1.5) * 0.12);
      }
      if (L.perc && pat.bell[step]) bell(ctx, bus, at, pat.bell[step]);
      if (L.perc && (style === 'amapiano' || style === 'afrobeats' || style === 'cinematic') && step % 2 === 1) {
        shaker(ctx, bus, noise, at, 0.8, (step % 4 === 1 ? -0.3 : 0.3));
      }
      if (L.bass && pat.bass[step]) {
        // Hold until the next bass hit, or the end of the bar.
        let next = 16; for (let s = step + 1; s < 16; s++) if (pat.bass[s]) { next = s; break; }
        const walk = spec.bassKind === 'walk' ? chord[(step / 2 | 0) % chord.length] : chord[0];
        bassVoice(ctx, bus, at, root + walk, (next - step) * stepLen * 0.95, 1, spec.bassKind || 'sub', tempo);
      }
    }

    /* Risers into the sections that want announcing. */
    const nextSection = sectionOf(bar + 1);
    if (nextSection !== section && (nextSection === 'main' || nextSection === 'build')) {
      riser(ctx, bus, noise, barAt + 2 * beatLen, 2 * beatLen, 0.3);
    }
    if (style === 'cinematic' && (bar + 1) % 8 === 0 && bar + 1 < bars) riser(ctx, bus, noise, barAt, 4 * beatLen, 0.35);
  }

  /* The last beat is a hit, not a fade — a montage ends on something. */
  const endAt = bars * 4 * beatLen;
  kick(ctx, bus, endAt, 1.1); snare(ctx, bus, noise, endAt, 1);
  if (voices.includes('pad')) pad(ctx, bus, endAt, chordNotes(scale, 0, { seventh: sevenths }).map((n) => root + n), 1.2, 0.3);
  beats.push(Number(endAt.toFixed(4)));

  const buffer = await ctx.startRendering();
  // Normalise to a sane level, so it sits under a voice rather than over it.
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) { const d = buffer.getChannelData(ch); for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i])); }
  const norm = peak > 0 ? 0.85 / peak : 1;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) { const d = buffer.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] *= norm; }
  return { buffer, bpm: tempo, beats, bars, style, key: KEYS[keyIndex], seed, seconds: buffer.duration };
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
    anime: 'trap', phonk: 'phonk', velocity: 'dnb', cinematic: 'cinematic', trailer: 'trailer', sports: 'hype',
    gaming: 'hype', travel: 'house', vlog: 'lofi', lofi: 'lofi', drill: 'drill', horror: 'horror', wedding: 'slowjam',
    car: 'phonk', fitness: 'hype', glitch: 'dnb', meme: 'trap', music: 'house', product: 'pop', photo: 'lofi',
  }[genre] || 'trap';
}
