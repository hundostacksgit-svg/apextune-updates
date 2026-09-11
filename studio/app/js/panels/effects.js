/*
 * Effects: the library, and the stack on whatever is selected.
 *
 * Two halves. The top adds an effect to the selection (or to everything if
 * nothing is selected); the bottom is the live stack on the selected clip with
 * every parameter exposed. Nothing is modal and nothing is behind a dialog.
 */

import { $, $$, esc, toast, empty, slider, selectRow } from '../ui.js';
import { S, actions } from '../main.js';
import { EFFECT_LIST, EFFECTS, EFFECT_GROUPS, makeEffect } from '../engine/effects.js';
import { pickerMarkup, wirePicker } from './transition-picker.js';
import { attachPreviews } from '../engine/preview.js';
import { clipsOn, clipById, mediaById, sourceTime } from '../engine/project.js';
import { elementFor } from '../engine/media.js';
import { buildPlate, registerPlate, hasPlate } from '../engine/matte.js';
import * as licence from '../licence.js';

export function mount(host) {
  const sel = [...S.sel].map((id) => clipById(S.project, id)).filter(Boolean);
  const one = sel.length === 1 ? sel[0] : null;
  const target = sel.length ? `${sel.length} selected clip${sel.length === 1 ? '' : 's'}` : 'every clip';

  host.innerHTML = `
    <div class="panel-h"><h2>Effects</h2></div>
    <p class="panel-sub">Adding applies to ${esc(target)}.</p>

    <!-- Three hundred effects is only a library if you can find one in it.
         Search first, groups second: a flat wall of chips is a list nobody
         reads past the first screen. -->
    <input class="input" id="fx-search" placeholder="Search effects — glitch, grain, leak, mirror…"
           style="margin-bottom:10px">
    <div id="fx-lib">
      ${EFFECT_GROUPS.map((group) => `
        <details class="group" ${group === 'Motion' ? 'open' : ''}>
          <summary>${esc(group)} <span class="tiny muted">${EFFECT_LIST.filter((e) => e.group === group).length}</span></summary>
          <div class="gbody">
            <div class="chips">
              ${EFFECT_LIST.filter((e) => e.group === group).map((e) => {
                const locked = e.tier !== 'free' && !licence.can('all-filters');
                return `<button class="chip ${locked ? 'locked' : ''}" data-fx="${esc(e.id)}"
                  data-tier="${esc(e.tier)}" data-search="${esc(`${e.name} ${e.group} ${e.id}`.toLowerCase())}"
                  title="${esc(e.name)}">${e.icon} ${esc(e.name)}</button>`;
              }).join('')}
            </div>
          </div>
        </details>`).join('')}
    </div>

    <details class="group" data-min="intermediate">
      <summary>Transitions</summary>
      <div class="gbody">
        <p class="tiny muted" style="margin:0 0 9px">Sets the transition <em>into</em> the selected clips.</p>
        <div id="fx-trans">${pickerMarkup(one?.transitionIn?.type, 'fx-tp')}</div>
      </div>
    </details>

    <h4 style="font-size:12px;margin:18px 0 8px;color:var(--text-2)">On this clip</h4>
    <div id="fx-stack">
      ${one ? stackMarkup(one) : empty('🎛', sel.length ? 'Select one clip' : 'Nothing selected',
        sel.length ? 'Pick a single clip to tune its effects.' : 'Click a clip on the timeline to see its stack.')}
    </div>`;

  wirePicker(host, 'fx-tp');

  // Every chip shows what it actually does. Nothing is shipped to make this
  // work — see engine/preview.js — and nothing renders until it is scrolled
  // into view, so a panel of three hundred costs what the visible dozen cost.
  attachPreviews($('#fx-lib', host), 'fx');
  attachPreviews($('#fx-trans', host), 'transition');

  // Filter as you type: narrow every group, open the ones that still have
  // something in them, and hide the ones that do not — so a search never
  // leaves you looking at a screen of collapsed headings.
  $('#fx-search', host)?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    for (const grp of $$('#fx-lib details', host)) {
      let shown = 0;
      for (const chip of $$('[data-fx]', grp)) {
        const hit = !q || chip.dataset.search.includes(q);
        chip.hidden = !hit;
        if (hit) shown++;
      }
      grp.hidden = shown === 0;
      if (q) grp.open = true;
    }
  });

  host.addEventListener('click', (e) => {
    const add = e.target.closest('[data-fx]');
    if (add) {
      const feature = add.dataset.tier === 'free' ? 'basic-filters' : 'all-filters';
      licence.gate(feature, () => addEffect(add.dataset.fx), { what: EFFECTS[add.dataset.fx]?.name });
      return;
    }
    const trans = e.target.closest('[data-trans]');
    if (trans) {
      const feature = trans.dataset.tier === 'free' ? 'transitions' : 'all-filters';
      licence.gate(feature, () => setTransition(trans.dataset.trans), { what: 'That transition' });
      return;
    }
    const rm = e.target.closest('[data-rmfx]');
    if (rm) {
      actions.patchSelected((c) => {
        c.effects = (c.effects || []).filter((f) => f.id !== rm.dataset.rmfx);
      }, 'Remove effect');
      return;
    }
    const up = e.target.closest('[data-upfx]');
    if (up) {
      actions.patchSelected((c) => {
        const i = (c.effects || []).findIndex((f) => f.id === up.dataset.upfx);
        if (i > 0) [c.effects[i - 1], c.effects[i]] = [c.effects[i], c.effects[i - 1]];
      }, 'Reorder effects');
    }
  });

  host.addEventListener('change', (e) => {
    const toggle = e.target.closest('[data-onfx]');
    if (toggle) {
      actions.patchSelected((c) => {
        const fx = (c.effects || []).find((f) => f.id === toggle.dataset.onfx);
        if (fx) fx.on = toggle.checked;
      }, 'Toggle effect');
      return;
    }
    const sel2 = e.target.closest('[data-fxp]');
    if (sel2 && sel2.tagName === 'SELECT') writeParam(sel2.dataset.fxp, sel2.value);
    if (sel2 && sel2.type === 'color') writeParam(sel2.dataset.fxp, sel2.value);
  });

  host.addEventListener('input', (e) => {
    const input = e.target.closest('[data-fxp]');
    if (!input || input.type !== 'range') return;
    writeParam(input.dataset.fxp, Number(input.value));
    const label = host.querySelector(`[data-val="${CSS.escape(input.dataset.fxp)}"]`);
    if (label) label.textContent = String(Math.round(Number(input.value) * 100) / 100);
  });

}

