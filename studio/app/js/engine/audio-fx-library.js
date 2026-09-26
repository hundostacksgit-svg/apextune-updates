/*
 * The audio effect library: everything beyond the seventeen hand-built ones.
 *
 * Each entry is a recipe — an ordered list of the same building blocks the
 * hand-built chains use (filters, drive, reverb, delay, modulation, pitch,
 * noise layers), with the numbers tuned to each other. It is written as a
 * function of the parameters rather than a static list because the parameter
 * is usually not a single knob on one node: "size" on a hall moves the reverb
 * length, the pre-delay and the treble roll-off together, which is what makes
 * it read as a bigger room rather than a longer smear.
 *
 * Nothing here knows about the Web Audio graph directly. `R` is handed in by
 * buildAudioChain and every primitive on it appends to the same chain the
 * switch statement in audio-fx.js builds, on whichever context is asking —
 * live preview or offline export — so a recipe cannot sound different in the
 * export from what you heard. That single-path rule is the whole reason the
 * old seventeen were worth having, and a library that broke it would be worse
 * than none.
 *
 * Ordering inside a recipe matters and is the signal path. Drive before the
 * band-limit, always: distortion generates new frequencies right across the
 * spectrum, so filtering first is undone by the drive and you get "loud"
 * rather than "on a phone". Reverb last, so the room hears the finished sound.
 *
 * Every recipe is checked at load: it must name real parameters, and the test
 * suite renders every one of them and asserts it audibly changes the signal
 * without blowing up. A recipe that quietly does nothing is the failure mode
 * this library exists to avoid.
 */

/* ------------------------------------------------------------------ *
 * small helpers for the recipes
 * ------------------------------------------------------------------ */

/** A single 0..1 "amount" parameter, the common case. */
const amount = (label = 'Amount', def = 0.6, min = 0, max = 1) => ({
  defaults: { amount: def },
  params: [{ key: 'amount', label, min, max, step: 0.02 }],
});

/** Two parameters. */
const two = (a, b, defaults) => ({
  defaults,
  params: [a, b],
});

const P = (key, label, min = 0, max = 1, step = 0.02) => ({ key, label, min, max, step });

/* ------------------------------------------------------------------ *
 * the recipes
 * ------------------------------------------------------------------ */

