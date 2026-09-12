/*
 * The inspector: everything about whatever is selected.
 *
 * Controls declare a minimum skill level, so the same panel is nine fields for
 * a beginner and thirty for an expert without any of it being a different
 * screen. Sliders coalesce into one undo step per gesture — dragging exposure
 * should not leave two hundred entries in the history.
 */

import { $, $$, esc, group, slider, selectRow, toggleRow, empty, dur, tc } from '../ui.js';
import { S, actions, drawFrame } from '../main.js';
import { clipById, mediaById, valueAt, setKeyframe, clearKeyframes } from '../engine/project.js';
import { CONTROLS, LOOKS } from '../engine/filters.js';
import { pickerMarkup, wirePicker } from './transition-picker.js';
import { BLEND_MODES } from '../engine/render.js';
import * as licence from '../licence.js';
import { trackSection, handleInspectorClick } from './tracking.js';

export function mount(host) {
  if (!host) return;
  const ids = [...S.sel];
  if (!ids.length) {
    host.innerHTML = `<div class="panel-h"><h2>Inspector</h2></div>
      ${empty('▣', 'Nothing selected', 'Click a clip on the timeline to change how it looks and sounds.')}`;
    return;
  }
  if (ids.length > 1) {
    host.innerHTML = `<div class="panel-h"><h2>${ids.length} clips</h2></div>
      <p class="panel-sub">Changes apply to all of them.</p>
      ${transformSection(null)}${colourSection(null)}${audioSection(null)}`;
    wire(host);
  wirePicker(host, 'ins-tp');
    return;
  }

  const clip = clipById(S.project, ids[0]);
  if (!clip) { host.innerHTML = ''; return; }
  const media = mediaById(S.project, clip.mediaId);
  const local = S.time - clip.start;

  host.innerHTML = `
    <div class="panel-h">
      <h2>${esc(media?.name || clip.text?.content || 'Title')}</h2>
    </div>
    <p class="panel-sub">
      ${dur(clip.dur)} · starts ${tc(clip.start, S.project.settings.fps)}
      ${media ? ` · ${media.width || '?'}×${media.height || '?'}` : ''}
    </p>
    ${clip.kind === 'title' ? '' : transformSection(clip)}
    ${clip.kind === 'title' ? '' : timingSection(clip)}
    ${clip.kind === 'title' ? '' : colourSection(clip)}
    ${audioSection(clip, media)}
    ${transitionSection(clip)}
    ${trackSection(clip)}
    ${keyframeSection(clip, local)}`;

  wire(host);
  wirePicker(host, 'ins-tp');
}

/* ------------------------------------------------------------------ */
/* sections                                                            */
/* ------------------------------------------------------------------ */

function transformSection(clip) {
  const t = clip?.transform || { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1, crop: {}, blend: 'normal' };
  const crop = t.crop || { t: 0, r: 0, b: 0, l: 0 };
  return group('Transform', `
    ${slider({ key: 'transform.scale', label: 'Scale', value: t.scale, min: 0.1, max: 4, step: 0.01,
      fmt: (v) => `${Math.round(v * 100)}%` })}
    ${slider({ key: 'transform.x', label: 'Position X', value: t.x, min: -1, max: 1, step: 0.005,
      fmt: (v) => `${Math.round(v * 100)}` })}
    ${slider({ key: 'transform.y', label: 'Position Y', value: t.y, min: -1, max: 1, step: 0.005,
      fmt: (v) => `${Math.round(v * 100)}` })}
    ${slider({ key: 'transform.rotate', label: 'Rotation', value: t.rotate, min: -180, max: 180, step: 1,
      fmt: (v) => `${Math.round(v)}°` })}
    ${slider({ key: 'transform.opacity', label: 'Opacity', value: t.opacity, min: 0, max: 1, step: 0.01,
      fmt: (v) => `${Math.round(v * 100)}%` })}
    <div data-min="expert">
      ${slider({ key: 'crop.t', label: 'Crop top', value: crop.t || 0, min: 0, max: 0.45, step: 0.005,
        fmt: (v) => `${Math.round(v * 100)}%` })}
      ${slider({ key: 'crop.b', label: 'Crop bottom', value: crop.b || 0, min: 0, max: 0.45, step: 0.005,
        fmt: (v) => `${Math.round(v * 100)}%` })}
      ${slider({ key: 'crop.l', label: 'Crop left', value: crop.l || 0, min: 0, max: 0.45, step: 0.005,
        fmt: (v) => `${Math.round(v * 100)}%` })}
      ${slider({ key: 'crop.r', label: 'Crop right', value: crop.r || 0, min: 0, max: 0.45, step: 0.005,
        fmt: (v) => `${Math.round(v * 100)}%` })}
      ${selectRow({ key: 'transform.blend', label: 'Blend mode', value: t.blend || 'normal',
        options: BLEND_MODES.map((b) => [b, b.replace('-', ' ')]) })}
    </div>
    <div class="btn-row"><button class="btn btn-sm btn-ghost" data-act="reset-transform">Reset</button>
      <button class="btn btn-sm btn-ghost" data-act="fill">Fill frame</button></div>
  `);
}

