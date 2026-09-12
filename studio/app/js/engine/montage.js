/*
 * Montages: the whole edit, not just the look.
 *
 * A style (templates-library.js) is a grade and some effects on top of a cut
 * you already made. A montage is the cut itself — how long it is, how it is
 * shaped over time, where it goes fast and where it breathes, what happens on
 * the drop, what the transitions are in each part, where the speed ramps and
 * the impact frames land, what it says on screen, and what it is cut to.
 *
 * The shape is the part nobody gets from a preset pack: an intro that holds,
 * a build that tightens, a drop that goes to one cut a beat with ramps and
 * slams, a breather, a second drop, an outro that lands. Written as
 * *sections* with a share of the length each, so the same montage fits
 * fifteen seconds or two minutes.
 *
 * The same spec is what the AI produces when somebody describes a montage in
 * words — parseMontage() reads the sentence into it — so a preset and a
 * description go through one builder, and one Ctrl+Z undoes either.
 */

import { EFFECTS } from './effects.js';
import { LOOK_BY_ID } from './filters.js';
import { TRANSITIONS } from './transitions.js';
import { RAMP_BY_ID } from './speed-ramps.js';
import { styleForGenre } from './beatmaker.js';

/* ------------------------------------------------------------------ */
/* the shapes                                                           */
/* ------------------------------------------------------------------ */

/*
 * A section: a name, a share of the edit's length, beats per cut, and what
 * happens inside it. `every` is beats per cut on the music grid (1 = a cut
 * every beat); with no music it becomes seconds at 120 BPM.
 */
const S = (name, share, every, extra = {}) => ({ name, share, every, ...extra });

const SHAPES = {
  // intro → build → drop → breather → drop → outro: the shape of most of them
  classic: [
    S('Intro', 0.14, 8, { transition: 'dissolve', transDur: 0.5 }),
    S('Build', 0.18, 4, { transition: 'zoomPunch', transDur: 0.16 }),
    S('Drop', 0.26, 1, { transition: 'whip', transDur: 0.12, ramps: 'velocity', impact: 4, zoom: true }),
    S('Breather', 0.1, 4, { transition: 'blurDissolve', transDur: 0.3, ramps: 'slowmo-hit' }),
    S('Drop 2', 0.22, 1, { transition: 'zoomPunch', transDur: 0.12, ramps: 'velocity', impact: 2, zoom: true }),
    S('Outro', 0.1, 8, { transition: 'dissolve', transDur: 0.6, ramps: 'ease-out', fade: true }),
  ],
  // straight up: build then drop, no breather
  rise: [
    S('Build', 0.3, 4, { transition: 'dissolve', transDur: 0.3, ramps: 'kickback' }),
    S('Drop', 0.55, 1, { transition: 'whip', transDur: 0.12, ramps: 'velocity', impact: 4, zoom: true }),
    S('Outro', 0.15, 4, { transition: 'dissolve', transDur: 0.5, fade: true }),
  ],
  // slow throughout, one lift
  cinematic: [
    S('Open', 0.25, 8, { transition: 'dissolve', transDur: 0.8, ramps: 'ease-in', fade: true }),
    S('Rise', 0.35, 4, { transition: 'dissolve', transDur: 0.5, ramps: 'dip' }),
    S('Peak', 0.25, 2, { transition: 'dipBlack', transDur: 0.3, impact: 8, ramps: 'slowmo-hit' }),
    S('Close', 0.15, 8, { transition: 'dissolve', transDur: 1.0, ramps: 'ease-out', fade: true }),
  ],
  // constant energy, no let-up
  relentless: [
    S('Go', 0.5, 2, { transition: 'zoomPunch', transDur: 0.12, ramps: 'punch', zoom: true }),
    S('Faster', 0.4, 1, { transition: 'whip', transDur: 0.1, ramps: 'stutter', impact: 2, zoom: true }),
    S('Land', 0.1, 4, { transition: 'dipBlack', transDur: 0.3, fade: true }),
  ],
  // for photos and slow footage
  gentle: [
    S('Open', 0.2, 8, { transition: 'dissolve', transDur: 0.9, fade: true }),
    S('Middle', 0.6, 4, { transition: 'dissolve', transDur: 0.6 }),
    S('Close', 0.2, 8, { transition: 'dissolve', transDur: 1.0, fade: true }),
  ],
};

/* ------------------------------------------------------------------ */
/* the presets                                                          */
/* ------------------------------------------------------------------ */

/*
 * Each one is a complete answer: shape, length, ratio, tempo, look, the
 * effects on the drop and the effects everywhere, the title treatment,
 * captions or not, and what to cut to when there is no music.
 */
