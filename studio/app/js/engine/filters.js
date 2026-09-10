/*
 * Colour.
 *
 * Two stages, because the browser gives us one of them for free:
 *
 *   1. Anything expressible as a CSS filter (exposure, contrast, saturation,
 *      blur, hue) goes into ctx.filter, which is GPU-accelerated. This is why
 *      grading stays real-time on a laptop.
 *   2. Everything else — temperature, tint, vignette, grain — is a composited
 *      pass over the clip's own scratch canvas afterwards.
 *
 * A "look" is just a bundle of stage-1 and stage-2 values, so a preset and a
 * hand-made grade are the same thing to the renderer and users can take any
 * preset apart.
 */

/* ------------------------------------------------------------------ */
/* looks                                                               */
/* ------------------------------------------------------------------ */
/* tier is what the licence check reads: 'free' looks are always available. */

export const LOOKS = [
  { id: 'none', name: 'None', tier: 'free', swatch: 'linear-gradient(135deg,#2a3550,#4a5878)', color: {} },

  { id: 'punch', name: 'Punch', tier: 'free', swatch: 'linear-gradient(135deg,#ff8a3d,#ffd166)',
    color: { contrast: 22, saturation: 18, exposure: 3 } },
  { id: 'cinematic', name: 'Teal & Orange', tier: 'free', swatch: 'linear-gradient(135deg,#0e6b7a,#ff9245)',
    color: { contrast: 16, saturation: 6, temperature: 12, shadows: -14, highlights: -6 },
    split: { shadow: '#0f5f7a', highlight: '#ff9a4d', amount: 0.3 } },
  { id: 'mono', name: 'Mono', tier: 'free', swatch: 'linear-gradient(135deg,#111,#e8e8e8)',
    color: { saturation: -100, contrast: 16 } },
  { id: 'warm', name: 'Golden hour', tier: 'free', swatch: 'linear-gradient(135deg,#ffb347,#ff7a59)',
    color: { temperature: 26, exposure: 4, saturation: 8, highlights: 6 } },
  { id: 'cool', name: 'Cold open', tier: 'free', swatch: 'linear-gradient(135deg,#4a7fd4,#9ecbff)',
    color: { temperature: -28, contrast: 10, saturation: -6 } },
  { id: 'fade', name: 'Faded film', tier: 'free', swatch: 'linear-gradient(135deg,#8f8a80,#d8cfc0)',
    color: { contrast: -14, saturation: -18, exposure: 6, shadows: 18, grain: 12 } },
  { id: 'noir', name: 'Noir', tier: 'free', swatch: 'linear-gradient(135deg,#000,#666)',
    color: { saturation: -100, contrast: 40, shadows: -22, vignette: 40 } },
  { id: 'vivid', name: 'Vivid', tier: 'free', swatch: 'linear-gradient(135deg,#ff2d95,#00d1ff)',
    color: { saturation: 34, contrast: 12 } },
  { id: 'soft', name: 'Soft skin', tier: 'free', swatch: 'linear-gradient(135deg,#ffd9c9,#ffb7a1)',
    color: { contrast: -8, saturation: 4, temperature: 8, highlights: -8, blur: 0.4 } },

  { id: 'kodak', name: 'Kodak 2383', tier: 'creator', swatch: 'linear-gradient(135deg,#1d4a3a,#f2b06a)',
    color: { contrast: 20, saturation: 10, temperature: 8, shadows: -12, highlights: -10 },
    split: { shadow: '#123f3a', highlight: '#ffcf94', amount: 0.34 } },
  { id: 'fuji', name: 'Fuji Eterna', tier: 'creator', swatch: 'linear-gradient(135deg,#4c6b62,#cfd7c4)',
    color: { contrast: -6, saturation: -12, temperature: -6, shadows: 12 },
    split: { shadow: '#3e5d55', highlight: '#e6e9d8', amount: 0.26 } },
  { id: 'bleach', name: 'Bleach bypass', tier: 'creator', swatch: 'linear-gradient(135deg,#6c7b7b,#e9eef0)',
    color: { saturation: -46, contrast: 34, exposure: 5 } },
  { id: 'vhs', name: 'VHS', tier: 'creator', swatch: 'linear-gradient(135deg,#7a2bd8,#2be0ff)',
    color: { saturation: 26, contrast: -6, grain: 30, blur: 0.7 },
    chroma: 2.4 },
  { id: 'neon', name: 'Neon night', tier: 'creator', swatch: 'linear-gradient(135deg,#ff2bd0,#2b6cff)',
    color: { saturation: 30, contrast: 24, temperature: -18, shadows: -18 },
    split: { shadow: '#2b1eff', highlight: '#ff2bd0', amount: 0.36 } },
  { id: 'sunburn', name: 'Sunburn', tier: 'creator', swatch: 'linear-gradient(135deg,#ff5e3a,#ffd93d)',
    color: { temperature: 40, saturation: 22, contrast: 14, vignette: 18 } },
  { id: 'moonlight', name: 'Moonlight', tier: 'creator', swatch: 'linear-gradient(135deg,#16233f,#7fa8d9)',
    color: { temperature: -40, exposure: -8, contrast: 18, saturation: -14, vignette: 26 } },
  { id: 'pastel', name: 'Pastel', tier: 'creator', swatch: 'linear-gradient(135deg,#ffc9de,#c9e4ff)',
    color: { saturation: -14, contrast: -12, exposure: 8, highlights: 10 } },
  { id: 'crush', name: 'Crushed blacks', tier: 'creator', swatch: 'linear-gradient(135deg,#000,#3a4a6a)',
    color: { shadows: -40, contrast: 26, saturation: 6 } },
  { id: 'infra', name: 'Infrared', tier: 'creator', swatch: 'linear-gradient(135deg,#ff3d7a,#ffe066)',
    color: { saturation: 40, contrast: 20 }, hue: 140 },
];

