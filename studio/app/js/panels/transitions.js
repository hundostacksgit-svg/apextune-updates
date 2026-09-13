/*
 * Transitions: the library as its own tab.
 *
 * One hundred and sixteen transitions in seven groups, each chip a moving
 * preview, with one duration for the lot and two places to put them: the
 * selected clips, or every cut on the timeline. The Effects panel keeps
 * its own transition picker for the person already there; this is the
 * tab for the person who thinks "transitions" and looks for the word.
 *
 * A transition belongs to the clip it leads *into*, so "every cut" means
 * every clip that has one before it on its track. The first clip on a
 * track has nothing to transition from and is left alone.
 */

import { $, $$, esc, toast, slider } from '../ui.js';
import { S, actions } from '../main.js';
import { TRANSITIONS } from '../engine/transitions.js';
import { pickerMarkup, wirePicker } from './transition-picker.js';
import { attachPreviews } from '../engine/preview.js';
import { clipsOn } from '../engine/project.js';
import * as licence from '../licence.js';

function everyCut() {
  const out = [];
  for (const t of S.project.tracks.filter((x) => x.kind === 'video')) {
    const list = clipsOn(S.project, t.id).filter((c) => c.kind !== 'title' && c.kind !== 'sticker');
    list.slice(1).forEach((c) => out.push(c));
  }
  return out;
}

function targets() {
  const sel = [...S.sel].map((id) => S.project.clips.find((c) => c.id === id)).filter(Boolean);
  return sel.length ? { clips: sel, why: `the ${sel.length === 1 ? 'selected clip' : `${sel.length} selected clips`}` }
    : { clips: everyCut(), why: 'every cut (select clips to target just those)' };
}

let duration = 0.4;

export function mount(host) {
  const { clips, why } = targets();
  const one = clips.length === 1 ? clips[0] : null;
  const current = one?.transitionIn?.type || null;
  if (one?.transitionIn?.dur) duration = one.transitionIn.dur;
  const count = clips.filter((c) => c.transitionIn?.type).length;

  host.innerHTML = `
    <div class="panel-h"><h2>Transitions</h2></div>
    <p class="panel-sub">${Object.keys(TRANSITIONS).length} of them. Lands on ${esc(why)}.</p>

    ${slider({ key: 'dur', label: 'Length', value: duration, min: 0.12, max: 1.6, step: 0.02, fmt: (v) => `${v.toFixed(2)}s` })}
    <p class="tiny muted" style="margin:-4px 0 12px">Never more than a third of the shorter shot, whatever this says — a transition that eats the shot is a mistake, not a setting.</p>

    <div id="tr-picker">${pickerMarkup(current, 'tr')}</div>

    <div class="btn-row" style="margin-top:12px">
      <button class="btn btn-sm" id="tr-clear" ${count ? '' : 'disabled'}>Remove from ${esc(why.split(' (')[0])}${count ? ` (${count})` : ''}</button>
    </div>
    <p class="tiny muted" style="margin-top:12px">
      The <b>Tracked</b> group cuts through a subject you have tracked — zoom through it, iris on it, spin about it.
      Track something first (Inspector → Track), and the pin appears there.
    </p>`;

  wirePicker(host, 'tr');
  attachPreviews($('#tr-list', host), 'transition');

  host.addEventListener('input', (e) => {
    const s = e.target.closest('[data-k="dur"]');
    if (s) duration = Number(s.value);
  });

  host.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-trans]');
    if (chip) {
      const feature = chip.dataset.tier === 'free' ? 'transitions' : 'all-filters';
      licence.gate(feature, () => {
        const { clips: list, why: where } = targets();
        if (!list.length) { toast('Nothing to put a transition on yet'); return; }
        const type = chip.dataset.trans;
        const set = (c) => { const room = Math.max(0.1, c.dur / 3); c.transitionIn = { ...(c.transitionIn || {}), type, dur: Math.min(duration, room) }; };
        if (S.sel.size) actions.patchSelected(set, 'Set transition');
        else { list.forEach(set); actions.commit('Set transitions'); }
        toast(`${TRANSITIONS[type]?.name || 'Transition'} on ${where.split(' (')[0]}`, 'ok');
      }, { what: 'That transition' });
      return;
    }
    if (e.target.closest('#tr-clear')) {
      const { clips: list } = targets();
      const clear = (c) => { c.transitionIn = null; };
      if (S.sel.size) actions.patchSelected(clear, 'Remove transition');
      else { list.forEach(clear); actions.commit('Remove transitions'); }
      toast('Transitions removed', 'ok');
    }
  });
}