export const MONTAGES = [
  { id: 'beat-montage', name: 'Beat montage', emoji: '🎚', genre: 'generic', tier: 'free',
    blurb: 'Cuts on the beat, a build, a drop with punch-ins and ramps, a clean grade. The one to start from.',
    shape: 'classic', ratio: '9:16', targetDur: 30, look: 'punch', beat: 'trap',
    drop: [['zoomPunch', { amount: 45, every: 0.5 }]],
    all: [] },

  { id: 'anime-opening', name: 'Anime opening', emoji: '⚔️', genre: 'anime', tier: 'free',
    blurb: 'Slow cold open, then the drop: one cut a beat, chromatic slams, speed lines, impact frames.',
    shape: 'classic', ratio: '9:16', targetDur: 30, look: 'animepop', beat: 'trap',
    drop: [['rgbSplit', { amount: 24, pulse: 70 }], ['linesRadial', { amount: 50 }], ['motionBlur', { amount: 55, samples: 6 }]],
    all: [['glow', { amount: 22, radius: 16 }]],
    title: { text: 'YOUR NAME', preset: 'hook', style: 'anime-slam', anim: 'letterPop', placeholder: true } },

  { id: 'phonk-drift', name: 'Phonk drift', emoji: '🚗', genre: 'phonk', tier: 'free',
    blurb: 'VHS crush, white flashes on the beat, tape wobble, sliding 808s.',
    shape: 'rise', ratio: '9:16', targetDur: 25, look: 'phonkdark', beat: 'phonk',
    drop: [['vhsWorn', { amount: 45 }], ['shake', { amount: 32 }], ['flash', { amount: 70, every: 0.45, length: 0.06 }]],
    all: [['vignetteHard', { amount: 45 }], ['filmGrain', { amount: 22 }]] },

  { id: 'velocity-edit', name: 'Velocity edit', emoji: '🌀', genre: 'velocity', tier: 'creator',
    blurb: 'Ramps into every cut, zoom blur on the acceleration, glow, whip pans. The smooth one.',
    shape: 'relentless', ratio: '9:16', targetDur: 20, look: 'punch', beat: 'dnb',
    drop: [['zoomBlur', { amount: 45 }], ['motionBlur', { amount: 70, samples: 8 }]],
    all: [['glow', { amount: 35, radius: 20 }]] },

  { id: 'cinematic-trailer', name: 'Cinematic trailer', emoji: '🎞', genre: 'trailer', tier: 'free',
    blurb: 'Scope bars, teal and orange, dips to black, one slow-motion peak, a title card.',
    shape: 'cinematic', ratio: '2.39:1', targetDur: 45, look: 'blockbuster', beat: 'cinematic',
    drop: [['flareAnamorphic', { amount: 35, x: 72, y: 30 }]],
    all: [['crop239', { amount: 100 }], ['filmGrain', { amount: 16 }]],
    title: { text: 'COMING SOON', preset: 'endcard', style: 'condensed-punch', anim: 'tracking' } },

  { id: 'sports-hype', name: 'Sports hype', emoji: '🏆', genre: 'sports', tier: 'free',
    blurb: 'Fast cuts, punch-ins on the beat, slow-mo on the highlight, hard flashes.',
    shape: 'classic', ratio: '9:16', targetDur: 30, look: 'sports', beat: 'hype',
    drop: [['zoomPunch', { amount: 60, every: 0.5 }], ['flash', { amount: 50, every: 0.5, length: 0.05 }]],
    all: [['bleachBypass', { amount: 25 }]],
    title: { text: 'HIGHLIGHTS', preset: 'hook', style: 'impact-meme', anim: 'dropIn' } },

  { id: 'gaming-clutch', name: 'Gaming clutch', emoji: '🎮', genre: 'gaming', tier: 'free',
    blurb: 'Glitch cuts, RGB tears on the kill, hit sparks, a stutter drop.',
    shape: 'rise', ratio: '16:9', targetDur: 25, look: 'gaming', beat: 'hype',
    drop: [['rgbSplit', { amount: 28, pulse: 80 }], ['blockGlitch', { amount: 40 }], ['hitSpark', { amount: 50 }]],
    all: [['glow', { amount: 25 }]],
    title: { text: 'CLUTCH', preset: 'hook', style: 'neon-green', anim: 'glitch' } },

  { id: 'travel-recap', name: 'Travel recap', emoji: '✈️', genre: 'travel', tier: 'free',
    blurb: 'Warm and bright, whip pans between places, a slow-motion sunset in the middle.',
    shape: 'classic', ratio: '9:16', targetDur: 30, look: 'travel', beat: 'house',
    drop: [['whipPan', { amount: 55 }]],
    all: [['leakTRWarm', { amount: 22 }]],
    title: { text: 'SUMMER', preset: 'headline', style: 'sunset', anim: 'riseUp' } },

  { id: 'car-reel', name: 'Car reel', emoji: '🏎', genre: 'car', tier: 'creator',
    blurb: 'Rolling shots with motion blur, anamorphic flares at night, a phonk drop with smoke.',
    shape: 'classic', ratio: '9:16', targetDur: 30, look: 'neonnights', beat: 'phonk',
    drop: [['motionBlur', { amount: 55 }], ['flareAnamorphic', { amount: 45, x: 30, y: 40 }], ['shake', { amount: 28 }]],
    all: [['crop239', { amount: 100 }], ['filmGrain', { amount: 18 }]] },

  { id: 'fitness-transformation', name: 'Fitness transformation', emoji: '🏋', genre: 'fitness', tier: 'free',
    blurb: 'Hard grade, cuts on every rep in the drop, a before-and-after split at the peak.',
    shape: 'rise', ratio: '9:16', targetDur: 25, look: 'fitness', beat: 'hype',
    drop: [['hitSpark', { amount: 40 }], ['shake', { amount: 25 }]],
    all: [['bleachBypass', { amount: 45 }], ['vignetteHard', { amount: 40 }]],
    title: { text: '12 WEEKS', preset: 'hook', style: 'condensed-punch', anim: 'letterPop' } },

  { id: 'horror-teaser', name: 'Horror teaser', emoji: '🩸', genre: 'horror', tier: 'creator',
    blurb: 'Slow, cold, dips to black, then a jump-scare drop with inverted frames and static.',
    shape: 'cinematic', ratio: '16:9', targetDur: 30, look: 'horror', beat: 'cinematic',
    drop: [['tvStatic', { amount: 40 }], ['invertPulse', { at: 0.5, length: 0.08, mode: 'white' }], ['shake', { amount: 50 }]],
    all: [['vignetteHard', { amount: 60 }], ['filmGrain', { amount: 35 }]],
    title: { text: 'IT KNOWS', preset: 'endcard', style: 'blood-drip', anim: 'flicker' } },

  { id: 'wedding-highlight', name: 'Wedding highlight', emoji: '💍', genre: 'wedding', tier: 'free',
    blurb: 'Gentle dissolves, golden grade, one slow-motion peak on the kiss, names on screen.',
    shape: 'gentle', ratio: '16:9', targetDur: 60, look: 'romance', beat: 'cinematic',
    drop: [], all: [['softFocus', { amount: 22 }], ['goldenHour', { amount: 30 }]],
    title: { text: 'A & B', preset: 'headline', style: 'serif-editorial', anim: 'fade', placeholder: true } },

  { id: 'glitch-hardstyle', name: 'Glitch hardstyle', emoji: '▚', genre: 'glitch', tier: 'creator',
    blurb: 'Datamosh, pixel sort, slice tears, stutter ramps, one cut a beat all the way.',
    shape: 'relentless', ratio: '9:16', targetDur: 20, look: 'cyberpunk', beat: 'dnb',
    drop: [['datamosh', { amount: 55 }], ['sliceShiftH', { amount: 45 }], ['rgbSplit', { amount: 30, pulse: 90 }]],
    all: [['compressionLight', { amount: 30 }]] },

  { id: 'lofi-day', name: 'Lo-fi day', emoji: '☕', genre: 'lofi', tier: 'free',
    blurb: 'Dusty grade, slow cuts, tape wobble, a vinyl bed. Nothing shouts.',
    shape: 'gentle', ratio: '9:16', targetDur: 30, look: 'lofi', beat: 'lofi',
    drop: [], all: [['vhsWobble', { amount: 18 }], ['filmGrain', { amount: 28 }], ['leakTLWarm', { amount: 18 }]] },

  { id: 'music-video', name: 'Music video', emoji: '🎤', genre: 'music', tier: 'creator',
    blurb: 'Cuts on the beat throughout, mirror and kaleidoscope on the chorus, punch-ins.',
    shape: 'classic', ratio: '9:16', targetDur: 45, look: 'musicvideo', beat: 'house',
    drop: [['mirrorQuad', { amount: 100 }], ['glow', { amount: 40 }]],
    all: [['flash', { amount: 35, every: 1, length: 0.05 }]] },

  { id: 'meme-brainrot', name: 'Brainrot', emoji: '🧠', genre: 'meme', tier: 'free',
    blurb: 'Deep fried, zoom spam, earrape-safe flashes, chaos from the first frame.',
    shape: 'relentless', ratio: '9:16', targetDur: 15, look: 'punch', beat: 'trap',
    drop: [['deepFried', { amount: 85 }], ['zoomPunch', { amount: 70, every: 0.3 }], ['shake', { amount: 45 }]],
    all: [['compressionHeavy', { amount: 55 }]],
    title: { text: 'nah', preset: 'hook', style: 'impact-meme', anim: 'rubber' } },

  { id: 'vlog-recap', name: 'Vlog recap', emoji: '📹', genre: 'vlog', tier: 'free',
    blurb: 'Warm, easy cuts with captions, a quicker middle, a soft landing.',
    shape: 'classic', ratio: '9:16', targetDur: 40, look: 'vlogwarm', beat: 'lofi', captions: 'tiktok',
    drop: [], all: [['softFocus', { amount: 12 }]],
    title: { text: 'this week', preset: 'lower', style: 'clean-white', anim: 'slideUp' } },

  { id: 'product-launch', name: 'Product launch', emoji: '📦', genre: 'product', tier: 'creator',
    blurb: 'Clean, bright, push-ins on the detail shots, a reveal drop, the name on screen.',
    shape: 'rise', ratio: '1:1', targetDur: 20, look: 'ytclean', beat: 'house',
    drop: [['movePushIn', { amount: 120, over: 2 }], ['flareStar', { amount: 30 }]],
    all: [['softFocus', { amount: 10 }]],
    title: { text: 'NEW', preset: 'hook', style: 'chrome', anim: 'zoomIn' } },

  { id: 'photo-dump', name: 'Photo dump', emoji: '📸', genre: 'photo', tier: 'free',
    blurb: 'Stills with a slow push on each, film grade, quick middle, a gentle close.',
    shape: 'gentle', ratio: '4:5', targetDur: 20, look: 'portra400', beat: 'lofi',
    drop: [], all: [['filmGrain', { amount: 20 }], ['leakTRGold', { amount: 18 }]], kenBurns: true },

  { id: 'tiktok-transformation', name: 'Transformation', emoji: '✨', genre: 'transformation', tier: 'free',
    blurb: 'Before, a flash, after. Slow build, one hard cut on the beat, sparkles on the reveal.',
    shape: 'rise', ratio: '9:16', targetDur: 15, look: 'beauty', beat: 'trap',
    drop: [['sparkles', { amount: 45 }], ['glow', { amount: 30 }]],
    all: [], title: { text: 'wait for it', preset: 'hook', style: 'soft-glow', anim: 'typewriter' } },

  { id: 'drill-edit', name: 'Drill edit', emoji: '🥶', genre: 'drill', tier: 'creator',
    blurb: 'Cold grade, sliding bass, off-grid cuts, shake and tear on the drop.',
    shape: 'rise', ratio: '9:16', targetDur: 25, look: 'frostbite', beat: 'drill',
    drop: [['shake', { amount: 38 }], ['sliceShiftV', { amount: 35 }], ['rgbSplit', { amount: 18, pulse: 60 }]],
    all: [['vignetteHard', { amount: 45 }], ['filmGrain', { amount: 25 }]] },
];