export const LOOK_BY_ID = Object.fromEntries(LOOKS.map((l) => [l.id, l]));

/** A look's values merged over the clip's own, scaled by strength. */
export function resolved(color) {
  const look = LOOK_BY_ID[color.look];
  if (!look || look.id === 'none') return { ...color, _look: null };
  const k = color.strength ?? 1;
  const out = { ...color };
  for (const [key, v] of Object.entries(look.color || {})) {
    out[key] = (out[key] || 0) + v * k;
  }
  return { ...out, _look: look, _strength: k };
}

/* ------------------------------------------------------------------ */
/* stage 1 — the CSS filter string                                     */
/* ------------------------------------------------------------------ */

/**
 * Values are in the −100..100 range users see, mapped onto the multipliers
 * CSS wants. The mapping is deliberately gentle: ±100 should look strong, not
 * destroyed, because a slider that ruins the shot at 40% is a slider people
 * stop using.
 */
export function cssFilter(c) {
  const parts = [];
  const brightness = 1 + (c.exposure || 0) / 160;
  const contrast = 1 + (c.contrast || 0) / 140;
  const saturate = 1 + (c.saturation || 0) / 100;

  if (Math.abs(brightness - 1) > 0.001) parts.push(`brightness(${brightness.toFixed(3)})`);
  if (Math.abs(contrast - 1) > 0.001) parts.push(`contrast(${contrast.toFixed(3)})`);
  if (Math.abs(saturate - 1) > 0.001) parts.push(`saturate(${Math.max(0, saturate).toFixed(3)})`);
  if (c._look?.hue) parts.push(`hue-rotate(${c._look.hue}deg)`);
  if (c.blur > 0.01) parts.push(`blur(${(c.blur).toFixed(2)}px)`);
  return parts.length ? parts.join(' ') : 'none';
}

/* ------------------------------------------------------------------ */
/* stage 2 — composited passes                                         */
/* ------------------------------------------------------------------ */

let grainTile = null;
function noiseTile() {
  if (grainTile) return grainTile;
  const size = 192;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    // Luminance noise only. Coloured noise reads as a broken sensor, not film.
    const v = 110 + (Math.random() * 90 - 45);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  grainTile = cv;
  return cv;
}

/** Kelvin-ish shift as a coloured overlay. Warm adds amber, cool adds blue. */
function tempColor(temperature, tint) {
  const t = (temperature || 0) / 100;
  const g = (tint || 0) / 100;
  const r = 128 + t * 74 - g * 20;
  const gr = 128 + g * 60;
  const b = 128 - t * 74 - g * 20;
  return `rgb(${Math.round(r)},${Math.round(gr)},${Math.round(b)})`;
}

