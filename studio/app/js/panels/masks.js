/*
 * The windows and qualifier section of the Colour panel.
 *
 * Two halves of one idea, and they have to sit together because they are used
 * together: a window says *where* a grade is allowed to happen, a qualifier
 * says *what colour*, and between them you can grade one jacket in a crowd.
 * Separating them into two panels would be tidier and would hide the one thing
 * that matters, which is that they intersect.
 *
 * "Show the matte" is not a debugging toggle — it is how the work is actually
 * done. Nobody keys a colour by looking at the picture; you look at the matte,
 * get the edges clean, and only then look at the grade.
 */

import { $, $$, esc, slider, group, toast } from '../ui.js';
import { S, actions, drawFrame } from '../main.js';
import { newMask, newQualifier, SHAPES, rgbToHsl } from '../engine/mask.js';
import * as licence from '../licence.js';

/* Which mask the viewer's handles are attached to, and whether the matte is
   being shown instead of the picture. Session state, not project state: what
   you had selected is not part of the edit. */
let picked = null;
let showMatte = false;
let eyedropper = false;

export function pickedMask() { return picked; }
export function mattePreview() { return showMatte; }
export function setPicked(id) { picked = id; }

const SHAPE_NAMES = { rect: 'Rectangle', ellipse: 'Oval', polygon: 'Free shape' };
const TARGETS = [
  ['grade', 'Limit the grade to it'],
  ['clip', 'Cut the picture to it'],
];

export function masksMarkup(clip) {
  if (!clip) {
    return group('Windows &amp; qualifier',
      '<p class="tiny muted" style="margin:0">Select one clip to put a window on it.</p>',
      false, 'data-min="expert"');
  }
  const masks = clip.masks || [];
  const q = clip.color.qualifier || newQualifier();
  const locked = !licence.can('all-filters');

  return group('Windows &amp; qualifier', `
    <p class="tiny muted" style="margin:0 0 9px">
      A window says <b>where</b> a grade happens. The qualifier says <b>what colour</b>.
      Use both and you are grading one thing in the shot rather than the shot.
    </p>

    ${locked ? `<div class="note pro tiny">Windows and the qualifier are in
      ${esc(licence.requires('all-filters')?.name || 'Creator')}.
      <button class="btn btn-sm" data-act="upgrade-mask" style="margin-top:8px">See what's included</button>
    </div>` : `
    <div class="btn-row" style="margin-top:0">
      ${SHAPES.map((sh) => `<button class="btn btn-sm" data-addmask="${sh}"
        title="Add a ${SHAPE_NAMES[sh].toLowerCase()} window">+ ${esc(SHAPE_NAMES[sh])}</button>`).join('')}
    </div>

    ${masks.length ? `<div id="mk-list" style="margin-top:12px">
      ${masks.map((m, i) => maskRow(clip, m, i)).join('')}
    </div>` : '<p class="tiny muted" style="margin:10px 0 0">No windows yet — the grade covers the whole frame.</p>'}

    <div class="mk-sep"></div>

    <label class="tl-toggle" style="width:100%;justify-content:space-between">
      <span>Qualifier — grade one colour only</span>
      <input type="checkbox" id="q-on" ${q.on ? 'checked' : ''}>
    </label>

    ${q.on ? `
      <div class="btn-row" style="margin-top:9px">
        <button class="btn btn-sm ${eyedropper ? 'on' : ''}" id="q-pick"
          title="Click the picture to pick the colour to grade">
          ${eyedropper ? '◉ Click the picture' : '◎ Pick from the picture'}</button>
        <button class="btn btn-sm ${showMatte ? 'on' : ''}" id="q-matte"
          title="Look at the selection instead of the picture">
          ${showMatte ? '✓ Showing the matte' : 'Show the matte'}</button>
      </div>
      <p class="tiny muted" style="margin:8px 0 4px">
        Watch the matte while you set these: white is selected, black is not, and
        grey is a soft edge. Clean edges here are the whole job.
      </p>
      <div class="q-swatch" id="q-swatch" style="background:${hueCss(q)}"></div>
      ${slider({ key: 'q.hue.centre', label: 'Hue', value: q.hue.centre, min: 0, max: 359, step: 1,
        fmt: (v) => `${Math.round(v)}°` })}
      ${slider({ key: 'q.hue.width', label: 'How many hues', value: q.hue.width, min: 2, max: 180, step: 1,
        fmt: (v) => `${Math.round(v)}°` })}
      ${slider({ key: 'q.hue.soft', label: 'Hue softness', value: q.hue.soft, min: 0, max: 60, step: 1,
        fmt: (v) => `${Math.round(v)}°` })}
      ${slider({ key: 'q.sat.low', label: 'Least saturated', value: q.sat.low, min: 0, max: 1, step: 0.01,
        fmt: (v) => `${Math.round(v * 100)}%` })}
      ${slider({ key: 'q.sat.high', label: 'Most saturated', value: q.sat.high, min: 0, max: 1, step: 0.01,
        fmt: (v) => `${Math.round(v * 100)}%` })}
      ${slider({ key: 'q.lum.low', label: 'Darkest', value: q.lum.low, min: 0, max: 1, step: 0.01,
        fmt: (v) => `${Math.round(v * 100)}%` })}
      ${slider({ key: 'q.lum.high', label: 'Brightest', value: q.lum.high, min: 0, max: 1, step: 0.01,
        fmt: (v) => `${Math.round(v * 100)}%` })}
      ${slider({ key: 'q.blur', label: 'Soften the edges', value: q.blur, min: 0, max: 12, step: 0.5,
        fmt: (v) => v.toFixed(1) })}
      <label class="tl-toggle" style="width:100%;justify-content:space-between;margin-top:8px">
        <span>Everything except that colour</span>
        <input type="checkbox" id="q-invert" ${q.invert ? 'checked' : ''}>
      </label>` : ''}
    `}
  `, Boolean(masks.length || q.on), 'data-min="expert"');
}

