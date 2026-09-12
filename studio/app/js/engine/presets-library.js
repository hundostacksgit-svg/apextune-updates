/*
 * The preset library.
 *
 * Every entry here is a stack somebody would otherwise have to build by hand,
 * with the parameters tuned to each other rather than left at their defaults.
 * That tuning is the entire product. Scanlines at 40 with a chroma shift at 8
 * and a tape wobble at 12 reads as a VHS tape; the same three effects at their
 * defaults read as a mess, and the person who tried it concludes the effects
 * are bad rather than that they were never dialled in.
 *
 * Two kinds of entry, and the split is deliberate:
 *
 *   **Hand-built.** One idea, tuned once, written out. Where the stack is
 *   specific — a particular film stock, a particular kind of camera fault —
 *   there is no family to generate it from and pretending otherwise produces
 *   nine variants of something that only has one good version.
 *
 *   **Families.** Where the idea genuinely does have variants — a light leak
 *   from each corner, a duotone in each colour, a camera move in each
 *   direction — one family and a list of variants beats writing the same
 *   stack out eight times with one value changed. The variant carries only
 *   what differs.
 *
 * Ordering inside a stack matters and is not alphabetical. Effects run in
 * order, so a grain that goes on before a blur gets blurred and stops being
 * grain. Read these top to bottom as the signal path they are.
 */

/* ------------------------------------------------------------------ */
/* hand-built                                                           */
/* ------------------------------------------------------------------ */

