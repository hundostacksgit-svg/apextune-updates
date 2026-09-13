/*
 * Shapes: vector layers, and the motion-graphics pieces made from them.
 *
 * The presets come first — a line that draws itself on, a ring that fills
 * up, burst lines, a sabre stroke, a repeater spiral — because a raw
 * rectangle at its defaults is never what anyone opened this tab for. Under
 * them, the raw shapes for building something new, and, once a shape is
 * selected, every number of it: geometry, fill and stroke, dash, trim
 * paths, the repeater, wiggle and zigzag, glow and sabre. Each row can be
 * keyed at the playhead or handed to an expression from right here, so a
 * trim that draws on over half a second is two presses, not a trip to the
 * lanes.
 */

import { $, $$, esc, toast, slider, selectRow, toggleRow, empty } from '../ui.js';
import { S, actions, drawFrame } from '../main.js';
import { addClip, addTrack, duration, setKeyframe, valueAt } from '../engine/project.js';
import { SHAPE_TYPES, SHAPE_PRESETS, SHAPE_PRESET_BY_ID, SHAPE_PROPS, CAPS, defaultShape, drawShape } from '../engine/shapes.js';
import { openExpressionEditor } from '../expr-ui.js';
import * as licence from '../licence.js';

const GROUPS = [...new Set(SHAPE_PRESETS.map((p) => p.group))];

