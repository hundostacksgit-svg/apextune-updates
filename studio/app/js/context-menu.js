/*
 * Right-click menus.
 *
 * One popup, one renderer, one set of keyboard and dismissal rules — and a
 * table of items per place you can right-click. Every editor has these and
 * every editor's users reach for them before they reach for a toolbar, because
 * a right-click menu is the only part of an interface that comes to where you
 * are already looking instead of making you go and find it.
 *
 * Items are built at the moment the menu opens, never before. "Split at
 * playhead" has to be grey when the playhead is not over the clip, "Paste" has
 * to know whether anything was copied, and "Unmute" has to say unmute. A menu
 * assembled at boot lies about all three within seconds of anybody using it.
 *
 * Long-press is the same menu. On a touch screen there is no right button, and
 * an editor whose every shortcut lives behind one is an editor a phone cannot
 * use.
 */

import { $, $$, toast } from './ui.js';

let box = null;
let items = [];
let openAt = null;

/* How long a finger has to stay down before it counts as a right-click. 500ms
   is what Android and iOS both use for their own long-press; matching it means
   the gesture feels borrowed rather than invented. */
const LONG_PRESS = 500;
const MOVE_SLOP = 10;          // a press that travels this far is a drag

/* ------------------------------------------------------------------ */
/* the popup                                                           */
/* ------------------------------------------------------------------ */

function el() {
  if (box) return box;
  box = document.createElement('div');
  box.className = 'ctx';
  box.setAttribute('role', 'menu');
  box.hidden = true;
  document.body.appendChild(box);

  box.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ctx]');
    if (!btn || btn.disabled) return;
    const item = items[Number(btn.dataset.ctx)];
    close();
    try { item?.run?.(); }
    catch (err) { toast(err.message || 'That did not work', 'bad', 4000); }
  });

  // Never let a right-click menu raise the browser's own right-click menu.
  box.addEventListener('contextmenu', (e) => e.preventDefault());
  return box;
}

export function isOpen() { return Boolean(box) && !box.hidden; }

export function close() {
  if (box) { box.hidden = true; box.classList.remove('on'); }
  items = [];
  openAt = null;
}

/**
 * Show a menu at a point.
 *
 * `list` is an array of `{ label, hint, run, when, danger, sep, check }`. A
 * label may be a function, so it can read state at open time; `when` returning
 * false greys the item rather than removing it, because a menu whose items
 * come and go cannot be learned.
 */
export function openMenu(x, y, list, { title = null } = {}) {
  const node = el();
  items = list.filter(Boolean);

  node.innerHTML = `
    ${title ? `<div class="ctx-title">${text(title)}</div>` : ''}
    ${items.map((item, i) => {
      if (item.sep) return '<div class="ctx-sep" role="separator"></div>';
      const off = item.when ? !item.when() : false;
      const checked = item.check?.() ? 'ctx-on' : '';
      return `<button class="ctx-item ${checked} ${item.danger ? 'ctx-bad' : ''}"
        role="menuitem" data-ctx="${i}" ${off ? 'disabled' : ''}>
        <span class="ctx-lbl">${text(item.label)}</span>
        ${item.hint ? `<span class="ctx-key">${text(item.hint)}</span>` : ''}
      </button>`;
    }).join('')}`;

  node.hidden = false;
  place(node, x, y);
  node.classList.add('on');
  openAt = { x, y };
  // Focus the menu itself, so Escape and the arrows reach it even when the
  // click came from a canvas that never takes focus.
  node.tabIndex = -1;
  node.focus({ preventScroll: true });
}

const text = (v) => (typeof v === 'function' ? v() : v);

/*
 * Put it where the pointer is, unless that runs it off the screen.
 *
 * Flipped rather than clamped when it does not fit: a menu nudged back onto
 * the screen sits under the cursor and the first item is whatever the finger
 * happens to be resting on, which is how people delete things they meant to
 * rename. Flipping keeps the anchor corner at the pointer either way.
 */
