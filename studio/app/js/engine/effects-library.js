/*
 * The effects library.
 *
 * effects.js holds eighteen hand-written effects. This file is the other two
 * hundred, and like the transitions they are generated from families rather
 * than typed out one at a time — "blur left" and "blur up-right" are the same
 * function with a different vector, and a duotone is one function with a colour
 * pair. Writing each variant by hand means each is a separate place for the
 * maths to drift.
 *
 * Every entry is the same shape effects.js already uses:
 *
 *   { name, group, tier, icon, params, draw(ctx, w, h, params, context) }
 *
 * and obeys the same two rules that keep scrubbing smooth: no canvas is
 * allocated per frame (the pool in fx-utils.js is shared with effects.js), and
 * an effect at zero strength returns immediately.
 *
 * Anything that looks random is seeded from the frame time, never Math.random,
 * so the preview and the export agree. An effect that disagrees with its own
 * export is worse than no effect.
 */

import { scratch, snapshot, channel, noise, noise01, clamp01, hexToRgba, pixels, cellSize, edgeMap, blurred, stretch } from './fx-utils.js';

const out = {};
const add = (id, def) => { out[id] = def; };

/** Amount 0..100 -> 0..1, with the early-out every effect needs. */
const amt = (p, def = 50) => (p.amount ?? def) / 100;

/* Eight compass directions, shared by everything directional. */
const DIRS = [
  { id: 'Left', name: 'left', x: -1, y: 0 },
  { id: 'Right', name: 'right', x: 1, y: 0 },
  { id: 'Up', name: 'up', x: 0, y: -1 },
  { id: 'Down', name: 'down', x: 0, y: 1 },
  { id: 'UpLeft', name: 'up-left', x: -0.7071, y: -0.7071 },
  { id: 'UpRight', name: 'up-right', x: 0.7071, y: -0.7071 },
  { id: 'DownLeft', name: 'down-left', x: -0.7071, y: 0.7071 },
  { id: 'DownRight', name: 'down-right', x: 0.7071, y: 0.7071 },
];

/* ------------------------------------------------------------------ *
 * Blur and focus
 *
 * Canvas has one blur, and it is symmetrical. Everything with a direction to
 * it — a smear, a zoom, a spin — is built by stacking offset copies of the
 * frame, which is also how a real camera makes them: many moments, added up.
 * ------------------------------------------------------------------ */

/** Directional smear: copies of the frame marched along a vector. */
for (const d of DIRS) {
  add(`smear${d.id}`, {
    name: `Smear ${d.name}`, group: 'Blur', tier: 'free', icon: '⟿',
    params: { amount: { label: 'Length', min: 0, max: 100, def: 35 },
              samples: { label: 'Quality', min: 3, max: 24, def: 10, step: 1 } },
    draw(ctx, w, h, p) {
      const a = amt(p, 35);
      if (a <= 0.01) return;
      const n = Math.max(3, Math.round(p.samples ?? 10));
      const src = snapshot(ctx, w, h, 0);
      // Stacked at a capped size: the result is a smear, so there is no detail
      // in it that full resolution could carry, and this is a dozen full-frame
      // draws otherwise.
      const k = Math.min(1, 1100 / Math.max(w, h));
      const bw = Math.max(1, Math.round(w * k)), bh = Math.max(1, Math.round(h * k));
      const s = scratch(bw, bh, 1);
      const reach = Math.max(bw, bh) * 0.12 * a;
      // Each copy carries an equal share, so the stack sums to one frame's
      // worth of light rather than blowing out to white.
      s.ctx.globalAlpha = 1 / n;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        s.ctx.drawImage(src, d.x * reach * t, d.y * reach * t, bw, bh);
      }
      s.ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, w, h);
      stretch(ctx, s.canvas, w, h);
    },
  });
}

/** Blur that leaves one band sharp — the tilt-shift family. */
const BANDS = [
  { id: 'Centre', name: 'centre band', axis: 'y', pos: 0.5 },
  { id: 'Top', name: 'top sharp', axis: 'y', pos: 0.18 },
  { id: 'Bottom', name: 'bottom sharp', axis: 'y', pos: 0.82 },
  { id: 'Vertical', name: 'vertical band', axis: 'x', pos: 0.5 },
  { id: 'VLeft', name: 'left sharp', axis: 'x', pos: 0.18 },
  { id: 'VRight', name: 'right sharp', axis: 'x', pos: 0.82 },
];
for (const b of BANDS) {
  add(`tilt${b.id}`, {
    name: `Tilt shift — ${b.name}`, group: 'Blur', tier: 'free', icon: '◑',
    params: { amount: { label: 'Blur', min: 0, max: 100, def: 55 },
              width: { label: 'Sharp band', min: 5, max: 90, def: 28 } },
    draw(ctx, w, h, p) {
      const a = amt(p, 55);
      if (a <= 0.01) return;
      const src = snapshot(ctx, w, h, 0);
      const soft = blurred(src, w, h, a * 22, null, 1);

      // The blurred copy is masked in with a gradient, so the sharp band
      // fades into the blur instead of ending at a visible line.
      const along = b.axis === 'y' ? h : w;
      const band = (along * (p.width ?? 28)) / 100;
      const c = along * b.pos;
      const g = b.axis === 'y'
        ? ctx.createLinearGradient(0, 0, 0, h)
        : ctx.createLinearGradient(0, 0, w, 0);
      const stop = (v) => clamp01(v / along);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(stop(c - band), 'rgba(0,0,0,1)');
      g.addColorStop(stop(c - band * 0.5), 'rgba(0,0,0,0)');
      g.addColorStop(stop(c + band * 0.5), 'rgba(0,0,0,0)');
      g.addColorStop(stop(c + band), 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,1)');

      const m = scratch(w, h, 2);
      stretch(m.ctx, soft, w, h);
      m.ctx.globalCompositeOperation = 'destination-in';
      m.ctx.fillStyle = g;
      m.ctx.fillRect(0, 0, w, h);
      m.ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(m.canvas, 0, 0);
    },
  });
}

/** Spin blur, both directions, plus the soft/dream variants. */
add('spinBlur', {
  name: 'Spin blur', group: 'Blur', tier: 'free', icon: '↻',
  params: { amount: { label: 'Amount', min: 0, max: 100, def: 30 },
            samples: { label: 'Quality', min: 3, max: 24, def: 10, step: 1 } },
  draw(ctx, w, h, p) {
    const a = amt(p, 30);
    if (a <= 0.01) return;
    const n = Math.max(3, Math.round(p.samples ?? 10));
    const src = snapshot(ctx, w, h, 0);
    // Stacked at a capped size. The result is a blur — there is no detail in
    // it for the extra resolution to carry, and ten full-frame rotated draws
    // at 4K is most of a second.
    const k = Math.min(1, 1100 / Math.max(w, h));
    const bw = Math.max(1, Math.round(w * k)), bh = Math.max(1, Math.round(h * k));
    const s = scratch(bw, bh, 1);
    s.ctx.globalAlpha = 1 / n;
    for (let i = 0; i < n; i++) {
      s.ctx.save();
      s.ctx.translate(bw / 2, bh / 2);
      s.ctx.rotate((i / (n - 1) - 0.5) * a * 0.35);
      s.ctx.drawImage(src, -bw / 2, -bh / 2, bw, bh);
      s.ctx.restore();
    }
    s.ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, w, h);
    stretch(ctx, s.canvas, w, h);
  },
});