const HAND = [
  /* ---------------- Retro ---------------- */
  {
    id: 'vhs-1987', name: 'VHS 1987', group: 'Retro', emoji: '📼', tier: 'free',
    tags: ['vhs', 'tape', 'retro', '80s', 'camcorder', 'analog'],
    apply: {
      look: 'vhs', strength: 0.8,
      color: { contrast: 8, saturation: -6 },
      effects: [
        { id: 'vhs', params: { amount: 48 } },
        { id: 'vhsWobble', params: { amount: 26, bands: 22 } },
        { id: 'rgbSplit', params: { amount: 9, angle: 0, pulse: 0 } },
        { id: 'scanlines', params: { amount: 26, gap: 3, curve: 12 } },
        { id: 'filmGrain', params: { amount: 22, size: 1.4 } },
      ],
    },
  },
  {
    id: 'camcorder-1994', name: 'Camcorder 1994', group: 'Retro', emoji: '📹', tier: 'free',
    tags: ['camcorder', 'home video', 'hi8', '90s'],
    apply: {
      look: 'fade', strength: 0.55,
      color: { exposure: 4, contrast: -6, saturation: -10, temperature: 8 },
      effects: [
        { id: 'camcorder', params: { amount: 44 } },
        { id: 'dropFrameJitter', params: { amount: 14, rate: 9 } },
        { id: 'vignetteSoft', params: { amount: 22, size: 55 } },
        { id: 'filmGrain', params: { amount: 18, size: 1.2 } },
      ],
    },
  },
  {
    id: 'super8-sunday', name: 'Super 8 Sunday', group: 'Retro', emoji: '🎞', tier: 'free',
    tags: ['super8', 'film', 'home movie', 'nostalgia', '8mm'],
    apply: {
      look: 'kodak', strength: 0.75,
      color: { exposure: 3, contrast: 6, saturation: 4, temperature: 14 },
      effects: [
        { id: 'super8', params: { amount: 62, grain: 48 } },
        { id: 'gateWeave', params: { amount: 24 } },
        { id: 'projectorFlicker', params: { amount: 22, rate: 16 } },
        { id: 'dustScratches', params: { amount: 26, rate: 8 } },
        { id: 'leakTRGold', params: { amount: 28, size: 62, drift: 14 } },
      ],
    },
  },
  {
    id: 'crt-broadcast', name: 'CRT Broadcast', group: 'Retro', emoji: '📺', tier: 'pro',
    tags: ['crt', 'tv', 'tube', 'broadcast', 'signal'],
    apply: {
      color: { contrast: 12, saturation: 8 },
      effects: [
        { id: 'crtTube', params: { amount: 48, gap: 3 } },
        { id: 'scanlines', params: { amount: 34, gap: 2, curve: 26 } },
        { id: 'tvStatic', params: { amount: 12 } },
        { id: 'rgbSplit', params: { amount: 6, angle: 0, pulse: 0 } },
        { id: 'vignetteHard', params: { amount: 34, size: 72 } },
      ],
    },
  },
  {
    id: 'lost-tape', name: 'Lost Tape', group: 'Retro', emoji: '🩻', tier: 'pro',
    tags: ['found footage', 'horror', 'degraded', 'worn', 'creepy'],
    apply: {
      look: 'crush', strength: 0.6,
      color: { contrast: 16, saturation: -22, shadows: -12 },
      effects: [
        { id: 'vhsWorn', params: { amount: 62 } },
        { id: 'signalLoss', params: { amount: 30, rate: 5, hold: 22 } },
        { id: 'dustScratches', params: { amount: 42, rate: 14 } },
        { id: 'tvStatic', params: { amount: 20 } },
        { id: 'vignetteHard', params: { amount: 52, size: 62 } },
      ],
    },
  },

  /* ---------------- Cinematic ---------------- */
  {
    id: 'teal-and-orange', name: 'Teal & Orange', group: 'Cinematic', emoji: '🎬', tier: 'free',
    tags: ['blockbuster', 'film', 'cinema', 'hollywood', 'grade'],
    apply: {
      look: 'cinematic', strength: 0.9,
      color: { contrast: 14, saturation: 6, temperature: -6, highlights: -8, shadows: 6 },
      wheels: { lift: { r: -0.04, g: 0.01, b: 0.08 }, gamma: { r: 0, g: 0, b: 0 },
        gain: { r: 0.07, g: 0.02, b: -0.05 }, offset: 0 },
      effects: [
        { id: 'crop239', params: { colour: '#000000', amount: 100 } },
        { id: 'vignetteSoft', params: { amount: 28, size: 52 } },
        { id: 'filmGrain', params: { amount: 12, size: 1 } },
      ],
    },
  },
  {
    id: 'bleach-bypass', name: 'Bleach Bypass', group: 'Cinematic', emoji: '⚔️', tier: 'free',
    tags: ['war', 'gritty', 'desaturated', 'harsh', 'thriller'],
    apply: {
      look: 'bleach', strength: 1,
      color: { contrast: 26, saturation: -34, highlights: 10, shadows: -14 },
      effects: [
        { id: 'bleachBypass', params: { amount: 70 } },
        { id: 'filmGrain', params: { amount: 26, size: 1.1 } },
        { id: 'vignetteHard', params: { amount: 30, size: 66 } },
      ],
    },
  },
  {
    id: 'cold-thriller', name: 'Cold Thriller', group: 'Cinematic', emoji: '🧊', tier: 'free',
    tags: ['thriller', 'cold', 'blue', 'night', 'tense'],
    apply: {
      look: 'cool', strength: 0.85,
      color: { contrast: 18, saturation: -14, temperature: -24, shadows: -10 },
      wheels: { lift: { r: -0.05, g: -0.01, b: 0.07 }, gamma: { r: 0, g: 0, b: 0.02 },
        gain: { r: 0, g: 0, b: 0 }, offset: -0.03 },
      effects: [
        { id: 'crop239', params: { colour: '#000000', amount: 100 } },
        { id: 'vignetteCool', params: { amount: 38, size: 48 } },
        { id: 'filmGrain', params: { amount: 14, size: 1 } },
      ],
    },
  },
  {
    id: 'golden-hour-film', name: 'Golden Hour Film', group: 'Cinematic', emoji: '🌅', tier: 'free',
    tags: ['golden', 'warm', 'sunset', 'romantic', 'summer'],
    apply: {
      look: 'portra400', strength: 0.85,
      color: { exposure: 5, contrast: 6, saturation: 8, temperature: 20, highlights: -10 },
      effects: [
        { id: 'goldenHour', params: { amount: 55 } },
        { id: 'leakTRGold', params: { amount: 30, size: 74, drift: 10 } },
        { id: 'softFocus', params: { amount: 16, radius: 10 } },
        { id: 'filmGrain', params: { amount: 14, size: 1 } },
      ],
    },
  },
  {
    id: 'noir-hard', name: 'Hard Noir', group: 'Cinematic', emoji: '🕵️', tier: 'pro',
    tags: ['noir', 'black and white', 'mono', 'detective', 'contrast'],
    apply: {
      look: 'noir', strength: 1,
      color: { contrast: 40, saturation: -100, highlights: 8, shadows: -22 },
      effects: [
        { id: 'crop235', params: { colour: '#000000', amount: 100 } },
        { id: 'vignetteHard', params: { amount: 48, size: 58 } },
        { id: 'filmGrain', params: { amount: 30, size: 1.3 } },
      ],
    },
  },
  {
    id: 'desert-western', name: 'Desert Western', group: 'Cinematic', emoji: '🌵', tier: 'pro',
    tags: ['western', 'desert', 'dust', 'sand', 'heat'],
    apply: {
      look: 'sunburn', strength: 0.8,
      color: { contrast: 18, saturation: -6, temperature: 26, highlights: -14 },
      effects: [
        { id: 'crop239', params: { colour: '#000000', amount: 100 } },
        { id: 'sandstorm', params: { amount: 22, depth: 45 } },
        { id: 'dustMotes', params: { amount: 28, speed: 60, colour: '#fff2d0', size: 80 } },
        { id: 'vignetteWarm', params: { amount: 34, size: 52 } },
      ],
    },
  },

  /* ---------------- Glitch ---------------- */
  {
    id: 'signal-lost', name: 'Signal Lost', group: 'Glitch', emoji: '📡', tier: 'free',
    tags: ['glitch', 'broken', 'error', 'signal', 'corrupt'],
    apply: {
      color: { contrast: 12, saturation: 10 },
      effects: [
        { id: 'signalLoss', params: { amount: 55, rate: 10, hold: 26 } },
        { id: 'sliceShiftH', params: { amount: 44, slices: 18, speed: 55 } },
        { id: 'rgbSplit', params: { amount: 20, angle: 0, pulse: 60 } },
        { id: 'tvStatic', params: { amount: 16 } },
      ],
    },
  },
  {
    id: 'datamosh', name: 'Datamosh', group: 'Glitch', emoji: '🧩', tier: 'pro',
    tags: ['datamosh', 'compression', 'blocks', 'melt', 'vaporwave'],
    apply: {
      color: { saturation: 16 },
      effects: [
        { id: 'datamosh', params: { amount: 62, blocks: 30 } },
        { id: 'compressionHeavy', params: { amount: 60 } },
        { id: 'ghostEcho', params: { amount: 34, count: 3, spread: 45 } },
      ],
    },
  },
  {
    id: 'pixel-sort', name: 'Pixel Sort', group: 'Glitch', emoji: '🪞', tier: 'pro',
    tags: ['pixel sort', 'smear', 'art', 'abstract'],
    apply: {
      color: { contrast: 14, saturation: 12 },
      effects: [
        { id: 'pixelSort', params: { amount: 58, threshold: 48 } },
        { id: 'rgbSplit', params: { amount: 12, angle: 90, pulse: 0 } },
      ],
    },
  },
  {
    id: 'cyberpunk-street', name: 'Cyberpunk Street', group: 'Glitch', emoji: '🌃', tier: 'pro',
    tags: ['cyberpunk', 'neon', 'night', 'city', 'future'],
    apply: {
      look: 'neon', strength: 0.8,
      color: { contrast: 22, saturation: 26, temperature: -16 },
      effects: [
        { id: 'duoCyberpunk', params: { amount: 42, contrast: 46 } },
        { id: 'glow', params: { amount: 46, radius: 22, threshold: 58 } },
        { id: 'microGlitch', params: { amount: 26, rate: 6, hold: 18 } },
        { id: 'flareAnamorphic', params: { amount: 34, x: 66, y: 34, size: 74 } },
        { id: 'nightHaze', params: { amount: 26, depth: 50 } },
      ],
    },
  },

  /* ---------------- Dreamy ---------------- */
  {
    id: 'dreamcore', name: 'Dreamcore', group: 'Dreamy', emoji: '💭', tier: 'free',
    tags: ['dream', 'soft', 'hazy', 'ethereal', 'aesthetic'],
    apply: {
      look: 'soft', strength: 0.8,
      color: { exposure: 6, contrast: -10, saturation: -4, highlights: -12 },
      effects: [
        { id: 'dreamy', params: { amount: 58 } },
        { id: 'glow', params: { amount: 34, radius: 26, threshold: 46 } },
        { id: 'leakTWhite', params: { amount: 22, size: 84, drift: 8 } },
        { id: 'bokehLights', params: { amount: 30, count: 14, colour: '#ffe7b0' } },
      ],
    },
  },
  {
    id: 'memory', name: 'Memory', group: 'Dreamy', emoji: '🫧', tier: 'free',
    tags: ['memory', 'flashback', 'nostalgic', 'faded', 'soft'],
    apply: {
      look: 'fade', strength: 0.85,
      color: { exposure: 8, contrast: -14, saturation: -18, temperature: 10 },
      effects: [
        { id: 'softFocus', params: { amount: 40, radius: 16 } },
        { id: 'faded', params: { amount: 58 } },
        { id: 'filmGrain', params: { amount: 20, size: 1.2 } },
        { id: 'vignetteWhite', params: { amount: 30, size: 46 } },
      ],
    },
  },
  {
    id: 'ethereal-bloom', name: 'Ethereal Bloom', group: 'Dreamy', emoji: '🌸', tier: 'pro',
    tags: ['bloom', 'pastel', 'pretty', 'wedding', 'soft'],
    apply: {
      look: 'pastel', strength: 0.9,
      color: { exposure: 5, contrast: -8, saturation: -6, highlights: -16 },
      effects: [
        { id: 'glow', params: { amount: 58, radius: 32, threshold: 40 } },
        { id: 'dreamy', params: { amount: 34 } },
        { id: 'sparkles', params: { amount: 26, speed: 60, colour: '#fff6b0', size: 70 } },
        { id: 'vignetteWhite', params: { amount: 24, size: 40 } },
      ],
    },
  },

  /* ---------------- Anime ---------------- */
  {
    id: 'amv-impact', name: 'AMV Impact', group: 'Anime', emoji: '⚡', tier: 'free',
    tags: ['anime', 'amv', 'impact', 'hard', 'slam', 'edit'],
    apply: {
      look: 'punch', strength: 0.85,
      color: { contrast: 22, saturation: 18 },
      effects: [
        { id: 'rgbSplit', params: { amount: 24, angle: 0, pulse: 75 } },
        { id: 'motionBlur', params: { amount: 52, samples: 6 } },
        { id: 'zoomPunch', params: { amount: 58, every: 0.5, length: 0.12 } },
        { id: 'speedLines', params: { amount: 52, length: 50, colour: '#ffffff', spin: 45 } },
      ],
    },
  },
  {
    id: 'amv-aura', name: 'AMV Aura', group: 'Anime', emoji: '🔥', tier: 'free',
    tags: ['anime', 'aura', 'power', 'glow', 'shonen'],
    apply: {
      look: 'vivid', strength: 0.8,
      color: { contrast: 18, saturation: 26 },
      effects: [
        { id: 'auraGold', params: { amount: 62, pulse: 48 } },
        { id: 'glow', params: { amount: 48, radius: 24, threshold: 52 } },
        { id: 'linesRadial', params: { amount: 44, count: 70, clear: 30, colour: '#ffe9a8' } },
        { id: 'shockwave', params: { amount: 62, at: 0, length: 0.4 } },
      ],
    },
  },
  {
    id: 'manga-page', name: 'Manga Page', group: 'Anime', emoji: '📖', tier: 'pro',
    tags: ['manga', 'screentone', 'comic', 'ink', 'halftone', 'mono'],
    apply: {
      color: { contrast: 34, saturation: -100 },
      effects: [
        { id: 'inkOutline', params: { amount: 72, detail: 2 } },
        { id: 'screentone', params: { amount: 62, size: 4 } },
        { id: 'linesDiagonal', params: { amount: 34, count: 50, clear: 36, colour: '#ffffff' } },
        { id: 'borderThick', params: { width: 4, colour: '#ffffff', radius: 0 } },
      ],
    },
  },

  /* ---------------- Music video ---------------- */
  {
    id: 'phonk-drift', name: 'Phonk Drift', group: 'Music video', emoji: '🏎', tier: 'free',
    tags: ['phonk', 'drift', 'car', 'night', 'chrome', 'memphis'],
    apply: {
      look: 'crush', strength: 0.7,
      color: { contrast: 30, saturation: -16, temperature: -12, shadows: -18 },
      effects: [
        { id: 'duoSteel', params: { amount: 52, contrast: 52 } },
        { id: 'shake', params: { amount: 20, speed: 26, rotate: 14 } },
        { id: 'rgbSplit', params: { amount: 14, angle: 0, pulse: 70 } },
        { id: 'vignetteHard', params: { amount: 46, size: 58 } },
        { id: 'filmGrain', params: { amount: 26, size: 1.2 } },
      ],
    },
  },
  {
    id: 'vapourwave', name: 'Vapourwave', group: 'Music video', emoji: '🌴', tier: 'free',
    tags: ['vapourwave', 'vaporwave', 'aesthetic', '80s', 'pink', 'retro'],
    apply: {
      look: 'neon', strength: 0.7,
      color: { contrast: 10, saturation: 22 },
      effects: [
        { id: 'rampVapour', params: { amount: 62 } },
        { id: 'scanlines', params: { amount: 22, gap: 3, curve: 8 } },
        { id: 'rgbSplit', params: { amount: 14, angle: 0, pulse: 0 } },
        { id: 'glow', params: { amount: 34, radius: 22, threshold: 54 } },
      ],
    },
  },
  {
    id: 'strobe-club', name: 'Strobe Club', group: 'Music video', emoji: '🪩', tier: 'pro',
    tags: ['club', 'strobe', 'rave', 'party', 'flash', 'dance'],
    apply: {
      look: 'vivid', strength: 0.75,
      color: { contrast: 26, saturation: 24, shadows: -14 },
      effects: [
        { id: 'flash', params: { amount: 58, every: 0.5, length: 0.07, colour: '#ffffff' } },
        { id: 'glow', params: { amount: 44, radius: 20, threshold: 60 } },
        { id: 'zoomPunch', params: { amount: 40, every: 0.5, length: 0.1 } },
        { id: 'spinBlur', params: { amount: 16, samples: 8 } },
      ],
    },
  },

  /* ---------------- Beauty & people ---------------- */
  {
    id: 'clean-beauty', name: 'Clean Beauty', group: 'Beauty', emoji: '✨', tier: 'free',
    tags: ['beauty', 'skin', 'portrait', 'soft', 'flattering', 'face'],
    apply: {
      look: 'soft', strength: 0.6,
      color: { exposure: 4, contrast: -4, saturation: 4, temperature: 6, highlights: -8 },
      effects: [
        { id: 'focusRegion', params: { x: 50, y: 42, size: 30, feather: 46, strength: 52, mode: 'portrait' } },
        { id: 'glow', params: { amount: 22, radius: 18, threshold: 62 } },
        { id: 'vignetteSoft', params: { amount: 20, size: 46 } },
      ],
    },
  },
  {
    id: 'talking-head-pro', name: 'Talking Head', group: 'Beauty', emoji: '🎙', tier: 'free',
    tags: ['talking head', 'interview', 'youtube', 'podcast', 'voice'],
    apply: {
      look: 'cinematic', strength: 0.45,
      color: { exposure: 3, contrast: 8, saturation: 4, temperature: 4 },
      effects: [
        { id: 'focusRegion', params: { x: 50, y: 44, size: 32, feather: 42, strength: 44, mode: 'portrait' } },
        { id: 'vignetteSoft', params: { amount: 24, size: 50 } },
      ],
      strip: {
        on: true,
        eq: [
          { id: 'hp', on: true, type: 'highpass', freq: 90, q: 0.7, gain: 0 },
          { id: 'low', on: true, type: 'lowshelf', freq: 200, q: 0.7, gain: -2 },
          { id: 'lowmid', on: true, type: 'peaking', freq: 420, q: 1.1, gain: -3 },
          { id: 'mid', on: true, type: 'peaking', freq: 1600, q: 1, gain: 1 },
          { id: 'presence', on: true, type: 'peaking', freq: 4200, q: 1, gain: 3 },
          { id: 'air', on: true, type: 'highshelf', freq: 11000, q: 0.7, gain: 2 },
        ],
        comp: { on: true, threshold: -22, ratio: 3, attack: 0.006, release: 0.18, knee: 6, makeup: 3 },
        pan: 0, gain: 0,
      },
    },
  },
  {
    id: 'old-hollywood', name: 'Old Hollywood', group: 'Beauty', emoji: '🌟', tier: 'pro',
    tags: ['glamour', 'hollywood', 'classic', 'mono', 'portrait'],
    apply: {
      look: 'mono', strength: 0.9,
      color: { contrast: 18, saturation: -100, highlights: 12 },
      effects: [
        { id: 'softFocus', params: { amount: 34, radius: 14 } },
        { id: 'glow', params: { amount: 40, radius: 24, threshold: 56 } },
        { id: 'vignetteHard', params: { amount: 36, size: 54 } },
        { id: 'filmGrain', params: { amount: 22, size: 1.2 } },
      ],
    },
  },

  /* ---------------- Horror ---------------- */
  {
    id: 'found-footage', name: 'Found Footage', group: 'Horror', emoji: '🔦', tier: 'free',
    tags: ['horror', 'found footage', 'scary', 'handheld', 'night'],
    apply: {
      look: 'crush', strength: 0.7,
      color: { contrast: 22, saturation: -26, shadows: -26 },
      effects: [
        { id: 'handheldRun', params: { amount: 42, roll: 26 } },
        { id: 'nightVision', params: { amount: 34 } },
        { id: 'tvStatic', params: { amount: 18 } },
        { id: 'vignetteHard', params: { amount: 58, size: 54 } },
      ],
    },
  },
  {
    id: 'nightmare', name: 'Nightmare', group: 'Horror', emoji: '🩸', tier: 'pro',
    tags: ['horror', 'nightmare', 'red', 'disturbing', 'blood'],
    apply: {
      color: { contrast: 32, saturation: -12, shadows: -30 },
      effects: [
        { id: 'duoBlood', params: { amount: 58, contrast: 54 } },
        { id: 'warpRipple', params: { amount: 18, speed: 22 } },
        { id: 'ghostEcho', params: { amount: 28, count: 2, spread: 30 } },
        { id: 'filmGrain', params: { amount: 34, size: 1.5 } },
        { id: 'vignetteHard', params: { amount: 62, size: 50 } },
      ],
    },
  },

  /* ---------------- Product & brand ---------------- */
  {
    id: 'product-clean', name: 'Product Clean', group: 'Product', emoji: '📦', tier: 'free',
    tags: ['product', 'ecommerce', 'clean', 'white', 'ad', 'shop'],
    apply: {
      color: { exposure: 8, contrast: 10, saturation: 8, highlights: -6 },
      effects: [
        { id: 'vignetteWhite', params: { amount: 18, size: 38 } },
        { id: 'movePushIn', params: { amount: 60, over: 4, ease: 70 } },
      ],
    },
  },
  {
    id: 'product-premium', name: 'Premium Dark', group: 'Product', emoji: '🖤', tier: 'free',
    tags: ['product', 'luxury', 'dark', 'premium', 'tech', 'ad'],
    apply: {
      look: 'cinematic', strength: 0.7,
      color: { contrast: 24, saturation: -6, shadows: -18, highlights: 6 },
      effects: [
        { id: 'flareAnamorphic', params: { amount: 30, x: 72, y: 30, size: 80 } },
        { id: 'vignetteHard', params: { amount: 42, size: 56 } },
        { id: 'movePushIn', params: { amount: 45, over: 5, ease: 75 } },
      ],
    },
  },

  /* ---------------- Travel & nature ---------------- */
  {
    id: 'travel-bright', name: 'Travel Bright', group: 'Travel', emoji: '🧳', tier: 'free',
    tags: ['travel', 'holiday', 'bright', 'vlog', 'summer'],
    apply: {
      look: 'vivid', strength: 0.7,
      color: { exposure: 6, contrast: 12, saturation: 18, temperature: 8 },
      effects: [
        { id: 'vignetteSoft', params: { amount: 18, size: 42 } },
        { id: 'movePushIn', params: { amount: 35, over: 5, ease: 65 } },
      ],
    },
  },
  {
    id: 'moody-landscape', name: 'Moody Landscape', group: 'Travel', emoji: '⛰', tier: 'free',
    tags: ['landscape', 'moody', 'nature', 'drone', 'epic'],
    apply: {
      look: 'eterna', strength: 0.85,
      color: { contrast: 16, saturation: -10, temperature: -10, highlights: -14, shadows: 6 },
      effects: [
        { id: 'mist', params: { amount: 28, depth: 62 } },
        { id: 'crop239', params: { colour: '#000000', amount: 100 } },
        { id: 'vignetteCool', params: { amount: 30, size: 46 } },
      ],
    },
  },
  {
    id: 'tropical-pop', name: 'Tropical Pop', group: 'Travel', emoji: '🏝', tier: 'pro',
    tags: ['tropical', 'beach', 'holiday', 'blue', 'summer', 'bright'],
    apply: {
      look: 'velvia', strength: 0.8,
      color: { exposure: 5, contrast: 14, saturation: 26, temperature: -4 },
      effects: [
        { id: 'glow', params: { amount: 22, radius: 18, threshold: 66 } },
        { id: 'flareSun', params: { amount: 28, x: 76, y: 20, size: 78 } },
      ],
    },
  },

  /* ---------------- Sport & action ---------------- */
  {
    id: 'sports-highlight', name: 'Sports Highlight', group: 'Sport', emoji: '🏆', tier: 'free',
    tags: ['sport', 'highlight', 'action', 'punch', 'hype'],
    apply: {
      look: 'punch', strength: 0.85,
      color: { contrast: 24, saturation: 16, highlights: -6 },
      effects: [
        { id: 'motionBlur', params: { amount: 42, samples: 5 } },
        { id: 'zoomPunch', params: { amount: 44, every: 0.5, length: 0.12 } },
        { id: 'vignetteHard', params: { amount: 30, size: 62 } },
      ],
    },
  },
  {
    id: 'gym-hard', name: 'Gym Hard', group: 'Sport', emoji: '🏋️', tier: 'free',
    tags: ['gym', 'workout', 'fitness', 'hard', 'contrast', 'motivation'],
    apply: {
      look: 'bleach', strength: 0.7,
      color: { contrast: 34, saturation: -28, shadows: -20 },
      effects: [
        { id: 'bleachBypass', params: { amount: 55 } },
        { id: 'shake', params: { amount: 14, speed: 20, rotate: 10 } },
        { id: 'vignetteHard', params: { amount: 44, size: 58 } },
        { id: 'filmGrain', params: { amount: 24, size: 1.1 } },
      ],
    },
  },

  /* ---------------- Meme & social ---------------- */
  {
    id: 'deep-fried', name: 'Deep Fried', group: 'Meme', emoji: '🍟', tier: 'free',
    tags: ['meme', 'deep fried', 'funny', 'crunchy', 'shitpost'],
    apply: {
      color: { contrast: 60, saturation: 90, exposure: 14 },
      effects: [
        { id: 'deepFried', params: { amount: 90 } },
        { id: 'compressionHeavy', params: { amount: 82 } },
        { id: 'rgbSplit', params: { amount: 16, angle: 0, pulse: 0 } },
      ],
    },
  },
  {
    id: 'zoom-spam', name: 'Zoom Spam', group: 'Meme', emoji: '🔍', tier: 'free',
    tags: ['meme', 'zoom', 'punch', 'funny', 'reaction'],
    apply: {
      color: { contrast: 20, saturation: 18 },
      effects: [
        { id: 'zoomPunch', params: { amount: 85, every: 0.35, length: 0.1 } },
        { id: 'shake', params: { amount: 34, speed: 30, rotate: 26 } },
        { id: 'flash', params: { amount: 40, every: 0.7, length: 0.06, colour: '#ffffff' } },
      ],
    },
  },
  {
    id: 'green-screen-ready', name: 'Green Screen', group: 'Meme', emoji: '🟩', tier: 'free',
    tags: ['green screen', 'chroma', 'key', 'cutout', 'overlay'],
    apply: {
      effects: [
        { id: 'chromaKey', params: { colour: '#00b140', tolerance: 32, softness: 14, spill: 65 } },
      ],
    },
  },

  /* ---------------- Broadcast ---------------- */
  {
    id: 'news-broadcast', name: 'News Broadcast', group: 'Broadcast', emoji: '📰', tier: 'free',
    tags: ['news', 'broadcast', 'clean', 'neutral', 'corporate'],
    apply: {
      color: { exposure: 2, contrast: 8, saturation: 4 },
      effects: [
        { id: 'crop178', params: { colour: '#000000', amount: 100 } },
      ],
      strip: {
        on: true,
        eq: [
          { id: 'hp', on: true, type: 'highpass', freq: 85, q: 0.7, gain: 0 },
          { id: 'low', on: false, type: 'lowshelf', freq: 200, q: 0.7, gain: 0 },
          { id: 'lowmid', on: true, type: 'peaking', freq: 350, q: 1.2, gain: -2 },
          { id: 'mid', on: false, type: 'peaking', freq: 1600, q: 1, gain: 0 },
          { id: 'presence', on: true, type: 'peaking', freq: 3800, q: 1, gain: 2.5 },
          { id: 'air', on: true, type: 'highshelf', freq: 10000, q: 0.7, gain: 1.5 },
        ],
        comp: { on: true, threshold: -20, ratio: 4, attack: 0.004, release: 0.14, knee: 4, makeup: 3 },
        pan: 0, gain: 0,
      },
    },
  },
  {
    id: 'documentary', name: 'Documentary', group: 'Broadcast', emoji: '🎥', tier: 'free',
    tags: ['documentary', 'natural', 'honest', 'interview', 'real'],
    apply: {
      look: 'eterna', strength: 0.6,
      color: { contrast: 6, saturation: -4 },
      effects: [
        { id: 'handheldSubtle', params: { amount: 22, roll: 14 } },
        { id: 'filmGrain', params: { amount: 10, size: 1 } },
      ],
    },
  },
];