function stackMarkup(clip) {
  const stack = clip.effects || [];
  if (!stack.length) {
    return '<p class="tiny muted">No effects on this clip yet. Tap one above.</p>';
  }
  return stack.map((fx) => {
    const def = EFFECTS[fx.id];
    if (!def) return '';
    const body = Object.entries(def.params || {}).map(([key, spec]) => {
      const path = `${fx.id}.${key}`;
      const value = fx.params[key] ?? spec.def;
      if (spec.type === 'select') {
        return selectRow({ key: path, label: spec.label, value, options: spec.options })
          .replace('data-k=', 'data-fxp=');
      }
      if (spec.type === 'colour') {
        return `<div class="field"><label>${esc(spec.label)}</label>
          <input class="input" type="color" data-fxp="${esc(path)}" value="${esc(value)}"></div>`;
      }
      return slider({
        key: path, label: spec.label, value, min: spec.min, max: spec.max, step: spec.step || 1,
      }).replace('data-k=', 'data-fxp=');
    }).join('');

    return `<div class="fx-item ${fx.on === false ? 'off' : ''}">
      <div class="fx-head">
        <span class="fx-ico">${def.icon}</span>
        <b>${esc(def.name)}</b>
        <input type="checkbox" data-onfx="${esc(fx.id)}" ${fx.on === false ? '' : 'checked'}
          title="Turn this effect on or off">
        <button data-upfx="${esc(fx.id)}" title="Move earlier in the stack">↑</button>
        <button data-rmfx="${esc(fx.id)}" title="Remove">✕</button>
      </div>
      <div class="fx-body">${body}</div>
    </div>`;
  }).join('');
}

