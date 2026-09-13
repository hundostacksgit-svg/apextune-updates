/*
 * The look library — every colour grade in the app beyond the starter set.
 *
 * These are data, not code: each entry is a set of values for the same colour
 * controls a person can reach by hand in the Colour panel. That is deliberate
 * and it is what makes a library this size honest rather than padding. Nothing
 * here is a black box, every look can be opened and picked apart, and anything
 * you can build with the sliders can be written down in the same shape.
 *
 * They are grouped by how people actually ask for a grade — by film stock, by
 * mood, by genre, by the platform it is going to — because "which of 120 looks
 * do I want" is only answerable if the list is arranged the way the question is.
 *
 * The swatch shown on each chip is computed from the look's own values rather
 * than authored separately, so a swatch can never drift from the grade it
 * advertises. A library where the chips lie is worse than a smaller one.
 */

/* ------------------------------------------------------------------ *
 * Swatches, derived from the grade itself
 * ------------------------------------------------------------------ */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function hex(r, g, b) {
  const p = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${p(r)}${p(g)}${p(b)}`;
}

/**
 * Turn a set of colour values into the two ends of a gradient.
 *
 * Approximate on purpose — it is a 40-pixel chip, not a preview — but it moves
 * in the same direction as the grade on every axis, so warm looks warm, crushed
 * looks dark, and desaturated looks grey.
 */
function swatchFor(c = {}, split = null) {
  const exposure = (c.exposure || 0) / 100;
  const contrast = (c.contrast || 0) / 100;
  const sat = 1 + (c.saturation || 0) / 100;
  const temp = (c.temperature || 0) / 100;
  const tint = (c.tint || 0) / 100;

  const shade = (base) => {
    let r = base + exposure * 90 + temp * 46;
    let g = base + exposure * 90 + tint * 30;
    let b = base + exposure * 90 - temp * 46;
    const mid = (r + g + b) / 3;
    r = mid + (r - mid) * sat;
    g = mid + (g - mid) * sat;
    b = mid + (b - mid) * sat;
    const pivot = 128;
    return [pivot + (r - pivot) * (1 + contrast), pivot + (g - pivot) * (1 + contrast),
            pivot + (b - pivot) * (1 + contrast)];
  };

  const lo = split?.shadow || hex(...shade(52 + (c.shadows || 0) * 0.5));
  const hi = split?.highlight || hex(...shade(196 + (c.highlights || 0) * 0.5));
  return `linear-gradient(135deg,${lo},${hi})`;
}

/** One entry, with its swatch filled in from its own values. */
function look(id, name, group, color, extra = {}) {
  return { id, name, group, tier: extra.tier || 'free', color, ...extra,
           swatch: swatchFor(color, extra.split) };
}

/* ------------------------------------------------------------------ *
 * Film stocks
 *
 * Named after what they are imitating, and imitating the part that is
 * actually reproducible: the contrast curve, where the colour sits, how much
 * the shadows lift. Not claimed to be a scan of the real emulsion — nobody
 * can do that with four sliders, and saying otherwise would be a lie printed
 * on every chip.
 * ------------------------------------------------------------------ */
const STOCKS = [
  look('k2383', 'Kodak 2383', 'Film', { contrast: 20, saturation: 12, temperature: 6, shadows: -12, highlights: -8 },
    { split: { shadow: '#12384f', highlight: '#ffb066', amount: 0.28 } }),
  look('k2393', 'Kodak 2393', 'Film', { contrast: 26, saturation: 16, temperature: 4, shadows: -16, highlights: -4 },
    { split: { shadow: '#123a55', highlight: '#ffc07a', amount: 0.22 } }),
  look('k5218', 'Kodak 5218', 'Film', { contrast: 6, saturation: -6, temperature: -6, shadows: 10, grain: 14 }),
  look('portra160', 'Portra 160', 'Film', { contrast: 4, saturation: -4, temperature: 10, highlights: 8, shadows: 8, grain: 6 }),
  look('portra400', 'Portra 400', 'Film', { contrast: 6, saturation: 2, temperature: 14, highlights: 6, shadows: 10, grain: 10 }),
  look('portra800', 'Portra 800', 'Film', { contrast: 10, saturation: 4, temperature: 12, shadows: 6, grain: 18 }),
  look('gold200', 'Kodak Gold', 'Film', { contrast: 8, saturation: 14, temperature: 22, highlights: 4, grain: 12 }),
  look('ektar', 'Ektar 100', 'Film', { contrast: 18, saturation: 26, temperature: 6, shadows: -8, grain: 4 }),
  look('ultramax', 'Ultramax 400', 'Film', { contrast: 12, saturation: 18, temperature: 16, grain: 16 }),
  look('vision3', 'Vision3 500T', 'Film', { contrast: 4, saturation: -8, temperature: -18, shadows: 12, grain: 12 }),
  look('eterna', 'Fuji Eterna', 'Film', { contrast: -6, saturation: -12, temperature: -4, shadows: 14, highlights: -6, grain: 8 }),
  look('pro400h', 'Fuji Pro 400H', 'Film', { contrast: -2, saturation: -6, temperature: -8, tint: 8, highlights: 10, grain: 8 }),
  look('velvia', 'Velvia 50', 'Film', { contrast: 26, saturation: 40, temperature: 4, shadows: -14, grain: 4 }),
  look('provia', 'Provia 100F', 'Film', { contrast: 14, saturation: 14, temperature: -2, grain: 5 }),
  look('astia', 'Astia 100F', 'Film', { contrast: 6, saturation: 6, temperature: 6, highlights: 6, grain: 5 }),
  look('superia', 'Superia 400', 'Film', { contrast: 12, saturation: 16, temperature: -6, tint: 10, grain: 14 }),
  look('cinestill800', 'Cinestill 800T', 'Film', { contrast: 10, saturation: 6, temperature: -24, shadows: 8, grain: 14 },
    { split: { shadow: '#14304f', highlight: '#ff6a6a', amount: 0.3 } }),
  look('cinestill50', 'Cinestill 50D', 'Film', { contrast: 12, saturation: 8, temperature: 8, highlights: 6, grain: 8 }),
  look('agfa', 'Agfa Vista', 'Film', { contrast: 10, saturation: 20, temperature: 10, tint: -6, grain: 12 }),
  look('lomo', 'Lomo', 'Film', { contrast: 30, saturation: 30, temperature: 12, vignette: 48, grain: 18 }),
  look('polaroid600', 'Polaroid 600', 'Film', { contrast: -10, saturation: -8, temperature: 14, exposure: 6, shadows: 20, grain: 10 }),
  look('sx70', 'Polaroid SX-70', 'Film', { contrast: -6, saturation: 6, temperature: 8, tint: 10, shadows: 16, grain: 8 }),
  look('tech2', 'Technicolor 2-strip', 'Film', { contrast: 18, saturation: 10, temperature: 18, tint: -14 },
    { split: { shadow: '#1c4a5e', highlight: '#ff8f6a', amount: 0.4 } }),
  look('tech3', 'Technicolor 3-strip', 'Film', { contrast: 24, saturation: 38, temperature: 6, shadows: -10 }),
];

/* ------------------------------------------------------------------ *
 * Moods
 * ------------------------------------------------------------------ */
const MOODS = [
  look('dreamy', 'Dreamy', 'Mood', { contrast: -12, saturation: -6, exposure: 8, highlights: 16, shadows: 14, blur: 0.6 }),
  look('melancholy', 'Melancholy', 'Mood', { contrast: -6, saturation: -26, temperature: -16, shadows: 10 }),
  look('euphoric', 'Euphoric', 'Mood', { contrast: 18, saturation: 34, exposure: 8, highlights: 12 }),
  look('tense', 'Tense', 'Mood', { contrast: 34, saturation: -14, temperature: -10, shadows: -22, vignette: 34 }),
  look('serene', 'Serene', 'Mood', { contrast: -8, saturation: -4, temperature: -6, highlights: 10, shadows: 12 }),
  look('nostalgic', 'Nostalgic', 'Mood', { contrast: -10, saturation: -14, temperature: 20, shadows: 22, grain: 16 }),
  look('clinical', 'Clinical', 'Mood', { contrast: 12, saturation: -22, temperature: -14, highlights: 12 }),
  look('toxic', 'Toxic', 'Mood', { contrast: 20, saturation: 24, tint: 34, shadows: -10 }),
  look('frostbite', 'Frostbite', 'Mood', { contrast: 18, saturation: -10, temperature: -42, highlights: 14 }),
  look('ember', 'Ember', 'Mood', { contrast: 22, saturation: 16, temperature: 36, shadows: -16, vignette: 26 }),
  look('midnight', 'Midnight', 'Mood', { contrast: 16, saturation: -12, temperature: -30, exposure: -14, shadows: -18 }),
  look('overcast', 'Overcast', 'Mood', { contrast: -14, saturation: -18, temperature: -8, highlights: -6 }),
  look('heatwave', 'Heatwave', 'Mood', { contrast: 10, saturation: 18, temperature: 34, exposure: 8, highlights: 10 }),
  look('monsoon', 'Monsoon', 'Mood', { contrast: 8, saturation: -16, temperature: -20, tint: 10, shadows: 8 }),
  look('desert', 'Desert', 'Mood', { contrast: 14, saturation: 6, temperature: 28, tint: -8, highlights: 8 }),
  look('arctic', 'Arctic', 'Mood', { contrast: 20, saturation: -20, temperature: -36, exposure: 10, highlights: 16 }),
  look('jungle', 'Jungle', 'Mood', { contrast: 12, saturation: 22, tint: 22, temperature: -6, shadows: -8 }),
  look('neonnights', 'Neon nights', 'Mood', { contrast: 26, saturation: 32, temperature: -22, shadows: -20, vignette: 30 },
    { split: { shadow: '#2a0f5e', highlight: '#00e5ff', amount: 0.38 } }),
  look('concrete', 'Concrete', 'Mood', { contrast: 14, saturation: -34, temperature: -4, shadows: -10 }),
  look('velvet', 'Velvet', 'Mood', { contrast: 18, saturation: 10, temperature: 6, shadows: -20, vignette: 38 }),
];

/* ------------------------------------------------------------------ *
 * Genre
 * ------------------------------------------------------------------ */
const GENRE = [
  look('blockbuster', 'Blockbuster', 'Genre', { contrast: 22, saturation: 10, temperature: 10, shadows: -16, highlights: -6 },
    { split: { shadow: '#0d3d55', highlight: '#ffa15c', amount: 0.34 } }),
  look('horror', 'Horror', 'Genre', { contrast: 30, saturation: -24, temperature: -14, exposure: -10, shadows: -26, vignette: 46, grain: 16 }),
  look('thriller', 'Thriller', 'Genre', { contrast: 26, saturation: -8, temperature: -16, shadows: -20, vignette: 28 }),
  look('romance', 'Romance', 'Genre', { contrast: -6, saturation: 8, temperature: 18, exposure: 6, highlights: 14, blur: 0.4 }),
  look('documentary', 'Documentary', 'Genre', { contrast: 8, saturation: 2, temperature: 2 }),
  look('western', 'Western', 'Genre', { contrast: 20, saturation: 10, temperature: 30, tint: -10, vignette: 24, grain: 12 }),
  look('scifi', 'Sci-fi', 'Genre', { contrast: 20, saturation: -6, temperature: -26, highlights: 10, shadows: -12 }),
  look('cyberpunk', 'Cyberpunk', 'Genre', { contrast: 28, saturation: 34, temperature: -18, shadows: -18, vignette: 32 },
    { split: { shadow: '#3a0a6b', highlight: '#00fff0', amount: 0.42 } }),
  look('noirmodern', 'Modern noir', 'Genre', { contrast: 36, saturation: -70, temperature: -8, shadows: -24, vignette: 40 }),
  look('war', 'War', 'Genre', { contrast: 24, saturation: -30, temperature: 6, tint: -10, shadows: -14, grain: 20 }),
  look('period', 'Period drama', 'Genre', { contrast: 4, saturation: -12, temperature: 22, shadows: 16, grain: 10 }),
  look('comedy', 'Comedy bright', 'Genre', { contrast: 12, saturation: 20, exposure: 10, highlights: 12 }),
  look('musicvideo', 'Music video', 'Genre', { contrast: 30, saturation: 30, shadows: -18, highlights: 8, vignette: 22 }),
  look('sports', 'Sports', 'Genre', { contrast: 24, saturation: 22, exposure: 4, highlights: 6 }),
  look('wildlife', 'Wildlife', 'Genre', { contrast: 16, saturation: 18, tint: 8, highlights: 4 }),
  look('fashion', 'Fashion', 'Genre', { contrast: 14, saturation: -8, temperature: 4, highlights: 18, shadows: -8 }),
];

/* ------------------------------------------------------------------ *
 * Made for a platform
 * ------------------------------------------------------------------ */
const SOCIAL = [
  look('tiktokbright', 'TikTok bright', 'Social', { contrast: 16, saturation: 26, exposure: 10, highlights: 10 }),
  look('reelspop', 'Reels pop', 'Social', { contrast: 20, saturation: 30, exposure: 6, shadows: -8 }),
  look('ytclean', 'YouTube clean', 'Social', { contrast: 10, saturation: 8, exposure: 4 }),
  look('vlogwarm', 'Vlog warm', 'Social', { contrast: 8, saturation: 12, temperature: 18, exposure: 6, highlights: 8 }),
  look('gaming', 'Gaming sharp', 'Social', { contrast: 26, saturation: 24, shadows: -14, highlights: 6 }),
  look('asmr', 'ASMR soft', 'Social', { contrast: -10, saturation: -6, temperature: 10, exposure: 8, highlights: 14, blur: 0.5 }),
  look('beauty', 'Beauty glow', 'Social', { contrast: -4, saturation: 4, temperature: 12, exposure: 8, highlights: 18, blur: 0.7 }),
  look('food', 'Food rich', 'Social', { contrast: 16, saturation: 28, temperature: 16, highlights: 6 }),
  look('travel', 'Travel vivid', 'Social', { contrast: 20, saturation: 32, temperature: 6, shadows: -10 }),
  look('fitness', 'Fitness punch', 'Social', { contrast: 30, saturation: 16, shadows: -18, vignette: 22 }),
  look('techcold', 'Tech cold', 'Social', { contrast: 18, saturation: -10, temperature: -22, highlights: 12 }),
  look('lofi', 'Lo-fi', 'Social', { contrast: -12, saturation: -10, temperature: 14, exposure: 4, shadows: 20, grain: 22 }),
  look('animepop', 'Anime pop', 'Social', { contrast: 24, saturation: 38, temperature: -4, highlights: 10 }),
  look('phonkdark', 'Phonk dark', 'Social', { contrast: 34, saturation: -16, temperature: -12, exposure: -12, shadows: -26, vignette: 44 }),
  look('y2k', 'Y2K', 'Social', { contrast: 8, saturation: 24, temperature: -10, tint: 14, exposure: 6, grain: 14 }),
  look('vaporwave', 'Vaporwave', 'Social', { contrast: 12, saturation: 30, temperature: -14, tint: 24, exposure: 4 },
    { split: { shadow: '#3d1a7a', highlight: '#ff7ad9', amount: 0.4 } }),
];

/* ------------------------------------------------------------------ *
 * Black and white
 *
 * Every one of these zeroes saturation; what differs is the contrast curve and
 * the toning, which is the whole craft of a monochrome print.
 * ------------------------------------------------------------------ */
const MONO = [
  look('silver', 'Silver', 'Mono', { saturation: -100, contrast: 20, highlights: 8 }),
  look('highkey', 'High key', 'Mono', { saturation: -100, contrast: -14, exposure: 18, shadows: 24 }),
  look('lowkey', 'Low key', 'Mono', { saturation: -100, contrast: 34, exposure: -14, shadows: -28, vignette: 40 }),
  look('sepia', 'Sepia', 'Mono', { saturation: -84, contrast: 12, temperature: 40, shadows: 12, grain: 10 }),
  look('selenium', 'Selenium', 'Mono', { saturation: -88, contrast: 24, temperature: -14, tint: 8 }),
  look('cyanotype', 'Cyanotype', 'Mono', { saturation: -80, contrast: 18, temperature: -46, tint: -10 }),
  look('platinum', 'Platinum', 'Mono', { saturation: -92, contrast: -6, temperature: 10, shadows: 16, highlights: 6 }),
  look('copper', 'Copper', 'Mono', { saturation: -78, contrast: 18, temperature: 32, tint: -12 }),
  look('ink', 'Ink', 'Mono', { saturation: -100, contrast: 46, shadows: -30 }),
  look('newsprint', 'Newsprint', 'Mono', { saturation: -100, contrast: 28, exposure: 6, grain: 30 }),
  look('hp5', 'Ilford HP5', 'Mono', { saturation: -100, contrast: 16, shadows: 8, grain: 22 }),
  look('delta3200', 'Delta 3200', 'Mono', { saturation: -100, contrast: 22, shadows: 12, grain: 40 }),
];

/* ------------------------------------------------------------------ *
 * Technical
 *
 * The unglamorous ones that fix a problem rather than create a style. They
 * matter more than the rest put together on footage that came out wrong.
 * ------------------------------------------------------------------ */
const TECHNICAL = [
  look('flat', 'Flat / log', 'Technical', { contrast: -28, saturation: -20, shadows: 18, highlights: -12 }),
  look('logto709', 'Log → Rec.709', 'Technical', { contrast: 30, saturation: 24, shadows: -10, highlights: -4 }),
  look('bleachbypass', 'Bleach bypass', 'Technical', { contrast: 34, saturation: -46, highlights: 10, shadows: -12 }),
  look('crossprocess', 'Cross process', 'Technical', { contrast: 28, saturation: 30, temperature: -16, tint: 22, shadows: -14 }),
  look('dayfornight', 'Day for night', 'Technical', { exposure: -30, contrast: 18, saturation: -30, temperature: -40, shadows: -20 }),
  look('skinsafe', 'Protect skin tones', 'Technical', { contrast: 10, saturation: 6, temperature: 6, highlights: -6 }),
  look('rescueshadow', 'Lift crushed shadows', 'Technical', { shadows: 40, contrast: -8, exposure: 6 }),
  look('rescuehigh', 'Recover highlights', 'Technical', { highlights: -40, contrast: 6, exposure: -4 }),
  look('punchup', 'Gentle punch', 'Technical', { contrast: 12, saturation: 8 }),
  look('neutral', 'Neutralise', 'Technical', { saturation: -6, contrast: 4 }),
];

/** Everything, in the order the panel shows it. */
export const LOOK_PACKS = [...STOCKS, ...MOODS, ...GENRE, ...SOCIAL, ...MONO, ...TECHNICAL];

/** Group name -> looks, for a panel that can be browsed rather than scrolled. */
export const LOOK_GROUPS = LOOK_PACKS.reduce((acc, l) => {
  (acc[l.group] ||= []).push(l);
  return acc;
}, {});
