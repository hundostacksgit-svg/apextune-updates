/*
 * Text styles: what a title looks like, saved as one thing.
 *
 * A style is a patch over the text model in titles.js — fill, outline, glow,
 * 3D block, translucency, font, weight — with nothing in it about where the
 * title sits or what it says. So a style can be pressed on a title someone
 * has already positioned and written, and only its look changes; and the
 * same style lands the same on a headline and a lower third.
 *
 * Every one of these is checked at load against the real text model: a style
 * that sets a key the renderer does not read would silently do nothing, and
 * "the text styles don't work" is exactly the review this library exists not
 * to get.
 */

import { defaultText, FONT_BY_ID } from './titles.js';

/* ------------------------------------------------------------------ */
/* the library                                                         */
/* ------------------------------------------------------------------ */

export const TEXT_STYLES = [

  /* ---------------- Clean ---------------- */
  { id: 'clean-white', name: 'Clean white', group: 'Clean', tier: 'free',
    text: { color: '#ffffff', stroke: null, strokeWidth: 0, shadow: true, gradient: null, glow: null, extrude: null, outline2: null, opacity: 1, box: null } },
  { id: 'clean-black', name: 'Clean black', group: 'Clean', tier: 'free',
    text: { color: '#0b0d12', stroke: null, strokeWidth: 0, shadow: false, gradient: null, glow: null, extrude: null, outline2: null, opacity: 1, box: null } },
  { id: 'subtitle-box', name: 'Subtitle box', group: 'Clean', tier: 'free',
    text: { color: '#ffffff', stroke: null, strokeWidth: 0, shadow: false, box: 'rgba(0,0,0,.78)', gradient: null, glow: null, extrude: null, outline2: null, opacity: 1, weight: 700 } },
  { id: 'serif-editorial', name: 'Editorial serif', group: 'Clean', tier: 'free',
    text: { font: 'serif', weight: 500, color: '#ffffff', stroke: null, strokeWidth: 0, shadow: true, letterSpacing: 0.02, gradient: null, glow: null, extrude: null, outline2: null, opacity: 1, box: null } },
  { id: 'mono-terminal', name: 'Terminal', group: 'Clean', tier: 'free',
    text: { font: 'mono', weight: 600, color: '#9dff9d', stroke: null, strokeWidth: 0, shadow: false, box: 'rgba(0,0,0,.72)', gradient: null, glow: null, extrude: null, outline2: null, opacity: 1 } },

  /* ---------------- Outline ---------------- */
  { id: 'bold-outline', name: 'Bold outline', group: 'Outline', tier: 'free',
    text: { color: '#ffffff', stroke: '#000000', strokeWidth: 0.16, shadow: true, gradient: null, glow: null, extrude: null, outline2: null, opacity: 1, box: null } },
  { id: 'impact-meme', name: 'Impact', group: 'Outline', tier: 'free',
    text: { font: 'impact', weight: 400, uppercase: true, color: '#ffffff', stroke: '#000000', strokeWidth: 0.2, shadow: false, gradient: null, glow: null, extrude: null, outline2: null, opacity: 1, box: null } },
  { id: 'double-outline', name: 'Double outline', group: 'Outline', tier: 'free',
    text: { color: '#ffffff', stroke: '#000000', strokeWidth: 0.1, outline2: '#ffffff', outline2Width: 0.1, shadow: true, gradient: null, glow: null, extrude: null, opacity: 1, box: null } },
  { id: 'comic', name: 'Comic', group: 'Outline', tier: 'free',
    text: { color: '#ffd93d', stroke: '#111111', strokeWidth: 0.18, outline2: '#ffffff', outline2Width: 0.08, weight: 900, uppercase: true, shadow: true, gradient: null, glow: null, extrude: null, opacity: 1, box: null } },
  { id: 'sticker-cut', name: 'Sticker', group: 'Outline', tier: 'free',
    text: { color: '#ff3b6b', stroke: '#ffffff', strokeWidth: 0.2, outline2: '#111111', outline2Width: 0.06, weight: 900, shadow: true, gradient: null, glow: null, extrude: null, opacity: 1, box: null } },

  /* ---------------- Glow & neon ---------------- */
  { id: 'neon-pink', name: 'Neon pink', group: 'Glow & neon', tier: 'creator',
    text: { color: '#ffe6fb', glow: '#ff4fd8', glowBlur: 0.5, stroke: null, strokeWidth: 0, shadow: false, weight: 700, gradient: null, extrude: null, outline2: null, opacity: 1, box: null } },
  { id: 'neon-blue', name: 'Neon blue', group: 'Glow & neon', tier: 'creator',
    text: { color: '#e6fbff', glow: '#00d1ff', glowBlur: 0.5, stroke: null, strokeWidth: 0, shadow: false, weight: 700, gradient: null, extrude: null, outline2: null, opacity: 1, box: null } },
  { id: 'neon-green', name: 'Neon green', group: 'Glow & neon', tier: 'creator',
    text: { color: '#efffe6', glow: '#39ff14', glowBlur: 0.5, stroke: null, strokeWidth: 0, shadow: false, weight: 700, gradient: null, extrude: null, outline2: null, opacity: 1, box: null } },
  { id: 'neon-purple', name: 'Neon violet', group: 'Glow & neon', tier: 'creator',
    text: { color: '#f1e8ff', glow: '#7a5cff', glowBlur: 0.55, stroke: null, strokeWidth: 0, shadow: false, weight: 700, gradient: null, extrude: null, outline2: null, opacity: 1, box: null } },
  { id: 'soft-glow', name: 'Soft glow', group: 'Glow & neon', tier: 'free',
    text: { color: '#ffffff', glow: 'rgba(255,255,255,.9)', glowBlur: 0.3, stroke: null, strokeWidth: 0, shadow: false, weight: 600, gradient: null, extrude: null, outline2: null, opacity: 1, box: null } },
  { id: 'fire-glow', name: 'Fire', group: 'Glow & neon', tier: 'creator',
    text: { gradient: ['#fff1a8', '#ff8a00', '#ff2d00'], gradientAngle: 90, glow: '#ff5a00', glowBlur: 0.45, stroke: null, strokeWidth: 0, shadow: false, weight: 900, color: '#ffb347', extrude: null, outline2: null, opacity: 1, box: null } },
  { id: 'ice-glow', name: 'Ice', group: 'Glow & neon', tier: 'creator',
    text: { gradient: ['#ffffff', '#bfefff', '#5bc8ff'], gradientAngle: 90, glow: '#8fdcff', glowBlur: 0.4, stroke: null, strokeWidth: 0, shadow: false, weight: 800, color: '#bfefff', extrude: null, outline2: null, opacity: 1, box: null } },

  /* ---------------- Gradient & shaded ---------------- */
  { id: 'gold', name: 'Gold', group: 'Gradient', tier: 'creator',
    text: { gradient: ['#fff3b0', '#f4c542', '#a8760a'], gradientAngle: 90, stroke: '#3a2a00', strokeWidth: 0.05, shadow: true, weight: 900, color: '#f4c542', glow: null, extrude: null, outline2: null, opacity: 1, box: null } },
  { id: 'chrome', name: 'Chrome', group: 'Gradient', tier: 'creator',
    text: { gradient: ['#ffffff', '#9aa3ad', '#f2f4f7', '#5b6470', '#dfe3e8'], gradientAngle: 90, stroke: '#1a1d22', strokeWidth: 0.04, shadow: true, weight: 900, color: '#c9d0d8', glow: null, extrude: null, outline2: null, opacity: 1, box: null } },
  { id: 'sunset', name: 'Sunset', group: 'Gradient', tier: 'creator',
    text: { gradient: ['#ffd166', '#ff6b6b', '#c04bff'], gradientAngle: 90, stroke: null, strokeWidth: 0, shadow: true, weight: 900, color: '#ff6b6b', glow: null, extrude: null, outline2: null, opacity: 1, box: null } },
  { id: 'ocean', name: 'Ocean', group: 'Gradient', tier: 'creator',
    text: { gradient: ['#7ef7ff', '#2f7dff', '#1c2a8a'], gradientAngle: 90, stroke: null, strokeWidth: 0, shadow: true, weight: 900, color: '#2f7dff', glow: null, extrude: null, outline2: null, opacity: 1, box: null } },
  { id: 'holographic', name: 'Holographic', group: 'Gradient', tier: 'creator',
    text: { gradient: ['#ff9cee', '#9cf0ff', '#c8ff9c', '#ffe59c', '#ff9cee'], gradientAngle: 20, stroke: null, strokeWidth: 0, shadow: true, weight: 900, color: '#ffffff', glow: null, extrude: null, outline2: null, opacity: 1, box: null } },
  { id: 'shaded-red', name: 'Shaded red', group: 'Gradient', tier: 'free',
    text: { gradient: ['#ff8a8a', '#e01f1f', '#6a0000'], gradientAngle: 90, stroke: null, strokeWidth: 0, shadow: true, weight: 900, color: '#e01f1f', glow: null, extrude: null, outline2: null, opacity: 1, box: null } },
  { id: 'shaded-blue', name: 'Shaded blue', group: 'Gradient', tier: 'free',
    text: { gradient: ['#9fd0ff', '#2f7dff', '#0a2a70'], gradientAngle: 90, stroke: null, strokeWidth: 0, shadow: true, weight: 900, color: '#2f7dff', glow: null, extrude: null, outline2: null, opacity: 1, box: null } },
  { id: 'shaded-green', name: 'Shaded green', group: 'Gradient', tier: 'free',
    text: { gradient: ['#b8ffb0', '#2fbf4a', '#0a4a1a'], gradientAngle: 90, stroke: null, strokeWidth: 0, shadow: true, weight: 900, color: '#2fbf4a', glow: null, extrude: null, outline2: null, opacity: 1, box: null } },
  { id: 'shaded-mono', name: 'Shaded grey', group: 'Gradient', tier: 'free',
    text: { gradient: ['#ffffff', '#9a9a9a', '#2a2a2a'], gradientAngle: 90, stroke: null, strokeWidth: 0, shadow: true, weight: 900, color: '#bdbdbd', glow: null, extrude: null, outline2: null, opacity: 1, box: null } },
  { id: 'rainbow', name: 'Rainbow', group: 'Gradient', tier: 'free',
    text: { gradient: ['#ff4b4b', '#ffb347', '#fff36b', '#5cff8a', '#4bb6ff', '#b467ff'], gradientAngle: 0, stroke: '#111111', strokeWidth: 0.08, shadow: true, weight: 900, color: '#ffffff', glow: null, extrude: null, outline2: null, opacity: 1, box: null } },

  /* ---------------- 3D ---------------- */
  { id: 'block-3d', name: '3D block', group: '3D', tier: 'creator',
    text: { color: '#ffffff', extrude: '#111111', extrudeDepth: 0.12, extrudeAngle: 45, stroke: null, strokeWidth: 0, shadow: false, weight: 900, gradient: null, glow: null, outline2: null, opacity: 1, box: null } },
  { id: 'block-red', name: '3D red', group: '3D', tier: 'creator',
    text: { color: '#ffd7d7', extrude: '#b3111c', extrudeDepth: 0.14, extrudeAngle: 60, stroke: null, strokeWidth: 0, shadow: false, weight: 900, gradient: null, glow: null, outline2: null, opacity: 1, box: null } },
  { id: 'block-blue', name: '3D blue', group: '3D', tier: 'creator',
    text: { color: '#e6f2ff', extrude: '#1c4fd8', extrudeDepth: 0.14, extrudeAngle: 60, stroke: null, strokeWidth: 0, shadow: false, weight: 900, gradient: null, glow: null, outline2: null, opacity: 1, box: null } },
  { id: 'block-pop', name: '3D pop', group: '3D', tier: 'creator',
    text: { color: '#fff36b', extrude: '#ff3b6b', extrudeDepth: 0.16, extrudeAngle: 30, stroke: '#111111', strokeWidth: 0.06, shadow: false, weight: 900, uppercase: true, gradient: null, glow: null, outline2: null, opacity: 1, box: null } },
  { id: 'long-shadow', name: 'Long shadow', group: '3D', tier: 'free',
    text: { color: '#ffffff', extrude: 'rgba(0,0,0,.55)', extrudeDepth: 0.28, extrudeAngle: 45, stroke: null, strokeWidth: 0, shadow: false, weight: 800, gradient: null, glow: null, outline2: null, opacity: 1, box: null } },
  { id: 'gold-3d', name: 'Gold 3D', group: '3D', tier: 'creator',
    text: { gradient: ['#fff3b0', '#f4c542', '#a8760a'], gradientAngle: 90, extrude: '#5a3d00', extrudeDepth: 0.1, extrudeAngle: 60, stroke: null, strokeWidth: 0, shadow: false, weight: 900, color: '#f4c542', glow: null, outline2: null, opacity: 1, box: null } },

  /* ---------------- Translucent ---------------- */
  { id: 'glass', name: 'Glass', group: 'Translucent', tier: 'free',
    text: { color: 'rgba(255,255,255,.62)', stroke: 'rgba(255,255,255,.55)', strokeWidth: 0.03, shadow: false, box: 'rgba(255,255,255,.10)', weight: 700, gradient: null, glow: null, extrude: null, outline2: null, opacity: 1 } },
  { id: 'ghost', name: 'Ghost', group: 'Translucent', tier: 'free',
    text: { color: '#ffffff', opacity: 0.42, stroke: null, strokeWidth: 0, shadow: false, weight: 800, gradient: null, glow: null, extrude: null, outline2: null, box: null } },
  { id: 'watermark', name: 'Watermark', group: 'Translucent', tier: 'free',
    text: { color: '#ffffff', opacity: 0.22, stroke: null, strokeWidth: 0, shadow: false, weight: 900, uppercase: true, letterSpacing: 0.12, gradient: null, glow: null, extrude: null, outline2: null, box: null } },
  { id: 'frosted', name: 'Frosted', group: 'Translucent', tier: 'creator',
    text: { color: 'rgba(255,255,255,.78)', glow: 'rgba(255,255,255,.5)', glowBlur: 0.6, opacity: 0.9, stroke: null, strokeWidth: 0, shadow: false, weight: 700, gradient: null, extrude: null, outline2: null, box: null } },
  { id: 'tinted-glass', name: 'Tinted glass', group: 'Translucent', tier: 'creator',
    text: { color: 'rgba(0,209,255,.7)', stroke: 'rgba(0,209,255,.5)', strokeWidth: 0.03, shadow: false, box: 'rgba(0,40,80,.28)', weight: 700, gradient: null, glow: null, extrude: null, outline2: null, opacity: 1 } },

  /* ---------------- Retro ---------------- */
  { id: 'retro-70s', name: '70s', group: 'Retro', tier: 'creator',
    text: { gradient: ['#ffd166', '#ef8a17', '#8c3b0d'], gradientAngle: 90, stroke: '#fff3d6', strokeWidth: 0.06, font: 'rounded', weight: 900, shadow: true, color: '#ef8a17', glow: null, extrude: null, outline2: null, opacity: 1, box: null } },
  { id: 'retro-80s', name: '80s chrome', group: 'Retro', tier: 'creator',
    text: { gradient: ['#ffffff', '#ff5cf0', '#6a00ff'], gradientAngle: 90, glow: '#ff5cf0', glowBlur: 0.3, stroke: null, strokeWidth: 0, font: 'impact', weight: 400, uppercase: true, shadow: false, color: '#ff5cf0', extrude: null, outline2: null, opacity: 1, box: null } },
  { id: 'vhs-label', name: 'VHS', group: 'Retro', tier: 'free',
    text: { color: '#ffffff', glow: '#00d1ff', glowBlur: 0.18, font: 'mono', weight: 700, uppercase: true, letterSpacing: 0.08, stroke: null, strokeWidth: 0, shadow: false, gradient: null, extrude: null, outline2: null, opacity: 1, box: null } },
  { id: 'typewriter-paper', name: 'Typewriter', group: 'Retro', tier: 'free',
    text: { font: 'mono', weight: 500, color: '#1b1b1b', box: 'rgba(244,236,216,.94)', stroke: null, strokeWidth: 0, shadow: false, gradient: null, glow: null, extrude: null, outline2: null, opacity: 1 } },
  { id: 'newspaper', name: 'Newspaper', group: 'Retro', tier: 'free',
    text: { font: 'serif', weight: 800, color: '#111111', box: 'rgba(250,247,240,.96)', uppercase: true, letterSpacing: 0.01, stroke: null, strokeWidth: 0, shadow: false, gradient: null, glow: null, extrude: null, outline2: null, opacity: 1 } },

  /* ---------------- Impact ---------------- */
  { id: 'condensed-punch', name: 'Condensed punch', group: 'Impact', tier: 'free',
    text: { font: 'cond', weight: 900, uppercase: true, letterSpacing: 0.02, color: '#ffffff', stroke: '#000000', strokeWidth: 0.1, shadow: true, gradient: null, glow: null, extrude: null, outline2: null, opacity: 1, box: null } },
  { id: 'warning-tape', name: 'Warning', group: 'Impact', tier: 'free',
    text: { color: '#111111', box: '#ffd93d', weight: 900, uppercase: true, letterSpacing: 0.06, stroke: null, strokeWidth: 0, shadow: false, gradient: null, glow: null, extrude: null, outline2: null, opacity: 1 } },
  { id: 'label-blue', name: 'Blue label', group: 'Impact', tier: 'free',
    text: { color: '#ffffff', box: '#2f7dff', weight: 800, stroke: null, strokeWidth: 0, shadow: false, gradient: null, glow: null, extrude: null, outline2: null, opacity: 1 } },
  { id: 'label-red', name: 'Red label', group: 'Impact', tier: 'free',
    text: { color: '#ffffff', box: '#e01f1f', weight: 800, uppercase: true, stroke: null, strokeWidth: 0, shadow: false, gradient: null, glow: null, extrude: null, outline2: null, opacity: 1 } },
  { id: 'blood-drip', name: 'Horror', group: 'Impact', tier: 'creator',
    text: { gradient: ['#ff2a2a', '#7a0000'], gradientAngle: 90, glow: '#5a0000', glowBlur: 0.4, extrude: '#2a0000', extrudeDepth: 0.06, extrudeAngle: 90, font: 'serif', weight: 900, uppercase: true, stroke: null, strokeWidth: 0, shadow: false, color: '#c40000', outline2: null, opacity: 1, box: null } },
  { id: 'anime-slam', name: 'Anime slam', group: 'Impact', tier: 'creator',
    text: { color: '#ffffff', stroke: '#000000', strokeWidth: 0.14, outline2: '#ff3b6b', outline2Width: 0.1, font: 'impact', weight: 400, uppercase: true, shadow: true, gradient: null, glow: null, extrude: null, opacity: 1, box: null } },
];

