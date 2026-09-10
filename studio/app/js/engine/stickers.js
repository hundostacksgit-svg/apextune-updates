/*
 * Stickers, shapes and callouts.
 *
 * Drawn to canvas like titles are, so they export exactly as previewed and
 * scale to any resolution. Emoji come from the system font — no image packs to
 * download, nothing to licence, and they look native on whatever device is
 * playing them.
 *
 * The shapes are the ones people actually reach for on a short: an arrow
 * pointing at the thing, a circle round it, a progress bar, a countdown. Pin
 * any of them to a motion track and it follows the subject.
 */

const TAU = Math.PI * 2;

export const EMOJI = [
  '🔥', '💀', '😭', '😂', '🤣', '👀', '💯', '⚡', '✨', '🎯', '🚨', '❗', '❓', '💡',
  '👇', '👆', '👉', '👈', '🙌', '👏', '🤯', '😱', '🥶', '🤔', '😮', '💥', '⭐', '🏆',
  '❤️', '💔', '🎵', '🎬', '📈', '📉', '💰', '⏰', '✅', '❌', '🧠', '👑', '🎉', '🫡',
];

export const SHAPES = {
  arrow:     { name: 'Arrow', tier: 'free' },
  circle:    { name: 'Circle highlight', tier: 'free' },
  box:       { name: 'Box highlight', tier: 'free' },
  burst:     { name: 'Comic burst', tier: 'free' },
  bubble:    { name: 'Speech bubble', tier: 'free' },
  progress:  { name: 'Progress bar', tier: 'free' },
  countdown: { name: 'Countdown', tier: 'free' },
  bar:       { name: 'Lower bar', tier: 'free' },
  scribble:  { name: 'Scribble circle', tier: 'creator' },
  focus:     { name: 'Focus ring', tier: 'creator' },
};

export const STICKER_ANIMS = [
  ['none', 'None'], ['pop', 'Pop in'], ['bounce', 'Bounce'], ['pulse', 'Pulse'],
  ['spin', 'Spin'], ['float', 'Float'], ['shake', 'Shake'], ['beat', 'On the beat'],
];

export function defaultSticker(kind = 'emoji', value = '🔥') {
  return {
    kind,                 // 'emoji' | 'shape'
    value,                // the emoji, or a SHAPES key
    x: 0.5,
    y: 0.5,
    size: 0.18,           // fraction of frame height
    rotate: 0,
    colour: '#00d1ff',
    colour2: '#ffffff',
    opacity: 1,
    anim: 'pop',
    animDur: 0.4,
    text: '',             // for bubble / countdown / bar
    progress: 0.6,
  };
}

/* ------------------------------------------------------------------ */
/* animation                                                           */
/* ------------------------------------------------------------------ */

function animState(anim, t, dur, clipDur, beatPhase) {
  const inP = Math.min(1, Math.max(0, t / Math.max(0.05, dur)));
  const ease = (x) => 1 - (1 - x) ** 3;
  const base = { alpha: 1, scale: 1, dx: 0, dy: 0, spin: 0 };

  switch (anim) {
    case 'pop':
      return { ...base, alpha: ease(inP), scale: inP < 1 ? Math.min(0.5 + ease(inP) * 0.58, 1.08) : 1 };
    case 'bounce': {
      const b = inP < 1 ? Math.abs(Math.sin(inP * Math.PI * 2)) * (1 - inP) : 0;
      return { ...base, alpha: ease(inP), dy: -b * 0.08 };
    }
    case 'pulse':
      return { ...base, scale: 1 + Math.sin(t * 5) * 0.07, alpha: ease(inP) };
    case 'spin':
      return { ...base, spin: t * 1.6, alpha: ease(inP) };
    case 'float':
      return { ...base, dy: Math.sin(t * 1.8) * 0.02, alpha: ease(inP) };
    case 'shake':
      return { ...base, dx: Math.sin(t * 34) * 0.006, dy: Math.cos(t * 41) * 0.005, alpha: ease(inP) };
    case 'beat':
      // Snaps on the beat and relaxes between — the thing every edit does and
      // nobody wants to keyframe by hand.
      return { ...base, alpha: ease(inP), scale: beatPhase === undefined ? 1 : 1 + (1 - beatPhase) ** 3 * 0.28 };
    default:
      return { ...base, alpha: ease(Math.min(1, t / 0.12)) };
  }
  void clipDur;
}

/* ------------------------------------------------------------------ */
/* drawing                                                             */
/* ------------------------------------------------------------------ */

export function drawSticker(ctx, w, h, sticker, t = 0, clipDur = 2, beatPhase) {
  const s = { ...defaultSticker(), ...sticker };
  const a = animState(s.anim, t, s.animDur ?? 0.4, clipDur, beatPhase);
  if (a.alpha <= 0.003) return;

  const size = s.size * h;
  const cx = (s.x + a.dx) * w;
  const cy = (s.y + a.dy) * h;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, a.alpha * (s.opacity ?? 1)));
  ctx.translate(cx, cy);
  ctx.rotate(((s.rotate || 0) * Math.PI) / 180 + a.spin);
  ctx.scale(a.scale, a.scale);

  if (s.kind === 'emoji') {
    ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Emoji have no stroke, so a shadow is what keeps them readable on a
    // bright frame.
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = size * 0.18;
    ctx.fillText(s.value, 0, 0);
  } else {
    drawShape(ctx, s, size, t);
  }

  ctx.restore();
}

