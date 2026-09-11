/*
 * Colour: the look library, and a live histogram so you can see what a grade
 * is doing to the picture rather than guessing.
 */

import { $, $$, esc, toast, empty, slider } from '../ui.js';
import { S, actions, engine } from '../main.js';
import { LOOKS, LOOK_GROUPS_ALL, CONTROLS, neutralWheels, supportsUrlFilters } from '../engine/filters.js';
import * as licence from '../licence.js';
import { current as currentLevel } from '../levels.js';

let scopeTimer = null;

/**
 * Looks, grouped and collapsible.
 *
 * Essentials is open and everything else is closed, so the panel opens at the
 * same size it always did and the library is one press away rather than a wall
 * of a hundred chips between you and the sliders underneath.
 */
function lookGroups(clip) {
  const current = clip?.color?.look;
  const chip = (l) => {
    const locked = !licence.can(l.tier === 'free' ? 'basic-filters' : 'all-filters');
    const on = current === l.id;
    return `<button class="chip ${on ? 'on' : ''} ${locked ? 'locked' : ''}"
      data-look="${esc(l.id)}" data-tier="${esc(l.tier)}"
      data-search="${esc(`${l.name} ${l.group || ''} ${l.id}`.toLowerCase())}"
      title="${esc(l.name)}">
      <span class="sw" style="background:${esc(l.swatch)}"></span>${esc(l.name)}</button>`;
  };

  const none = LOOKS.find((l) => l.id === 'none');
  const groups = Object.entries(LOOK_GROUPS_ALL);
  // Whichever group holds the current look opens with the panel, so you can
  // always see what is selected without hunting for it.
  const owning = groups.find(([, list]) => list.some((l) => l.id === current))?.[0];

  return `<div class="chips" style="margin-bottom:10px">${none ? chip(none) : ''}</div>`
    + groups.map(([name, list]) => `
      <details class="group" ${name === (owning || 'Essentials') ? 'open' : ''}>
        <summary>${esc(name)} <span class="tiny muted">${list.length}</span></summary>
        <div class="gbody"><div class="chips">${list.map(chip).join('')}</div></div>
      </details>`).join('');
}

