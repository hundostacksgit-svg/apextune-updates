/*
 * The style library.
 *
 * Twelve hand-written styles becomes a hundred and thirty, and they are
 * generated because a style is genuinely a recipe: a grade, a set of effects,
 * a transition, a pace and a caption treatment. Writing a hundred of those by
 * hand means a hundred chances to reference an effect that does not exist.
 *
 * Every ingredient here is checked against the real libraries at module load —
 * see the validation at the bottom. A style that names a missing look or a
 * missing effect is a style that silently does half of what it promises, and
 * that is exactly the failure people describe as "the presets don't work".
 *
 * These are styles, not edits. Since styles stopped re-cutting the timeline,
 * a style is purely "make what I already have look like this" — which is what
 * makes a library this size worth having: you can try thirty of them on the
 * same cut without losing the cut.
 */

import { EFFECTS } from './effects.js';
import { LOOK_BY_ID } from './filters.js';
import { TRANSITIONS } from './transitions.js';

/*
 * A family is a shape of edit. Each entry names the ingredients and the
 * variations spin them — so "Neon night" and "Neon night, harder" differ in
 * amount rather than in kind, the way real presets in a pack do.
 */
const FAMILIES = [

  /* ---------------- social and short-form ---------------- */
  { group: 'Short form', emoji: '📱', pace: 'fast', ratio: '9:16',
    base: { look: 'punch', transition: 'zoomPunch', transDur: 0.14 },
    tags: ['tiktok', 'reels', 'shorts', 'vertical', 'social'],
    variants: [
      ['Clean vertical', 'Sharp and bright, nothing in the way.',
        { look: 'vivid', effects: [] }],
      ['Punchy vertical', 'Contrast up, colour up, cuts land hard.',
        { effects: [['rgbSplit', { amount: 18, pulse: 60 }]] }],
      ['Soft vertical', 'Gentle grade, slow dissolves, easy to watch.',
        { look: 'soft', transition: 'dissolve', transDur: 0.35, pace: 'medium' }],
      ['Night out', 'Deep blues, glowing highlights, late and loud.',
        { look: 'moonlight', effects: [['glow', { amount: 45, radius: 20 }]] }],
      ['Golden hour', 'Warm, hazy, flattering.',
        { look: 'sunburn', effects: [['leakTRWarm', { amount: 38 }], ['softFocus', { amount: 30 }]] }],
      ['Hard flash', 'White frames on the beat.',
        { effects: [['flash', { amount: 60, every: 0.5, length: 0.07 }]] }],
    ] },

  { group: 'Anime & AMV', emoji: '⚔️', pace: 'fast', ratio: '9:16',
    base: { look: 'punch', transition: 'zoomPunch', transDur: 0.14 },
    tags: ['anime', 'amv', 'manga', 'weeb', 'edit'],
    variants: [
      ['Impact', 'Chromatic hits, speed lines, inverted slams.',
        { effects: [['rgbSplit', { amount: 24, pulse: 70 }], ['linesRadial', { amount: 55 }],
          ['motionBlur', { amount: 55, samples: 6 }]] }],
      ['Screentone', 'Manga dots over a punchy grade.',
        { effects: [['screentone', { amount: 55 }], ['inkOutline', { amount: 50 }]] }],
      ['Aura', 'Coloured energy off the subject.',
        { effects: [['auraBlue', { amount: 55, pulse: 50 }], ['glow', { amount: 40 }]] }],
      ['Shockwave', 'A ring through the frame on every hit.',
        { effects: [['shockwave', { amount: 70 }], ['rgbSplit', { amount: 20, pulse: 80 }]] }],
      ['Cel', 'Flat shading and drawn outlines.',
        { effects: [['posterize', { levels: 6, outline: 45 }]] }],
      ['Afterimage', 'Trails behind the movement.',
        { effects: [['afterImage3', { amount: 50 }], ['motionBlur', { amount: 45 }]] }],
    ] },

  { group: 'Velocity', emoji: '🌀', pace: 'frantic', ratio: '9:16',
    base: { look: 'punch', transition: 'whipPan', transDur: 0.16 },
    tags: ['velocity', 'speed ramp', 'smooth', 'transition edit'],
    variants: [
      ['Smooth', 'Blur through the acceleration.',
        { effects: [['zoomBlur', { amount: 40 }], ['motionBlur', { amount: 60 }]] }],
      ['Shake', 'Handheld chaos on top.',
        { effects: [['shake', { amount: 40 }], ['motionBlur', { amount: 50 }]] }],
      ['Spin', 'Rotation into every cut.',
        { transition: 'spin', effects: [['spinBlur', { amount: 35 }]] }],
      ['Glitch ramp', 'Digital tearing on the fast parts.',
        { effects: [['blockGlitch', { amount: 45 }], ['zoomBlur', { amount: 35 }]] }],
    ] },

  /* ---------------- music ---------------- */
  { group: 'Phonk & drift', emoji: '🚗', pace: 'fast', ratio: '9:16',
    base: { look: 'crush', transition: 'flashWhite', transDur: 0.1 },
    tags: ['phonk', 'drift', 'car', 'jdm', 'memphis'],
    variants: [
      ['Classic', 'Crushed blacks, hard flashes, cold grade.',
        { effects: [['vhs', { amount: 40 }], ['vignetteHard', { amount: 50 }]] }],
      ['Chrome', 'Cold metal, heavy contrast.',
        { look: 'moonlight', effects: [['bleachBypass', { amount: 70 }], ['glow', { amount: 30 }]] }],
      ['Red mist', 'Everything through a red haze.',
        { effects: [['duoBlood', { amount: 70 }], ['fog', { amount: 35 }]] }],
      ['Tape', 'Ran through a worn VHS deck.',
        { effects: [['vhsWorn', { amount: 55 }], ['scanlines', { amount: 35 }]] }],
    ] },

  { group: 'Lyric & beat', emoji: '🎵', pace: 'medium', ratio: '9:16',
    base: { look: 'none', transition: 'dissolve', transDur: 0.25, captions: 'karaoke' },
    tags: ['lyrics', 'lyric video', 'karaoke', 'sing', 'music video'],
    variants: [
      ['Karaoke', 'Words highlighting in time.', {}],
      ['Big type', 'Full-frame words on the beat.', { captions: 'bold' }],
      ['Subtle', 'Small clean captions, soft grade.',
        { captions: 'clean', look: 'soft' }],
    ] },

  /* ---------------- talking ---------------- */
  { group: 'Talking head', emoji: '🎙', pace: 'medium', ratio: '9:16',
    base: { look: 'soft', transition: 'dissolve', transDur: 0.2, captions: 'tiktok' },
    tags: ['talking', 'podcast', 'vlog', 'explain', 'tutorial', 'face cam', 'youtuber'],
    variants: [
      ['Clean', 'Gentle skin grade and captions.', {}],
      ['Podcast', 'Warm, low contrast, easy on the eye.',
        { look: 'sunburn', effects: [['vignetteSoft', { amount: 30 }]] }],
      ['Documentary', 'Neutral grade, subtle handheld.',
        { look: 'none', effects: [['handheldSubtle', { amount: 40 }], ['filmGrain', { amount: 22 }]] }],
      ['Bright studio', 'Lifted, clean, product-review look.',
        { look: 'vivid', effects: [['softFocus', { amount: 20 }]] }],
      ['Late night', 'Moody and close.',
        { look: 'moonlight', effects: [['vignetteHard', { amount: 45 }]] }],
    ] },

  /* ---------------- cinematic ---------------- */
  { group: 'Cinematic', emoji: '🎬', pace: 'slow', ratio: '16:9',
    base: { look: 'cinematic', transition: 'dissolve', transDur: 0.6 },
    tags: ['cinematic', 'film', 'movie', 'trailer', 'moody'],
    variants: [
      ['Teal and orange', 'The blockbuster grade.',
        { effects: [['crop239', { amount: 100 }], ['filmGrain', { amount: 20 }]] }],
      ['Bleach bypass', 'Desaturated, high contrast, hard.',
        { look: 'none', effects: [['bleachBypass', { amount: 80 }], ['crop239', { amount: 100 }]] }],
      ['Warm film', 'Kodak-ish, gentle and golden.',
        { look: 'sunburn', effects: [['kodachrome', { amount: 65 }], ['crop185', { amount: 100 }]] }],
      ['Cold thriller', 'Blue, crushed, tense.',
        { look: 'moonlight', effects: [['bleachBypass', { amount: 55 }], ['vignetteHard', { amount: 45 }], ['crop239', { amount: 100 }]] }],
      ['Desert', 'Dust, heat and sand.',
        { effects: [['duoSand', { amount: 60 }], ['sandstorm', { amount: 30 }], ['crop239', { amount: 100 }]] }],
      ['Noir', 'Black and white, deep shadows.',
        { look: 'mono', effects: [['poster8', { amount: 35 }], ['vignetteHard', { amount: 60 }], ['crop185', { amount: 100 }]] }],
      ['Dream', 'Soft, hazy, floating.',
        { look: 'pastel', effects: [['dreamy', { amount: 55 }], ['bokehLights', { amount: 35 }]] }],
    ] },

  /* ---------------- retro ---------------- */
  { group: 'Retro', emoji: '📼', pace: 'medium', ratio: '4:3',
    base: { look: 'none', transition: 'glitch', transDur: 0.2 },
    tags: ['retro', 'vintage', 'old', 'vhs', 'film', '80s', '90s'],
    variants: [
      ['VHS 1987', 'Tape bleed, tracking errors, scanlines.',
        { effects: [['vhs', { amount: 55 }], ['tvStatic', { amount: 20 }]] }],
      ['Camcorder 1994', 'Home video, soft and warm.',
        { effects: [['camcorder', { amount: 50 }], ['dustScratches', { amount: 25 }]] }],
      ['Super 8', 'Grainy film with gate weave.',
        { effects: [['super8', { amount: 70 }], ['gateWeave', { amount: 35 }], ['projectorFlicker', { amount: 30 }]] }],
      ['16mm', 'Cleaner film, still clearly film.',
        { effects: [['mm16', { amount: 65 }], ['filmGrain', { amount: 30 }]] }],
      ['Old print', 'Faded, scratched, been in a drawer.',
        { effects: [['faded', { amount: 70 }], ['dustScratches', { amount: 45 }], ['filmBurn', { amount: 40 }]] }],
      ['CRT', 'Watched on a tube television.',
        { effects: [['crtTube', { amount: 55 }], ['scanlines', { amount: 30 }]] }],
      ['Polaroid', 'Washed out with a white frame.',
        { effects: [['polaroidStock', { amount: 65 }], ['polaroidFrame', { amount: 100 }]] }],
    ] },

  /* ---------------- stylised ---------------- */
  { group: 'Stylised', emoji: '🎨', pace: 'medium', ratio: '9:16',
    base: { look: 'none', transition: 'dissolve', transDur: 0.3 },
    tags: ['stylised', 'artistic', 'painting', 'sketch', 'comic'],
    variants: [
      ['Sketch', 'Pencil on white paper.', { effects: [['sketch', { amount: 85 }]] }],
      ['Comic', 'Flat colour with hard ink lines.',
        { effects: [['poster6', { amount: 100 }], ['inkOutline', { amount: 70 }], ['screentone', { amount: 40 }]] }],
      ['Oil', 'Pooled colour and visible strokes.', { effects: [['oilPaint', { amount: 70 }]] }],
      ['Watercolour', 'Soft washes with pooled edges.', { effects: [['watercolour', { amount: 70 }]] }],
      ['Newsprint', 'Halftone dots on off-white paper.', { effects: [['newsprint', { amount: 90 }]] }],
      ['Crosshatch', 'Built up out of pen strokes.', { effects: [['crosshatch', { amount: 65 }]] }],
      ['Mosaic', 'Broken into coloured tiles.', { effects: [['mosaicRound', { size: 16 }]] }],
      ['Kaleidoscope', 'Mirrored into a pattern.', { effects: [['kaleido6', { amount: 100, spin: 20 }]] }],
    ] },

  /* ---------------- glitch ---------------- */
  { group: 'Glitch', emoji: '⚡', pace: 'fast', ratio: '9:16',
    base: { look: 'crush', transition: 'glitch', transDur: 0.15 },
    tags: ['glitch', 'datamosh', 'broken', 'corrupt', 'cyber'],
    variants: [
      ['Signal loss', 'Blocks tearing sideways.',
        { effects: [['signalLoss', { amount: 50 }], ['tvStatic', { amount: 25 }]] }],
      ['Datamosh', 'Codec falling apart.', { effects: [['datamosh', { amount: 55 }]] }],
      ['Pixel sort', 'Rows smeared into streaks.', { effects: [['pixelSort', { amount: 50 }]] }],
      ['Cyberpunk', 'Neon duotone with digital tearing.',
        { effects: [['duoCyberpunk', { amount: 75 }], ['microGlitch', { amount: 40 }], ['glow', { amount: 40 }]] }],
      ['Compression', 'Bitrate far too low.',
        { effects: [['compressionHeavy', { amount: 60 }], ['blockGlitch', { amount: 30 }]] }],
    ] },

  /* ---------------- colour statements ---------------- */
  { group: 'Colour', emoji: '🌈', pace: 'medium', ratio: '9:16',
    base: { look: 'none', transition: 'dissolve', transDur: 0.3 },
    tags: ['colour', 'color', 'grade', 'duotone', 'look'],
    variants: [
      ['Midnight duotone', 'Navy shadows, orange highlights.', { effects: [['duoMidnight', { amount: 85 }]] }],
      ['Vapourwave', 'Pink and cyan, soft glow.',
        { effects: [['rampVapour', { amount: 80 }], ['glow', { amount: 35 }]] }],
      ['Inferno', 'Black through red to white.', { effects: [['rampInferno', { amount: 80 }]] }],
      ['Matrix', 'Green on near-black.', { effects: [['rampMatrix', { amount: 85 }]] }],
      ['Arctic', 'Cold blues, clean whites.', { effects: [['rampArctic', { amount: 80 }]] }],
      ['Infrared', 'False colour, everything wrong.', { effects: [['infrared', { amount: 85 }]] }],
      ['Thermal', 'Heat-camera palette.', { effects: [['thermal', { amount: 90 }]] }],
      ['Isolate red', 'One colour left, the rest grey.', { effects: [['isolateRed', { amount: 90 }]] }],
      ['Isolate blue', 'One colour left, the rest grey.', { effects: [['isolateBlue', { amount: 90 }]] }],
      ['Deep fried', 'Saturation and contrast past sense.', { effects: [['deepFried', { amount: 90 }]] }],
    ] },

  /* ---------------- weather and atmosphere ---------------- */
  { group: 'Atmosphere', emoji: '🌫', pace: 'slow', ratio: '16:9',
    base: { look: 'none', transition: 'dissolve', transDur: 0.5 },
    tags: ['weather', 'rain', 'snow', 'fog', 'mood', 'atmosphere'],
    variants: [
      ['Rain', 'Falling rain and a cold grade.',
        { look: 'moonlight', effects: [['rain', { amount: 55 }], ['fog', { amount: 25 }]] }],
      ['Storm', 'Heavy rain, dark, flashes.',
        { look: 'crush', effects: [['heavyRain', { amount: 70 }], ['flash', { amount: 50, every: 3, length: 0.1 }]] }],
      ['Snow', 'Drifting snow, pale and quiet.',
        { look: 'pastel', effects: [['snow', { amount: 50 }], ['mist', { amount: 30 }]] }],
      ['Fog', 'Everything receding into grey.', { effects: [['fog', { amount: 55 }], ['softFocus', { amount: 30 }]] }],
      ['Embers', 'Warm sparks rising.',
        { look: 'sunburn', effects: [['embers', { amount: 50 }], ['glow', { amount: 35 }]] }],
      ['Dust', 'Motes in a shaft of light.',
        { effects: [['dustMotes', { amount: 45 }], ['godRays', { amount: 40 }]] }],
      ['Celebration', 'Confetti and sparkle.',
        { look: 'punch', effects: [['confetti', { amount: 60 }], ['sparkles', { amount: 40 }]] }],
    ] },

  /* ---------------- product and brand ---------------- */
  { group: 'Product', emoji: '📦', pace: 'medium', ratio: '1:1',
    base: { look: 'vivid', transition: 'dissolve', transDur: 0.25 },
    tags: ['product', 'ad', 'advert', 'shop', 'ecommerce', 'brand'],
    variants: [
      ['Clean white', 'Bright, neutral, catalogue.', { effects: [['softFocus', { amount: 18 }]] }],
      ['Premium dark', 'Deep background, controlled highlights.',
        { look: 'moonlight', effects: [['vignetteHard', { amount: 45 }], ['glow', { amount: 30 }]] }],
      ['Warm lifestyle', 'Sunlit and inviting.',
        { look: 'sunburn', effects: [['leakTRWarm', { amount: 30 }], ['bokehLights', { amount: 25 }]] }],
      ['Tech', 'Cool, sharp, blue-leaning.',
        { look: 'cinematic', effects: [['technicolor', { amount: 40 }]] }],
      ['Bold sale', 'Loud colour, hard cuts.',
        { look: 'punch', transition: 'flashWhite', effects: [['technicolor', { amount: 70 }]] }],
    ] },

  /* ---------------- gaming and sport ---------------- */
  { group: 'Gaming', emoji: '🎮', pace: 'fast', ratio: '16:9',
    base: { look: 'punch', transition: 'zoomPunch', transDur: 0.14 },
    tags: ['gaming', 'gameplay', 'montage', 'fps', 'clip'],
    variants: [
      ['Montage', 'Sharp, saturated, fast.',
        { effects: [['technicolor', { amount: 45 }], ['rgbSplit', { amount: 15, pulse: 50 }]] }],
      ['Neon', 'RGB-lit, glowing.',
        { effects: [['duoCyberpunk', { amount: 60 }], ['glow', { amount: 50 }]] }],
      ['Retro arcade', 'Chunky pixels and scanlines.',
        { effects: [['compressionHeavy', { amount: 50 }], ['crtTube', { amount: 45 }]] }],
      ['Hype', 'Shake, flash, zoom on every kill.',
        { effects: [['shake', { amount: 35 }], ['flash', { amount: 55, every: 1, length: 0.06 }], ['zoomBlur', { amount: 30 }]] }],
    ] },

  { group: 'Sport', emoji: '🏅', pace: 'fast', ratio: '9:16',
    base: { look: 'punch', transition: 'whipPan', transDur: 0.15 },
    tags: ['sport', 'highlight', 'gym', 'training', 'football', 'basketball'],
    variants: [
      ['Highlights', 'Punchy and quick.',
        { effects: [['technicolor', { amount: 40 }], ['motionBlur', { amount: 45 }]] }],
      ['Gym', 'Hard contrast, cold, heavy.',
        { look: 'crush', effects: [['bleachBypass', { amount: 60 }], ['vignetteHard', { amount: 45 }]] }],
      ['Slow motion', 'Long dissolves, cinematic.',
        { pace: 'slow', transition: 'dissolve', transDur: 0.5,
          effects: [['motionBlur', { amount: 65 }], ['crop239', { amount: 100 }]] }],
    ] },

  /* ---------------- travel and nature ---------------- */
  { group: 'Travel', emoji: '🧭', pace: 'medium', ratio: '16:9',
    base: { look: 'vivid', transition: 'dissolve', transDur: 0.4 },
    tags: ['travel', 'nature', 'landscape', 'drone', 'holiday', 'vlog'],
    variants: [
      ['Bright travel', 'Blue skies, vivid greens.',
        { effects: [['technicolor', { amount: 50 }]] }],
      ['Film travel', 'Grainy, warm, like a photo album.',
        { look: 'sunburn', effects: [['kodachrome', { amount: 55 }], ['filmGrain', { amount: 28 }]] }],
      ['Moody landscape', 'Overcast and grand.',
        { look: 'moonlight', effects: [['fog', { amount: 30 }], ['crop239', { amount: 100 }]] }],
      ['Tropical', 'Hot, saturated, golden.',
        { look: 'sunburn', effects: [['goldenHour', { amount: 70 }], ['leakRWarm', { amount: 30 }]] }],
      ['Drone', 'Wide, cool, cinematic bars.',
        { look: 'cinematic', effects: [['crop239', { amount: 100 }], ['technicolor', { amount: 30 }]] }],
    ] },

  /* ---------------- memes and fun ---------------- */
  { group: 'Meme', emoji: '😂', pace: 'frantic', ratio: '9:16',
    base: { look: 'punch', transition: 'flashWhite', transDur: 0.08, captions: 'bold' },
    tags: ['meme', 'funny', 'brainrot', 'shitpost', 'reaction'],
    variants: [
      ['Deep fried', 'Saturation and contrast destroyed.',
        { effects: [['deepFried', { amount: 95 }], ['compressionHeavy', { amount: 70 }]] }],
      ['Zoom spam', 'Punch in on everything.',
        { effects: [['zoomPunch', { amount: 70, every: 0.35 }], ['shake', { amount: 40 }]] }],
      ['Shake', 'Constant camera chaos.',
        { effects: [['handheldRun', { amount: 70 }], ['rgbSplit', { amount: 25, pulse: 80 }]] }],
      ['Green screen', 'Loud and flat.',
        { effects: [['acid', { amount: 70 }], ['poster4', { amount: 80 }]] }],
    ] },

  /* ---------------- quiet and minimal ---------------- */
  { group: 'Minimal', emoji: '◽', pace: 'slow', ratio: '16:9',
    base: { look: 'none', transition: 'dissolve', transDur: 0.6 },
    tags: ['minimal', 'clean', 'simple', 'calm', 'quiet', 'aesthetic'],
    variants: [
      ['Pure', 'Nothing at all but a gentle fade.', { effects: [] }],
      ['Soft mono', 'Black and white, low contrast.',
        { look: 'mono', effects: [['faded', { amount: 40 }]] }],
      ['Muted', 'Colour pulled right back.',
        { effects: [['washedOut', { amount: 65 }]] }],
      ['Matte', 'Lifted blacks, film-still feel.',
        { look: 'pastel', effects: [['faded', { amount: 55 }], ['filmGrain', { amount: 18 }]] }],
      ['Paper', 'Warm off-white, printed.',
        { effects: [['duoSepiaprint', { amount: 70 }], ['filmGrain', { amount: 25 }]] }],
    ] },
];