export const AUDIO_FX_LIBRARY = {

  /* ================= Space — more rooms ================= */

  hall: {
    name: 'Concert hall', group: 'Space', blurb: 'Big, warm, and it lets the note finish.',
    ...amount('Size', 0.6),
    recipe: (p, R) => { const s = p('amount'); R.hp(60); R.reverb(1.6 + s * 3.4, 2.0, 0.34, { pre: 0.02 + s * 0.03 }); R.trim(1.4); },
  },
  chamber: {
    name: 'Chamber', group: 'Space', blurb: 'A wooden room. Rich, close and quick.',
    ...amount('Size', 0.45),
    recipe: (p, R) => { const s = p('amount'); R.reverb(0.6 + s * 1.2, 2.8, 0.5, { pre: 0.012 }); R.peak(600, 2, 0.7); R.trim(1.35); },
  },
  plate: {
    name: 'Plate', group: 'Space', blurb: 'The studio vocal reverb: bright, dense, no room in it.',
    ...amount('Decay', 0.55),
    recipe: (p, R) => { const s = p('amount'); R.hp(140); R.reverb(0.9 + s * 2.6, 1.7, 0.72, { pre: 0.008, dense: true }); R.highshelf(6000, 2); R.trim(1.3); },
  },
  spring: {
    name: 'Spring', group: 'Space', blurb: 'The reverb in a guitar amp. Boingy, metallic, a little seasick.',
    ...amount('Tension', 0.5),
    recipe: (p, R) => {
      const s = p('amount');
      R.bp(2200 - s * 600, 0.9);
      R.vibrato({ rate: 5.5, depth: 0.0012 });
      R.reverb(1.1 + s * 0.9, 2.2, 0.62, { pre: 0.03 });
      R.peak(2600, 6, 3);
      R.trim(1.5);
    },
  },
  bathroom: {
    name: 'Bathroom', group: 'Space', blurb: 'Hard tiles, tiny room. Everything flutters.',
    ...amount('Size', 0.4),
    recipe: (p, R) => { const s = p('amount'); R.delay({ time: 0.018 + s * 0.02, feedback: 0.55, tone: 5000, mix: 0.6 }); R.reverb(0.45 + s * 0.4, 3.2, 0.7); R.peak(1800, 4, 2); R.trim(1.25); },
  },
  church: {
    name: 'Church', group: 'Space', blurb: 'Stone and height. Warmer than the cathedral, and half the size.',
    ...amount('Size', 0.6),
    recipe: (p, R) => { const s = p('amount'); R.hp(80); R.reverb(1.4 + s * 2.4, 2.0, 0.36, { pre: 0.03 }); R.peak(300, 3, 0.8); R.trim(1.45); },
  },
  cave: {
    name: 'Cave', group: 'Space', blurb: 'Wet rock. Dark, dripping, and it goes on for a while.',
    ...amount('Depth', 0.65),
    recipe: (p, R) => { const s = p('amount'); R.lp(3200); R.delay({ time: 0.16 + s * 0.2, feedback: 0.35, tone: 1800, mix: 0.5 }); R.reverb(2 + s * 3, 1.8, 0.2); R.trim(1.4); },
  },
  tunnel: {
    name: 'Tunnel', group: 'Space', blurb: 'A long pipe. The echoes line up down the middle.',
    ...amount('Length', 0.6),
    recipe: (p, R) => { const s = p('amount'); R.bp(900, 0.6); R.delay({ time: 0.07 + s * 0.09, feedback: 0.62, tone: 2400, mix: 0.7 }); R.reverb(1.2 + s, 2.4, 0.3); R.trim(1.5); },
  },
  carPark: {
    name: 'Car park', group: 'Space', blurb: 'Concrete in every direction. Boomy and long.',
    ...amount('Size', 0.6),
    recipe: (p, R) => { const s = p('amount'); R.peak(120, 6, 0.9); R.delay({ time: 0.11, feedback: 0.4, tone: 1500, mix: 0.5 }); R.reverb(1.8 + s * 2.2, 2.0, 0.26); R.trim(1.35); },
  },
  arena: {
    name: 'Arena', group: 'Space', blurb: 'Announcer in a stadium bowl, with the far-wall slap.',
    ...amount('Size', 0.7),
    recipe: (p, R) => { const s = p('amount'); R.hp(180); R.peak(2200, 5, 1.6); R.delay({ time: 0.22 + s * 0.16, feedback: 0.3, tone: 2800, mix: 0.55 }); R.reverb(2 + s * 2.5, 1.9, 0.38); R.trim(1.35); },
  },
  gym: {
    name: 'Gymnasium', group: 'Space', blurb: 'Hardwood and high ceilings. Every word bounces twice.',
    ...amount('Size', 0.55),
    recipe: (p, R) => { const s = p('amount'); R.delay({ time: 0.06 + s * 0.05, feedback: 0.45, tone: 3500, mix: 0.5 }); R.reverb(1.3 + s * 1.4, 2.3, 0.5); R.trim(1.35); },
  },
  closet: {
    name: 'Closet', group: 'Space', blurb: 'Coats all round. Dead, close, and a bit boxy.',
    ...amount('Boxiness', 0.5),
    recipe: (p, R) => { const s = p('amount'); R.lp(6500); R.peak(380, 3 + s * 4, 2); R.reverb(0.12 + s * 0.12, 4, 0.3); R.trim(1.2); },
  },
  canyon: {
    name: 'Canyon', group: 'Space', blurb: 'The shout comes back a second later, and then again.',
    ...amount('Distance', 0.6),
    recipe: (p, R) => { const s = p('amount'); R.delay({ time: 0.35 + s * 0.6, feedback: 0.42, tone: 2200, mix: 0.6 }); R.reverb(1.0, 2.6, 0.3); R.trim(1.3); },
  },
  outdoors: {
    name: 'Outdoors', group: 'Space', blurb: 'No walls at all. Dry, a touch thin, one distant slap off something.',
    ...amount('Openness', 0.5),
    recipe: (p, R) => { const s = p('amount'); R.hp(110); R.highshelf(7000, -2); R.delay({ time: 0.18 + s * 0.2, feedback: 0.08, tone: 1800, mix: 0.18 }); R.trim(1.05); },
  },

  /* ================= Echo ================= */

  slapback: {
    name: 'Slapback', group: 'Echo', blurb: 'One quick repeat. The rockabilly vocal, the 50s radio voice.',
    ...amount('Delay', 0.4),
    recipe: (p, R) => { R.delay({ time: 0.06 + p('amount') * 0.1, feedback: 0.05, tone: 4500, mix: 0.5 }); },
  },
  tapeEcho: {
    name: 'Tape echo', group: 'Echo', blurb: 'Repeats that get darker and wobblier each time round.',
    ...two(P('time', 'Time', 0.08, 0.8, 0.01), P('feedback', 'Repeats', 0, 0.85), { time: 0.32, feedback: 0.45 }),
    recipe: (p, R) => { R.delay({ time: p('time'), feedback: p('feedback'), tone: 2600, wobble: 0.0006, mix: 0.55 }); },
  },
  pingPong: {
    name: 'Ping-pong', group: 'Echo', blurb: 'Left, right, left, right. The stereo bounce.',
    ...two(P('time', 'Time', 0.08, 0.8, 0.01), P('feedback', 'Repeats', 0, 0.85), { time: 0.28, feedback: 0.5 }),
    recipe: (p, R) => { R.delay({ time: p('time'), feedback: p('feedback'), tone: 5000, pingpong: true, mix: 0.6 }); },
  },
  dubEcho: {
    name: 'Dub echo', group: 'Echo', blurb: 'Long, filtered, feeding back on itself until it almost runs away.',
    ...amount('Feedback', 0.65, 0, 0.92),
    recipe: (p, R) => { R.delay({ time: 0.375, feedback: p('amount'), tone: 1600, hp: 300, mix: 0.65 }); R.trim(0.9); },
  },
  eighth: {
    name: 'Eighth note', group: 'Echo', blurb: 'A repeat every eighth at 120 BPM. Set the speed to match your track.',
    ...two(P('bpm', 'BPM', 60, 200, 1), P('feedback', 'Repeats', 0, 0.85), { bpm: 120, feedback: 0.4 }),
    recipe: (p, R) => { R.delay({ time: 30 / p('bpm'), feedback: p('feedback'), tone: 5500, mix: 0.5 }); },
  },
  dotted: {
    name: 'Dotted eighth', group: 'Echo', blurb: 'The U2 delay. Repeats that skip and chase the beat.',
    ...two(P('bpm', 'BPM', 60, 200, 1), P('feedback', 'Repeats', 0, 0.85), { bpm: 120, feedback: 0.45 }),
    recipe: (p, R) => { R.delay({ time: 45 / p('bpm'), feedback: p('feedback'), tone: 5000, mix: 0.5 }); },
  },
  quarter: {
    name: 'Quarter note', group: 'Echo', blurb: 'One repeat per beat. Sits right on the pulse.',
    ...two(P('bpm', 'BPM', 60, 200, 1), P('feedback', 'Repeats', 0, 0.85), { bpm: 120, feedback: 0.35 }),
    recipe: (p, R) => { R.delay({ time: 60 / p('bpm'), feedback: p('feedback'), tone: 5000, mix: 0.5 }); },
  },
  triplet: {
    name: 'Triplet', group: 'Echo', blurb: 'Three repeats in the space of two. Swings.',
    ...two(P('bpm', 'BPM', 60, 200, 1), P('feedback', 'Repeats', 0, 0.85), { bpm: 120, feedback: 0.4 }),
    recipe: (p, R) => { R.delay({ time: 40 / p('bpm'), feedback: p('feedback'), tone: 5000, mix: 0.5 }); },
  },
  infinite: {
    name: 'Infinite', group: 'Echo', blurb: 'Repeats that never quite die. For the last word of a trailer.',
    ...amount('Hold', 0.8, 0.5, 0.96),
    recipe: (p, R) => { R.delay({ time: 0.42, feedback: p('amount'), tone: 3000, hp: 200, mix: 0.6 }); R.compress({ threshold: -18, ratio: 6 }); R.trim(0.85); },
  },
  mountain: {
    name: 'Mountain echo', group: 'Echo', blurb: 'The far-off repeat with the air taken out of it.',
    ...amount('Distance', 0.6),
    recipe: (p, R) => { R.delay({ time: 0.5 + p('amount') * 0.8, feedback: 0.3, tone: 1400, hp: 250, mix: 0.55 }); R.reverb(1.4, 2.4, 0.3); R.trim(1.2); },
  },
  phoneEcho: {
    name: 'Telephone echo', group: 'Echo', blurb: 'A phone line with the far end bleeding back down it.',
    ...amount('Bleed', 0.5),
    recipe: (p, R) => { R.drive(0.25); R.hp(320); R.lp(3400); R.lp(3400); R.delay({ time: 0.19, feedback: 0.25 + p('amount') * 0.4, tone: 2800, mix: 0.45 }); R.trim(0.7); },
  },
  reverseFeel: {
    name: 'Swell', group: 'Echo', blurb: 'Ramps in like a reversed tape without actually reversing anything.',
    ...amount('Length', 0.5),
    recipe: (p, R) => { R.swell(0.4 + p('amount') * 1.2); R.reverb(1.6, 2.2, 0.4); R.trim(1.3); },
  },

  /* ================= Modulation ================= */

  chorus: {
    name: 'Chorus', group: 'Modulation', blurb: 'Two of you, slightly apart. Wider and softer.',
    ...two(P('rate', 'Speed', 0.1, 4, 0.05), P('depth', 'Depth', 0, 1), { rate: 0.8, depth: 0.5 }),
    recipe: (p, R) => { R.chorus({ rate: p('rate'), depth: p('depth'), voices: 2 }); },
  },
  deepChorus: {
    name: 'Deep chorus', group: 'Modulation', blurb: 'Four voices, big and swimming. The 80s ballad.',
    ...two(P('rate', 'Speed', 0.1, 4, 0.05), P('depth', 'Depth', 0, 1), { rate: 0.5, depth: 0.75 }),
    recipe: (p, R) => { R.chorus({ rate: p('rate'), depth: p('depth'), voices: 4 }); R.width(0.5); },
  },
  flanger: {
    name: 'Flanger', group: 'Modulation', blurb: 'The jet-plane sweep. Hollow, metallic, moving.',
    ...two(P('rate', 'Speed', 0.05, 3, 0.05), P('feedback', 'Intensity', 0, 0.9), { rate: 0.3, feedback: 0.55 }),
    recipe: (p, R) => { R.flanger({ rate: p('rate'), feedback: p('feedback'), depth: 0.0025 }); },
  },
  jetFlanger: {
    name: 'Jet flanger', group: 'Modulation', blurb: 'The same sweep, cranked until it screams.',
    ...amount('Speed', 0.15, 0.05, 2),
    recipe: (p, R) => { R.flanger({ rate: p('amount'), feedback: 0.82, depth: 0.004 }); R.trim(0.85); },
  },
  phaser: {
    name: 'Phaser', group: 'Modulation', blurb: 'Notches sweeping through. Smoother than a flanger, more psychedelic.',
    ...two(P('rate', 'Speed', 0.05, 4, 0.05), P('depth', 'Depth', 0, 1), { rate: 0.4, depth: 0.7 }),
    recipe: (p, R) => { R.phaser({ rate: p('rate'), depth: p('depth'), stages: 4 }); },
  },
  slowPhaser: {
    name: 'Slow phaser', group: 'Modulation', blurb: 'Eight stages, glacial. Barely moving, always moving.',
    ...amount('Depth', 0.8),
    recipe: (p, R) => { R.phaser({ rate: 0.08, depth: p('amount'), stages: 8 }); },
  },
  tremolo: {
    name: 'Tremolo', group: 'Modulation', blurb: 'The volume wobbles. The surf-guitar shimmer.',
    ...two(P('rate', 'Speed', 0.5, 16, 0.1), P('depth', 'Depth', 0, 1), { rate: 5, depth: 0.6 }),
    recipe: (p, R) => { R.tremolo({ rate: p('rate'), depth: p('depth'), shape: 'sine' }); },
  },
  helicopter: {
    name: 'Helicopter', group: 'Modulation', blurb: 'Hard, square, fast tremolo. Chops the sound into blades.',
    ...amount('Speed', 0.5),
    recipe: (p, R) => { R.tremolo({ rate: 8 + p('amount') * 20, depth: 0.95, shape: 'square' }); },
  },
  vibrato: {
    name: 'Vibrato', group: 'Modulation', blurb: 'The pitch wobbles, the volume does not. A warbling tape.',
    ...two(P('rate', 'Speed', 0.5, 12, 0.1), P('depth', 'Depth', 0, 1), { rate: 5.5, depth: 0.4 }),
    recipe: (p, R) => { R.vibrato({ rate: p('rate'), depth: 0.0006 + p('depth') * 0.004 }); },
  },
  wobble: {
    name: 'Wobble', group: 'Modulation', blurb: 'A slow, sick, drunken pitch drift.',
    ...amount('Amount', 0.6),
    recipe: (p, R) => { R.vibrato({ rate: 0.7, depth: 0.002 + p('amount') * 0.008 }); R.lp(8000); },
  },
  autowah: {
    name: 'Auto-wah', group: 'Modulation', blurb: 'A filter that opens and closes on its own. Funk.',
    ...two(P('rate', 'Speed', 0.2, 8, 0.1), P('depth', 'Depth', 0, 1), { rate: 2, depth: 0.7 }),
    recipe: (p, R) => { R.autowah({ rate: p('rate'), depth: p('depth') }); R.trim(1.4); },
  },
  rotary: {
    name: 'Rotary speaker', group: 'Modulation', blurb: 'The Leslie cabinet. Everything spins.',
    ...amount('Speed', 0.5),
    recipe: (p, R) => { const s = p('amount'); const rate = 0.7 + s * 6; R.tremolo({ rate, depth: 0.35, shape: 'sine' }); R.vibrato({ rate, depth: 0.0018 }); R.chorus({ rate: rate * 0.5, depth: 0.4, voices: 2 }); },
  },
  doubler: {
    name: 'Doubler', group: 'Modulation', blurb: 'The take, sung twice. Thicker without sounding processed.',
    ...amount('Spread', 0.5),
    recipe: (p, R) => { R.doubler({ spread: p('amount') }); },
  },
  detune: {
    name: 'Detune', group: 'Modulation', blurb: 'A few cents sharp and flat at once. Wide and slightly wrong.',
    ...amount('Cents', 0.4),
    recipe: (p, R) => { R.detune({ cents: 6 + p('amount') * 30 }); },
  },
  ringMod: {
    name: 'Ring modulator', group: 'Modulation', blurb: 'The bell-like clang. Multiplies the sound by a tone.',
    ...amount('Frequency', 0.35),
    recipe: (p, R) => { R.ring(40 + p('amount') * 900, 1); R.hp(90); R.trim(1.6); },
  },

  /* ================= Distortion ================= */

  overdrive: {
    name: 'Overdrive', group: 'Distortion', blurb: 'Warm, soft clipping. Pushed, not broken.',
    ...amount('Drive', 0.4),
    recipe: (p, R) => { R.drive(0.15 + p('amount') * 0.45); R.lp(9000); R.trim(0.85); },
  },
  fuzz: {
    name: 'Fuzz', group: 'Distortion', blurb: 'Square-wave nasty. The 60s pedal.',
    ...amount('Fuzz', 0.7),
    recipe: (p, R) => { R.hp(120); R.drive(0.6 + p('amount') * 0.4); R.lp(5500); R.trim(0.6); },
  },
  saturate: {
    name: 'Saturation', group: 'Distortion', blurb: 'Just the edge of the tape. Glue and a little sheen.',
    ...amount('Amount', 0.35),
    recipe: (p, R) => { R.drive(0.05 + p('amount') * 0.2); R.highshelf(8000, 1.5); R.trim(0.95); },
  },
  tube: {
    name: 'Tube warmth', group: 'Distortion', blurb: 'Valve even harmonics. Rounder, fuller, a little sweeter.',
    ...amount('Warmth', 0.5),
    recipe: (p, R) => { R.driveAsym(0.1 + p('amount') * 0.35); R.peak(200, 2, 0.7); R.lp(12000); R.trim(0.9); },
  },
  crunch: {
    name: 'Crunch', group: 'Distortion', blurb: 'Amp on the edge of breakup. Bites when you push it.',
    ...amount('Gain', 0.55),
    recipe: (p, R) => { R.peak(800, 4, 1); R.drive(0.3 + p('amount') * 0.5); R.lp(6500); R.hp(90); R.trim(0.7); },
  },
  blownSpeaker: {
    name: 'Blown speaker', group: 'Distortion', blurb: 'A cone that has given up. Buzzy, papery, rattling.',
    ...amount('Damage', 0.6),
    recipe: (p, R) => { R.hp(200); R.drive(0.5 + p('amount') * 0.5); R.peak(1500, 8, 4); R.lp(3800); R.trim(0.55); },
  },
  hardClip: {
    name: 'Hard clip', group: 'Distortion', blurb: 'The digital brick wall. Flat-topped and harsh.',
    ...amount('Amount', 0.6),
    recipe: (p, R) => { R.clip(0.9 - p('amount') * 0.75); R.trim(0.8); },
  },
  tapeSat: {
    name: 'Tape saturation', group: 'Distortion', blurb: 'Hit the tape hard. Soft top, thick bottom, gentle hiss.',
    ...amount('Amount', 0.5),
    recipe: (p, R) => { const s = p('amount'); R.drive(0.1 + s * 0.3); R.lowshelf(150, 2 + s * 2); R.lp(14000 - s * 5000); R.noise({ kind: 'white', gain: 0.004 + s * 0.008, lp: 8000, hp: 2000 }); R.trim(0.9); },
  },
  bitReduce: {
    name: '4-bit', group: 'Distortion', blurb: 'Even fewer levels than 8-bit. Crumbling.',
    ...amount('Crush', 0.7),
    recipe: (p, R) => { R.crush(0.6 + p('amount') * 0.4); R.lp(4200); R.trim(1.0); },
  },
  sampleCrush: {
    name: 'Sample-rate crush', group: 'Distortion', blurb: 'Aliasing. The sound of a 90s sampler running out of memory.',
    ...amount('Amount', 0.6),
    recipe: (p, R) => { R.decimate(0.2 + p('amount') * 0.7); R.lp(7000); R.trim(1.0); },
  },
  broken: {
    name: 'Broken', group: 'Distortion', blurb: 'Crushed, clipped, band-limited and rattling. Nothing survives.',
    ...amount('Amount', 0.7),
    recipe: (p, R) => { const s = p('amount'); R.drive(0.7); R.crush(0.4 + s * 0.5); R.bp(1200, 0.5); R.tremolo({ rate: 13, depth: 0.5, shape: 'square' }); R.trim(1.1); },
  },

  /* ================= Lo-fi ================= */

  cassette: {
    name: 'Cassette', group: 'Lo-fi', blurb: 'A tape from a shoebox. Dull, warbling, hissing gently.',
    ...amount('Wear', 0.5),
    recipe: (p, R) => { const s = p('amount'); R.lp(9000 - s * 4500); R.hp(70); R.vibrato({ rate: 0.6, depth: 0.0008 + s * 0.002 }); R.drive(0.08); R.noise({ kind: 'white', gain: 0.006 + s * 0.012, lp: 6000, hp: 1500 }); R.trim(1.05); },
  },
  walkie: {
    name: 'Walkie-talkie', group: 'Lo-fi', blurb: 'Squelch, crackle and a voice fighting through the static.',
    ...amount('Static', 0.5),
    recipe: (p, R) => { const s = p('amount'); R.drive(0.5); R.hp(450); R.lp(2800); R.lp(2800); R.peak(1500, 6, 2); R.noise({ kind: 'white', gain: 0.02 + s * 0.05, lp: 5000, hp: 800, lfoRate: 7, lfoDepth: 0.8 }); R.trim(0.5); },
  },
  amRadio: {
    name: 'AM radio', group: 'Lo-fi', blurb: 'The car radio in 1974. Narrow, warm, drifting.',
    ...amount('Drift', 0.4),
    recipe: (p, R) => { const s = p('amount'); R.drive(0.25); R.hp(200); R.lp(4200); R.peak(900, 4, 1.2); R.tremolo({ rate: 0.3, depth: 0.15 + s * 0.3, shape: 'sine' }); R.noise({ kind: 'white', gain: 0.008 + s * 0.02, lp: 3500, hp: 600 }); R.trim(0.6); },
  },
  shortwave: {
    name: 'Shortwave', group: 'Lo-fi', blurb: 'A signal from another continent, fading in and out.',
    ...amount('Fade', 0.6),
    recipe: (p, R) => { const s = p('amount'); R.drive(0.35); R.bp(1400, 0.8); R.ring(2 + s * 6, 0.35); R.tremolo({ rate: 0.18, depth: 0.5 + s * 0.4, shape: 'sine' }); R.noise({ kind: 'white', gain: 0.03, lp: 4000, hp: 500, lfoRate: 0.3, lfoDepth: 0.7 }); R.trim(0.7); },
  },
  dictaphone: {
    name: 'Dictaphone', group: 'Lo-fi', blurb: 'A microcassette recorder held too close. Thin and hissy.',
    ...amount('Age', 0.5),
    recipe: (p, R) => { const s = p('amount'); R.hp(300); R.lp(5000 - s * 1500); R.drive(0.2); R.peak(2200, 5, 1.5); R.noise({ kind: 'white', gain: 0.01 + s * 0.02, lp: 7000, hp: 2500 }); R.trim(0.7); },
  },
  gramophone: {
    name: 'Gramophone', group: 'Lo-fi', blurb: 'A 78 on a horn. Crackle, wow, and no bass at all.',
    ...amount('Age', 0.6),
    recipe: (p, R) => { const s = p('amount'); R.hp(350); R.lp(3200); R.peak(1200, 6, 1.2); R.vibrato({ rate: 1.3, depth: 0.0015 + s * 0.003 }); R.noise({ kind: 'crackle', gain: 0.4 + s * 0.6, lp: 5000, hp: 1000 }); R.trim(0.75); },
  },
  answerphone: {
    name: 'Answering machine', group: 'Lo-fi', blurb: 'The message you were not meant to hear.',
    ...amount('Wear', 0.5),
    recipe: (p, R) => { const s = p('amount'); R.drive(0.3); R.hp(280); R.lp(3000); R.crush(0.25 + s * 0.25); R.peak(1000, 5, 1.5); R.noise({ kind: 'white', gain: 0.006, lp: 3000, hp: 800 }); R.trim(0.6); },
  },
  laptop: {
    name: 'Laptop speaker', group: 'Lo-fi', blurb: 'Tinny, no bottom, a little honky at 3k.',
    ...amount('Cheapness', 0.6),
    recipe: (p, R) => { const s = p('amount'); R.hp(300 + s * 250); R.peak(3200, 6, 2.5); R.lp(11000); R.drive(0.1 + s * 0.15); R.trim(0.8); },
  },
  earbuds: {
    name: 'Leaking earbuds', group: 'Lo-fi', blurb: 'What the person next to you on the train hears.',
    ...amount('Leak', 0.5),
    recipe: (p, R) => { R.hp(1800); R.peak(4500, 5, 2); R.lp(9000); R.trim(0.9 + p('amount') * 0.6); },
  },
  driveThru: {
    name: 'Drive-thru', group: 'Lo-fi', blurb: 'Would you like fries with that. Nobody has ever understood the answer.',
    ...amount('Crunch', 0.6),
    recipe: (p, R) => { const s = p('amount'); R.drive(0.45 + s * 0.3); R.bp(1300, 1.4); R.crush(0.3); R.noise({ kind: 'white', gain: 0.02, lp: 3000, hp: 700 }); R.trim(0.75); },
  },
  intercom: {
    name: 'Intercom', group: 'Lo-fi', blurb: 'A small speaker in a wall. Flat, buzzy, official.',
    ...amount('Buzz', 0.4),
    recipe: (p, R) => { const s = p('amount'); R.drive(0.3); R.hp(380); R.lp(3600); R.peak(2400, 5, 2); R.noise({ kind: 'hum', gain: 0.004 + s * 0.02 }); R.trim(0.7); },
  },
  schoolPA: {
    name: 'School PA', group: 'Lo-fi', blurb: 'The tannoy in the corridor, and the corridor.',
    ...amount('Distance', 0.5),
    recipe: (p, R) => { const s = p('amount'); R.drive(0.35); R.hp(400); R.lp(4000); R.peak(2000, 7, 2.5); R.reverb(0.9 + s * 1.6, 2.2, 0.35); R.trim(0.65); },
  },
  babyMonitor: {
    name: 'Baby monitor', group: 'Lo-fi', blurb: 'Through a cheap radio link, with the room behind it.',
    ...amount('Static', 0.5),
    recipe: (p, R) => { const s = p('amount'); R.hp(250); R.lp(3200); R.drive(0.2); R.reverb(0.4, 3, 0.5); R.noise({ kind: 'white', gain: 0.015 + s * 0.03, lp: 6000, hp: 1200 }); R.trim(0.75); },
  },
  cbRadio: {
    name: 'CB radio', group: 'Lo-fi', blurb: 'Breaker one-nine. Compressed hard and squeezed through a tin box.',
    ...amount('Squeeze', 0.6),
    recipe: (p, R) => { R.compress({ threshold: -30, ratio: 12, attack: 0.002, release: 0.08 }); R.drive(0.4 + p('amount') * 0.3); R.hp(400); R.lp(2600); R.peak(1700, 6, 2); R.trim(0.55); },
  },
  lofiBeat: {
    name: 'Lo-fi beat', group: 'Lo-fi', blurb: 'The study-playlist sound: dull top, tape wobble, vinyl bed.',
    ...amount('Amount', 0.55),
    recipe: (p, R) => { const s = p('amount'); R.lp(7500 - s * 3000); R.lowshelf(120, 2); R.vibrato({ rate: 0.4, depth: 0.0006 + s * 0.0012 }); R.drive(0.08); R.noise({ kind: 'crackle', gain: 0.25 + s * 0.4, lp: 4000, hp: 900 }); R.trim(1.05); },
  },
  underwaterDeep: {
    name: 'Deep water', group: 'Lo-fi', blurb: 'Further down than Underwater. Only the pressure gets through.',
    ...amount('Depth', 0.7),
    recipe: (p, R) => { const s = p('amount'); R.lp(600 - s * 350, 4); R.peak(150, 6, 0.9); R.vibrato({ rate: 0.4, depth: 0.003 }); R.reverb(2.2, 2, 0.15); R.trim(1.5); },
  },

  /* ================= Voice ================= */

  podcast: {
    name: 'Podcast', group: 'Voice', blurb: 'Close, even, warm, present. The mic you wish you had.',
    ...amount('Polish', 0.6),
    recipe: (p, R) => { const s = p('amount'); R.hp(80); R.lowshelf(140, 2 + s * 2); R.peak(3000, 2 + s * 2, 1.2); R.highshelf(9000, 1 + s); R.compress({ threshold: -22, ratio: 3.5, attack: 0.01, release: 0.15 }); R.trim(1.15); },
  },
  radioDJ: {
    name: 'Radio DJ', group: 'Voice', blurb: 'Compressed to within an inch of its life. The FM voice.',
    ...amount('Squash', 0.7),
    recipe: (p, R) => { const s = p('amount'); R.hp(90); R.lowshelf(120, 4); R.peak(2500, 3, 1.4); R.compress({ threshold: -28 - s * 8, ratio: 8 + s * 8, attack: 0.003, release: 0.1 }); R.driveAsym(0.08); R.trim(1.2); },
  },
  trailer: {
    name: 'Movie trailer', group: 'Voice', blurb: 'In a world. Huge, low, and it fills the room.',
    ...amount('Size', 0.6),
    recipe: (p, R) => { const s = p('amount'); R.pitch(-3); R.lowshelf(160, 5 + s * 3); R.peak(2200, 3, 1.2); R.compress({ threshold: -26, ratio: 6, attack: 0.005, release: 0.2 }); R.reverb(0.9 + s * 1.2, 2.4, 0.35, { pre: 0.03 }); R.trim(1.25); },
  },
  asmr: {
    name: 'ASMR whisper', group: 'Voice', blurb: 'Right in your ear. Every breath and click brought up.',
    ...amount('Closeness', 0.7),
    recipe: (p, R) => { const s = p('amount'); R.hp(120); R.highshelf(6000, 3 + s * 4); R.peak(9000, 3, 1.5); R.compress({ threshold: -34, ratio: 4, attack: 0.002, release: 0.12 }); R.width(0.3 + s * 0.4); R.trim(1.5); },
  },
  announcer: {
    name: 'Announcer', group: 'Voice', blurb: 'Ladies and gentlemen. Bright, forward, and heard at the back.',
    ...amount('Presence', 0.6),
    recipe: (p, R) => { const s = p('amount'); R.hp(140); R.peak(3500, 3 + s * 4, 1.4); R.compress({ threshold: -24, ratio: 5, attack: 0.004, release: 0.12 }); R.reverb(0.5, 3, 0.5); R.trim(1.15); },
  },
  darkLord: {
    name: 'Dark lord', group: 'Voice', blurb: 'Deep, breathing through a mask, from inside a helmet.',
    ...amount('Menace', 0.7),
    recipe: (p, R) => { const s = p('amount'); R.pitch(-6); R.lp(3800); R.peak(180, 6, 0.9); R.ring(28 + s * 20, 0.3); R.reverb(0.35, 3.5, 0.3); R.trim(1.5); },
  },
  monster: {
    name: 'Monster', group: 'Voice', blurb: 'Down an octave and growling. Nothing human left.',
    ...amount('Growl', 0.7),
    recipe: (p, R) => { const s = p('amount'); R.pitch(-9); R.drive(0.3 + s * 0.4); R.lp(2600); R.peak(120, 7, 0.9); R.tremolo({ rate: 24, depth: 0.25, shape: 'sine' }); R.reverb(0.8, 2.6, 0.25); R.trim(0.8); },
  },
  ghost: {
    name: 'Ghost', group: 'Voice', blurb: 'Thin, far, and it lingers after the words.',
    ...amount('Haunt', 0.6),
    recipe: (p, R) => { const s = p('amount'); R.hp(500); R.pitch(3); R.chorus({ rate: 0.3, depth: 0.7, voices: 3 }); R.reverb(2.5 + s * 3, 1.8, 0.45, { pre: 0.04 }); R.trim(1.5); },
  },
  demon: {
    name: 'Demon', group: 'Voice', blurb: 'Two voices at once, one of them very wrong.',
    ...amount('Evil', 0.7),
    recipe: (p, R) => { const s = p('amount'); R.harmony({ semitones: -12, mix: 0.6 }); R.drive(0.2 + s * 0.3); R.ring(35, 0.25); R.lp(3200); R.reverb(1.2, 2.4, 0.25); R.trim(0.85); },
  },
  child: {
    name: 'Child', group: 'Voice', blurb: 'Up a few notes, brighter, without going chipmunk.',
    ...amount('Age', 0.5),
    recipe: (p, R) => { R.pitch(3 + Math.round(p('amount') * 3)); R.highshelf(5000, 2); R.peak(250, -3, 0.9); },
  },
  cartoon: {
    name: 'Cartoon', group: 'Voice', blurb: 'Squeaky, springy, and a little bit nasal.',
    ...amount('Silliness', 0.6),
    recipe: (p, R) => { const s = p('amount'); R.pitch(5 + Math.round(s * 4)); R.peak(2800, 6, 2); R.vibrato({ rate: 6.5, depth: 0.0012 }); R.trim(1.05); },
  },
  giant: {
    name: 'Giant', group: 'Voice', blurb: 'Fee fi fo fum. Slow-feeling, low, and enormous.',
    ...amount('Size', 0.7),
    recipe: (p, R) => { const s = p('amount'); R.pitch(-7 - Math.round(s * 4)); R.lowshelf(200, 5); R.lp(3500); R.reverb(1.8 + s * 2, 2.1, 0.25, { pre: 0.05 }); R.trim(1.3); },
  },
  tiny: {
    name: 'Tiny', group: 'Voice', blurb: 'Someone very small, standing on the table.',
    ...amount('Size', 0.6),
    recipe: (p, R) => { const s = p('amount'); R.pitch(7 + Math.round(s * 5)); R.hp(400); R.highshelf(6000, 3); R.reverb(0.15, 4, 0.7); R.trim(1.0); },
  },
  mumble: {
    name: 'Mumble', group: 'Voice', blurb: 'Talking into a pillow. Words gone, feeling kept.',
    ...amount('Amount', 0.6),
    recipe: (p, R) => { const s = p('amount'); R.lp(1400 - s * 700, 1.2); R.peak(300, 4, 0.9); R.trim(1.4); },
  },
  clarity: {
    name: 'Clarity', group: 'Voice', blurb: 'Presence and air on a muddy recording. The one to try first.',
    ...amount('Amount', 0.5),
    recipe: (p, R) => { const s = p('amount'); R.hp(100); R.peak(350, -2 - s * 3, 1.1); R.peak(2800, 2 + s * 3, 1.3); R.highshelf(8000, 1 + s * 2); },
  },
  deEss: {
    name: 'De-ess', group: 'Voice', blurb: 'Takes the sharp edge off S and T sounds.',
    ...amount('Amount', 0.5),
    recipe: (p, R) => { const s = p('amount'); R.peak(6500, -3 - s * 6, 2.2); R.highshelf(10000, -1 - s * 2); },
  },

  /* ================= Machine ================= */

  cyborg: {
    name: 'Cyborg', group: 'Machine', blurb: 'Half a person. The ring is there but the words survive.',
    ...amount('Amount', 0.5),
    recipe: (p, R) => { R.ring(80 + p('amount') * 120, 0.45); R.peak(1800, 4, 1.5); R.hp(120); R.trim(1.4); },
  },
  dalek: {
    name: 'Exterminate', group: 'Machine', blurb: 'The ring modulator at 30Hz, exactly as the BBC did it.',
    ...amount('Amount', 0.8),
    recipe: (p, R) => { R.ring(30, 0.6 + p('amount') * 0.4); R.drive(0.25); R.bp(1600, 0.7); R.trim(1.6); },
  },
  computer: {
    name: 'Computer', group: 'Machine', blurb: 'A 1980s speech chip. Buzzy, stepped, monotone.',
    ...amount('Amount', 0.7),
    recipe: (p, R) => { const s = p('amount'); R.crush(0.35 + s * 0.35); R.decimate(0.4); R.bp(1400, 0.8); R.tremolo({ rate: 50, depth: 0.2, shape: 'square' }); R.trim(1.2); },
  },
  vocoder: {
    name: 'Vocoder-ish', group: 'Machine', blurb: 'The talk-box robot. Sung through a synthesiser.',
    ...amount('Tone', 0.5),
    recipe: (p, R) => { const s = p('amount'); R.ring(110 + s * 110, 0.7); R.harmony({ semitones: 7, mix: 0.4 }); R.bp(1100, 1.1); R.peak(2400, 5, 2); R.trim(1.5); },
  },
  transformer: {
    name: 'Transformer', group: 'Machine', blurb: 'Metal shifting. Flanged, ringing, mechanical.',
    ...amount('Amount', 0.6),
    recipe: (p, R) => { const s = p('amount'); R.pitch(-4); R.ring(55, 0.35 + s * 0.3); R.flanger({ rate: 0.5, feedback: 0.7, depth: 0.003 }); R.lp(4500); R.trim(1.3); },
  },
  stutter8: {
    name: 'Stutter ⅛', group: 'Machine', blurb: 'Chopped eight times a beat at 120. Set the speed to your track.',
    ...amount('BPM', 120, 60, 200),
    recipe: (p, R) => { R.tremolo({ rate: (p('amount') / 60) * 2, depth: 1, shape: 'square', duty: 0.5 }); },
  },
  stutter16: {
    name: 'Stutter ¹⁄₁₆', group: 'Machine', blurb: 'Sixteenths. The glitch-hop chop.',
    ...amount('BPM', 120, 60, 200),
    recipe: (p, R) => { R.tremolo({ rate: (p('amount') / 60) * 4, depth: 1, shape: 'square', duty: 0.5 }); },
  },
  staticBurst: {
    name: 'Static bursts', group: 'Machine', blurb: 'The signal keeps dropping to noise and coming back.',
    ...amount('How often', 0.5),
    recipe: (p, R) => { const s = p('amount'); R.tremolo({ rate: 0.6 + s * 2, depth: 0.85, shape: 'square', duty: 0.8 }); R.noise({ kind: 'white', gain: 0.08, lp: 6000, hp: 300, lfoRate: 0.6 + s * 2, lfoDepth: 1, invert: true }); },
  },
  dialUp: {
    name: 'Dial-up', group: 'Machine', blurb: 'The modem handshake, over whatever this was.',
    ...amount('Amount', 0.6),
    recipe: (p, R) => { const s = p('amount'); R.ring(1200, 0.5 * s); R.bp(2000, 1.5); R.crush(0.35); R.noise({ kind: 'white', gain: 0.03, lp: 4000, hp: 1000, lfoRate: 11, lfoDepth: 0.9 }); R.trim(1.2); },
  },
  glitchHold: {
    name: 'Glitch hold', group: 'Machine', blurb: 'Freezes on a grain and buzzes. The CD skipping.',
    ...amount('Rate', 0.5),
    recipe: (p, R) => { const s = p('amount'); R.delay({ time: 0.03, feedback: 0.72, tone: 6000, mix: 0.7 }); R.tremolo({ rate: 6 + s * 20, depth: 0.7, shape: 'square', duty: 0.6 }); R.trim(0.5); },
  },

  /* ================= Position ================= */

  behindDoor: {
    name: 'Behind a door', group: 'Position', blurb: 'Someone in the next room, door shut.',
    ...amount('Thickness', 0.6),
    recipe: (p, R) => { const s = p('amount'); R.lp(1100 - s * 600, 1.1); R.hp(80); R.reverb(0.5, 3, 0.3); R.trim(1.3); },
  },
  farAway: {
    name: 'Far away', group: 'Position', blurb: 'Across the field. Quieter, thinner, and the room comes with it.',
    ...amount('Distance', 0.6),
    recipe: (p, R) => { const s = p('amount'); R.hp(200 + s * 200); R.lp(6000 - s * 2500); R.reverb(1.2 + s * 2, 2.1, 0.35, { pre: 0.02 }); R.trim(0.55 - s * 0.25); },
  },
  veryFar: {
    name: 'Very far', group: 'Position', blurb: 'A voice on the wind. Mostly room, barely any voice.',
    ...amount('Distance', 0.8),
    recipe: (p, R) => { const s = p('amount'); R.hp(400); R.lp(2800); R.reverb(3 + s * 3, 1.7, 0.3, { pre: 0.05 }); R.trim(0.35); },
  },
  inABox: {
    name: 'In a box', group: 'Position', blurb: 'Cardboard, closed. Boxy resonance and no air.',
    ...amount('Size', 0.4),
    recipe: (p, R) => { const s = p('amount'); R.peak(450 - s * 150, 8, 3); R.lp(3000); R.reverb(0.08 + s * 0.1, 5, 0.3); R.trim(1.1); },
  },
  tinCan: {
    name: 'Tin can', group: 'Position', blurb: 'Two cans and a string. Metallic and ringing.',
    ...amount('Ring', 0.6),
    recipe: (p, R) => { const s = p('amount'); R.bp(1800, 1.2); R.peak(2600, 6 + s * 6, 6); R.delay({ time: 0.008, feedback: 0.6, tone: 6000, mix: 0.5 }); R.trim(1.3); },
  },
  phoneInRoom: {
    name: 'Speakerphone', group: 'Position', blurb: 'A phone on the table, the room around it.',
    ...amount('Room', 0.5),
    recipe: (p, R) => { const s = p('amount'); R.drive(0.2); R.hp(320); R.lp(3400); R.lp(3400); R.reverb(0.3 + s * 0.6, 3, 0.45); R.trim(0.6); },
  },
  headphoneBleed: {
    name: 'Headphone bleed', group: 'Position', blurb: 'The tsst-tsst from the seat behind you.',
    ...amount('Leak', 0.5),
    recipe: (p, R) => { R.hp(2500); R.peak(5000, 4, 2); R.trim(0.7 + p('amount') * 0.6); },
  },
  aboveYou: {
    name: 'Upstairs', group: 'Position', blurb: 'Through the ceiling. Footsteps and bass, nothing else.',
    ...amount('Floors', 0.5),
    recipe: (p, R) => { const s = p('amount'); R.lp(380 - s * 200, 1.2); R.peak(90, 6, 1); R.trim(1.8); },
  },
  insideHelmet: {
    name: 'Inside a helmet', group: 'Position', blurb: 'Your own voice, from inside. Close, boomy, breathing.',
    ...amount('Amount', 0.6),
    recipe: (p, R) => { const s = p('amount'); R.peak(250, 6 + s * 4, 1.2); R.lp(4500); R.reverb(0.06, 5, 0.3); R.trim(1.2); },
  },

  /* ================= Beat ================= */

  sidechain: {
    name: 'Sidechain pump', group: 'Beat', blurb: 'Ducks on every beat like a kick is hitting it. Set the BPM.',
    ...two(P('bpm', 'BPM', 60, 200, 1), P('depth', 'Depth', 0, 1), { bpm: 128, depth: 0.8 }),
    recipe: (p, R) => { R.pump({ rate: p('bpm') / 60, depth: p('depth') }); },
  },
  halfPump: {
    name: 'Half-time pump', group: 'Beat', blurb: 'The same duck, every other beat. Slower, heavier.',
    ...two(P('bpm', 'BPM', 60, 200, 1), P('depth', 'Depth', 0, 1), { bpm: 128, depth: 0.85 }),
    recipe: (p, R) => { R.pump({ rate: p('bpm') / 120, depth: p('depth') }); },
  },
  filterUp: {
    name: 'Filter sweep up', group: 'Beat', blurb: 'Opens from muffled to full over the clip. The build.',
    ...amount('Length (s)', 4, 0.5, 16),
    recipe: (p, R) => { R.sweep({ type: 'lowpass', from: 200, to: 18000, over: p('amount') }); },
  },
  filterDown: {
    name: 'Filter sweep down', group: 'Beat', blurb: 'Closes from full to muffled. The pull-back before a drop.',
    ...amount('Length (s)', 4, 0.5, 16),
    recipe: (p, R) => { R.sweep({ type: 'lowpass', from: 18000, to: 200, over: p('amount') }); },
  },
  hpBuild: {
    name: 'High-pass build', group: 'Beat', blurb: 'The bass drains out as the clip runs. Tension.',
    ...amount('Length (s)', 4, 0.5, 16),
    recipe: (p, R) => { R.sweep({ type: 'highpass', from: 20, to: 2500, over: p('amount') }); },
  },
  tapeStop: {
    name: 'Tape stop', group: 'Beat', blurb: 'The deck powers down: pitch and speed fall to nothing.',
    ...amount('Length (s)', 1.2, 0.2, 4),
    recipe: (p, R) => { R.tapeStop(p('amount')); },
  },
  riserFx: {
    name: 'Riser', group: 'Beat', blurb: 'A pitch and filter climb over the clip. Ends on the drop.',
    ...amount('Length (s)', 3, 0.5, 12),
    recipe: (p, R) => { const s = p('amount'); R.sweep({ type: 'lowpass', from: 400, to: 16000, over: s }); R.sweepPitch({ from: -5, to: 0, over: s }); R.reverb(0.8, 2.6, 0.5); R.trim(1.1); },
  },
  dropFilter: {
    name: 'Telephone drop', group: 'Beat', blurb: 'Narrow for the build, then it opens up wide. Set the moment.',
    ...amount('Opens at (s)', 2, 0.2, 12),
    recipe: (p, R) => { R.sweep({ type: 'lowpass', from: 3000, to: 18000, over: 0.05, at: p('amount') }); R.sweep({ type: 'highpass', from: 400, to: 30, over: 0.05, at: p('amount') }); },
  },
  gatedTrance: {
    name: 'Trance gate', group: 'Beat', blurb: 'Sixteenth-note on-off, with reverb filling the gaps.',
    ...amount('BPM', 138, 60, 200),
    recipe: (p, R) => { R.tremolo({ rate: (p('amount') / 60) * 4, depth: 1, shape: 'square', duty: 0.45 }); R.reverb(1.0, 2.6, 0.5); R.trim(1.2); },
  },
  slowedHeavy: {
    name: 'Slowed + heavy', group: 'Beat', blurb: 'Slower than Slowed, with the bass leaned on. The dark-edit sound.',
    ...amount('Wash', 0.6),
    alsoSetsSpeed: 0.78,
    recipe: (p, R) => { const s = p('amount'); R.lowshelf(110, 4); R.lp(7000); R.reverb(1.6 + s * 2.4, 2.1, 0.32, { pre: 0.03 }); R.trim(1.35); },
  },
  spedUp: {
    name: 'Sped up', group: 'Beat', blurb: 'The sped-up TikTok sound: faster, brighter, a little higher.',
    ...amount('Brightness', 0.5),
    alsoSetsSpeed: 1.2,
    recipe: (p, R) => { R.pitch(2); R.highshelf(5000, 2 + p('amount') * 3); R.trim(1.05); },
  },

  /* ================= Atmosphere ================= */

  rainBed: {
    name: 'Rain', group: 'Atmosphere', blurb: 'Steady rain underneath, with the voice untouched.',
    ...amount('Level', 0.4),
    recipe: (p, R) => { R.noise({ kind: 'pink', gain: 0.05 + p('amount') * 0.2, lp: 9000, hp: 400, lfoRate: 0.25, lfoDepth: 0.25 }); },
  },
  tapeHiss: {
    name: 'Tape hiss', group: 'Atmosphere', blurb: 'The bed under every old recording.',
    ...amount('Level', 0.35),
    recipe: (p, R) => { R.noise({ kind: 'white', gain: 0.01 + p('amount') * 0.05, lp: 9000, hp: 2500 }); },
  },
  windBed: {
    name: 'Wind', group: 'Atmosphere', blurb: 'Low, gusting, never quite steady.',
    ...amount('Level', 0.5),
    recipe: (p, R) => { R.noise({ kind: 'brown', gain: 0.12 + p('amount') * 0.4, lp: 700, hp: 40, lfoRate: 0.12, lfoDepth: 0.8 }); },
  },
  crowdBed: {
    name: 'Crowd', group: 'Atmosphere', blurb: 'A room full of people, none of them saying anything you can catch.',
    ...amount('Level', 0.4),
    recipe: (p, R) => { R.noise({ kind: 'pink', gain: 0.06 + p('amount') * 0.2, lp: 2500, hp: 250, lfoRate: 0.7, lfoDepth: 0.35 }); },
  },
  fireBed: {
    name: 'Fireplace', group: 'Atmosphere', blurb: 'Crackle and low roar. Warm without saying so.',
    ...amount('Level', 0.4),
    recipe: (p, R) => { const s = p('amount'); R.noise({ kind: 'brown', gain: 0.1 + s * 0.3, lp: 400, hp: 40, lfoRate: 0.3, lfoDepth: 0.4 }); R.noise({ kind: 'crackle', gain: 0.3 + s * 0.6, lp: 6000, hp: 800 }); },
  },
  oceanBed: {
    name: 'Ocean', group: 'Atmosphere', blurb: 'Waves rolling in every eight seconds or so.',
    ...amount('Level', 0.5),
    recipe: (p, R) => { R.noise({ kind: 'pink', gain: 0.1 + p('amount') * 0.35, lp: 3000, hp: 80, lfoRate: 0.11, lfoDepth: 0.9 }); },
  },
  cityBed: {
    name: 'City hum', group: 'Atmosphere', blurb: 'Traffic three streets away. Low and constant.',
    ...amount('Level', 0.4),
    recipe: (p, R) => { R.noise({ kind: 'brown', gain: 0.15 + p('amount') * 0.4, lp: 300, hp: 30, lfoRate: 0.05, lfoDepth: 0.3 }); R.noise({ kind: 'hum', gain: 0.006 }); },
  },
  vinylBed: {
    name: 'Vinyl bed', group: 'Atmosphere', blurb: 'Just the crackle, with nothing done to the voice.',
    ...amount('Level', 0.5),
    recipe: (p, R) => { R.noise({ kind: 'crackle', gain: 0.4 + p('amount') * 0.8, lp: 5000, hp: 900 }); },
  },
  mainsHum: {
    name: 'Mains hum', group: 'Atmosphere', blurb: 'The 50Hz buzz of a bad cable. For when it should sound cheap.',
    ...amount('Level', 0.3),
    recipe: (p, R) => { R.noise({ kind: 'hum', gain: 0.01 + p('amount') * 0.05 }); },
  },

  /* ================= Pitch — more ================= */

  octaveDown: {
    name: 'Octave down', group: 'Pitch', pro: true, blurb: 'A full octave under, mixed with the original. Weight.',
    ...amount('Blend', 0.6),
    recipe: (p, R) => { R.harmony({ semitones: -12, mix: p('amount') }); },
  },
  octaveUp: {
    name: 'Octave up', group: 'Pitch', pro: true, blurb: 'A full octave over, blended in. Sparkle.',
    ...amount('Blend', 0.45),
    recipe: (p, R) => { R.harmony({ semitones: 12, mix: p('amount') }); R.highshelf(6000, 1); },
  },
  fifth: {
    name: 'Fifth harmony', group: 'Pitch', pro: true, blurb: 'A perfect fifth on top. Instant choir.',
    ...amount('Blend', 0.5),
    recipe: (p, R) => { R.harmony({ semitones: 7, mix: p('amount') }); },
  },
  thirdMinor: {
    name: 'Minor third', group: 'Pitch', pro: true, blurb: 'A minor third above. Sad, close harmony.',
    ...amount('Blend', 0.5),
    recipe: (p, R) => { R.harmony({ semitones: 3, mix: p('amount') }); },
  },
  shimmer: {
    name: 'Shimmer', group: 'Pitch', pro: true, blurb: 'Reverb an octave up. The Eno cathedral.',
    ...amount('Amount', 0.6),
    recipe: (p, R) => { const s = p('amount'); R.harmony({ semitones: 12, mix: 0.5 + s * 0.4 }); R.hp(300); R.reverb(3 + s * 4, 1.7, 0.5); R.trim(1.4); },
  },
  genderUp: {
    name: 'Voice up', group: 'Pitch', pro: true, blurb: 'A few semitones up with the body kept. Not a chipmunk.',
    ...amount('Amount', 0.5),
    recipe: (p, R) => { R.pitch(2 + Math.round(p('amount') * 3)); R.peak(200, 2, 0.9); },
  },
  genderDown: {
    name: 'Voice down', group: 'Pitch', pro: true, blurb: 'A few semitones down with the air kept. Not a monster.',
    ...amount('Amount', 0.5),
    recipe: (p, R) => { R.pitch(-2 - Math.round(p('amount') * 3)); R.highshelf(5000, 2); },
  },
  drunk: {
    name: 'Drunk', group: 'Pitch', pro: true, blurb: 'Pitch sliding around, never quite landing.',
    ...amount('Amount', 0.6),
    recipe: (p, R) => { const s = p('amount'); R.pitch(-1); R.vibrato({ rate: 0.35, depth: 0.004 + s * 0.012 }); R.lp(7000); },
  },
};

