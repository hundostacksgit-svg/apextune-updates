/*
 * Text, titles and captions.
 *
 * All of it renders straight to canvas, which means what you see in the viewer
 * is literally what the exporter draws — no separate text engine to disagree
 * with the preview. Word wrapping, stroke, shadow and the per-word animations
 * are all here.
 */

import { WEB_FONTS } from './fonts-library.js';

/*
 * The six system stacks stay at the top of the list and keep their ids.
 *
 * They are the ones that need no network and never fail, so they stay the
 * defaults and the fallbacks — and projects already reference them by id, so
 * renaming or reordering them would change what existing work looks like.
 */
export const SYSTEM_FONTS = [
  { id: 'sans',    name: 'Inter / system',  group: 'On this device', stack: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,system-ui,sans-serif' },
  { id: 'impact',  name: 'Impact',          group: 'On this device', stack: 'Impact,"Haettenschweiler","Arial Narrow Bold",sans-serif' },
  { id: 'serif',   name: 'Serif',           group: 'On this device', stack: 'Georgia,"Times New Roman",serif' },
  { id: 'mono',    name: 'Mono',            group: 'On this device', stack: 'ui-monospace,"SF Mono",Menlo,Consolas,monospace' },
  { id: 'rounded', name: 'Rounded',         group: 'On this device', stack: '"SF Pro Rounded","Segoe UI",Verdana,sans-serif' },
  { id: 'cond',    name: 'Condensed',       group: 'On this device', stack: '"Arial Narrow","Helvetica Neue",sans-serif' },
];

export const FONTS = [...SYSTEM_FONTS, ...WEB_FONTS];
export const FONT_BY_ID = Object.fromEntries(FONTS.map((f) => [f.id, f]));

/** Group -> fonts, so two hundred typefaces can be browsed rather than scrolled. */
export const FONT_GROUPS = FONTS.reduce((acc, f) => {
  (acc[f.group || 'More'] ||= []).push(f);
  return acc;
}, {});

/**
 * Every font id a project's text and captions actually use.
 *
 * The exporter calls this to wait for those faces before drawing anything.
 * Only the fonts in use, never the whole library — two hundred families is
 * tens of megabytes, and a project with one title needs exactly one of them.
 */
export function fontsUsedBy(project) {
  const ids = new Set();
  for (const clip of project?.clips || []) {
    if (clip.text?.font) ids.add(clip.text.font);
    for (const t of clip.texts || []) if (t.font) ids.add(t.font);
  }
  // A cue names a style, and the style names the font — so resolve through it
  // rather than looking for a font on the cue that is not there.
  for (const cue of project?.captions || []) {
    const style = CAPTION_STYLES[cue?.style || 'tiktok'];
    if (cue?.font) ids.add(cue.font);
    else if (style?.font) ids.add(style.font);
  }
  return [...ids];
}

/* Caption styles that match what each platform's own editor produces, so a
   video posted from here doesn't look out of place next to native ones. */
export const CAPTION_STYLES = {
  tiktok:   { name: 'TikTok', font: 'sans', weight: 800, size: 0.055, color: '#ffffff',
              stroke: '#000000', strokeWidth: 0.16, box: null, anim: 'wordPop', align: 'center', y: 0.72 },
  youtube:  { name: 'YouTube', font: 'sans', weight: 700, size: 0.042, color: '#ffffff',
              stroke: null, strokeWidth: 0, box: 'rgba(0,0,0,.78)', anim: 'none', align: 'center', y: 0.85 },
  bold:     { name: 'Bold box', font: 'impact', weight: 400, size: 0.062, color: '#ffffff',
              stroke: '#000000', strokeWidth: 0.2, box: null, anim: 'pop', align: 'center', y: 0.5 },
  karaoke:  { name: 'Karaoke', font: 'sans', weight: 800, size: 0.052, color: '#ffffff',
              stroke: '#000000', strokeWidth: 0.14, box: null, anim: 'karaoke', align: 'center', y: 0.7,
              highlight: '#00d1ff' },
  clean:    { name: 'Clean', font: 'sans', weight: 600, size: 0.038, color: '#ffffff',
              stroke: null, strokeWidth: 0, box: null, shadow: true, anim: 'fade', align: 'center', y: 0.88 },
};

export const ANIMS = [
  ['none', 'None'], ['fade', 'Fade in'], ['pop', 'Pop'], ['slideUp', 'Slide up'],
  ['typewriter', 'Typewriter'], ['wordPop', 'Word by word'], ['karaoke', 'Karaoke highlight'],
  ['shake', 'Shake'], ['bounce', 'Bounce'],
];

export function defaultText(content = 'Your text here') {
  return {
    content,
    font: 'sans',
    weight: 800,
    size: 0.07,          // fraction of frame height, so it scales with any ratio
    color: '#ffffff',
    stroke: '#000000',
    strokeWidth: 0.14,   // fraction of font size
    box: null,           // background colour, or null
    shadow: true,
    align: 'center',
    x: 0.5,
    y: 0.5,
    anim: 'pop',
    animDur: 0.45,
    lineHeight: 1.18,
    maxWidth: 0.86,
    letterSpacing: 0,
    uppercase: false,
  };
}

/* ------------------------------------------------------------------ */
/* layout                                                              */
/* ------------------------------------------------------------------ */

function wrap(ctx, text, maxWidth) {
  const paragraphs = String(text).split('\n');
  const lines = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); continue; }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const test = `${line} ${words[i]}`;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = words[i]; }
      else line = test;
    }
    lines.push(line);
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/* animation                                                           */
/* ------------------------------------------------------------------ */

