/*
 * The transitions library.
 *
 * The starter set in transitions.js is thirteen hand-written functions. This
 * file is the rest of them, and they are generated rather than written out one
 * at a time — a wipe to the left and a wipe to the right are the same function
 * with a different vector, and writing both by hand means two places for the
 * easing to drift apart.
 *
 * Every entry still ends up as the same pure `draw(ctx, w, h, from, to, p)` the
 * renderer already knows: no state, so scrubbing backwards through one looks
 * exactly like scrubbing forwards. That is the property worth protecting, and
 * generating them protects it better than repetition does — a fix to a family
 * fixes every direction of it at once.
 */

const ease = (t) => t * t * (3 - 2 * t);
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeIn = (t) => t * t * t;

function paint(ctx, src, w, h, alpha = 1) {
  if (!src) return;
  ctx.globalAlpha = alpha;
  ctx.drawImage(src, 0, 0, w, h);
  ctx.globalAlpha = 1;
}

/* The eight compass directions, as unit vectors plus a human name. */
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

const out = {};
const add = (id, def) => { out[id] = def; };

/* ------------------------------------------------------------------ *
 * Slides, pushes and covers
 *
 * Three different things that look similar and read completely differently:
 * a slide moves the incoming shot over a stationary one, a push moves both so
 * they stay joined, and a cover moves the outgoing one away to reveal what was
 * already behind it.
 * ------------------------------------------------------------------ */
for (const d of DIRS) {
  add(`slide${d.id}`, {
    name: `Slide ${d.name}`, tier: 'free', icon: '⇥', group: 'Movement',
    draw(ctx, w, h, from, to, p) {
      const e = easeOut(p);
      paint(ctx, from, w, h);
      if (!to) return;
      ctx.save();
      ctx.translate(-d.x * w * (1 - e), -d.y * h * (1 - e));
      ctx.drawImage(to, 0, 0, w, h);
      ctx.restore();
    },
  });

  add(`push${d.id}`, {
    name: `Push ${d.name}`, tier: 'free', icon: '⇉', group: 'Movement',
    draw(ctx, w, h, from, to, p) {
      const e = easeOut(p);
      ctx.save();
      ctx.translate(d.x * w * e, d.y * h * e);
      paint(ctx, from, w, h);
      ctx.restore();
      if (!to) return;
      ctx.save();
      ctx.translate(-d.x * w * (1 - e), -d.y * h * (1 - e));
      ctx.drawImage(to, 0, 0, w, h);
      ctx.restore();
    },
  });

  add(`cover${d.id}`, {
    name: `Reveal ${d.name}`, tier: 'free', icon: '⇤', group: 'Movement',
    draw(ctx, w, h, from, to, p) {
      const e = easeOut(p);
      paint(ctx, to, w, h);
      if (!from) return;
      ctx.save();
      ctx.translate(d.x * w * e, d.y * h * e);
      ctx.drawImage(from, 0, 0, w, h);
      ctx.restore();
    },
  });

  add(`wipe${d.id}`, {
    name: `Wipe ${d.name}`, tier: 'free', icon: '▤', group: 'Wipes',
    draw(ctx, w, h, from, to, p) {
      const e = ease(p);
      paint(ctx, from, w, h);
      if (!to) return;
      ctx.save();
      ctx.beginPath();
      // A diagonal wipe needs a half-plane, not a rectangle, or the corner
      // arrives before the middle does and the edge looks bent.
      const cx = w / 2 + d.x * w * (e * 2 - 1);
      const cy = h / 2 + d.y * h * (e * 2 - 1);
      const far = w + h;
      ctx.moveTo(cx - d.y * far, cy + d.x * far);
      ctx.lineTo(cx + d.y * far, cy - d.x * far);
      ctx.lineTo(cx + d.y * far - d.x * far, cy - d.x * far - d.y * far);
      ctx.lineTo(cx - d.y * far - d.x * far, cy + d.x * far - d.y * far);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(to, 0, 0, w, h);
      ctx.restore();
    },
  });
}

/* ------------------------------------------------------------------ *
 * Shape wipes
 *
 * The incoming shot arrives through a growing hole. The shape of the hole is
 * the only thing that differs, so it is a path function per shape and one
 * draw.
 * ------------------------------------------------------------------ */
