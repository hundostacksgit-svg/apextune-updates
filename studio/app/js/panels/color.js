/*
 * Colour: the look library, and a live histogram so you can see what a grade
 * is doing to the picture rather than guessing.
 */

import { $, $$, esc, toast, empty, slider } from '../ui.js';
import { S, actions, engine } from '../main.js';
import { attachPreviews } from '../engine/preview.js';
import { curvesMarkup, drawCurve, wireCurves, curvesOpen, setCurvesOpen } from './curves.js';
import { SCOPES, drawScope } from '../engine/scopes.js';
import { masksMarkup, handleMaskClick, handleMaskInput } from './masks.js';
import { wheelsMarkup, wireWheels } from '../wheels-ui.js';

/*
 * Which scope is showing, remembered for the session.
 *
 * A colourist picks one and lives in it. Resetting to a default every time the
 * panel re-renders — which it does on every slider move — would mean choosing
 * the parade again after every adjustment.
 */
let scopeKind = 'parade';

/* What each one is for, in one line. The scopes are the part of this panel
   most likely to be unfamiliar, and an instrument nobody can read is furniture. */
const SCOPE_NOTES = {
  parade: 'Red, green and blue side by side. Level them and the shot is neutral — one channel high at the bottom is a colour cast in the shadows.',
  waveform: 'Brightness against position across the frame. A flat line jammed at the top is blown highlights; jammed at the bottom is crushed blacks.',
  vector: 'Hue as direction, saturation as distance. The dotted line is where skin tones of every complexion fall — get faces onto it.',
  histogram: 'How many pixels sit at each brightness. Piled against either edge means detail has been lost there.',
};
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
  /*
   * Read from whichever corrector the node graph has selected.
   *
   * `clip` still decides whether there is anything to grade at all and still
   * owns the things that are genuinely per-clip — curves, LUTs, the clip's
   * own outline mask. `grade` is where the colour values come from and where
   * they go back to, and for corrector one it *is* the clip, so at Beginner
   * and Intermediate this reads exactly as it always did.
   */
  const grade = (clip && actions.gradeHost?.()) || clip;
  const nodeName = grade && clip && grade !== clip ? gradeNodeName(clip, grade) : null;
  const target = sel.length ? `${sel.length} clip${sel.length === 1 ? '' : 's'}` : 'every clip';

  host.innerHTML = `
    <div class="panel-h">
      <h2>Colour</h2>
      <button class="btn btn-sm btn-ghost" id="c-copy" title="Copy this grade to every clip">Match all</button>
    </div>
    <p class="panel-sub">Applies to ${esc(target)}.</p>
    ${nodeName ? `<p class="grade-on">Editing <b>${esc(nodeName)}</b> — pick another in the
      node graph, or press Alt+S for a new one.</p>` : ''}

    ${currentLevel() === 'expert' ? `
      <div class="group scope-box" id="c-scope-box" style="padding:10px">
        <!--
          Scopes read the file, not your screen. A monitor that runs warm makes
          every shot look warm, so you correct toward blue and everything you
          deliver is blue — which is why a grade is judged here and not by eye.
        -->
        <div class="scope-head">
          <span class="scope-title">Scopes</span>
          <select class="tp-select" id="scope-kind" aria-label="Which scope">
            ${SCOPES.map((sc) => `<option value="${esc(sc.id)}"
              ${sc.id === scopeKind ? 'selected' : ''}>${esc(sc.name)}</option>`).join('')}
          </select>
        </div>
        <canvas id="scope" width="512" height="200" class="scope-cv"></canvas>
        <p class="tiny muted" style="margin:7px 0 0" id="scope-note">
          ${esc(SCOPE_NOTES[scopeKind] || '')}
        </p>
      </div>` : ''}

    <!-- A hundred-odd looks is only useful if you can find one. Search first,
         then groups — a flat list this long is a list nobody reads past the
         first screen. -->
    <input class="input" id="c-look-search" placeholder="Search looks — film, mood, mono…"
           style="margin-bottom:10px">
    <div id="c-looks">${lookGroups(grade)}</div>

    <!-- Curves and LUTs were on the pricing page before they were in the app.
         They are the two things a colourist reaches for first, and the reason
         a grading panel gets called a toy without them. -->
    <details class="group" data-min="expert" id="c-curves-group" ${curvesOpen() ? 'open' : ''}>
      <summary>Curves &amp; LUTs</summary>
      <div class="gbody">
        ${clip ? curvesMarkup(clip)
          : '<p class="tiny muted" style="margin:0">Select one clip to put a curve or a LUT on it.</p>'}
      </div>
    </details>

    ${masksMarkup(clip)}

    <details class="group" data-min="expert" id="c-wheels-group" ${clip ? 'open' : ''}>
      <summary>Colour wheels</summary>
      <div class="gbody">
        ${clip ? `
          <!--
            Laid out the way every grading suite lays them out: the name above
            the wheel, its own reset on the same row, and the numbers it is
            producing underneath. The numbers matter — a wheel tells you the
            direction you pushed, only a readout tells you how far, and "match
            this shot to that one" is a job you do with numbers.
          -->
          <div class="wheels" id="c-wheels">
            ${wheelsMarkup()}
          </div>
          ${slider({ key: 'offset', label: 'Overall', value: (grade.color.wheels?.offset ?? 0),
            min: -1, max: 1, step: 0.01, fmt: (v) => Number(v).toFixed(2) })}
          <div class="btn-row" style="margin-top:6px">
            <button class="btn btn-sm btn-ghost" id="c-wheels-reset">Reset all wheels</button>
          </div>
          ${supportsUrlFilters() ? '' : `<p class="tiny muted" style="margin:9px 0 0">
            This browser does not support the filter these wheels use, so they fall back to a
            coarser approximation. Chrome or Edge gives you the real thing.</p>`}
        ` : '<p class="tiny muted" style="margin:0">Select one clip to grade it with the wheels.</p>'}
      </div>
    </details>

    <div id="c-sliders" style="margin-top:16px">
      ${clip ? CONTROLS.map((ctl) => `<div data-min="${ctl.level}">${slider({
        key: ctl.key, label: ctl.label, value: grade.color[ctl.key] ?? 0,
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
  // A look is a colour decision, so the chip shows the colour on a real frame
  // rather than a swatch guessing at it.
  attachPreviews($('#c-looks', host), 'look');

  wireCurves(host);
  // The curve canvas is only meaningful once it has a size, and it sits inside
  // a <details> that may be closed. Draw it now for the open case, and again
  // when the section is opened.
  drawCurve(host);
  $('#c-curves-group', host)?.addEventListener('toggle', (e) => {
    setCurvesOpen(e.target.open);
    if (e.target.open) drawCurve(host);
  });

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

  /*
   * The windows and qualifier section handles its own events.
   *
   * Delegated from the panel rather than bound per control: the section is
   * rebuilt whenever a window is added, removed or picked, and a listener per
   * slider would pile up one set per rebuild.
   */
  const remount = () => mount(host);
  /*
   * Bound once. mount() replaces the panel's contents but not the panel, so a
   * listener added on every mount survives every rebuild — and this section
   * rebuilds on each window added, removed or picked, which would mean one
   * extra handler per click until a single slider fired forty times.
   */
  if (!host.dataset.maskWired) {
    host.dataset.maskWired = '1';
    host.addEventListener('click', (e) => { handleMaskClick(e, remount); });
    host.addEventListener('input', (e) => { handleMaskInput(e, { live: true, refresh: null }); });
    host.addEventListener('change', (e) => { handleMaskInput(e, { live: false, refresh: remount }); });
  }

  $('#c-looks', host).addEventListener('click', (e) => {
    const btn = e.target.closest('[data-look]');
    if (!btn) return;
    const feature = btn.dataset.tier === 'free' ? 'basic-filters' : 'all-filters';
    licence.gate(feature, () => {
      /*
       * A look lands on the corrector in hand when there is one.
       *
       * Without this, picking a corrector, reaching for a look and watching it
       * land on corrector one instead would be the single most confusing thing
       * on the page — the chips sit directly above the wheels that *do* write
       * to the selected corrector.
       */
      const host = actions.gradeHost?.();
      if (host && !S.project.clips.includes(host)) {
        actions.patchGrade((g) => { g.color.look = btn.dataset.look; g.color.strength = 1; },
          'Apply look');
        return;
      }
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
    actions.patchGrade((c) => { c.color[key] = value; }, `Change ${key}`, `colour:${key}`);
    const label = host.querySelector(`[data-val="${CSS.escape(key)}"]`);
    if (label) label.textContent = String(Math.round(value));
  });

  $('#c-reset', host).addEventListener('click', () => {
    // Same rule as the looks: reset what is in hand, not the whole clip.
    const target = actions.gradeHost?.();
    if (target && !S.project.clips.includes(target)) {
      actions.patchGrade((g) => {
        for (const ctl of CONTROLS) g.color[ctl.key] = 0;
        g.color.look = 'none';
        g.color.strength = 1;
        g.color.wheels = null;
      }, 'Reset this corrector');
      return;
    }
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
    actions.patchGrade((c) => { c.color.wheels = null; }, 'Reset colour wheels');
  });

  host.addEventListener('input', (e) => {
    if (e.target.dataset.k !== 'offset') return;
    const v = Number(e.target.value);
    actions.patchGrade((c) => {
      c.color.wheels = { ...(c.color.wheels || neutralWheels()), offset: v };
    }, 'Overall exposure', 'wheel:offset');
  });

  // The wheels, and the per-wheel resets that come with them: resetting all
  // three when you only wanted one back is what makes people stop using reset.
  if (clip) wireWheels(host, { grade: () => grade, patch: actions.patchGrade });
  startScope(host);
  void $$;
}

/** Which corrector in the chain this object is, by name. */
function gradeNodeName(clip, host) {
  const i = (clip.grades || []).findIndex((n) => n === host);
  return i < 0 ? null : ((clip.grades[i].label) || `Corrector ${i + 2}`);
}

function videoClipIds() {
  return S.project.clips
    .filter((c) => S.project.tracks.find((t) => t.id === c.trackId)?.kind === 'video' && c.kind !== 'title')
    .map((c) => c.id);
}

/*
 * Keep the scope showing the frame that is on screen.
 *
 * Polled rather than driven from drawFrame, because the scope only has to be
 * roughly live: repainting it on every one of sixty frames a second would cost
 * more than the grade it is measuring. Four times a second is fast enough to
 * feel connected to the playhead and cheap enough to leave running.
 */
function startScope(host) {
  clearInterval(scopeTimer);
  const scope = $('#scope', host);
  if (!scope) return;

  /*
   * Nothing to do when it is not on screen.
   *
   * On the Colour page the scopes have their own dock, so this one is hidden —
   * and a hidden scope reading back a 1080p frame four times a second is the
   * most expensive thing the app would be doing for no reason at all.
   */
  const paint = () => {
    if (!scope.isConnected || !scope.offsetParent) return;
    drawScope(scope, engine.renderer?.canvas, scopeKind);
  };

  paint();
  scopeTimer = setInterval(paint, 250);

  $('#scope-kind', host)?.addEventListener('change', (e) => {
    scopeKind = e.target.value;
    const note = $('#scope-note', host);
    if (note) note.textContent = SCOPE_NOTES[scopeKind] || '';
    paint();
  });
}
