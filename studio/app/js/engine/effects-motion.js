/*
 * The motion-design effects.
 *
 * What this is for
 * ----------------
 * effects.js and effects-library.js are the finishing effects: what you put
 * on a shot to change how it looks. These are the compositor's effects — the
 * ones a motion designer reaches for to *make* something rather than treat
 * something: a noise field to build a background or a matte from, a
 * displacement to melt a title, an echo for a light trail, a stepped frame
 * rate for stop-motion, a sweep of light across a logo, a flare that rides on
 * a tracked point, a gradient to sit under type, a fill to recolour a shape,
 * a spectrum or a waveform drawn from the music, and particles. Every one of
 * them is on the short list of things people open After Effects for, and
 * none of them is in a phone editor.
 *
 * How it works
 * ------------
 * The same contract as every other effect: `{ name, group, tier, icon,
 * params, draw(ctx, w, h, params, context) }`, the pooled scratch canvases
 * from fx-utils.js, an early return at zero amount, and nothing random that
 * is not seeded from the frame time or the particle's own index — so the
 * preview and the export draw the same frame, always.
 *
 * Sizes are in fractions of the frame, never pixels, so a particle tuned on a
 * 640-wide preview is the same particle in the 1080p export.
 */

import { scratch, snapshot, noise01, clamp01, hexToRgba, pixels, blurred } from './fx-utils.js';

const out = {};
const add = (id, def) => { out[id] = def; };
const amt = (p, def = 50) => (p.amount ?? def) / 100;
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => { const u = clamp01(t); return u * u * (3 - 2 * u); };

/* ------------------------------------------------------------------ *
 * Noise
 *
 * Value noise on a lattice, three dimensions so it can evolve, summed over
 * octaves for the fractal look. The lattice values come from the same
 * sine hash every other effect uses, so nothing here is random twice.
 * ------------------------------------------------------------------ */

function lattice(x, y, z, seed) {
  return noise01(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 0.618);
}

function vnoise(x, y, z, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = smoothstep(x - xi), fy = smoothstep(y - yi), fz = smoothstep(z - zi);
  const c = (dx, dy, dz) => lattice(xi + dx, yi + dy, zi + dz, seed);
  const z0 = lerp(lerp(c(0, 0, 0), c(1, 0, 0), fx), lerp(c(0, 1, 0), c(1, 1, 0), fx), fy);
  const z1 = lerp(lerp(c(0, 0, 1), c(1, 0, 1), fx), lerp(c(0, 1, 1), c(1, 1, 1), fx), fy);
  return lerp(z0, z1, fz);
}

/** Fractal Brownian motion: octaves of value noise, each half the size and weight. */
function fbm(x, y, z, octaves, seed) {
  let a = 0.5, f = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += a * vnoise(x * f, y * f, z + o * 3.1, seed + o * 11);
    norm += a;
    a *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

/**
 * A coarse field of fbm values over the frame, as a Float32Array on a grid.
 * Coarse on purpose: noise has no detail finer than its smallest octave, so
 * a 160-wide grid interpolated up is the same picture as a per-pixel one at
 * a fortieth of the cost.
 */
function field(gw, gh, scale, z, octaves, seed, offsetX = 0, offsetY = 0) {
  const f = new Float32Array(gw * gh);
  const k = 1 / Math.max(1, scale);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      f[y * gw + x] = fbm((x + offsetX) * k, (y + offsetY) * k, z, octaves, seed);
    }
  }
  return f;
}

/** Bilinear read of a grid field at fractional coordinates. */
function sampleField(f, gw, gh, x, y) {
  const xx = Math.max(0, Math.min(gw - 1.001, x)), yy = Math.max(0, Math.min(gh - 1.001, y));
  const x0 = Math.floor(xx), y0 = Math.floor(yy), fx = xx - x0, fy = yy - y0;
  const i = y0 * gw + x0;
  return lerp(lerp(f[i], f[i + 1], fx), lerp(f[i + gw], f[i + gw + 1], fx), fy);
}

const BLEND = {
  replace: 'source-over', overlay: 'overlay', screen: 'screen', multiply: 'multiply', add: 'lighter',
  softLight: 'soft-light', lighten: 'lighten', normal: 'source-over', behind: 'destination-over',
};

/** Draw with a blend and an alpha, and put the context back exactly as it was. */
function composite(ctx, op, alpha, fn) {
  ctx.save();
  ctx.globalCompositeOperation = BLEND[op] || 'source-over';
  ctx.globalAlpha = clamp01(alpha);
  fn();
  ctx.restore();
}

function rgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255];
}

