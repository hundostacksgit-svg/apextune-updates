/*
 * Effects.
 *
 * A clip carries a stack of these and the renderer runs them in order, on the
 * clip's own scratch canvas, after the grade and before the blend. Each one is
 * a pure function of (ctx, w, h, params, ctx2) where ctx2 carries the frame
 * time and the clip, because the interesting effects are the ones that move.
 *
 * Two rules that keep this fast enough to scrub:
 *   1. Scratch canvases are pooled and reused, never allocated per frame.
 *   2. An effect with a zero amount returns immediately — the renderer does not
 *      have to know which effects are no-ops.
 *
 * The anime and TikTok looks people actually want (impact frames, speed lines,
 * chromatic shake, zoom blur on a beat) are here as first-class effects rather
 * than something you fake with six keyframes.
 */

import { valueAt } from './project.js';

/* ------------------------------------------------------------------ */
/* scratch pool                                                        */
/* ------------------------------------------------------------------ */

const pool = [];
function scratch(w, h, index = 0) {
  while (pool.length <= index) {
    const c = document.createElement('canvas');
    pool.push({ canvas: c, ctx: c.getContext('2d', { willReadFrequently: false }) });
  }
  const slot = pool[index];
  if (slot.canvas.width !== w || slot.canvas.height !== h) {
    slot.canvas.width = w;
    slot.canvas.height = h;
  } else {
    slot.ctx.clearRect(0, 0, w, h);
  }
  return slot;
}