/* ------------------------------------------------------------------ *
 * validation
 * ------------------------------------------------------------------ */

/*
 * A recipe that reads a parameter it did not declare gets the catalogue
 * default of `undefined`, which becomes 0 or NaN somewhere in a filter, and
 * the effect either does nothing or does something silently wrong. Caught
 * here at load by running every recipe once against a recorder that notes
 * which keys it asked for.
 */
export const AUDIO_FX_LIBRARY_PROBLEMS = [];
for (const [id, spec] of Object.entries(AUDIO_FX_LIBRARY)) {
  const declared = new Set((spec.params || []).map((x) => x.key));
  const asked = new Set();
  const probe = new Proxy({}, { get: () => () => probe });
  try {
    spec.recipe((k) => { asked.add(k); return spec.defaults?.[k] ?? 0.5; }, probe);
  } catch (err) {
    AUDIO_FX_LIBRARY_PROBLEMS.push(`${id}: recipe threw (${err.message})`);
  }
  for (const k of asked) {
    if (!declared.has(k)) AUDIO_FX_LIBRARY_PROBLEMS.push(`${id}: reads "${k}" but declares no such parameter`);
  }
  for (const k of declared) {
    if (spec.defaults?.[k] === undefined) AUDIO_FX_LIBRARY_PROBLEMS.push(`${id}: no default for "${k}"`);
  }
  if (!spec.name || !spec.group || !spec.blurb) AUDIO_FX_LIBRARY_PROBLEMS.push(`${id}: missing name, group or blurb`);
}
if (AUDIO_FX_LIBRARY_PROBLEMS.length) {
  // eslint-disable-next-line no-console -- a build-time mistake shipped to runtime
  console.warn(`[audio-fx] ${AUDIO_FX_LIBRARY_PROBLEMS.length} problem(s):\n  ${AUDIO_FX_LIBRARY_PROBLEMS.join('\n  ')}`);
}
