/* The tutorial, the shortcut list, and what each skill level actually shows. */

import { $, esc } from '../ui.js';
import { startTour } from '../tutorial.js';
import * as levels from '../levels.js';
import { PAY } from '../../../assets/config.js';
import { BUILD } from '../updates.js';

export const SHORTCUTS = [
  ['Space', 'Play / pause'],
  ['← →', 'One frame back / forward'],
  ['Shift + ← →', 'One second back / forward'],
  ['Home / End', 'Jump to start / end'],
  ['S', 'Split at the playhead'],
  ['C', 'Razor tool (click a clip to cut it)'],
  ['V', 'Selection tool'],
  ['M', 'Drop a marker'],
  ['Delete', 'Delete the selected clips'],
  ['Ctrl + D', 'Duplicate'],
  ['Ctrl + Z', 'Undo'],
  ['Ctrl + Shift + Z', 'Redo'],
  ['Ctrl + A', 'Select every clip'],
  ['Ctrl + K', 'Find anything'],
  ['Ctrl + E', 'Export'],
  ['Ctrl + S', 'Save now'],
  ['+ / −', 'Zoom the timeline'],
  ['1 … 8', 'Switch panels'],
  ['Esc', 'Deselect'],
];

export function mount(host) {
  const level = levels.current();

  host.innerHTML = `
    <div class="panel-h"><h2>Learn</h2></div>
    <p class="panel-sub">Two minutes to the first export.</p>

    <button class="btn btn-primary btn-full" id="h-tour">▶ Start the walkthrough</button>
    <p class="tiny muted" style="margin:9px 0 18px">
      Eight steps, skippable at any point, and it never touches your project.
    </p>

    <div class="group" style="padding:12px">
      <b style="font-size:12.5px">You're on ${esc(levels.DESCRIPTIONS[level].name)}</b>
      <p class="tiny muted" style="margin:5px 0 9px">${esc(levels.DESCRIPTIONS[level].line)}</p>
      <ul style="margin:0;padding-left:18px;font-size:12px;color:var(--text-2)">
        ${levels.DESCRIPTIONS[level].shows.map((s) => `<li>${esc(s)}</li>`).join('')}
      </ul>
      ${level !== 'expert' ? `<p class="tiny muted" style="margin:10px 0 0">
        Switching up never hides anything you've already done — it only puts more controls on screen.
      </p>` : ''}
    </div>

    <h4 style="font-size:12px;margin:18px 0 8px;color:var(--text-2)">Keyboard</h4>
    <div style="font-size:12px">
      ${SHORTCUTS.map(([k, what]) => `
        <div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;
          border-bottom:1px solid var(--line-soft)">
          <span class="muted">${esc(what)}</span><span class="kbd">${esc(k)}</span>
        </div>`).join('')}
    </div>

    <h4 style="font-size:12px;margin:18px 0 8px;color:var(--text-2)">If something goes wrong</h4>
    <div class="note tiny">
      Your work is saved every five seconds, and a copy is written the instant anything changes.
      If this tab crashes, reopening it offers to put you back exactly where you were.
    </div>
    ${supportBlock()}`;

  $('#h-tour', host).addEventListener('click', startTour);
}

/**
 * How to reach a person, from inside the app.
 *
 * Rendered only when an address is configured — an empty "Contact us" that
 * opens a blank email is worse than not offering one at all.
 */
function supportBlock() {
  const addr = (PAY.supportEmail || '').trim();
  if (!addr) return '';
  const body = encodeURIComponent(
    `\n\n---\nBuild ${BUILD}\nLevel: ${levels.current()}\n${navigator.userAgent}\n`,
  );
  return `
    <h4 style="font-size:12px;margin:18px 0 8px;color:var(--text-2)">Still stuck</h4>
    <div class="note tiny">
      Email <a href="mailto:${esc(addr)}?subject=${
        encodeURIComponent('OmniDx Studio — help')}&body=${body}">${esc(addr)}</a>.
      The link fills in your build number and browser, which is usually the
      first thing anyone would have to ask you for.
    </div>`;
}
