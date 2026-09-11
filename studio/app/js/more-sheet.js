/*
 * The phone overflow sheet.
 *
 * Six buttons and a project name do not fit across 390 pixels. Measured before
 * this existed, Export sat at x=590 on a 390-wide screen — off the side of the
 * phone, so exporting was impossible from the device most people would be
 * editing on.
 *
 * The answer is not smaller buttons. It is fewer of them: undo and export stay
 * at the top because they are what you reach for mid-edit, and everything else
 * lives here — one tap away, at the bottom of the screen where a thumb
 * actually goes, rather than in a corner it cannot reach.
 *
 * Everything in here is a real control that exists elsewhere in the app. This
 * is a second route to them on a small screen, never the only one, so nothing
 * is lost on a desktop and nothing has to be kept in two places.
 */

import { $, $$ } from './ui.js';

let api = {};

const ROWS = [
  { ico: '🎛', label: 'Settings', sub: 'Frame rate, resolution, canvas', run: () => api.openPanel?.('settings') },
  { ico: '👤', label: 'Account', sub: () => api.accountLine?.() || 'Sign in or see your licence', run: () => api.openPanel?.('settings') },
  { ico: '⌘', label: 'Find anything', sub: 'Search every command', run: () => api.palette?.() },
  { ico: '🕘', label: 'History', sub: 'Step back to any point', run: () => api.openHistory?.() },
  { ico: '◐', label: 'Dark / light', sub: 'Switch the theme', run: () => api.theme?.() },
  { ico: '🎓', label: () => `Skill level — ${api.levelName?.() || 'Beginner'}`, sub: 'Beginner, Intermediate, Professional', run: () => api.cycleLevel?.() },
  { ico: '?', label: 'Walkthrough', sub: 'How everything works', run: () => api.openPanel?.('help') },
];

const text = (v) => (typeof v === 'function' ? v() : v);

function sheet() {
  let el = $('#more-sheet');
  if (!el) {
    el = document.createElement('div');
    el.id = 'more-sheet';
    el.className = 'more-sheet';
    el.setAttribute('role', 'menu');
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      const row = e.target.closest('[data-more]');
      if (!row) return;
      close();
      try { ROWS[Number(row.dataset.more)]?.run?.(); } catch { /* the row said what it does */ }
    });
  }
  return el;
}

function paint() {
  // Rebuilt each time it opens, so the level and the account line are current
  // rather than whatever they were when the app started.
  sheet().innerHTML = `<div class="more-grip" aria-hidden="true"></div>${
    ROWS.map((r, i) => `
      <button class="more-row" data-more="${i}" role="menuitem">
        <span class="ico" aria-hidden="true">${r.ico}</span>
        <span><b>${text(r.label)}</b><em>${text(r.sub)}</em></span>
      </button>`).join('')}`;
}

export function close() {
  $('#more-sheet')?.classList.remove('on');
  $('.sheet-scrim')?.classList.remove('on');
  $('#btn-more')?.setAttribute('aria-expanded', 'false');
}

function open() {
  paint();
  sheet().classList.add('on');
  $('#btn-more')?.setAttribute('aria-expanded', 'true');
  // The same backdrop the panels use, so tapping away closes it the way
  // tapping away closes everything else.
  const scrim = $('.sheet-scrim');
  if (scrim) scrim.classList.add('on');
}

export function initMoreSheet(actions) {
  api = actions || {};
  $('#btn-more')?.addEventListener('click', () => {
    if ($('#more-sheet')?.classList.contains('on')) close();
    else open();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!$('#more-sheet')?.classList.contains('on')) return;
    if (e.target.closest('#more-sheet') || e.target.closest('#btn-more')) return;
    close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  void $$;
}
