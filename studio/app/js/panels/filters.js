/*
 * Filters: the look library as its own tab.
 *
 * The same 118 looks the Colour panel carries, reachable without the
 * grading tools around them. Colour is where a grader works — wheels,
 * curves, LUTs, the corrector stack — and it is hidden from Beginner for
 * that reason. A filter is the one-tap version of the same idea, and it
 * belongs one tap from the rail at every level. Both panels write the same
 * field on the clip, so a look picked here can be refined there.
 *
 * Where it lands: the selected clips when there are any, every video clip
 * when there are none. The line under the title always says which.
 */

import { $, $$, esc, toast, slider } from '../ui.js';
import { S, actions } from '../main.js';
import { LOOKS, LOOK_GROUPS_ALL, LOOK_BY_ID } from '../engine/filters.js';
import { attachPreviews } from '../engine/preview.js';
import * as licence from '../licence.js';
import * as levels from '../levels.js';

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
  const current = clips.length && clips.every((c) => c.color?.look === clips[0].color?.look) ? clips[0].color?.look : null;
  const strength = clips.length ? (clips[0].color?.strength ?? 1) : 1;
  const chip = (l) => {
    const locked = !licence.can(l.tier === 'free' ? 'basic-filters' : 'all-filters');
    return `<button class="chip ${current === l.id ? 'on' : ''} ${locked ? 'locked' : ''}"
      data-look="${esc(l.id)}" data-tier="${esc(l.tier)}"
      data-search="${esc(`${l.name} ${l.group || ''} ${l.id}`.toLowerCase())}" title="${esc(l.name)}">
      <span class="sw" style="background:${esc(l.swatch)}"></span>${esc(l.name)}</button>`;
  };
  const groups = Object.entries(LOOK_GROUPS_ALL);
  const owning = groups.find(([, list]) => list.some((l) => l.id === current))?.[0];
  const none = LOOKS.find((l) => l.id === 'none');

  host.innerHTML = `
    <div class="panel-h"><h2>Filters</h2></div>
    <p class="panel-sub">${LOOKS.length - 1} looks in ${groups.length} groups. Lands on ${esc(why)}.</p>

    <input class="input" id="fl-search" placeholder="Search filters — film, teal, vintage, mono…" style="margin-bottom:10px">
    ${none ? `<div class="chips" style="margin-bottom:10px">${chip(none)}</div>` : ''}
    <div id="fl-lib">
      ${groups.map(([name, list]) => `
        <details class="group" ${name === (owning || 'Essentials') ? 'open' : ''}>
          <summary>${esc(name)} <span class="tiny muted">${list.length}</span></summary>
          <div class="gbody"><div class="chips">${list.map(chip).join('')}</div></div>
        </details>`).join('')}
    </div>

    ${current && current !== 'none' ? `
      <div style="margin-top:14px;border-top:1px solid var(--line-soft);padding-top:12px">
        <p class="tiny" style="margin:0 0 6px"><b>${esc(LOOK_BY_ID[current]?.name || current)}</b> on ${esc(why)}</p>
        ${slider({ key: 'strength', label: 'Strength', value: strength, min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` })}
      </div>` : ''}

    <p class="tiny muted" style="margin-top:14px">
      Wheels, curves, LUT files and the corrector stack are in <b>Colour</b>${levels.current() === 'beginner' ? ' (Intermediate and up)' : ''}.
      A filter is the same thing at one tap; a grade is the same thing with the dials.
    </p>`;

  attachPreviews($('#fl-lib', host), 'look');

  $('#fl-search', host).addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    for (const grp of $$('#fl-lib details', host)) {
      let shown = 0;
      for (const c of $$('[data-look]', grp)) { const hit = !q || c.dataset.search.includes(q); c.hidden = !hit; if (hit) shown++; }
      grp.hidden = shown === 0;
      if (q) grp.open = true;
    }
  });

  host.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-look]');
    if (!btn) return;
    const feature = btn.dataset.tier === 'free' ? 'basic-filters' : 'all-filters';
    licence.gate(feature, () => {
      const { clips: list, why: where } = targets();
      if (!list.length) { toast('Put a clip on the timeline first'); return; }
      const apply = (c) => { c.color ||= {}; c.color.look = btn.dataset.look; c.color.strength = 1; };
      if (S.sel.size) actions.patchSelected(apply, 'Apply filter');
      else { list.forEach(apply); actions.commit('Apply filter'); }
      toast(`${LOOK_BY_ID[btn.dataset.look]?.name || 'Filter'} on ${where}`, 'ok');
    }, { what: LOOK_BY_ID[btn.dataset.look]?.name || 'That filter' });
  });

  host.addEventListener('input', (e) => {
    const s = e.target.closest('[data-k="strength"]');
    if (!s) return;
    const v = Number(s.value);
    const set = (c) => { if (c.color) c.color.strength = v; };
    if (S.sel.size) actions.patchSelected(set, 'Filter strength', 'filter-strength');
    else { targets().clips.forEach(set); actions.commit('Filter strength', 'filter-strength'); }
  });
}