export const MONTAGE_BY_ID = Object.fromEntries(MONTAGES.map((m) => [m.id, m]));

/* ------------------------------------------------------------------ */
/* building                                                             */
/* ------------------------------------------------------------------ */

/**
 * Turn a spec into plan steps.
 *
 * `ctx`: { hasMusic, bpm, clipCount, ratio, onTimeline, hasPhotos, targetDur }
 *
 * The structural cut is one op — structuredCut — so apply.js can lay the
 * whole timeline out with a pace that changes per section and hand back
 * where each section starts and ends. Everything after it addresses those
 * ranges, so a ramp meant for the drop lands on the drop.
 */
export function buildMontage(spec, ctx = {}) {
  const shape = SHAPES[spec.shape] || SHAPES.classic;
  const steps = [];
  const targetDur = spec.targetDur || ctx.targetDur || 30;
  const ratio = spec.ratio || ctx.ratio || '9:16';
  const sections = shape.map((sec) => ({ ...sec, every: sec.every * (spec.paceScale || 1) }));

  if (ratio !== ctx.ratio) {
    steps.push({ op: 'setRatio', args: { ratio }, label: `Switch the canvas to ${ratio}`,
      detail: ratio === '9:16' ? 'Full-screen on a phone.' : `Everything is reframed to ${ratio}.` });
  }

  if (!ctx.hasMusic && spec.beat) {
    steps.push({
      op: 'generateBeat', args: { style: spec.beat, seconds: targetDur + 2 },
      label: `Make a ${spec.beat} beat to cut to`,
      detail: 'There is no music in the pool, so a beat is made to order — its grid is known to the sample, so every cut lands. Swap in your own song afterwards and "sync to the music" re-times the cuts.',
    });
  }

  steps.push({
    op: 'structuredCut',
    args: { targetDur, sections: sections.map((s) => ({ name: s.name, share: s.share, every: s.every })), shuffle: Boolean(spec.shuffle) },
    label: `Cut ${sections.length} sections: ${sections.map((s) => `${s.name} (${paceWord(s.every)})`).join(' → ')}`,
    detail: `${targetDur}s total. ${ctx.hasMusic || spec.beat ? 'Every cut on the beat grid, ' : 'Evenly timed, '}with the pace changing section by section: ${sections.map((s) => `${s.name} ${Math.round(s.share * 100)}%`).join(', ')}.`,
  });

  if (spec.kenBurns || ctx.hasPhotos) {
    steps.push({ op: 'kenBurns', args: { amount: 0.12 }, label: 'A slow push on every photo', detail: 'A still that sits dead on screen looks broken; a gentle zoom fixes it.' });
  }

  if (spec.look && spec.look !== 'none') {
    steps.push({ op: 'applyLook', args: { look: spec.look, strength: spec.lookStrength ?? 0.9 },
      label: `Grade everything: ${LOOK_BY_ID[spec.look]?.name || spec.look}`, detail: 'Per clip, so any shot can be changed on its own.' });
  }

  for (const [effect, params] of spec.all || []) {
    if (!EFFECTS[effect]) continue;
    steps.push({ op: 'addEffect', args: { effect, params, scope: 'all' },
      label: `${EFFECTS[effect].name} on every shot`, detail: EFFECTS[effect].group ? `${EFFECTS[effect].group} effect.` : '' });
  }

  sections.forEach((sec, i) => {
    const range = { section: i };
    if (sec.ramps && RAMP_BY_ID[sec.ramps]) {
      steps.push({ op: 'sectionRamp', args: { ...range, ramp: sec.ramps },
        label: `${sec.name}: ${RAMP_BY_ID[sec.ramps].name} speed ramp on every shot`,
        detail: RAMP_BY_ID[sec.ramps].blurb });
    }
    if (sec.zoom) {
      steps.push({ op: 'beatZoom', args: { ...range, amount: 0.14, hold: 0.12 },
        label: `${sec.name}: punch in on every beat`, detail: 'Keyframed, so any shot can lose it.' });
    }
    if (sec.impact) {
      steps.push({ op: 'impactFrames', args: { ...range, every: sec.impact, style: spec.genre === 'horror' ? 'white' : 'invert', length: 0.07 },
        label: `${sec.name}: impact frames every ${sec.impact} shots`, detail: 'One or two slammed frames — the hit an edit lands on.' });
    }
    if ((sec.every <= 1.5 || sec.name.startsWith('Drop') || sec.name === 'Peak' || sec.name === 'Faster' || sec.name === 'Go') && (spec.drop || []).length) {
      for (const [effect, params] of spec.drop) {
        if (!EFFECTS[effect]) continue;
        steps.push({ op: 'addEffect', args: { ...range, effect, params, scope: 'section' },
          label: `${sec.name}: ${EFFECTS[effect].name}`, detail: 'Only on this section — the drop is loud because the rest is not.' });
      }
    }
    if (sec.transition && TRANSITIONS[sec.transition]) {
      steps.push({ op: 'addTransitions', args: { ...range, type: sec.transition, dur: sec.transDur ?? 0.25 },
        label: `${sec.name}: ${TRANSITIONS[sec.transition].name} on the cuts`, detail: `${(sec.transDur ?? 0.25).toFixed(2)}s.` });
    }
  });

  if (spec.title?.text) {
    steps.push({ op: 'addTitle', args: { content: spec.title.text, preset: spec.title.preset || 'hook', at: spec.title.at ?? 0.4, dur: spec.title.dur ?? 2.4, style: spec.title.style, anim: spec.title.anim },
      label: `Put "${spec.title.text}" on the opening`, detail: `${spec.title.style ? `In the ${spec.title.style} style` : 'Styled'}, ${spec.title.anim ? `animating in with ${spec.title.anim}` : 'animated in'}.` });
  }
  if (spec.captions && ctx.hasSpeech !== false) {
    steps.push({ op: 'captions', args: { style: spec.captions }, label: `${spec.captions} captions`, detail: 'Timed to the speech.' });
  }
  if (ctx.hasMusic || spec.beat) {
    steps.push({ op: 'fitMusic', args: { fadeOut: 0.8, duck: Boolean(spec.captions) }, label: 'Fit the track to the edit', detail: spec.captions ? 'Ducked under the voice.' : 'Trimmed with a fade.' });
  }
  if (sections.some((s) => s.fade)) {
    steps.push({ op: 'fadeEnds', args: { dur: 0.6 }, label: 'Fade in and out', detail: 'Six tenths of a second at each end.' });
  }
  return steps;
}

