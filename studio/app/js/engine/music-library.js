/*
 * The music library: five hundred and forty-four tracks, by name.
 *
 * A note on what this is and is not. It is not a collection of songs — we do
 * not have the right to hand anybody Drake's masters, and a video editor that
 * shipped commercial music would be a lawsuit with a UI on it. Every track
 * here is written by the app, by beatmaker.js, at the moment you ask for it.
 *
 * What that buys, beyond staying legal:
 *
 *   Nothing gets claimed or muted on upload, on any platform, ever.
 *   The beat grid is exact, so "cut on the beat" lands to the sample rather
 *   than to whatever a detector guessed.
 *   Nothing downloads. The whole library is this file — a few kilobytes of
 *   names and seeds — and the audio is made on the device when it is wanted.
 *
 * A track is a style and a seed. The seed decides the key, the tempo, the
 * chord progression and the melody, and it never changes, so a project that
 * used "Concrete Corners" a year ago still opens with the same music in it.
 * That is the whole trick: the catalogue is small and the library is large.
 *
 * The names are generated from per-family word pools and checked for
 * uniqueness at build time. They are deliberately ordinary English pairs —
 * nothing here is trying to sound like an existing song or artist, and a
 * name that collided with one would be a problem rather than a feature.
 */

import { BEAT_STYLES, STYLE_FAMILIES, trackPlan } from './beatmaker.js';

/* ------------------------------------------------------------------ */
/* names                                                               */
/* ------------------------------------------------------------------ */

/* Twenty by twenty a family: four hundred combinations to draw sixteen from,
   so a collision is rare and the de-duplication below almost never fires. */
const WORDS = {
  Rap: {
    a: ['Concrete', 'Cold', 'Late', 'Gold', 'Heavy', 'Static', 'Midnight', 'Ghost', 'Iron', 'Paper',
        'Broken', 'Silent', 'Marble', 'Velvet', 'Rust', 'Neon', 'Hollow', 'Distant', 'Sharp', 'Quiet'],
    b: ['Corners', 'Nights', 'Money', 'Blocks', 'Engines', 'Chains', 'Shadows', 'Traffic', 'Numbers', 'Mirrors',
        'Sirens', 'Stairs', 'Wires', 'Smoke', 'Glass', 'Signal', 'Alleys', 'Towers', 'Rain', 'Motion'],
  },
  'R&B': {
    a: ['Slow', 'Warm', 'Late', 'Soft', 'Amber', 'Velvet', 'Golden', 'Quiet', 'Honey', 'Faded',
        'Silk', 'Dim', 'Tender', 'Low', 'Hazy', 'Second', 'Blue', 'Open', 'Closer', 'Sweet'],
    b: ['Hours', 'Letters', 'Windows', 'Weather', 'Rooms', 'Distance', 'Mornings', 'Silence', 'Sundays', 'Reasons',
        'Corners', 'Answers', 'Lights', 'Traffic', 'Water', 'Pillows', 'Hands', 'Evenings', 'Patience', 'Waiting'],
  },
  Dance: {
    a: ['Bright', 'Hard', 'Neon', 'Endless', 'Chrome', 'Electric', 'Rising', 'Open', 'Wild', 'Kinetic',
        'Loud', 'Vivid', 'Fast', 'Pure', 'Hyper', 'Solar', 'Deep', 'Liquid', 'Sharp', 'Total'],
    b: ['Floors', 'Machines', 'Circuits', 'Hours', 'Lights', 'Systems', 'Voltage', 'Motion', 'Pulses', 'Signals',
        'Waves', 'Cities', 'Nights', 'Currents', 'Frequencies', 'Engines', 'Orbits', 'Sequence', 'Traffic', 'Static'],
  },
  Global: {
    a: ['Sun', 'Green', 'Wide', 'Bright', 'Coastal', 'Golden', 'Warm', 'Loud', 'Open', 'Sweet',
        'Fresh', 'High', 'Blue', 'Easy', 'Long', 'Late', 'Bold', 'Rich', 'Soft', 'Clear'],
    b: ['Mornings', 'Palms', 'Streets', 'Markets', 'Rivers', 'Rooftops', 'Harbours', 'Seasons', 'Dances', 'Islands',
        'Roads', 'Voices', 'Drums', 'Corners', 'Coastlines', 'Yards', 'Fires', 'Nights', 'Rains', 'Suns'],
  },
  Pop: {
    a: ['Paper', 'Bright', 'Little', 'Every', 'Golden', 'Loud', 'Simple', 'Young', 'Perfect', 'First',
        'Last', 'Better', 'Higher', 'Louder', 'Closer', 'Brighter', 'New', 'Real', 'Wide', 'Easy'],
    b: ['Hearts', 'Summers', 'Promises', 'Reasons', 'Cameras', 'Mistakes', 'Weekends', 'Choruses', 'Photographs', 'Confetti',
        'Bedrooms', 'Fireworks', 'Postcards', 'Beginnings', 'Balconies', 'Mornings', 'Choices', 'Signals', 'Days', 'Names'],
  },
  Chill: {
    a: ['Slow', 'Rainy', 'Soft', 'Dusty', 'Quiet', 'Warm', 'Low', 'Faded', 'Small', 'Late',
        'Grey', 'Still', 'Gentle', 'Old', 'Half', 'Empty', 'Distant', 'Patient', 'Blue', 'Kind'],
    b: ['Tapes', 'Afternoons', 'Windows', 'Coffee', 'Pages', 'Rooms', 'Trains', 'Weather', 'Corners', 'Lamps',
        'Notebooks', 'Radiators', 'Mornings', 'Libraries', 'Fields', 'Rain', 'Hours', 'Chairs', 'Streets', 'Snow'],
  },
  Score: {
    a: ['Rising', 'Vast', 'First', 'Final', 'Silent', 'Iron', 'Long', 'Deep', 'Distant', 'Hollow',
        'Grave', 'Bright', 'Dark', 'Slow', 'Great', 'Last', 'Broken', 'Wide', 'Cold', 'High'],
    b: ['Horizons', 'Descent', 'Light', 'Arrival', 'Ascent', 'Machines', 'Winter', 'Storms', 'Ruins', 'Silence',
        'Signals', 'Return', 'Fires', 'Depths', 'Distance', 'Approach', 'Dawn', 'Weight', 'Watch', 'Ground'],
  },
};