/* ------------------------------------------------------------------ */
/* families                                                             */
/* ------------------------------------------------------------------ */

/*
 * One family per idea that genuinely has variants, and the variant carries
 * only what differs from the family.
 *
 * The test for whether something belongs here rather than above is simple: if
 * writing the variants out by hand would be the same stack with one value
 * changed, it is a family. If each one needs its own tuning, it is not, and
 * generating it would ship eight mediocre presets instead of one good one.
 */
const FAMILIES = [
  {
    group: 'Light leaks',
    emoji: '🌈',
    tier: 'free',
    tags: ['leak', 'light', 'film', 'analog', 'warm'],
    base: {
      look: 'kodak', strength: 0.5,
      color: { exposure: 3, contrast: 4, saturation: 4 },
      effects: [
        { id: 'filmGrain', params: { amount: 14, size: 1 } },
      ],
    },
    /* Corner and colour, because those are the two things that differ between
       one light leak and another, and nothing else about the stack does. */
    variants: [
      ['Leak · warm top-right', 'leakTRWarm', { amount: 46, size: 72, drift: 16 }],
      ['Leak · gold top-left', 'leakTLGold', { amount: 44, size: 70, drift: 14 }],
      ['Leak · crimson right', 'leakRCrimson', { amount: 42, size: 66, drift: 18 }],
      ['Leak · teal left', 'leakLTeal', { amount: 40, size: 68, drift: 14 }],
      ['Leak · violet bottom', 'leakBViolet', { amount: 38, size: 74, drift: 12 }],
      ['Leak · white top', 'leakTWhite', { amount: 34, size: 82, drift: 10 }],
      ['Leak · gold bottom-right', 'leakBRGold', { amount: 44, size: 70, drift: 16 }],
      ['Leak · crimson bottom-left', 'leakBLCrimson', { amount: 40, size: 66, drift: 18 }],
    ],
    make(name, fxId, params) {
      return {
        ...this.base,
        effects: [{ id: fxId, params }, ...this.base.effects],
      };
    },
  },
  {
    group: 'Duotone',
    emoji: '🎨',
    tier: 'free',
    tags: ['duotone', 'two tone', 'graphic', 'poster', 'bold'],
    base: { color: { contrast: 18, saturation: -8 } },
    variants: [
      ['Duotone · midnight', 'duoMidnight'],
      ['Duotone · cyberpunk', 'duoCyberpunk'],
      ['Duotone · ember', 'duoEmber'],
      ['Duotone · forest', 'duoForest'],
      ['Duotone · rose', 'duoRose'],
      ['Duotone · steel', 'duoSteel'],
      ['Duotone · gold', 'duoGold'],
      ['Duotone · violet', 'duoViolet'],
      ['Duotone · mint', 'duoMint'],
      ['Duotone · blood', 'duoBlood'],
      ['Duotone · ice', 'duoIce'],
      ['Duotone · ultraviolet', 'duoUltraviolet'],
    ],
    make(name, fxId) {
      return {
        ...this.base,
        effects: [
          { id: fxId, params: { amount: 82, contrast: 46 } },
          { id: 'filmGrain', params: { amount: 10, size: 1 } },
        ],
      };
    },
  },
  {
    group: 'Film stock',
    emoji: '🎞',
    tier: 'free',
    tags: ['film', 'stock', 'analog', 'emulsion', 'photo'],
    base: {},
    /* Stock, its grade, and how much grain that stock actually has — the one
       number that separates a 35mm frame from an 8mm one. */
    variants: [
      ['Stock · Portra 400', 'portra400', 18, { exposure: 4, contrast: 2, saturation: 2, temperature: 8 }],
      ['Stock · Portra 800', 'portra800', 26, { exposure: 3, contrast: 4, saturation: 2, temperature: 10 }],
      ['Stock · Ektar 100', 'ektar', 12, { contrast: 10, saturation: 14 }],
      ['Stock · Velvia 50', 'velvia', 10, { contrast: 14, saturation: 24 }],
      ['Stock · Provia 100', 'provia', 12, { contrast: 8, saturation: 8 }],
      ['Stock · Eterna', 'eterna', 14, { contrast: -4, saturation: -10 }],
      ['Stock · Cinestill 800T', 'cinestill800', 24, { contrast: 8, saturation: 6, temperature: -14 }],
      ['Stock · Gold 200', 'gold200', 20, { exposure: 3, saturation: 8, temperature: 14 }],
      ['Stock · Superia', 'superia', 22, { contrast: 6, saturation: 10, tint: 6 }],
      ['Stock · Agfa', 'agfa', 20, { contrast: 6, saturation: -4, temperature: 6 }],
      ['Stock · Lomo', 'lomo', 28, { contrast: 20, saturation: 18 }],
      ['Stock · Kodachrome', 'tech3', 16, { contrast: 14, saturation: 12, temperature: 6 }],
    ],
    make(name, look, grain, colour) {
      return {
        look, strength: 0.9,
        color: colour,
        effects: [
          { id: 'filmGrain', params: { amount: grain, size: grain > 22 ? 1.3 : 1 } },
          { id: 'vignetteSoft', params: { amount: 16, size: 44 } },
        ],
      };
    },
  },
  {
    group: 'Camera move',
    emoji: '🎥',
    tier: 'free',
    tags: ['move', 'push', 'pan', 'motion', 'ken burns', 'still'],
    base: {},
    /* For stills, mostly. A photo with no move on it reads as a mistake in a
       video, and which way it moves is the only decision worth offering. */
    variants: [
      ['Move · slow push in', 'movePushIn', 55, 6],
      ['Move · slow pull out', 'movePullOut', 55, 6],
      ['Move · pan left', 'movePanLeft', 70, 5],
      ['Move · pan right', 'movePanRight', 70, 5],
      ['Move · tilt up', 'moveTiltUp', 65, 5],
      ['Move · tilt down', 'moveTiltDown', 65, 5],
      ['Move · crane up', 'moveCraneUp', 80, 6],
      ['Move · dolly right', 'moveDollyRight', 70, 5],
      ['Move · fast push in', 'movePushIn', 120, 2.4],
      ['Move · whip pan', 'whipPan', 70, 0.3],
    ],
    make(name, fxId, amount, over) {
      const params = fxId === 'whipPan'
        ? { amount, at: 0, length: over }
        : { amount, over, ease: 70 };
      return { effects: [{ id: fxId, params }] };
    },
  },
  {
    group: 'Weather',
    emoji: '🌧',
    tier: 'free',
    tags: ['weather', 'rain', 'snow', 'atmosphere', 'overlay'],
    base: {},
    variants: [
      ['Weather · light rain', 'rain', 42, { contrast: 8, saturation: -10, temperature: -12 }],
      ['Weather · downpour', 'heavyRain', 68, { contrast: 14, saturation: -16, temperature: -16 }],
      ['Weather · snowfall', 'snow', 48, { contrast: 6, saturation: -14, temperature: -10 }],
      ['Weather · blizzard', 'blizzardFall', 74, { contrast: 10, saturation: -22, temperature: -14 }],
      ['Weather · embers', 'embers', 52, { contrast: 16, saturation: 10, temperature: 18 }],
      ['Weather · dust motes', 'dustMotes', 44, { exposure: 3, temperature: 12 }],
      ['Weather · ash fall', 'ashFall', 56, { contrast: 12, saturation: -30 }],
      ['Weather · confetti', 'confetti', 60, { contrast: 8, saturation: 16 }],
      ['Weather · sparkles', 'sparkles', 46, { exposure: 4, saturation: 8 }],
      ['Weather · bubbles', 'bubbles', 44, { saturation: 8, temperature: -8 }],
    ],
    make(name, fxId, amount, colour) {
      return {
        color: colour,
        effects: [{ id: fxId, params: { amount, speed: 100, size: 100 } }],
      };
    },
  },
  {
    group: 'Split screen',
    emoji: '🔲',
    tier: 'pro',
    tags: ['split', 'grid', 'tile', 'mirror', 'kaleidoscope', 'layout'],
    base: { color: { contrast: 10 } },
    variants: [
      ['Split · two across', 'split2H'],
      ['Split · two down', 'split2V'],
      ['Split · three across', 'split3H'],
      ['Split · quad', 'split4'],
      ['Split · nine up', 'split9'],
      ['Mirror · left', 'mirrorLeft'],
      ['Mirror · right', 'mirrorRight'],
      ['Mirror · quad', 'mirrorQuad'],
      ['Tile · two', 'tile2'],
      ['Tile · four', 'tile4'],
      ['Kaleidoscope · six', 'kaleido6'],
      ['Kaleidoscope · twelve', 'kaleido12'],
    ],
    make(name, fxId) {
      const params = fxId.startsWith('split') ? { gap: 2, colour: '#000000' }
        : fxId.startsWith('kaleido') ? { amount: 100, spin: 0, zoom: 120 }
          : fxId.startsWith('tile') ? { amount: 100, flip: 'yes' }
            : { amount: 100 };
      return { ...this.base, effects: [{ id: fxId, params }] };
    },
  },
  {
    group: 'Isolate colour',
    emoji: '🎯',
    tier: 'pro',
    tags: ['isolate', 'colour pop', 'selective', 'mono', 'accent'],
    base: { color: { contrast: 16, saturation: 10 } },
    /* One colour left in a black-and-white frame. Old, effective, and the
       width is what stops it keeping half the picture by accident. */
    variants: [
      ['Isolate · red', 'isolateRed', 16],
      ['Isolate · orange', 'isolateOrange', 26],
      ['Isolate · yellow', 'isolateYellow', 22],
      ['Isolate · green', 'isolateGreen', 38],
      ['Isolate · cyan', 'isolateCyan', 30],
      ['Isolate · blue', 'isolateBlue', 38],
      ['Isolate · purple', 'isolatePurple', 34],
      ['Isolate · pink', 'isolatePink', 28],
    ],
    make(name, fxId, width) {
      return {
        ...this.base,
        effects: [
          { id: fxId, params: { amount: 92, width } },
          { id: 'vignetteSoft', params: { amount: 24, size: 48 } },
        ],
      };
    },
  },
  {
    group: 'Aspect',
    emoji: '🖼',
    tier: 'free',
    tags: ['aspect', 'crop', 'letterbox', 'cinemascope', 'format', 'bars'],
    base: {},
    variants: [
      ['Bars · 2.39 scope', 'crop239'],
      ['Bars · 2.35 scope', 'crop235'],
      ['Bars · 1.85 flat', 'crop185'],
      ['Bars · 16:9', 'crop178'],
      ['Bars · 1.66 European', 'crop166'],
      ['Bars · 3:2', 'crop150'],
      ['Bars · 4:3 classic', 'crop133'],
      ['Bars · square', 'crop100'],
      ['Bars · 4:5 feed', 'crop080'],
      ['Bars · 9:16 tall', 'crop056'],
    ],
    make(name, fxId) {
      return { effects: [{ id: fxId, params: { colour: '#000000', amount: 100 } }] };
    },
  },
  {
    group: 'Handheld',
    emoji: '🤚',
    tier: 'free',
    tags: ['handheld', 'shake', 'organic', 'real', 'camera'],
    base: {},
    /* Motion blur rides with the shake on the heavier ones, because a fast
       handheld frame that is perfectly sharp reads as a stutter, not a camera. */
    variants: [
      ['Handheld · barely there', 'handheldSubtle', 24, 0],
      ['Handheld · documentary', 'handheldDocumentary', 46, 0],
      ['Handheld · breathing', 'handheldBreathing', 38, 0],
      ['Handheld · running', 'handheldRun', 72, 40],
      ['Handheld · shaky cam', 'handheldRun', 100, 60],
    ],
    make(name, fxId, amount, blur) {
      const fx = [{ id: fxId, params: { amount, roll: Math.round(amount * 0.55) } }];
      if (blur) fx.push({ id: 'motionBlur', params: { amount: blur, samples: 5 } });
      return { effects: fx };
    },
  },
];