function paceWord(every) {
  if (every <= 1) return 'a cut every beat';
  if (every <= 2) return 'every 2 beats';
  if (every <= 4) return 'every 4 beats';
  return 'slow';
}

/** Build a preset by id. */
export function buildMontageById(id, ctx) {
  const m = MONTAGE_BY_ID[id];
  if (!m) return null;
  return { montage: m, steps: buildMontage(m, ctx), summary: describeSpec(m, ctx) };
}

/** One paragraph: what will be made. */
export function describeSpec(spec, ctx = {}) {
  const shape = SHAPES[spec.shape] || SHAPES.classic;
  const dur = spec.targetDur || ctx.targetDur || 30;
  const bits = [`A ${dur}s ${spec.ratio || ctx.ratio || '9:16'} ${spec.name ? spec.name.toLowerCase() : `${spec.genre || ''} montage`.trim()}`];
  bits.push(`in ${shape.length} sections (${shape.map((s) => s.name.toLowerCase()).join(', ')})`);
  if (spec.look) bits.push(`graded ${LOOK_BY_ID[spec.look]?.name || spec.look}`);
  if (ctx.hasMusic) bits.push('cut to your music'); else if (spec.beat) bits.push(`cut to a made-to-order ${spec.beat} beat`);
  if (spec.title?.text) bits.push(`with "${spec.title.text}" on screen`);
  return `${bits.join(', ')}.`;
}