/* ------------------------------------------------------------------ */
/* moods                                                               */
/* ------------------------------------------------------------------ */

/*
 * What a track is for, in the words somebody types into a search box.
 *
 * Two come from the style, because a drill track is cold and hard whatever
 * seed it got, and one more from the seed, so a family is not sixteen
 * identically-described tracks. Search matches any of them.
 */
export const MOODS = ['dark', 'bright', 'hard', 'smooth', 'sad', 'uplifting', 'chill',
  'busy', 'epic', 'warm', 'cold', 'playful', 'dreamy', 'tense', 'confident'];

const STYLE_MOODS = {
  trap: ['hard', 'dark'], drill: ['cold', 'tense'], ukdrill: ['cold', 'hard'], boombap: ['warm', 'confident'],
  phonk: ['dark', 'hard'], memphis: ['dark', 'tense'], hyperpop: ['bright', 'playful'],
  rnb: ['smooth', 'warm'], trapsoul: ['smooth', 'dark'], slowjam: ['smooth', 'warm'], neosoul: ['smooth', 'chill'],
  house: ['uplifting', 'busy'], deephouse: ['chill', 'dreamy'], techno: ['hard', 'cold'], edm: ['uplifting', 'epic'],
  dubstep: ['hard', 'tense'], dnb: ['busy', 'hard'], jerseyclub: ['busy', 'playful'],
  afrobeats: ['warm', 'uplifting'], amapiano: ['warm', 'chill'], reggaeton: ['confident', 'warm'], dancehall: ['warm', 'confident'],
  pop: ['bright', 'uplifting'], indie: ['warm', 'dreamy'], rock: ['hard', 'confident'], synthwave: ['dreamy', 'cold'],
  funk: ['playful', 'confident'],
  lofi: ['chill', 'warm'], jazzhop: ['chill', 'dreamy'], ambient: ['dreamy', 'chill'],
  cinematic: ['epic', 'sad'], trailer: ['epic', 'tense'], hype: ['epic', 'busy'], horror: ['dark', 'tense'],
};

const SEED_MOODS = ['dark', 'bright', 'sad', 'uplifting', 'busy', 'chill', 'confident', 'dreamy'];

/* ------------------------------------------------------------------ */
/* the catalogue                                                       */
/* ------------------------------------------------------------------ */