function hueCss(q) {
  return `hsl(${q.hue.centre} ${Math.round(((q.sat.low + q.sat.high) / 2) * 100)}% ${
    Math.round(((q.lum.low + q.lum.high) / 2) * 100)}%)`;
}

function maskRow(clip, m, i) {
  const on = picked === m.id;
  return `
    <div class="mk-row ${on ? 'on' : ''}" data-mask="${esc(m.id)}">
      <div class="mk-head">
        <button class="mk-eye ${m.on === false ? 'off' : ''}" data-maskon="${esc(m.id)}"
          title="${m.on === false ? 'Switch this window on' : 'Switch this window off'}">
          ${m.on === false ? '○' : '●'}</button>
        <button class="mk-name" data-pickmask="${esc(m.id)}">
          ${esc(SHAPE_NAMES[m.shape] || m.shape)} ${i + 1}${m.invert ? ' · inverted' : ''}
        </button>
        <button class="mk-del" data-delmask="${esc(m.id)}" title="Remove this window">✕</button>
      </div>
      ${on ? `
        <div class="mk-body">
          <select class="tp-select mk-target" data-masktarget="${esc(m.id)}">
            ${TARGETS.map(([v, label]) => `<option value="${v}"
              ${(m.target || 'grade') === v ? 'selected' : ''}>${esc(label)}</option>`).join('')}
          </select>
          ${slider({ key: `mask.${m.id}.x`, label: 'Across', value: m.x, min: -0.2, max: 1.2, step: 0.005,
            fmt: (v) => `${Math.round(v * 100)}%` })}
          ${slider({ key: `mask.${m.id}.y`, label: 'Down', value: m.y, min: -0.2, max: 1.2, step: 0.005,
            fmt: (v) => `${Math.round(v * 100)}%` })}
          ${slider({ key: `mask.${m.id}.w`, label: 'Width', value: m.w, min: 0.02, max: 2, step: 0.005,
            fmt: (v) => `${Math.round(v * 100)}%` })}
          ${slider({ key: `mask.${m.id}.h`, label: 'Height', value: m.h, min: 0.02, max: 2, step: 0.005,
            fmt: (v) => `${Math.round(v * 100)}%` })}
          ${slider({ key: `mask.${m.id}.angle`, label: 'Angle', value: m.angle, min: -180, max: 180, step: 1,
            fmt: (v) => `${Math.round(v)}°` })}
          ${slider({ key: `mask.${m.id}.feather`, label: 'Softness', value: m.feather, min: 0, max: 0.9, step: 0.01,
            fmt: (v) => `${Math.round(v * 100)}%` })}
          ${slider({ key: `mask.${m.id}.opacity`, label: 'Strength', value: m.opacity ?? 1, min: 0, max: 1, step: 0.01,
            fmt: (v) => `${Math.round(v * 100)}%` })}
          <label class="tl-toggle" style="width:100%;justify-content:space-between;margin-top:6px">
            <span>Everything outside it instead</span>
            <input type="checkbox" data-maskinv="${esc(m.id)}" ${m.invert ? 'checked' : ''}>
          </label>
          <p class="tiny muted" style="margin:8px 0 0">
            Drag it on the picture, or animate it: every one of these has a stopwatch
            in the layer properties, so a window can follow a moving subject.
          </p>
        </div>` : ''}
    </div>`;
}