/* ------------------------------------------------------------------ */
/* reading a description                                                */
/* ------------------------------------------------------------------ */

/* Specific genres first: a horror teaser is horror, an anime trailer is anime, and the generic words come last. */
const GENRE_WORDS = [
  [/\banime\b|\bamv\b|\bmanga\b|jujutsu|naruto|demon slayer|one piece|\bweeb\b/i, 'anime', 'anime-opening'],
  [/\bphonk\b|\bdrift(ing)?\b|\bjdm\b|memphis/i, 'phonk', 'phonk-drift'],
  [/\bvelocity\b|smooth edit|flow edit|\bvelo\b|speed[- ]ramp(?:s|ed|ing)? (?:montage|edit|reel|video|recap|compilation|style|highlight|hype)/i, 'velocity', 'velocity-edit'],
  [/\bdrill\b/i, 'drill', 'drill-edit'],
  [/\bglitch\b|datamosh|hardstyle|\bbroken\b|corrupt/i, 'glitch', 'glitch-hardstyle'],
  [/\bhorror\b|\bscary\b|\bcreepy\b|analog horror|jump ?scare/i, 'horror', 'horror-teaser'],
  [/\bwedding\b|\bbride\b|\bgroom\b|engagement|\bproposal\b/i, 'wedding', 'wedding-highlight'],
  [/\bgaming\b|\bgameplay\b|\bclutch\b|\bkills?\b|fortnite|valorant|warzone|\bapex\b|\bcod\b|\bfrag/i, 'gaming', 'gaming-clutch'],
  [/\bcar\b|\bcars\b|rolling shots?|\bbmw\b|\bsupra\b|\bmustang\b|automotive|\bbike\b|\bmotorcycle\b/i, 'car', 'car-reel'],
  [/\bgym\b|fitness|workout|\bfitness transformation\b|\blifting\b|\bbulk\b|\bshred\b/i, 'fitness', 'fitness-transformation'],
  [/\btravel\b|\btrip\b|vacation|holiday|\bjapan\b|\bbali\b|\beurope\b|summer recap/i, 'travel', 'travel-recap'],
  [/\blo-?fi\b|\bchill\b|\bcalm\b|study|\bcozy\b|\bcosy\b/i, 'lofi', 'lofi-day'],
  [/music video|\bmv\b|\bsinging\b|\blyric|\bperformance\b/i, 'music', 'music-video'],
  [/\bmeme\b|brainrot|deep ?fried|\bshitpost\b|\bgoofy\b/i, 'meme', 'meme-brainrot'],
  [/\bvlog\b|\bday in (my|the) life\b|\bweekly\b|\bdaily\b/i, 'vlog', 'vlog-recap'],
  [/\bproduct\b|\blaunch\b|\bunboxing\b|\bad\b|\badvert|commercial|\bbrand\b|\bpromo\b/i, 'product', 'product-launch'],
  [/before and after|\bglow ?up\b|\breveal\b|makeover/i, 'transformation', 'tiktok-transformation'],
  [/\bsports?\b|\bfootball\b|basketball|soccer|\bgoals?\b|\bdunks?\b|\bmatch\b|\bgame ?day\b|\bhoops\b/i, 'sports', 'sports-hype'],
  [/\btrailer\b|\bteaser\b|cinematic|\bepic\b|blockbuster|movie/i, 'trailer', 'cinematic-trailer'],
  [/\bphotos?\b|\bpictures?\b|\bpics?\b|\bstills?\b|screenshots?|photo dump|\bslideshow\b/i, 'photo', 'photo-dump'],
];