add('softFocus', {
  name: 'Soft focus', group: 'Blur', tier: 'free', icon: '◌',
  params: { amount: { label: 'Amount', min: 0, max: 100, def: 45 },
            radius: { label: 'Radius', min: 1, max: 40, def: 12 } },
  draw(ctx, w, h, p) {
    const a = amt(p, 45);
    if (a <= 0.01) return;
    const src = snapshot(ctx, w, h, 0);
    const s = blurred(src, w, h, p.radius ?? 12, null, 1);
    // Screened rather than averaged: highlights bloom into the shadows, which
    // is what a diffusion filter on the lens actually does.
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = a * 0.75;
    stretch(ctx, s, w, h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  },
});

add('dreamy', {
  name: 'Dreamy haze', group: 'Blur', tier: 'free', icon: '☁',
  params: { amount: { label: 'Amount', min: 0, max: 100, def: 50 } },
  draw(ctx, w, h, p) {
    const a = amt(p, 50);
    if (a <= 0.01) return;
    const src = snapshot(ctx, w, h, 0);
    const s = blurred(src, w, h, 6 + a * 20, 'saturate(1.3) brightness(1.1)', 1);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a * 0.5;
    stretch(ctx, s, w, h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  },
});

add('rackFocus', {
  name: 'Rack focus', group: 'Blur', tier: 'free', icon: '◉',
  params: { from: { label: 'Blur at start', min: 0, max: 100, def: 60 },
            to: { label: 'Blur at end', min: 0, max: 100, def: 0 },
            over: { label: 'Over (s)', min: 0.1, max: 6, def: 1, step: 0.05 } },
  draw(ctx, w, h, p, { local }) {
    const t = clamp01((local || 0) / (p.over ?? 1));
    const blur = ((p.from ?? 60) + ((p.to ?? 0) - (p.from ?? 60)) * t) / 100 * 26;
    if (blur <= 0.2) return;
    const src = snapshot(ctx, w, h, 0);
    ctx.clearRect(0, 0, w, h);
    stretch(ctx, blurred(src, w, h, blur, null, 1), w, h);
  },
});

add('bokehLights', {
  name: 'Bokeh lights', group: 'Blur', tier: 'creator', icon: '⚬',
  params: { amount: { label: 'Amount', min: 0, max: 100, def: 45 },
            count: { label: 'Count', min: 4, max: 60, def: 18, step: 1 },
            colour: { label: 'Colour', type: 'colour', def: '#ffe7b0' } },
  draw(ctx, w, h, p, { local }) {
    const a = amt(p, 45);
    if (a <= 0.01) return;
    const n = Math.round(p.count ?? 18);
    const t = local || 0;
    for (let i = 0; i < n; i++) {
      // Seeded per-light, so each keeps its own place and drifts slowly.
      const x = (noise01(i * 3.1) + t * 0.012 * noise(i * 7.7)) % 1 * w;
      const y = (noise01(i * 5.3) + t * 0.009 * noise(i * 2.9)) % 1 * h;
      const r = Math.max(w, h) * (0.012 + noise01(i * 11.3) * 0.045);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, hexToRgba(p.colour || '#ffe7b0', a * 0.55));
      g.addColorStop(0.7, hexToRgba(p.colour || '#ffe7b0', a * 0.18));
      g.addColorStop(1, hexToRgba(p.colour || '#ffe7b0', 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  },
});

/* ------------------------------------------------------------------ *
 * Distortion
 *
 * All of these bend the picture, and all of them do it by drawing the frame in
 * strips with each strip offset or scaled differently. Drawing one strip at a
 * time is the only way canvas can warp without going through pixels, and it is
 * roughly a hundred times faster than the pixel version at 1080p.
 *
 * The strips overlap by a pixel on purpose: adjacent strips at different
 * offsets leave hairline gaps otherwise, and a wave full of black seams reads
 * as a bug rather than an effect.
 * ------------------------------------------------------------------ */

/** Draw `src` in horizontal strips, with `offsetOf(row 0..1)` shifting each. */
function stripsH(ctx, src, w, h, step, offsetOf) {
  for (let y = 0; y < h; y += step) {
    const sh = Math.min(step, h - y);
    const dx = offsetOf((y + sh / 2) / h);
    ctx.drawImage(src, 0, y, w, sh, dx, y, w, sh + 1);
  }
}

/** The same, in vertical strips. */
function stripsV(ctx, src, w, h, step, offsetOf) {
  for (let x = 0; x < w; x += step) {
    const sw = Math.min(step, w - x);
    const dy = offsetOf((x + sw / 2) / w);
    ctx.drawImage(src, x, 0, sw, h, x, dy, sw + 1, h);
  }
}

const WAVES = [
  { id: 'Wave', name: 'Wave', axis: 'h', shape: (u) => Math.sin(u * Math.PI * 2) },
  { id: 'WaveV', name: 'Wave (vertical)', axis: 'v', shape: (u) => Math.sin(u * Math.PI * 2) },
  { id: 'Ripple', name: 'Ripple', axis: 'h', shape: (u) => Math.sin(u * Math.PI * 6) },
  { id: 'RippleV', name: 'Ripple (vertical)', axis: 'v', shape: (u) => Math.sin(u * Math.PI * 6) },
  { id: 'Zigzag', name: 'Zigzag', axis: 'h', shape: (u) => (Math.abs((u * 8) % 2 - 1) * 2 - 1) },
  { id: 'ZigzagV', name: 'Zigzag (vertical)', axis: 'v', shape: (u) => (Math.abs((u * 8) % 2 - 1) * 2 - 1) },
  { id: 'Flag', name: 'Flag', axis: 'h', shape: (u) => Math.sin(u * Math.PI * 3) * u },
  { id: 'Jelly', name: 'Jelly', axis: 'h', shape: (u) => Math.sin(u * Math.PI * 2) * (1 - u) },
];
for (const wv of WAVES) {
  add(`warp${wv.id}`, {
    name: wv.name, group: 'Distort', tier: 'free', icon: '∿',
    params: { amount: { label: 'Amount', min: 0, max: 100, def: 35 },
              speed: { label: 'Speed', min: 0, max: 100, def: 40 } },
    draw(ctx, w, h, p, { local }) {
      const a = amt(p, 35);
      if (a <= 0.01) return;
      const src = snapshot(ctx, w, h, 0);
      const phase = (local || 0) * ((p.speed ?? 40) / 100) * 2;
      const reach = (wv.axis === 'h' ? w : h) * 0.06 * a;
      ctx.clearRect(0, 0, w, h);
      const f = (u) => wv.shape(u + phase) * reach;
      if (wv.axis === 'h') stripsH(ctx, src, w, h, 2, f);
      else stripsV(ctx, src, w, h, 2, f);
    },
  });
}

/* Lens shapes. A bulge pushes the middle out, a pinch pulls it in, and both
 * are the same ring-by-ring redraw with the scale curve inverted. */
const LENSES = [
  { id: 'Bulge', name: 'Bulge', sign: 1, power: 2 },
  { id: 'Pinch', name: 'Pinch', sign: -1, power: 2 },
  { id: 'Fisheye', name: 'Fisheye', sign: 1, power: 1.2 },
  { id: 'Barrel', name: 'Barrel', sign: 1, power: 3 },
  { id: 'Tunnel', name: 'Tunnel', sign: -1, power: 1.2 },
];
for (const l of LENSES) {
  add(`lens${l.id}`, {
    name: l.name, group: 'Distort', tier: 'free', icon: '◎',
    params: { amount: { label: 'Amount', min: 0, max: 100, def: 40 } },
    draw(ctx, w, h, p) {
      const a = amt(p, 40) * l.sign;
      if (Math.abs(a) <= 0.01) return;
      const src = snapshot(ctx, w, h, 0);
      /*
       * Concentric rings, each scaled by a curve that is strongest at the
       * centre and one at the edge — so the frame still fills the frame.
       *
       * Every ring is a clipped full-frame draw, so the ring count times the
       * frame size is what this costs. The count rides the amount, because a
       * gentle bulge has nothing to band between rings and a strong one does;
       * the size is capped because twenty draws of a 4K frame is half a second
       * and the result is a warp, which nobody inspects for sharpness.
       */
      const rings = Math.round(12 + 22 * Math.abs(a));
      const sc = Math.min(1, 1400 / Math.max(w, h));
      const bw = Math.max(1, Math.round(w * sc)), bh = Math.max(1, Math.round(h * sc));
      const b = scratch(bw, bh, 1);
      for (let i = rings; i >= 1; i--) {
        const r = i / rings;
        const k = 1 + a * 0.55 * (1 - r ** l.power);
        const sw = bw / k, sh = bh / k;
        b.ctx.save();
        b.ctx.beginPath();
        b.ctx.ellipse(bw / 2, bh / 2, (bw / 2) * r, (bh / 2) * r, 0, 0, Math.PI * 2);
        b.ctx.clip();
        b.ctx.drawImage(src, (bw - sw) / 2, (bh - sh) / 2, sw, sh);
        b.ctx.restore();
      }
      ctx.clearRect(0, 0, w, h);
      stretch(ctx, b.canvas, w, h);
    },
  });
}

for (const dir of [{ id: 'CW', name: 'clockwise', s: 1 }, { id: 'CCW', name: 'anticlockwise', s: -1 }]) {
  add(`swirl${dir.id}`, {
    name: `Swirl ${dir.name}`, group: 'Distort', tier: 'free', icon: '🌀',
    params: { amount: { label: 'Amount', min: 0, max: 100, def: 40 },
              spin: { label: 'Spin over time', min: 0, max: 100, def: 0 } },
    draw(ctx, w, h, p, { local }) {
      const a = amt(p, 40);
      if (a <= 0.01) return;
      const src = snapshot(ctx, w, h, 0);
      const drift = ((p.spin ?? 0) / 100) * (local || 0) * 0.8;
      const rings = Math.round(12 + 20 * a);
      const sc = Math.min(1, 1400 / Math.max(w, h));
      const bw = Math.max(1, Math.round(w * sc)), bh = Math.max(1, Math.round(h * sc));
      const b = scratch(bw, bh, 1);
      for (let i = rings; i >= 1; i--) {
        const r = i / rings;
        b.ctx.save();
        b.ctx.beginPath();
        b.ctx.ellipse(bw / 2, bh / 2, (bw / 2) * r, (bh / 2) * r, 0, 0, Math.PI * 2);
        b.ctx.clip();
        b.ctx.translate(bw / 2, bh / 2);
        b.ctx.rotate(dir.s * (a * 1.6 * (1 - r) + drift));
        b.ctx.drawImage(src, -bw / 2, -bh / 2, bw, bh);
        b.ctx.restore();
      }
      ctx.clearRect(0, 0, w, h);
      stretch(ctx, b.canvas, w, h);
    },
  });
}

add('shearX', {
  name: 'Shear', group: 'Distort', tier: 'free', icon: '⧸',
  params: { amount: { label: 'Amount', min: -100, max: 100, def: 25 } },
  draw(ctx, w, h, p) {
    const a = (p.amount ?? 25) / 100;
    if (Math.abs(a) <= 0.01) return;
    const src = snapshot(ctx, w, h, 0);
    ctx.clearRect(0, 0, w, h);
    stripsH(ctx, src, w, h, 2, (u) => (u - 0.5) * w * 0.4 * a);
  },
});

add('stretchPull', {
  name: 'Stretch pull', group: 'Distort', tier: 'free', icon: '↔',
  params: { amount: { label: 'Amount', min: 0, max: 100, def: 40 },
            axis: { label: 'Axis', type: 'select', def: 'x',
                    options: [['x', 'Horizontal'], ['y', 'Vertical']] } },
  draw(ctx, w, h, p) {
    const a = amt(p, 40);
    if (a <= 0.01) return;
    const src = snapshot(ctx, w, h, 0);
    ctx.clearRect(0, 0, w, h);
    const k = 1 + a * 0.6;
    if ((p.axis || 'x') === 'x') ctx.drawImage(src, (w - w * k) / 2, 0, w * k, h);
    else ctx.drawImage(src, 0, (h - h * k) / 2, w, h * k);
  },
});

add('rollingShutter', {
  name: 'Rolling shutter', group: 'Distort', tier: 'free', icon: '▨',
  params: { amount: { label: 'Amount', min: 0, max: 100, def: 40 },
            speed: { label: 'Speed', min: 0, max: 100, def: 50 } },
  /* The skew a phone sensor puts on a fast pan, because it reads the frame one
   * row at a time and the world moves while it reads. Lean, not sinusoidal. */
  draw(ctx, w, h, p, { local }) {
    const a = amt(p, 40);
    if (a <= 0.01) return;
    const src = snapshot(ctx, w, h, 0);
    const wobble = Math.sin((local || 0) * ((p.speed ?? 50) / 100) * 9);
    ctx.clearRect(0, 0, w, h);
    stripsH(ctx, src, w, h, 2, (u) => u * w * 0.18 * a * wobble);
  },
});

add('dropFrameJitter', {
  name: 'Frame jitter', group: 'Distort', tier: 'free', icon: '⇅',
  params: { amount: { label: 'Amount', min: 0, max: 100, def: 35 },
            rate: { label: 'Rate', min: 1, max: 40, def: 12 } },
  draw(ctx, w, h, p, { local }) {
    const a = amt(p, 35);
    if (a <= 0.01) return;
    const tick = Math.floor((local || 0) * (p.rate ?? 12));
    const src = snapshot(ctx, w, h, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(src, noise(tick * 1.7) * w * 0.03 * a, noise(tick * 3.3) * h * 0.03 * a);
  },
});

/* ------------------------------------------------------------------ *
 * Colour
 *
 * The whole family runs through canvas filters and composite modes rather than
 * pixels, which means they cost about the same as drawing the frame twice and
 * can be stacked without the preview falling over.
 * ------------------------------------------------------------------ */

/* Duotone: shadows take one colour, highlights the other. The classic two-ink
 * print look, and the fastest way to make footage look deliberate. */
const DUOS = [
  ['Midnight', '#0b1d4d', '#ff9d5c'], ['Cyberpunk', '#12003d', '#00f0ff'],
  ['Ember', '#1a0500', '#ff6b2b'], ['Forest', '#07160e', '#9fe870'],
  ['Rose', '#2b0a1e', '#ffb3c9'], ['Steel', '#0d1418', '#a8c6d8'],
  ['Gold', '#1b1200', '#ffcf5c'], ['Violet', '#160030', '#c77dff'],
  ['Mint', '#04211c', '#8ff0d0'], ['Blood', '#170003', '#ff2d4a'],
  ['Sand', '#241c0d', '#f0d9a8'], ['Ice', '#001424', '#cdefff'],
  ['Ultraviolet', '#0a0020', '#ff00e1'], ['Sepia print', '#1c1206', '#e8c9a0'],
  ['Neon lime', '#05140a', '#c6ff00'], ['Deep sea', '#001a26', '#2ee6c8'],
];
for (const [name, dark, light] of DUOS) {
  add(`duo${name.replace(/[^a-zA-Z]/g, '')}`, {
    name: `Duotone — ${name}`, group: 'Colour', tier: 'free', icon: '◑',
    params: { amount: { label: 'Strength', min: 0, max: 100, def: 85 },
              contrast: { label: 'Contrast', min: 0, max: 100, def: 40 } },
    draw(ctx, w, h, p) {
      const a = amt(p, 85);
      if (a <= 0.01) return;
      const src = snapshot(ctx, w, h, 0);
      const s = scratch(w, h, 1);
      const k = 1 + ((p.contrast ?? 40) / 100) * 1.4;
      s.ctx.filter = `grayscale(1) contrast(${k.toFixed(2)})`;
      s.ctx.drawImage(src, 0, 0);
      s.ctx.filter = 'none';
      // Light ink multiplied over the grey, dark ink screened under it: the
      // two meet in the midtones instead of fighting over them.
      s.ctx.globalCompositeOperation = 'multiply';
      s.ctx.fillStyle = light;
      s.ctx.fillRect(0, 0, w, h);
      s.ctx.globalCompositeOperation = 'screen';
      s.ctx.fillStyle = dark;
      s.ctx.fillRect(0, 0, w, h);
      s.ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = a;
      ctx.drawImage(s.canvas, 0, 0);
      ctx.globalAlpha = 1;
    },
  });
}

/* Gradient maps: luminance becomes a position along a ramp of three colours. */
const RAMPS = [
  ['Sunset', ['#1a0033', '#ff5f6d', '#ffc371']],
  ['Vapour', ['#241b4d', '#f65fa0', '#7ee8fa']],
  ['Toxic', ['#06130a', '#3fa34d', '#eaff6b']],
  ['Inferno', ['#000004', '#bb3754', '#fcffa4']],
  ['Arctic', ['#02131f', '#3d7ea6', '#e8f8ff']],
  ['Copper', ['#1a0b02', '#a85a2b', '#ffd9a0']],
  ['Bruise', ['#0e0014', '#6a1b9a', '#ff8ac4']],
  ['Matrix', ['#000500', '#0f7f2e', '#c8ffcf']],
];
for (const [name, stops] of RAMPS) {
  add(`ramp${name}`, {
    name: `Gradient map — ${name}`, group: 'Colour', tier: 'creator', icon: '▥',
    params: { amount: { label: 'Strength', min: 0, max: 100, def: 80 } },
    draw(ctx, w, h, p) {
      const a = amt(p, 80);
      if (a <= 0.01) return;
      const src = snapshot(ctx, w, h, 0);
      // A 256×1 lookup strip is built once per draw and read per pixel, which
      // keeps the ramp interpolation out of the inner loop.
      const lut = scratch(256, 1, 3);
      const g = lut.ctx.createLinearGradient(0, 0, 256, 0);
      stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
      lut.ctx.fillStyle = g;
      lut.ctx.fillRect(0, 0, 256, 1);
      let table;
      try { table = lut.ctx.getImageData(0, 0, 256, 1).data; } catch { return; }

      const mapped = pixels(src, w, h, 900, (d) => {
        for (let i = 0; i < d.length; i += 4) {
          const l = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
          const o = l * 4;
          d[i] = table[o]; d[i + 1] = table[o + 1]; d[i + 2] = table[o + 2];
        }
      }, 1);
      if (!mapped) return;
      ctx.globalAlpha = a;
      ctx.drawImage(mapped, 0, 0, mapped.width, mapped.height, 0, 0, w, h);
      ctx.globalAlpha = 1;
    },
  });
}

/* Channel swaps. Cheap, instantly recognisable, and the only way to get some
 * colour casts without grading for ten minutes. */
const SWAPS = [
  ['RGBtoGBR', 'Shift R→G→B', [1, 2, 0]],
  ['RGBtoBRG', 'Shift B→R→G', [2, 0, 1]],
  ['SwapRB', 'Swap red and blue', [2, 1, 0]],
  ['SwapRG', 'Swap red and green', [1, 0, 2]],
  ['SwapGB', 'Swap green and blue', [0, 2, 1]],
];
for (const [id, name, order] of SWAPS) {
  add(`chan${id}`, {
    name, group: 'Colour', tier: 'free', icon: '⇄',
    params: { amount: { label: 'Strength', min: 0, max: 100, def: 100 } },
    draw(ctx, w, h, p) {
      const a = amt(p, 100);
      if (a <= 0.01) return;
      const src = snapshot(ctx, w, h, 0);
      const done = pixels(src, w, h, 1400, (d) => {
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2];
          const c = [r, g, b];
          d[i] = c[order[0]]; d[i + 1] = c[order[1]]; d[i + 2] = c[order[2]];
        }
      }, 1);
      if (!done) return;
      ctx.globalAlpha = a;
      ctx.drawImage(done, 0, 0, done.width, done.height, 0, 0, w, h);
      ctx.globalAlpha = 1;
    },
  });
}

/* Isolate one colour and drain the rest — the "red coat" shot. */
const ISOLATES = [
  ['Red', 0, 15], ['Orange', 30, 25], ['Yellow', 55, 22], ['Green', 120, 40],
  ['Cyan', 180, 30], ['Blue', 220, 40], ['Purple', 280, 35], ['Pink', 330, 28],
];
for (const [name, hue, tol] of ISOLATES) {
  add(`isolate${name}`, {
    name: `Isolate ${name.toLowerCase()}`, group: 'Colour', tier: 'creator', icon: '◉',
    params: { amount: { label: 'Drain the rest', min: 0, max: 100, def: 90 },
              width: { label: 'Range', min: 5, max: 90, def: tol } },
    draw(ctx, w, h, p) {
      const a = amt(p, 90);
      if (a <= 0.01) return;
      const src = snapshot(ctx, w, h, 0);
      const range = p.width ?? tol;
      const done = pixels(src, w, h, 1100, (d) => {
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          const c = max - min;
          let hh = 0;
          if (c > 0.001) {
            if (max === r) hh = ((g - b) / c) % 6;
            else if (max === g) hh = (b - r) / c + 2;
            else hh = (r - g) / c + 4;
            hh *= 60;
            if (hh < 0) hh += 360;
          }
          let diff = Math.abs(hh - hue);
          if (diff > 180) diff = 360 - diff;
          // Saturation matters as much as hue: a near-grey pixel has a hue,
          // but keeping it in colour is what makes these look like a mistake.
          const keep = c < 0.12 ? 0 : clamp01(1 - (diff - range) / Math.max(1, range * 0.6));
          const drain = a * (1 - keep);
          if (drain > 0.001) {
            const l = r * 0.299 * 255 + g * 0.587 * 255 + b * 0.114 * 255;
            d[i] += (l - d[i]) * drain;
            d[i + 1] += (l - d[i + 1]) * drain;
            d[i + 2] += (l - d[i + 2]) * drain;
          }
        }
      }, 1);
      if (!done) return;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(done, 0, 0, done.width, done.height, 0, 0, w, h);
    },
  });
}

/* One-line CSS-filter looks. Each is a real, different transform of the frame
 * rather than a preset name over the same numbers. */
const FILTERS = [
  ['negative', 'Negative', 'invert(1)', 'free'],
  ['solarise', 'Solarise', 'invert(0.75) contrast(1.6) saturate(1.4)', 'free'],
  ['thermal', 'Thermal', 'grayscale(1) sepia(1) hue-rotate(-40deg) saturate(7) contrast(1.5)', 'free'],
  ['nightVision', 'Night vision', 'grayscale(1) sepia(1) hue-rotate(50deg) saturate(6) brightness(1.25) contrast(1.4)', 'free'],
  ['xray', 'X-ray', 'invert(1) grayscale(1) contrast(1.9) brightness(0.9)', 'free'],
  ['infrared', 'Infrared', 'sepia(1) hue-rotate(300deg) saturate(4.5) contrast(1.3)', 'creator'],
  ['bleachBypass', 'Bleach bypass', 'saturate(0.4) contrast(1.55) brightness(1.06)', 'free'],
  ['crossProcess', 'Cross process', 'sepia(0.35) saturate(1.9) hue-rotate(-12deg) contrast(1.25)', 'free'],
  ['technicolor', 'Technicolor', 'saturate(2.2) contrast(1.3) hue-rotate(-6deg)', 'free'],
  ['washedOut', 'Washed out', 'saturate(0.55) brightness(1.18) contrast(0.82)', 'free'],
  ['deepFried', 'Deep fried', 'saturate(3.4) contrast(2.4) brightness(1.15)', 'free'],
  ['moonlight', 'Moonlight', 'brightness(0.72) saturate(0.75) hue-rotate(190deg) contrast(1.15)', 'free'],
  ['goldenHour', 'Golden hour', 'sepia(0.28) saturate(1.45) brightness(1.08) hue-rotate(-8deg)', 'free'],
  ['blueprint', 'Blueprint', 'grayscale(1) invert(1) sepia(1) hue-rotate(180deg) saturate(5) contrast(1.4)', 'creator'],
  ['acid', 'Acid', 'hue-rotate(90deg) saturate(3) contrast(1.4)', 'free'],
  ['faded', 'Faded film', 'saturate(0.7) brightness(1.12) contrast(0.88) sepia(0.18)', 'free'],
];
for (const [id, name, filter, tier] of FILTERS) {
  add(id, {
    name, group: 'Colour', tier, icon: '◐',
    params: { amount: { label: 'Strength', min: 0, max: 100, def: 100 } },
    draw(ctx, w, h, p) {
      const a = amt(p, 100);
      if (a <= 0.01) return;
      const src = snapshot(ctx, w, h, 0);
      const s = scratch(w, h, 1);
      s.ctx.filter = filter;
      s.ctx.drawImage(src, 0, 0);
      s.ctx.filter = 'none';
      // Cross-faded against the original, so the slider is a real dial rather
      // than an on/off switch with ninety-nine wasted positions.
      ctx.globalAlpha = a;
      ctx.drawImage(s.canvas, 0, 0);
      ctx.globalAlpha = 1;
    },
  });
}

/* Hue rotations, because "shift everything 90 degrees" is a request. */
for (const deg of [30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]) {
  add(`hue${deg}`, {
    name: `Hue shift ${deg}°`, group: 'Colour', tier: 'free', icon: '🎨',
    params: { amount: { label: 'Strength', min: 0, max: 100, def: 100 } },
    draw(ctx, w, h, p) {
      const a = amt(p, 100);
      if (a <= 0.01) return;
      const src = snapshot(ctx, w, h, 0);
      const s = scratch(w, h, 1);
      s.ctx.filter = `hue-rotate(${deg}deg)`;
      s.ctx.drawImage(src, 0, 0);
      s.ctx.filter = 'none';
      ctx.globalAlpha = a;
      ctx.drawImage(s.canvas, 0, 0);
      ctx.globalAlpha = 1;
    },
  });
}

/* ------------------------------------------------------------------ *
 * Retro and analogue
 *
 * Every one of these is a specific broken machine, not a generic "old" filter.
 * The difference between VHS and 8mm is not strength — it is that one is a
 * tape with tracking errors and chroma bleed and the other is film with grain,
 * gate weave and a flickering lamp. Naming them honestly is the point.
 * ------------------------------------------------------------------ */

/**
 * Horizontal scanlines, as one patterned fill.
 *
 * A loop of `h / gap` one-pixel rectangles is a thousand draw calls on a 4K
 * frame to produce something a single repeating tile draws in one — and the
 * loop version costs more than everything else in a tape effect put together.
 */
function scanlines(ctx, w, h, alpha, gap) {
  if (alpha <= 0.003) return;
  const step = Math.max(2, Math.round(gap));
  const tile = scratch(1, step, 7);
  tile.ctx.fillStyle = '#000';
  tile.ctx.fillRect(0, 0, 1, Math.max(1, Math.floor(step / 2)));
  const pattern = ctx.createPattern(tile.canvas, 'repeat');
  if (!pattern) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
}

/*
 * Grain, as a tiled noise texture.
 *
 * The obvious way — one small fill per speck — is one fill per grain, and at
 * 1080p a realistic amount of grain is sixty-odd thousand of them per frame.
 * That measured as the single most expensive thing in the library, and it was
 * paying it to draw noise.
 *
 * A tile of real noise, generated once and repeated, costs one fill. It is
 * also closer to what film does: grain is a property of the stock, uniform
 * across the frame, not a scattering of dots that happen to land differently.
 * The tile is offset by a seeded amount each frame so it still crawls rather
 * than sitting still — grain that holds still reads as dirt on the lens.
 */
const grainTiles = new Map();
function grainTile(size) {
  const key = Math.max(1, Math.round(size));
  if (grainTiles.has(key)) return grainTiles.get(key);
  const T = 96;
  const c = Object.assign(document.createElement('canvas'), { width: T, height: T });
  const x = c.getContext('2d');
  const img = x.createImageData(T, T);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const cell = Math.floor((i / 4) % T / key) + Math.floor(Math.floor(i / 4 / T) / key) * T;
    const v = noise01(cell * 0.7391) * 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  grainTiles.set(key, c);
  return c;
}

function grain(ctx, w, h, strength, seed, size = 1) {
  if (strength <= 0.005) return;
  const tile = grainTile(size);
  const pattern = ctx.createPattern(tile, 'repeat');
  if (!pattern) return;
  // Shifted by whole pixels each frame, so the texture moves without ever
  // resampling itself into mush.
  const dx = Math.round(noise01(seed) * tile.width);
  const dy = Math.round(noise01(seed + 17) * tile.height);
  pattern.setTransform(new DOMMatrix().translate(dx, dy));
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = Math.min(1, strength * 0.55);
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

add('filmGrain', {
  name: 'Film grain', group: 'Retro', tier: 'free', icon: '▒',
  params: { amount: { label: 'Amount', min: 0, max: 100, def: 35 },
            size: { label: 'Grain size', min: 1, max: 6, def: 1, step: 1 } },
  draw(ctx, w, h, p, { local, fps }) {
    const a = amt(p, 35);
    // Reseeded every frame: grain that holds still reads as dirt on the lens.
    grain(ctx, w, h, a, Math.floor((local || 0) * (fps || 30)) * 13.7 + 1, p.size ?? 1);
  },
});

add('dustScratches', {
  name: 'Dust and scratches', group: 'Retro', tier: 'free', icon: '⁄',
  params: { amount: { label: 'Amount', min: 0, max: 100, def: 40 },
            rate: { label: 'How often', min: 1, max: 30, def: 10 } },
  draw(ctx, w, h, p, { local }) {
    const a = amt(p, 40);
    if (a <= 0.01) return;
    const tick = Math.floor((local || 0) * (p.rate ?? 10));
    ctx.save();
    // A couple of vertical scratches that persist for a few frames, plus
    // specks that do not — which is how real print damage behaves.
    const scratches = Math.round(1 + a * 3);
    for (let i = 0; i < scratches; i++) {
      const life = Math.floor(tick / (2 + Math.floor(noise01(i * 5.5) * 6)));
      const x = noise01(life * 7.3 + i * 11.1) * w;
      ctx.fillStyle = noise(life + i) > 0 ? `rgba(255,255,255,${0.3 * a})` : `rgba(0,0,0,${0.35 * a})`;
      ctx.fillRect(x, 0, Math.max(1, w * 0.0012), h);
    }
    const specks = Math.round(a * 24);
    for (let i = 0; i < specks; i++) {
      const x = noise01(tick * 3.1 + i * 1.9) * w;
      const y = noise01(tick * 4.7 + i * 2.3) * h;
      const r = 1 + noise01(i * 8.8) * 2.5;
      ctx.fillStyle = `rgba(20,16,12,${0.5 * a})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  },
});

add('gateWeave', {
  name: 'Gate weave', group: 'Retro', tier: 'free', icon: '⇕',
  params: { amount: { label: 'Amount', min: 0, max: 100, def: 30 } },
  /* Film does not sit perfectly still in the gate. A hair of drift is most of
   * why projected footage reads as film and a locked-off digital frame does not. */
  draw(ctx, w, h, p, { local, fps }) {
    const a = amt(p, 30);
    if (a <= 0.01) return;
    const f = Math.floor((local || 0) * (fps || 30));
    const src = snapshot(ctx, w, h, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(src, noise(f * 0.7) * w * 0.004 * a, noise(f * 1.9 + 50) * h * 0.006 * a,
      w * (1 + 0.006 * a), h * (1 + 0.006 * a));
  },
});

add('projectorFlicker', {
  name: 'Projector flicker', group: 'Retro', tier: 'free', icon: '☀',
  params: { amount: { label: 'Amount', min: 0, max: 100, def: 35 },
            rate: { label: 'Rate', min: 2, max: 30, def: 14 } },
  draw(ctx, w, h, p, { local }) {
    const a = amt(p, 35);
    if (a <= 0.01) return;
    const f = Math.floor((local || 0) * (p.rate ?? 14));
    const swing = noise(f * 2.3) * a * 0.28;
    if (swing > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,248,230,${swing.toFixed(3)})`;
    } else {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgba(0,0,0,${(-swing).toFixed(3)})`;
    }
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  },
});

add('filmBurn', {
  name: 'Film burn', group: 'Retro', tier: 'creator', icon: '🔥',
  params: { amount: { label: 'Amount', min: 0, max: 100, def: 60 },
            at: { label: 'At (s)', min: 0, max: 30, def: 0, step: 0.05 },
            length: { label: 'Length (s)', min: 0.1, max: 3, def: 0.6, step: 0.05 } },
  draw(ctx, w, h, p, { local }) {
    const a = amt(p, 60);
    const t = (local || 0) - (p.at ?? 0);
    const len = p.length ?? 0.6;
    if (a <= 0.01 || t < 0 || t > len) return;
    const k = t / len;
    // Grows from one corner, peaks, then clears — a frame of stock catching.
    const bloom = Math.sin(k * Math.PI);
    const r = Math.max(w, h) * (0.1 + k * 1.3);
    const g = ctx.createRadialGradient(w * 0.85, h * 0.15, 0, w * 0.85, h * 0.15, r);
    g.addColorStop(0, `rgba(255,255,240,${(a * bloom).toFixed(3)})`);
    g.addColorStop(0.35, `rgba(255,170,60,${(a * bloom * 0.8).toFixed(3)})`);
    g.addColorStop(0.7, `rgba(180,50,10,${(a * bloom * 0.35).toFixed(3)})`);
    g.addColorStop(1, 'rgba(120,20,0,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  },
});

/* The tape family. Same machine, four states of repair. */
const TAPES = [
  { id: 'vhs', name: 'VHS', bleed: 1, tear: 0.4, jitter: 0.5, soft: 1.4 },
  { id: 'vhsWorn', name: 'VHS — worn tape', bleed: 1.6, tear: 1, jitter: 1, soft: 2.2 },
  { id: 'betamax', name: 'Betamax', bleed: 0.7, tear: 0.2, jitter: 0.3, soft: 1 },
  { id: 'camcorder', name: 'Camcorder 1994', bleed: 1.2, tear: 0.15, jitter: 0.35, soft: 1.1 },
];
for (const tp of TAPES) {
  add(tp.id, {
    name: tp.name, group: 'Retro', tier: 'free', icon: '📼',
    params: { amount: { label: 'Amount', min: 0, max: 100, def: 55 } },
    draw(ctx, w, h, p, { local, fps }) {
      const a = amt(p, 55);
      if (a <= 0.01) return;
      const f = Math.floor((local || 0) * (fps || 30));
      const src = snapshot(ctx, w, h, 0);

      // Chroma bleeds sideways on tape while luma stays put — that smeared
      // red edge is the single most recognisable thing about the format.
      // The softening and the chroma bleed both run at a capped size: tape has
      // less resolution than the frame it is pretending to be, which is the
      // whole point of the effect, so nothing is lost and it costs a fraction.
      const soft = blurred(src, w, h, a * tp.soft * 2, `saturate(${(1 + a * 0.5).toFixed(2)})`, 1, 700);
      ctx.clearRect(0, 0, w, h);
      stretch(ctx, soft, w, h);
      const shift = w * 0.004 * a * tp.bleed;
      const small = scratch(soft.width, soft.height, 2);
      small.ctx.drawImage(src, 0, 0, soft.width, soft.height);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5 * a;
      const rc = channel(small.canvas, soft.width, soft.height, 'r', 3);
      ctx.drawImage(rc, 0, 0, rc.width, rc.height, shift, 0, w, h);
      const bc = channel(small.canvas, soft.width, soft.height, 'b', 4);
      ctx.drawImage(bc, 0, 0, bc.width, bc.height, -shift, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // Tracking errors: a few rows that lost sync and slid sideways.
      const tears = Math.round(a * 4 * tp.tear);
      for (let i = 0; i < tears; i++) {
        const y = noise01(f * 1.7 + i * 9.1) * h;
        const bandH = h * (0.01 + noise01(f + i * 3.3) * 0.03);
        const dx = noise(f * 2.9 + i * 5.5) * w * 0.08 * a;
        ctx.drawImage(ctx.canvas, 0, y, w, bandH, dx, y, w, bandH);
      }

      // Head-switching noise along the bottom edge, always there on a real deck.
      ctx.fillStyle = `rgba(200,200,210,${(0.12 * a).toFixed(3)})`;
      ctx.fillRect(0, h - h * 0.018, w, h * 0.018);
      grain(ctx, w, h, a * 0.35, f * 7.1 + 3, 1);

      // Scanlines last, over everything, because the tube is the last thing
      // the picture passes through. Drawn as one patterned fill: a loop of
      // hundreds of one-pixel rectangles costs far more than the line it draws.
      scanlines(ctx, w, h, a * 0.22, 3);
      void tp.jitter;
    },
  });
}

/* Film stocks. Grain size and colour bias are what separate them. */
const STOCKS = [
  { id: 'super8', name: 'Super 8', filter: 'sepia(0.3) saturate(1.35) contrast(1.15) brightness(1.05)', g: 0.55, size: 2 },
  { id: 'mm8', name: '8mm', filter: 'sepia(0.45) saturate(0.9) contrast(1.25)', g: 0.7, size: 3 },
  { id: 'mm16', name: '16mm', filter: 'saturate(1.15) contrast(1.12)', g: 0.4, size: 2 },
  { id: 'mm35', name: '35mm', filter: 'saturate(1.08) contrast(1.06)', g: 0.22, size: 1 },
  { id: 'kodachrome', name: 'Kodachrome', filter: 'saturate(1.5) contrast(1.2) hue-rotate(-6deg)', g: 0.25, size: 1 },
  { id: 'polaroidStock', name: 'Polaroid', filter: 'sepia(0.22) saturate(1.1) brightness(1.12) contrast(0.9)', g: 0.35, size: 2 },
];
for (const st of STOCKS) {
  add(st.id, {
    name: st.name, group: 'Retro', tier: 'free', icon: '🎞',
    params: { amount: { label: 'Amount', min: 0, max: 100, def: 70 },
              grain: { label: 'Grain', min: 0, max: 100, def: Math.round(st.g * 100) } },
    draw(ctx, w, h, p, { local, fps }) {
      const a = amt(p, 70);
      if (a <= 0.01) return;
      const src = snapshot(ctx, w, h, 0);
      const s = scratch(w, h, 1);
      s.ctx.filter = st.filter;
      s.ctx.drawImage(src, 0, 0);
      s.ctx.filter = 'none';
      ctx.globalAlpha = a;
      ctx.drawImage(s.canvas, 0, 0);
      ctx.globalAlpha = 1;
      grain(ctx, w, h, ((p.grain ?? st.g * 100) / 100) * a, Math.floor((local || 0) * (fps || 30)) * 3.7 + 9, st.size);
    },
  });
}

add('crtTube', {
  name: 'CRT tube', group: 'Retro', tier: 'free', icon: '📺',
  params: { amount: { label: 'Amount', min: 0, max: 100, def: 55 },
            gap: { label: 'Line spacing', min: 2, max: 12, def: 3, step: 1 } },
  draw(ctx, w, h, p) {
    const a = amt(p, 55);
    if (a <= 0.01) return;
    const gap = Math.max(2, Math.round(p.gap ?? 3));
    // Vertical phosphor stripes as well as horizontal lines — a shadow mask is
    // a grid, and only doing the rows is what makes most "CRT" filters read as
    // blinds instead of a screen. Both drawn as one tiled fill each.
    scanlines(ctx, w, h, a * 0.4, gap);
    const stripe = scratch(gap, 1, 8);
    stripe.ctx.fillStyle = '#000';
    stripe.ctx.fillRect(0, 0, 1, 1);
    const cols = ctx.createPattern(stripe.canvas, 'repeat');
    if (cols) {
      ctx.globalAlpha = a * 0.14;
      ctx.fillStyle = cols;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.28, w / 2, h / 2, Math.max(w, h) * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${(a * 0.72).toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  },
});

add('tvStatic', {
  name: 'TV static', group: 'Retro', tier: 'free', icon: '▓',
  params: { amount: { label: 'Amount', min: 0, max: 100, def: 30 } },
  draw(ctx, w, h, p, { local, fps }) {
    const a = amt(p, 30);
    if (a <= 0.01) return;
    const f = Math.floor((local || 0) * (fps || 30));
    // Built at a coarse size and scaled up: full-resolution static is a wall
    // of grey once it hits a display, and costs ten times as much to draw.
    const sw = 160, sh = Math.max(1, Math.round(160 * h / w));
    const s = scratch(sw, sh, 1);
    const img = s.ctx.createImageData(sw, sh);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = noise01(f * 0.137 + i * 0.0007) * 255;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    s.ctx.putImageData(img, 0, 0);
    ctx.globalAlpha = a * 0.5;
    ctx.globalCompositeOperation = 'overlay';
    ctx.drawImage(s.canvas, 0, 0, sw, sh, 0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  },
});

/* ------------------------------------------------------------------ *
 * Glitch
 *
 * Digital failure, which looks nothing like analogue failure: blocks, not
 * smears; hard edges, not bleeding. Everything here is seeded from the frame
 * number so a glitch lands on the same frame every time it is played — a
 * glitch that moves between preview and export is unusable for cutting to.
 * ------------------------------------------------------------------ */

const GLITCHES = [
  { id: 'blockGlitch', name: 'Block glitch', blocks: 10, tall: 0.06, reach: 0.12, rgb: 0.4 },
  { id: 'heavyGlitch', name: 'Heavy glitch', blocks: 24, tall: 0.1, reach: 0.28, rgb: 1 },
  { id: 'microGlitch', name: 'Micro glitch', blocks: 6, tall: 0.015, reach: 0.05, rgb: 0.2 },
  { id: 'signalLoss', name: 'Signal loss', blocks: 16, tall: 0.14, reach: 0.45, rgb: 0.7 },
];
for (const gl of GLITCHES) {
  add(gl.id, {
    name: gl.name, group: 'Glitch', tier: 'free', icon: '⚡',
    params: { amount: { label: 'Amount', min: 0, max: 100, def: 45 },
              rate: { label: 'How often', min: 1, max: 30, def: 8 },
              hold: { label: 'Hold', min: 0, max: 100, def: 30 } },
    draw(ctx, w, h, p, { local, fps }) {
      const a = amt(p, 45);
      if (a <= 0.01) return;
      const rate = p.rate ?? 8;
      const phase = ((local || 0) * rate) % 1;
      // `hold` is the fraction of each beat the glitch is actually on. At zero
      // it is a single frame and at a hundred it never stops, which are the
      // two things people ask for and nothing in between is wasted.
      if (phase > 0.08 + ((p.hold ?? 30) / 100) * 0.9) return;
      const tick = Math.floor((local || 0) * rate);
      const src = snapshot(ctx, w, h, 0);

      const n = Math.round(gl.blocks * a);
      for (let i = 0; i < n; i++) {
        const y = noise01(tick * 3.7 + i * 1.31) * h;
        const bh = Math.max(2, h * gl.tall * (0.3 + noise01(tick + i * 2.7)));
        const dx = noise(tick * 5.1 + i * 7.3) * w * gl.reach * a;
        ctx.drawImage(src, 0, y, w, bh, dx, y, w, bh);
      }

      if (gl.rgb > 0) {
        const shift = w * 0.01 * a * gl.rgb;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.4;
        ctx.drawImage(channel(src, w, h, 'r', 1), shift, 0);
        ctx.drawImage(channel(src, w, h, 'b', 2), -shift, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      void fps;
    },
  });
}

add('datamosh', {
  name: 'Datamosh', group: 'Glitch', tier: 'creator', icon: '≋',
  params: { amount: { label: 'Amount', min: 0, max: 100, def: 50 },
            blocks: { label: 'Block size', min: 8, max: 120, def: 36 } },
  /* What a video codec does when it loses its keyframe: the blocks keep
   * applying motion from the wrong picture. Faked here by moving each block a
   * little in a direction it keeps — which is exactly what the artefact is. */
  draw(ctx, w, h, p, { local }) {
    const a = amt(p, 50);
    if (a <= 0.01) return;
    const size = Math.max(8, p.blocks ?? 36);
    const src = snapshot(ctx, w, h, 0);
    const t = local || 0;
    for (let y = 0; y < h; y += size) {
      for (let x = 0; x < w; x += size) {
        const seed = (x * 73 + y * 151) * 0.0013;
        const dx = noise(seed) * size * a * 1.2 * (0.4 + Math.sin(t * 1.7 + seed * 9) * 0.6);
        const dy = noise(seed + 41) * size * a * 0.8;
        const bw = Math.min(size, w - x), bh = Math.min(size, h - y);
        ctx.drawImage(src, x, y, bw, bh, x + dx, y + dy, bw, bh);
      }
    }
  },
});

add('pixelSort', {
  name: 'Pixel sort', group: 'Glitch', tier: 'creator', icon: '⇉',
  params: { amount: { label: 'Amount', min: 0, max: 100, def: 45 },
            threshold: { label: 'Threshold', min: 0, max: 100, def: 55 } },
  draw(ctx, w, h, p) {
    const a = amt(p, 45);
    if (a <= 0.01) return;
    const src = snapshot(ctx, w, h, 0);
    const cut = ((p.threshold ?? 55) / 100) * 255;
    const done = pixels(src, w, h, 800, (d, sw, sh) => {
      // Rows are sorted only across runs brighter than the threshold, which is
      // what gives the effect its streaks instead of turning every row into a
      // smooth gradient.
      for (let y = 0; y < sh; y++) {
        let start = -1;
        for (let x = 0; x <= sw; x++) {
          const i = (y * sw + x) * 4;
          const lum = x < sw ? d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114 : -1;
          if (lum > cut && start < 0) start = x;
          else if ((lum <= cut || x === sw) && start >= 0) {
            const run = [];
            for (let k = start; k < x; k++) {
              const j = (y * sw + k) * 4;
              run.push([d[j], d[j + 1], d[j + 2], d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114]);
            }
            run.sort((m, n) => m[3] - n[3]);
            for (let k = 0; k < run.length; k++) {
              const j = (y * sw + start + k) * 4;
              d[j] = run[k][0]; d[j + 1] = run[k][1]; d[j + 2] = run[k][2];
            }
            start = -1;
          }
        }
      }
    }, 1);
    if (!done) return;
    ctx.globalAlpha = a;
    ctx.drawImage(done, 0, 0, done.width, done.height, 0, 0, w, h);
    ctx.globalAlpha = 1;
  },
});

for (const q of [{ id: 'Light', name: 'light', size: 8 }, { id: 'Heavy', name: 'heavy', size: 22 }]) {
  add(`compression${q.id}`, {
    name: `Compression artefacts — ${q.name}`, group: 'Glitch', tier: 'free', icon: '▩',
    params: { amount: { label: 'Amount', min: 0, max: 100, def: 55 } },
    /* Macroblocking: a codec at too low a bitrate quantises each 8×8 block to
     * its average, so flat areas band and edges go chunky. Downscaling with
     * smoothing off and scaling back up is that, near enough to fool an eye. */
    draw(ctx, w, h, p) {
      const a = amt(p, 55);
      if (a <= 0.01) return;
      const src = snapshot(ctx, w, h, 0);
      const size = q.size * (0.4 + a);
      const sw = Math.max(1, Math.round(w / size)), sh = Math.max(1, Math.round(h / size));
      const s = scratch(sw, sh, 1);
      s.ctx.drawImage(src, 0, 0, sw, sh);
      ctx.globalAlpha = a;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(s.canvas, 0, 0, sw, sh, 0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = 1;
    },
  });
}

for (const ax of [{ id: 'H', name: 'horizontal', h: true }, { id: 'V', name: 'vertical', h: false }]) {
  add(`sliceShift${ax.id}`, {
    name: `Slice shift — ${ax.name}`, group: 'Glitch', tier: 'free', icon: '⋯',
    params: { amount: { label: 'Amount', min: 0, max: 100, def: 40 },
              slices: { label: 'Slices', min: 2, max: 60, def: 14, step: 1 },
              speed: { label: 'Speed', min: 0, max: 100, def: 40 } },
    draw(ctx, w, h, p, { local }) {
      const a = amt(p, 40);
      if (a <= 0.01) return;
      const n = Math.max(2, Math.round(p.slices ?? 14));
      const tick = Math.floor((local || 0) * ((p.speed ?? 40) / 100) * 20);
      const src = snapshot(ctx, w, h, 0);
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < n; i++) {
        const off = noise(tick * 1.7 + i * 3.1) * (ax.h ? w : h) * 0.15 * a;
        if (ax.h) {
          const y = (i * h) / n, bh = h / n + 1;
          ctx.drawImage(src, 0, y, w, bh, off, y, w, bh);
        } else {
          const x = (i * w) / n, bw = w / n + 1;
          ctx.drawImage(src, x, 0, bw, h, x, off, bw, h);
        }
      }
    },
  });
}

add('ghostEcho', {
  name: 'Ghost echo', group: 'Glitch', tier: 'free', icon: '👻',
  params: { amount: { label: 'Amount', min: 0, max: 100, def: 40 },
            count: { label: 'Echoes', min: 1, max: 8, def: 3, step: 1 },
            spread: { label: 'Spread', min: 0, max: 100, def: 40 } },
  draw(ctx, w, h, p) {
    const a = amt(p, 40);
    if (a <= 0.01) return;
    const n = Math.max(1, Math.round(p.count ?? 3));
    const src = snapshot(ctx, w, h, 0);
    const reach = w * 0.06 * ((p.spread ?? 40) / 100);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i <= n; i++) {
      ctx.globalAlpha = (a * 0.5) / i;
      ctx.drawImage(src, reach * i, 0);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  },
});

/* ------------------------------------------------------------------ *
 * Light
 *
 * Leaks, flares, rays and vignettes. All additive except the vignettes, which
 * is why they stack so well — you can put a leak, a flare and a haze on one
 * clip and they behave like three lights rather than three filters fighting.
 * ------------------------------------------------------------------ */

const LEAK_SPOTS = [
  { id: 'TL', name: 'top left', x: 0.05, y: 0.05 }, { id: 'TR', name: 'top right', x: 0.95, y: 0.05 },
  { id: 'BL', name: 'bottom left', x: 0.05, y: 0.95 }, { id: 'BR', name: 'bottom right', x: 0.95, y: 0.95 },
  { id: 'L', name: 'left edge', x: -0.05, y: 0.5 }, { id: 'R', name: 'right edge', x: 1.05, y: 0.5 },
  { id: 'T', name: 'top edge', x: 0.5, y: -0.05 }, { id: 'B', name: 'bottom edge', x: 0.5, y: 1.05 },
];
const LEAK_COLOURS = [
  ['Warm', '#ff9b4d'], ['Crimson', '#ff3b5c'], ['Gold', '#ffd36b'],
  ['Teal', '#4de0d0'], ['Violet', '#b06bff'], ['White', '#ffffff'],
];
for (const spot of LEAK_SPOTS) {
  for (const [cname, colour] of LEAK_COLOURS) {
    add(`leak${spot.id}${cname}`, {
      name: `Light leak — ${cname.toLowerCase()}, ${spot.name}`, group: 'Light', tier: 'free', icon: '☀',
      params: { amount: { label: 'Strength', min: 0, max: 100, def: 45 },
                size: { label: 'Size', min: 10, max: 150, def: 70 },
                drift: { label: 'Drift', min: 0, max: 100, def: 20 } },
      draw(ctx, w, h, p, { local }) {
        const a = amt(p, 45);
        if (a <= 0.01) return;
        const t = local || 0;
        const wob = Math.sin(t * 0.9) * ((p.drift ?? 20) / 100) * 0.06;
        const cx = (spot.x + wob) * w;
        const cy = (spot.y + wob * 0.6) * h;
        const r = Math.max(w, h) * ((p.size ?? 70) / 100);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, hexToRgba(colour, a * 0.85));
        g.addColorStop(0.45, hexToRgba(colour, a * 0.3));
        g.addColorStop(1, hexToRgba(colour, 0));
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
      },
    });
  }
}

const FLARES = [
  { id: 'Anamorphic', name: 'Anamorphic streak', streak: 1, star: 0, ring: 0, colour: '#7fc4ff' },
  { id: 'Star', name: 'Star flare', streak: 0.3, star: 1, ring: 0, colour: '#ffffff' },
  { id: 'Ring', name: 'Ring flare', streak: 0.2, star: 0, ring: 1, colour: '#ffd9a0' },
  { id: 'Sun', name: 'Sun flare', streak: 0.6, star: 0.6, ring: 0.5, colour: '#fff0c0' },
];
for (const fl of FLARES) {
  add(`flare${fl.id}`, {
    name: fl.name, group: 'Light', tier: 'free', icon: '✦',
    params: { amount: { label: 'Strength', min: 0, max: 100, def: 50 },
              x: { label: 'X', min: 0, max: 100, def: 70 },
              y: { label: 'Y', min: 0, max: 100, def: 25 },
              size: { label: 'Size', min: 10, max: 200, def: 80 } },
    draw(ctx, w, h, p) {
      const a = amt(p, 50);
      if (a <= 0.01) return;
      const cx = ((p.x ?? 70) / 100) * w;
      const cy = ((p.y ?? 25) / 100) * h;
      const r = Math.max(w, h) * ((p.size ?? 80) / 100) * 0.5;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.35);
      core.addColorStop(0, hexToRgba(fl.colour, a));
      core.addColorStop(1, hexToRgba(fl.colour, 0));
      ctx.fillStyle = core;
      ctx.fillRect(0, 0, w, h);

      if (fl.streak > 0) {
        // The horizontal smear an anamorphic lens puts on a point light. It is
        // a gradient bar, not a blurred line, because a blurred line has soft
        // ends and this has a hard bright middle.
        const g = ctx.createLinearGradient(cx - r * 2, 0, cx + r * 2, 0);
        g.addColorStop(0, hexToRgba(fl.colour, 0));
        g.addColorStop(0.5, hexToRgba(fl.colour, a * 0.55 * fl.streak));
        g.addColorStop(1, hexToRgba(fl.colour, 0));
        ctx.fillStyle = g;
        ctx.fillRect(cx - r * 2, cy - r * 0.035, r * 4, r * 0.07);
      }

      if (fl.star > 0) {
        ctx.strokeStyle = hexToRgba(fl.colour, a * 0.5 * fl.star);
        ctx.lineWidth = Math.max(1, r * 0.012);
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(ang) * r * 1.6, cy + Math.sin(ang) * r * 1.6);
          ctx.stroke();
        }
      }

      if (fl.ring > 0) {
        // Ghosts fall on the line through the frame's centre, opposite the
        // source — that geometry is why a flare tracks when the camera moves.
        for (const k of [-0.6, -0.25, 0.35, 0.8]) {
          const gx = w / 2 + (cx - w / 2) * k;
          const gy = h / 2 + (cy - h / 2) * k;
          const gr = r * (0.12 + Math.abs(k) * 0.2);
          const g = ctx.createRadialGradient(gx, gy, gr * 0.5, gx, gy, gr);
          g.addColorStop(0, hexToRgba(fl.colour, 0));
          g.addColorStop(0.8, hexToRgba(fl.colour, a * 0.22 * fl.ring));
          g.addColorStop(1, hexToRgba(fl.colour, 0));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(gx, gy, gr, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    },
  });
}

add('godRays', {
  name: 'God rays', group: 'Light', tier: 'creator', icon: '🌤',
  params: { amount: { label: 'Strength', min: 0, max: 100, def: 45 },
            x: { label: 'X', min: 0, max: 100, def: 50 },
            y: { label: 'Y', min: 0, max: 100, def: 10 },
            rays: { label: 'Rays', min: 4, max: 40, def: 14, step: 1 } },
  draw(ctx, w, h, p, { local }) {
    const a = amt(p, 45);
    if (a <= 0.01) return;
    const cx = ((p.x ?? 50) / 100) * w;
    const cy = ((p.y ?? 10) / 100) * h;
    const n = Math.round(p.rays ?? 14);
    const reach = Math.hypot(w, h);
    const drift = (local || 0) * 0.05;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + drift;
      const wide = (0.02 + noise01(i * 4.3) * 0.05) * Math.PI;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, reach);
      g.addColorStop(0, `rgba(255,250,225,${(a * 0.3).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,250,225,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, reach, ang - wide, ang + wide);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  },
});

const VIGNETTES = [
  { id: 'Soft', name: 'soft', inner: 0.45, colour: '#000000' },
  { id: 'Hard', name: 'hard', inner: 0.7, colour: '#000000' },
  { id: 'Wide', name: 'wide', inner: 0.2, colour: '#000000' },
  { id: 'White', name: 'white', inner: 0.5, colour: '#ffffff' },
  { id: 'Warm', name: 'warm', inner: 0.5, colour: '#3a1a00' },
  { id: 'Cool', name: 'cool', inner: 0.5, colour: '#001a33' },
];
for (const v of VIGNETTES) {
  add(`vignette${v.id}`, {
    name: `Vignette — ${v.name}`, group: 'Light', tier: 'free', icon: '⬭',
    params: { amount: { label: 'Strength', min: 0, max: 100, def: 45 },
              size: { label: 'Size', min: 10, max: 100, def: Math.round(v.inner * 100) } },
    draw(ctx, w, h, p) {
      const a = amt(p, 45);
      if (a <= 0.01) return;
      const inner = ((p.size ?? v.inner * 100) / 100);
      const r = Math.hypot(w, h) / 2;
      const g = ctx.createRadialGradient(w / 2, h / 2, r * inner, w / 2, h / 2, r);
      g.addColorStop(0, hexToRgba(v.colour, 0));
      g.addColorStop(1, hexToRgba(v.colour, a));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
  });
}

add('spotlight', {
  name: 'Spotlight', group: 'Light', tier: 'free', icon: '🔦',
  params: { amount: { label: 'Strength', min: 0, max: 100, def: 65 },
            x: { label: 'X', min: 0, max: 100, def: 50 },
            y: { label: 'Y', min: 0, max: 100, def: 50 },
            size: { label: 'Size', min: 5, max: 100, def: 30 } },
  draw(ctx, w, h, p) {
    const a = amt(p, 65);
    if (a <= 0.01) return;
    const cx = ((p.x ?? 50) / 100) * w, cy = ((p.y ?? 50) / 100) * h;
    const r = Math.max(w, h) * ((p.size ?? 30) / 100);
    const g = ctx.createRadialGradient(cx, cy, r * 0.35, cx, cy, r);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${a.toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  },
});

const ATMOS = [
  ['fog', 'Fog', '#c8d4dc', 0.45], ['mist', 'Mist', '#e8f0f4', 0.3],
  ['smoke', 'Smoke', '#8c8c8c', 0.4], ['sandstorm', 'Sandstorm', '#d8b478', 0.45],
  ['blizzard', 'Blizzard haze', '#ffffff', 0.5], ['nightHaze', 'Night haze', '#14243d', 0.4],
];
for (const [id, name, colour, def] of ATMOS) {
  add(id, {
    name, group: 'Light', tier: 'free', icon: '🌫',
    params: { amount: { label: 'Density', min: 0, max: 100, def: Math.round(def * 100) },
              depth: { label: 'Depth falloff', min: 0, max: 100, def: 55 } },
    draw(ctx, w, h, p) {
      const a = amt(p, def * 100);
      if (a <= 0.01) return;
      // Thicker toward the top of the frame, which is where distance usually
      // is. Flat fog covers everything equally and just looks like a wash.
      const falloff = (p.depth ?? 55) / 100;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, hexToRgba(colour, a * 0.75));
      g.addColorStop(1, hexToRgba(colour, a * 0.75 * (1 - falloff)));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
  });
}

/* ------------------------------------------------------------------ *
 * Stylise
 *
 * Turning footage into something that did not come out of a camera. The
 * cheap-looking versions of these are all the same trick — posterise and call
 * it a painting — so each one here does the thing its name says: a sketch
 * detects edges, an oil painting pools colour, a halftone uses real dots.
 * ------------------------------------------------------------------ */

/*
 * Edges: the frame minus a blurred copy of itself is where the detail lives.
 *
 * Comes back at a capped size, so callers draw it stretched to the frame
 * rather than assuming it matches pixel for pixel.
 */
const edges = edgeMap;

add('sketch', {
  name: 'Pencil sketch', group: 'Stylise', tier: 'free', icon: '✎',
  params: { amount: { label: 'Strength', min: 0, max: 100, def: 85 },
            detail: { label: 'Detail', min: 1, max: 12, def: 3 } },
  draw(ctx, w, h, p) {
    const a = amt(p, 85);
    if (a <= 0.01) return;
    const src = snapshot(ctx, w, h, 0);
    const e = edges(src, w, h, p.detail ?? 3, 1);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = a;
    ctx.filter = 'grayscale(1) invert(1) contrast(2.6) brightness(1.1)';
    ctx.drawImage(e, 0, 0, e.width, e.height, 0, 0, w, h);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
  },
});

add('inkOutline', {
  name: 'Ink outline', group: 'Stylise', tier: 'free', icon: '✒',
  params: { amount: { label: 'Strength', min: 0, max: 100, def: 70 },
            detail: { label: 'Detail', min: 1, max: 12, def: 2 } },
  draw(ctx, w, h, p) {
    const a = amt(p, 70);
    if (a <= 0.01) return;
    const src = snapshot(ctx, w, h, 0);
    const e = edges(src, w, h, p.detail ?? 2, 1);
    // Multiplied over the picture, so the lines darken what is there rather
    // than replacing it — ink on top of paint, not instead of it.
    ctx.globalAlpha = a;
    ctx.globalCompositeOperation = 'multiply';
    ctx.filter = 'grayscale(1) invert(1) contrast(3.2)';
    ctx.drawImage(e, 0, 0, e.width, e.height, 0, 0, w, h);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  },
});

add('emboss', {
  name: 'Emboss', group: 'Stylise', tier: 'free', icon: '◧',
  params: { amount: { label: 'Strength', min: 0, max: 100, def: 70 } },
  draw(ctx, w, h, p) {
    const a = amt(p, 70);
    if (a <= 0.01) return;
    const src = snapshot(ctx, w, h, 0);
    const s = scratch(w, h, 1);
    s.ctx.fillStyle = '#808080';
    s.ctx.fillRect(0, 0, w, h);
    // The frame against a copy offset by a pixel or two: what moved shows as a
    // ridge lit from one side, which is all an emboss is.
    const d = Math.max(1, Math.round(Math.max(w, h) * 0.0025 * (0.5 + a)));
    s.ctx.globalCompositeOperation = 'difference';
    s.ctx.drawImage(src, 0, 0);
    s.ctx.drawImage(src, d, d);
    s.ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a;
    ctx.filter = 'grayscale(1) contrast(2.2) brightness(1.6)';
    ctx.drawImage(s.canvas, 0, 0);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
  },
});

add('oilPaint', {
  name: 'Oil paint', group: 'Stylise', tier: 'creator', icon: '🖌',
  params: { amount: { label: 'Strength', min: 0, max: 100, def: 70 },
            brush: { label: 'Brush size', min: 2, max: 30, def: 8 } },
  /* Real oil-paint filters cluster each neighbourhood's colours and take the
   * most common one. This does the cheap honest version: pool the colour by
   * blurring hard, put the detail back as edges, and posterise what is left —
   * which pools flat areas and keeps the strokes, the two things that read. */
  draw(ctx, w, h, p) {
    const a = amt(p, 70);
    if (a <= 0.01) return;
    const brush = p.brush ?? 8;
    const src = snapshot(ctx, w, h, 0);
    // The pooling blur runs at a capped size: it is destroying detail on
    // purpose, so there is nothing for the extra resolution to preserve, and
    // a blur at 4K costs eight times a blur at 1080p for the same picture.
    const k = Math.min(1, 900 / Math.max(w, h));
    const bw = Math.max(1, Math.round(w * k)), bh = Math.max(1, Math.round(h * k));
    const s = scratch(bw, bh, 1);
    s.ctx.filter = `blur(${Math.max(0.5, brush * k).toFixed(2)}px) saturate(1.5)`;
    s.ctx.drawImage(src, 0, 0, bw, bh);
    s.ctx.filter = 'none';
    const flat = pixels(s.canvas, bw, bh, 1100, (d) => {
      const step = 255 / 5;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = Math.round(d[i] / step) * step;
        d[i + 1] = Math.round(d[i + 1] / step) * step;
        d[i + 2] = Math.round(d[i + 2] / step) * step;
      }
    }, 2);
    if (!flat) return;
    ctx.globalAlpha = a;
    ctx.drawImage(flat, 0, 0, flat.width, flat.height, 0, 0, w, h);
    ctx.globalAlpha = 1;
    const e = edges(src, w, h, Math.max(1, brush / 3), 3);
    ctx.globalAlpha = a * 0.5;
    ctx.globalCompositeOperation = 'multiply';
    ctx.filter = 'grayscale(1) invert(1) contrast(2)';
    ctx.drawImage(e, 0, 0, e.width, e.height, 0, 0, w, h);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  },
});

add('watercolour', {
  name: 'Watercolour', group: 'Stylise', tier: 'creator', icon: '💧',
  params: { amount: { label: 'Strength', min: 0, max: 100, def: 70 } },
  draw(ctx, w, h, p) {
    const a = amt(p, 70);
    if (a <= 0.01) return;
    const src = snapshot(ctx, w, h, 0);
    const k = Math.min(1, 900 / Math.max(w, h));
    const bw = Math.max(1, Math.round(w * k)), bh = Math.max(1, Math.round(h * k));
    const s = scratch(bw, bh, 1);
    s.ctx.filter = `blur(${Math.max(0.5, 5 * k).toFixed(2)}px) saturate(1.3) brightness(1.15) contrast(0.85)`;
    s.ctx.drawImage(src, 0, 0, bw, bh);
    s.ctx.filter = 'none';
    ctx.globalAlpha = a;
    ctx.drawImage(s.canvas, 0, 0, bw, bh, 0, 0, w, h);
    ctx.globalAlpha = 1;
    // The dark rim where pigment pools at the edge of a wash.
    const e = edges(src, w, h, 6, 2);
    ctx.globalAlpha = a * 0.35;
    ctx.globalCompositeOperation = 'multiply';
    ctx.filter = 'grayscale(1) invert(1) contrast(1.6)';
    ctx.drawImage(e, 0, 0, e.width, e.height, 0, 0, w, h);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  },
});

add('threshold', {
  name: 'Threshold', group: 'Stylise', tier: 'free', icon: '◼',
  params: { amount: { label: 'Strength', min: 0, max: 100, def: 100 },
            level: { label: 'Level', min: 0, max: 100, def: 50 } },
  draw(ctx, w, h, p) {
    const a = amt(p, 100);
    if (a <= 0.01) return;
    const src = snapshot(ctx, w, h, 0);
    const cut = ((p.level ?? 50) / 100) * 255;
    const done = pixels(src, w, h, 1400, (d) => {
      for (let i = 0; i < d.length; i += 4) {
        const v = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114 > cut ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
    }, 1);
    if (!done) return;
    ctx.globalAlpha = a;
    ctx.drawImage(done, 0, 0, done.width, done.height, 0, 0, w, h);
    ctx.globalAlpha = 1;
  },
});

/* Posterise at fixed levels, so "2 colours" is one press rather than a slider
 * you have to find the right end of. */
for (const n of [2, 3, 4, 6, 8, 12]) {
  add(`poster${n}`, {
    name: `Posterise — ${n} levels`, group: 'Stylise', tier: 'free', icon: '▤',
    params: { amount: { label: 'Strength', min: 0, max: 100, def: 100 } },
    draw(ctx, w, h, p) {
      const a = amt(p, 100);
      if (a <= 0.01) return;
      const src = snapshot(ctx, w, h, 0);
      const done = pixels(src, w, h, 1400, (d) => {
        const step = 255 / (n - 1);
        for (let i = 0; i < d.length; i += 4) {
          d[i] = Math.round(d[i] / step) * step;
          d[i + 1] = Math.round(d[i + 1] / step) * step;
          d[i + 2] = Math.round(d[i + 2] / step) * step;
        }
      }, 1);
      if (!done) return;
      ctx.globalAlpha = a;
      ctx.drawImage(done, 0, 0, done.width, done.height, 0, 0, w, h);
      ctx.globalAlpha = 1;
    },
  });
}

/* Mosaics: same idea as a pixelate, different cell shape. */
const CELLS = [
  { id: 'Square', name: 'Square mosaic', shape: 'square' },
  { id: 'Round', name: 'Dot mosaic', shape: 'circle' },
  { id: 'Diamond', name: 'Diamond mosaic', shape: 'diamond' },
  { id: 'Hex', name: 'Hex mosaic', shape: 'hex' },
];
for (const c of CELLS) {
  add(`mosaic${c.id}`, {
    name: c.name, group: 'Stylise', tier: 'free', icon: '▦',
    params: { size: { label: 'Cell size', min: 4, max: 80, def: 18 },
              gap: { label: 'Gap', min: 0, max: 60, def: 10 } },
    draw(ctx, w, h, p) {
      const size = cellSize(p.size ?? 18, w, h);
      const src = snapshot(ctx, w, h, 0);
      const cols = Math.ceil(w / size), rows = Math.ceil(h / size);
      // One downscale gives every cell's average colour in a single draw,
      // instead of reading the frame once per cell.
      const s = scratch(cols, rows, 1);
      s.ctx.drawImage(src, 0, 0, cols, rows);
      let img;
      try { img = s.ctx.getImageData(0, 0, cols, rows); } catch { return; }
      const d = img.data;
      const inset = (size * (p.gap ?? 10)) / 200;
      const r = size / 2 - inset;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = (y * cols + x) * 4;
          ctx.fillStyle = `rgb(${d[i]},${d[i + 1]},${d[i + 2]})`;
          const cx = x * size + size / 2, cy = y * size + size / 2;
          if (c.shape === 'square') ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
          else if (c.shape === 'circle') { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); }
          else {
            ctx.beginPath();
            const sides = c.shape === 'diamond' ? 4 : 6;
            for (let k = 0; k < sides; k++) {
              const ang = (k / sides) * Math.PI * 2 - Math.PI / 2;
              const px = cx + Math.cos(ang) * r * 1.15, py = cy + Math.sin(ang) * r * 1.15;
              if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath(); ctx.fill();
          }
        }
      }
    },
  });
}

/* Kaleidoscopes, by segment count. */
for (const seg of [3, 4, 6, 8, 12]) {
  add(`kaleido${seg}`, {
    name: `Kaleidoscope — ${seg}`, group: 'Stylise', tier: 'creator', icon: '❉',
    params: { amount: { label: 'Mix', min: 0, max: 100, def: 100 },
              spin: { label: 'Spin', min: 0, max: 100, def: 0 },
              zoom: { label: 'Zoom', min: 50, max: 250, def: 120 } },
    draw(ctx, w, h, p, { local }) {
      const a = amt(p, 100);
      if (a <= 0.01) return;
      const src = snapshot(ctx, w, h, 0);
      const turn = ((p.spin ?? 0) / 100) * (local || 0) * 0.6;
      const k = (p.zoom ?? 120) / 100;
      const s = scratch(w, h, 1);
      const R = Math.hypot(w, h);
      for (let i = 0; i < seg; i++) {
        s.ctx.save();
        s.ctx.translate(w / 2, h / 2);
        s.ctx.rotate((i / seg) * Math.PI * 2 + turn);
        // Every other wedge is mirrored, which is what makes the seams line up
        // instead of showing a hard join every segment.
        if (i % 2) s.ctx.scale(-1, 1);
        s.ctx.beginPath();
        s.ctx.moveTo(0, 0);
        s.ctx.arc(0, 0, R, -Math.PI / seg, Math.PI / seg);
        s.ctx.closePath();
        s.ctx.clip();
        s.ctx.drawImage(src, -w * k / 2, -h * k / 2, w * k, h * k);
        s.ctx.restore();
      }
      ctx.globalAlpha = a;
      ctx.drawImage(s.canvas, 0, 0);
      ctx.globalAlpha = 1;
    },
  });
}

add('crosshatch', {
  name: 'Crosshatch', group: 'Stylise', tier: 'free', icon: '⋕',
  params: { amount: { label: 'Strength', min: 0, max: 100, def: 65 },
            spacing: { label: 'Spacing', min: 3, max: 24, def: 7 } },
  draw(ctx, w, h, p) {
    const a = amt(p, 65);
    if (a <= 0.01) return;
    /*
     * The hatch is drawn on a canvas of a fixed width, whatever the frame is,
     * and stretched to fit.
     *
     * That is two things at once. It is cheap — every pass is a filtered
     * full-frame draw plus a composite, and there are four, so doing them at
     * 4K was the most expensive effect in the library by a wide margin. And it
     * is consistent: with the spacing measured in these fixed pixels, the same
     * clip hatches identically in the preview and in a 4K export. Tie the
     * spacing to the frame instead and the export comes back with visibly
     * finer lines than the person approved.
     */
    const mw = 700, mh = Math.max(1, Math.round((700 * h) / w));
    const gap = Math.max(3, p.spacing ?? 7);
    const src = snapshot(ctx, w, h, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);

    /*
     * The lines come from a repeating pattern, not a loop of rectangles.
     *
     * Drawing them one at a time meant hundreds of fills inside a
     * `destination-in` composite, and every one of those forces the whole
     * canvas through the slow path: this effect measured fourteen seconds a
     * frame at 1080p, which is not slow, it is broken. One tile plus a
     * rotated pattern is a single fill, and draws the same picture.
     */
    const tile = scratch(1, Math.max(2, Math.round(gap)), 3);
    tile.ctx.fillStyle = '#000';
    tile.ctx.fillRect(0, 0, 1, 1);
    const pattern = ctx.createPattern(tile.canvas, 'repeat');
    if (!pattern) return;

    // Four passes of lines at different angles, each masked to a darker slice
    // of the picture — which is how hatching actually builds up tone.
    const passes = [[45, 0.75], [-45, 0.55], [0, 0.35], [90, 0.18]];
    for (const [deg, level] of passes) {
      const m = scratch(mw, mh, 1);
      m.ctx.filter = `grayscale(1) brightness(${(1 / Math.max(0.05, level)).toFixed(2)}) contrast(6) invert(1)`;
      m.ctx.drawImage(src, 0, 0, mw, mh);
      m.ctx.filter = 'none';
      pattern.setTransform(new DOMMatrix().rotate(deg));
      m.ctx.globalCompositeOperation = 'destination-in';
      m.ctx.fillStyle = pattern;
      m.ctx.fillRect(0, 0, mw, mh);
      m.ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = a;
      ctx.globalCompositeOperation = 'multiply';
      stretch(ctx, m.canvas, w, h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  },
});

add('newsprint', {
  name: 'Newsprint', group: 'Stylise', tier: 'free', icon: '📰',
  params: { amount: { label: 'Strength', min: 0, max: 100, def: 90 },
            size: { label: 'Dot size', min: 2, max: 20, def: 5 } },
  draw(ctx, w, h, p) {
    const a = amt(p, 90);
    if (a <= 0.01) return;
    const size = cellSize(p.size ?? 5, w, h);
    const src = snapshot(ctx, w, h, 0);
    const cols = Math.ceil(w / size), rows = Math.ceil(h / size);
    const s = scratch(cols, rows, 1);
    s.ctx.filter = 'grayscale(1) contrast(1.2)';
    s.ctx.drawImage(src, 0, 0, cols, rows);
    s.ctx.filter = 'none';
    let img;
    try { img = s.ctx.getImageData(0, 0, cols, rows); } catch { return; }
    const d = img.data;
    const paper = scratch(w, h, 2);
    paper.ctx.fillStyle = '#f4f1e8';
    paper.ctx.fillRect(0, 0, w, h);
    paper.ctx.fillStyle = '#15120e';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        // Dot radius carries the tone, which is the whole trick of halftone:
        // one ink, one dot size per cell, and the eye does the blending.
        const v = d[(y * cols + x) * 4] / 255;
        const r = (1 - v) * (size * 0.62);
        if (r < 0.3) continue;
        paper.ctx.beginPath();
        paper.ctx.arc(x * size + size / 2, y * size + size / 2, r, 0, Math.PI * 2);
        paper.ctx.fill();
      }
    }
    ctx.globalAlpha = a;
    ctx.drawImage(paper.canvas, 0, 0);
    ctx.globalAlpha = 1;
  },
});

/* ------------------------------------------------------------------ *
 * Anime and action
 *
 * The vocabulary of an AMV, which is what a large share of people open an
 * editor to make. These are the moves that take twenty keyframes by hand in
 * every other editor and one press here.
 * ------------------------------------------------------------------ */

const LINES = [
  { id: 'Radial', name: 'Speed lines — radial', kind: 'radial' },
  { id: 'Horizontal', name: 'Speed lines — horizontal', kind: 'h' },
  { id: 'Vertical', name: 'Speed lines — vertical', kind: 'v' },
  { id: 'Diagonal', name: 'Speed lines — diagonal', kind: 'd' },
];
for (const ln of LINES) {
  add(`lines${ln.id}`, {
    name: ln.name, group: 'Anime', tier: 'free', icon: '≡',
    params: { amount: { label: 'Strength', min: 0, max: 100, def: 55 },
              count: { label: 'Lines', min: 8, max: 160, def: 60, step: 1 },
              clear: { label: 'Clear centre', min: 0, max: 90, def: 32 },
              colour: { label: 'Colour', type: 'colour', def: '#ffffff' } },
    draw(ctx, w, h, p, { local, fps }) {
      const a = amt(p, 55);
      if (a <= 0.01) return;
      const n = Math.round(p.count ?? 60);
      const f = Math.floor((local || 0) * (fps || 30));
      const colour = p.colour || '#ffffff';
      const hole = ((p.clear ?? 32) / 100) * Math.min(w, h) * 0.5;
      ctx.save();
      ctx.strokeStyle = hexToRgba(colour, a * 0.8);
      for (let i = 0; i < n; i++) {
        // Reseeded each frame so the lines flicker the way drawn ones do.
        const s = i * 1.618 + f * 0.31;
        ctx.lineWidth = Math.max(1, (0.4 + noise01(s * 3.3) * 2.4) * (Math.max(w, h) / 900));
        ctx.beginPath();
        if (ln.kind === 'radial') {
          const ang = noise01(s) * Math.PI * 2;
          const far = Math.hypot(w, h) * 0.75;
          const near = hole + noise01(s * 2.1) * far * 0.3;
          ctx.moveTo(w / 2 + Math.cos(ang) * near, h / 2 + Math.sin(ang) * near);
          ctx.lineTo(w / 2 + Math.cos(ang) * far, h / 2 + Math.sin(ang) * far);
        } else if (ln.kind === 'h') {
          const y = noise01(s) * h;
          const x = noise01(s * 1.7) * w;
          ctx.moveTo(x, y); ctx.lineTo(x + w * (0.05 + noise01(s * 2.9) * 0.3), y);
        } else if (ln.kind === 'v') {
          const x = noise01(s) * w, y = noise01(s * 1.7) * h;
          ctx.moveTo(x, y); ctx.lineTo(x, y + h * (0.05 + noise01(s * 2.9) * 0.3));
        } else {
          const x = noise01(s) * w * 1.4 - w * 0.2, y = noise01(s * 1.7) * h;
          const len = Math.max(w, h) * (0.05 + noise01(s * 2.9) * 0.28);
          ctx.moveTo(x, y); ctx.lineTo(x + len * 0.7071, y + len * 0.7071);
        }
        ctx.stroke();
      }
      ctx.restore();
    },
  });
}

add('screentone', {
  name: 'Manga screentone', group: 'Anime', tier: 'free', icon: '⁙',
  params: { amount: { label: 'Strength', min: 0, max: 100, def: 70 },
            size: { label: 'Dot size', min: 2, max: 16, def: 4 } },
  draw(ctx, w, h, p) {
    const a = amt(p, 70);
    if (a <= 0.01) return;
    const size = cellSize(p.size ?? 4, w, h);
    const src = snapshot(ctx, w, h, 0);
    const cols = Math.ceil(w / size), rows = Math.ceil(h / size);
    const s = scratch(cols, rows, 1);
    s.ctx.filter = 'grayscale(1) contrast(1.4)';
    s.ctx.drawImage(src, 0, 0, cols, rows);
    s.ctx.filter = 'none';
    let img;
    try { img = s.ctx.getImageData(0, 0, cols, rows); } catch { return; }
    const d = img.data;
    const sheet = scratch(w, h, 2);
    sheet.ctx.fillStyle = '#ffffff';
    sheet.ctx.fillRect(0, 0, w, h);
    sheet.ctx.fillStyle = '#000000';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const v = d[(y * cols + x) * 4] / 255;
        // Offset every other row: a square grid of dots reads as a screen
        // door, and a staggered one reads as tone.
        const cx = x * size + size / 2 + (y % 2 ? size / 2 : 0);
        const r = (1 - v) * size * 0.55;
        if (r < 0.3) continue;
        sheet.ctx.beginPath();
        sheet.ctx.arc(cx, y * size + size / 2, r, 0, Math.PI * 2);
        sheet.ctx.fill();
      }
    }
    ctx.globalAlpha = a;
    ctx.drawImage(sheet.canvas, 0, 0);
    ctx.globalAlpha = 1;
  },
});

const AURAS = [
  ['auraWhite', 'Aura — white', '#ffffff'], ['auraGold', 'Aura — gold', '#ffcc33'],
  ['auraBlue', 'Aura — blue', '#4da6ff'], ['auraRed', 'Aura — red', '#ff3b3b'],
  ['auraPurple', 'Aura — purple', '#b44dff'], ['auraGreen', 'Aura — green', '#4dff88'],
];
for (const [id, name, colour] of AURAS) {
  add(id, {
    name, group: 'Anime', tier: 'free', icon: '✧',
    params: { amount: { label: 'Strength', min: 0, max: 100, def: 55 },
              pulse: { label: 'Pulse', min: 0, max: 100, def: 40 } },
    draw(ctx, w, h, p, { local }) {
      const a = amt(p, 55);
      if (a <= 0.01) return;
      const beat = 1 + Math.sin((local || 0) * 6) * ((p.pulse ?? 40) / 100) * 0.35;
      const src = snapshot(ctx, w, h, 0);
      // The glow is coloured light added around the bright parts, so it reads
      // as energy coming off the subject rather than a tint over everything.
      const g = blurred(src, w, h, 14 * beat, 'brightness(1.5) contrast(2)', 1);
      const s = scratch(g.width, g.height, 2);
      s.ctx.drawImage(g, 0, 0);
      s.ctx.globalCompositeOperation = 'source-in';
      s.ctx.fillStyle = colour;
      s.ctx.fillRect(0, 0, g.width, g.height);
      s.ctx.globalCompositeOperation = 'source-over';
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * beat;
      stretch(ctx, s.canvas, w, h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  });
}

add('shockwave', {
  name: 'Shockwave', group: 'Anime', tier: 'free', icon: '◎',
  params: { amount: { label: 'Strength', min: 0, max: 100, def: 70 },
            at: { label: 'At (s)', min: 0, max: 30, def: 0, step: 0.02 },
            length: { label: 'Length (s)', min: 0.05, max: 2, def: 0.45, step: 0.01 } },
  draw(ctx, w, h, p, { local }) {
    const a = amt(p, 70);
    const t = (local || 0) - (p.at ?? 0);
    const len = p.length ?? 0.45;
    if (a <= 0.01 || t < 0 || t > len) return;
    const k = t / len;
    const src = snapshot(ctx, w, h, 0);
    const R = Math.hypot(w, h) * 0.5;
    const ring = R * k;
    const band = R * 0.12;
    // The ring is a band of the picture drawn scaled up, so the wave bends the
    // image as it passes rather than just drawing a white circle on top.
    ctx.save();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, Math.max(0, ring), 0, Math.PI * 2);
    ctx.arc(w / 2, h / 2, Math.max(0, ring - band), 0, Math.PI * 2, true);
    ctx.clip();
    const k2 = 1 + 0.12 * a * (1 - k);
    ctx.drawImage(src, (w - w * k2) / 2, (h - h * k2) / 2, w * k2, h * k2);
    ctx.restore();
    ctx.strokeStyle = `rgba(255,255,255,${(a * (1 - k) * 0.6).toFixed(3)})`;
    ctx.lineWidth = Math.max(1, band * 0.25);
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, Math.max(0, ring), 0, Math.PI * 2);
    ctx.stroke();
  },
});

for (const n of [2, 3, 5]) {
  add(`afterImage${n}`, {
    name: `After-image — ${n}`, group: 'Anime', tier: 'free', icon: '⋮',
    params: { amount: { label: 'Strength', min: 0, max: 100, def: 45 },
              spread: { label: 'Spread', min: 0, max: 100, def: 35 },
              angle: { label: 'Angle', min: 0, max: 360, def: 0 } },
    draw(ctx, w, h, p) {
      const a = amt(p, 45);
      if (a <= 0.01) return;
      const rad = ((p.angle ?? 0) * Math.PI) / 180;
      const reach = Math.max(w, h) * 0.05 * ((p.spread ?? 35) / 100);
      const src = snapshot(ctx, w, h, 0);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 1; i <= n; i++) {
        ctx.globalAlpha = (a * 0.6) / (i + 0.5);
        ctx.drawImage(src, Math.cos(rad) * reach * i, Math.sin(rad) * reach * i);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  });
}

add('hitSpark', {
  name: 'Hit spark', group: 'Anime', tier: 'free', icon: '✹',
  params: { amount: { label: 'Strength', min: 0, max: 100, def: 80 },
            at: { label: 'At (s)', min: 0, max: 30, def: 0, step: 0.02 },
            length: { label: 'Length (s)', min: 0.03, max: 0.8, def: 0.16, step: 0.01 },
            x: { label: 'X', min: 0, max: 100, def: 50 },
            y: { label: 'Y', min: 0, max: 100, def: 50 } },
  draw(ctx, w, h, p, { local }) {
    const a = amt(p, 80);
    const t = (local || 0) - (p.at ?? 0);
    const len = p.length ?? 0.16;
    if (a <= 0.01 || t < 0 || t > len) return;
    const k = t / len;
    const fade = 1 - k;
    const cx = ((p.x ?? 50) / 100) * w, cy = ((p.y ?? 50) / 100) * h;
    const R = Math.min(w, h) * 0.35 * (0.3 + k);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(255,255,255,${(a * fade).toFixed(3)})`;
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2 + noise(i) * 0.2;
      ctx.lineWidth = Math.max(1, (1 + noise01(i * 3.1) * 3) * (Math.max(w, h) / 900));
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * R * 0.25, cy + Math.sin(ang) * R * 0.25);
      ctx.lineTo(cx + Math.cos(ang) * R * (0.7 + noise01(i * 7.7) * 0.6),
        cy + Math.sin(ang) * R * (0.7 + noise01(i * 7.7) * 0.6));
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.5);
    g.addColorStop(0, `rgba(255,255,255,${(a * fade).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.restore();
  },
});

/* ------------------------------------------------------------------ *
 * Camera
 *
 * Movement that was never shot. All of them scale the frame slightly first, so
 * there is picture to move into — moving an unscaled frame just exposes the
 * background, which is the mistake that makes fake camera moves look fake.
 * ------------------------------------------------------------------ */

/** Draw `src` scaled about the centre by `k`, then nudged by (dx, dy) and turned. */
function reframe(ctx, src, w, h, k, dx, dy, turn = 0) {
  ctx.save();
  ctx.translate(w / 2 + dx, h / 2 + dy);
  if (turn) ctx.rotate(turn);
  ctx.drawImage(src, (-w * k) / 2, (-h * k) / 2, w * k, h * k);
  ctx.restore();
}

const HANDHELD = [
  { id: 'Subtle', name: 'subtle', move: 0.4, rate: 1.6 },
  { id: 'Documentary', name: 'documentary', move: 1, rate: 2.4 },
  { id: 'Run', name: 'running', move: 2.4, rate: 5.5 },
  { id: 'Breathing', name: 'breathing', move: 0.5, rate: 0.5 },
];
for (const hh of HANDHELD) {
  add(`handheld${hh.id}`, {
    name: `Handheld — ${hh.name}`, group: 'Camera', tier: 'free', icon: '🎥',
    params: { amount: { label: 'Amount', min: 0, max: 100, def: 50 },
              roll: { label: 'Roll', min: 0, max: 100, def: 30 } },
    draw(ctx, w, h, p, { local }) {
      const a = amt(p, 50) * hh.move;
      if (a <= 0.005) return;
      const t = (local || 0) * hh.rate;
      // Three sine waves at unrelated rates, so the motion never repeats on a
      // beat the eye can find. One wave reads as a pendulum, not a person.
      const dx = (Math.sin(t * 1.0) + Math.sin(t * 2.3) * 0.5 + Math.sin(t * 4.1) * 0.25) * w * 0.012 * a;
      const dy = (Math.cos(t * 1.3) + Math.cos(t * 2.9) * 0.5 + Math.cos(t * 5.2) * 0.25) * h * 0.012 * a;
      const roll = Math.sin(t * 0.7) * ((p.roll ?? 30) / 100) * 0.02 * a;
      const src = snapshot(ctx, w, h, 0);
      ctx.clearRect(0, 0, w, h);
      reframe(ctx, src, w, h, 1 + 0.06 * Math.min(2, a), dx, dy, roll);
    },
  });
}

const MOVES = [
  { id: 'PushIn', name: 'Push in', from: 1, to: 1.25, dx: 0, dy: 0 },
  { id: 'PullOut', name: 'Pull out', from: 1.25, to: 1, dx: 0, dy: 0 },
  { id: 'PanLeft', name: 'Pan left', from: 1.15, to: 1.15, dx: 0.12, dy: 0 },
  { id: 'PanRight', name: 'Pan right', from: 1.15, to: 1.15, dx: -0.12, dy: 0 },
  { id: 'TiltUp', name: 'Tilt up', from: 1.15, to: 1.15, dx: 0, dy: 0.12 },
  { id: 'TiltDown', name: 'Tilt down', from: 1.15, to: 1.15, dx: 0, dy: -0.12 },
  { id: 'DollyLeft', name: 'Dolly left', from: 1.1, to: 1.3, dx: 0.1, dy: 0 },
  { id: 'DollyRight', name: 'Dolly right', from: 1.1, to: 1.3, dx: -0.1, dy: 0 },
  { id: 'CraneUp', name: 'Crane up', from: 1.3, to: 1.1, dx: 0, dy: 0.14 },
];
for (const mv of MOVES) {
  add(`move${mv.id}`, {
    name: mv.name, group: 'Camera', tier: 'free', icon: '🎬',
    params: { amount: { label: 'Amount', min: 0, max: 200, def: 100 },
              over: { label: 'Over (s)', min: 0.2, max: 20, def: 4, step: 0.1 },
              ease: { label: 'Ease', min: 0, max: 100, def: 60 } },
    draw(ctx, w, h, p, { local }) {
      const a = (p.amount ?? 100) / 100;
      if (a <= 0.01) return;
      const raw = clamp01((local || 0) / (p.over ?? 4));
      const e = (p.ease ?? 60) / 100;
      // Smoothstep blended with linear: a move that eases at both ends looks
      // motorised, one that does not looks like a jump cut. The slider is the
      // dial between the two, which is the decision an editor actually makes.
      const t = raw * (1 - e) + (raw * raw * (3 - 2 * raw)) * e;
      const k = (mv.from + (mv.to - mv.from) * t - 1) * a + 1;
      const src = snapshot(ctx, w, h, 0);
      ctx.clearRect(0, 0, w, h);
      reframe(ctx, src, w, h, Math.max(1, k),
        mv.dx * w * a * (t - 0.5) * 2, mv.dy * h * a * (t - 0.5) * 2);
    },
  });
}

add('zoomPunch', {
  name: 'Zoom punch', group: 'Camera', tier: 'free', icon: '💥',
  params: { amount: { label: 'Amount', min: 0, max: 100, def: 55 },
            every: { label: 'Every (s)', min: 0.1, max: 8, def: 0.5, step: 0.02 },
            length: { label: 'Length (s)', min: 0.03, max: 1, def: 0.14, step: 0.01 } },
  draw(ctx, w, h, p, { local, beatPhase }) {
    const a = amt(p, 55);
    if (a <= 0.01) return;
    // Rides the beat when one is known, and falls back to a fixed interval so
    // the effect still works on footage with no music behind it.
    const phase = beatPhase !== undefined ? beatPhase : ((local || 0) % (p.every ?? 0.5)) / (p.length ?? 0.14);
    if (phase > 1) return;
    const k = 1 + a * 0.22 * (1 - phase) ** 2;
    const src = snapshot(ctx, w, h, 0);
    ctx.clearRect(0, 0, w, h);
    reframe(ctx, src, w, h, k, 0, 0);
  },
});

add('whipPan', {
  name: 'Whip pan', group: 'Camera', tier: 'free', icon: '💨',
  params: { amount: { label: 'Amount', min: 0, max: 100, def: 60 },
            at: { label: 'At (s)', min: 0, max: 30, def: 0, step: 0.02 },
            length: { label: 'Length (s)', min: 0.05, max: 1.5, def: 0.25, step: 0.01 } },
  draw(ctx, w, h, p, { local }) {
    const a = amt(p, 60);
    const t = (local || 0) - (p.at ?? 0);
    const len = p.length ?? 0.25;
    if (a <= 0.01 || t < 0 || t > len) return;
    const k = Math.sin((t / len) * Math.PI);
    const src = snapshot(ctx, w, h, 0);
    const sc = Math.min(1, 1100 / Math.max(w, h));
    const bw = Math.max(1, Math.round(w * sc)), bh = Math.max(1, Math.round(h * sc));
    const s = scratch(bw, bh, 1);
    const n = 12;
    s.ctx.globalAlpha = 1 / n;
    for (let i = 0; i < n; i++) s.ctx.drawImage(src, (i / n - 0.5) * bw * 0.5 * a * k, 0, bw, bh);
    s.ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, w, h);
    stretch(ctx, s.canvas, w, h);
  },
});

/* ------------------------------------------------------------------ *
 * Transform
 *
 * Reshaping the frame rather than changing its colour. The mirrors and tiles
 * are the ones people reach for; the 3D tilts are here because a flat cut-out
 * lying at an angle is most of what a title sequence is.
 * ------------------------------------------------------------------ */

const MIRRORS = [
  { id: 'Left', name: 'left onto right', sx: -1, sy: 1, half: 'x', keep: 0 },
  { id: 'Right', name: 'right onto left', sx: -1, sy: 1, half: 'x', keep: 1 },
  { id: 'Top', name: 'top onto bottom', sx: 1, sy: -1, half: 'y', keep: 0 },
  { id: 'Bottom', name: 'bottom onto top', sx: 1, sy: -1, half: 'y', keep: 1 },
];
for (const m of MIRRORS) {
  add(`mirror${m.id}`, {
    name: `Mirror — ${m.name}`, group: 'Transform', tier: 'free', icon: '⇋',
    params: { amount: { label: 'Mix', min: 0, max: 100, def: 100 } },
    draw(ctx, w, h, p) {
      const a = amt(p, 100);
      if (a <= 0.01) return;
      const src = snapshot(ctx, w, h, 0);
      const s = scratch(w, h, 1);
      if (m.half === 'x') {
        const x = m.keep ? w / 2 : 0;
        s.ctx.drawImage(src, x, 0, w / 2, h, x, 0, w / 2, h);
        s.ctx.save();
        s.ctx.translate(w, 0); s.ctx.scale(-1, 1);
        s.ctx.drawImage(src, x, 0, w / 2, h, w - x - w / 2, 0, w / 2, h);
        s.ctx.restore();
      } else {
        const y = m.keep ? h / 2 : 0;
        s.ctx.drawImage(src, 0, y, w, h / 2, 0, y, w, h / 2);
        s.ctx.save();
        s.ctx.translate(0, h); s.ctx.scale(1, -1);
        s.ctx.drawImage(src, 0, y, w, h / 2, 0, h - y - h / 2, w, h / 2);
        s.ctx.restore();
      }
      ctx.globalAlpha = a;
      ctx.drawImage(s.canvas, 0, 0);
      ctx.globalAlpha = 1;
    },
  });
}

add('mirrorQuad', {
  name: 'Mirror — four ways', group: 'Transform', tier: 'free', icon: '✚',
  params: { amount: { label: 'Mix', min: 0, max: 100, def: 100 } },
  draw(ctx, w, h, p) {
    const a = amt(p, 100);
    if (a <= 0.01) return;
    const src = snapshot(ctx, w, h, 0);
    const s = scratch(w, h, 1);
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      s.ctx.save();
      s.ctx.translate(sx < 0 ? w : 0, sy < 0 ? h : 0);
      s.ctx.scale(sx, sy);
      s.ctx.drawImage(src, 0, 0, w / 2, h / 2, 0, 0, w / 2, h / 2);
      s.ctx.restore();
    }
    ctx.globalAlpha = a;
    ctx.drawImage(s.canvas, 0, 0);
    ctx.globalAlpha = 1;
  },
});

for (const n of [2, 3, 4, 6]) {
  add(`tile${n}`, {
    name: `Tile ${n}×${n}`, group: 'Transform', tier: 'free', icon: '▩',
    params: { amount: { label: 'Mix', min: 0, max: 100, def: 100 },
              flip: { label: 'Mirror alternate', type: 'select', def: 'yes',
                      options: [['yes', 'Yes'], ['no', 'No']] } },
    draw(ctx, w, h, p) {
      const a = amt(p, 100);
      if (a <= 0.01) return;
      const src = snapshot(ctx, w, h, 0);
      const s = scratch(w, h, 1);
      const cw = w / n, ch = h / n;
      const flip = (p.flip || 'yes') === 'yes';
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          s.ctx.save();
          // Mirroring alternate tiles makes the seams continuous, which turns
          // a grid of thumbnails into a pattern.
          const fx = flip && x % 2 ? -1 : 1;
          const fy = flip && y % 2 ? -1 : 1;
          s.ctx.translate(x * cw + (fx < 0 ? cw : 0), y * ch + (fy < 0 ? ch : 0));
          s.ctx.scale(fx, fy);
          s.ctx.drawImage(src, 0, 0, cw, ch);
          s.ctx.restore();
        }
      }
      ctx.globalAlpha = a;
      ctx.drawImage(s.canvas, 0, 0);
      ctx.globalAlpha = 1;
    },
  });
}

const FLIPS = [
  ['flipH', 'Flip horizontal', -1, 1], ['flipV', 'Flip vertical', 1, -1], ['flipBoth', 'Flip both', -1, -1],
];
for (const [id, name, sx, sy] of FLIPS) {
  add(id, {
    name, group: 'Transform', tier: 'free', icon: '⇆',
    params: {},
    draw(ctx, w, h) {
      const src = snapshot(ctx, w, h, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(sx < 0 ? w : 0, sy < 0 ? h : 0);
      ctx.scale(sx, sy);
      ctx.drawImage(src, 0, 0);
      ctx.restore();
    },
  });
}

const TILT3D = [
  { id: 'Left', name: 'tilt left', ax: -1, ay: 0 }, { id: 'Right', name: 'tilt right', ax: 1, ay: 0 },
  { id: 'Up', name: 'tilt up', ax: 0, ay: -1 }, { id: 'Down', name: 'tilt down', ax: 0, ay: 1 },
];
for (const t3 of TILT3D) {
  add(`perspective${t3.id}`, {
    name: `Perspective — ${t3.name}`, group: 'Transform', tier: 'creator', icon: '⬔',
    params: { amount: { label: 'Amount', min: 0, max: 100, def: 35 } },
    /* Canvas has no perspective transform, so the frame is drawn in strips
     * that each get narrower and shift inward — which is what a perspective
     * divide produces anyway, one row at a time. */
    draw(ctx, w, h, p) {
      const a = amt(p, 35);
      if (a <= 0.01) return;
      const src = snapshot(ctx, w, h, 0);
      ctx.clearRect(0, 0, w, h);
      const steps = 120;
      for (let i = 0; i < steps; i++) {
        const u = i / steps;
        const along = t3.ax ? u : u;
        // Depth runs 1 at the near edge to 1-0.45a at the far one.
        const dir = t3.ax || t3.ay;
        const depth = 1 - a * 0.45 * (dir > 0 ? along : 1 - along);
        if (t3.ax) {
          const sw = w / steps;
          const dh = h * depth;
          ctx.drawImage(src, u * w, 0, sw, h, u * w, (h - dh) / 2, sw + 1, dh);
        } else {
          const sh = h / steps;
          const dw = w * depth;
          ctx.drawImage(src, 0, u * h, w, sh, (w - dw) / 2, u * h, dw, sh + 1);
        }
      }
    },
  });
}

add('rotateSpin', {
  name: 'Spin', group: 'Transform', tier: 'free', icon: '↻',
  params: { speed: { label: 'Turns per second', min: -3, max: 3, def: 0.25, step: 0.05 },
            zoom: { label: 'Zoom', min: 100, max: 250, def: 145 } },
  draw(ctx, w, h, p, { local }) {
    const src = snapshot(ctx, w, h, 0);
    ctx.clearRect(0, 0, w, h);
    // Zoomed past the corners by default, or spinning would show the
    // background at every 45 degrees.
    reframe(ctx, src, w, h, (p.zoom ?? 145) / 100, 0, 0, (local || 0) * (p.speed ?? 0.25) * Math.PI * 2);
  },
});

/* ------------------------------------------------------------------ *
 * Frame
 *
 * What surrounds the picture. Aspect bars, borders and device frames —
 * the difference between a clip and something that looks posted on purpose.
 * ------------------------------------------------------------------ */

const RATIOS = [
  ['239', '2.39:1 — anamorphic', 2.39], ['235', '2.35:1 — scope', 2.35],
  ['185', '1.85:1 — cinema', 1.85], ['178', '16:9', 16 / 9],
  ['166', '1.66:1 — European', 1.66], ['150', '3:2', 1.5],
  ['133', '4:3 — academy', 4 / 3], ['100', '1:1 — square', 1],
  ['080', '4:5 — portrait', 0.8], ['056', '9:16 — vertical', 9 / 16],
];
for (const [id, name, ratio] of RATIOS) {
  add(`crop${id}`, {
    name: `Frame ${name}`, group: 'Frame', tier: 'free', icon: '▭',
    params: { colour: { label: 'Bar colour', type: 'colour', def: '#000000' },
              amount: { label: 'Opacity', min: 0, max: 100, def: 100 } },
    draw(ctx, w, h, p) {
      const a = amt(p, 100);
      if (a <= 0.01) return;
      const current = w / h;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.colour || '#000000';
      if (current > ratio) {
        // The frame is wider than the target, so the bars go on the sides.
        const keep = h * ratio;
        const bar = (w - keep) / 2;
        ctx.fillRect(0, 0, bar, h);
        ctx.fillRect(w - bar, 0, bar, h);
      } else if (current < ratio) {
        const keep = w / ratio;
        const bar = (h - keep) / 2;
        ctx.fillRect(0, 0, w, bar);
        ctx.fillRect(0, h - bar, w, bar);
      }
      ctx.globalAlpha = 1;
    },
  });
}

const BORDERS = [
  ['borderThin', 'Thin border', 1.2, '#ffffff'], ['borderThick', 'Thick border', 4, '#ffffff'],
  ['borderBlack', 'Black border', 3, '#000000'], ['borderFilm', 'Film border', 2.5, '#e8e2d4'],
];
for (const [id, name, pct, colour] of BORDERS) {
  add(id, {
    name, group: 'Frame', tier: 'free', icon: '◻',
    params: { width: { label: 'Width', min: 0.2, max: 15, def: pct, step: 0.1 },
              colour: { label: 'Colour', type: 'colour', def: colour },
              radius: { label: 'Corner radius', min: 0, max: 60, def: 0 } },
    draw(ctx, w, h, p) {
      const bw = (Math.min(w, h) * (p.width ?? pct)) / 100;
      if (bw < 0.5) return;
      const r = (Math.min(w, h) * (p.radius ?? 0)) / 200;
      ctx.save();
      if (r > 0.5) {
        // Corners are rounded by clearing outside a rounded rect, so the
        // picture itself gets the curve rather than a square with a curve
        // drawn on top of it.
        const keep = scratch(w, h, 1);
        keep.ctx.drawImage(ctx.canvas, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bw, bw, w - bw * 2, h - bw * 2, r);
        else ctx.rect(bw, bw, w - bw * 2, h - bw * 2);
        ctx.clip();
        ctx.drawImage(keep.canvas, 0, 0);
        ctx.restore();
        ctx.save();
      }
      ctx.strokeStyle = p.colour || colour;
      ctx.lineWidth = bw * 2;               // half sits outside the path
      ctx.beginPath();
      if (r > 0.5 && ctx.roundRect) ctx.roundRect(bw, bw, w - bw * 2, h - bw * 2, r);
      else ctx.rect(bw, bw, w - bw * 2, h - bw * 2);
      ctx.stroke();
      ctx.restore();
    },
  });
}

add('filmPerfs', {
  name: 'Film strip edge', group: 'Frame', tier: 'free', icon: '🎞',
  params: { amount: { label: 'Opacity', min: 0, max: 100, def: 100 },
            size: { label: 'Size', min: 3, max: 20, def: 8 } },
  draw(ctx, w, h, p) {
    const a = amt(p, 100);
    if (a <= 0.01) return;
    const band = (w * (p.size ?? 8)) / 100;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = '#0b0b0b';
    ctx.fillRect(0, 0, band, h);
    ctx.fillRect(w - band, 0, band, h);
    ctx.fillStyle = '#e9e6dd';
    const ph = band * 0.55, gap = ph * 2.1;
    for (let y = gap * 0.4; y < h - ph; y += gap) {
      ctx.fillRect(band * 0.22, y, band * 0.56, ph);
      ctx.fillRect(w - band + band * 0.22, y, band * 0.56, ph);
    }
    ctx.restore();
  },
});

add('polaroidFrame', {
  name: 'Polaroid frame', group: 'Frame', tier: 'free', icon: '🖼',
  params: { amount: { label: 'Opacity', min: 0, max: 100, def: 100 } },
  draw(ctx, w, h, p) {
    const a = amt(p, 100);
    if (a <= 0.01) return;
    const src = snapshot(ctx, w, h, 0);
    const side = Math.min(w, h) * 0.07;
    const foot = side * 3.4;          // the wide bottom lip you write on
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = a;
    ctx.fillStyle = '#f6f3ea';
    ctx.fillRect(0, 0, w, h);
    const iw = w - side * 2, ih = h - side - foot;
    ctx.drawImage(src, 0, 0, w, h, side, side, iw, ih);
    ctx.globalAlpha = 1;
  },
});

const SPLITS = [
  { id: '2H', name: 'Split — side by side', cols: 2, rows: 1 },
  { id: '2V', name: 'Split — top and bottom', cols: 1, rows: 2 },
  { id: '3H', name: 'Split — three columns', cols: 3, rows: 1 },
  { id: '4', name: 'Split — four up', cols: 2, rows: 2 },
  { id: '9', name: 'Split — nine up', cols: 3, rows: 3 },
];
for (const sp of SPLITS) {
  add(`split${sp.id}`, {
    name: sp.name, group: 'Frame', tier: 'free', icon: '▥',
    params: { gap: { label: 'Gap', min: 0, max: 8, def: 1, step: 0.2 },
              colour: { label: 'Gap colour', type: 'colour', def: '#000000' } },
    draw(ctx, w, h, p) {
      const src = snapshot(ctx, w, h, 0);
      const gap = (Math.min(w, h) * (p.gap ?? 1)) / 100;
      ctx.fillStyle = p.colour || '#000000';
      ctx.fillRect(0, 0, w, h);
      const cw = (w - gap * (sp.cols - 1)) / sp.cols;
      const ch = (h - gap * (sp.rows - 1)) / sp.rows;
      for (let y = 0; y < sp.rows; y++) {
        for (let x = 0; x < sp.cols; x++) {
          // Each pane shows the whole frame, cropped to the pane's shape, so
          // the subject stays centred in every one instead of being sliced.
          const scale = Math.max(cw / w, ch / h);
          const sw = cw / scale, sh = ch / scale;
          ctx.drawImage(src, (w - sw) / 2, (h - sh) / 2, sw, sh,
            x * (cw + gap), y * (ch + gap), cw, ch);
        }
      }
    },
  });
}

/* ------------------------------------------------------------------ *
 * Weather and particles
 * ------------------------------------------------------------------ */

const PARTICLES = [
  { id: 'rain', name: 'Rain', colour: '#cfe4ff', len: 0.06, w: 1, fall: 1.6, drift: 0.1, count: 220, round: false },
  { id: 'heavyRain', name: 'Heavy rain', colour: '#dfeeff', len: 0.1, w: 1.6, fall: 2.4, drift: 0.18, count: 420, round: false },
  { id: 'snow', name: 'Snow', colour: '#ffffff', len: 0, w: 2.5, fall: 0.22, drift: 0.5, count: 200, round: true },
  { id: 'blizzardFall', name: 'Blizzard', colour: '#ffffff', len: 0, w: 3.4, fall: 0.6, drift: 1.2, count: 500, round: true },
  { id: 'embers', name: 'Embers', colour: '#ff9a3c', len: 0, w: 2, fall: -0.3, drift: 0.4, count: 140, round: true },
  { id: 'dustMotes', name: 'Dust motes', colour: '#fff2d0', len: 0, w: 1.6, fall: 0.05, drift: 0.25, count: 160, round: true },
  { id: 'confetti', name: 'Confetti', colour: '#ff4d88', len: 0.012, w: 4, fall: 0.5, drift: 0.6, count: 180, round: false },
  { id: 'sparkles', name: 'Sparkles', colour: '#fff6b0', len: 0, w: 2.2, fall: 0.1, drift: 0.3, count: 120, round: true },
  { id: 'bubbles', name: 'Bubbles', colour: '#bfefff', len: 0, w: 5, fall: -0.5, drift: 0.35, count: 90, round: true },
  { id: 'ashFall', name: 'Ash', colour: '#b8b2a8', len: 0, w: 2, fall: 0.3, drift: 0.45, count: 240, round: true },
];
for (const pt of PARTICLES) {
  add(pt.id, {
    name: pt.name, group: 'Weather', tier: 'free', icon: '❄',
    params: { amount: { label: 'Amount', min: 0, max: 100, def: 55 },
              speed: { label: 'Speed', min: 10, max: 300, def: 100 },
              colour: { label: 'Colour', type: 'colour', def: pt.colour },
              size: { label: 'Size', min: 20, max: 300, def: 100 } },
    /*
     * Positions come from the seed and the clock, never from state carried
     * between frames. That is what lets you scrub backwards through rain and
     * see the same drops — a particle system that integrates over frames
     * cannot be scrubbed at all, and cannot be exported out of order.
     */
    draw(ctx, w, h, p, { local }) {
      const a = amt(p, 55);
      if (a <= 0.01) return;
      const n = Math.round(pt.count * a);
      const t = (local || 0) * ((p.speed ?? 100) / 100);
      const sz = (p.size ?? 100) / 100;
      const colour = p.colour || pt.colour;
      const scale = Math.max(w, h) / 900;
      ctx.save();
      ctx.globalAlpha = clamp01(a * 0.9);
      ctx.fillStyle = colour;
      ctx.strokeStyle = colour;
      ctx.lineWidth = pt.w * sz * scale;
      for (let i = 0; i < n; i++) {
        const speed = pt.fall * (0.6 + noise01(i * 3.7) * 0.8);
        // Wrapped with a modulo, so a particle leaving one edge is the same
        // particle arriving at the other — no pop, no bookkeeping.
        let y = (noise01(i * 1.7) + t * speed * 0.35) % 1;
        if (y < 0) y += 1;
        const sway = Math.sin(t * (0.7 + noise01(i * 5.1)) + i) * pt.drift * 0.05;
        let x = (noise01(i * 2.3) + sway + t * 0.02 * pt.drift) % 1;
        if (x < 0) x += 1;
        const px = x * w, py = y * h;
        if (pt.round) {
          const r = Math.max(0.4, pt.w * 0.5 * sz * scale * (0.5 + noise01(i * 7.9)));
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
        } else if (pt.len > 0.02) {
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + pt.drift * w * 0.02, py + pt.len * h * sz);
          ctx.stroke();
        } else {
          const s2 = pt.w * sz * scale;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(t * 3 + i);
          ctx.fillRect(-s2 / 2, -s2 / 4, s2, s2 / 2);
          ctx.restore();
        }
      }
      ctx.restore();
    },
  });
}

/* ------------------------------------------------------------------ *
 * Export
 * ------------------------------------------------------------------ */
export const EFFECT_PACKS = out;

/** Group -> ids, so a list this long can be browsed rather than scrolled. */
export const EFFECT_PACK_GROUPS = Object.entries(out).reduce((acc, [id, e]) => {
  (acc[e.group || 'More'] ||= []).push(id);
  return acc;
}, {});