/**
 * Returns the per-frame drawing modifiers for an animation at local time t.
 * Everything is expressed as offsets and multipliers so the draw code below
 * stays one path regardless of which animation is running.
 */
function animState(anim, t, dur, clipDur) {
  const inP = Math.min(1, Math.max(0, t / Math.max(0.05, dur)));
  const outStart = clipDur - dur;
  const outP = clipDur > dur * 2 ? Math.min(1, Math.max(0, (t - outStart) / Math.max(0.05, dur))) : 0;
  const ease = (x) => 1 - (1 - x) ** 3;
  const base = { alpha: 1, scale: 1, dy: 0, dx: 0, reveal: 1, wordIndex: Infinity, karaoke: -1 };

  switch (anim) {
    case 'fade':
      return { ...base, alpha: ease(inP) * (1 - ease(outP)) };
    case 'pop': {
      const s = inP < 1 ? 0.6 + ease(inP) * 0.46 : 1;      // overshoots to 1.06 then settles
      return { ...base, alpha: ease(inP) * (1 - ease(outP)), scale: inP < 1 ? Math.min(s, 1.06) : 1 };
    }
    case 'slideUp':
      return { ...base, alpha: ease(inP) * (1 - ease(outP)), dy: (1 - ease(inP)) * 0.09 };
    case 'typewriter':
      return { ...base, reveal: inP };
    case 'wordPop':
      return { ...base, wordIndex: inP };
    case 'karaoke':
      return { ...base, karaoke: clipDur > 0 ? t / clipDur : 0 };
    case 'shake': {
      const a = Math.sin(t * 34) * 0.006 * (1 - inP * 0.5);
      return { ...base, dx: a, dy: Math.cos(t * 41) * 0.005, alpha: ease(inP) };
    }
    case 'bounce': {
      const b = inP < 1 ? Math.abs(Math.sin(inP * Math.PI * 2)) * (1 - inP) * 0.06 : 0;
      return { ...base, dy: -b, alpha: ease(inP) };
    }
    default:
      return base;
  }
}

/* ------------------------------------------------------------------ */
/* draw                                                                */
/* ------------------------------------------------------------------ */

/**
 * Paint a text object onto ctx sized w×h. `t` is seconds since the clip
 * started and `clipDur` its length — both only matter for the animations.
 */