/* Words that lean one way but are also ordinary editing words; they only count when nothing above matched. */
const WEAK_GENRE_WORDS = [
  [/\bhighlights?\b/i, 'sports', 'sports-hype'],
  [/\bgame\b/i, 'gaming', 'gaming-clutch'],
];

const SHAPE_WORDS = [
  [/start(s)? slow|slow (start|intro|open)|build(s)? up|builds? then drops?|rise and drop|then goes? (crazy|hard|off)/i, 'classic'],
  [/no (intro|build)|straight (in|into it)|from the (first|start)|from the jump|relentless|non-?stop|full send/i, 'relentless'],
  [/build (up )?(and|then) drop|one drop|single drop/i, 'rise'],
  [/gentle|soft|slow(ly)? (throughout|all the way)|calm|peaceful|emotional/i, 'gentle'],
];

/*
 * What counts as asking for a montage.
 *
 * The cost of a wrong yes is high: the timeline is rebuilt. So the rule is
 * strict and written out. A montage is asked for when the sentence names
 * the *thing* (a montage, an edit, a reel, a recap, an AMV, a trailer…) and
 * either asks for it to be made or names a genre; a bare genre word is not
 * enough ("add anime speed lines to clip 2" is an effect, not an edit), and
 * a sentence about one clip or one operation never is, whatever else it
 * says. "video" alone is too common a word — "mute the video" — so it only
 * counts with both a making verb and a genre.
 */