function timingSection(clip) {
  const locked = !licence.can('speed-ramp');
  return group('Speed &amp; timing', `
    ${slider({ key: 'speed', label: 'Speed', value: clip.speed || 1, min: 0.25, max: 4, step: 0.05,
      fmt: (v) => `${v.toFixed(2)}×` })}
    ${toggleRow({ key: 'reversed', label: 'Play backwards', on: clip.reversed,
      hint: clip.reversed ? 'Reversed clips play silent — no browser can play audio backwards.' : '' })}
    ${locked ? `<div class="note pro tiny">Speed ramps with easing curves are in
      ${esc(licence.requires('speed-ramp')?.name || 'Creator')}.
      <button class="btn btn-sm" data-act="upgrade-speed" style="margin-top:8px">See what's included</button></div>` : ''}
    <div class="btn-row">
      <button class="btn btn-sm btn-ghost" data-act="speed-half">½×</button>
      <button class="btn btn-sm btn-ghost" data-act="speed-1">1×</button>
      <button class="btn btn-sm btn-ghost" data-act="speed-2">2×</button>
      <button class="btn btn-sm btn-ghost" data-act="freeze">Freeze frame</button>
    </div>
  `, false, 'data-min="intermediate"');
}

function colourSection(clip) {
  const c = clip?.color || {};
  const looks = LOOKS.map((l) => {
    const locked = !licence.can(l.tier === 'free' ? 'basic-filters' : 'all-filters');
    return `<button class="chip ${c.look === l.id ? 'on' : ''} ${locked ? 'locked' : ''}"
      data-look="${esc(l.id)}" data-tier="${esc(l.tier)}" title="${esc(l.name)}">
      <span class="sw" style="background:${esc(l.swatch)}"></span>${esc(l.name)}</button>`;
  }).join('');

  const sliders = CONTROLS
    .map((ctl) => `<div data-min="${ctl.level}">${slider({
      key: `color.${ctl.key}`, label: ctl.label, value: c[ctl.key] ?? 0,
      min: ctl.min, max: ctl.max, step: ctl.step || 1,
      fmt: (v) => (ctl.step ? Number(v).toFixed(1) : String(Math.round(v))),
    })}</div>`).join('');

  return group('Colour', `
    <div class="chips" id="look-chips">${looks}</div>
    ${c.look && c.look !== 'none' ? slider({
      key: 'color.strength', label: 'Look strength', value: c.strength ?? 1, min: 0, max: 1.5, step: 0.05,
      fmt: (v) => `${Math.round(v * 100)}%` }) : ''}
    ${sliders}
    <div class="btn-row"><button class="btn btn-sm btn-ghost" data-act="reset-colour">Reset colour</button></div>
  `);
}

function audioSection(clip, mediaRec) {
  const hasSound = !clip || !mediaRec || mediaRec.hasAudio;
  if (!hasSound) {
    return group('Audio', '<p class="tiny muted" style="margin:0">This clip has no audio track.</p>', false);
  }
  const c = clip || { volume: 1, fadeIn: 0, fadeOut: 0 };
  return group('Audio', `
    ${slider({ key: 'volume', label: 'Volume', value: c.volume ?? 1, min: 0, max: 2, step: 0.01,
      fmt: (v) => `${Math.round(v * 100)}%` })}
    ${slider({ key: 'fadeIn', label: 'Fade in', value: c.fadeIn ?? 0, min: 0, max: 4, step: 0.05,
      fmt: (v) => `${v.toFixed(2)}s` })}
    ${slider({ key: 'fadeOut', label: 'Fade out', value: c.fadeOut ?? 0, min: 0, max: 4, step: 0.05,
      fmt: (v) => `${v.toFixed(2)}s` })}
  `, false);
}

function transitionSection(clip) {
  const current = clip.transitionIn;
  return group('Transition in', `
    <p class="tiny muted" style="margin:0 0 9px">Blends from whatever is before this clip on the same track.</p>
    ${pickerMarkup(current?.type, 'ins-tp')}
    ${current ? slider({ key: 'transitionIn.dur', label: 'Length', value: current.dur, min: 0.08, max: 2, step: 0.02,
      fmt: (v) => `${v.toFixed(2)}s` }) : ''}
    ${current ? '<div class="btn-row"><button class="btn btn-sm btn-ghost" data-act="no-trans">Remove</button></div>' : ''}
  `, false, 'data-min="intermediate"');
}

function keyframeSection(clip, local) {
  const props = Object.keys(clip.keyframes || {});
  const locked = !licence.can('keyframes');
  return group('Keyframes', `
    <p class="tiny muted" style="margin:0 0 9px">
      Park the playhead, set a value, press the key button. Two keys make a move.
    </p>
    ${locked ? `<div class="note pro tiny">Keyframes are in
      ${esc(licence.requires('keyframes')?.name || 'Creator')}.
      <button class="btn btn-sm" data-act="upgrade-kf" style="margin-top:8px">See what's included</button></div>` : `
    <div class="btn-row" style="margin-top:0">
      <button class="btn btn-sm" data-key="transform.scale">◆ Scale</button>
      <button class="btn btn-sm" data-key="transform.x">◆ X</button>
      <button class="btn btn-sm" data-key="transform.y">◆ Y</button>
      <button class="btn btn-sm" data-key="transform.opacity">◆ Opacity</button>
    </div>`}
    ${props.length ? `<div style="margin-top:12px">${props.map((p) => `
      <div class="field"><label>${esc(p.split('.').pop())}
        <span class="val">${clip.keyframes[p].length} keys · now ${
          Number(valueAt(clip, p, local, 0)).toFixed(2)}</span></label>
        <button class="btn btn-sm btn-ghost" data-clearkey="${esc(p)}">Clear</button></div>`).join('')}</div>` : ''}
  `, false, 'data-min="expert"');
}

/* ------------------------------------------------------------------ */
/* wiring                                                              */
/* ------------------------------------------------------------------ */

function wire(host) {
  /*
   * Attached once, to a host that outlives its own contents.
   *
   * mount() replaces the panel's innerHTML but not the panel element, so a
   * listener added here on every mount would survive every re-render. Since a
   * slider commits, and committing re-mounts, the count would double on each
   * drag — a hundred listeners after seven nudges of an exposure slider, and
   * an editor that gets slower the longer you grade in it.
   */
  if (host.dataset.wired) return;
  host.dataset.wired = '1';

  /*
   * Dragging writes straight to the clip; releasing is what becomes undoable.
   *
   * Committing on every `input` would also rebuild this panel underneath the
   * control being dragged, which throws the drag away mid-gesture. Editors
   * are judged on exactly this: a colour wheel you cannot drag smoothly is a
   * colour wheel nobody trusts.
   */
  host.addEventListener('input', (e) => {
    const key = e.target.dataset.k;
    if (!key) return;
    const value = e.target.type === 'checkbox' ? e.target.checked
      : e.target.type === 'range' ? Number(e.target.value) : e.target.value;
    if (e.target.type === 'range') {
      liveKey(key, value);
      const label = host.querySelector(`[data-val="${CSS.escape(key)}"]`);
      if (label) label.textContent = formatFor(key, value);
    } else {
      applyKey(key, value);
    }
  });

  // Mouse-up on a slider, or a keyboard arrow, ends the gesture.
  host.addEventListener('change', (e) => {
    if (e.target.dataset.k && e.target.type === 'range') {
      applyKey(e.target.dataset.k, Number(e.target.value));
    }
  });

  host.addEventListener('change', (e) => {
    if (e.target.dataset.k && e.target.tagName === 'SELECT') applyKey(e.target.dataset.k, e.target.value);
  });

  host.addEventListener('click', (e) => {
    const look = e.target.closest('[data-look]');
    if (look) {
      const feature = look.dataset.tier === 'free' ? 'basic-filters' : 'all-filters';
      licence.gate(feature, () => {
        actions.patchSelected((c) => { c.color.look = look.dataset.look; c.color.strength = 1; }, 'Change look');
      }, { what: 'The full filter library' });
      return;
    }

    const trans = e.target.closest('[data-trans]');
    if (trans) {
      const feature = trans.dataset.tier === 'free' ? 'transitions' : 'all-filters';
      licence.gate(feature, () => {
        actions.patchSelected((c) => {
          c.transitionIn = { type: trans.dataset.trans, dur: Math.min(0.4, c.dur / 3) };
        }, 'Set transition');
      }, { what: 'That transition' });
      return;
    }

    const kf = e.target.closest('[data-key]');
    if (kf) {
      licence.gate('keyframes', () => {
        actions.patchSelected((c) => {
          const prop = kf.dataset.key;
          const local = Math.max(0, Math.min(c.dur, S.time - c.start));
          const currentValue = readProp(c, prop);
          setKeyframe(c, prop, local, currentValue);
        }, 'Add keyframe');
      }, { what: 'Keyframes' });
      return;
    }

    const clearKey = e.target.closest('[data-clearkey]');
    if (clearKey) {
      actions.patchSelected((c) => clearKeyframes(c, clearKey.dataset.clearkey), 'Clear keyframes');
      return;
    }

    const pinTrack = e.target.closest('[data-pintrack]');
    if (pinTrack && handleInspectorClick(null, pinTrack.dataset)) return;

    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (handleInspectorClick(act, null)) return;
    runAction(act);
  });
}

function runAction(act) {
  switch (act) {
    case 'reset-transform':
      actions.patchSelected((c) => {
        c.transform = { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1, crop: { t: 0, r: 0, b: 0, l: 0 }, blend: 'normal' };
      }, 'Reset transform');
      break;
    case 'fill':
      actions.patchSelected((c) => { c.transform.scale = 1; c.transform.x = 0; c.transform.y = 0; }, 'Fill frame');
      break;
    case 'reset-colour':
      actions.patchSelected((c) => {
        for (const ctl of CONTROLS) c.color[ctl.key] = 0;
        c.color.look = 'none'; c.color.strength = 1;
      }, 'Reset colour');
      break;
    case 'no-trans':
      actions.patchSelected((c) => { c.transitionIn = null; }, 'Remove transition');
      break;
    case 'speed-half': setSpeed(0.5); break;
    case 'speed-1': setSpeed(1); break;
    case 'speed-2': setSpeed(2); break;
    case 'freeze':
      /*
       * The one freeze frame, not a third one.
       *
       * This used to set the whole clip to a near-zero speed, which is a
       * different thing from freezing a frame — it turns the shot into a
       * still and throws the rest of it away. Both this and a duplicate in
       * main.js have been replaced by the action, which cuts either side and
       * holds only the frame you are on.
       */
      actions.freezeFrame();
      break;
    case 'upgrade-speed': licence.upgradePrompt('speed-ramp', 'Speed ramping'); break;
    case 'upgrade-kf': licence.upgradePrompt('keyframes', 'Keyframes'); break;
    default: break;
  }
}

function setSpeed(v) {
  actions.patchSelected((c) => {
    const old = c.speed || 1;
    c.dur = (c.dur * old) / v;
    c.speed = v;
  }, `Speed ${v}×`);
}

/** Apply a dotted key path to every selected clip, coalescing the undo entry. */
function applyKey(key, value) {
  actions.patchSelected((c) => writeProp(c, key, value), labelFor(key), `insp:${key}`);
}

/**
 * The same write, but during a drag: no history entry and no re-render, so the
 * preview follows the slider without the panel being rebuilt under the mouse.
 * The commit lands on `change`, once, for the whole gesture.
 */
function liveKey(key, value) {
  if (!S.sel.size) return;
  for (const id of S.sel) {
    const clip = clipById(S.project, id);
    if (clip) writeProp(clip, key, value);
  }
  drawFrame();
}

function readProp(clip, path) {
  return path.split('.').reduce((o, k) => (o ? o[k] : undefined), clip) ?? 0;
}

function writeProp(clip, path, value) {
  // 'crop.t' is shorthand for transform.crop.t — the panel says what a user
  // would call it, not where it happens to live.
  const parts = path.startsWith('crop.') ? ['transform', 'crop', path.split('.')[1]] : path.split('.');

  /*
   * Once a property is animated, its slider sets a key at the playhead rather
   * than one value for the whole clip.
   *
   * Without this, turning a stopwatch on quietly breaks every slider it
   * touches: you drag exposure, the number moves, and the picture does not —
   * because the animation is read after the static value and overrules it on
   * the very next frame. The slider looks broken, and nothing tells you why.
   * This is also the gesture itself, and the only one there is: park the
   * playhead, move the slider, and that is a key.
   */
  const prop = parts.join('.');
  if (clip.keyframes?.[prop]?.length) {
    const local = Math.max(0, Math.min(clip.dur, S.time - clip.start));
    setKeyframe(clip, prop, local, value);
    return;
  }

  let target = clip;
  for (let i = 0; i < parts.length - 1; i++) {
    target[parts[i]] ||= {};
    target = target[parts[i]];
  }
  target[parts.at(-1)] = value;
}

function labelFor(key) {
  const name = key.split('.').pop();
  return `Change ${name.replace(/([A-Z])/g, ' $1').toLowerCase()}`;
}

function formatFor(key, v) {
  if (key.includes('opacity') || key.includes('scale') || key === 'volume' || key.includes('strength')) {
    return `${Math.round(v * 100)}%`;
  }
  if (key.includes('rotate')) return `${Math.round(v)}°`;
  if (key.startsWith('crop.')) return `${Math.round(v * 100)}%`;
  if (key === 'speed') return `${Number(v).toFixed(2)}×`;
  if (key.startsWith('fade') || key.includes('dur')) return `${Number(v).toFixed(2)}s`;
  if (key.startsWith('transform.')) return String(Math.round(v * 100));
  return String(Math.round(v));
}

export { $$, tc };
