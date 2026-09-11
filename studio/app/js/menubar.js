/*
 * The menu bar.
 *
 * Every editing application has one and people arrive already knowing what is
 * in it: File holds new/open/save/export, Edit holds undo and the clipboard,
 * View holds what is on screen. That shared vocabulary is worth more than any
 * novel arrangement — somebody coming from Premiere or Resolve should not have
 * to learn where "New project" lives.
 *
 * Items are declared, not written out as markup. The declaration carries the
 * label, the shortcut, what it runs and when it is available, so the same list
 * builds the menu, the command palette and the keyboard help without three
 * places drifting apart. An item that is unavailable right now is shown greyed
 * rather than hidden, because a menu whose contents move around is a menu you
 * cannot learn.
 */

import { $, $$, toast } from './ui.js';

/* Where the menu gets its actions from. Injected at boot rather than imported,
   so this file has no opinion about the rest of the app and can be tested on
   its own. */
let api = {};

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
const MOD = isMac ? '⌘' : 'Ctrl';

/**
 * The menus.
 *
 * `when` returns false to grey an item out. `sep` draws a divider — the
 * grouping inside a menu is how people find things quickly, and a flat list of
 * fourteen items is a list nobody reads.
 */
export const MENUS = [
  {
    id: 'file', label: 'File', items: [
      { label: 'New project', key: `${MOD}+N`, run: () => api.newProject?.() },
      { label: 'Open project…', key: `${MOD}+O`, run: () => api.openProject?.() },
      { sep: true },
      { label: 'Import media…', key: 'I', run: () => api.importMedia?.() },
      { label: 'Import a project file…', run: () => api.importProjectFile?.() },
      { sep: true },
      { label: 'Save a copy to disk', key: `${MOD}+S`, run: () => api.exportProjectFile?.() },
      { label: 'Export video…', key: `${MOD}+E`, run: () => api.exportVideo?.() },
      { sep: true },
      { label: 'Project settings…', run: () => api.openPanel?.('settings') },
    ],
  },
  {
    id: 'edit', label: 'Edit', items: [
      { label: () => `Undo${api.undoLabel?.() ? ` ${api.undoLabel()}` : ''}`,
        key: `${MOD}+Z`, when: () => api.canUndo?.(), run: () => api.undo?.() },
      { label: () => `Redo${api.redoLabel?.() ? ` ${api.redoLabel()}` : ''}`,
        key: `${MOD}+⇧+Z`, when: () => api.canRedo?.(), run: () => api.redo?.() },
      { label: 'History…', run: () => api.openHistory?.() },
      { sep: true },
      { label: 'Duplicate', key: `${MOD}+D`, when: () => api.hasSelection?.(), run: () => api.duplicate?.() },
      { label: 'Delete', key: 'Del', when: () => api.hasSelection?.(), run: () => api.remove?.() },
      { sep: true },
      { label: 'Select all clips', key: `${MOD}+A`, run: () => api.selectAll?.() },
      { label: 'Deselect', key: 'Esc', when: () => api.hasSelection?.(), run: () => api.deselect?.() },
    ],
  },
  {
    id: 'clip', label: 'Clip', items: [
      { label: 'Split at playhead', key: 'S', run: () => api.split?.() },
      { label: 'Set a transition…', when: () => api.hasSelection?.(), run: () => api.openPanel?.('effects') },
      { sep: true },
      { label: 'Colour and grade', when: () => api.hasSelection?.(), run: () => api.openPanel?.('color') },
      { label: 'Effects', when: () => api.hasSelection?.(), run: () => api.openPanel?.('effects') },
      { label: 'Audio', run: () => api.openPanel?.('audio') },
      { sep: true },
      {
        label: () => (api.layerPropsOpen?.() ? 'Hide layer properties' : 'Show layer properties'),
        when: () => api.hasSelection?.(),
        run: () => (api.layerPropsOpen?.() ? api.hideLayerProps?.() : api.layerProps?.()),
      },
      {
        label: () => `${api.graphOpen?.() ? '✓ ' : ''}Graph editor`,
        when: () => api.hasSelection?.(),
        run: () => api.toggleGraph?.(),
      },
      { sep: true },
      { label: 'Track something in this clip', when: () => api.hasSelection?.(), run: () => api.track?.() },
    ],
  },
  {
    id: 'timeline', label: 'Timeline', items: [
      { label: 'Play / pause', key: 'Space', run: () => api.togglePlay?.() },
      { label: 'Go to start', key: 'Home', run: () => api.goStart?.() },
      { label: 'Go to end', key: 'End', run: () => api.goEnd?.() },
      { sep: true },
      { label: 'Add a marker', key: 'M', run: () => api.marker?.() },
      { label: 'Zoom in', key: '+', run: () => api.zoomIn?.() },
      { label: 'Zoom out', key: '−', run: () => api.zoomOut?.() },
      { label: 'Fit to window', run: () => api.zoomFit?.() },
      { sep: true },
      { label: 'Select tool', key: 'V', run: () => api.tool?.('select') },
      { label: 'Razor tool', key: 'C', run: () => api.tool?.('razor') },
    ],
  },
  {
    id: 'view', label: 'View', items: [
      { label: () => `${api.isOn?.('safe') ? '✓ ' : ''}Safe zones`, run: () => api.toggle?.('safe') },
      { label: () => `${api.isOn?.('ratios') ? '✓ ' : ''}All platforms`, run: () => api.toggle?.('ratios') },
      { label: () => `${api.isOn?.('scopes') ? '✓ ' : ''}Scopes`, run: () => api.toggle?.('scopes') },
      { sep: true },
      { label: 'Media', key: '1', run: () => api.openPanel?.('media') },
      { label: 'Effects', key: '4', run: () => api.openPanel?.('effects') },
      { label: 'Colour', key: '5', run: () => api.openPanel?.('color') },
      { label: 'Text', key: '6', run: () => api.openPanel?.('text') },
      { label: 'Audio', key: '7', run: () => api.openPanel?.('audio') },
      { sep: true },
      { label: 'Dark / light', run: () => api.theme?.() },
      { label: 'Full screen', run: () => api.fullscreen?.() },
    ],
  },
  {
    id: 'settings', label: 'Settings', items: [
      { label: 'Project settings…', run: () => api.openPanel?.('settings') },
      { label: 'Frame rate and resolution…', run: () => api.openPanel?.('settings') },
      { sep: true },
      { label: () => `${api.level?.() === 'beginner' ? '✓ ' : ''}Beginner`, run: () => api.setLevel?.('beginner') },
      { label: () => `${api.level?.() === 'intermediate' ? '✓ ' : ''}Intermediate`, run: () => api.setLevel?.('intermediate') },
      { label: () => `${api.level?.() === 'expert' ? '✓ ' : ''}Professional`, run: () => api.setLevel?.('expert') },
      { sep: true },
      { label: () => `${api.isOn?.('tips') ? '✓ ' : ''}Show tips on hover`, run: () => api.toggle?.('tips') },
      { sep: true },
      { label: 'Account and licence…', run: () => api.account?.() },
    ],
  },
  {
    id: 'help', label: 'Help', items: [
      { label: 'Walkthrough and shortcuts', run: () => api.openPanel?.('help') },
      { label: 'Find anything…', key: `${MOD}+K`, run: () => api.palette?.() },
      { sep: true },
      { label: 'What is built, honestly', run: () => api.openUrl?.('../pricing/#compare') },
      { label: 'Get in touch', run: () => api.support?.() },
    ],
  },
];

