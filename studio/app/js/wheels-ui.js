/*
 * The three-way corrector, as a control.
 *
 * Lifted out of the colour panel so the panel and the palette band on the
 * Colour page are the same control rather than two that look alike. Two
 * implementations of a wheel is two sets of maths for converting a drag into
 * an RGB offset, and the day they disagree is the day somebody's grade changes
 * depending on which copy of the wheel they touched it with.
 *
 * It knows nothing about the project. It is given a function that returns the
 * thing being graded and a function that writes to it, which is what lets the
 * same widget edit corrector one from the panel and corrector three from the
 * band without either caller explaining itself.
 */

import { $$, esc } from './ui.js';
import { neutralWheels } from './engine/filters.js';

export const WHEELS = ['lift', 'gamma', 'gain'];

/*
 * Lift, Gamma and Gain rather than Shadows, Midtones and Highlights.
 *
 * These are the words the people who see them already use — every tutorial and
 * every grading conversation says lift/gamma/gain. They are also short enough
 * to fit the column, where "Highlights" truncated to "HIGHLIGH…" on a control
 * whose whole job is naming which part of the range it touches. The plain
 * English is on the hover tip.
 */
export const WHEEL_HELP = {
  lift: ['Lift — the darkest parts of the picture',
    'Lift moves the shadows. Drag toward a colour to tint the dark parts.'],
  gamma: ['Gamma — the midtones, where skin lives',
    'Gamma moves the midtones — where faces and skin sit. The one to reach for first.'],
  gain: ['Gain — the brightest parts of the picture',
    'Gain moves the highlights. Drag toward a colour to tint the bright parts.'],
};

const MAX_PUSH = 0.55;      // full deflection is strong but not destructive

/** One wheel: name, its own reset, the wheel, and the numbers it is making. */
export function wheelMarkup(which, { size = 128 } = {}) {
  const [title, tip] = WHEEL_HELP[which] || ['', ''];
  return `
    <div class="wheel">
      <div class="wheel-top">
        <span class="wl" title="${esc(title)}" data-tip="${esc(tip)}">${
          which === 'lift' ? 'Lift' : which === 'gamma' ? 'Gamma' : 'Gain'}</span>
        <button class="wheel-reset" data-wreset="${which}"
          aria-label="Reset ${which}" title="Reset this wheel">↺</button>
      </div>
      <canvas data-wheel="${which}" width="${size}" height="${size}"
        title="Drag to push ${which} toward a colour. Double-click to reset."></canvas>
      <div class="wheel-nums">
        <span class="wn"><i>R</i><b data-wn="${which}-r">0.00</b></span>
        <span class="wn"><i>G</i><b data-wn="${which}-g">0.00</b></span>
        <span class="wn"><i>B</i><b data-wn="${which}-b">0.00</b></span>
      </div>
    </div>`;
}

/** All three, laid out the way every grading suite lays them out. */
export function wheelsMarkup(opts = {}) {
  return WHEELS.map((w) => wheelMarkup(w, opts)).join('');
}

function hueRgb(angleDeg) {
  const h = ((angleDeg % 360) + 360) % 360 / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  const [r, g, b] = h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x]
    : h < 4 ? [0, x, 1] : h < 5 ? [x, 0, 1] : [1, 0, x];
  return { r, g, b };
}