/* ------------------------------------------------------------------ */
/* wiring                                                              */
/* ------------------------------------------------------------------ */

function selectedClip() {
  const sel = [...S.sel];
  return sel.length === 1 ? S.project.clips.find((c) => c.id === sel[0]) : null;
}

function maskById(clip, id) { return (clip.masks || []).find((m) => m.id === id) || null; }

/** Handle a click inside the masks section. Returns true when it was ours. */
export function handleMaskClick(e, refresh) {
  const clip = selectedClip();

  const add = e.target.closest('[data-addmask]');
  if (add) {
    if (!clip) { toast('Select one clip first', 'bad'); return true; }
    licence.gate('all-filters', () => {
      const m = newMask(add.dataset.addmask);
      clip.masks = [...(clip.masks || []), m];
      picked = m.id;
      actions.commit(`Add ${SHAPE_NAMES[m.shape].toLowerCase()} window`);
      refresh?.();
    }, { what: 'Windows' });
    return true;
  }

  const pick = e.target.closest('[data-pickmask]');
  if (pick) {
    picked = picked === pick.dataset.pickmask ? null : pick.dataset.pickmask;
    refresh?.();
    drawFrame();
    return true;
  }

  const del = e.target.closest('[data-delmask]');
  if (del && clip) {
    clip.masks = (clip.masks || []).filter((m) => m.id !== del.dataset.delmask);
    // The keyframes for a window that no longer exists would sit in the
    // project forever, and turn up in the layer properties as rows nothing
    // can move.
    for (const key of Object.keys(clip.keyframes || {})) {
      if (key.startsWith(`masks.${del.dataset.delmask}.`)) delete clip.keyframes[key];
    }
    if (picked === del.dataset.delmask) picked = null;
    actions.commit('Remove window');
    refresh?.();
    return true;
  }

  const onOff = e.target.closest('[data-maskon]');
  if (onOff && clip) {
    const m = maskById(clip, onOff.dataset.maskon);
    if (m) { m.on = m.on === false; actions.commit(m.on ? 'Window on' : 'Window off'); refresh?.(); }
    return true;
  }

  if (e.target.closest('#q-matte')) {
    showMatte = !showMatte;
    refresh?.();
    drawFrame();
    return true;
  }
  if (e.target.closest('#q-pick')) {
    eyedropper = !eyedropper;
    refresh?.();
    toast(eyedropper ? 'Click the picture to pick a colour' : 'Picker off');
    return true;
  }
  if (e.target.closest('[data-act="upgrade-mask"]')) {
    licence.gate('all-filters', () => {}, { what: 'Windows and the qualifier' });
    return true;
  }
  return false;
}