export function mount(host) {
  const sel = [...S.sel];
  const clip = sel.length === 1 ? S.project.clips.find((c) => c.id === sel[0]) : null;
  const shapeClip = clip?.kind === 'shape' ? clip : null;
  const locked = !licence.can('shape-layers');

  host.innerHTML = `
    <div class="panel-h"><h2>Shapes</h2></div>
    <p class="panel-sub">Vector layers. ${SHAPE_PRESETS.length} finished pieces, ${SHAPE_TYPES.length - 1} raw shapes — trim paths, a repeater, wiggle, zigzag, sabre strokes. Every number keyframes.</p>
    ${locked ? `<div class="note pro tiny" style="margin-bottom:12px">Shape layers are in ${esc(licence.requires('shape-layers')?.name || 'Creator')}.
      <button class="btn btn-sm" id="sh-upgrade" style="margin-top:8px">See what's included</button></div>` : ''}

    ${shapeClip ? `
      <details class="group" open>
        <summary>This shape <span class="tiny muted">${esc(shapeClip.shape?.name || '')}</summary>
        <div class="gbody">${editor(shapeClip)}</div>
      </details>` : ''}

    <details class="group" open>
      <summary>Pieces <span class="tiny muted">${SHAPE_PRESETS.length}</span></summary>
      <div class="gbody">
        ${GROUPS.map((g) => `
          <p class="tiny muted" style="margin:8px 0 4px">${esc(g)}</p>
          <div class="chips">
            ${SHAPE_PRESETS.filter((p) => p.group === g).map((p) => `
              <button class="chip shape-chip ${locked ? 'locked' : ''}" data-shape-preset="${esc(p.id)}" title="${esc(p.note)}">
                <canvas class="shape-thumb" width="64" height="36" data-thumb="${esc(p.id)}"></canvas>
                <span>${esc(p.name)}</span>
              </button>`).join('')}
          </div>`).join('')}
      </div>
    </details>

    <details class="group" ${shapeClip ? '' : 'open'}>
      <summary>Raw shapes</summary>
      <div class="gbody">
        <div class="chips">
          ${SHAPE_TYPES.filter(([id]) => id !== 'path').map(([id, name]) => `
            <button class="chip ${locked ? 'locked' : ''}" data-shape-type="${esc(id)}">${esc(name)}</button>`).join('')}
        </div>
        <p class="tiny muted" style="margin:8px 0 0">A raw shape at the playhead, three seconds long, filled. Tune it above once it is selected.</p>
      </div>
    </details>
    ${!shapeClip && !sel.length ? empty('◇', 'Nothing selected', 'Press a piece to add it at the playhead, or select a shape on the timeline to tune it.') : ''}`;

  // Thumbnails: each piece drawn at a moment that shows what it does.
  for (const cv of $$('[data-thumb]', host)) paintThumb(cv, SHAPE_PRESET_BY_ID[cv.dataset.thumb]);

  wire(host);
}

/* ------------------------------------------------------------------ */
/* the editor for one shape                                            */
/* ------------------------------------------------------------------ */

function editor(clip) {
  const s = { ...defaultShape(clip.shape?.type || 'rect'), ...(clip.shape || {}) };
  const isRing = s.type === 'ring';
  const strokeOnly = s.type === 'line' || s.type === 'arrow' || isRing;
  const row = (key, label, min, max, step, value, fmt) => `
    <div class="sh-row">
      ${slider({ key, label, value, min, max, step, fmt })}
      <span class="sh-keys">
        <button class="kf-mini ${clip.keyframes?.[`shape.${key}`]?.length ? 'on' : ''}" data-shkey="${esc(key)}" title="Key this at the playhead">◆</button>
        <button class="kf-expr ${clip.expressions?.[`shape.${key}`] ? 'on' : ''}" data-shexpr="${esc(key)}" title="Drive this with an expression">ƒ</button>
      </span>
    </div>`;
  const pct = (v) => `${Math.round(v * 100)}%`;
  const deg = (v) => `${Math.round(v)}°`;
  return `
    <div class="field"><label for="sh-name">Name</label><input class="input" id="sh-name" value="${esc(s.name || '')}" maxlength="40"></div>
    ${selectRow({ key: 'type', label: 'Shape', value: s.type, options: SHAPE_TYPES.filter(([id]) => id !== 'path' || s.type === 'path') })}
    ${row('x', 'X', -0.5, 1.5, 0.005, s.x, pct)}
    ${row('y', 'Y', -0.5, 1.5, 0.005, s.y, pct)}
    ${row('w', 'Width', 0, 2, 0.005, s.w, pct)}
    ${row('h', 'Height', 0, 2, 0.005, s.h, pct)}
    ${row('rotate', 'Rotation', -360, 360, 1, s.rotate, deg)}
    ${s.type === 'rect' ? row('round', 'Corner radius', 0, 1, 0.01, s.round, pct) : ''}
    ${s.type === 'polygon' || s.type === 'star' ? row('sides', 'Sides', 3, 16, 1, s.sides, (v) => `${Math.round(v)}`) : ''}
    ${s.type === 'star' ? row('inner', 'Inner radius', 0.05, 1, 0.01, s.inner, pct) : ''}
    ${isRing ? row('thickness', 'Thickness', 0.02, 1, 0.01, s.thickness, pct) : ''}
    ${row('opacity', 'Opacity', 0, 1, 0.01, s.opacity, pct)}

    <h4 class="sh-h4">Fill &amp; stroke</h4>
    ${strokeOnly ? '' : toggleRow({ key: 'fillOn', label: 'Fill', on: s.fillOn })}
    ${strokeOnly || s.fillOn ? '' : ''}
    <div class="field sh-colours">
      ${strokeOnly ? '' : `<label>Fill <input type="color" data-sk="fill" value="${esc(s.fill)}"></label>`}
      <label>Stroke <input type="color" data-sk="stroke" value="${esc(s.stroke)}"></label>
    </div>
    ${strokeOnly ? '' : toggleRow({ key: 'strokeOn', label: 'Stroke', on: s.strokeOn })}
    ${isRing ? '' : row('strokeWidth', 'Stroke width', 0, 0.08, 0.001, s.strokeWidth, (v) => `${(v * 100).toFixed(1)}%`)}
    ${selectRow({ key: 'cap', label: 'Line ends', value: s.cap, options: CAPS })}
    ${row('dash', 'Dash', 0, 0.3, 0.002, s.dash, (v) => (v ? `${(v * 100).toFixed(1)}%` : 'solid'))}
    ${row('gap', 'Gap', 0, 0.3, 0.002, s.gap, (v) => `${(v * 100).toFixed(1)}%`)}
    ${toggleRow({ key: 'saber', label: 'Sabre stroke', on: s.saber, hint: 'A white core with a coloured halo, added over the picture.' })}
    <div class="field sh-colours">
      <label><input type="checkbox" data-sk="glowOn" ${s.glow ? 'checked' : ''}> Glow
        <input type="color" data-sk="glow" value="${esc(s.glow || s.stroke || '#00d1ff')}"></label>
    </div>

    <h4 class="sh-h4">Trim paths</h4>
    <p class="tiny muted" style="margin:0 0 6px">How much of the outline is drawn. Key End from 0 to 100% and the shape draws itself on.</p>
    ${row('trim.start', 'Start', 0, 1, 0.005, s.trim?.start ?? 0, pct)}
    ${row('trim.end', 'End', 0, 1, 0.005, s.trim?.end ?? 1, pct)}
    ${row('trim.offset', 'Offset', -1, 1, 0.005, s.trim?.offset ?? 0, pct)}
    <div class="btn-row"><button class="btn btn-sm btn-ghost" data-shact="draw-on">Draw on over ½ s</button>
      <button class="btn btn-sm btn-ghost" data-shact="draw-off">…and off at the end</button></div>

    <h4 class="sh-h4">Repeater</h4>
    ${row('repeat.count', 'Copies', 1, 60, 1, s.repeat?.count ?? 1, (v) => `${Math.round(v)}`)}
    ${row('repeat.dx', 'Each copy shifts X', -0.5, 0.5, 0.005, s.repeat?.dx ?? 0, pct)}
    ${row('repeat.dy', 'Each copy shifts Y', -0.5, 0.5, 0.005, s.repeat?.dy ?? 0, pct)}
    ${row('repeat.rotate', 'Each copy turns', -180, 180, 1, s.repeat?.rotate ?? 0, deg)}
    ${row('repeat.scale', 'Each copy scales', 0.3, 1.5, 0.01, s.repeat?.scale ?? 1, pct)}
    ${row('repeat.fade', 'Copies fade', 0, 1, 0.01, s.repeat?.fade ?? 0, pct)}

    <h4 class="sh-h4">Wiggle &amp; zigzag</h4>
    ${row('wiggle.amount', 'Wiggle', 0, 1, 0.01, s.wiggle?.amount ?? 0, pct)}
    ${slider({ key: 'wiggle.detail', label: 'Wiggle detail', value: s.wiggle?.detail ?? 6, min: 2, max: 30, step: 1 })}
    ${slider({ key: 'wiggle.speed', label: 'Wiggle speed', value: s.wiggle?.speed ?? 1, min: 0, max: 5, step: 0.1 })}
    ${row('zigzag.amount', 'Zigzag', 0, 1, 0.01, s.zigzag?.amount ?? 0, pct)}
    ${slider({ key: 'zigzag.ridges', label: 'Ridges', value: s.zigzag?.ridges ?? 12, min: 3, max: 60, step: 1 })}
  `;
}

/* ------------------------------------------------------------------ */
/* wiring                                                              */
/* ------------------------------------------------------------------ */

function wire(host) {
  if (host.dataset.shWired) return;
  host.dataset.shWired = '1';

  host.addEventListener('click', (e) => {
    if (e.target.closest('#sh-upgrade')) { licence.upgradePrompt('shape-layers', 'Shape layers'); return; }
    const preset = e.target.closest('[data-shape-preset]');
    if (preset) { licence.gate('shape-layers', () => addShape({ preset: preset.dataset.shapePreset }), { what: 'That shape' }); return; }
    const raw = e.target.closest('[data-shape-type]');
    if (raw) { licence.gate('shape-layers', () => addShape({ type: raw.dataset.shapeType }), { what: 'Shape layers' }); return; }

    const clip = selected();
    if (!clip) return;
    const key = e.target.closest('[data-shkey]');
    if (key) {
      const prop = `shape.${key.dataset.shkey}`;
      const local = Math.max(0, Math.min(clip.dur, S.time - clip.start));
      const spec = SHAPE_PROPS.find((p) => p.prop === prop);
      actions.patchSelected((c) => {
        if (c.kind !== 'shape') return;
        setKeyframe(c, prop, local, valueAt(c, prop, local, readShape(c, key.dataset.shkey) ?? spec?.def ?? 0));
      }, `Key ${spec?.label || prop}`);
      return;
    }
    const xp = e.target.closest('[data-shexpr]');
    if (xp) {
      const prop = `shape.${xp.dataset.shexpr}`;
      openExpressionEditor(clip, prop, { label: SHAPE_PROPS.find((p) => p.prop === prop)?.label || prop });
      return;
    }
    const act = e.target.closest('[data-shact]');
    if (act) {
      if (act.dataset.shact === 'draw-on') {
        actions.patchSelected((c) => {
          if (c.kind !== 'shape') return;
          c.keyframes['shape.trim.end'] = [{ t: 0, v: 0, ease: 'ease' }, { t: Math.min(0.5, c.dur * 0.5), v: 1, ease: 'ease' }];
          c.shape.trim = { ...(c.shape.trim || {}), start: 0, end: 1 };
        }, 'Draw the shape on');
      } else if (act.dataset.shact === 'draw-off') {
        actions.patchSelected((c) => {
          if (c.kind !== 'shape') return;
          const from = Math.max(0.1, c.dur - 0.5);
          const keys = (c.keyframes['shape.trim.start'] ||= []);
          keys.length = 0;
          keys.push({ t: from, v: 0, ease: 'ease' }, { t: c.dur, v: 1, ease: 'ease' });
        }, 'Draw the shape off');
      }
    }
  });

  // Sliders: live while dragging, one history entry on release.
  host.addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    if (!k || e.target.type !== 'range') return;
    const value = Number(e.target.value);
    const label = host.querySelector(`[data-val="${CSS.escape(k)}"]`);
    if (label) label.textContent = formatFor(k, value);
    const clip = selected();
    if (!clip) return;
    writeShape(clip, k, value);
    drawFrame();
  });
  host.addEventListener('change', (e) => {
    const clip = selected();
    if (!clip) return;
    if (e.target.id === 'sh-name') {
      actions.patchSelected((c) => { if (c.kind === 'shape') { c.shape.name = e.target.value.trim().slice(0, 40); c.label = c.shape.name; } }, 'Rename shape');
      return;
    }
    const k = e.target.dataset.k;
    if (k && e.target.type === 'range') { actions.patchSelected((c) => writeShape(c, k, Number(e.target.value)), `Shape ${k}`, `shape:${k}`); return; }
    if (k && e.target.tagName === 'SELECT') {
      actions.patchSelected((c) => { if (c.kind === 'shape') { if (k === 'type') { c.shape.type = e.target.value; c.shape.name = SHAPE_TYPES.find(([id]) => id === e.target.value)?.[1] || c.shape.name; c.label = c.shape.name; } else c.shape[k] = e.target.value; } }, 'Change shape');
      return;
    }
    if (k && e.target.type === 'checkbox') {
      actions.patchSelected((c) => { if (c.kind === 'shape') c.shape[k] = e.target.checked; }, 'Change shape');
      return;
    }
    const sk = e.target.dataset.sk;
    if (sk === 'glowOn') {
      const colour = host.querySelector('[data-sk="glow"]')?.value || '#00d1ff';
      actions.patchSelected((c) => { if (c.kind === 'shape') c.shape.glow = e.target.checked ? colour : null; }, 'Glow');
      return;
    }
    if (sk === 'glow') {
      actions.patchSelected((c) => { if (c.kind === 'shape' && c.shape.glow) c.shape.glow = e.target.value; }, 'Glow colour');
      return;
    }
    if (sk && e.target.type === 'color') {
      actions.patchSelected((c) => { if (c.kind === 'shape') c.shape[sk] = e.target.value; }, 'Shape colour');
    }
  });
}

function selected() {
  const ids = [...S.sel];
  const clip = ids.length === 1 ? S.project.clips.find((c) => c.id === ids[0]) : null;
  return clip?.kind === 'shape' ? clip : null;
}

function readShape(clip, key) {
  return key.split('.').reduce((o, k) => (o ? o[k] : undefined), clip.shape);
}

/* A dotted key under shape; once the property is animated, the slider sets a key at the playhead. */
function writeShape(clip, key, value) {
  if (clip.kind !== 'shape') return;
  const prop = `shape.${key}`;
  if (clip.keyframes?.[prop]?.length) {
    const local = Math.max(0, Math.min(clip.dur, S.time - clip.start));
    setKeyframe(clip, prop, local, value);
    return;
  }
  const parts = key.split('.');
  let node = clip.shape;
  for (let i = 0; i < parts.length - 1; i++) node = node[parts[i]] ||= {};
  node[parts.at(-1)] = value;
}

function formatFor(key, v) {
  const spec = SHAPE_PROPS.find((p) => p.prop === `shape.${key}`);
  if (spec?.fmt) return spec.fmt(v);
  return String(Math.round(v * 100) / 100);
}

/* ------------------------------------------------------------------ */
/* adding                                                              */
/* ------------------------------------------------------------------ */

/** A shape layer at the playhead: a raw type, or a finished piece. */
export function addShape({ type = 'rect', preset = null, dur = 3, at = null } = {}) {
  let track = S.project.tracks.find((t) => t.kind === 'video' && t.name === 'Shapes');
  if (!track) track = addTrack(S.project, 'video', 'Shapes');
  const start = at ?? Math.min(S.time, Math.max(0, duration(S.project)));
  const clip = addClip(S.project, { trackId: track.id, start, dur, kind: 'shape' });
  clip.shape = defaultShape(type);
  const piece = preset ? SHAPE_PRESET_BY_ID[preset] : null;
  if (piece) {
    piece.build(clip, dur);
    clip.shape.name = piece.name;
  }
  clip.label = clip.shape.name;
  actions.select([clip.id]);
  actions.commit(`Add ${clip.shape.name}`);
  toast(`${clip.shape.name} added at the playhead`, 'ok', 2600);
  return clip;
}

/* ------------------------------------------------------------------ */
/* thumbnails                                                          */
/* ------------------------------------------------------------------ */

/* Each piece at the moment it looks most like itself, through the same
   drawShape the renderer uses, with its keys resolved. */
function paintThumb(cv, piece) {
  if (!piece) return;
  const ctx = cv.getContext('2d');
  const w = cv.width, h = cv.height;
  ctx.fillStyle = '#14161c';
  ctx.fillRect(0, 0, w, h);
  const clip = { keyframes: {}, expressions: {}, shape: defaultShape('rect'), dur: 3, id: `thumb-${piece.id}`, start: 0 };
  piece.build(clip, 3);
  const t = 0.5;
  const read = (prop, fb) => valueAt(clip, `shape.${prop}`, t, fb);
  try { drawShape(ctx, w, h, { ...clip.shape, x: 0.5, y: 0.5 }, t, 3, read); } catch { /* a thumbnail is never worth an error */ }
}