/* ------------------------------------------------------------------ */
/* assembling                                                           */
/* ------------------------------------------------------------------ */

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const generated = [];
for (const family of FAMILIES) {
  for (const variant of family.variants) {
    const [name, ...rest] = variant;
    generated.push({
      id: slug(name),
      name,
      group: family.group,
      emoji: family.emoji,
      tier: family.tier,
      tags: [...family.tags, ...slug(name).split('-')],
      apply: family.make(name, ...rest),
    });
  }
}

export const PRESET_PACKS = [...HAND, ...generated];

/*
 * A preset naming an effect this build does not have would fail silently —
 * applyPreset skips what it cannot make, so the stack would come out short
 * with nothing said. Caught here at module load instead, where it is a
 * developer's problem rather than a user's.
 */
export const PRESET_PROBLEMS = [];
export function checkPresets(effectIds, lookIds) {
  PRESET_PROBLEMS.length = 0;
  const fx = new Set(effectIds);
  const looks = new Set(lookIds);
  const seen = new Set();
  for (const p of PRESET_PACKS) {
    if (seen.has(p.id)) PRESET_PROBLEMS.push(`${p.id}: duplicate id`);
    seen.add(p.id);
    for (const e of p.apply.effects || []) {
      if (!fx.has(e.id)) PRESET_PROBLEMS.push(`${p.id}: no such effect "${e.id}"`);
    }
    if (p.apply.look && p.apply.look !== 'none' && !looks.has(p.apply.look)) {
      PRESET_PROBLEMS.push(`${p.id}: no such look "${p.apply.look}"`);
    }
  }
  return PRESET_PROBLEMS;
}

export const PRESET_GROUPS = PRESET_PACKS.reduce((acc, p) => {
  (acc[p.group] ||= []).push(p);
  return acc;
}, {});
