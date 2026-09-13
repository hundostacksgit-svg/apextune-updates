/*
 * Overlays: the effects that sit *on* the picture, as their own tab.
 *
 * Light leaks, flares, frames and borders, weather, grain and texture,
 * VHS and film wear — a hundred and eighteen of the effects library that
 * read as something laid over the shot rather than something done to it.
 * They are the same effects, from the same engine, with the same
 * parameters in the Effects panel; this tab is the shorter road for the
 * person who wants "a light leak on this" and not a wall of three
 * hundred. Nothing is duplicated: the tab is a view of the library.
 */

import { $, $$, esc, toast } from '../ui.js';
import { S, actions } from '../main.js';
import { EFFECT_LIST, EFFECTS, makeEffect } from '../engine/effects.js';
import { attachPreviews } from '../engine/preview.js';
import * as licence from '../licence.js';

export const OVERLAY_GROUPS = ['Light', 'Frame', 'Weather', 'Texture', 'Retro'];

function videoClips() {
  const vids = new Set(S.project.tracks.filter((t) => t.kind === 'video').map((t) => t.id));
  return S.project.clips.filter((c) => vids.has(c.trackId) && c.kind !== 'title' && c.kind !== 'sticker');
}
function targets() {
  const sel = [...S.sel].map((id) => S.project.clips.find((c) => c.id === id)).filter(Boolean);
  return sel.length ? { clips: sel, why: `the ${sel.length === 1 ? 'selected clip' : `${sel.length} selected clips`}` }
    : { clips: videoClips(), why: 'every clip (select some to target just those)' };
}

export function mount(host) {
  const { clips, why } = targets();
  const one = clips.length === 1 ? clips[0] : null;
  const onClip = (one?.effects || []).filter((f) => OVERLAY_GROUPS.includes(EFFECTS[f.id]?.group));
  const list = EFFECT_LIST.filter((e) => OVERLAY_GROUPS.includes(e.group));

  host.innerHTML = `
    <div class="panel-h"><h2>Overlays</h2></div>
    <p class="panel-sub">${list.length} leaks, flares, frames, weather and textures. Lands on ${esc(why)}.</p>

    <input class="input" id="ov-search" placeholder="Search overlays — leak, flare, frame, rain, grain, vhs…" style="margin-bottom:10px">
    <div id="ov-lib">
      ${OVERLAY_GROUPS.map((group) => `
        <details class="group" ${group === 'Light' ? 'open' : ''}>
          <summary>${esc(group)} <span class="tiny muted">${list.filter((e) => e.group === group).length}</span></summary>
          <div class="gbody"><div class="chips">
            ${list.filter((e) => e.group === group).map((e) => {
              const locked = e.tier !== 'free' && !licence.can('all-filters');
              const on = onClip.some((f) => f.id === e.id);
              return `<button class="chip ${on ? 'on' : ''} ${locked ? 'locked' : ''}" data-fx="${esc(e.id)}" data-tier="${esc(e.tier)}"
                data-search="${esc(`${e.name} ${e.group} ${e.id}`.toLowerCase())}" title="${esc(e.name)}">${e.icon} ${esc(e.name)}</button>`;
            }).join('')}
          </div></div>
        </details>`).join('')}
    </div>

    ${one ? `
      <h4 style="font-size:12px;margin:18px 0 8px;color:var(--text-2)">On this clip</h4>
      ${onClip.length ? onClip.map((f) => `
        <div class="row" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line-soft)">
          <span style="flex:1">${EFFECTS[f.id]?.icon || ''} ${esc(EFFECTS[f.id]?.name || f.id)}</span>
          <button class="btn btn-sm btn-ghost" data-rmov="${esc(f.id)}" title="Remove">✕</button>
        </div>`).join('') : '<p class="tiny muted" style="margin:0">No overlays on it yet.</p>'}
      <p class="tiny muted" style="margin-top:10px">Amount, position and the rest of each one's dials are in <b>Effects</b>, on the same clip.</p>` : ''}`;

  attachPreviews($('#ov-lib', host), 'fx');

  $('#ov-search', host).addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    for (const grp of $$('#ov-lib details', host)) {
      let shown = 0;
      for (const c of $$('[data-fx]', grp)) { const hit = !q || c.dataset.search.includes(q); c.hidden = !hit; if (hit) shown++; }
      grp.hidden = shown === 0;
      if (q) grp.open = true;
    }
  });

  host.addEventListener('click', (e) => {
    const add = e.target.closest('[data-fx]');
    if (add) {
      const feature = add.dataset.tier === 'free' ? 'basic-filters' : 'all-filters';
      licence.gate(feature, () => {
        const { clips: list2, why: where } = targets();
        if (!list2.length) { toast('Put a clip on the timeline first'); return; }
        const put = (c) => {
          c.effects ||= [];
          const made = makeEffect(add.dataset.fx);
          const i = c.effects.findIndex((f) => f.id === made.id);
          if (i >= 0) c.effects[i] = made; else c.effects.push(made);
        };
        if (S.sel.size) actions.patchSelected(put, 'Add overlay');
        else { list2.forEach(put); actions.commit('Add overlay'); }
        toast(`${EFFECTS[add.dataset.fx]?.name || 'Overlay'} on ${where.split(' (')[0]}`, 'ok');
      }, { what: EFFECTS[add.dataset.fx]?.name });
      return;
    }
    const rm = e.target.closest('[data-rmov]');
    if (rm) {
      actions.patchSelected((c) => { c.effects = (c.effects || []).filter((f) => f.id !== rm.dataset.rmov); }, 'Remove overlay');
    }
  });
}