function place(node, x, y) {
  node.style.left = '0px';
  node.style.top = '0px';
  node.style.maxHeight = '';
  const r = node.getBoundingClientRect();
  const margin = 6;

  /*
   * The anchor itself comes back inside the window first.
   *
   * Flipping assumes the point is somewhere on screen. It is not always: a
   * synthetic click, a stale coordinate after a scroll, or an element wider
   * than the viewport can all hand this a point past the right-hand edge — and
   * then "x - width" is still past it, and the menu opens somewhere nobody can
   * see. One clamp before the flip costs nothing and removes the whole class.
   */
  x = Math.max(margin, Math.min(x, window.innerWidth - margin));
  y = Math.max(margin, Math.min(y, window.innerHeight - margin));

  let left = x;
  let top = y;
  if (x + r.width > window.innerWidth - margin) left = Math.max(margin, x - r.width);
  if (y + r.height > window.innerHeight - margin) top = Math.max(margin, y - r.height);

  // Still too tall for the window even flipped: cap and scroll.
  if (r.height > window.innerHeight - margin * 2) {
    top = margin;
    node.style.maxHeight = `${window.innerHeight - margin * 2}px`;
  }
  node.style.left = `${Math.round(left)}px`;
  node.style.top = `${Math.round(top)}px`;
}

/* ------------------------------------------------------------------ */
/* attaching one to something                                          */
/* ------------------------------------------------------------------ */

/**
 * Give an element a right-click menu, and the same menu on long-press.
 *
 * `build(event)` returns the item list, or null to let the browser's own menu
 * through — which is what you want over a text field, where the native
 * spelling and clipboard menu is better than anything worth rebuilding.
 */
export function attach(host, build, { title = null } = {}) {
  if (!host) return;

  host.addEventListener('contextmenu', (e) => {
    // A text field keeps its own menu: cut/copy/paste/spelling there is the
    // browser's job and it does it better.
    if (e.target.closest('input, textarea, [contenteditable="true"]')) return;
    const list = build(e);
    if (!list?.length) return;
    e.preventDefault();
    openMenu(e.clientX, e.clientY, list, { title: title?.(e) ?? null });
  });

  /*
   * Long-press, for the phone.
   *
   * Cancelled by movement, because the same gesture starts a clip drag — and
   * an editor that opens a menu every time you try to move something is worse
   * than one with no menus at all.
   */
  let timer = null;
  let from = null;

  /*
   * The gesture is watched on the window, not on the element it started on.
   *
   * Dragging a clip re-renders the timeline, which replaces the very node the
   * finger came down on — and a detached node's events do not reach the
   * listeners on its old ancestors. So a move handler bound to the timeline
   * could be skipped entirely, leaving the 500ms timer to fire in the middle
   * of a drag and drop a menu under a moving finger. A press that has begun is
   * a global gesture until it ends, and the window never detaches.
   */
  const onMove = (e) => {
    if (!from) return;
    if (Math.hypot(e.clientX - from.x, e.clientY - from.y) > MOVE_SLOP) cancel();
  };
  const cancel = () => {
    clearTimeout(timer);
    timer = null;
    from = null;
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', cancel, true);
    window.removeEventListener('pointercancel', cancel, true);
    window.removeEventListener('wheel', cancel, true);
  };

  host.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    if (e.target.closest('input, textarea, [contenteditable="true"]')) return;
    cancel();
    from = { x: e.clientX, y: e.clientY };
    // Captured, so a handler that stops propagation on the way up cannot make
    // a press impossible to cancel.
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', cancel, true);
    window.addEventListener('pointercancel', cancel, true);
    window.addEventListener('wheel', cancel, true);

    timer = setTimeout(() => {
      timer = null;
      const list = build(e);
      cancel();
      if (!list?.length) return;
      // A short buzz where the hardware offers one, so the menu is not the
      // first sign that the press registered.
      try { navigator.vibrate?.(12); } catch { /* not everywhere */ }
      openMenu(e.clientX, e.clientY, list, { title: title?.(e) ?? null });
    }, LONG_PRESS);
  }, { passive: true });
}

/* ------------------------------------------------------------------ */
/* global dismissal                                                    */
/* ------------------------------------------------------------------ */

export function initContextMenus() {
  document.addEventListener('pointerdown', (e) => {
    if (!isOpen()) return;
    if (e.target.closest('.ctx')) return;
    close();
  }, true);

  document.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }

    const buttons = $$('.ctx-item:not([disabled])', box);
    if (!buttons.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const at = buttons.indexOf(document.activeElement);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const next = at < 0 ? (step > 0 ? 0 : buttons.length - 1)
        : (at + step + buttons.length) % buttons.length;
      buttons[next].focus();
    }
    if (e.key === 'Enter' && document.activeElement?.classList.contains('ctx-item')) {
      e.preventDefault();
      document.activeElement.click();
    }
  }, true);

  // A menu pinned over a timeline that has scrolled away points at nothing.
  window.addEventListener('scroll', () => { if (isOpen()) close(); }, true);
  window.addEventListener('resize', () => { if (isOpen()) close(); });
  window.addEventListener('blur', () => close());

  void $; void openAt;
}
