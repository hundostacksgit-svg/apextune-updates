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

import { EFFECTS } from './effects.js';
import { LOOK_BY_ID } from './filters.js';

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

  /* ---------------- Y2K ---------------- */
  {
    id: 'y2k-chrome', name: 'Y2K Chrome', group: 'Y2K', emoji: '💿', tier: 'pro',
    tags: ['y2k', '2000s', 'chrome', 'metal', 'shiny', 'millennium'],
    apply: {
      look: 'y2k', strength: 0.8,
      color: { exposure: 4, contrast: 16, saturation: -8, highlights: 14 },
      effects: [
        { id: 'glow', params: { amount: 48, radius: 26, threshold: 60 } },
        { id: 'prism', params: { amount: 22 } },
        { id: 'flareStar', params: { amount: 34, x: 72, y: 24, size: 70 } },
      ],
    },
  },
  {
    id: 'mall-crt', name: 'Mall CRT', group: 'Y2K', emoji: '📺', tier: 'free',
    tags: ['y2k', 'crt', 'shop', 'tube', 'display', '2000s'],
    apply: {
      look: 'vaporwave', strength: 0.65,
      color: { contrast: 8, saturation: 14, temperature: -6 },
      effects: [
        { id: 'crtTube', params: { amount: 58 } },
        { id: 'scanlines', params: { amount: 34, gap: 3, curve: 16 } },
        { id: 'compressionLight', params: { amount: 32 } },
      ],
    },
  },

  /* ---------------- Horror ---------------- */
  {
    id: 'analog-horror', name: 'Analog Horror', group: 'Horror', emoji: '📡', tier: 'pro',
    tags: ['horror', 'analog', 'broadcast', 'creepy', 'signal', 'liminal'],
    /* The tube goes on last. Static that gets bent by the tube curve reads as
       a screen; static painted over the top reads as a filter. */
    apply: {
      look: 'horror', strength: 0.85,
      color: { exposure: -6, contrast: 18, saturation: -26 },
      effects: [
        { id: 'ghostEcho', params: { amount: 42, count: 3, spread: 38 } },
        { id: 'signalLoss', params: { amount: 44, rate: 5, hold: 40 } },
        { id: 'tvStatic', params: { amount: 38 } },
        { id: 'crtTube', params: { amount: 52 } },
        { id: 'vignetteHard', params: { amount: 58, size: 62 } },
      ],
    },
  },

  /* ---------------- Trailer ---------------- */
  {
    id: 'trailer-scope', name: 'Trailer Scope', group: 'Trailer', emoji: '🎞', tier: 'pro',
    tags: ['trailer', 'scope', 'blockbuster', 'epic', 'cinema', 'teaser'],
    apply: {
      look: 'blockbuster', strength: 0.9,
      color: { contrast: 14, saturation: 6, shadows: -8, highlights: -6 },
      effects: [
        { id: 'flareAnamorphic', params: { amount: 38, x: 74, y: 32, size: 110 } },
        { id: 'filmGrain', params: { amount: 16, size: 1 } },
        { id: 'crop239', params: { colour: '#000000', amount: 100 } },
      ],
    },
  },
  {
    id: 'trailer-cold-open', name: 'Cold Open', group: 'Trailer', emoji: '🧊', tier: 'pro',
    tags: ['trailer', 'thriller', 'cold', 'tense', 'ominous', 'open'],
    apply: {
      look: 'thriller', strength: 0.85,
      color: { exposure: -5, contrast: 16, saturation: -14, temperature: -18 },
      effects: [
        { id: 'fog', params: { amount: 32, depth: 60 } },
        { id: 'vignetteHard', params: { amount: 48, size: 66 } },
        { id: 'crop239', params: { colour: '#000000', amount: 100 } },
      ],
    },
  },

  /* ---------------- Wedding ---------------- */
  {
    id: 'wedding-golden', name: 'Wedding Golden', group: 'Wedding', emoji: '💍', tier: 'free',
    tags: ['wedding', 'romance', 'warm', 'soft', 'ceremony', 'love'],
    apply: {
      look: 'romance', strength: 0.7,
      color: { exposure: 5, contrast: -4, saturation: 6, temperature: 16, shadows: 10 },
      effects: [
        { id: 'goldenHour', params: { amount: 40 } },
        { id: 'softFocus', params: { amount: 30, radius: 12 } },
        { id: 'leakTRGold', params: { amount: 26, size: 66, drift: 12 } },
        { id: 'bokehLights', params: { amount: 26, count: 14, colour: '#ffe7b0' } },
      ],
    },
  },
  {
    id: 'wedding-film', name: 'Wedding Film', group: 'Wedding', emoji: '🎞', tier: 'free',
    tags: ['wedding', 'film', 'portra', 'stock', 'timeless', 'skin'],
    apply: {
      look: 'portra400', strength: 0.8,
      color: { contrast: 4, saturation: -2, temperature: 8 },
      effects: [
        { id: 'filmGrain', params: { amount: 20, size: 1 } },
        { id: 'gateWeave', params: { amount: 12 } },
      ],
    },
  },

  /* ---------------- Food ---------------- */
  {
    id: 'food-appetite', name: 'Appetite', group: 'Food', emoji: '🍜', tier: 'free',
    tags: ['food', 'recipe', 'warm', 'saturated', 'delicious', 'cooking'],
    /* Saturation stays modest and the warmth does the work. Food pushed hard
       on saturation goes plastic, and plastic food does not sell. */
    apply: {
      look: 'food', strength: 0.75,
      color: { exposure: 4, contrast: 10, saturation: 12, temperature: 10, sharpen: 14 },
      effects: [
        { id: 'softFocus', params: { amount: 16, radius: 8 } },
        { id: 'vignetteSoft', params: { amount: 22, size: 55 } },
      ],
    },
  },
  {
    id: 'food-dark', name: 'Dark Kitchen', group: 'Food', emoji: '🕯', tier: 'pro',
    tags: ['food', 'moody', 'restaurant', 'dark', 'low key', 'night'],
    apply: {
      look: 'lowkey', strength: 0.85,
      color: { exposure: -6, contrast: 18, saturation: 4, shadows: -12 },
      effects: [
        { id: 'spotlight', params: { amount: 46, size: 42 } },
        { id: 'vignetteHard', params: { amount: 50, size: 60 } },
      ],
    },
  },

  /* ---------------- Automotive ---------------- */
  {
    id: 'car-night-run', name: 'Night Run', group: 'Automotive', emoji: '🏎', tier: 'pro',
    tags: ['car', 'night', 'neon', 'street', 'rolling', 'jdm'],
    apply: {
      look: 'neonnights', strength: 0.85,
      color: { exposure: -4, contrast: 20, saturation: 14, temperature: -12 },
      effects: [
        { id: 'flareAnamorphic', params: { amount: 52, x: 30, y: 40, size: 120 } },
        { id: 'glow', params: { amount: 38, radius: 22, threshold: 62 } },
        { id: 'motionBlur', params: { amount: 34, samples: 5 } },
        { id: 'crop239', params: { colour: '#000000', amount: 100 } },
      ],
    },
  },
  {
    id: 'car-drift-smoke', name: 'Drift Smoke', group: 'Automotive', emoji: '💨', tier: 'pro',
    tags: ['drift', 'smoke', 'phonk', 'car', 'chaos', 'tyre'],
    apply: {
      look: 'phonkdark', strength: 0.9,
      color: { exposure: -5, contrast: 24, saturation: -12, shadows: -18 },
      effects: [
        { id: 'smoke', params: { amount: 42, depth: 55 } },
        { id: 'shake', params: { amount: 32, speed: 60 } },
        { id: 'rgbSplit', params: { amount: 16, angle: 0, pulse: 60 } },
        { id: 'filmGrain', params: { amount: 24, size: 1.4 } },
      ],
    },
  },

  /* ---------------- Kaleidoscope ---------------- */
  {
    id: 'kaleido-bloom', name: 'Kaleido Bloom', group: 'Kaleidoscope', emoji: '🔮', tier: 'pro',
    tags: ['kaleidoscope', 'trippy', 'psychedelic', 'symmetry', 'visualiser', 'festival'],
    apply: {
      look: 'euphoric', strength: 0.8,
      color: { contrast: 12, saturation: 26 },
      effects: [
        { id: 'kaleido6', params: { amount: 100, spin: 12, zoom: 125 } },
        { id: 'swirlCW', params: { amount: 26, spin: 14 } },
        { id: 'glow', params: { amount: 36, radius: 24, threshold: 50 } },
      ],
    },
  },

  /* ---------------- Sci-fi ---------------- */
  {
    id: 'scifi-deep-space', name: 'Deep Space', group: 'Sci-fi', emoji: '🛰', tier: 'pro',
    tags: ['sci-fi', 'space', 'cold', 'dark', 'stars', 'void'],
    apply: {
      look: 'midnight', strength: 0.9,
      color: { exposure: -8, contrast: 18, saturation: -8, temperature: -20 },
      effects: [
        { id: 'duoDeepsea', params: { amount: 46 } },
        { id: 'vignetteWide', params: { amount: 46, size: 82 } },
        { id: 'filmGrain', params: { amount: 14, size: 1 } },
      ],
    },
  },
  {
    id: 'scifi-scan', name: 'Machine Scan', group: 'Sci-fi', emoji: '🔬', tier: 'pro',
    tags: ['sci-fi', 'scan', 'hud', 'tech', 'xray', 'analysis'],
    apply: {
      look: 'techcold', strength: 0.8,
      color: { contrast: 14, saturation: -18, temperature: -14 },
      effects: [
        { id: 'xray', params: { amount: 68 } },
        { id: 'scanlines', params: { amount: 42, gap: 4, curve: 0 } },
        { id: 'microGlitch', params: { amount: 26, rate: 12, hold: 14 } },
      ],
    },
  },

  /* ---------------- Nature ---------------- */
  {
    id: 'nature-forest-light', name: 'Forest Light', group: 'Nature', emoji: '🌿', tier: 'free',
    tags: ['nature', 'forest', 'green', 'rays', 'outdoors', 'wildlife'],
    apply: {
      look: 'jungle', strength: 0.75,
      color: { exposure: 3, contrast: 8, saturation: 10, tint: -6 },
      effects: [
        { id: 'godRays', params: { amount: 42, x: 68, y: 12, rays: 18 } },
        { id: 'dustMotes', params: { amount: 28, speed: 100, size: 100 } },
      ],
    },
  },
  {
    id: 'nature-mountain', name: 'Mountain Air', group: 'Nature', emoji: '🏔', tier: 'free',
    tags: ['nature', 'mountain', 'cold', 'landscape', 'wide', 'hike'],
    apply: {
      look: 'arctic', strength: 0.7,
      color: { contrast: 12, saturation: -4, temperature: -10, sharpen: 10 },
      effects: [
        { id: 'mist', params: { amount: 30, depth: 70 } },
        { id: 'crop239', params: { colour: '#000000', amount: 100 } },
      ],
    },
  },

  /* ---------------- Archive ---------------- */
  {
    id: 'archive-newsreel', name: 'Newsreel', group: 'Archive', emoji: '📽', tier: 'free',
    tags: ['archive', 'newsreel', 'historic', 'old', 'print', 'wartime'],
    apply: {
      look: 'hp5', strength: 0.85,
      color: { contrast: 22, saturation: -100 },
      effects: [
        { id: 'projectorFlicker', params: { amount: 42, rate: 18 } },
        { id: 'dustScratches', params: { amount: 52, rate: 14 } },
        { id: 'gateWeave', params: { amount: 30 } },
        { id: 'crop133', params: { colour: '#000000', amount: 100 } },
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
  {
    group: 'Grade tools',
    emoji: '🩹',
    tier: 'free',
    tags: ['fix', 'utility', 'correct', 'log', 'flat', 'rescue', 'neutral', 'base'],
    base: {},
    /* The unglamorous half of a preset library, and the half a colourist
       actually reaches for. Every one of these is a starting point rather
       than a look: nothing here is trying to be interesting. */
    variants: [
      ['Fix · Log to Rec.709', 'logto709', 1, { contrast: 6, saturation: 8 }],
      ['Fix · Flatten', 'flat', 1, { contrast: -18, saturation: -12 }],
      ['Fix · Neutral', 'neutral', 1, {}],
      ['Fix · Punch up', 'punchup', 0.9, { contrast: 10, saturation: 8 }],
      ['Fix · Rescue shadows', 'rescueshadow', 1, { shadows: 26, contrast: -4 }],
      ['Fix · Rescue highlights', 'rescuehigh', 1, { highlights: -30 }],
      ['Fix · Skin safe', 'skinsafe', 0.85, { saturation: -4, temperature: 4 }],
      ['Fix · Day for night', 'dayfornight', 1, { exposure: -14, temperature: -22, saturation: -18 }],
    ],
    make(name, look, strength, colour) {
      return { look, strength, color: colour };
    },
  },
  {
    group: 'Hue shift',
    emoji: '🌈',
    tier: 'free',
    tags: ['hue', 'shift', 'rotate', 'colour', 'wheel'],
    base: {},
    variants: [
      ['Hue · +30°', 'hue30'], ['Hue · +60°', 'hue60'], ['Hue · +90°', 'hue90'],
      ['Hue · +120°', 'hue120'], ['Hue · +150°', 'hue150'], ['Hue · +180°', 'hue180'],
      ['Hue · +210°', 'hue210'], ['Hue · +240°', 'hue240'], ['Hue · +270°', 'hue270'],
      ['Hue · +300°', 'hue300'], ['Hue · +330°', 'hue330'],
    ],
    make(name, fxId) {
      return { effects: [{ id: fxId, params: { amount: 100 } }] };
    },
  },
  {
    group: 'Gradient map',
    emoji: '🎨',
    tier: 'pro',
    tags: ['gradient', 'ramp', 'map', 'two tone', 'colour'],
    base: { color: { contrast: 10 } },
    variants: [
      ['Ramp · sunset', 'rampSunset', 82],
      ['Ramp · vapour', 'rampVapour', 78],
      ['Ramp · toxic', 'rampToxic', 74],
      ['Ramp · inferno', 'rampInferno', 80],
      ['Ramp · arctic', 'rampArctic', 76],
      ['Ramp · copper', 'rampCopper', 78],
      ['Ramp · bruise', 'rampBruise', 74],
      ['Ramp · matrix', 'rampMatrix', 84],
    ],
    make(name, fxId, amount) {
      return { ...this.base, effects: [{ id: fxId, params: { amount } }] };
    },
  },
  {
    group: 'Channel swap',
    emoji: '🔀',
    tier: 'pro',
    tags: ['channel', 'swap', 'rgb', 'wrong colour', 'glitch'],
    base: {},
    variants: [
      ['Channels · RGB to GBR', 'chanRGBtoGBR'],
      ['Channels · RGB to BRG', 'chanRGBtoBRG'],
      ['Channels · swap red and blue', 'chanSwapRB'],
      ['Channels · swap red and green', 'chanSwapRG'],
      ['Channels · swap green and blue', 'chanSwapGB'],
    ],
    make(name, fxId) {
      return { effects: [{ id: fxId, params: { amount: 100 } }] };
    },
  },
  {
    group: 'Lens flare',
    emoji: '✨',
    tier: 'pro',
    tags: ['flare', 'lens', 'anamorphic', 'sun', 'god rays', 'light'],
    base: { color: { contrast: 6 } },
    /* Placed off-centre on purpose. A flare in the middle of the frame reads
       as a mistake in the render rather than light in the room. */
    variants: [
      ['Flare · anamorphic streak', 'flareAnamorphic', 55, 72, 30],
      ['Flare · star', 'flareStar', 50, 68, 26],
      ['Flare · ring', 'flareRing', 45, 62, 34],
      ['Flare · sun', 'flareSun', 60, 78, 18],
      ['Flare · god rays', 'godRays', 50, 50, 8],
    ],
    make(name, fxId, amount, x, y) {
      const params = fxId === 'godRays' ? { amount, x, y, rays: 16 } : { amount, x, y, size: 90 };
      return { ...this.base, effects: [{ id: fxId, params }] };
    },
  },
  {
    group: 'Vignette',
    emoji: '⭕',
    tier: 'free',
    tags: ['vignette', 'edge', 'darken', 'spotlight', 'focus'],
    base: {},
    variants: [
      ['Vignette · soft', 'vignetteSoft', 40, 48],
      ['Vignette · hard', 'vignetteHard', 58, 62],
      ['Vignette · wide', 'vignetteWide', 34, 80],
      ['Vignette · white', 'vignetteWhite', 44, 55],
      ['Vignette · warm', 'vignetteWarm', 46, 55],
      ['Vignette · cool', 'vignetteCool', 46, 55],
      ['Vignette · spotlight', 'spotlight', 55, 40],
    ],
    make(name, fxId, amount, size) {
      return { effects: [{ id: fxId, params: { amount, size } }] };
    },
  },
  {
    group: 'Focus',
    emoji: '🔎',
    tier: 'free',
    tags: ['focus', 'blur', 'bokeh', 'tilt shift', 'dreamy', 'depth'],
    base: {},
    variants: [
      ['Focus · soft', 'softFocus', { amount: 42, radius: 14 }],
      ['Focus · dreamy', 'dreamy', { amount: 55 }],
      ['Focus · rack in', 'rackFocus', { from: 70, to: 0, over: 1.2 }],
      ['Focus · rack out', 'rackFocus', { from: 0, to: 70, over: 1.2 }],
      ['Focus · bokeh lights', 'bokehLights', { amount: 50, count: 22, colour: '#ffe7b0' }],
      ['Focus · zoom blur', 'zoomBlur', { amount: 45, cx: 50, cy: 50 }],
      ['Focus · spin blur', 'spinBlur', { amount: 38, samples: 12 }],
      ['Focus · tilt-shift centre', 'tiltCentre', { amount: 62, width: 26 }],
      ['Focus · tilt-shift top', 'tiltTop', { amount: 58, width: 34 }],
      ['Focus · tilt-shift bottom', 'tiltBottom', { amount: 58, width: 34 }],
    ],
    make(name, fxId, params) {
      return { effects: [{ id: fxId, params }] };
    },
  },
  {
    group: 'Warp',
    emoji: '🌊',
    tier: 'pro',
    tags: ['warp', 'distort', 'lens', 'ripple', 'swirl', 'bend'],
    base: {},
    variants: [
      ['Warp · wave', 'warpWave', { amount: 38, speed: 40 }],
      ['Warp · wave vertical', 'warpWaveV', { amount: 38, speed: 40 }],
      ['Warp · ripple', 'warpRipple', { amount: 42, speed: 45 }],
      ['Warp · zigzag', 'warpZigzag', { amount: 40, speed: 50 }],
      ['Warp · flag', 'warpFlag', { amount: 44, speed: 35 }],
      ['Warp · jelly', 'warpJelly', { amount: 46, speed: 55 }],
      ['Lens · bulge', 'lensBulge', { amount: 45 }],
      ['Lens · pinch', 'lensPinch', { amount: 45 }],
      ['Lens · fisheye', 'lensFisheye', { amount: 55 }],
      ['Lens · barrel', 'lensBarrel', { amount: 40 }],
      ['Lens · tunnel', 'lensTunnel', { amount: 50 }],
      ['Swirl · clockwise', 'swirlCW', { amount: 45, spin: 20 }],
      ['Swirl · anticlockwise', 'swirlCCW', { amount: 45, spin: 20 }],
    ],
    make(name, fxId, params) {
      return { effects: [{ id: fxId, params }] };
    },
  },
  {
    group: 'Broken',
    emoji: '🧬',
    tier: 'pro',
    tags: ['glitch', 'datamosh', 'corrupt', 'broken', 'error', 'digital'],
    base: { color: { contrast: 10, saturation: 6 } },
    variants: [
      ['Broken · datamosh', 'datamosh', { amount: 65, blocks: 42 }],
      ['Broken · pixel sort', 'pixelSort', { amount: 70, threshold: 52 }],
      ['Broken · slice across', 'sliceShiftH', { amount: 55, slices: 18, speed: 45 }],
      ['Broken · slice down', 'sliceShiftV', { amount: 55, slices: 18, speed: 45 }],
      ['Broken · overcompressed', 'compressionHeavy', { amount: 72 }],
      ['Broken · signal loss', 'signalLoss', { amount: 55, rate: 6, hold: 34 }],
      ['Broken · block glitch', 'blockGlitch', { amount: 52, rate: 7, hold: 28 }],
      ['Broken · heavy glitch', 'heavyGlitch', { amount: 68, rate: 9, hold: 32 }],
      ['Broken · micro glitch', 'microGlitch', { amount: 38, rate: 14, hold: 16 }],
      ['Broken · dead channel', 'tvStatic', { amount: 55 }],
      ['Broken · echo chamber', 'ghostEcho', { amount: 50, count: 5, spread: 45 }],
    ],
    make(name, fxId, params) {
      return { ...this.base, effects: [{ id: fxId, params }] };
    },
  },
  {
    group: 'Ink & print',
    emoji: '🖋',
    tier: 'pro',
    tags: ['ink', 'print', 'sketch', 'comic', 'paint', 'drawn', 'halftone'],
    base: { color: { contrast: 12 } },
    variants: [
      ['Ink · pencil sketch', 'sketch', { amount: 88, detail: 3 }],
      ['Ink · outline', 'inkOutline', { amount: 72, detail: 2 }],
      ['Ink · emboss', 'emboss', { amount: 70 }],
      ['Ink · oil paint', 'oilPaint', { amount: 72, brush: 9 }],
      ['Ink · watercolour', 'watercolour', { amount: 70 }],
      ['Ink · threshold', 'threshold', { amount: 100, level: 52 }],
      ['Ink · crosshatch', 'crosshatch', { amount: 68, spacing: 7 }],
      ['Print · newsprint', 'newsprint', { amount: 88, size: 5 }],
      ['Print · halftone', 'halftone', { amount: 64, size: 6 }],
      ['Print · manga screentone', 'screentone', { amount: 72, size: 4 }],
    ],
    make(name, fxId, params) {
      return { ...this.base, effects: [{ id: fxId, params }] };
    },
  },
  {
    group: 'Posterise',
    emoji: '🟪',
    tier: 'free',
    tags: ['posterise', 'poster', 'flat', 'bands', 'cel', 'levels'],
    base: { color: { contrast: 14, saturation: 10 } },
    variants: [
      ['Poster · 2 levels', 'poster2'], ['Poster · 3 levels', 'poster3'],
      ['Poster · 4 levels', 'poster4'], ['Poster · 6 levels', 'poster6'],
      ['Poster · 8 levels', 'poster8'], ['Poster · 12 levels', 'poster12'],
    ],
    make(name, fxId) {
      return { ...this.base, effects: [{ id: fxId, params: { amount: 100 } }] };
    },
  },
  {
    group: 'Mosaic',
    emoji: '🔳',
    tier: 'free',
    tags: ['mosaic', 'pixelate', 'censor', 'blocks', 'tiles'],
    base: {},
    variants: [
      ['Mosaic · square', 'mosaicSquare', { size: 20, gap: 10 }],
      ['Mosaic · round', 'mosaicRound', { size: 20, gap: 12 }],
      ['Mosaic · diamond', 'mosaicDiamond', { size: 22, gap: 10 }],
      ['Mosaic · hex', 'mosaicHex', { size: 22, gap: 8 }],
      ['Mosaic · pixelate', 'pixelate', { size: 16 }],
    ],
    make(name, fxId, params) {
      return { effects: [{ id: fxId, params }] };
    },
  },
  {
    group: 'Frame',
    emoji: '🖼',
    tier: 'free',
    tags: ['frame', 'border', 'edge', 'polaroid', 'film', 'letterbox'],
    base: {},
    variants: [
      ['Frame · thin white', 'borderThin', { width: 1.4, colour: '#ffffff', radius: 0 }],
      ['Frame · thick white', 'borderThick', { width: 4.5, colour: '#ffffff', radius: 0 }],
      ['Frame · black', 'borderBlack', { width: 3, colour: '#000000', radius: 0 }],
      ['Frame · film paper', 'borderFilm', { width: 2.8, colour: '#e8e2d4', radius: 0 }],
      ['Frame · rounded card', 'borderThick', { width: 3.5, colour: '#ffffff', radius: 28 }],
      ['Frame · film perforations', 'filmPerfs', { amount: 100, size: 9 }],
      ['Frame · polaroid', 'polaroidFrame', { amount: 100 }],
      ['Frame · letterbox bars', 'letterbox', { amount: 14, colour: '#000000' }],
    ],
    make(name, fxId, params) {
      return { effects: [{ id: fxId, params }] };
    },
  },
  {
    group: 'Trails',
    emoji: '💫',
    tier: 'pro',
    tags: ['trail', 'smear', 'echo', 'afterimage', 'motion', 'ghost'],
    base: {},
    variants: [
      ['Trail · smear left', 'smearLeft', { amount: 40, samples: 12 }],
      ['Trail · smear right', 'smearRight', { amount: 40, samples: 12 }],
      ['Trail · smear up', 'smearUp', { amount: 40, samples: 12 }],
      ['Trail · smear down', 'smearDown', { amount: 40, samples: 12 }],
      ['Trail · afterimage ×2', 'afterImage2', { amount: 45, spread: 30, angle: 0 }],
      ['Trail · afterimage ×3', 'afterImage3', { amount: 50, spread: 38, angle: 0 }],
      ['Trail · afterimage ×5', 'afterImage5', { amount: 55, spread: 46, angle: 0 }],
    ],
    make(name, fxId, params) {
      return { effects: [{ id: fxId, params }] };
    },
  },
  {
    group: 'Perspective',
    emoji: '📐',
    tier: 'free',
    tags: ['perspective', 'flip', 'mirror', 'tilt', 'skew', 'spin'],
    base: {},
    variants: [
      ['Flip · horizontal', 'flipH', {}],
      ['Flip · vertical', 'flipV', {}],
      ['Flip · both', 'flipBoth', {}],
      ['Perspective · left', 'perspectiveLeft', { amount: 35 }],
      ['Perspective · right', 'perspectiveRight', { amount: 35 }],
      ['Perspective · up', 'perspectiveUp', { amount: 30 }],
      ['Perspective · down', 'perspectiveDown', { amount: 30 }],
      ['Spin · slow turn', 'rotateSpin', { speed: 0.2, zoom: 145 }],
      ['Skew · horizontal', 'shearX', { amount: 28 }],
      ['Stretch · pull', 'stretchPull', { amount: 42, axis: 'x' }],
    ],
    make(name, fxId, params) {
      return { effects: [{ id: fxId, params }] };
    },
  },
  {
    group: 'Reframe',
    emoji: '🔍',
    tier: 'free',
    tags: ['punch in', 'zoom', 'reframe', 'scale', 'crop in', 'position'],
    base: {},
    /* Transform rather than an effect, because a punch-in that a later effect
       can blur is a punch-in that reads as soft footage. This is the frame
       itself moving. */
    variants: [
      ['Reframe · punch 105%', { scale: 1.05, x: 0, y: 0 }],
      ['Reframe · punch 110%', { scale: 1.1, x: 0, y: 0 }],
      ['Reframe · punch 120%', { scale: 1.2, x: 0, y: 0 }],
      ['Reframe · punch 140%', { scale: 1.4, x: 0, y: 0 }],
      ['Reframe · left third', { scale: 1.2, x: 12, y: 0 }],
      ['Reframe · right third', { scale: 1.2, x: -12, y: 0 }],
      ['Reframe · headroom up', { scale: 1.15, x: 0, y: 8 }],
      ['Reframe · headroom down', { scale: 1.15, x: 0, y: -8 }],
    ],
    make(name, transform) {
      return { transform };
    },
  },
  {
    group: 'Aura',
    emoji: '🔆',
    tier: 'pro',
    tags: ['aura', 'energy', 'anime', 'glow', 'power', 'edge light'],
    base: { color: { contrast: 10, saturation: 8 } },
    variants: [
      ['Aura · white', 'auraWhite', 55],
      ['Aura · gold', 'auraGold', 58],
      ['Aura · blue', 'auraBlue', 58],
      ['Aura · red', 'auraRed', 60],
      ['Aura · purple', 'auraPurple', 58],
      ['Aura · green', 'auraGreen', 55],
    ],
    make(name, fxId, amount) {
      return {
        ...this.base,
        effects: [
          { id: fxId, params: { amount, pulse: 45 } },
          { id: 'glow', params: { amount: 32, radius: 20, threshold: 55 } },
        ],
      };
    },
  },
  {
    group: 'Vision',
    emoji: '🥽',
    tier: 'pro',
    tags: ['vision', 'thermal', 'night vision', 'xray', 'infrared', 'scan', 'sci-fi'],
    base: {},
    variants: [
      ['Vision · night vision', 'nightVision', 100, 40],
      ['Vision · thermal', 'thermal', 100, 0],
      ['Vision · x-ray', 'xray', 100, 0],
      ['Vision · infrared', 'infrared', 100, 0],
      ['Vision · blueprint', 'blueprint', 100, 0],
      ['Vision · negative', 'negative', 100, 0],
      ['Vision · solarise', 'solarise', 85, 0],
    ],
    make(name, fxId, amount, grain) {
      const fx = [{ id: fxId, params: { amount } }];
      if (grain) fx.push({ id: 'filmGrain', params: { amount: grain, size: 2 } });
      fx.push({ id: 'vignetteHard', params: { amount: 40, size: 65 } });
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
 *
 * Parameter names are checked as well, and they are the ones that actually
 * catch mistakes. `{ id: 'fog', params: { height: 60 } }` is not an error to
 * anybody: makeEffect builds a fog, applyPreset merges an ignored key over the
 * defaults, and the fog comes out at its default depth. The preset works, it
 * just does not do the thing it was tuned to do — which is the worst kind of
 * wrong, because nothing anywhere says so.
 */
export const PRESET_PROBLEMS = [];
export function checkPresets(effectIds = Object.keys(EFFECTS), lookIds = Object.keys(LOOK_BY_ID)) {
  PRESET_PROBLEMS.length = 0;
  const fx = new Set(effectIds);
  const looks = new Set(lookIds);
  const seen = new Set();
  for (const p of PRESET_PACKS) {
    if (seen.has(p.id)) PRESET_PROBLEMS.push(`${p.id}: duplicate id`);
    seen.add(p.id);
    for (const e of p.apply.effects || []) {
      if (!fx.has(e.id)) { PRESET_PROBLEMS.push(`${p.id}: no such effect "${e.id}"`); continue; }
      const known = EFFECTS[e.id]?.params || {};
      for (const key of Object.keys(e.params || {})) {
        if (!(key in known)) PRESET_PROBLEMS.push(`${p.id}: "${e.id}" has no parameter "${key}"`);
      }
    }
    if (p.apply.look && p.apply.look !== 'none' && !looks.has(p.apply.look)) {
      PRESET_PROBLEMS.push(`${p.id}: no such look "${p.apply.look}"`);
    }
  }
  return PRESET_PROBLEMS;
}

/* Run it here rather than waiting for a test to. Two hundred and ninety of
   these is well past the number anybody can eyeball. */
checkPresets();
if (PRESET_PROBLEMS.length) {
  // eslint-disable-next-line no-console -- a build-time mistake shipped to runtime
  console.warn(`[presets] ${PRESET_PROBLEMS.length} problem(s):\n  ${PRESET_PROBLEMS.join('\n  ')}`);
}

export const PRESET_GROUPS = PRESET_PACKS.reduce((acc, p) => {
  (acc[p.group] ||= []).push(p);
  return acc;
}, {});
