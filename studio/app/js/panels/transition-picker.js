/*
 * The transition picker, shared by the Effects panel and the Inspector.
 *
 * There are over a hundred transitions now. A flat row of chips was fine at
 * thirteen and is unusable at a hundred — nobody scrolls a wall of buttons
 * looking for "iris in from the corner". So: a search box first, then
 * collapsible groups, with the group holding the current transition open so
 * what is already selected is never hidden behind a closed heading.
 *
 * Both panels render the same markup and both delegate clicks on
 * `[data-trans]` the way they already did, so wiring is unchanged — this only
 * replaces the chips between them.
 */

import { $, $$, esc } from '../ui.js';
import { TRANSITION_GROUPS_ALL } from '../engine/transitions.js';
import * as licence from '../licence.js';

/**
 * @param current  the id of the transition already set, or undefined
 * @param idPrefix unique per host, so two pickers on screen never collide
 */
export function pickerMarkup(current, idPrefix = 'tp') {
  const chip = (t) => {
    const locked = !licence.can(t.tier === 'free' ? 'transitions' : 'all-filters');
    return `<button class="chip ${current === t.id ? 'on' : ''} ${locked ? 'locked' : ''}"
      data-trans="${esc(t.id)}" data-tier="${esc(t.tier)}"
      data-search="${esc(`${t.name} ${t.group || ''} ${t.id}`.toLowerCase())}"
      title="${esc(t.name)}">${esc(t.icon || '✦')} ${esc(t.name)}</button>`;
  };

  const groups = Object.entries(TRANSITION_GROUPS_ALL);
  const owning = groups.find(([, list]) => list.some((t) => t.id === current))?.[0];
  const open = owning || 'Essentials';

  return `
    <input class="input" id="${esc(idPrefix)}-search" placeholder="Search transitions — wipe, zoom, glitch…"
           style="margin-bottom:10px">
    <div id="${esc(idPrefix)}-list">
      ${groups.map(([name, list]) => `
        <details class="group" ${name === open ? 'open' : ''}>
          <summary>${esc(name)} <span class="tiny muted">${list.length}</span></summary>
          <div class="gbody"><div class="chips">${list.map(chip).join('')}</div></div>
        </details>`).join('')}
    </div>`;
}

/**
 * Filter as you type.
 *
 * Narrowing opens every group that still has a match, because a search that
 * leaves you looking at collapsed headings reads as a search that found
 * nothing. Clearing the box puts the groups back the way they were.
 */
export function wirePicker(host, idPrefix = 'tp') {
  const box = $(`#${idPrefix}-search`, host);
  if (!box || box.dataset.wired) return;
  box.dataset.wired = '1';

  box.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    for (const grp of $$(`#${idPrefix}-list details`, host)) {
      let shown = 0;
      for (const chip of $$('[data-trans]', grp)) {
        const hit = !q || chip.dataset.search.includes(q);
        chip.hidden = !hit;
        if (hit) shown++;
      }
      grp.hidden = shown === 0;
      if (q) grp.open = true;
    }
  });
}
