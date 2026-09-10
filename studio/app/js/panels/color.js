/*
 * Colour: the look library, and a live histogram so you can see what a grade
 * is doing to the picture rather than guessing.
 */

import { $, $$, esc, toast, empty, slider } from '../ui.js';
import { S, actions, engine } from '../main.js';
import { LOOKS, CONTROLS } from '../engine/filters.js';
import * as licence from '../licence.js';
import { current as currentLevel } from '../levels.js';

let scopeTimer = null;

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

    <div class="chips" id="c-looks">
      ${LOOKS.map((l) => {
        const locked = !licence.can(l.tier === 'free' ? 'basic-filters' : 'all-filters');
        const on = clip?.color?.look === l.id;
        return `<button class="chip ${on ? 'on' : ''} ${locked ? 'locked' : ''}"
          data-look="${esc(l.id)}" data-tier="${esc(l.tier)}">
          <span class="sw" style="background:${esc(l.swatch)}"></span>${esc(l.name)}</button>`;
      }).join('')}
    </div>

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