export function mount(host) {
  const sel = [...S.sel];
  const clip = sel.length === 1 ? S.project.clips.find((c) => c.id === sel[0]) : null;
  const target = sel.length ? `${sel.length} clip${sel.length === 1 ? '' : 's'}` : 'every clip';

  host.innerHTML = `
    <div class="panel-h">
      <h2>Colour</h2>
      <button class="btn btn-sm btn-ghost" id="c-copy" title="Copy this grade to every clip">Match all</button>
    </div>
    <p class="panel-sub">Applies to ${esc(target)}.</p>

    ${currentLevel() === 'expert' ? `
      <div class="group" style="padding:10px">
        <canvas id="scope" width="256" height="90" style="width:100%;height:90px;border-radius:8px;
          background:var(--surface-3);display:block"></canvas>
        <p class="tiny muted" style="margin:7px 0 0">
          Histogram of the frame on screen. Bunched at the left means crushed blacks;
          piled at the right means blown highlights.
        </p>
      </div>` : ''}

    <!-- A hundred-odd looks is only useful if you can find one. Search first,
         then groups — a flat list this long is a list nobody reads past the
         first screen. -->
    <input class="input" id="c-look-search" placeholder="Search looks — film, mood, mono…"
           style="margin-bottom:10px">
    <div id="c-looks">${lookGroups(clip)}</div>

    <details class="group" data-min="expert" ${clip ? 'open' : ''}>
      <summary>Colour wheels</summary>
      <div class="gbody">
        ${clip ? `
          <div class="wheels" id="c-wheels">
            ${['lift', 'gamma', 'gain'].map((which) => `
              <div class="wheel">
                <canvas data-wheel="${which}" width="128" height="128"
                  title="Drag to push ${which} toward a colour. Double-click to reset."></canvas>
                <div class="wl">${which === 'lift' ? 'Shadows' : which === 'gamma' ? 'Midtones' : 'Highlights'}</div>
                <div class="wv" data-wv="${which}">neutral</div>
              </div>`).join('')}
          </div>
          ${slider({ key: 'offset', label: 'Overall', value: (clip.color.wheels?.offset ?? 0),
            min: -1, max: 1, step: 0.01, fmt: (v) => Number(v).toFixed(2) })}
          <div class="btn-row" style="margin-top:6px">
            <button class="btn btn-sm btn-ghost" id="c-wheels-reset">Reset wheels</button>
          </div>
          ${supportsUrlFilters() ? '' : `<p class="tiny muted" style="margin:9px 0 0">
            This browser does not support the filter these wheels use, so they fall back to a
            coarser approximation. Chrome or Edge gives you the real thing.</p>`}
        ` : '<p class="tiny muted" style="margin:0">Select one clip to grade it with the wheels.</p>'}
      </div>
    </details>

    <div id="c-sliders" style="margin-top:16px">
      ${clip ? CONTROLS.map((ctl) => `<div data-min="${ctl.level}">${slider({
        key: ctl.key, label: ctl.label, value: clip.color[ctl.key] ?? 0,
        min: ctl.min, max: ctl.max, step: ctl.step || 1,
        fmt: (v) => (ctl.step ? Number(v).toFixed(1) : String(Math.round(v))),
      })}</div>`).join('') : ''}
    </div>

    ${clip ? '' : empty('🎨', 'Select a clip to grade it',
      'Or tap a look to put it on everything at once.')}

    <div class="btn-row">
      <button class="btn btn-sm btn-ghost" id="c-reset">Reset</button>
    </div>`;

  // Filter as you type. Typing narrows every group and opens the ones that
  // still have something in them, so a search never leaves you staring at a
  // collapsed heading.
  $('#c-look-search', host)?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    for (const grp of $$('#c-looks details', host)) {
      let shown = 0;
      for (const chip of $$('[data-look]', grp)) {
        const hit = !q || chip.dataset.search.includes(q);
        chip.hidden = !hit;
        if (hit) shown++;
      }
      grp.hidden = shown === 0;
      if (q) grp.open = true;
    }
  });

  $('#c-looks', host).addEventListener('click', (e) => {
    const btn = e.target.closest('[data-look]');
    if (!btn) return;
    const feature = btn.dataset.tier === 'free' ? 'basic-filters' : 'all-filters';
    licence.gate(feature, () => {
      const ids = S.sel.size ? [...S.sel] : videoClipIds();
      for (const id of ids) {
        const c = S.project.clips.find((x) => x.id === id);
        if (c) { c.color.look = btn.dataset.look; c.color.strength = 1; }
      }
      actions.commit('Apply look');
    }, { what: 'The full filter library' });
  });

  $('#c-sliders', host).addEventListener('input', (e) => {
    const key = e.target.dataset.k;
    if (!key) return;
    const value = Number(e.target.value);
    actions.patchSelected((c) => { c.color[key] = value; }, `Change ${key}`, `colour:${key}`);
    const label = host.querySelector(`[data-val="${CSS.escape(key)}"]`);
    if (label) label.textContent = String(Math.round(value));
  });

  $('#c-reset', host).addEventListener('click', () => {
    const ids = S.sel.size ? [...S.sel] : videoClipIds();
    for (const id of ids) {
      const c = S.project.clips.find((x) => x.id === id);
      if (!c) continue;
      for (const ctl of CONTROLS) c.color[ctl.key] = 0;
      c.color.look = 'none';
      c.color.strength = 1;
    }
    actions.commit('Reset colour');
  });

  $('#c-copy', host).addEventListener('click', () => {
    if (!clip) { toast('Select the clip whose grade you want to copy'); return; }
    for (const id of videoClipIds()) {
      const c = S.project.clips.find((x) => x.id === id);
      if (c && c.id !== clip.id) c.color = structuredClone(clip.color);
    }
    actions.commit('Match colour to all');
    toast('Grade copied to every clip', 'ok');
  });

  $('#c-wheels-reset', host)?.addEventListener('click', () => {
    actions.patchSelected((c) => { c.color.wheels = null; }, 'Reset colour wheels');
  });

  host.addEventListener('input', (e) => {
    if (e.target.dataset.k !== 'offset') return;
    const v = Number(e.target.value);
    actions.patchSelected((c) => {
      c.color.wheels = { ...(c.color.wheels || neutralWheels()), offset: v };
    }, 'Overall exposure', 'wheel:offset');
  });

  if (clip) wireWheels(host, clip);
  startScope(host);
  void $$;
}