export function drawText(ctx, w, h, text, t = 0, clipDur = 3) {
  const st = { ...defaultText(), ...text };
  const size = Math.max(8, st.size * h);
  const font = FONT_BY_ID[st.font]?.stack || FONTS[0].stack;
  const a = animState(st.anim, t, st.animDur ?? 0.45, clipDur);
  if (a.alpha <= 0.002) return;

  ctx.save();
  ctx.globalAlpha = a.alpha;
  ctx.font = `${st.weight} ${size}px ${font}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = st.align;
  if (st.letterSpacing) ctx.letterSpacing = `${(st.letterSpacing * size).toFixed(2)}px`;

  let content = String(st.content ?? '');
  if (st.uppercase) content = content.toUpperCase();
  if (st.anim === 'typewriter') content = content.slice(0, Math.ceil(content.length * a.reveal));

  const lines = wrap(ctx, content, st.maxWidth * w);
  const lineH = size * (st.lineHeight ?? 1.18);
  const cx = st.x * w + a.dx * w;
  const cy = st.y * h + a.dy * h;
  const totalH = lines.length * lineH;
  const top = cy - totalH / 2 + lineH / 2;

  ctx.translate(cx, cy);
  ctx.scale(a.scale, a.scale);
  ctx.translate(-cx, -cy);

  // background box, sized to the widest line
  if (st.box) {
    const pad = size * 0.32;
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width), 0);
    const bx = st.align === 'left' ? cx - pad : st.align === 'right' ? cx - widest - pad : cx - widest / 2 - pad;
    ctx.fillStyle = st.box;
    roundRect(ctx, bx, top - lineH / 2 - pad * 0.5, widest + pad * 2, totalH + pad, size * 0.16);
    ctx.fill();
  }

  if (st.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = size * 0.22;
    ctx.shadowOffsetY = size * 0.045;
  }

  lines.forEach((line, i) => {
    const y = top + i * lineH;
    if (st.anim === 'wordPop' || st.anim === 'karaoke') {
      drawWords(ctx, line, cx, y, size, st, a, lines.length, i);
    } else {
      strokeAndFill(ctx, line, cx, y, size, st);
    }
  });

  ctx.restore();
}

function strokeAndFill(ctx, line, x, y, size, st) {
  if (st.stroke && st.strokeWidth > 0) {
    ctx.lineWidth = size * st.strokeWidth;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeStyle = st.stroke;
    ctx.strokeText(line, x, y);
  }
  ctx.fillStyle = st.color;
  ctx.fillText(line, x, y);
}

/** Word-by-word reveal and karaoke share this path; they differ only in which
 *  words are visible and which one is highlighted. */
function drawWords(ctx, line, cx, y, size, st, a, lineCount, lineIndex) {
  const words = line.split(' ').filter(Boolean);
  if (!words.length) return;
  const space = ctx.measureText(' ').width;
  const widths = words.map((word) => ctx.measureText(word).width);
  const total = widths.reduce((s, v) => s + v, 0) + space * (words.length - 1);
  let x = st.align === 'left' ? cx : st.align === 'right' ? cx - total : cx - total / 2;

  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';

  const globalIndex = lineIndex * 100;   // keeps ordering stable across lines
  const shown = a.wordIndex === Infinity ? words.length
    : Math.ceil(a.wordIndex * words.length * lineCount) - lineIndex * words.length;
  const active = a.karaoke >= 0 ? Math.floor(a.karaoke * words.length * lineCount) - lineIndex * words.length : -1;

  words.forEach((word, i) => {
    if (a.wordIndex !== Infinity && i >= shown) { x += widths[i] + space; return; }
    const isActive = active === i;
    const saveColor = st.color;
    const colour = isActive && st.highlight ? st.highlight : saveColor;
    if (st.stroke && st.strokeWidth > 0) {
      ctx.lineWidth = size * st.strokeWidth;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = st.stroke;
      ctx.strokeText(word, x, y);
    }
    ctx.fillStyle = colour;
    ctx.fillText(word, x, y);
    void globalIndex;
    x += widths[i] + space;
  });

  ctx.textAlign = prevAlign;
}

function roundRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/* ------------------------------------------------------------------ */
/* title presets                                                       */
/* ------------------------------------------------------------------ */

export const TITLE_PRESETS = [
  { id: 'headline', name: 'Big headline', tier: 'free',
    text: { size: 0.085, weight: 800, anim: 'pop', uppercase: true, y: 0.5, letterSpacing: -0.02 } },
  { id: 'lower', name: 'Lower third', tier: 'free',
    text: { size: 0.042, weight: 700, anim: 'slideUp', align: 'left', x: 0.08, y: 0.82, stroke: null,
            box: 'rgba(0,0,0,.7)' } },
  { id: 'subtitle', name: 'Subtitle', tier: 'free',
    text: { size: 0.038, weight: 600, anim: 'fade', y: 0.88, stroke: null, shadow: true } },
  { id: 'hook', name: 'Hook (top)', tier: 'free',
    text: { size: 0.058, weight: 800, anim: 'wordPop', y: 0.2, strokeWidth: 0.16 } },
  { id: 'counter', name: 'List number', tier: 'free',
    text: { size: 0.12, weight: 800, anim: 'bounce', y: 0.28, content: '1' } },
  { id: 'quote', name: 'Quote', tier: 'creator',
    text: { size: 0.05, weight: 600, anim: 'typewriter', y: 0.5, stroke: null, shadow: true, maxWidth: 0.7 } },
  { id: 'glitchy', name: 'Glitch title', tier: 'creator',
    text: { size: 0.075, weight: 800, anim: 'shake', uppercase: true, color: '#00d1ff', stroke: '#7a5cff' } },
  { id: 'endcard', name: 'End card', tier: 'creator',
    text: { size: 0.06, weight: 800, anim: 'pop', y: 0.44, uppercase: true } },
];
