/*
 * Transitions.
 *
 * Each one is a pure function: given the outgoing frame, the incoming frame and
 * a progress value from 0 to 1, paint the result. No state, so scrubbing
 * backwards through a transition looks exactly like scrubbing forwards — which
 * is not true in every editor and is a common complaint.
 *
 * `from` and `to` are canvases already carrying each clip's own grade and
 * transform. Either may be null at the very start or end of the timeline.
 */

import { TRANSITION_PACKS } from './transitions-library.js';

const ease = (t) => t * t * (3 - 2 * t);
const easeOut = (t) => 1 - (1 - t) ** 3;

function paint(ctx, src, w, h, alpha = 1) {
  if (!src) return;
  ctx.globalAlpha = alpha;
  ctx.drawImage(src, 0, 0, w, h);
  ctx.globalAlpha = 1;
}

export const TRANSITIONS = {
  dissolve: {
    name: 'Cross dissolve', tier: 'free', icon: '◐',
    draw(ctx, w, h, from, to, p) {
      paint(ctx, from, w, h, 1);
      paint(ctx, to, w, h, ease(p));
    },
  },

  dipBlack: {
    name: 'Dip to black', tier: 'free', icon: '●',
    draw(ctx, w, h, from, to, p) {
      // Two halves: fade the old one out, then the new one in.
      if (p < 0.5) { paint(ctx, from, w, h); ctx.fillStyle = `rgba(0,0,0,${ease(p * 2)})`; }
      else { paint(ctx, to, w, h); ctx.fillStyle = `rgba(0,0,0,${1 - ease((p - 0.5) * 2)})`; }
      ctx.fillRect(0, 0, w, h);
    },
  },

  dipWhite: {
    name: 'Dip to white', tier: 'free', icon: '○',
    draw(ctx, w, h, from, to, p) {
      if (p < 0.5) { paint(ctx, from, w, h); ctx.fillStyle = `rgba(255,255,255,${ease(p * 2)})`; }
      else { paint(ctx, to, w, h); ctx.fillStyle = `rgba(255,255,255,${1 - ease((p - 0.5) * 2)})`; }
      ctx.fillRect(0, 0, w, h);
    },
  },

  slideLeft: {
    name: 'Slide left', tier: 'free', icon: '←',
    draw(ctx, w, h, from, to, p) {
      const e = easeOut(p);
      if (from) { ctx.save(); ctx.translate(-w * e, 0); paint(ctx, from, w, h); ctx.restore(); }
      if (to) { ctx.save(); ctx.translate(w * (1 - e), 0); paint(ctx, to, w, h); ctx.restore(); }
    },
  },

  slideUp: {
    name: 'Slide up', tier: 'free', icon: '↑',
    draw(ctx, w, h, from, to, p) {
      const e = easeOut(p);
      if (from) { ctx.save(); ctx.translate(0, -h * e); paint(ctx, from, w, h); ctx.restore(); }
      if (to) { ctx.save(); ctx.translate(0, h * (1 - e)); paint(ctx, to, w, h); ctx.restore(); }
    },
  },

  wipe: {
    name: 'Wipe', tier: 'free', icon: '▐',
    draw(ctx, w, h, from, to, p) {
      paint(ctx, from, w, h);
      if (!to) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w * ease(p), h);
      ctx.clip();
      paint(ctx, to, w, h);
      ctx.restore();
    },
  },

  circle: {
    name: 'Iris', tier: 'free', icon: '◎',
    draw(ctx, w, h, from, to, p) {
      paint(ctx, from, w, h);
      if (!to) return;
      const r = ease(p) * Math.hypot(w, h) * 0.55;
      ctx.save();
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
      ctx.clip();
      paint(ctx, to, w, h);
      ctx.restore();
    },
  },

  zoomPunch: {
    name: 'Zoom punch', tier: 'free', icon: '⤢',
    draw(ctx, w, h, from, to, p) {
      const e = ease(p);
      if (from) {
        const s = 1 + e * 0.45;
        ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(s, s); ctx.translate(-w / 2, -h / 2);
        paint(ctx, from, w, h, 1 - e); ctx.restore();
      }
      if (to) {
        const s = 1.45 - e * 0.45;
        ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(s, s); ctx.translate(-w / 2, -h / 2);
        paint(ctx, to, w, h, e); ctx.restore();
      }
    },
  },

  whip: {
    name: 'Whip pan', tier: 'creator', icon: '⇄',
    draw(ctx, w, h, from, to, p) {
      // The blur is what sells it — a plain slide reads as a slide.
      const e = ease(p);
      const blur = Math.sin(p * Math.PI) * 26;
      ctx.filter = `blur(${blur.toFixed(1)}px)`;
      if (from) { ctx.save(); ctx.translate(-w * e * 1.15, 0); paint(ctx, from, w, h); ctx.restore(); }
      if (to) { ctx.save(); ctx.translate(w * (1 - e) * 1.15, 0); paint(ctx, to, w, h); ctx.restore(); }
      ctx.filter = 'none';
    },
  },

  blurDissolve: {
    name: 'Blur dissolve', tier: 'creator', icon: '❋',
    draw(ctx, w, h, from, to, p) {
      const blur = Math.sin(p * Math.PI) * 18;
      ctx.filter = `blur(${blur.toFixed(1)}px)`;
      paint(ctx, from, w, h, 1);
      paint(ctx, to, w, h, ease(p));
      ctx.filter = 'none';
    },
  },

  glitch: {
    name: 'Glitch', tier: 'creator', icon: '⚡',
    draw(ctx, w, h, from, to, p) {
      const base = p < 0.5 ? from : to;
      paint(ctx, base, w, h);
      if (!base) return;
      const bands = 7;
      const intensity = Math.sin(p * Math.PI);
      /*
       * Seeded scatter, not Math.random.
       *
       * A transition has to paint the same frame every time it is asked for
       * one. The preview draws it while you scrub and the exporter draws it
       * again later, and with random offsets those two disagree — the video you
       * approved is not the video you get, and scrubbing back over the same
       * frame shows something different each time. Seeding from the band index
       * and the frame gives the same scatter on every pass while still looking
       * like noise.
       */
      const noise = (n) => {
        const v = Math.sin(n * 12.9898 + Math.round(p * 60) * 78.233) * 43758.5453;
        return v - Math.floor(v);
      };
      for (let i = 0; i < bands; i++) {
        const y = noise(i) * h;
        const bh = (h / bands) * (0.3 + noise(i + 100) * 0.7);
        const dx = (noise(i + 200) - 0.5) * w * 0.22 * intensity;
        ctx.drawImage(base, 0, y, w, bh, dx, y, w, bh);
      }
      // Chromatic split on top, which is the part that reads as "digital".
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.35 * intensity;
      ctx.drawImage(base, -6 * intensity, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    },
  },

  filmBurn: {
    name: 'Film burn', tier: 'creator', icon: '🔥',
    draw(ctx, w, h, from, to, p) {
      if (p < 0.5) paint(ctx, from, w, h); else paint(ctx, to, w, h);
      const intensity = Math.sin(p * Math.PI);
      const g = ctx.createRadialGradient(w * 0.7, h * 0.35, 0, w * 0.7, h * 0.35, Math.max(w, h) * (0.2 + intensity));
      g.addColorStop(0, `rgba(255,238,190,${0.95 * intensity})`);
      g.addColorStop(0.4, `rgba(255,150,40,${0.7 * intensity})`);
      g.addColorStop(1, 'rgba(255,80,0,0)');
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    },
  },

  spin: {
    name: 'Spin', tier: 'creator', icon: '↻',
    draw(ctx, w, h, from, to, p) {
      const e = ease(p);
      const put = (src, angle, scale, alpha) => {
        if (!src) return;
        ctx.save();
        ctx.translate(w / 2, h / 2); ctx.rotate(angle); ctx.scale(scale, scale);
        ctx.translate(-w / 2, -h / 2);
        paint(ctx, src, w, h, alpha);
        ctx.restore();
      };
      put(from, e * Math.PI * 0.5, 1 - e * 0.4, 1 - e);
      put(to, (e - 1) * Math.PI * 0.5, 0.6 + e * 0.4, e);
    },
  },
};