/** Copy the current frame out so an effect can composite against itself. */
function snapshot(ctx, w, h, index = 0) {
  const s = scratch(w, h, index);
  s.ctx.clearRect(0, 0, w, h);
  s.ctx.drawImage(ctx.canvas, 0, 0);
  return s.canvas;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** Isolate one colour channel of `src` onto a scratch canvas. */
function channel(src, w, h, which, index) {
  const s = scratch(w, h, index);
  s.ctx.clearRect(0, 0, w, h);
  s.ctx.drawImage(src, 0, 0);
  s.ctx.globalCompositeOperation = 'multiply';
  s.ctx.fillStyle = which === 'r' ? '#ff0000' : which === 'g' ? '#00ff00' : '#0000ff';
  s.ctx.fillRect(0, 0, w, h);
  s.ctx.globalCompositeOperation = 'source-over';
  return s.canvas;
}

/** A repeatable pseudo-random from a seed, so shake doesn't jitter on redraw. */
function noise(seed) {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/* ------------------------------------------------------------------ */
/* the effects                                                         */
/* ------------------------------------------------------------------ */

export const EFFECTS = {

  /* ---------------- motion ---------------- */

  motionBlur: {
    name: 'Motion blur', group: 'Motion', tier: 'free', icon: '⟿',
    params: { amount: { label: 'Amount', min: 0, max: 100, def: 45 },
              samples: { label: 'Quality', min: 2, max: 16, def: 6, step: 1 } },
    /*
     * Real motion blur, not a directional smear: the clip's transform is
     * sampled a few times across the frame's exposure window and the results
     * are stacked. That means a keyframed push, a shake and a speed ramp all
     * blur correctly and in the right direction, because the blur comes from
     * the actual movement rather than a number someone typed.
     */
    draw(ctx, w, h, p, { clip, local, fps, redrawClip }) {
      const amount = (p.amount ?? 45) / 100;
      if (amount <= 0.01 || !redrawClip) return;
      const samples = Math.max(2, Math.round(p.samples ?? 6));
      const shutter = (1 / (fps || 30)) * amount;

      const base = snapshot(ctx, w, h, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = 1 / samples;
      for (let i = 0; i < samples; i++) {
        const t = local + shutter * (i / (samples - 1) - 0.5);
        const frame = redrawClip(t);
        ctx.drawImage(frame || base, 0, 0);
      }
      ctx.globalAlpha = 1;
    },
  },

  zoomBlur: {
    name: 'Zoom blur', group: 'Motion', tier: 'free', icon: '◎',
    params: { amount: { label: 'Amount', min: 0, max: 100, def: 40 },
              cx: { label: 'Centre X', min: 0, max: 100, def: 50 },
              cy: { label: 'Centre Y', min: 0, max: 100, def: 50 } },
    draw(ctx, w, h, p) {
      const amount = (p.amount ?? 40) / 100;
      if (amount <= 0.01) return;
      const src = snapshot(ctx, w, h, 0);
      const cx = ((p.cx ?? 50) / 100) * w;
      const cy = ((p.cy ?? 50) / 100) * h;
      const steps = 8;
      ctx.globalAlpha = 0.5;
      for (let i = 1; i <= steps; i++) {
        const s = 1 + (amount * 0.28 * i) / steps;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(s, s);
        ctx.translate(-cx, -cy);
        ctx.globalAlpha = 0.42 / i;
        ctx.drawImage(src, 0, 0);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },
  },

  shake: {
    name: 'Camera shake', group: 'Motion', tier: 'free', icon: '≈',
    params: { amount: { label: 'Amount', min: 0, max: 100, def: 30 },
              speed: { label: 'Speed', min: 1, max: 60, def: 22 },
              rotate: { label: 'Rotation', min: 0, max: 100, def: 20 } },
    draw(ctx, w, h, p, { local }) {
      const amount = (p.amount ?? 30) / 100;
      if (amount <= 0.01) return;
      const speed = p.speed ?? 22;
      const src = snapshot(ctx, w, h, 0);
      const dx = noise(local * speed) * w * 0.035 * amount;
      const dy = noise(local * speed + 91.7) * h * 0.035 * amount;
      const rot = noise(local * speed + 41.3) * 0.04 * amount * ((p.rotate ?? 20) / 100);
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(w / 2 + dx, h / 2 + dy);
      ctx.rotate(rot);
      // Scale up slightly so the shake never exposes the frame edge.
      const over = 1 + 0.06 * amount;
      ctx.scale(over, over);
      ctx.translate(-w / 2, -h / 2);
      ctx.drawImage(src, 0, 0);
      ctx.restore();
    },
  },

  /* ---------------- colour / light ---------------- */

  rgbSplit: {
    name: 'Chromatic split', group: 'Colour', tier: 'free', icon: '⧉',
    params: { amount: { label: 'Amount', min: 0, max: 100, def: 30 },
              angle: { label: 'Angle', min: 0, max: 360, def: 0 },
              pulse: { label: 'Pulse to beat', min: 0, max: 100, def: 0 } },
    draw(ctx, w, h, p, { local, beatPhase }) {
      let amount = (p.amount ?? 30) / 100;
      // Pulsing to the beat is the single most-used effect in the edits people
      // are trying to copy, so it is a slider and not a keyframing exercise.
      if ((p.pulse ?? 0) > 0 && beatPhase !== undefined) {
        amount *= 1 + ((p.pulse / 100) * 2.5 * (1 - beatPhase));
      }
      if (amount <= 0.005) return;
      const rad = ((p.angle ?? 0) * Math.PI) / 180;
      const dx = Math.cos(rad) * w * 0.02 * amount;
      const dy = Math.sin(rad) * h * 0.02 * amount;

      const src = snapshot(ctx, w, h, 0);
      const r = channel(src, w, h, 'r', 1);
      const g = channel(src, w, h, 'g', 2);
      const b = channel(src, w, h, 'b', 3);

      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(r, dx, dy);
      ctx.drawImage(g, 0, 0);
      ctx.drawImage(b, -dx, -dy);
      ctx.globalCompositeOperation = 'source-over';
      void local;
    },
  },

  glow: {
    name: 'Glow / bloom', group: 'Colour', tier: 'free', icon: '✺',
    params: { amount: { label: 'Amount', min: 0, max: 100, def: 40 },
              radius: { label: 'Radius', min: 1, max: 60, def: 18 },
              threshold: { label: 'Only highlights', min: 0, max: 100, def: 45 } },
    draw(ctx, w, h, p) {
      const amount = (p.amount ?? 40) / 100;
      if (amount <= 0.01) return;
      const src = snapshot(ctx, w, h, 0);
      const s = scratch(w, h, 1);
      // Crush everything below the threshold to black so only the bright parts
      // bloom — otherwise the whole frame just goes milky.
      const cut = (p.threshold ?? 45) / 100;
      s.ctx.clearRect(0, 0, w, h);
      s.ctx.filter = `brightness(${(1 + cut * 1.6).toFixed(2)}) contrast(${(1 + cut * 3).toFixed(2)}) blur(${p.radius ?? 18}px)`;
      s.ctx.drawImage(src, 0, 0);
      s.ctx.filter = 'none';

      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = amount;
      ctx.drawImage(s.canvas, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  },

  flash: {
    name: 'Flash', group: 'Colour', tier: 'free', icon: '⚡',
    params: { amount: { label: 'Strength', min: 0, max: 100, def: 70 },
              every: { label: 'Every (s)', min: 0, max: 8, def: 0, step: 0.05 },
              length: { label: 'Length (s)', min: 0.02, max: 1, def: 0.09, step: 0.01 },
              colour: { label: 'Colour', type: 'colour', def: '#ffffff' } },
    draw(ctx, w, h, p, { local }) {
      const strength = (p.amount ?? 70) / 100;
      if (strength <= 0.01) return;
      const every = p.every ?? 0;
      const len = p.length ?? 0.09;
      // every = 0 means one flash at the start of the clip.
      const phase = every > 0 ? local % every : local;
      if (phase > len) return;
      ctx.globalAlpha = strength * (1 - phase / len);
      ctx.fillStyle = p.colour || '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    },
  },

  invertPulse: {
    name: 'Impact frame', group: 'Anime', tier: 'free', icon: '◐',
    params: { at: { label: 'At (s)', min: 0, max: 30, def: 0, step: 0.02 },
              length: { label: 'Length (s)', min: 0.02, max: 0.6, def: 0.08, step: 0.01 },
              mode: { label: 'Style', type: 'select', def: 'invert',
                      options: [['invert', 'Invert'], ['white', 'White'], ['black', 'Black'], ['edge', 'Line art']] } },
    /* The one-or-two frame slam an anime cut lands on. Doing it by hand means
       splitting the clip and adding a colour matte; here it is one effect. */
    draw(ctx, w, h, p, { local }) {
      const at = p.at ?? 0;
      const len = p.length ?? 0.08;
      if (local < at || local > at + len) return;
      const mode = p.mode || 'invert';
      if (mode === 'white' || mode === 'black') {
        ctx.fillStyle = mode === 'white' ? '#fff' : '#000';
        ctx.fillRect(0, 0, w, h);
        return;
      }
      const src = snapshot(ctx, w, h, 0);
      ctx.clearRect(0, 0, w, h);
      if (mode === 'edge') {
        ctx.filter = 'grayscale(1) contrast(6) invert(1)';
        ctx.drawImage(src, 0, 0);
        ctx.filter = 'none';
        return;
      }
      ctx.filter = 'invert(1)';
      ctx.drawImage(src, 0, 0);
      ctx.filter = 'none';
    },
  },

  /* ---------------- anime ---------------- */

  speedLines: {
    name: 'Speed lines', group: 'Anime', tier: 'free', icon: '≣',
    params: { amount: { label: 'Density', min: 0, max: 100, def: 55 },
              length: { label: 'Length', min: 5, max: 100, def: 45 },
              colour: { label: 'Colour', type: 'colour', def: '#ffffff' },
              spin: { label: 'Movement', min: 0, max: 100, def: 40 } },
    /* Drawn, not a stock overlay: they scale to any resolution, take the
       colour you want, and cost nothing to load. */
    draw(ctx, w, h, p, { local }) {
      const density = Math.round((p.amount ?? 55) * 1.4);
      if (density <= 0) return;
      const cx = w / 2, cy = h / 2;
      const inner = Math.min(w, h) * 0.22;
      const outer = Math.hypot(w, h) * 0.75;
      const len = (p.length ?? 45) / 100;
      const drift = local * (p.spin ?? 40) * 0.004;

      ctx.save();
      ctx.strokeStyle = p.colour || '#ffffff';
      ctx.lineCap = 'round';
      for (let i = 0; i < density; i++) {
        const seed = i * 12.9898;
        const angle = (i / density) * Math.PI * 2 + noise(seed) * 0.05 + drift;
        const start = inner + Math.abs(noise(seed + 3)) * inner * 0.8;
        const end = start + (outer - start) * (0.35 + Math.abs(noise(seed + 7)) * len);
        ctx.globalAlpha = 0.25 + Math.abs(noise(seed + 11)) * 0.55;
        ctx.lineWidth = 1 + Math.abs(noise(seed + 13)) * (Math.min(w, h) / 200);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * start, cy + Math.sin(angle) * start);
        ctx.lineTo(cx + Math.cos(angle) * end, cy + Math.sin(angle) * end);
        ctx.stroke();
      }
      ctx.restore();
    },
  },

  halftone: {
    name: 'Manga halftone', group: 'Anime', tier: 'creator', icon: '⁘',
    params: { amount: { label: 'Amount', min: 0, max: 100, def: 60 },
              size: { label: 'Dot size', min: 2, max: 24, def: 6 } },
    draw(ctx, w, h, p) {
      const amount = (p.amount ?? 60) / 100;
      if (amount <= 0.02) return;
      const src = snapshot(ctx, w, h, 0);
      const step = Math.max(2, p.size ?? 6);
      const s = scratch(w, h, 1);
      s.ctx.clearRect(0, 0, w, h);
      s.ctx.drawImage(src, 0, 0);
      let data;
      try { data = s.ctx.getImageData(0, 0, w, h).data; } catch { return; }

      const dots = scratch(w, h, 2);
      dots.ctx.clearRect(0, 0, w, h);
      dots.ctx.fillStyle = '#000';
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          const i = (y * w + x) * 4;
          const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
          const r = (1 - lum) * step * 0.62;
          if (r < 0.4) continue;
          dots.ctx.beginPath();
          dots.ctx.arc(x + step / 2, y + step / 2, r, 0, Math.PI * 2);
          dots.ctx.fill();
        }
      }
      ctx.globalAlpha = amount;
      ctx.drawImage(dots.canvas, 0, 0);
      ctx.globalAlpha = 1;
    },
  },

  posterize: {
    name: 'Cel shade', group: 'Anime', tier: 'free', icon: '▤',
    params: { levels: { label: 'Levels', min: 2, max: 16, def: 5, step: 1 },
              outline: { label: 'Outline', min: 0, max: 100, def: 35 } },
    draw(ctx, w, h, p) {
      const levels = Math.max(2, Math.round(p.levels ?? 5));
      const src = snapshot(ctx, w, h, 0);
      const s = scratch(w, h, 1);
      s.ctx.clearRect(0, 0, w, h);
      s.ctx.drawImage(src, 0, 0);
      let img;
      try { img = s.ctx.getImageData(0, 0, w, h); } catch { return; }
      const d = img.data;
      const stepSize = 255 / (levels - 1);
      for (let i = 0; i < d.length; i += 4) {
        d[i] = Math.round(d[i] / stepSize) * stepSize;
        d[i + 1] = Math.round(d[i + 1] / stepSize) * stepSize;
        d[i + 2] = Math.round(d[i + 2] / stepSize) * stepSize;
      }
      s.ctx.putImageData(img, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(s.canvas, 0, 0);

      const outline = (p.outline ?? 35) / 100;
      if (outline > 0.02) {
        // Cheap edge detect: the difference between the frame and a blurred
        // copy of itself is where the detail is.
        const e = scratch(w, h, 2);
        e.ctx.clearRect(0, 0, w, h);
        e.ctx.filter = 'blur(2px)';
        e.ctx.drawImage(src, 0, 0);
        e.ctx.filter = 'none';
        e.ctx.globalCompositeOperation = 'difference';
        e.ctx.drawImage(src, 0, 0);
        e.ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = outline;
        ctx.globalCompositeOperation = 'multiply';
        ctx.filter = 'grayscale(1) invert(1) contrast(3)';
        ctx.drawImage(e.canvas, 0, 0);
        ctx.filter = 'none';
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
    },
  },

  /* ---------------- texture ---------------- */

  pixelate: {
    name: 'Pixelate', group: 'Texture', tier: 'free', icon: '▦',
    params: { size: { label: 'Block size', min: 2, max: 80, def: 12 } },
    draw(ctx, w, h, p) {
      const size = Math.max(2, p.size ?? 12);
      const src = snapshot(ctx, w, h, 0);
      const sw = Math.max(1, Math.round(w / size));
      const sh = Math.max(1, Math.round(h / size));
      const s = scratch(sw, sh, 1);
      s.ctx.clearRect(0, 0, sw, sh);
      s.ctx.drawImage(src, 0, 0, sw, sh);
      ctx.clearRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(s.canvas, 0, 0, sw, sh, 0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
    },
  },

  scanlines: {
    name: 'CRT / scanlines', group: 'Texture', tier: 'free', icon: '☰',
    params: { amount: { label: 'Amount', min: 0, max: 100, def: 40 },
              gap: { label: 'Spacing', min: 2, max: 16, def: 4 },
              curve: { label: 'Screen curve', min: 0, max: 100, def: 0 } },
    draw(ctx, w, h, p) {
      const amount = (p.amount ?? 40) / 100;
      if (amount <= 0.01) return;
      const gap = Math.max(2, p.gap ?? 4);
      ctx.globalAlpha = amount * 0.55;
      ctx.fillStyle = '#000';
      for (let y = 0; y < h; y += gap) ctx.fillRect(0, y, w, Math.max(1, gap / 2));
      ctx.globalAlpha = 1;
      const curve = (p.curve ?? 0) / 100;
      if (curve > 0.02) {
        const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, `rgba(0,0,0,${(curve * 0.7).toFixed(2)})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
    },
  },

  mirror: {
    name: 'Mirror', group: 'Texture', tier: 'free', icon: '⇋',
    params: { mode: { label: 'Axis', type: 'select', def: 'h',
                      options: [['h', 'Left / right'], ['v', 'Top / bottom'], ['quad', 'Four-way']] } },
    draw(ctx, w, h, p) {
      const src = snapshot(ctx, w, h, 0);
      const mode = p.mode || 'h';
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(src, 0, 0);
      ctx.save();
      if (mode === 'h' || mode === 'quad') {
        ctx.save();
        ctx.translate(w, 0); ctx.scale(-1, 1);
        ctx.drawImage(src, 0, 0, w / 2, h, 0, 0, w / 2, h);
        ctx.restore();
      }
      if (mode === 'v' || mode === 'quad') {
        ctx.save();
        ctx.translate(0, h); ctx.scale(1, -1);
        ctx.drawImage(src, 0, 0, w, h / 2, 0, 0, w, h / 2);
        ctx.restore();
      }
      ctx.restore();
    },
  },

  vhsWobble: {
    name: 'VHS wobble', group: 'Texture', tier: 'creator', icon: '〰',
    params: { amount: { label: 'Amount', min: 0, max: 100, def: 40 },
              bands: { label: 'Bands', min: 2, max: 60, def: 18 } },
    draw(ctx, w, h, p, { local }) {
      const amount = (p.amount ?? 40) / 100;
      if (amount <= 0.01) return;
      const src = snapshot(ctx, w, h, 0);
      const bands = Math.max(2, Math.round(p.bands ?? 18));
      const bh = h / bands;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < bands; i++) {
        const y = i * bh;
        const shift = noise(i * 3.7 + Math.floor(local * 12)) * w * 0.02 * amount;
        ctx.drawImage(src, 0, y, w, bh, shift, y, w, bh);
      }
    },
  },

  /* ---------------- lens ---------------- */

  prism: {
    name: 'Prism edges', group: 'Lens', tier: 'creator', icon: '◇',
    params: { amount: { label: 'Amount', min: 0, max: 100, def: 35 } },
    /* Chromatic aberration that grows toward the edges, the way a real lens
       does — rather than a flat RGB offset across the whole frame. */
    draw(ctx, w, h, p) {
      const amount = (p.amount ?? 35) / 100;
      if (amount <= 0.01) return;
      const src = snapshot(ctx, w, h, 0);
      const r = channel(src, w, h, 'r', 1);
      const b = channel(src, w, h, 'b', 2);
      const g = channel(src, w, h, 'g', 3);
      const grow = 1 + 0.012 * amount;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(g, 0, 0);
      ctx.save();
      ctx.translate(w / 2, h / 2); ctx.scale(grow, grow); ctx.translate(-w / 2, -h / 2);
      ctx.drawImage(r, 0, 0);
      ctx.restore();
      ctx.save();
      ctx.translate(w / 2, h / 2); ctx.scale(2 - grow, 2 - grow); ctx.translate(-w / 2, -h / 2);
      ctx.drawImage(b, 0, 0);
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
    },
  },

  lightLeak: {
    name: 'Light leak', group: 'Lens', tier: 'free', icon: '🔆',
    params: { amount: { label: 'Amount', min: 0, max: 100, def: 45 },
              colour: { label: 'Colour', type: 'colour', def: '#ff9a4d' },
              move: { label: 'Drift', min: 0, max: 100, def: 30 } },
    draw(ctx, w, h, p, { local }) {
      const amount = (p.amount ?? 45) / 100;
      if (amount <= 0.01) return;
      const drift = Math.sin(local * ((p.move ?? 30) / 100) * 1.4) * 0.18;
      const g = ctx.createLinearGradient(w * (0.72 + drift), 0, w * 1.05, h);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.6, hexToRgba(p.colour || '#ff9a4d', 0.55 * amount));
      g.addColorStop(1, hexToRgba(p.colour || '#ff9a4d', 0.9 * amount));
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    },
  },

  /* ---------------- utility ---------------- */

  blurRegion: {
    name: 'Blur a spot', group: 'Utility', tier: 'free', icon: '◍',
    params: { x: { label: 'X', min: 0, max: 100, def: 50 },
              y: { label: 'Y', min: 0, max: 100, def: 50 },
              size: { label: 'Size', min: 2, max: 100, def: 18 },
              strength: { label: 'Strength', min: 1, max: 60, def: 18 },
              shape: { label: 'Shape', type: 'select', def: 'ellipse',
                       options: [['ellipse', 'Oval'], ['rect', 'Rectangle'], ['pixel', 'Pixelate']] } },
    /* Hiding a face, a number plate or an address. Pinned to a motion track it
       follows the thing on its own. */
    draw(ctx, w, h, p) {
      const src = snapshot(ctx, w, h, 0);
      const cx = ((p.x ?? 50) / 100) * w;
      const cy = ((p.y ?? 50) / 100) * h;
      const rx = ((p.size ?? 18) / 100) * w * 0.5;
      const ry = rx * (h / w) * (w / h);          // keep it round on any ratio
      const s = scratch(w, h, 1);
      s.ctx.clearRect(0, 0, w, h);
      if (p.shape === 'pixel') {
        const block = Math.max(3, (p.strength ?? 18) / 2);
        const sw = Math.max(1, Math.round(w / block));
        const sh = Math.max(1, Math.round(h / block));
        const tiny = scratch(sw, sh, 2);
        tiny.ctx.drawImage(src, 0, 0, sw, sh);
        s.ctx.imageSmoothingEnabled = false;
        s.ctx.drawImage(tiny.canvas, 0, 0, sw, sh, 0, 0, w, h);
        s.ctx.imageSmoothingEnabled = true;
      } else {
        s.ctx.filter = `blur(${p.strength ?? 18}px)`;
        s.ctx.drawImage(src, 0, 0);
        s.ctx.filter = 'none';
      }
      ctx.save();
      ctx.beginPath();
      if (p.shape === 'rect') ctx.rect(cx - rx, cy - ry, rx * 2, ry * 2);
      else ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(s.canvas, 0, 0);
      ctx.restore();
    },
  },

  letterbox: {
    name: 'Letterbox', group: 'Utility', tier: 'free', icon: '▭',
    params: { amount: { label: 'Bar height', min: 0, max: 40, def: 12 },
              colour: { label: 'Colour', type: 'colour', def: '#000000' } },
    draw(ctx, w, h, p) {
      const bar = ((p.amount ?? 12) / 100) * h;
      if (bar < 1) return;
      ctx.fillStyle = p.colour || '#000';
      ctx.fillRect(0, 0, w, bar);
      ctx.fillRect(0, h - bar, w, bar);
    },
  },
};

function hexToRgba(hex, alpha) {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp01(alpha)})`;
}

export const EFFECT_LIST = Object.entries(EFFECTS).map(([id, e]) => ({ id, ...e }));

export const EFFECT_GROUPS = [...new Set(EFFECT_LIST.map((e) => e.group))];

/** A new effect instance with its declared defaults filled in. */
export function makeEffect(id) {
  const def = EFFECTS[id];
  if (!def) return null;
  const params = {};
  for (const [key, spec] of Object.entries(def.params || {})) params[key] = spec.def;
  return { id, on: true, params };
}

/**
 * Run a clip's effect stack. Called by the renderer with the clip already
 * drawn and graded onto `ctx`.
 *
 * `redrawClip(t)` lets an effect ask for the clip re-rendered at another time —
 * only motion blur needs it, and the renderer passes null when it can't.
 */
export function applyEffects(ctx, w, h, clip, context) {
  const stack = clip.effects;
  if (!stack?.length) return;
  for (const fx of stack) {
    if (!fx || fx.on === false) continue;
    const def = EFFECTS[fx.id];
    if (!def) continue;
    // Any parameter can be keyframed as "effects.<id>.<param>".
    const params = { ...fx.params };
    for (const key of Object.keys(params)) {
      const prop = `effects.${fx.id}.${key}`;
      if (clip.keyframes?.[prop]) params[key] = valueAt(clip, prop, context.local, params[key]);
    }
    try {
      def.draw(ctx, w, h, params, context);
    } catch {
      // One broken effect must not take the whole frame down; a black preview
      // is far worse than a missing glow.
    }
  }
}

export function hasEffect(clip, id) {
  return Boolean(clip.effects?.some((f) => f.id === id && f.on !== false));
}