function videoClipIds() {
  return S.project.clips
    .filter((c) => S.project.tracks.find((t) => t.id === c.trackId)?.kind === 'video' && c.kind !== 'title')
    .map((c) => c.id);
}

/* A histogram sampled from the preview canvas — cheap, and it tells you more
   about a grade than any number in a box. */
function startScope(host) {
  clearInterval(scopeTimer);
  const scope = $('#scope', host);
  if (!scope) return;
  const ctx = scope.getContext('2d');

  const paint = () => {
    const src = engine.renderer?.canvas;
    if (!src || !src.width) return;
    const step = Math.max(1, Math.floor(src.width / 160));
    let data;
    try {
      data = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
    } catch { return; }

    const bins = new Uint32Array(64);
    for (let y = 0; y < src.height; y += step * 2) {
      for (let x = 0; x < src.width; x += step) {
        const i = (y * src.width + x) * 4;
        const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
        bins[Math.min(63, Math.floor(lum * 64))]++;
      }
    }
    const peak = Math.max(...bins, 1);
    ctx.clearRect(0, 0, scope.width, scope.height);
    const grad = ctx.createLinearGradient(0, 0, scope.width, 0);
    grad.addColorStop(0, '#7a5cff');
    grad.addColorStop(0.5, '#2f7dff');
    grad.addColorStop(1, '#00d1ff');
    ctx.fillStyle = grad;
    const bw = scope.width / bins.length;
    for (let i = 0; i < bins.length; i++) {
      const h = (bins[i] / peak) * scope.height;
      ctx.fillRect(i * bw, scope.height - h, bw - 1, h);
    }
  };

  paint();
  scopeTimer = setInterval(paint, 400);
}


/* ------------------------------------------------------------------ */
/* colour wheels                                                       */
/* ------------------------------------------------------------------ */
/*
 * The standard colourist control: drag toward a hue to push that part of the
 * range toward it, distance from the centre is how far. Double-click returns
 * it to neutral, which is the one gesture every editor gets wrong by hiding it
 * in a right-click menu.
 */

const MAX_PUSH = 0.55;      // full deflection is strong but not destructive

function hueRgb(angleDeg) {
  const h = ((angleDeg % 360) + 360) % 360 / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  const [r, g, b] = h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x]
    : h < 4 ? [0, x, 1] : h < 5 ? [x, 0, 1] : [1, 0, x];
  return { r, g, b };
}

function paintWheel(canvas, offset) {
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
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(r, r, 4, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function wireWheels(host, clip) {
  for (const canvas of $$('[data-wheel]', host)) {
    const which = canvas.dataset.wheel;
    const current = () => clip.color.wheels?.[which] || { r: 0, g: 0, b: 0 };
    paintWheel(canvas, current());
    updateReadout(host, which, current());

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
      actions.patchSelected((cl) => {
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

    canvas.addEventListener('dblclick', () => {
      actions.patchSelected((cl) => {
        cl.color.wheels = { ...(cl.color.wheels || neutralWheels()), [which]: { r: 0, g: 0, b: 0 } };
      }, `Reset ${which}`);
      paintWheel(canvas, { r: 0, g: 0, b: 0 });
      updateReadout(host, which, { r: 0, g: 0, b: 0 });
    });
  }
}

function updateReadout(host, which, offset) {
  const el = host.querySelector(`[data-wv="${which}"]`);
  if (!el) return;
  const push = Math.hypot(offset.r, offset.g, offset.b);
  el.textContent = push < 0.01
    ? 'neutral'
    : `${offset.r >= 0 ? '+' : ''}${offset.r.toFixed(2)} ${offset.g >= 0 ? '+' : ''}${offset.g.toFixed(2)} ${offset.b >= 0 ? '+' : ''}${offset.b.toFixed(2)}`;
}