function writeParam(path, value) {
  const [id, key] = path.split('.');
  actions.patchSelected((c) => {
    const fx = (c.effects || []).find((f) => f.id === id);
    if (fx) fx.params[key] = value;
  }, `Change ${key}`, `fx:${path}`);
}

function addEffect(id) {
  const targets = S.sel.size
    ? [...S.sel]
    : S.project.clips.filter((c) => {
      const track = S.project.tracks.find((t) => t.id === c.trackId);
      return track?.kind === 'video';
    }).map((c) => c.id);

  if (!targets.length) { toast('Put a clip on the timeline first'); return; }

  for (const clipId of targets) {
    const clip = clipById(S.project, clipId);
    if (!clip) continue;
    clip.effects ||= [];
    // Replacing rather than stacking: two chromatic splits fighting each other
    // is never what someone meant.
    const existing = clip.effects.findIndex((f) => f.id === id);
    const made = makeEffect(id);
    if (existing >= 0) clip.effects[existing] = made;
    else clip.effects.push(made);
  }
  actions.commit(`Add ${EFFECTS[id].name}`);
  toast(`${EFFECTS[id].name} on ${targets.length} clip${targets.length === 1 ? '' : 's'}`, 'ok');

  // Removing a background needs a background to compare against, and the only
  // place to get one is the clip itself. Adding the effect starts that, rather
  // than leaving an effect on the clip that silently does nothing.
  if (id === 'removeBackground') ensurePlates(targets);
}

/**
 * Work out what the background of each clip looks like.
 *
 * Runs after the effect is on, so the person sees it appear and then sees it
 * start working, rather than waiting on a spinner before anything happens.
 * One clip at a time: each is several seeks and a median, and running four at
 * once on a phone is how a tab gets killed.
 */
async function ensurePlates(clipIds) {
  for (const clipId of clipIds) {
    const clip = clipById(S.project, clipId);
    if (!clip || clip.matte?.plateId && hasPlate(clip.matte.plateId)) continue;
    const media = mediaById(S.project, clip.mediaId);
    if (media?.kind !== 'video') {
      toast('Removing a background needs a video clip — a still has no moving subject to separate.', 'bad', 6000);
      continue;
    }
    try {
      const node = elementFor(media, clip.id);
      const from = sourceTime(clip, clip.start);
      const to = sourceTime(clip, clip.start + clip.dur - 0.02);
      toast('Working out what the background is…', '', 2500);
      // eslint-disable-next-line no-await-in-loop -- one at a time, deliberately
      const plate = registerPlate(await buildPlate(node, { from, to: Math.max(from + 0.3, to) }));
      clip.matte = { ...(clip.matte || {}), plateId: plate.id };
      actions.commit('Background plate');
      toast('Background found. Tune the sensitivity in the effect if the edge is rough.', 'ok', 5000);
    } catch (err) {
      toast(err.message, 'bad', 6000);
    }
  }
}

function setTransition(type) {
  let count = 0;
  for (const track of S.project.tracks.filter((t) => t.kind === 'video')) {
    const list = clipsOn(S.project, track.id);
    list.forEach((clip, i) => {
      if (i === 0) return;
      if (S.sel.size && !S.sel.has(clip.id)) return;
      const room = Math.min(clip.dur, list[i - 1].dur) / 3;
      clip.transitionIn = { type, dur: Math.min(0.4, room) };
      count++;
    });
  }
  if (!count) { toast('No cuts to put a transition on'); return; }
  actions.commit(`Transition: ${type}`);
  toast(`${count} transition${count === 1 ? '' : 's'} set`, 'ok');
}