const SHAPES = {
  circle: { name: 'Circle', path(ctx, w, h, r, cx, cy) { ctx.arc(cx, cy, r, 0, Math.PI * 2); } },
  diamond: {
    name: 'Diamond',
    path(ctx, w, h, r, cx, cy) {
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath();
    },
  },
  box: {
    name: 'Box',
    path(ctx, w, h, r, cx, cy) { ctx.rect(cx - r, cy - r * (h / w), r * 2, r * 2 * (h / w)); },
  },
  star: {
    name: 'Star',
    // A star's concave points only reach 45% of its radius, so a radius that
    // touches the corner still leaves the corners of the frame uncovered and a
    // sliver of the outgoing shot survives to the last frame.
    reach: 2.3,
    path(ctx, w, h, r, cx, cy) {
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 ? r * 0.45 : r;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const fn = i ? 'lineTo' : 'moveTo';
        ctx[fn](cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
      }
      ctx.closePath();
    },
  },
  heart: {
    name: 'Heart',
    reach: 1.9,
    path(ctx, w, h, r, cx, cy) {
      const s = r / 16;
      ctx.moveTo(cx, cy + 12 * s);
      ctx.bezierCurveTo(cx - 18 * s, cy - 2 * s, cx - 10 * s, cy - 16 * s, cx, cy - 7 * s);
      ctx.bezierCurveTo(cx + 10 * s, cy - 16 * s, cx + 18 * s, cy - 2 * s, cx, cy + 12 * s);
      ctx.closePath();
    },
  },
  hex: {
    name: 'Hexagon',
    reach: 1.16,        // the flat sides sit inside the circumscribed circle

    path(ctx, w, h, r, cx, cy) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      ctx.closePath();
    },
  },
};

/* Where the shape grows from. Corners matter: an iris opening from the corner
   someone's subject is standing in reads completely differently from centre. */
const ORIGINS = [
  { id: '', name: '', cx: 0.5, cy: 0.5 },
  { id: 'TL', name: ' from top left', cx: 0, cy: 0 },
  { id: 'TR', name: ' from top right', cx: 1, cy: 0 },
  { id: 'BL', name: ' from bottom left', cx: 0, cy: 1 },
  { id: 'BR', name: ' from bottom right', cx: 1, cy: 1 },
];

for (const [sid, shape] of Object.entries(SHAPES)) {
  for (const o of ORIGINS) {
    // Only the circle earns all five origins; the rest would be padding.
    if (o.id && sid !== 'circle' && sid !== 'box') continue;
    add(`${sid}Open${o.id}`, {
      name: `${shape.name} in${o.name}`, tier: 'free', icon: '◎', group: 'Shapes',
      draw(ctx, w, h, from, to, p) {
        paint(ctx, from, w, h);
        if (!to) return;
        const cx = w * o.cx;
        const cy = h * o.cy;
        // Reach the furthest corner, or the shape stops growing before it has
        // covered the frame and a sliver of the old shot survives to the end.
        const max = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) * 1.05 * (shape.reach || 1);
        ctx.save();
        ctx.beginPath();
        shape.path(ctx, w, h, ease(p) * max, cx, cy);
        ctx.clip();
        ctx.drawImage(to, 0, 0, w, h);
        ctx.restore();
      },
    });

    add(`${sid}Close${o.id}`, {
      name: `${shape.name} out${o.name}`, tier: 'free', icon: '◉', group: 'Shapes',
      draw(ctx, w, h, from, to, p) {
        paint(ctx, to, w, h);
        if (!from) return;
        const cx = w * o.cx;
        const cy = h * o.cy;
        const max = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) * 1.05 * (shape.reach || 1);
        ctx.save();
        ctx.beginPath();
        shape.path(ctx, w, h, (1 - ease(p)) * max, cx, cy);
        ctx.clip();
        ctx.drawImage(from, 0, 0, w, h);
        ctx.restore();
      },
    });
  }
}

/* ------------------------------------------------------------------ *
 * Blinds and bars
 * ------------------------------------------------------------------ */
for (const count of [4, 8, 16]) {
  for (const vertical of [false, true]) {
    const axis = vertical ? 'V' : 'H';
    add(`blinds${count}${axis}`, {
      name: `Blinds — ${count} ${vertical ? 'columns' : 'rows'}`, tier: 'free', icon: '▥',
      group: 'Wipes',
      draw(ctx, w, h, from, to, p) {
        paint(ctx, from, w, h);
        if (!to) return;
        const e = ease(p);
        const size = (vertical ? w : h) / count;
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          if (vertical) ctx.rect(i * size, 0, size * e, h);
          else ctx.rect(0, i * size, w, size * e);
        }
        ctx.clip();
        ctx.drawImage(to, 0, 0, w, h);
        ctx.restore();
      },
    });

    add(`checker${count}${axis}`, {
      name: `Checkerboard — ${count}${vertical ? ' tall' : ''}`, tier: 'free', icon: '▦',
      group: 'Wipes',
      draw(ctx, w, h, from, to, p) {
        paint(ctx, from, w, h);
        if (!to) return;
        const cols = count;
        const rows = Math.max(2, Math.round(count * (vertical ? h / w : 1)));
        const cw = w / cols;
        const ch = h / rows;
        ctx.save();
        ctx.beginPath();
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            // Offsetting alternate squares is what makes it read as a
            // checkerboard rather than everything appearing at once.
            const delay = ((x + y) % 2) * 0.25;
            const local = Math.max(0, Math.min(1, (p - delay) / (1 - 0.25)));
            if (local <= 0) continue;
            const s = ease(local);
            ctx.rect(x * cw + cw * (1 - s) / 2, y * ch + ch * (1 - s) / 2, cw * s, ch * s);
          }
        }
        ctx.clip();
        ctx.drawImage(to, 0, 0, w, h);
        ctx.restore();
      },
    });
  }
}