const text = (v) => (typeof v === 'function' ? v() : v);

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

function renderItems(menu) {
  return menu.items.map((item, i) => {
    if (item.sep) return '<div class="mn-sep" role="separator"></div>';
    const label = text(item.label);
    const off = item.when ? !item.when() : false;
    return `<button class="mn-item" role="menuitem" data-menu="${menu.id}" data-i="${i}"
      ${off ? 'disabled' : ''}>
      <span class="mn-lbl">${label}</span>
      ${item.key ? `<span class="mn-key">${item.key}</span>` : ''}
    </button>`;
  }).join('');
}

/**
 * Rebuild one menu's contents at the moment it opens.
 *
 * Labels and availability both depend on live state — "Undo Add clip" has to
 * name the thing that will actually be undone, and Delete has to be grey when
 * nothing is selected. Building at open time is the only way those are right;
 * building once at boot gives a menu that lies within seconds.
 */
function openMenu(root, id) {
  closeMenus(root);
  const menu = MENUS.find((m) => m.id === id);
  const wrap = $(`.mn[data-mn="${id}"]`, root);
  if (!menu || !wrap) return;
  const pop = $('.mn-pop', wrap);
  pop.innerHTML = renderItems(menu);
  wrap.classList.add('open');
  $('.mn-btn', wrap)?.setAttribute('aria-expanded', 'true');
}

export function closeMenus(root = document) {
  for (const wrap of $$('.mn.open', root)) {
    wrap.classList.remove('open');
    $('.mn-btn', wrap)?.setAttribute('aria-expanded', 'false');
  }
}

export function menubarMarkup() {
  return MENUS.map((m) => `
    <div class="mn" data-mn="${m.id}">
      <button class="mn-btn" type="button" aria-haspopup="true" aria-expanded="false">${m.label}</button>
      <div class="mn-pop" role="menu"></div>
    </div>`).join('');
}

/**
 * @param actions  everything the menu can do, supplied by main.js
 */
export function initMenubar(root, actions) {
  api = actions || {};
  const bar = $('#menubar', root);
  if (!bar) return;
  bar.innerHTML = menubarMarkup();

  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('.mn-btn');
    if (btn) {
      const wrap = btn.closest('.mn');
      if (wrap.classList.contains('open')) closeMenus(root);
      else openMenu(root, wrap.dataset.mn);
      return;
    }
    const item = e.target.closest('.mn-item');
    if (!item || item.disabled) return;
    const menu = MENUS.find((m) => m.id === item.dataset.menu);
    const def = menu?.items[Number(item.dataset.i)];
    closeMenus(root);
    try { def?.run?.(); }
    catch (err) { toast(err.message || 'That did not work', 'bad', 4000); }
  });

  /*
   * Hovering across the bar with one open switches between them, the way every
   * desktop menu behaves. Without it you have to close one and click the next,
   * which feels broken to anyone who has used a menu bar before.
   */
  bar.addEventListener('pointerover', (e) => {
    const btn = e.target.closest('.mn-btn');
    if (!btn || !$('.mn.open', root)) return;
    const wrap = btn.closest('.mn');
    if (!wrap.classList.contains('open')) openMenu(root, wrap.dataset.mn);
  });

  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('#menubar')) closeMenus(root);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenus(root);
  });
}
