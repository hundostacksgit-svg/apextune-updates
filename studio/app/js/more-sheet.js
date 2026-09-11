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

import { $, $$, toast } from './ui.js';
import { MENUS } from './menubar.js';

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

/*
 * Which menu the sheet is showing, or null for the top level.
 *
 * The menu bar is hidden under 760px — seven menus and a project name do not
 * fit across a phone — and for a while that meant a phone had no route at all
 * to New project, Select all, Layer properties, Safe zones or the graph
 * editor. "Everything is reachable from the rail and the panels" was true of
 * most of it and not of all of it, which is the worst kind of nearly.
 *
 * So on a phone this sheet *is* the menu bar: the same seven menus from the
 * same table, one level down, with a way back. Not a second copy to keep in
 * step — the same MENUS array the desktop bar renders.
 */
let inMenu = null;

function sheet() {
  let el = $('#more-sheet');
  if (!el) {
    el = document.createElement('div');
    el.id = 'more-sheet';
    el.className = 'more-sheet';
    el.setAttribute('role', 'menu');
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-back]')) { inMenu = null; paint(); return; }

      const open = e.target.closest('[data-openmenu]');
      if (open) { inMenu = open.dataset.openmenu; paint(); return; }

      const item = e.target.closest('[data-mitem]');
      if (item) {
        if (item.disabled) return;
        const menu = MENUS.find((m) => m.id === inMenu);
        const def = menu?.items[Number(item.dataset.mitem)];
        close();
        try { def?.run?.(); }
        catch (err) { toast(err.message || 'That did not work', 'bad', 4000); }
        return;
      }

      const row = e.target.closest('[data-more]');
      if (!row) return;
      close();
      try { ROWS[Number(row.dataset.more)]?.run?.(); } catch { /* the row said what it does */ }
    });
  }
  return el;
}

/* One line saying what is in a menu, so the list reads as choices rather than
   as seven words you have to open one by one to understand. */
const MENU_SUBS = {
  file: 'New, open, save, import, export',
  edit: 'Undo, redo, duplicate, select',
  clip: 'Split, grade, effects, layer properties',
  timeline: 'Play, markers, zoom, tools',
  view: 'Safe zones, all platforms, scopes, theme',
  settings: 'Canvas, frame rate, quality, account',
  help: 'Walkthrough, shortcuts, get in touch',
};

function paint() {
  const box = sheet();
  const grip = '<div class="more-grip" aria-hidden="true"></div>';

  if (inMenu) {
    const menu = MENUS.find((m) => m.id === inMenu);
    if (!menu) { inMenu = null; paint(); return; }
    box.innerHTML = `${grip}
      <button class="more-back" data-back="1">‹ <b>${menu.label}</b></button>
      ${menu.items.map((item, i) => {
        if (item.sep) return '<div class="more-sep" role="separator"></div>';
        const off = item.when ? !item.when() : false;
        return `<button class="more-row slim" data-mitem="${i}" role="menuitem" ${off ? 'disabled' : ''}>
          <span><b>${text(item.label)}</b>${item.key ? `<em>${item.key}</em>` : ''}</span>
        </button>`;
      }).join('')}`;
    return;
  }

  // Rebuilt each time it opens, so the level and the account line are current
  // rather than whatever they were when the app started.
  box.innerHTML = `${grip}${
    ROWS.map((r, i) => `
      <button class="more-row" data-more="${i}" role="menuitem">
        <span class="ico" aria-hidden="true">${r.ico}</span>
        <span><b>${text(r.label)}</b><em>${text(r.sub)}</em></span>
      </button>`).join('')}
    <div class="more-sep" role="separator"></div>
    <div class="more-h">Menus</div>
    ${MENUS.map((m) => `
      <button class="more-row" data-openmenu="${m.id}" role="menuitem">
        <span class="ico" aria-hidden="true">▸</span>
        <span><b>${m.label}</b><em>${MENU_SUBS[m.id] || ''}</em></span>
      </button>`).join('')}`;
}

export function close() {
  $('#more-sheet')?.classList.remove('on');
  $('.sheet-scrim')?.classList.remove('on', 'for-more');
  $('#btn-more')?.setAttribute('aria-expanded', 'false');
}

function open() {
  inMenu = null;                 // always opens at the top level
  paint();
  sheet().classList.add('on');
  $('#btn-more')?.setAttribute('aria-expanded', 'true');
  // The same backdrop the panels use, so tapping away closes it the way
  // tapping away closes everything else.
  const scrim = $('.sheet-scrim');
  if (scrim) { scrim.classList.add('on'); scrim.classList.add('for-more'); }
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
  // Escape steps back out of a menu before it closes the sheet, the way Back
  // does everywhere else — one press should not throw away two levels.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (inMenu && $('#more-sheet')?.classList.contains('on')) { inMenu = null; paint(); return; }
    close();
  });
  void $$;
}
