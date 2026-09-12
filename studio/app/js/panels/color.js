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
      <div class="group scope-box" style="padding:10px">
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

    <details class="group" data-min="expert" ${clip ? 'open' : ''}>
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
            ${['lift', 'gamma', 'gain'].map((which) => `
              <div class="wheel">
                <!--
                  Lift, Gamma and Gain rather than Shadows, Midtones and
                  Highlights.

                  These wheels only appear at Professional, and those are the
                  words the people who see them already use — every tutorial,
                  every grading conversation and every other application says
                  lift/gamma/gain. They are also short enough to fit the
                  column, where "Highlights" was truncating to "HIGHLIGH…" on a
                  control whose whole job is naming which part of the range it
                  touches. The plain-English name is on the hover tip.
                -->
                <div class="wheel-top">
                  <span class="wl" title="${which === 'lift' ? 'Lift — the darkest parts of the picture'
                    : which === 'gamma' ? 'Gamma — the midtones, where skin lives'
                    : 'Gain — the brightest parts of the picture'}"
                    data-tip="${which === 'lift' ? 'Lift moves the shadows. Drag toward a colour to tint the dark parts.'
                    : which === 'gamma' ? 'Gamma moves the midtones — where faces and skin sit. The one to reach for first.'
                    : 'Gain moves the highlights. Drag toward a colour to tint the bright parts.'}"
                    >${which === 'lift' ? 'Lift' : which === 'gamma' ? 'Gamma' : 'Gain'}</span>
                  <button class="wheel-reset" data-wreset="${which}"
                    aria-label="Reset ${which}" title="Reset this wheel">↺</button>
                </div>
                <canvas data-wheel="${which}" width="128" height="128"
                  title="Drag to push ${which} toward a colour. Double-click to reset."></canvas>
                <div class="wheel-nums">
                  <span class="wn"><i>R</i><b data-wn="${which}-r">0.00</b></span>
                  <span class="wn"><i>G</i><b data-wn="${which}-g">0.00</b></span>
                  <span class="wn"><i>B</i><b data-wn="${which}-b">0.00</b></span>
                </div>
              </div>`).join('')}
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

  // Each wheel's own reset. Resetting all three when you only wanted one back
  // is the kind of thing that makes people stop using the reset at all.
  for (const btn of $$('[data-wreset]', host)) {
    btn.addEventListener('click', () => {
      const which = btn.dataset.wreset;
      actions.patchGrade((c) => {
        c.color.wheels = { ...(c.color.wheels || neutralWheels()) };
        c.color.wheels[which] = { r: 0, g: 0, b: 0 };
      }, `Reset ${which}`);
    });
  }

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

  if (clip) wireWheels(host, grade);
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

  const paint = () => drawScope(scope, engine.renderer?.canvas, scopeKind);

  paint();
  scopeTimer = setInterval(paint, 250);

  $('#scope-kind', host)?.addEventListener('change', (e) => {
    scopeKind = e.target.value;
    const note = $('#scope-note', host);
    if (note) note.textContent = SCOPE_NOTES[scopeKind] || '';
    paint();
  });
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

function wireWheels(host, grade) {
  for (const canvas of $$('[data-wheel]', host)) {
    const which = canvas.dataset.wheel;
    const current = () => grade.color.wheels?.[which] || { r: 0, g: 0, b: 0 };
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
      actions.patchGrade((cl) => {
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
      actions.patchGrade((cl) => {
        cl.color.wheels = { ...(cl.color.wheels || neutralWheels()), [which]: { r: 0, g: 0, b: 0 } };
      }, `Reset ${which}`);
      paintWheel(canvas, { r: 0, g: 0, b: 0 });
      updateReadout(host, which, { r: 0, g: 0, b: 0 });
    });
  }
}

/*
 * The three numbers under a wheel.
 *
 * Per channel rather than one summary string, because that is what a wheel
 * actually produces and what you compare between shots. "Match this to that
 * one" is a job done by reading R, G and B off one and typing them into the
 * other; a line saying "warm" cannot be matched to anything.
 *
 * Always two decimals, always signed, tabular figures — so the numbers do not
 * jump sideways as they change, which makes a readout you are watching during
 * a drag unreadable.
 */
function updateReadout(host, which, offset) {
  for (const [ch, value] of [['r', offset.r], ['g', offset.g], ['b', offset.b]]) {
    const el = host.querySelector(`[data-wn="${which}-${ch}"]`);
    if (!el) continue;
    el.textContent = `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}`;
    el.classList.toggle('off', Math.abs(value) < 0.005);
  }
}