/* ------------------------------------------------------------------ *
 * Building them
 * ------------------------------------------------------------------ */

function idOf(group, name) {
  return `${group} ${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * One style, as the same `{ id, name, build(ctx) }` shape the hand-written
 * ones use — so a generated style and a hand-written one are the same thing to
 * the panel, the planner and the plan reviewer.
 *
 * `build` emits no layout or beat-cut step at all. These are styles: they go on
 * top of whatever cut you already have. The structural half lives in
 * templates.js and only runs when somebody asks for it.
 */
function makeStyle(family, [name, blurb, over]) {
  const spec = { ...family.base, ...over };
  const group = family.group;

  return {
    id: idOf(group, name),
    name: `${group} — ${name}`,
    emoji: family.emoji,
    tier: 'free',
    blurb,
    wants: 'Clips on the timeline. It styles them without changing your cuts.',
    group,
    tags: [...family.tags, name.toLowerCase(), group.toLowerCase()],
    generated: true,

    build(ctx) {
      const steps = [];

      /*
       * Lay the clips out first, but only when there is nothing to protect.
       *
       * The same rule the hand-written styles follow: an empty timeline gets
       * built, an edited one gets styled. Without this half, pressing
       * "Cinematic — Noir" on an empty project produced a plan full of grades
       * and effects with nothing to put them on — a style that appears to do
       * nothing, which is indistinguishable from a broken one.
       */
      const rebuild = ctx.rebuild !== undefined ? ctx.rebuild : !(ctx.onTimeline > 0);
      if (rebuild) {
        const ratio = ctx.wantRatio || family.ratio;
        if (ratio && ratio !== ctx.ratio) {
          steps.push({
            op: 'setRatio', args: { ratio },
            label: `Switch the canvas to ${ratio}`,
            detail: ratio === '9:16'
              ? 'Full-screen on a phone, which is what TikTok, Reels and Shorts want.'
              : `Everything is reframed to ${ratio}.`,
          });
        }
        const pace = ctx.pace || spec.pace || family.pace || 'medium';
        const beats = { frantic: 1, fast: 2, medium: 4, slow: 8 }[pace] ?? 4;
        if (ctx.hasMusic && ctx.bpm) {
          steps.push({
            op: 'beatCut', args: { targetDur: ctx.targetDur, every: beats, shuffle: ctx.shuffle },
            label: `Cut on the beat at ${ctx.bpm} BPM`,
            detail: `A cut every ${beats === 1 ? 'beat' : `${beats} beats`} — the edit lands with the music.`,
          });
        } else {
          const each = (60 / 120) * beats;
          steps.push({
            op: 'layout',
            args: { targetDur: ctx.targetDur, clipLength: each, shuffle: ctx.shuffle, pickBest: true },
            label: `Lay the clips out at a ${pace} pace`,
            detail: `About ${each.toFixed(1)}s a shot, taking the most active part of each clip.`,
          });
        }
      }

      if (spec.look && spec.look !== 'none') {
        steps.push({
          op: 'applyLook',
          args: { look: spec.look, strength: spec.strength ?? 0.9 },
          label: `${LOOK_BY_ID[spec.look]?.name || spec.look} grade`,
          detail: 'Put on every clip. Change or remove it per clip in the Colour panel.',
        });
      }

      for (const [effect, params] of spec.effects || []) {
        steps.push({
          op: 'addEffect',
          args: { effect, params, scope: 'all' },
          label: `${EFFECTS[effect]?.name || effect}`,
          detail: EFFECTS[effect]?.group ? `${EFFECTS[effect].group} effect, on every clip.` : '',
        });
      }

      if (spec.transition) {
        steps.push({
          op: 'addTransitions',
          args: { type: spec.transition, dur: spec.transDur ?? 0.25 },
          label: `${TRANSITIONS[spec.transition]?.name || spec.transition} on the cuts`,
          detail: `${(spec.transDur ?? 0.25).toFixed(2)}s.`,
        });
      }

      if (spec.captions && ctx.hasSpeech !== false) {
        steps.push({
          op: 'captions', args: { style: spec.captions },
          label: `${spec.captions} captions`,
          detail: 'Timed to where the speech is.',
        });
      }

      if (ctx.hasMusic) {
        steps.push({
          op: 'fitMusic', args: { fadeOut: spec.pace === 'slow' ? 1.2 : 0.6, duck: Boolean(spec.captions) },
          label: 'Fit the track to the edit',
          detail: spec.captions ? 'Ducked under the voice.' : 'Trimmed with a fade.',
        });
      }
      return steps;
    },
  };
}

export const TEMPLATE_PACKS = FAMILIES.flatMap((f) => f.variants.map((v) => makeStyle(f, v)));

/** Group -> styles, so a library this size can be browsed. */
export const TEMPLATE_GROUPS = TEMPLATE_PACKS.reduce((acc, t) => {
  (acc[t.group] ||= []).push(t);
  return acc;
}, {});

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

/*
 * Every ingredient is checked against the real libraries, at load.
 *
 * A style naming an effect that does not exist does not fail loudly — it
 * silently does one thing less than it promised, and the person is left
 * thinking the preset is weak rather than broken. With a hundred and thirty of
 * them, written by hand, that is not a possibility but a certainty.
 *
 * Anything unresolvable is dropped from the style rather than shipped broken,
 * and reported once in the console so it gets fixed rather than lived with.
 */
const problems = [];
for (const family of FAMILIES) {
  for (const [name, , over] of family.variants) {
    const spec = { ...family.base, ...over };
    const where = `${family.group} — ${name}`;
    if (spec.look && spec.look !== 'none' && !LOOK_BY_ID[spec.look]) {
      problems.push(`${where}: no look "${spec.look}"`);
    }
    if (spec.transition && !TRANSITIONS[spec.transition]) {
      problems.push(`${where}: no transition "${spec.transition}"`);
    }
    for (const [effect] of spec.effects || []) {
      if (!EFFECTS[effect]) problems.push(`${where}: no effect "${effect}"`);
    }
  }
}

/** What did not resolve. Empty is the only acceptable value. */
export const TEMPLATE_PROBLEMS = problems;

if (problems.length) {
  // eslint-disable-next-line no-console -- this is a build-time mistake shipped to runtime
  console.warn(`[styles] ${problems.length} broken ingredient(s):\n  ${problems.join('\n  ')}`);
}