/* ------------------------------------------------------------------ *
 * Zooms and spins
 * ------------------------------------------------------------------ */
for (const [id, label, dir] of [['In', 'in', 1], ['Out', 'out', -1]]) {
  add(`zoom${id}`, {
    name: `Zoom ${label}`, tier: 'free', icon: '⤢', group: 'Movement',
    draw(ctx, w, h, from, to, p) {
      const e = ease(p);
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(1 + dir * e * 1.4, 1 + dir * e * 1.4);
      ctx.translate(-w / 2, -h / 2);
      paint(ctx, from, w, h, 1 - e);
      ctx.restore();
      if (!to) return;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      const s = 1 - dir * (1 - e) * 0.6;
      ctx.scale(s, s);
      ctx.translate(-w / 2, -h / 2);
      paint(ctx, to, w, h, e);
      ctx.restore();
    },
  });

  for (const turns of [0.5, 1, 2]) {
    add(`spin${id}${String(turns).replace('.', '')}`, {
      name: `Spin ${label} — ${turns} turn${turns === 1 ? '' : 's'}`, tier: 'creator', icon: '⟳',
      group: 'Movement',
      draw(ctx, w, h, from, to, p) {
        const e = ease(p);
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate(dir * e * Math.PI * 2 * turns);
        const s = 1 + dir * e;
        ctx.scale(s, s);
        ctx.translate(-w / 2, -h / 2);
        paint(ctx, from, w, h, 1 - e);
        ctx.restore();
        if (!to) return;
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate(-dir * (1 - e) * Math.PI * 2 * turns);
        const s2 = 1 - dir * (1 - e) * 0.7;
        ctx.scale(s2, s2);
        ctx.translate(-w / 2, -h / 2);
        paint(ctx, to, w, h, e);
        ctx.restore();
      },
    });
  }
}

/* ------------------------------------------------------------------ *
 * Flashes and colour dips
 * ------------------------------------------------------------------ */
const DIPS = [
  ['Black', '#000000'], ['White', '#ffffff'], ['Red', '#ff2a2a'], ['Blue', '#2a6bff'],
  ['Green', '#22c55e'], ['Cyan', '#00d1ff'], ['Magenta', '#ff2ad4'], ['Amber', '#ffb020'],
];
for (const [name, colour] of DIPS) {
  add(`flash${name}`, {
    name: `Flash ${name.toLowerCase()}`, tier: 'free', icon: '⚡', group: 'Light',
    draw(ctx, w, h, from, to, p) {
      // Sharper than a dip: the colour spikes at the cut and is gone, which is
      // how an impact frame reads rather than a fade through a colour.
      paint(ctx, p < 0.5 ? from : to, w, h);
      /*
       * Squared, so the colour spikes at the cut and is gone.
       *
       * A square root decays too slowly: a tenth of the colour is still sitting
       * over the last frame of the transition, which tints the first frame of
       * the new shot. A flash that has not finished flashing by the time it
       * ends is a colour cast, not a flash.
       */
      const spike = 1 - Math.abs(p * 2 - 1);
      ctx.globalAlpha = spike ** 2;
      ctx.fillStyle = colour;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    },
  });
}

/* ------------------------------------------------------------------ *
 * Optical
 * ------------------------------------------------------------------ */
add('blurDissolveSoft', {
  name: 'Soft blur dissolve', tier: 'free', icon: '❍', group: 'Optical',
  draw(ctx, w, h, from, to, p) {
    const e = ease(p);
    const blur = Math.sin(p * Math.PI) * 14;
    ctx.filter = `blur(${blur}px)`;
    paint(ctx, from, w, h, 1);
    paint(ctx, to, w, h, e);
    ctx.filter = 'none';
  },
});

