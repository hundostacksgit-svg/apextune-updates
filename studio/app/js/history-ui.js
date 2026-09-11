/*
 * Undo, made obvious.
 *
 * Undo already worked. What it did not do was reassure anybody, and that is
 * most of its job. Somebody who has just dropped the wrong clip onto their
 * timeline does not want to remember a keyboard shortcut and hope — they want
 * to see, right now, that the thing they just did has a name and can be taken
 * back.
 *
 * So three things, in order of how often they save somebody:
 *
 *   1. The Undo button says what it will undo. "Undo Add clip" is a promise;
 *      a bare arrow is a gamble.
 *   2. Every change raises a short bar saying what happened with an Undo on
 *      it, right where the person is already looking.
 *   3. A full history list, because sometimes the mistake was four steps ago
 *      and undoing four times blind is worse than picking the moment.
 */

import { $, $$, esc, modal, closeModal } from './ui.js';

let api = {};
let barTimer = 0;

export function initHistoryUi(actions) { api = actions || {}; }

/* ------------------------------------------------------------------ *
 * The undo bar
 * ------------------------------------------------------------------ */

function bar() {
  let el = $('#undo-bar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'undo-bar';
    el.className = 'undo-bar';
    el.setAttribute('role', 'status');
    // Polite, not assertive: this narrates something the person just did on
    // purpose. Interrupting a screen reader mid-sentence to announce their own
    // action is worse than saying nothing.
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-undo]')) { api.undo?.(); hideBar(); }
      if (e.target.closest('[data-dismiss]')) hideBar();
    });
  }
  return el;
}

export function hideBar() {
  clearTimeout(barTimer);
  $('#undo-bar')?.classList.remove('on');
}

/**
 * Say what just happened, with a way back.
 *
 * Skipped for the small continuous things — dragging a slider, scrubbing —
 * because a bar that appears on every frame of a drag is not reassurance, it
 * is a flicker. Those coalesce into one history entry anyway, so the bar
 * appears once when the drag ends.
 */
export function showDid(label, { undoable = true } = {}) {
  if (!label) return;
  const el = bar();
  el.innerHTML = `
    <span class="ub-txt">${esc(label)}</span>
    ${undoable ? '<button class="ub-undo" data-undo>Undo</button>' : ''}
    <button class="ub-x" data-dismiss aria-label="Dismiss">✕</button>`;
  el.classList.add('on');
  clearTimeout(barTimer);
  barTimer = setTimeout(() => el.classList.remove('on'), 6000);
}

/* ------------------------------------------------------------------ *
 * The history list
 * ------------------------------------------------------------------ */

/**
 * Every step, with the current one marked, and any point clickable.
 *
 * Steps after the current one are kept and shown faded rather than removed:
 * having undone three things, the three you undid are exactly what you might
 * want back, and hiding them makes redo feel like a trapdoor.
 */
export function openHistory() {
  const h = api.history?.();
  if (!h) return;

  const rows = h.stack.map((entry, i) => {
    const when = new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const state = i === h.index ? 'now' : i > h.index ? 'undone' : '';
    return `<button class="hist-row ${state}" data-go="${i}">
      <span class="hist-dot"></span>
      <span class="hist-lbl">${esc(entry.label)}</span>
      <span class="hist-when">${when}</span>
      ${i === h.index ? '<span class="hist-tag">where you are</span>' : ''}
    </button>`;
  }).reverse().join('');

  modal(`
    <h3>History</h3>
    <p class="tiny muted" style="margin:0 0 12px">
      Every change, newest first. Click any one to go back to exactly how the
      project looked then — nothing is thrown away, so you can come forward again.
    </p>
    <div class="hist-list">${rows}</div>
    <div class="btn-row" style="justify-content:flex-end">
      <button class="btn btn-ghost" data-x="close">Close</button>
    </div>`);

  for (const row of $$('[data-go]')) {
    row.addEventListener('click', () => {
      api.goTo?.(Number(row.dataset.go));
      closeModal();
    });
  }
}

/* ------------------------------------------------------------------ *
 * The toolbar buttons
 * ------------------------------------------------------------------ */

/**
 * Keep the undo and redo buttons telling the truth.
 *
 * The label is the point. A greyed arrow tells you undo is unavailable; a
 * button reading "Undo Add clip" tells you what you are about to get back,
 * which is the question somebody actually has at the moment they reach for it.
 */
export function paintUndoButtons() {
  const h = api.history?.();
  const undo = $('#btn-undo');
  const redo = $('#btn-redo');
  if (undo) {
    const label = h?.undoLabel;
    undo.disabled = !h?.canUndo;
    undo.title = label ? `Undo ${label} (Ctrl+Z)` : 'Nothing to undo';
    const lbl = $('.lbl', undo);
    if (lbl) lbl.textContent = label ? `Undo ${label}` : 'Undo';
  }
  if (redo) {
    const label = h?.redoLabel;
    redo.disabled = !h?.canRedo;
    redo.title = label ? `Redo ${label} (Ctrl+Shift+Z)` : 'Nothing to redo';
  }
}