function drawShape(ctx, s, size, t) {
  ctx.strokeStyle = s.colour;
  ctx.fillStyle = s.colour;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size * 0.09);

  switch (s.value) {
    case 'arrow': {
      const L = size;
      ctx.beginPath();
      ctx.moveTo(-L * 0.5, 0);
      ctx.lineTo(L * 0.32, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(L * 0.5, 0);
      ctx.lineTo(L * 0.18, -L * 0.26);
      ctx.lineTo(L * 0.18, L * 0.26);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'circle':
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.5, 0, TAU);
      ctx.stroke();
      break;
    case 'box':
      ctx.beginPath();
      ctx.rect(-size * 0.5, -size * 0.35, size, size * 0.7);
      ctx.stroke();
      break;
    case 'focus': {
      // Four corner brackets — reads as "look here" without hiding the subject.
      const r = size * 0.5, arm = r * 0.42;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.beginPath();
        ctx.moveTo(sx * r, sy * r - sy * arm);
        ctx.lineTo(sx * r, sy * r);
        ctx.lineTo(sx * r - sx * arm, sy * r);
        ctx.stroke();
      }
      break;
    }
    case 'scribble': {
      // Hand-drawn look: three passes that don't quite line up.
      ctx.lineWidth = Math.max(2, size * 0.055);
      for (let pass = 0; pass < 3; pass++) {
        ctx.beginPath();
        for (let i = 0; i <= 48; i++) {
          const ang = (i / 48) * TAU + pass * 0.4;
          const wobble = 1 + Math.sin(ang * 3 + pass * 2.1) * 0.05;
          const x = Math.cos(ang) * size * 0.52 * wobble;
          const y = Math.sin(ang) * size * 0.38 * wobble;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;
    }
    case 'burst': {
      const points = 12;
      ctx.beginPath();
      for (let i = 0; i < points * 2; i++) {
        const r = i % 2 ? size * 0.3 : size * 0.55;
        const ang = (i / (points * 2)) * TAU;
        const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      if (s.text) {
        ctx.fillStyle = s.colour2;
        ctx.font = `800 ${size * 0.22}px -apple-system,system-ui,sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.text, 0, 0);
      }
      break;
    }
    case 'bubble': {
      const bw = size * 1.5, bh = size * 0.78, r = size * 0.18;
      ctx.beginPath();
      ctx.moveTo(-bw / 2 + r, -bh / 2);
      ctx.arcTo(bw / 2, -bh / 2, bw / 2, bh / 2, r);
      ctx.arcTo(bw / 2, bh / 2, -bw / 2, bh / 2, r);
      ctx.lineTo(-bw * 0.12, bh / 2);
      ctx.lineTo(-bw * 0.22, bh / 2 + size * 0.26);   // the tail
      ctx.lineTo(-bw * 0.3, bh / 2);
      ctx.arcTo(-bw / 2, bh / 2, -bw / 2, -bh / 2, r);
      ctx.arcTo(-bw / 2, -bh / 2, bw / 2, -bh / 2, r);
      ctx.closePath();
      ctx.fill();
      if (s.text) {
        ctx.fillStyle = s.colour2;
        ctx.font = `700 ${size * 0.24}px -apple-system,system-ui,sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.text, 0, -bh * 0.04);
      }
      break;
    }
    case 'progress': {
      const bw = size * 3, bh = size * 0.22;
      ctx.fillStyle = 'rgba(255,255,255,.28)';
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2);
      ctx.fill();
      ctx.fillStyle = s.colour;
      roundRect(ctx, -bw / 2, -bh / 2, bw * Math.max(0, Math.min(1, s.progress ?? 0.6)), bh, bh / 2);
      ctx.fill();
      break;
    }
    case 'countdown': {
      const remaining = Math.max(0, Math.ceil((Number(s.text) || 3) - t));
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.5, -Math.PI / 2, -Math.PI / 2 + TAU * (remaining / (Number(s.text) || 3)));
      ctx.lineWidth = size * 0.12;
      ctx.stroke();
      ctx.fillStyle = s.colour2;
      ctx.font = `800 ${size * 0.5}px -apple-system,system-ui,sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(remaining), 0, size * 0.02);
      break;
    }
    case 'bar': {
      const bw = size * 4, bh = size * 0.6;
      ctx.fillStyle = s.colour;
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, bh * 0.28);
      ctx.fill();
      if (s.text) {
        ctx.fillStyle = s.colour2;
        ctx.font = `700 ${bh * 0.5}px -apple-system,system-ui,sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.text, 0, 0);
      }
      break;
    }
    default:
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.4, 0, TAU);
      ctx.stroke();
  }
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