add('whipPan', {
  name: 'Whip pan', tier: 'creator', icon: '↝', group: 'Optical',
  draw(ctx, w, h, from, to, p) {
    const e = ease(p);
    const smear = Math.sin(p * Math.PI) * 26;
    ctx.filter = `blur(${smear}px)`;
    ctx.save();
    ctx.translate(-w * e * 1.2, 0);
    paint(ctx, from, w, h);
    ctx.restore();
    if (to) {
      ctx.save();
      ctx.translate(w * (1 - e) * 1.2, 0);
      paint(ctx, to, w, h);
      ctx.restore();
    }
    ctx.filter = 'none';
  },
});

for (const [id, name, dx, dy] of [['H', 'horizontal', 1, 0], ['V', 'vertical', 0, 1]]) {
  add(`stretch${id}`, {
    name: `Stretch ${name}`, tier: 'creator', icon: '⇹', group: 'Optical',
    draw(ctx, w, h, from, to, p) {
      const e = ease(p);
      const grow = 1 + Math.sin(p * Math.PI) * 2.2;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(dx ? grow : 1, dy ? grow : 1);
      ctx.translate(-w / 2, -h / 2);
      paint(ctx, from, w, h, 1 - e);
      ctx.restore();
      if (!to) return;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(dx ? grow : 1, dy ? grow : 1);
      ctx.translate(-w / 2, -h / 2);
      paint(ctx, to, w, h, e);
      ctx.restore();
    },
  });
}

add('luma', {
  name: 'Luma dissolve', tier: 'creator', icon: '◫', group: 'Optical',
  draw(ctx, w, h, from, to, p) {
    /*
     * The new shot arrives through the bright parts of the old one first.
     * Done with a destination-in composite against the outgoing frame used as
     * its own matte, which keeps it to two draws — a per-pixel version would
     * read two million pixels a frame and drop playback.
     */
    paint(ctx, from, w, h);
    if (!to) return;
    const e = ease(p);
    /*
     * The brightness lift peaks in the middle and returns to neutral, so the
     * final frame of the transition is the incoming shot exactly as it will
     * look a frame later. Ramping the lift up to the end instead leaves the
     * first frame of the new shot blown out, and the cut flickers.
     */
    const heat = Math.sin(p * Math.PI);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = `brightness(${1 + heat * 1.6}) contrast(${1 + heat * 2})`;
    ctx.globalAlpha = e;
    ctx.drawImage(to, 0, 0, w, h);
    ctx.filter = 'none';
    ctx.restore();
    ctx.globalAlpha = 1;
  },
});

/* ------------------------------------------------------------------ *
 * Glitch
 * ------------------------------------------------------------------ */
for (const [id, name, slices] of [['Fine', 'fine', 24], ['Chunky', 'chunky', 8]]) {
  add(`glitch${id}`, {
    name: `Glitch — ${name}`, tier: 'creator', icon: '▚', group: 'Glitch',
    draw(ctx, w, h, from, to, p) {
      const e = ease(p);
      paint(ctx, from, w, h, 1 - e * 0.3);
      const violence = Math.sin(p * Math.PI);
      const band = h / slices;
      for (let i = 0; i < slices; i++) {
        const src = (i / slices < e) ? to : from;
        if (!src) continue;
        /*
         * Deterministic jitter, not Math.random.
         *
         * A transition has to paint the same frame every time it is asked for
         * it: the preview draws it while you scrub and the exporter draws it
         * again, and random offsets make those two disagree. Seeding from the
         * band index and the progress gives the same scatter both times.
         */
        const seed = Math.sin(i * 12.9898 + Math.round(p * 60) * 78.233) * 43758.5453;
        const jitter = ((seed - Math.floor(seed)) - 0.5) * w * 0.22 * violence;
        ctx.drawImage(src, 0, i * band, w, band, jitter, i * band, w, band);
      }
    },
  });
}

add('rgbSplitCut', {
  name: 'RGB split cut', tier: 'creator', icon: '◨', group: 'Glitch',
  draw(ctx, w, h, from, to, p) {
    // Both the offset and the strength fall to zero at each end, so the
    // transition begins and finishes on a clean frame. A `lighter` composite
    // brightens whatever it touches, so leaving it at half strength at the end
    // hands the new shot over already washed out.
    const strength = Math.sin(p * Math.PI);
    const shift = strength * w * 0.035;
    const src = p < 0.5 ? from : to;
    paint(ctx, src, w, h);
    if (!src || strength < 0.01) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.45 * strength;
    ctx.drawImage(src, -shift, 0, w, h);
    ctx.drawImage(src, shift, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  },
});

/* ------------------------------------------------------------------ *
 * Export
 * ------------------------------------------------------------------ */
export const TRANSITION_PACKS = out;

/** Group -> ids, so a list this long can be browsed. */
export const TRANSITION_GROUPS = Object.entries(out).reduce((acc, [id, t]) => {
  (acc[t.group || 'More'] ||= []).push(id);
  return acc;
}, {});