export const TEXT_STYLE_BY_ID = Object.fromEntries(TEXT_STYLES.map((s) => [s.id, s]));

export const TEXT_STYLE_GROUPS = TEXT_STYLES.reduce((acc, s) => {
  (acc[s.group] ||= []).push(s);
  return acc;
}, {});

/**
 * Put a style on a text object. Only the look changes: the words, the
 * position, the size and the animation are the person's, and stay.
 */
export function applyTextStyle(text, styleId) {
  const style = TEXT_STYLE_BY_ID[styleId];
  if (!style) return text;
  const keep = { content: text.content, x: text.x, y: text.y, size: text.size, anim: text.anim,
    animDur: text.animDur, align: text.align, maxWidth: text.maxWidth, lineHeight: text.lineHeight };
  // Back to the defaults first, so a glow from the last style does not
  // survive under a style that has none.
  const base = defaultText(text.content);
  Object.assign(text, base, style.text, keep, { styleId });
  return text;
}

/* ------------------------------------------------------------------ */
/* validation                                                          */
/* ------------------------------------------------------------------ */

export const TEXT_STYLE_PROBLEMS = [];
{
  const known = new Set(Object.keys(defaultText()));
  known.add('highlight');
  const seen = new Set();
  for (const s of TEXT_STYLES) {
    if (seen.has(s.id)) TEXT_STYLE_PROBLEMS.push(`${s.id}: duplicate id`);
    seen.add(s.id);
    for (const k of Object.keys(s.text || {})) {
      if (!known.has(k)) TEXT_STYLE_PROBLEMS.push(`${s.id}: sets "${k}", which the renderer does not read`);
    }
    if (s.text?.font && !FONT_BY_ID[s.text.font]) TEXT_STYLE_PROBLEMS.push(`${s.id}: no font "${s.text.font}"`);
    if (s.text?.gradient && s.text.gradient.length < 2) TEXT_STYLE_PROBLEMS.push(`${s.id}: a gradient needs two colours`);
  }
}
if (TEXT_STYLE_PROBLEMS.length) {
  // eslint-disable-next-line no-console -- a build-time mistake shipped to runtime
  console.warn(`[text-styles] ${TEXT_STYLE_PROBLEMS.length} problem(s):\n  ${TEXT_STYLE_PROBLEMS.join('\n  ')}`);
}