/** Handle a change on a mask or qualifier control. Returns true when ours. */
export function handleMaskInput(e, { live = false, refresh } = {}) {
  const clip = selectedClip();
  if (!clip) return false;

  const inv = e.target.closest('[data-maskinv]');
  if (inv) {
    const m = maskById(clip, inv.dataset.maskinv);
    if (m) { m.invert = e.target.checked; actions.commit('Invert window'); refresh?.(); }
    return true;
  }
  const tgt = e.target.closest('[data-masktarget]');
  if (tgt) {
    const m = maskById(clip, tgt.dataset.masktarget);
    if (m) { m.target = e.target.value; actions.commit('Window does'); }
    return true;
  }
  if (e.target.id === 'q-on') {
    clip.color.qualifier = { ...(clip.color.qualifier || newQualifier()), on: e.target.checked };
    actions.commit(e.target.checked ? 'Qualifier on' : 'Qualifier off');
    refresh?.();
    return true;
  }
  if (e.target.id === 'q-invert') {
    clip.color.qualifier = { ...(clip.color.qualifier || newQualifier()), invert: e.target.checked };
    actions.commit('Invert the qualifier');
    return true;
  }

  const key = e.target.dataset.k;
  if (!key) return false;

  if (key.startsWith('mask.')) {
    const [, id, field] = key.split('.');
    const m = maskById(clip, id);
    if (!m) return false;
    m[field] = Number(e.target.value);
    if (live) drawFrame(); else actions.commit('Adjust window', `mask:${id}:${field}`);
    return true;
  }
  if (key.startsWith('q.')) {
    const q = { ...(clip.color.qualifier || newQualifier()) };
    const parts = key.split('.').slice(1);            // hue.centre, sat.low, blur
    if (parts.length === 1) q[parts[0]] = Number(e.target.value);
    else q[parts[0]] = { ...q[parts[0]], [parts[1]]: Number(e.target.value) };
    /*
     * The two ends of a range cannot cross.
     *
     * Dragging "darkest" past "brightest" gives an empty band and a matte that
     * silently selects nothing — which reads as the qualifier being broken
     * rather than as the sliders being in the wrong order.
     */
    if (q.sat.low > q.sat.high) q.sat.low = q.sat.high;
    if (q.lum.low > q.lum.high) q.lum.low = q.lum.high;
    clip.color.qualifier = q;
    if (live) drawFrame(); else actions.commit('Adjust the qualifier', `qual:${key}`);
    return true;
  }
  return false;
}

/** True while the eyedropper is armed, so the viewer knows to take the click. */
export function pickerArmed() { return eyedropper; }

/**
 * Set the qualifier from a pixel the user clicked.
 *
 * A band around what they picked rather than exactly it: nobody wants the one
 * hue under the cursor, they want the thing that colour belongs to, and a
 * range wide enough to survive the noise in a compressed frame.
 */
export function pickColourAt(r, g, b) {
  const clip = selectedClip();
  if (!clip) return false;
  const hsl = rgbToHsl(r, g, b);
  const q = { ...(clip.color.qualifier || newQualifier()), on: true };
  q.hue = { centre: Math.round(hsl.h), width: 40, soft: 18 };
  q.sat = { low: Math.max(0, hsl.s - 0.28), high: Math.min(1, hsl.s + 0.32), soft: 0.12 };
  q.lum = { low: Math.max(0, hsl.l - 0.3), high: Math.min(1, hsl.l + 0.3), soft: 0.12 };
  clip.color.qualifier = q;
  eyedropper = false;
  actions.commit('Pick a colour to grade');
  return true;
}

export { $, $$ };
