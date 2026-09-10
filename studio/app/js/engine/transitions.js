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
      for (let i = 0; i < bands; i++) {
        const y = Math.random() * h;
        const bh = (h / bands) * (0.3 + Math.random() * 0.7);
        const dx = (Math.random() - 0.5) * w * 0.22 * intensity;
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

export const TRANSITION_LIST = Object.entries(TRANSITIONS)
  .map(([id, t]) => ({ id, ...t }));

export function drawTransition(id, ctx, w, h, from, to, p) {
  const t = TRANSITIONS[id] || TRANSITIONS.dissolve;
  t.draw(ctx, w, h, from, to, Math.max(0, Math.min(1, p)));
}