export function paintWheel(canvas, offset) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const r = size / 2;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - r, dy = y - r;
      const dist = Math.hypot(dx, dy) / r;
      const i = (y * size + x) * 4;
      if (dist > 1) { img.data[i + 3] = 0; continue; }
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      const c = hueRgb(angle);
      // Toward the centre it desaturates to grey — the neutral position.
      const mix = (v) => Math.round(255 * (0.5 + (v - 0.5) * dist));
      img.data[i] = mix(c.r);
      img.data[i + 1] = mix(c.g);
      img.data[i + 2] = mix(c.b);
      img.data[i + 3] = dist > 0.97 ? Math.round(255 * ((1 - dist) / 0.03)) : 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // the puck
  const push = Math.hypot(offset?.r || 0, offset?.g || 0, offset?.b || 0) / MAX_PUSH;
  if (push > 0.01) {
    const angle = Math.atan2((offset.g - offset.b) * 0.866, offset.r - (offset.g + offset.b) / 2);
    const px = r + Math.cos(angle) * Math.min(1, push) * r * 0.92;
    const py = r + Math.sin(angle) * Math.min(1, push) * r * 0.92;
    ctx.beginPath();
    ctx.arc(px, py, Math.max(4, size / 21), 0, Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(r, r, Math.max(3, size / 32), 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

/*
 * The three numbers under a wheel.
 *
 * Per channel rather than one summary string, because that is what a wheel
 * actually produces and what you compare between shots. "Match this one to
 * that one" is a job done with numbers, not by eye and memory.
 */
export function updateReadout(host, which, offset) {
  for (const [ch, value] of [['r', offset.r], ['g', offset.g], ['b', offset.b]]) {
    const el = host.querySelector(`[data-wn="${which}-${ch}"]`);
    if (!el) continue;
    el.textContent = `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}`;
    el.classList.toggle('off', Math.abs(value) < 0.005);
  }
}

/** Repaint every wheel in `host` from whatever is being graded now. */
export function refreshWheels(host, grade) {
  const g = typeof grade === 'function' ? grade() : grade;
  for (const canvas of $$('[data-wheel]', host)) {
    const which = canvas.dataset.wheel;
    const offset = g?.color?.wheels?.[which] || { r: 0, g: 0, b: 0 };
    paintWheel(canvas, offset);
    updateReadout(host, which, offset);
  }
}

/**
 * Make the wheels in `host` live.
 *
 * `grade()` returns whatever is being graded right now — a clip, or one
 * corrector out of a chain — and `patch(fn, label, key)` is how a change is
 * committed. Neither is assumed: the same wheels serve the colour panel and
 * the palette band, and those two disagree about what "the thing being
 * graded" means often enough that asking every time is the only safe answer.
 */
export function wireWheels(host, { grade, patch }) {
  const current = (which) => {
    const g = typeof grade === 'function' ? grade() : grade;
    return g?.color?.wheels?.[which] || { r: 0, g: 0, b: 0 };
  };

  for (const canvas of $$('[data-wheel]', host)) {
    const which = canvas.dataset.wheel;
    paintWheel(canvas, current(which));
    updateReadout(host, which, current(which));

    const setFrom = (ev) => {
      const rect = canvas.getBoundingClientRect();
      const r = rect.width / 2;
      const dx = ev.clientX - rect.left - r;
      const dy = ev.clientY - rect.top - r;
      const dist = Math.min(1, Math.hypot(dx, dy) / r);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      const c = hueRgb(angle);
      const push = dist * MAX_PUSH;
      const offset = {
        r: Number(((c.r - 0.5) * 2 * push).toFixed(4)),
        g: Number(((c.g - 0.5) * 2 * push).toFixed(4)),
        b: Number(((c.b - 0.5) * 2 * push).toFixed(4)),
      };
      patch((cl) => {
        cl.color.wheels = { ...(cl.color.wheels || neutralWheels()), [which]: offset };
      }, `Colour wheel: ${which}`, `wheel:${which}`);
      paintWheel(canvas, offset);
      updateReadout(host, which, offset);
    };

    canvas.addEventListener('pointerdown', (ev) => {
      canvas.setPointerCapture(ev.pointerId);
      setFrom(ev);
      const move = (e2) => setFrom(e2);
      const up = () => {
        canvas.removeEventListener('pointermove', move);
        canvas.removeEventListener('pointerup', up);
      };
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', up);
    });

    // Double-click to neutral: the one gesture every editor gets wrong by
    // hiding it in a right-click menu.
    canvas.addEventListener('dblclick', () => {
      patch((cl) => {
        cl.color.wheels = { ...(cl.color.wheels || neutralWheels()), [which]: { r: 0, g: 0, b: 0 } };
      }, `Reset ${which}`);
      paintWheel(canvas, { r: 0, g: 0, b: 0 });
      updateReadout(host, which, { r: 0, g: 0, b: 0 });
    });
  }

  for (const btn of $$('[data-wreset]', host)) {
    btn.addEventListener('click', () => {
      const which = btn.dataset.wreset;
      patch((cl) => {
        cl.color.wheels = { ...(cl.color.wheels || neutralWheels()) };
        cl.color.wheels[which] = { r: 0, g: 0, b: 0 };
      }, `Reset ${which}`);
      const canvas = host.querySelector(`[data-wheel="${which}"]`);
      if (canvas) paintWheel(canvas, { r: 0, g: 0, b: 0 });
      updateReadout(host, which, { r: 0, g: 0, b: 0 });
    });
  }
}