const THING = /\b(montages?|recaps?|reels?|amv|amvs|compilations?|trailers?|teasers?|showreels?|slideshows?|highlights|highlights? (reel|video|package)|hype (video|reel)|lyric video|music video|photo dump|brainrot|glow ?up|fan ?cam|before[- ]and[- ]after|\bads?\b|advert|commercial|promo|edit(?:s)?)\b/i;
// "edit" as the noun: something sits in front of it that is not a verb's object.
// "the edit", "my edit", "this edit" are an edit that exists; "an edit", "a sick edit", "a naruto edit" are one
// to make. So: a word in front of "edit" that is not a determiner pointing at an existing one, and nothing after it
// that would make "edit" a verb with an object.
const EDIT_NOUN = /(?:^|\s)(?!(?:please|to|and|then|just|now|you|i|we|go|will|should|can|could|dont|don't|not|also|gonna|wanna|the|my|our|this|that|whole|your|their|his|her|its)\s)[\w'-]+\s+edits?\b(?!\s+(?:clip|shot|track|the|this|it|my|these|those|them|out|in|of|(?:a|an|some|all|every|each|that)\s+(?:clips?|shots?|tracks?|videos?|bits?|parts?|sections?|few|one))\b)/i;
const MAKE = /\b(make|build|create|turn|put together|put\b.{0,30}\btogether|cut me|cut together|do|give|generate|produce|assemble|want|need|can you|could you|i'?d like|let'?s|edit (these|my|this|all)|i have|got|throw together|whip up|render|craft|design)\b/i;
const SINGLE_OP = /\b(mute|unmute|trim|split|delete|remove|louder|quieter|volume|rotate|flip|crop|freeze|reverse|duplicate|nudge|swap|rename|export|undo|redo|caption this|subtitle this|zoom in on|denoise|stabili[sz]e|colou?r match|normali[sz]e)\b/i;
const CLIP_REF = /\b(clips?\s*#?\d+|the (first|second|third|fourth|fifth|last|next|previous) (clip|shot|one)|this (clip|shot|one)|that (clip|shot)|selected|the selection|current clip|clip (i|you) (selected|picked))\b/i;
const VIDEO_WORD = /\b(videos?|clips|footage|shots)\b/i;
// A making verb with the thing as its object, within a clause: "make a montage", "turn these into a reel",
// "build a cinematic trailer from clip 2". The article is what separates it from "make clip 3 more amv".
const MAKES_THING = /\b(make|build|create|put together|cut me|cut together|give me|generate|produce|assemble|throw together|whip up|do|want|need|turn|edit|render|craft|design)\b[^.!?]{0,40}?\b(an?|another|one|some|my|me|the whole|into)\s+(?:[\w'-]+\s+){0,3}?(montages?|edits?|recaps?|reels?|amvs?|compilations?|trailers?|teasers?|showreels?|slideshows?|highlights?(?: reel| video| package)?|hype (?:video|reel)|lyric video|music video|photo dump|brainrot|glow ?up|fan ?cam|videos?)\b/i;

/**
 * Read a description into a spec.
 *
 * Returns null when the sentence is not asking for a montage at all — a
 * request like "mute clip 2" must not be turned into one.
 */
export function parseMontage(text) {
  const s = String(text || '');
  const lower = s.toLowerCase();
  // "make it look like a trailer" asks for a look, not a build.
  if (/\b(looks?|feels?|sounds?)\s+like\b/i.test(lower)) return null;
  // A title in quotes is not a description: "Japan 2026" on a photo dump does not make it a travel recap.
  const bare = lower.replace(/["“”][^"“”]*["“”]/g, ' ');
  let genre = null, presetId = null;
  for (const [re, g, id] of GENRE_WORDS) if (re.test(bare)) { genre = g; presetId = id; break; }
  if (!genre) for (const [re, g, id] of WEAK_GENRE_WORDS) if (re.test(bare)) { genre = g; presetId = id; break; }

  const thing = THING.test(lower) && (!/\bedits?\b/i.test(lower) || EDIT_NOUN.test(lower) || THING.test(lower.replace(/\bedits?\b/g, '')));
  const make = MAKE.test(lower);
  const makesThing = MAKES_THING.test(lower);
  // One operation, or one clip, is never a montage — unless the sentence also makes one.
  if (SINGLE_OP.test(lower) && !makesThing) return null;
  if (CLIP_REF.test(lower) && !makesThing) return null;
  const asked = (thing && (make || genre)) || (genre && make && VIDEO_WORD.test(lower));
  if (!asked) return null;

  const base = presetId ? MONTAGE_BY_ID[presetId] : MONTAGE_BY_ID['beat-montage'];
  const spec = { ...structuredClone({ ...base, drop: base.drop || [], all: base.all || [] }), fromPrompt: true, genre: genre || base.genre };

  for (const [re, shape] of SHAPE_WORDS) if (re.test(lower)) { spec.shape = shape; break; }

  const secs = lower.match(/(\d+(?:\.\d+)?)\s*(?:-|to)?\s*(?:s|sec|secs|second|seconds)\b/);
  const mins = lower.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)\b/);
  const half = /\b(half a minute|30 ?s(ec)?)\b/.test(lower);
  if (secs) spec.targetDur = Number(secs[1]);
  else if (mins) spec.targetDur = Number(mins[1]) * 60;
  else if (/\ba minute\b|\bone minute\b/.test(lower)) spec.targetDur = 60;
  else if (half) spec.targetDur = 30;
  if (spec.targetDur) spec.targetDur = Math.min(600, Math.max(5, spec.targetDur));

  // A named shape beats a platform, and a platform beats the preset. "reel"
  // is also the name of the thing being made, so it is the weakest signal.
  if (/9:16|\bvertical\b|\bportrait\b/i.test(lower)) spec.ratio = '9:16';
  else if (/16:9|\blandscape\b|\bwidescreen\b/i.test(lower)) spec.ratio = '16:9';
  else if (/\bsquare\b|1:1/i.test(lower)) spec.ratio = '1:1';
  else if (/cinemascope|2\.39|anamorphic|\bscope\b/i.test(lower)) spec.ratio = '2.39:1';
  else if (/tiktok|\bshorts?\b|instagram|\binsta\b|\big\b|\bstory\b/i.test(lower)) spec.ratio = '9:16';
  else if (/youtube|\byt\b/i.test(lower)) spec.ratio = '16:9';
  else if (/\breels?\b/i.test(lower)) spec.ratio = '9:16';

  if (/\b(fast|faster|quicker|more cuts|frantic|insane|crazy fast|hyper|rapid|quick cuts|fast cuts)\b/i.test(lower)) spec.paceScale = 0.5;
  if (/\b(slower|fewer cuts|longer shots|relaxed|slow cuts)\b/i.test(lower)) spec.paceScale = 2;

  // Named ingredients on top of the preset.
  const addDrop = (id, params) => { if (EFFECTS[id] && !spec.drop.some(([e]) => e === id)) spec.drop.push([id, params]); };
  const addAll = (id, params) => { if (EFFECTS[id] && !spec.all.some(([e]) => e === id)) spec.all.push([id, params]); };
  if (/rgb split|chromatic|aberration/i.test(lower)) addDrop('rgbSplit', { amount: 24, pulse: 70 });
  if (/speed ?lines|action lines/i.test(lower)) addDrop('linesRadial', { amount: 50 });
  if (/motion blur/i.test(lower)) addAll('motionBlur', { amount: 55, samples: 6 });
  if (/\b(shake|shaky|earthquake|camera shake)\b/i.test(lower)) addDrop('shake', { amount: 35 });
  if (/\b(glow|bloom)\b/i.test(lower)) addAll('glow', { amount: 32, radius: 18 });
  if (/\bvhs\b|\btape\b/i.test(lower)) addAll('vhsWorn', { amount: 40 });
  if (/\bflash(es|ing)?\b|\bstrobe\b/i.test(lower)) addDrop('flash', { amount: 60, every: 0.5, length: 0.06 });
  if (/\bglitch(es|y)?\b/i.test(lower)) addDrop('blockGlitch', { amount: 40 });
  if (/\bgrain\b|film look/i.test(lower)) addAll('filmGrain', { amount: 24 });
  if (/black bars|letterbox|cinematic bars/i.test(lower)) addAll('crop239', { amount: 100 });
  if (/no (effects?|filters?)\b/i.test(lower)) { spec.drop = []; spec.all = []; }
  if (/no (speed )?ramps?\b|without (speed )?ramps?\b/i.test(lower)) spec.noRamps = true;
  if (/no impact|without impact/i.test(lower)) spec.noImpact = true;
  if (/no transitions?|without transitions?|hard cuts? only|straight cuts?|jump cuts? only/i.test(lower)) spec.noTransitions = true;

  const looks = [[/black (and|&|n) white|monochrome|\bb&w\b|\bbw\b/i, 'mono'], [/teal (and|&) orange/i, 'cinematic'], [/vintage|retro|faded/i, 'fade'],
    [/\bwarm\b|golden/i, 'sunburn'], [/\bcold\b|\bicy\b|blue tone/i, 'frostbite'], [/\bneon\b|cyberpunk/i, 'neonnights'], [/\bvivid\b|colou?rful|saturated/i, 'vivid'],
    [/\bdark\b|\bmoody\b|crushed/i, 'phonkdark'], [/\bbright\b|\bclean\b|\blight\b/i, 'ytclean']];
  for (const [re, look] of looks) if (re.test(lower) && LOOK_BY_ID[look]) { spec.look = look; break; }

  if (/caption|subtitle/i.test(lower)) spec.captions = /karaoke/i.test(lower) ? 'karaoke' : 'tiktok';
  const quoted = s.match(/["“”]([^"“”]{1,60})["“”]|(?:says?|saying|titled?|called|text|reads?)\s+'([^']{1,60})'/i);
  const quotedText = quoted ? (quoted[1] || quoted[2]) : null;
  if (quotedText) spec.title = { ...(spec.title || { preset: 'hook', anim: 'letterPop' }), text: quotedText.trim(), placeholder: false };
  else if (/no (title|text)|without (a )?(title|text)/i.test(lower) || spec.title?.placeholder) spec.title = null;   // a stand-in name is for the gallery, not for someone's edit
  if (/shuffle|random order|mix (it |them )?up/i.test(lower)) spec.shuffle = true;

  if (spec.noRamps) spec.stripRamps = true;
  return spec;
}

/** Apply the "no ramps / no impact / no transitions" switches to the built steps. */
export function trimSteps(spec, steps) {
  return steps.filter((st) => {
    if (spec.noRamps && st.op === 'sectionRamp') return false;
    if (spec.noImpact && st.op === 'impactFrames') return false;
    if (spec.noTransitions && st.op === 'addTransitions') return false;
    return true;
  });
}

export { styleForGenre };

/* ------------------------------------------------------------------ */
/* validation                                                           */
/* ------------------------------------------------------------------ */

export const MONTAGE_PROBLEMS = [];
for (const m of MONTAGES) {
  if (!SHAPES[m.shape]) MONTAGE_PROBLEMS.push(`${m.id}: no shape "${m.shape}"`);
  if (m.look && !LOOK_BY_ID[m.look]) MONTAGE_PROBLEMS.push(`${m.id}: no look "${m.look}"`);
  for (const [fx, params] of [...(m.drop || []), ...(m.all || [])]) {
    if (!EFFECTS[fx]) { MONTAGE_PROBLEMS.push(`${m.id}: no effect "${fx}"`); continue; }
    for (const k of Object.keys(params || {})) if (!(k in (EFFECTS[fx].params || {}))) MONTAGE_PROBLEMS.push(`${m.id}: "${fx}" has no parameter "${k}"`);
  }
  for (const sec of SHAPES[m.shape] || []) {
    if (sec.transition && !TRANSITIONS[sec.transition]) MONTAGE_PROBLEMS.push(`${m.id}: shape uses unknown transition "${sec.transition}"`);
    if (sec.ramps && !RAMP_BY_ID[sec.ramps]) MONTAGE_PROBLEMS.push(`${m.id}: shape uses unknown ramp "${sec.ramps}"`);
  }
  const shares = (SHAPES[m.shape] || []).reduce((a, s) => a + s.share, 0);
  if (Math.abs(shares - 1) > 0.02) MONTAGE_PROBLEMS.push(`${m.id}: section shares add to ${shares.toFixed(2)}`);
}
if (MONTAGE_PROBLEMS.length) {
  // eslint-disable-next-line no-console -- a build-time mistake shipped to runtime
  console.warn(`[montage] ${MONTAGE_PROBLEMS.length} problem(s):\n  ${MONTAGE_PROBLEMS.join('\n  ')}`);
}