/** Sixteen a style. Thirty-four styles. Five hundred and forty-four tracks. */
const PER_STYLE = 16;

/*
 * Every track's seed is derived from its style and its index, not from a
 * counter, so adding a style later cannot renumber the tracks that already
 * exist — a project holding "rap-trap-07" keeps the music it had.
 */
function seedFor(style, i) {
  let h = 2166136261;
  const s = `${style}#${i}`;
  for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); }
  return (h >>> 0) || 1;
}

function build() {
  const out = [];
  const used = new Set();
  for (const [style, spec] of Object.entries(BEAT_STYLES)) {
    const pool = WORDS[spec.family] || WORDS.Pop;
    for (let i = 0; i < PER_STYLE; i++) {
      const seed = seedFor(style, i);
      const plan = trackPlan({ style, seed });
      /* The name, from the seed, nudged until it is not already taken. */
      let name = '';
      for (let tries = 0; tries < 40; tries++) {
        const a = pool.a[(seed + tries * 7) % pool.a.length];
        const b = pool.b[(Math.floor(seed / 13) + tries * 3) % pool.b.length];
        name = `${a} ${b}`;
        if (!used.has(name)) break;
      }
      used.add(name);
      const extra = SEED_MOODS[seed % SEED_MOODS.length];
      const moods = [...new Set([...(STYLE_MOODS[style] || []), extra])];
      out.push({
        id: `${style}-${String(i + 1).padStart(2, '0')}`,
        name,
        style,
        styleName: spec.name,
        family: spec.family,
        seed,
        bpm: plan.tempo,
        key: plan.key,
        moods,
      });
    }
  }
  return out;
}

/** Every track in the library, built once when this module loads. */
export const TRACKS = build();

/** Grouped for the browser, in the order the families are meant to read. */
export const TRACKS_BY_FAMILY = STYLE_FAMILIES.map((family) => ({
  family,
  tracks: TRACKS.filter((t) => t.family === family),
}));

/** One track, by the id a project stores. */
export function trackById(id) {
  return TRACKS.find((t) => t.id === id) || null;
}

/**
 * Search the library.
 *
 * One box does everything, because two boxes is one too many on a phone: the
 * text is matched against the name, the style and the moods, and the filters
 * narrow whatever that found. An empty search is the whole library, which is
 * the right answer for somebody who is browsing rather than looking.
 */
export function findTracks({ q = '', family = null, style = null, mood = null, bpmMin = 0, bpmMax = 999 } = {}) {
  const needle = String(q || '').trim().toLowerCase();
  const words = needle ? needle.split(/\s+/) : [];
  return TRACKS.filter((t) => {
    if (family && t.family !== family) return false;
    if (style && t.style !== style) return false;
    if (mood && !t.moods.includes(mood)) return false;
    if (t.bpm < bpmMin || t.bpm > bpmMax) return false;
    if (!words.length) return true;
    const hay = `${t.name} ${t.styleName} ${t.style} ${t.family} ${t.moods.join(' ')} ${t.bpm} ${t.key}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/**
 * A track that suits a request, for the AI and for "surprise me".
 *
 * Given words like "dark drill" or "something chill and slow" it scores every
 * track and returns the best — style first, because naming a style is the
 * strongest thing a person can say, then mood, then tempo.
 */
export function suggestTrack(text, { seconds = null } = {}) {
  const s = String(text || '').toLowerCase();
  if (!s.trim()) return TRACKS[0];
  let best = null, bestScore = -1;
  for (const t of TRACKS) {
    let score = 0;
    if (s.includes(t.style)) score += 10;
    if (s.includes(t.styleName.toLowerCase())) score += 10;
    if (s.includes(t.family.toLowerCase())) score += 4;
    for (const m of t.moods) if (s.includes(m)) score += 3;
    if (/\bslow\b|\bchill\b|\bcalm\b/.test(s) && t.bpm < 100) score += 2;
    if (/\bfast\b|\bhype\b|\bhard\b|\benergetic\b/.test(s) && t.bpm > 130) score += 2;
    if (seconds && seconds < 20 && t.bpm > 120) score += 1;
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return bestScore > 0 ? best : null;
}

/** What the library holds, for the panel's subtitle and the pricing page. */
export const LIBRARY_SIZE = TRACKS.length;