function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`;
}

/* ================================================================== *
 * Generate
 * ================================================================== */

add('fractalNoise', {
  name: 'Fractal noise', group: 'Generate', tier: 'creator', icon: '〰',
  params: {
    amount: { label: 'Amount', min: 0, max: 100, def: 60 },
    scale: { label: 'Scale', min: 10, max: 400, def: 120 },
    octaves: { label: 'Complexity', min: 1, max: 5, def: 3, step: 1 },
    speed: { label: 'Evolution', min: 0, max: 100, def: 30 },
    contrast: { label: 'Contrast', min: 0, max: 100, def: 55 },
    brightness: { label: 'Brightness', min: -100, max: 100, def: 0 },
    blend: { label: 'Blend', type: 'select', def: 'overlay',
      options: [['overlay', 'Overlay'], ['screen', 'Screen'], ['multiply', 'Multiply'], ['add', 'Add'], ['softLight', 'Soft light'], ['replace', 'Replace']] },
    colour: { label: 'Colour', type: 'colour', def: '#ffffff' },
    seed: { label: 'Seed', min: 1, max: 999, def: 7, step: 1 },
  },
  /*
   * Clouds, smoke, a grain plate, a matte to feather something through: the
   * generator every compositor keeps. The field is computed on a coarse grid
   * and drawn up with smoothing, which is exactly what a 160-cell noise is.
   */
  draw(ctx, w, h, p, { local = 0 }) {
    const a = amt(p, 60);
    if (a <= 0.005) return;
    const gw = Math.max(8, Math.min(200, Math.round(w / 6))), gh = Math.max(8, Math.round(gw * h / w));
    const scale = (p.scale ?? 120) / 900 * gw;
    const z = local * (p.speed ?? 30) / 40;
    const f = field(gw, gh, scale, z, Math.max(1, Math.round(p.octaves ?? 3)), p.seed ?? 7);
    const s = scratch(gw, gh, 3);
    const img = s.ctx.createImageData(gw, gh);
    const d = img.data;
    const c = rgb(p.colour);
    const con = 1 + (p.contrast ?? 55) / 25;        // 1..5
    const bri = (p.brightness ?? 0) / 100;
    for (let i = 0; i < f.length; i++) {
      let v = (f[i] - 0.5) * con + 0.5 + bri;
      v = clamp01(v);
      d[i * 4] = c[0] * v; d[i * 4 + 1] = c[1] * v; d[i * 4 + 2] = c[2] * v; d[i * 4 + 3] = 255;
    }
    s.ctx.putImageData(img, 0, 0);
    composite(ctx, p.blend || 'overlay', a, () => {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(s.canvas, 0, 0, gw, gh, 0, 0, w, h);
    });
  },
});

add('gradientRamp', {
  name: 'Gradient ramp', group: 'Generate', tier: 'creator', icon: '◩',
  params: {
    amount: { label: 'Opacity', min: 0, max: 100, def: 100 },
    shape: { label: 'Shape', type: 'select', def: 'linear', options: [['linear', 'Linear'], ['radial', 'Radial']] },
    angle: { label: 'Angle', min: -180, max: 180, def: 90 },
    start: { label: 'Start', min: 0, max: 100, def: 0 },
    end: { label: 'End', min: 0, max: 100, def: 100 },
    colourA: { label: 'From', type: 'colour', def: '#0b1020' },
    colourB: { label: 'To', type: 'colour', def: '#31d9a7' },
    scatter: { label: 'Scatter', min: 0, max: 100, def: 0 },
    blend: { label: 'Blend', type: 'select', def: 'replace',
      options: [['replace', 'Replace'], ['overlay', 'Overlay'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['softLight', 'Soft light'], ['behind', 'Behind']] },
  },
  /* The thing under every title card. Scatter dithers the ramp so an 8-bit export does not band. */
  draw(ctx, w, h, p, { local = 0 }) {
    const a = amt(p, 100);
    if (a <= 0.005) return;
    const cx = w / 2, cy = h / 2;
    const ang = ((p.angle ?? 90) * Math.PI) / 180;
    const len = Math.hypot(w, h) / 2;
    const s0 = (p.start ?? 0) / 100, s1 = (p.end ?? 100) / 100;
    let g;
    if (p.shape === 'radial') {
      g = ctx.createRadialGradient(cx, cy, len * s0, cx, cy, Math.max(len * s0 + 1, len * s1));
    } else {
      const dx = Math.cos(ang) * len, dy = Math.sin(ang) * len;
      g = ctx.createLinearGradient(cx - dx + dx * 2 * s0, cy - dy + dy * 2 * s0, cx - dx + dx * 2 * s1, cy - dy + dy * 2 * s1);
    }
    g.addColorStop(0, p.colourA || '#0b1020');
    g.addColorStop(1, p.colourB || '#31d9a7');
    composite(ctx, p.blend || 'replace', a, () => {
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const sc = (p.scatter ?? 0) / 100;
      if (sc > 0.01) {
        // Dither: a sprinkle of seeded speckle at low alpha breaks the bands.
        ctx.globalAlpha = clamp01(a) * sc * 0.35;
        ctx.fillStyle = '#ffffff';
        const n = Math.round(1800 * sc);
        for (let i = 0; i < n; i++) {
          ctx.fillRect(noise01(i * 3.7 + 1) * w, noise01(i * 5.3 + 2 + Math.floor(local * 30)) * h, 1.5, 1.5);
        }
      }
    });
  },
});

add('fill', {
  name: 'Fill', group: 'Generate', tier: 'creator', icon: '■',
  params: {
    amount: { label: 'Opacity', min: 0, max: 100, def: 100 },
    colour: { label: 'Colour', type: 'colour', def: '#31d9a7' },
    mode: { label: 'Mode', type: 'select', def: 'alpha',
      options: [['alpha', 'Keep the shape'], ['multiply', 'Multiply'], ['overlay', 'Overlay'], ['screen', 'Screen']] },
  },
  /* Recolour a title, a shape or a sticker in one move; "keep the shape" paints only where there is something. */
  draw(ctx, w, h, p) {
    const a = amt(p, 100);
    if (a <= 0.005) return;
    const op = p.mode === 'alpha' ? 'source-atop' : (BLEND[p.mode] || 'source-atop');
    ctx.save();
    ctx.globalCompositeOperation = op;
    ctx.globalAlpha = a;
    ctx.fillStyle = p.colour || '#31d9a7';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  },
});

add('lightSweep', {
  name: 'Light sweep', group: 'Light', tier: 'creator', icon: '⟋',
  params: {
    amount: { label: 'Intensity', min: 0, max: 100, def: 65 },
    period: { label: 'Every (s)', min: 0.3, max: 12, def: 2.6, step: 0.1 },
    width: { label: 'Width', min: 2, max: 60, def: 16 },
    angle: { label: 'Angle', min: -80, max: 80, def: 24 },
    softness: { label: 'Softness', min: 0, max: 100, def: 55 },
    colour: { label: 'Colour', type: 'colour', def: '#ffffff' },
    blend: { label: 'Blend', type: 'select', def: 'screen', options: [['screen', 'Screen'], ['add', 'Add'], ['overlay', 'Overlay'], ['alpha', 'Keep the shape']] },
    hold: { label: 'Pause between', min: 0, max: 90, def: 35 },
  },
  /*
   * The band of light that crosses a logo. It sweeps once per period and
   * rests between passes; "keep the shape" confines it to the layer's own
   * pixels, which is what makes it a logo sweep rather than a screen wipe.
   */
  draw(ctx, w, h, p, { local = 0 }) {
    const a = amt(p, 65);
    if (a <= 0.005) return;
    const period = Math.max(0.3, p.period ?? 2.6);
    const hold = (p.hold ?? 35) / 100;
    const phase = ((local % period) + period) % period / period;   // 0..1
    const travel = phase / (1 - hold * 0.9);                        // sweep in the first part, rest after
    if (travel > 1.15) return;
    const ang = ((p.angle ?? 24) * Math.PI) / 180;
    const band = (p.width ?? 16) / 100 * Math.max(w, h);
    const soft = (p.softness ?? 55) / 100;
    const reach = Math.hypot(w, h);
    const x = -band + (reach + band * 2) * Math.min(1.15, travel) - reach / 2 + w / 2;
    const op = p.blend === 'alpha' ? 'source-atop' : (BLEND[p.blend] || 'screen');
    ctx.save();
    ctx.globalCompositeOperation = op;
    ctx.globalAlpha = a;
    ctx.translate(w / 2, h / 2);
    ctx.rotate(ang);
    ctx.translate(-w / 2, -h / 2);
    const g = ctx.createLinearGradient(x - band / 2, 0, x + band / 2, 0);
    const c = p.colour || '#ffffff';
    g.addColorStop(0, hexToRgba(c, 0));
    g.addColorStop(0.5 - 0.45 * (1 - soft), hexToRgba(c, 1));
    g.addColorStop(0.5 + 0.45 * (1 - soft), hexToRgba(c, 1));
    g.addColorStop(1, hexToRgba(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - band, -reach, band * 2, reach * 3);
    ctx.restore();
  },
});

add('lensFlareTracked', {
  name: 'Lens flare (tracked)', group: 'Light', tier: 'creator', icon: '✺',
  params: {
    amount: { label: 'Intensity', min: 0, max: 100, def: 60 },
    x: { label: 'X', min: 0, max: 100, def: 68 },
    y: { label: 'Y', min: 0, max: 100, def: 30 },
    follow: { label: 'Follow', type: 'select', def: 'tracked', options: [['tracked', 'The tracked subject, if there is one'], ['fixed', 'Stay where put']] },
    size: { label: 'Size', min: 10, max: 200, def: 90 },
    ghosts: { label: 'Ghosts', min: 0, max: 10, def: 5, step: 1 },
    streak: { label: 'Streak', min: 0, max: 100, def: 45 },
    colour: { label: 'Colour', type: 'colour', def: '#ffd9a0' },
    flicker: { label: 'Flicker', min: 0, max: 100, def: 15 },
  },
  /*
   * A flare with the pieces a real lens makes: a hot core, a halo, ghosts
   * strung along the line through the frame's centre, and an anamorphic
   * streak. Given a tracked subject it rides on it, which is the difference
   * between a flare and a sticker of one.
   */
  draw(ctx, w, h, p, { local = 0, subjectOf, clip }) {
    const a = amt(p, 60);
    if (a <= 0.005) return;
    let px = (p.x ?? 68) / 100, py = (p.y ?? 30) / 100;
    if (p.follow !== 'fixed' && typeof subjectOf === 'function') {
      const s = subjectOf(clip);
      if (s && Number.isFinite(s.x)) { px = s.x; py = s.y; }
    }
    const cx = px * w, cy = py * h;
    const size = (p.size ?? 90) / 100 * Math.min(w, h) * 0.5;
    const flick = 1 - (p.flicker ?? 15) / 100 * 0.5 * (0.5 + 0.5 * Math.sin(local * 37.3) * Math.sin(local * 11.1));
    const c = p.colour || '#ffd9a0';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a * flick;
    // Core and halo.
    let g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size);
    g.addColorStop(0, hexToRgba('#ffffff', 0.95));
    g.addColorStop(0.08, hexToRgba(c, 0.8));
    g.addColorStop(0.35, hexToRgba(c, 0.18));
    g.addColorStop(1, hexToRgba(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(cx - size, cy - size, size * 2, size * 2);
    // Ghosts along the line through the centre, on the far side.
    const n = Math.round(p.ghosts ?? 5);
    const dx = w / 2 - cx, dy = h / 2 - cy;
    for (let i = 1; i <= n; i++) {
      const t = (i / (n + 1)) * 2.2;
      const gx = cx + dx * t, gy = cy + dy * t;
      const r = size * (0.12 + 0.22 * noise01(i * 7.7 + 3));
      const hue = i % 3 === 0 ? '#9fd8ff' : i % 3 === 1 ? c : '#c7ffd9';
      const gg = ctx.createRadialGradient(gx, gy, r * 0.6, gx, gy, r);
      gg.addColorStop(0, hexToRgba(hue, 0.02));
      gg.addColorStop(0.85, hexToRgba(hue, 0.22));
      gg.addColorStop(1, hexToRgba(hue, 0));
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(gx, gy, r, 0, Math.PI * 2); ctx.fill();
    }
    // Anamorphic streak.
    const st = (p.streak ?? 45) / 100;
    if (st > 0.01) {
      const len = w * (0.4 + st * 0.9);
      const sg = ctx.createLinearGradient(cx - len, cy, cx + len, cy);
      sg.addColorStop(0, hexToRgba('#7fd0ff', 0));
      sg.addColorStop(0.5, hexToRgba('#bfe6ff', 0.55 * st));
      sg.addColorStop(1, hexToRgba('#7fd0ff', 0));
      ctx.fillStyle = sg;
      const th = Math.max(1.5, size * 0.035);
      ctx.fillRect(cx - len, cy - th, len * 2, th * 2);
    }
    ctx.restore();
  },
});

/* ================================================================== *
 * Distort
 * ================================================================== */

add('turbulentDisplace', {
  name: 'Turbulent displace', group: 'Distort', tier: 'creator', icon: '≈',
  params: {
    amount: { label: 'Amount', min: 0, max: 100, def: 40 },
    scale: { label: 'Size', min: 10, max: 400, def: 110 },
    speed: { label: 'Evolution', min: 0, max: 100, def: 25 },
    complexity: { label: 'Complexity', min: 1, max: 4, def: 2, step: 1 },
    seed: { label: 'Seed', min: 1, max: 999, def: 3, step: 1 },
  },
  /*
   * Every pixel is pushed by a noise field: water, heat, a melting title.
   * The field is coarse and interpolated; the pixel walk runs at a capped
   * width, because a displacement has no detail finer than the field.
   */
  draw(ctx, w, h, p, { local = 0 }) {
    const a = amt(p, 40);
    if (a <= 0.005) return;
    const src = snapshot(ctx, w, h, 0);
    const gw = 48, gh = Math.max(8, Math.round(48 * h / w));
    const scale = (p.scale ?? 110) / 900 * gw;
    const z = local * (p.speed ?? 25) / 30;
    const oct = Math.max(1, Math.round(p.complexity ?? 2));
    const fx = field(gw, gh, scale, z, oct, p.seed ?? 3, 0, 0);
    const fy = field(gw, gh, scale, z + 17.3, oct, (p.seed ?? 3) + 101, 31, 47);
    const res = pixels(src, w, h, 720, (d, sw, sh) => {
      const copy = new Uint8ClampedArray(d);
      const reach = a * 0.12 * Math.max(sw, sh);
      const kx = gw / sw, ky = gh / sh;
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const ox = (sampleField(fx, gw, gh, x * kx, y * ky) - 0.5) * 2 * reach;
          const oy = (sampleField(fy, gw, gh, x * kx, y * ky) - 0.5) * 2 * reach;
          const sx = Math.max(0, Math.min(sw - 1, Math.round(x + ox)));
          const sy = Math.max(0, Math.min(sh - 1, Math.round(y + oy)));
          const i = (y * sw + x) * 4, j = (sy * sw + sx) * 4;
          d[i] = copy[j]; d[i + 1] = copy[j + 1]; d[i + 2] = copy[j + 2]; d[i + 3] = copy[j + 3];
        }
      }
    }, 1);
    if (!res) return;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(res, 0, 0, res.width, res.height, 0, 0, w, h);
  },
});

add('displacementMap', {
  name: 'Displacement map', group: 'Distort', tier: 'creator', icon: '⧉',
  params: {
    amount: { label: 'Amount', min: 0, max: 100, def: 35 },
    softness: { label: 'Map softness', min: 0, max: 100, def: 40 },
    direction: { label: 'Direction', type: 'select', def: 'both', options: [['both', 'Both'], ['horizontal', 'Horizontal'], ['vertical', 'Vertical']] },
    source: { label: 'Map from', type: 'select', def: 'luma', options: [['luma', 'Brightness'], ['edges', 'Edges']] },
  },
  /*
   * Displaced by its own picture: bright pushes one way, dark the other. A
   * softened map is glass and heat; a sharp one is a broken mirror. The map
   * is the frame blurred, read once per capped pixel.
   */
  draw(ctx, w, h, p, { local = 0 }) {
    const a = amt(p, 35);
    if (a <= 0.005) return;
    const src = snapshot(ctx, w, h, 0);
    const radius = 1 + (p.softness ?? 40) / 100 * 40;
    const map = blurred(src, w, h, radius, '', 2, 720);
    let md;
    try { md = map.getContext('2d').getImageData(0, 0, map.width, map.height).data; } catch { return; }
    const mw = map.width, mh = map.height;
    const edges = p.source === 'edges';
    const dirX = p.direction !== 'vertical' ? 1 : 0, dirY = p.direction !== 'horizontal' ? 1 : 0;
    void local;
    const res = pixels(src, w, h, 720, (d, sw, sh) => {
      const copy = new Uint8ClampedArray(d);
      const reach = a * 0.1 * Math.max(sw, sh);
      const kx = mw / sw, ky = mh / sh;
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const mi = (Math.min(mh - 1, Math.round(y * ky)) * mw + Math.min(mw - 1, Math.round(x * kx))) * 4;
          let v = (md[mi] * 0.299 + md[mi + 1] * 0.587 + md[mi + 2] * 0.114) / 255;
          if (edges) {
            const ni = (Math.min(mh - 1, Math.round(y * ky) + 1) * mw + Math.min(mw - 1, Math.round(x * kx) + 1)) * 4;
            const v2 = (md[ni] * 0.299 + md[ni + 1] * 0.587 + md[ni + 2] * 0.114) / 255;
            v = 0.5 + (v2 - v) * 3;
          }
          const o = (v - 0.5) * 2 * reach;
          const sx = Math.max(0, Math.min(sw - 1, Math.round(x + o * dirX)));
          const sy = Math.max(0, Math.min(sh - 1, Math.round(y + o * dirY)));
          const i = (y * sw + x) * 4, j = (sy * sw + sx) * 4;
          d[i] = copy[j]; d[i + 1] = copy[j + 1]; d[i + 2] = copy[j + 2]; d[i + 3] = copy[j + 3];
        }
      }
    }, 1);
    if (!res) return;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(res, 0, 0, res.width, res.height, 0, 0, w, h);
  },
});

/* ================================================================== *
 * Time
 * ================================================================== */

add('echo', {
  name: 'Echo', group: 'Time', tier: 'creator', icon: '⧖',
  params: {
    amount: { label: 'Intensity', min: 0, max: 100, def: 70 },
    echoes: { label: 'Echoes', min: 1, max: 8, def: 4, step: 1 },
    delay: { label: 'Delay (frames)', min: 1, max: 12, def: 2, step: 1 },
    decay: { label: 'Decay', min: 10, max: 100, def: 60 },
    operator: { label: 'Operator', type: 'select', def: 'screen',
      options: [['screen', 'Screen'], ['add', 'Add'], ['lighten', 'Maximum'], ['normal', 'Blend'], ['behind', 'Behind']] },
  },
  /*
   * Earlier frames stacked on this one: the light trail, the ghosting of a
   * fast move. The renderer hands back the clip at any moment; a layer with
   * no footage to re-render (a solid, an adjustment) echoes itself, which
   * with screen or add reads as a bloom rather than nothing.
   */
  draw(ctx, w, h, p, { local = 0, fps = 30, redrawClip }) {
    const a = amt(p, 70);
    if (a <= 0.005) return;
    const n = Math.max(1, Math.round(p.echoes ?? 4));
    const delay = Math.max(1, Math.round(p.delay ?? 2)) / (fps || 30);
    const decay = (p.decay ?? 60) / 100;
    const base = snapshot(ctx, w, h, 0);
    const op = p.operator || 'screen';
    const frames = [];
    for (let k = 1; k <= n; k++) {
      const t = local - k * delay;
      let f = null;
      if (typeof redrawClip === 'function' && t >= 0) { try { f = redrawClip(t); } catch { f = null; } }
      frames.push(f || base);
    }
    ctx.save();
    if (op === 'normal') {
      // Oldest first, the live frame on top at full strength.
      ctx.clearRect(0, 0, w, h);
      for (let k = n; k >= 1; k--) {
        ctx.globalAlpha = clamp01(a * Math.pow(decay, k));
        ctx.drawImage(frames[k - 1], 0, 0, w, h);
      }
      ctx.globalAlpha = 1;
      ctx.drawImage(base, 0, 0);
    } else {
      ctx.globalCompositeOperation = BLEND[op] || 'screen';
      for (let k = 1; k <= n; k++) {
        ctx.globalAlpha = clamp01(a * Math.pow(decay, k));
        ctx.drawImage(frames[k - 1], 0, 0, w, h);
      }
    }
    ctx.restore();
  },
});

add('posterizeTime', {
  name: 'Posterize time', group: 'Time', tier: 'creator', icon: '▯',
  /*
   * There is nothing to see in one frame.
   *
   * This holds the frame at a stepped rate, so at any single instant it is
   * the frame it was already going to draw — its chip previewed as an
   * untouched picture, which reads as an effect that does not work. Marked,
   * the chip shows the hold instead of pretending to show the effect.
   */
  motionOnly: 'Steps the frame rate — you see it when it plays',
  params: {
    amount: { label: 'Amount', min: 0, max: 100, def: 100 },
    rate: { label: 'Frames a second', min: 1, max: 30, def: 8, step: 1 },
  },
  /*
   * The clip shown at a stepped rate: stop-motion, the animated-on-twos
   * look, a strobe. The frame it holds is the one at the step, re-rendered,
   * so it is the real frame and not a smear of two. Amount blends the held
   * frame with the live one, so the look can be dialled in rather than
   * switched.
   */
  draw(ctx, w, h, p, { local = 0, redrawClip }) {
    const a = amt(p, 100);
    if (a <= 0.005 || typeof redrawClip !== 'function') return;
    const rate = Math.max(1, Math.round(p.rate ?? 8));
    const held = Math.floor(local * rate + 1e-6) / rate;
    if (Math.abs(held - local) < 1e-4) return;
    let f = null;
    try { f = redrawClip(held); } catch { f = null; }
    if (!f) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.drawImage(f, 0, 0, w, h);
    ctx.restore();
  },
});

/* ================================================================== *
 * Audio
 * ================================================================== */

/* The analysis gives 32 log bands; fold them to however many the effect shows. */
function bands(spectrum, n) {
  const src = spectrum && spectrum.length ? spectrum : null;
  const outB = new Float32Array(n);
  if (!src) return outB;
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i / n) * src.length), b = Math.max(a + 1, Math.floor(((i + 1) / n) * src.length));
    let m = 0;
    for (let k = a; k < b; k++) m = Math.max(m, src[k]);
    outB[i] = clamp01(m);
  }
  return outB;
}

add('audioSpectrum', {
  name: 'Audio spectrum', group: 'Audio', tier: 'creator', icon: '▥',
  params: {
    amount: { label: 'Height', min: 0, max: 100, def: 70 },
    bands: { label: 'Bands', min: 4, max: 32, def: 24, step: 1 },
    style: { label: 'Style', type: 'select', def: 'bars', options: [['bars', 'Bars'], ['mirror', 'Mirrored bars'], ['line', 'Line'], ['dots', 'Dots'], ['ring', 'Ring']] },
    x: { label: 'X', min: 0, max: 100, def: 50 },
    y: { label: 'Y', min: 0, max: 100, def: 86 },
    width: { label: 'Width', min: 10, max: 100, def: 80 },
    thickness: { label: 'Thickness', min: 5, max: 100, def: 60 },
    colourA: { label: 'Colour, low', type: 'colour', def: '#31d9a7' },
    colourB: { label: 'Colour, high', type: 'colour', def: '#ff5d6c' },
    glow: { label: 'Glow', min: 0, max: 100, def: 30 },
    floor: { label: 'Rest height', min: 0, max: 30, def: 4 },
  },
  /*
   * Drawn from the music's analysis, not a guess: the renderer hands the
   * 32-band spectrum at this frame. In silence the bars rest at a floor
   * rather than vanishing, so a visualiser on a quiet intro is still there.
   */
  draw(ctx, w, h, p, { spectrum }) {
    const a = amt(p, 70);
    if (a <= 0.005) return;
    const n = Math.max(4, Math.round(p.bands ?? 24));
    let spec = null;
    try { spec = typeof spectrum === 'function' ? spectrum() : null; } catch { spec = null; }
    const v = bands(spec, n);
    const floor = (p.floor ?? 4) / 100;
    const cx = (p.x ?? 50) / 100 * w, cy = (p.y ?? 86) / 100 * h;
    const span = (p.width ?? 80) / 100 * w;
    const maxH = a * h * 0.45;
    const thick = (p.thickness ?? 60) / 100;
    const style = p.style || 'bars';
    ctx.save();
    if ((p.glow ?? 30) > 0) { ctx.shadowColor = p.colourA || '#31d9a7'; ctx.shadowBlur = (p.glow ?? 30) / 100 * Math.min(w, h) * 0.04; }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (style === 'ring') {
      const r = span * 0.22;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
        const len = r * 0.15 + Math.max(floor, v[i]) * maxH * 0.8;
        ctx.strokeStyle = mix(p.colourA, p.colourB, i / (n - 1));
        ctx.lineWidth = Math.max(1.5, (Math.PI * 2 * r) / n * thick * 0.8);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
        ctx.lineTo(cx + Math.cos(ang) * (r + len), cy + Math.sin(ang) * (r + len));
        ctx.stroke();
      }
    } else if (style === 'line') {
      ctx.strokeStyle = mix(p.colourA, p.colourB, 0.5);
      ctx.lineWidth = Math.max(1.5, Math.min(w, h) * 0.006 * thick * 2);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = cx - span / 2 + (i / (n - 1)) * span;
        const y = cy - Math.max(floor, v[i]) * maxH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else {
      const slot = span / n, bw = Math.max(1, slot * thick);
      for (let i = 0; i < n; i++) {
        const x = cx - span / 2 + i * slot + (slot - bw) / 2;
        const hh = Math.max(floor, v[i]) * maxH;
        ctx.fillStyle = mix(p.colourA, p.colourB, Math.max(floor, v[i]));
        if (style === 'dots') {
          ctx.beginPath(); ctx.arc(x + bw / 2, cy - hh, bw / 2, 0, Math.PI * 2); ctx.fill();
        } else if (style === 'mirror') {
          ctx.fillRect(x, cy - hh / 2, bw, hh);
        } else {
          ctx.fillRect(x, cy - hh, bw, hh);
        }
      }
    }
    ctx.restore();
  },
});

add('audioWaveform', {
  name: 'Audio waveform', group: 'Audio', tier: 'creator', icon: '∿',
  params: {
    amount: { label: 'Height', min: 0, max: 100, def: 60 },
    seconds: { label: 'Window (s)', min: 0.1, max: 3, def: 1, step: 0.1 },
    points: { label: 'Detail', min: 32, max: 256, def: 128, step: 1 },
    style: { label: 'Style', type: 'select', def: 'line', options: [['line', 'Line'], ['filled', 'Filled'], ['bars', 'Bars'], ['ring', 'Ring']] },
    x: { label: 'X', min: 0, max: 100, def: 50 },
    y: { label: 'Y', min: 0, max: 100, def: 50 },
    width: { label: 'Width', min: 10, max: 100, def: 90 },
    thickness: { label: 'Thickness', min: 1, max: 20, def: 3 },
    colour: { label: 'Colour', type: 'colour', def: '#ffffff' },
    glow: { label: 'Glow', min: 0, max: 100, def: 25 },
  },
  /* The waveform around the playhead, from the analysis. At rest it is a flat line, so it is always there. */
  draw(ctx, w, h, p, { wave }) {
    const a = amt(p, 60);
    if (a <= 0.005) return;
    const n = Math.max(32, Math.round(p.points ?? 128));
    let s = null;
    try { s = typeof wave === 'function' ? wave(p.seconds ?? 1, n) : null; } catch { s = null; }
    const cx = (p.x ?? 50) / 100 * w, cy = (p.y ?? 50) / 100 * h;
    const span = (p.width ?? 90) / 100 * w;
    const amp = a * h * 0.3;
    const th = Math.max(1, (p.thickness ?? 3) / 1000 * Math.min(w, h) * 2);
    const val = (i) => (s && s.length === n ? Math.max(-1, Math.min(1, s[i])) : 0);
    ctx.save();
    if ((p.glow ?? 25) > 0) { ctx.shadowColor = p.colour || '#ffffff'; ctx.shadowBlur = (p.glow ?? 25) / 100 * Math.min(w, h) * 0.03; }
    ctx.strokeStyle = p.colour || '#ffffff';
    ctx.fillStyle = hexToRgba(p.colour || '#ffffff', 0.55);
    ctx.lineWidth = th;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const style = p.style || 'line';
    if (style === 'ring') {
      const r = span * 0.2;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const ang = (i / n) * Math.PI * 2;
        const rr = r + val(i % n) * amp * 0.5;
        const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    } else if (style === 'bars') {
      const slot = span / n;
      for (let i = 0; i < n; i++) {
        const x = cx - span / 2 + i * slot;
        const hh = Math.max(th, Math.abs(val(i)) * amp);
        ctx.fillRect(x, cy - hh / 2, Math.max(1, slot * 0.6), hh);
      }
    } else {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = cx - span / 2 + (i / (n - 1)) * span;
        const y = cy - val(i) * amp;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      if (style === 'filled') {
        ctx.lineTo(cx + span / 2, cy); ctx.lineTo(cx - span / 2, cy); ctx.closePath();
        ctx.fill();
      }
      ctx.stroke();
    }
    ctx.restore();
  },
});

/* ================================================================== *
 * Particles
 *
 * Stateless on purpose. Each particle is a closed-form function of its own
 * index and the frame time — born at index/rate, moved by its velocity,
 * gravity and wind for its age — so any frame can be drawn from nothing,
 * scrubbing backwards costs the same as forwards, and the export matches the
 * preview to the pixel. A simulation with memory can do none of those.
 * ================================================================== */

const PARTICLE_PARAMS = (over = {}) => ({
  amount: { label: 'Amount', min: 0, max: 100, def: 60 },
  rate: { label: 'Birth rate', min: 1, max: 400, def: 80, step: 1 },
  life: { label: 'Life (s)', min: 0.2, max: 8, def: 2.5, step: 0.1 },
  speed: { label: 'Speed', min: 0, max: 100, def: 30 },
  direction: { label: 'Direction', min: -180, max: 180, def: -90 },
  spread: { label: 'Spread', min: 0, max: 360, def: 40 },
  gravity: { label: 'Gravity', min: -100, max: 100, def: 10 },
  wind: { label: 'Wind', min: -100, max: 100, def: 0 },
  turbulence: { label: 'Turbulence', min: 0, max: 100, def: 20 },
  size: { label: 'Size', min: 1, max: 100, def: 12 },
  sizeVar: { label: 'Size variance', min: 0, max: 100, def: 50 },
  shape: { label: 'Shape', type: 'select', def: 'dot', options: [['dot', 'Dot'], ['spark', 'Spark'], ['square', 'Square'], ['star', 'Star'], ['ring', 'Ring'], ['streak', 'Streak']] },
  colourA: { label: 'Colour, born', type: 'colour', def: '#ffffff' },
  colourB: { label: 'Colour, dying', type: 'colour', def: '#ffb060' },
  fadeIn: { label: 'Fade in', min: 0, max: 100, def: 10 },
  fadeOut: { label: 'Fade out', min: 0, max: 100, def: 60 },
  emitter: { label: 'Emitter', type: 'select', def: 'point', options: [['point', 'Point'], ['line', 'Line across'], ['top', 'Top edge'], ['bottom', 'Bottom edge'], ['box', 'Whole frame']] },
  x: { label: 'X', min: 0, max: 100, def: 50 },
  y: { label: 'Y', min: 0, max: 100, def: 55 },
  preroll: { label: 'Pre-run (s)', min: 0, max: 5, def: 2 },
  blend: { label: 'Blend', type: 'select', def: 'add', options: [['add', 'Add'], ['screen', 'Screen'], ['normal', 'Normal']] },
  seed: { label: 'Seed', min: 1, max: 999, def: 7, step: 1 },
  ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, { ...PARTICLE_BASE[k], def: v }])),
});
const PARTICLE_BASE = {
  amount: { label: 'Amount', min: 0, max: 100 }, rate: { label: 'Birth rate', min: 1, max: 400, step: 1 }, life: { label: 'Life (s)', min: 0.2, max: 8, step: 0.1 },
  speed: { label: 'Speed', min: 0, max: 100 }, direction: { label: 'Direction', min: -180, max: 180 }, spread: { label: 'Spread', min: 0, max: 360 },
  gravity: { label: 'Gravity', min: -100, max: 100 }, wind: { label: 'Wind', min: -100, max: 100 }, turbulence: { label: 'Turbulence', min: 0, max: 100 },
  size: { label: 'Size', min: 1, max: 100 }, sizeVar: { label: 'Size variance', min: 0, max: 100 },
  shape: { label: 'Shape', type: 'select', options: [['dot', 'Dot'], ['spark', 'Spark'], ['square', 'Square'], ['star', 'Star'], ['ring', 'Ring'], ['streak', 'Streak']] },
  colourA: { label: 'Colour, born', type: 'colour' }, colourB: { label: 'Colour, dying', type: 'colour' },
  fadeIn: { label: 'Fade in', min: 0, max: 100 }, fadeOut: { label: 'Fade out', min: 0, max: 100 },
  emitter: { label: 'Emitter', type: 'select', options: [['point', 'Point'], ['line', 'Line across'], ['top', 'Top edge'], ['bottom', 'Bottom edge'], ['box', 'Whole frame']] },
  x: { label: 'X', min: 0, max: 100 }, y: { label: 'Y', min: 0, max: 100 }, preroll: { label: 'Pre-run (s)', min: 0, max: 5 },
  blend: { label: 'Blend', type: 'select', options: [['add', 'Add'], ['screen', 'Screen'], ['normal', 'Normal']] },
  seed: { label: 'Seed', min: 1, max: 999, step: 1 },
};

function drawParticle(ctx, shape, x, y, r, rot) {
  switch (shape) {
    case 'square':
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillRect(-r, -r, r * 2, r * 2); ctx.restore(); break;
    case 'spark':
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      ctx.beginPath(); ctx.moveTo(-r * 2.2, 0); ctx.lineTo(0, -r * 0.5); ctx.lineTo(r * 2.2, 0); ctx.lineTo(0, r * 0.5); ctx.closePath(); ctx.fill();
      ctx.restore(); break;
    case 'star': {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath();
      for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r; const a = (i / 10) * Math.PI * 2; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill(); ctx.restore(); break;
    }
    case 'ring':
      ctx.lineWidth = Math.max(1, r * 0.35); ctx.strokeStyle = ctx.fillStyle;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); break;
    case 'streak':
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillRect(-r * 0.25, -r * 3, r * 0.5, r * 6); ctx.restore(); break;
    default:
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
}

function drawParticles(ctx, w, h, p, { local = 0 }) {
  const a = amt(p, 60);
  if (a <= 0.005) return;
  const rate = Math.max(1, (p.rate ?? 80) * a);
  const life = Math.max(0.2, p.life ?? 2.5);
  const K = Math.min(w, h) / 1000;                     // frame-relative units
  const speed = (p.speed ?? 30) / 100 * 900 * K;        // px/s at full
  const g = (p.gravity ?? 10) / 100 * 1400 * K;
  const wind = (p.wind ?? 0) / 100 * 500 * K;
  const turb = (p.turbulence ?? 20) / 100;
  const dir = ((p.direction ?? -90) * Math.PI) / 180;
  const spread = ((p.spread ?? 40) * Math.PI) / 180;
  const size = (p.size ?? 12) * 1.4 * K;
  const sizeVar = (p.sizeVar ?? 50) / 100;
  const fadeIn = (p.fadeIn ?? 10) / 100, fadeOut = (p.fadeOut ?? 60) / 100;
  const seed = p.seed ?? 7;
  const now = local + (p.preroll ?? 2);
  const ex = (p.x ?? 50) / 100 * w, ey = (p.y ?? 55) / 100 * h;
  const shape = p.shape || 'dot';
  const first = Math.max(0, Math.floor((now - life) * rate)), last = Math.floor(now * rate);
  const cap = 2500;
  ctx.save();
  ctx.globalCompositeOperation = BLEND[p.blend || 'add'] || 'lighter';
  let drawn = 0;
  for (let k = first; k <= last && drawn < cap; k++) {
    const r = (n) => noise01(k * 7.13 + n * 3.71 + seed * 0.913);
    const birth = (k + r(0) * 0.9) / rate;
    const age = now - birth;
    if (age < 0 || age > life) continue;
    const u = age / life;
    let ox = ex, oy = ey;
    switch (p.emitter) {
      case 'line': ox = r(1) * w; break;
      case 'top': ox = r(1) * w; oy = -size * 2; break;
      case 'bottom': ox = r(1) * w; oy = h + size * 2; break;
      case 'box': ox = r(1) * w; oy = r(2) * h; break;
      default: break;
    }
    const ang = dir + (r(3) - 0.5) * spread;
    const v = speed * (0.55 + r(4) * 0.9);
    const tx = Math.sin(age * (1.7 + r(5) * 2.3) + k) * turb * 120 * K * Math.min(1, age);
    const ty = Math.cos(age * (1.3 + r(6) * 2.1) + k * 0.7) * turb * 90 * K * Math.min(1, age);
    const x = ox + Math.cos(ang) * v * age + wind * age + tx;
    const y = oy + Math.sin(ang) * v * age + 0.5 * g * age * age + ty;
    if (x < -size * 4 || x > w + size * 4 || y < -size * 4 || y > h + size * 4) continue;
    let alpha = 1;
    if (fadeIn > 0) alpha *= smoothstep(u / Math.max(0.01, fadeIn));
    if (fadeOut > 0) alpha *= smoothstep((1 - u) / Math.max(0.01, fadeOut));
    const rad = Math.max(0.6, size * (1 + (r(7) - 0.5) * 2 * sizeVar));
    ctx.globalAlpha = clamp01(alpha * (0.6 + 0.4 * a));
    ctx.fillStyle = mix(p.colourA || '#ffffff', p.colourB || '#ffb060', u);
    drawParticle(ctx, shape, x, y, rad, r(8) * Math.PI * 2 + age * (r(9) - 0.5) * 4);
    drawn++;
  }
  ctx.restore();
}

/* The emitter itself, and the worlds people ask for by name. Each preset is
   the same engine with its numbers set; the sliders stay open so a snow can
   be made heavier or a spark bluer. */
const PARTICLE_PRESETS = [
  ['particles', 'Particles', '✧', {}],
  ['particlesSnow', 'Snow', '❄', { rate: 60, life: 6, speed: 8, direction: 90, spread: 30, gravity: 4, wind: 8, turbulence: 35, size: 9, sizeVar: 70, shape: 'dot', colourA: '#ffffff', colourB: '#e8f4ff', fadeIn: 5, fadeOut: 20, emitter: 'top', blend: 'screen', preroll: 5 }],
  ['particlesRain', 'Rain', '☂', { rate: 320, life: 1.2, speed: 95, direction: 96, spread: 4, gravity: 60, wind: -6, turbulence: 0, size: 5, sizeVar: 30, shape: 'streak', colourA: '#dfefff', colourB: '#9fc4ff', fadeIn: 0, fadeOut: 10, emitter: 'top', blend: 'screen', preroll: 2 }],
  ['particlesSparks', 'Sparks', '✦', { rate: 140, life: 1.4, speed: 60, direction: -90, spread: 120, gravity: 55, wind: 0, turbulence: 10, size: 6, sizeVar: 60, shape: 'spark', colourA: '#fff3c0', colourB: '#ff7a1a', fadeIn: 0, fadeOut: 50, emitter: 'point', x: 50, y: 70, blend: 'add', preroll: 1.5 }],
  ['particlesEmbers', 'Embers', '🔥', { rate: 45, life: 4, speed: 14, direction: -90, spread: 50, gravity: -6, wind: 4, turbulence: 45, size: 7, sizeVar: 60, shape: 'dot', colourA: '#ffd070', colourB: '#ff3b1a', fadeIn: 15, fadeOut: 60, emitter: 'bottom', blend: 'add', preroll: 4 }],
  ['particlesConfetti', 'Confetti', '🎊', { rate: 90, life: 4.5, speed: 30, direction: -90, spread: 70, gravity: 18, wind: 3, turbulence: 40, size: 12, sizeVar: 40, shape: 'square', colourA: '#ff5d6c', colourB: '#31d9a7', fadeIn: 0, fadeOut: 15, emitter: 'top', blend: 'normal', preroll: 3 }],
  ['particlesDust', 'Dust', '·', { rate: 30, life: 8, speed: 3, direction: 0, spread: 360, gravity: 0, wind: 2, turbulence: 30, size: 4, sizeVar: 70, shape: 'dot', colourA: '#ffffff', colourB: '#ffffff', fadeIn: 30, fadeOut: 30, emitter: 'box', blend: 'screen', preroll: 5, amount: 45 }],
  ['particlesBokeh', 'Bokeh', '◌', { rate: 14, life: 7, speed: 4, direction: -90, spread: 360, gravity: 0, wind: 1, turbulence: 20, size: 60, sizeVar: 60, shape: 'ring', colourA: '#ffd9a0', colourB: '#a0c8ff', fadeIn: 40, fadeOut: 40, emitter: 'box', blend: 'screen', preroll: 5, amount: 40 }],
  ['particlesBubbles', 'Bubbles', '○', { rate: 25, life: 6, speed: 12, direction: -90, spread: 25, gravity: -8, wind: 0, turbulence: 50, size: 22, sizeVar: 70, shape: 'ring', colourA: '#dff6ff', colourB: '#ffffff', fadeIn: 10, fadeOut: 25, emitter: 'bottom', blend: 'screen', preroll: 4 }],
  ['particlesStars', 'Starfield', '✴', { rate: 40, life: 6, speed: 20, direction: 0, spread: 360, gravity: 0, wind: 0, turbulence: 0, size: 3, sizeVar: 60, shape: 'star', colourA: '#ffffff', colourB: '#ffffff', fadeIn: 30, fadeOut: 30, emitter: 'point', x: 50, y: 50, blend: 'add', preroll: 5, amount: 70 }],
];
for (const [id, name, icon, over] of PARTICLE_PRESETS) {
  add(id, { name, group: 'Particles', tier: 'creator', icon, params: PARTICLE_PARAMS(over), draw: drawParticles });
}

export const MOTION_EFFECTS = out;