/*
 * Transitions that happen *somewhere* in the frame.
 *
 * Everything above is centred, because nothing above knows where the subject
 * is. These take an anchor — a point in 0..1 frame space — and dive into it,
 * open from it, spin round it, wipe away from it. Handed a motion track's
 * position at the moment of the cut, the zoom goes through the tracked face
 * rather than the middle of the frame, which is what a tracked transition
 * means. With no anchor they fall back to the centre and behave like their
 * plain cousins, so nothing breaks when a track is deleted.
 */
const at = (opts, w, h) => ({ x: (opts?.anchor?.x ?? 0.5) * w, y: (opts?.anchor?.y ?? 0.5) * h });

/* Draw `src` scaled by `scale` about the point (ax, ay), which stays put. */
function zoomAbout(ctx, src, w, h, ax, ay, scale, alpha = 1) {
  if (!src) return;
  ctx.save();
  ctx.translate(ax, ay); ctx.scale(scale, scale); ctx.translate(-ax, -ay);
  paint(ctx, src, w, h, alpha);
  ctx.restore();
}

const TRACKED = {
  zoomThrough: {
    name: 'Zoom through', tier: 'creator', icon: '🎯', group: 'Tracked', anchored: true,
    draw(ctx, w, h, from, to, p, opts) {
      const { x, y } = at(opts, w, h);
      const e = ease(p);
      // The outgoing shot grows into the anchor until it fills the frame with
      // it, and the incoming one arrives from far out, landing at 1×.
      if (p < 0.55) zoomAbout(ctx, from, w, h, x, y, 1 + e * 5, 1);
      zoomAbout(ctx, to, w, h, x, y, 0.25 + e * 0.75, Math.min(1, Math.max(0, (p - 0.35) / 0.3)));
    },
  },
  irisAt: {
    name: 'Iris at the spot', tier: 'creator', icon: '◎', group: 'Tracked', anchored: true,
    draw(ctx, w, h, from, to, p, opts) {
      const { x, y } = at(opts, w, h);
      paint(ctx, from, w, h, 1);
      if (!to) return;
      const r = ease(p) * Math.hypot(Math.max(x, w - x), Math.max(y, h - y));
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
      paint(ctx, to, w, h, 1);
      ctx.restore();
    },
  },
  irisOutAt: {
    name: 'Iris out of the spot', tier: 'creator', icon: '◉', group: 'Tracked', anchored: true,
    draw(ctx, w, h, from, to, p, opts) {
      const { x, y } = at(opts, w, h);
      paint(ctx, to, w, h, 1);
      if (!from) return;
      const r = (1 - ease(p)) * Math.hypot(Math.max(x, w - x), Math.max(y, h - y));
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
      paint(ctx, from, w, h, 1);
      ctx.restore();
    },
  },
  spinAt: {
    name: 'Spin round the spot', tier: 'creator', icon: '↻', group: 'Tracked', anchored: true,
    draw(ctx, w, h, from, to, p, opts) {
      const { x, y } = at(opts, w, h);
      const e = ease(p);
      const put = (src, angle, scale, alpha) => {
        if (!src) return;
        ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(scale, scale); ctx.translate(-x, -y);
        paint(ctx, src, w, h, alpha); ctx.restore();
      };
      put(from, e * Math.PI * 0.6, 1 + e * 0.8, 1 - e);
      put(to, (e - 1) * Math.PI * 0.6, 0.5 + e * 0.5, e);
    },
  },
  whipFrom: {
    name: 'Whip from the spot', tier: 'creator', icon: '⟿', group: 'Tracked', anchored: true,
    draw(ctx, w, h, from, to, p, opts) {
      // The direction runs from the anchor to the centre: a subject on the
      // left whips right, one at the top whips down.
      const { x, y } = at(opts, w, h);
      let dx = w / 2 - x, dy = h / 2 - y;
      const len = Math.hypot(dx, dy) || 1;
      if (len < 8) { dx = 1; dy = 0; } else { dx /= len; dy /= len; }
      const e = ease(p);
      const blur = Math.sin(p * Math.PI) * 18;
      ctx.save();
      ctx.filter = blur > 0.5 ? `blur(${blur.toFixed(1)}px)` : 'none';
      if (from) { ctx.save(); ctx.translate(dx * w * e, dy * h * e); paint(ctx, from, w, h); ctx.restore(); }
      if (to) { ctx.save(); ctx.translate(dx * w * (e - 1), dy * h * (e - 1)); paint(ctx, to, w, h); ctx.restore(); }
      ctx.restore();
    },
  },
  portal: {
    name: 'Portal', tier: 'creator', icon: '🌀', group: 'Tracked', anchored: true,
    draw(ctx, w, h, from, to, p, opts) {
      const { x, y } = at(opts, w, h);
      const e = ease(p);
      // A ring opens on the spot and the next shot is seen through it, zooming
      // in as the ring widens — the doorway is the tracked thing.
      paint(ctx, from, w, h, 1);
      if (!to) return;
      const r = e * Math.hypot(w, h) * 0.7;
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
      zoomAbout(ctx, to, w, h, x, y, 1.6 - e * 0.6, 1);
      ctx.restore();
      if (p < 0.98) {
        ctx.save(); ctx.strokeStyle = `rgba(255,255,255,${(0.9 * (1 - p)).toFixed(3)})`; ctx.lineWidth = Math.max(2, w * 0.008);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
    },
  },
  revealFrom: {
    name: 'Radial wipe from the spot', tier: 'creator', icon: '◔', group: 'Tracked', anchored: true,
    draw(ctx, w, h, from, to, p, opts) {
      const { x, y } = at(opts, w, h);
      paint(ctx, from, w, h, 1);
      if (!to) return;
      const R = Math.hypot(w, h);
      ctx.save(); ctx.beginPath(); ctx.moveTo(x, y);
      ctx.arc(x, y, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ease(p)); ctx.closePath(); ctx.clip();
      paint(ctx, to, w, h, 1);
      ctx.restore();
    },
  },
  glitchAt: {
    name: 'Glitch at the spot', tier: 'creator', icon: '▚', group: 'Tracked', anchored: true,
    draw(ctx, w, h, from, to, p, opts) {
      const { x, y } = at(opts, w, h);
      const src = p < 0.5 ? from : to;
      paint(ctx, src, w, h, 1);
      // Tearing that starts at the spot and spreads outward, worst at the middle.
      const strength = Math.sin(p * Math.PI);
      const reach = strength * Math.max(w, h) * 0.6;
      const bands = 14;
      for (let i = 0; i < bands; i++) {
        const by = y - reach + (i / bands) * reach * 2;
        if (by < -h * 0.1 || by > h * 1.1) continue;
        const bh = Math.max(2, (h / bands) * 0.5 * strength);
        const off = Math.sin(i * 12.9898 + p * 40) * strength * w * 0.12 * (1 - Math.abs(by - y) / (reach || 1));
        if (!src) continue;
        ctx.drawImage(src, 0, Math.max(0, by), w, bh, off, Math.max(0, by), w, bh);
      }
      if (strength > 0.4) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (strength - 0.4) * 0.8;
        ctx.drawImage(src || from || to, -strength * 8, 0, w, h); ctx.restore();
      }
      void x;
    },
  },
  blurThrough: {
    name: 'Blur through the spot', tier: 'creator', icon: '◌', group: 'Tracked', anchored: true,
    draw(ctx, w, h, from, to, p, opts) {
      const { x, y } = at(opts, w, h);
      const e = ease(p);
      // Enough zoom that the anchor is where the picture visibly rushes
      // towards; a 24px blur over a 30% zoom washed the anchor out entirely.
      const blur = Math.sin(p * Math.PI) * 14;
      ctx.save();
      ctx.filter = blur > 0.5 ? `blur(${blur.toFixed(1)}px)` : 'none';
      zoomAbout(ctx, from, w, h, x, y, 1 + e * 1.4, 1 - e);
      zoomAbout(ctx, to, w, h, x, y, 2.4 - e * 1.4, e);
      ctx.restore();
    },
  },
};
Object.assign(TRANSITIONS, TRACKED);

/*
 * The thirteen above, then the generated library.
 *
 * Merged in this order so the hand-written ones win on any id collision: they
 * are the ones people already have in projects, and a saved edit must not
 * change because a library grew.
 */
Object.assign(TRANSITIONS, { ...TRANSITION_PACKS, ...TRANSITIONS });

export const TRANSITION_LIST = Object.entries(TRANSITIONS)
  .map(([id, t]) => ({ id, ...t }));

/** Grouped for a picker, with the originals first under their own heading. */
export const TRANSITION_GROUPS_ALL = TRANSITION_LIST.reduce((acc, t) => {
  (acc[t.group || 'Essentials'] ||= []).push(t);
  return acc;
}, {});

/** `opts.anchor` is { x, y } in 0..1 frame space, for the tracked ones. */
export function drawTransition(id, ctx, w, h, from, to, p, opts = undefined) {
  const t = TRANSITIONS[id] || TRANSITIONS.dissolve;
  t.draw(ctx, w, h, from, to, Math.max(0, Math.min(1, p)), opts);
}
