/*
 * The expression editor.
 *
 * One small window for one property: the formula, what it may use, the
 * presets that cover most of what anyone types, and whether it parses —
 * checked as you type, so a missing bracket is a red line under the box
 * rather than a layer that silently stops moving. Reached from the ƒ
 * button on a keyframe lane and from the Expressions list in the inspector,
 * and it is the same window either way.
 */

import { $, $$, esc, modal, closeModal, toast } from './ui.js';
import { actions } from './main.js';
import { check, presetsFor } from './engine/expressions.js';
import { setExpression } from './engine/project.js';
import * as licence from './licence.js';

const HELP = [
  ['value', 'the keyframed value'], ['time', 'seconds on the timeline'], ['local', 'seconds into the layer'],
  ['duration', 'the layer’s length'], ['beat', '0 on a beat, 1 just before the next'], ['bpm', 'the music’s tempo'],
  ['wiggle(freq, amp)', 'smooth random drift'], ['loopOut("cycle")', 'repeat the keys forever'],
  ['inertia(amp, freq, decay)', 'overshoot after the last key'], ['audio("low")', 'the music’s level, 0–1'],
  ['audioSmooth("all", 0.1)', 'the level, smoothed'], ['beatPulse(8)', '1 on the beat, decaying'],
  ['ease(t, t0, t1, a, b)', 'a to b as t goes t0→t1'], ['layer("Logo").x', 'another layer’s property'],
  ['posterizeTime(8)', 'time held to 8 steps a second'], ['random(a, b)', 'a new number every frame'],
  ['sin, cos, abs, floor, min, max, clamp, mod', 'the usual maths'], ['a ? b : c', 'if a then b else c'],
];

/**
 * Open the editor for `prop` on the selected clip. `label` is the
 * property's human name for the heading; `current` its expression now.
 */
export function openExpressionEditor(clip, prop, { label = prop } = {}) {
  if (!licence.can('expressions')) { licence.upgradePrompt('expressions', 'Expressions'); return; }
  const current = clip.expressions?.[prop] || '';
  const presets = presetsFor(prop);
  const body = modal(`
    <h3>ƒ ${esc(label)}</h3>
    <p class="tiny muted" style="margin:0 0 10px">A formula for this property at every moment. It sees the keyframed value as
      <span class="mono">value</span>, so <span class="mono">value + wiggle(2, 0.03)</span> keeps your keys and adds a drift.</p>
    <textarea class="input mono" id="xp-src" rows="3" spellcheck="false" placeholder="wiggle(2, 0.03)">${esc(current)}</textarea>
    <p class="tiny" id="xp-err" style="min-height:16px;margin:4px 0 8px;color:var(--bad)"></p>
    <div class="chips" id="xp-presets">
      ${presets.map((p) => `<button class="chip" type="button" data-xp="${esc(p.id)}" title="${esc(p.note)}">${esc(p.name)}</button>`).join('')}
    </div>
    <details class="group" style="margin-top:10px">
      <summary>What an expression can use</summary>
      <div class="gbody">
        <table class="tiny" style="border-collapse:collapse;width:100%">
          ${HELP.map(([k, v]) => `<tr><td class="mono" style="padding:2px 8px 2px 0;white-space:nowrap">${esc(k)}</td><td class="muted" style="padding:2px 0">${esc(v)}</td></tr>`).join('')}
        </table>
      </div>
    </details>
    <div class="btn-row" style="justify-content:space-between;margin-top:12px">
      <button class="btn btn-sm btn-ghost" type="button" data-x="clear" ${current ? '' : 'disabled'}>Remove expression</button>
      <span>
        <button class="btn btn-sm" type="button" data-x="cancel">Cancel</button>
        <button class="btn btn-sm btn-primary" type="button" data-x="ok">Apply</button>
      </span>
    </div>`);

  const src = $('#xp-src', body);
  const err = $('#xp-err', body);
  const ok = $('[data-x="ok"]', body);
  const validate = () => {
    const text = src.value.trim();
    const problem = text ? check(text) : null;
    err.textContent = problem || '';
    ok.disabled = Boolean(problem);
    return !problem;
  };
  validate();
  src.addEventListener('input', validate);
  src.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); if (validate()) apply(); }
  });
  setTimeout(() => { src.focus(); src.setSelectionRange(src.value.length, src.value.length); }, 30);

  for (const chip of $$('[data-xp]', body)) {
    chip.addEventListener('click', () => {
      const p = presets.find((x) => x.id === chip.dataset.xp);
      if (!p) return;
      src.value = p.src;
      validate();
      src.focus();
    });
  }

  const apply = () => {
    const text = src.value.trim();
    actions.patchSelected((c) => { if (c.id === clip.id) setExpression(c, prop, text); }, text ? `Expression on ${label}` : `Remove expression on ${label}`, undefined);
    closeModal();
    toast(text ? `${label} follows the expression` : `${label} is back to its keys`, 'ok');
  };
  $('[data-x="ok"]', body).addEventListener('click', () => { if (validate()) apply(); });
  $('[data-x="cancel"]', body).addEventListener('click', closeModal);
  $('[data-x="clear"]', body).addEventListener('click', () => { src.value = ''; apply(); });
}

/** Markup for the inspector: every expression on a clip, and a way to add one. */
export function expressionsMarkup(clip, props) {
  const have = Object.entries(clip.expressions || {});
  const options = props.filter((p) => !clip.expressions?.[p.prop]);
  return `
    <p class="tiny muted" style="margin:0 0 9px">A formula instead of keys — a wiggle, a loop, a pulse on the beat, a scale that follows the music.</p>
    ${have.length ? have.map(([prop, src]) => `
      <div class="field xp-row">
        <label>${esc(props.find((p) => p.prop === prop)?.label || prop.split('.').pop())}
          <span class="val mono" title="${esc(src)}">${esc(src.length > 26 ? `${src.slice(0, 25)}…` : src)}</span></label>
        <div class="btn-row" style="margin-top:2px">
          <button class="btn btn-sm btn-ghost" data-xp-edit="${esc(prop)}">Edit</button>
          <button class="btn btn-sm btn-ghost" data-xp-clear="${esc(prop)}">Remove</button>
        </div>
      </div>`).join('') : ''}
    ${options.length ? `
      <div class="field">
        <label for="xp-add">Add to</label>
        <select class="input" id="xp-add">
          <option value="">Choose a property…</option>
          ${options.map((p) => `<option value="${esc(p.prop)}">${esc(p.label)}</option>`).join('')}
        </select>
      </div>` : ''}`;
}