/**
 * Applies everything CSS filters can't, in place, on a canvas holding just
 * this clip. Order matters: tone first, then colour, then texture, then the
 * vignette last so grain doesn't sit on top of the darkened corners.
 */
export function applyPasses(ctx, w, h, c) {
  const save = ctx.globalCompositeOperation;

  // highlights / shadows: lift or crush one end of the range
  if (Math.abs(c.shadows || 0) > 0.5) {
    const amt = Math.min(0.6, Math.abs(c.shadows) / 165);
    ctx.globalCompositeOperation = c.shadows > 0 ? 'lighten' : 'multiply';
    ctx.fillStyle = c.shadows > 0
      ? `rgba(255,255,255,${amt})`
      : `rgba(${Math.round(255 * (1 - amt))},${Math.round(255 * (1 - amt))},${Math.round(255 * (1 - amt))},1)`;
    ctx.fillRect(0, 0, w, h);
  }
  if (Math.abs(c.highlights || 0) > 0.5) {
    const amt = Math.min(0.55, Math.abs(c.highlights) / 175);
    ctx.globalCompositeOperation = c.highlights > 0 ? 'screen' : 'darken';
    const v = c.highlights > 0 ? Math.round(255 * amt) : Math.round(255 * (1 - amt));
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(0, 0, w, h);
  }

  // temperature / tint
  if (Math.abs(c.temperature || 0) > 0.5 || Math.abs(c.tint || 0) > 0.5) {
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = Math.min(0.85, (Math.abs(c.temperature || 0) + Math.abs(c.tint || 0)) / 90);
    ctx.fillStyle = tempColor(c.temperature, c.tint);
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  // split tone from a look (shadows one colour, highlights another)
  const split = c._look?.split;
  if (split) {
    const a = split.amount * (c._strength ?? 1);
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = a * 0.55;
    ctx.fillStyle = split.shadow;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = a * 0.45;
    ctx.fillStyle = split.highlight;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  // grain
  if ((c.grain || 0) > 0.5) {
    const tile = noiseTile();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = Math.min(0.5, c.grain / 190);
    const pat = ctx.createPattern(tile, 'repeat');
    // Move the tile every frame or the grain freezes and stops reading as film.
    ctx.save();
    ctx.translate(Math.random() * 192 | 0, Math.random() * 192 | 0);
    ctx.fillStyle = pat;
    ctx.fillRect(-192, -192, w + 384, h + 384);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // vignette
  if ((c.vignette || 0) > 0.5) {
    const amt = Math.min(0.9, c.vignette / 105);
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.28, w / 2, h / 2, Math.max(w, h) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${amt.toFixed(3)})`);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  ctx.globalCompositeOperation = save;
  ctx.globalAlpha = 1;
}

/** True when a clip's colour settings do anything at all — lets the renderer
 *  skip the whole scratch-canvas path for untouched clips. */
export function isIdentity(c) {
  if (c.look && c.look !== 'none') return false;
  return ['exposure', 'contrast', 'saturation', 'temperature', 'tint',
    'highlights', 'shadows', 'vignette', 'grain', 'blur'].every((k) => Math.abs(c[k] || 0) < 0.5);
}

/** Controls the colour panel draws, in the order a colourist works. */
export const CONTROLS = [
  { key: 'exposure',    label: 'Exposure',    min: -100, max: 100, level: 'intermediate' },
  { key: 'contrast',    label: 'Contrast',    min: -100, max: 100, level: 'intermediate' },
  { key: 'saturation',  label: 'Saturation',  min: -100, max: 100, level: 'intermediate' },
  { key: 'temperature', label: 'Temperature', min: -100, max: 100, level: 'intermediate' },
  { key: 'tint',        label: 'Tint',        min: -100, max: 100, level: 'expert' },
  { key: 'highlights',  label: 'Highlights',  min: -100, max: 100, level: 'expert' },
  { key: 'shadows',     label: 'Shadows',     min: -100, max: 100, level: 'expert' },
  { key: 'vignette',    label: 'Vignette',    min: 0,    max: 100, level: 'intermediate' },
  { key: 'grain',       label: 'Film grain',  min: 0,    max: 100, level: 'expert' },
  { key: 'blur',        label: 'Blur',        min: 0,    max: 12, step: 0.1, level: 'expert' },
];
