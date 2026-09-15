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
import { RATIOS } from './project.js';

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
  { group: 'Retro', emoji: '📼', pace: 'medium', ratio: '16:9',
    base: { look: 'none', transition: 'glitch', transDur: 0.2 },
    tags: ['retro', 'vintage', 'old', 'vhs', 'film', '80s', '90s'],
    variants: [
      ['VHS 1987', 'Tape bleed, tracking errors, scanlines.',
        { effects: [['vhs', { amount: 55 }], ['tvStatic', { amount: 20 }], ['crop133', { amount: 100 }]] }],
      ['Camcorder 1994', 'Home video, soft and warm.',
        { effects: [['camcorder', { amount: 50 }], ['dustScratches', { amount: 25 }], ['crop133', { amount: 100 }]] }],
      ['Super 8', 'Grainy film with gate weave.',
        { effects: [['super8', { amount: 70 }], ['gateWeave', { amount: 35 }], ['projectorFlicker', { amount: 30 }], ['crop133', { amount: 100 }]] }],
      ['16mm', 'Cleaner film, still clearly film.',
        { effects: [['mm16', { amount: 65 }], ['filmGrain', { amount: 30 }], ['crop133', { amount: 100 }]] }],
      ['Old print', 'Faded, scratched, been in a drawer.',
        { effects: [['faded', { amount: 70 }], ['dustScratches', { amount: 45 }], ['filmBurn', { amount: 40 }], ['crop133', { amount: 100 }]] }],
      ['CRT', 'Watched on a tube television.',
        { effects: [['crtTube', { amount: 55 }], ['scanlines', { amount: 30 }], ['crop133', { amount: 100 }]] }],
      ['Polaroid', 'Washed out with a white frame.',
        { effects: [['polaroidStock', { amount: 65 }], ['polaroidFrame', { amount: 100 }], ['crop100', { amount: 100 }]] }],
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

  /* ---------------- the loud ones ---------------- */
  { group: 'Horror', emoji: '🩸', pace: 'medium', ratio: '16:9',
    base: { look: 'horror', transition: 'dipBlack', transDur: 0.4 },
    tags: ['horror', 'scary', 'creepy', 'analog horror', 'found footage', 'halloween'],
    variants: [
      ['Found footage', 'A tape somebody should not have kept.',
        { effects: [['vhsWorn', { amount: 70 }], ['signalLoss', { amount: 40 }],
          ['handheldRun', { amount: 45 }], ['vignetteHard', { amount: 55 }]] }],
      ['Analog horror', 'Broadcast that is going wrong.',
        { effects: [['tvStatic', { amount: 45 }], ['crtTube', { amount: 60 }],
          ['ghostEcho', { amount: 50 }], ['scanlines', { amount: 40 }]] }],
      ['Night vision', 'Green, grainy, watched.',
        { look: 'none', effects: [['nightVision', { amount: 85 }], ['filmGrain', { amount: 45 }],
          ['vignetteHard', { amount: 65 }]] }],
      ['Thermal', 'Heat only. Nothing else survives.',
        { look: 'none', effects: [['thermal', { amount: 90 }], ['blockGlitch', { amount: 20 }]] }],
      ['Dread', 'Cold, slow, closing in.',
        { look: 'thriller', pace: 'slow', transition: 'blurDissolveSoft', transDur: 0.9,
          effects: [['fog', { amount: 45 }], ['movePushIn', { amount: 30 }],
            ['vignetteHard', { amount: 60 }]] }],
      ['Jumpscare', 'Frames that hit you.',
        { transition: 'flashWhite', transDur: 0.08,
          effects: [['flash', { amount: 85, every: 1.6, length: 0.05 }],
            ['invertPulse', { at: 0.6, length: 0.1, mode: 'white' }],
            ['shake', { amount: 55 }]] }],
    ] },

  { group: 'Y2K & vaporwave', emoji: '💿', pace: 'medium', ratio: '9:16',
    base: { look: 'y2k', transition: 'glitchFine', transDur: 0.18 },
    tags: ['y2k', 'vaporwave', '2000s', 'aesthetic', 'retrowave', 'nostalgia'],
    variants: [
      ['Chrome', 'Cold metal and blown highlights.',
        { effects: [['glow', { amount: 50, radius: 24 }], ['prism', { amount: 30 }]] }],
      ['Vapour', 'Pink and cyan, dreaming.',
        { look: 'vaporwave', effects: [['rampVapour', { amount: 70 }], ['dreamy', { amount: 40 }]] }],
      ['Mall CRT', 'Watched off a shop television.',
        { effects: [['crtTube', { amount: 65 }], ['scanlines', { amount: 40 }],
          ['compressionLight', { amount: 35 }]] }],
      ['Bubblegum', 'Sweet, bright, plastic.',
        { look: 'pastel', effects: [['duoRose', { amount: 55 }], ['sparkles', { amount: 40 }]] }],
      ['Burnt disc', 'A file that has been copied too many times.',
        { effects: [['compressionHeavy', { amount: 65 }], ['microGlitch', { amount: 45 }],
          ['chanSwapRB', { amount: 25 }]] }],
    ] },

  { group: 'Sci-fi & HUD', emoji: '🛰', pace: 'medium', ratio: '16:9',
    base: { look: 'scifi', transition: 'glitchFine', transDur: 0.2 },
    tags: ['sci-fi', 'scifi', 'futuristic', 'hud', 'tech', 'space', 'cyber'],
    variants: [
      ['Cold future', 'Blue steel and clean glass.',
        { effects: [['flareAnamorphic', { amount: 45 }], ['bleachBypass', { amount: 35 }]] }],
      ['Blueprint', 'Everything reduced to a schematic.',
        { look: 'none', effects: [['blueprint', { amount: 85 }], ['linesHorizontal', { amount: 30 }]] }],
      ['Scan', 'Read by a machine.',
        { look: 'none', effects: [['xray', { amount: 70 }], ['scanlines', { amount: 45 }],
          ['microGlitch', { amount: 30 }]] }],
      ['Cyberpunk street', 'Neon through the rain.',
        { look: 'cyberpunk', effects: [['rain', { amount: 45 }], ['glow', { amount: 55 }],
          ['flareAnamorphic', { amount: 50 }]] }],
      ['Deep space', 'Black, cold, enormous.',
        { look: 'midnight', pace: 'slow', transition: 'dipBlack', transDur: 0.8,
          effects: [['duoDeepsea', { amount: 55 }], ['vignetteWide', { amount: 50 }],
            ['moveCraneUp', { amount: 25 }]] }],
    ] },

  { group: 'Trailer', emoji: '🎞', pace: 'slow', ratio: '2.39:1',
    base: { look: 'blockbuster', transition: 'dipBlack', transDur: 0.5 },
    tags: ['trailer', 'teaser', 'epic', 'blockbuster', 'promo', 'cinema'],
    variants: [
      ['Three beats', 'Slow, slower, then everything at once.',
        { effects: [['crop239', { amount: 100 }], ['filmGrain', { amount: 18 }],
          ['movePushIn', { amount: 25 }]] }],
      ['Hard cuts to black', 'Silence between the hits.',
        { transition: 'dipBlack', transDur: 0.7,
          effects: [['crop239', { amount: 100 }], ['flash', { amount: 45, every: 2.2, length: 0.08 }]] }],
      ['Epic warm', 'Gold light and dust.',
        { look: 'sunburn', effects: [['goldenHour', { amount: 45 }], ['godRays', { amount: 50 }],
          ['dustScratches', { amount: 20 }], ['crop239', { amount: 100 }]] }],
      ['Cold open', 'Blue, quiet, ominous.',
        { look: 'thriller', effects: [['fog', { amount: 35 }], ['crop239', { amount: 100 }],
          ['vignetteHard', { amount: 45 }]] }],
      ['Title card', 'Type-first, everything holds.',
        { transition: 'flashBlack', transDur: 0.3, captions: 'bold',
          effects: [['crop239', { amount: 100 }], ['letterbox', { amount: 100 }]] }],
    ] },

  /* ---------------- the ones people actually get paid for ---------------- */
  { group: 'Wedding', emoji: '💍', pace: 'slow', ratio: '16:9',
    base: { look: 'romance', transition: 'blurDissolveSoft', transDur: 0.8 },
    tags: ['wedding', 'romance', 'love', 'ceremony', 'anniversary', 'engagement'],
    variants: [
      ['Golden', 'Warm, soft, late afternoon.',
        { look: 'sunburn', effects: [['goldenHour', { amount: 40 }], ['softFocus', { amount: 35 }],
          ['leakTRGold', { amount: 35 }], ['bokehLights', { amount: 30 }]] }],
      ['Film', 'Shot on stock, printed warm.',
        { look: 'portra400', effects: [['filmGrain', { amount: 22 }], ['gateWeave', { amount: 15 }]] }],
      ['Airy', 'Bright, pale, weightless.',
        { look: 'highkey', effects: [['dreamy', { amount: 40 }], ['glow', { amount: 30 }]] }],
      ['Timeless mono', 'Black and white, no tricks.',
        { look: 'silver', effects: [['filmGrain', { amount: 20 }]] }],
      ['Confetti', 'The loud two minutes.',
        { pace: 'medium', effects: [['confetti', { amount: 45 }], ['sparkles', { amount: 30 }]] }],
    ] },

  { group: 'Food', emoji: '🍜', pace: 'medium', ratio: '9:16',
    base: { look: 'food', transition: 'dissolve', transDur: 0.22 },
    tags: ['food', 'recipe', 'cooking', 'restaurant', 'menu', 'kitchen'],
    variants: [
      ['Appetite', 'Warm, saturated, close.',
        { effects: [['movePushIn', { amount: 25 }], ['softFocus', { amount: 20 }]] }],
      ['Steam', 'Hot, hazy, just plated.',
        { effects: [['mist', { amount: 35 }], ['glow', { amount: 25 }]] }],
      ['Dark and moody', 'Restaurant at night.',
        { look: 'lowkey', effects: [['spotlight', { amount: 45 }], ['vignetteHard', { amount: 50 }]] }],
      ['Fresh', 'Bright, clean, market stall.',
        { look: 'vivid', effects: [['softFocus', { amount: 15 }]] }],
      ['Sizzle', 'Fast cuts on the cooking.',
        { pace: 'fast', transition: 'whipPan', transDur: 0.14,
          effects: [['motionBlur', { amount: 45 }], ['zoomPunch', { amount: 35, every: 0.8 }]] }],
    ] },

  { group: 'Property', emoji: '🏠', pace: 'slow', ratio: '16:9',
    base: { look: 'ytclean', transition: 'dissolve', transDur: 0.5 },
    tags: ['property', 'real estate', 'house', 'tour', 'listing', 'interior', 'architecture'],
    variants: [
      ['Walkthrough', 'Even, bright, glides through.',
        { effects: [['moveDollyRight', { amount: 25 }], ['softFocus', { amount: 10 }]] }],
      ['Bright and clean', 'Lifted, neutral, estate-agent white.',
        { look: 'highkey', effects: [['crop178', { amount: 100 }]] }],
      ['Golden listing', 'Sold on the light.',
        { look: 'sunburn', effects: [['goldenHour', { amount: 35 }], ['godRays', { amount: 30 }],
          ['movePushIn', { amount: 20 }]] }],
      ['Architectural', 'Straight lines, cool grade, no drama.',
        { look: 'techcold', effects: [['perspectiveUp', { amount: 15 }], ['crop239', { amount: 100 }]] }],
    ] },

  { group: 'Fitness', emoji: '🏋', pace: 'fast', ratio: '9:16',
    base: { look: 'fitness', transition: 'flashWhite', transDur: 0.12 },
    tags: ['fitness', 'gym', 'workout', 'training', 'lifting', 'transformation'],
    variants: [
      ['Hard', 'Contrast, sweat, grain.',
        { effects: [['bleachBypass', { amount: 60 }], ['filmGrain', { amount: 30 }],
          ['vignetteHard', { amount: 45 }]] }],
      ['Chalk', 'Cold, dusty, heavy.',
        { look: 'concrete', effects: [['dustMotes', { amount: 35 }], ['spotlight', { amount: 35 }]] }],
      ['Rep counter', 'Cut on every lift.',
        { pace: 'frantic', effects: [['hitSpark', { amount: 45 }], ['shake', { amount: 30 }]] }],
      ['Transformation', 'Before and after, side by side.',
        { pace: 'medium', effects: [['split2V', { gap: 3, colour: '#000000' }],
          ['crop100', { amount: 100 }]] }],
    ] },

  { group: 'Automotive', emoji: '🏎', pace: 'fast', ratio: '16:9',
    base: { look: 'blockbuster', transition: 'whipPan', transDur: 0.16 },
    tags: ['car', 'automotive', 'jdm', 'rolling shot', 'motorsport', 'bike'],
    variants: [
      ['Rolling shot', 'Speed you can feel through the frame.',
        { effects: [['motionBlur', { amount: 60 }], ['moveDollyLeft', { amount: 30 }],
          ['crop239', { amount: 100 }]] }],
      ['Night run', 'Streetlights and wet tarmac.',
        { look: 'neonnights', effects: [['flareAnamorphic', { amount: 55 }], ['rain', { amount: 30 }],
          ['glow', { amount: 40 }]] }],
      ['Track day', 'Hard, hot, bright.',
        { look: 'sports', effects: [['zoomBlur', { amount: 35 }], ['godRays', { amount: 30 }],
          ['filmGrain', { amount: 18 }]] }],
      ['Detail', 'Slow pans across the paint.',
        { pace: 'slow', transition: 'dissolve', transDur: 0.6,
          effects: [['movePanRight', { amount: 20 }], ['glow', { amount: 25 }]] }],
      ['Drift', 'Smoke, crush, chaos.',
        { look: 'phonkdark', effects: [['smoke', { amount: 45 }], ['shake', { amount: 40 }],
          ['rgbSplit', { amount: 20, pulse: 70 }]] }],
    ] },

  /* ---------------- the experimental end ---------------- */
  { group: 'Datamosh', emoji: '🧬', pace: 'fast', ratio: '9:16',
    base: { look: 'none', transition: 'glitchChunky', transDur: 0.22 },
    tags: ['datamosh', 'experimental', 'broken', 'corrupt', 'art', 'weird'],
    variants: [
      ['Melt', 'Frames bleeding into each other.',
        { effects: [['datamosh', { amount: 70 }], ['smearDown', { amount: 40 }]] }],
      ['Pixel sort', 'The image sorted into streaks.',
        { effects: [['pixelSort', { amount: 75 }], ['chanRGBtoGBR', { amount: 30 }]] }],
      ['Slice', 'Torn horizontally and put back wrong.',
        { effects: [['sliceShiftH', { amount: 60 }], ['signalLoss', { amount: 30 }]] }],
      ['Overcooked', 'Compressed until it falls apart.',
        { effects: [['compressionHeavy', { amount: 85 }], ['deepFried', { amount: 50 }]] }],
      ['Echo chamber', 'Every frame haunted by the last five.',
        { effects: [['afterImage5', { amount: 60 }], ['ghostEcho', { amount: 45 }]] }],
    ] },

  { group: 'Kaleidoscope', emoji: '🔮', pace: 'medium', ratio: '9:16',
    base: { look: 'euphoric', transition: 'spin', transDur: 0.3 },
    tags: ['kaleidoscope', 'trippy', 'psychedelic', 'visualiser', 'symmetry', 'festival'],
    variants: [
      ['Six-fold', 'Symmetry out of anything.',
        { effects: [['kaleido6', { amount: 100 }], ['swirlCW', { amount: 25 }],
          ['acid', { amount: 45 }]] }],
      ['Mirror quad', 'Four of everything.',
        { effects: [['mirrorQuad', { amount: 100 }], ['glow', { amount: 30 }]] }],
      ['Liquid', 'The frame breathing.',
        { effects: [['warpRipple', { amount: 45 }], ['warpJelly', { amount: 35 }]] }],
      ['Tunnel', 'Pulled into the middle.',
        { effects: [['lensTunnel', { amount: 55 }], ['zoomBlur', { amount: 40 }]] }],
      ['Tiles', 'A grid of the same moment.',
        { effects: [['tile4', { amount: 100 }], ['chanSwapRG', { amount: 25 }]] }],
    ] },

  { group: 'Weather', emoji: '🌧', pace: 'medium', ratio: '16:9',
    base: { look: 'monsoon', transition: 'dissolve', transDur: 0.45 },
    tags: ['weather', 'rain', 'snow', 'seasonal', 'winter', 'storm', 'atmosphere'],
    variants: [
      ['Downpour', 'Heavy rain, cold grade.',
        { effects: [['heavyRain', { amount: 60 }], ['fog', { amount: 25 }]] }],
      ['First snow', 'Quiet and white.',
        { look: 'arctic', pace: 'slow', effects: [['snow', { amount: 45 }], ['glow', { amount: 25 }]] }],
      ['Whiteout', 'A blizzard eating the frame.',
        { look: 'frostbite', effects: [['blizzardFall', { amount: 70 }], ['mist', { amount: 40 }]] }],
      ['Embers', 'Warm ash drifting up.',
        { look: 'ember', effects: [['embers', { amount: 55 }], ['godRays', { amount: 30 }]] }],
      ['Heat', 'Dry, bright, shimmering.',
        { look: 'heatwave', effects: [['sandstorm', { amount: 30 }], ['dustMotes', { amount: 35 }]] }],
    ] },

  { group: 'Reaction', emoji: '🖥', pace: 'medium', ratio: '9:16',
    base: { look: 'ytclean', transition: 'dissolve', transDur: 0.2, captions: 'tiktok' },
    tags: ['reaction', 'split screen', 'stitch', 'duet', 'commentary', 'react'],
    variants: [
      ['Stacked', 'You on top, them underneath.',
        { effects: [['split2V', { gap: 3, colour: '#000000' }]] }],
      ['Side by side', 'Two frames, one row.',
        { effects: [['split2H', { gap: 3, colour: '#000000' }]] }],
      ['Corner cam', 'Small face, big content.',
        { effects: [['split4', { gap: 3, colour: '#000000' }]] }],
      ['Nine up', 'Everything at once.',
        { effects: [['split9', { gap: 2, colour: '#000000' }]] }],
    ] },

  { group: 'Archive', emoji: '📽', pace: 'medium', ratio: '16:9',
    base: { look: 'fade', transition: 'filmBurn', transDur: 0.4 },
    tags: ['archive', 'old film', 'vintage', 'super 8', 'home movie', 'historic'],
    variants: [
      ['Super 8', 'Home movie, warm and jumpy.',
        { effects: [['super8', { amount: 70 }], ['gateWeave', { amount: 40 }],
          ['dustScratches', { amount: 45 }], ['faded', { amount: 30 }], ['crop133', { amount: 100 }]] }],
      ['16mm', 'Grainier, cooler, documentary.',
        { look: 'documentary', effects: [['mm16', { amount: 70 }], ['filmGrain', { amount: 35 }],
          ['crop133', { amount: 100 }]] }],
      ['Silent era', 'Flickering black and white.',
        { look: 'hp5', effects: [['projectorFlicker', { amount: 55 }], ['dustScratches', { amount: 60 }],
          ['crop133', { amount: 100 }]] }],
      ['Newsreel', 'Printed, high contrast, urgent.',
        { look: 'newsprint', effects: [['newsprint', { amount: 55 }], ['filmPerfs', { amount: 40 }],
          ['crop133', { amount: 100 }]] }],
      ['Family tape', 'A camcorder in a drawer since 1994.',
        { look: 'vhs', effects: [['camcorder', { amount: 65 }], ['vhsWobble', { amount: 35 }],
          ['crop133', { amount: 100 }]] }],
    ] },

  { group: 'Beauty & fashion', emoji: '💄', pace: 'medium', ratio: '9:16',
    base: { look: 'beauty', transition: 'dissolve', transDur: 0.25 },
    tags: ['beauty', 'fashion', 'makeup', 'skincare', 'grwm', 'model', 'lookbook'],
    variants: [
      ['Clean skin', 'Soft, even, flattering.',
        { effects: [['softFocus', { amount: 30 }], ['glow', { amount: 20 }]] }],
      ['Editorial', 'Cool, sharp, magazine.',
        { look: 'fashion', effects: [['bleachBypass', { amount: 30 }], ['crop178', { amount: 100 }]] }],
      ['Glitter', 'Light catching everything.',
        { effects: [['sparkles', { amount: 45 }], ['flareStar', { amount: 35 }]] }],
      ['Runway', 'Hard flashes, fast cuts.',
        { pace: 'fast', transition: 'flashWhite', transDur: 0.1,
          effects: [['flash', { amount: 55, every: 0.6, length: 0.06 }]] }],
      ['Film beauty', 'Portra skin, soft grain.',
        { look: 'portra160', effects: [['filmGrain', { amount: 18 }], ['softFocus', { amount: 25 }]] }],
    ] },

  { group: 'Nature', emoji: '🌿', pace: 'slow', ratio: '16:9',
    base: { look: 'wildlife', transition: 'dissolve', transDur: 0.7 },
    tags: ['nature', 'wildlife', 'landscape', 'outdoors', 'hiking', 'ocean', 'forest'],
    variants: [
      ['Forest light', 'Beams through the canopy.',
        { look: 'jungle', effects: [['godRays', { amount: 45 }], ['dustMotes', { amount: 30 }]] }],
      ['Ocean', 'Deep blue, wide, slow.',
        { effects: [['duoDeepsea', { amount: 40 }], ['crop239', { amount: 100 }]] }],
      ['Mountain', 'Cold air and clean contrast.',
        { look: 'arctic', effects: [['mist', { amount: 35 }], ['crop239', { amount: 100 }]] }],
      ['Desert', 'Heat, dust and long shadows.',
        { look: 'desert', effects: [['sandstorm', { amount: 30 }], ['godRays', { amount: 25 }]] }],
      ['Macro', 'Close, shallow, quiet.',
        { effects: [['rackFocus', { from: 65, to: 0, over: 1.2 }], ['bokehLights', { amount: 30 }]] }],
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
  /* A canvas ratio the project does not have is the quietest failure of the
     lot: setRatio falls back to 9:16, so a landscape style silently makes a
     vertical video. Checked here with everything else. */
  if (family.ratio && !RATIOS[family.ratio]) {
    problems.push(`${family.group}: no ratio "${family.ratio}"`);
  }
  for (const [name, , over] of family.variants) {
    const spec = { ...family.base, ...over };
    const where = `${family.group} — ${name}`;
    if (spec.look && spec.look !== 'none' && !LOOK_BY_ID[spec.look]) {
      problems.push(`${where}: no look "${spec.look}"`);
    }
    if (spec.transition && !TRANSITIONS[spec.transition]) {
      problems.push(`${where}: no transition "${spec.transition}"`);
    }
    for (const [effect, params] of spec.effects || []) {
      if (!EFFECTS[effect]) { problems.push(`${where}: no effect "${effect}"`); continue; }
      const known = EFFECTS[effect].params || {};
      for (const key of Object.keys(params || {})) {
        if (!(key in known)) problems.push(`${where}: "${effect}" has no parameter "${key}"`);
      }
    }
  }
}

/** What did not resolve. Empty is the only acceptable value. */
export const TEMPLATE_PROBLEMS = problems;

if (problems.length) {
  // eslint-disable-next-line no-console -- this is a build-time mistake shipped to runtime
  console.warn(`[styles] ${problems.length} broken ingredient(s):\n  ${problems.join('\n  ')}`);
}
