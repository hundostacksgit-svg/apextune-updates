/*
 * Stickers: emoji, shapes and callouts as their own tab.
 *
 * The Text panel keeps its sticker section for the person already there
 * with a title; this is the tab for the person who thinks "sticker". Same
 * emoji, same shapes, same editor — one module, imported from Text — so a
 * sticker dropped here and tuned there is one sticker with one history.
 * The reactions (hover, orbit, lean, trail, point at a tracked subject) are
 * in the editor once a sticker is selected and something has been tracked.
 */

import { $, esc } from '../ui.js';
import { S } from '../main.js';
import { EMOJI, SHAPES, STICKER_ANIMS, STICKER_REACTIONS } from '../engine/stickers.js';
import { stickerEditor, addSticker, wireStickerEditor } from './text.js';
import * as licence from '../licence.js';

// A little order to a wall of emoji: groups by what they say, not by Unicode.
const SETS = [
  ['Reactions', ['🔥', '💀', '😂', '😭', '🥶', '😤', '🤯', '😮', '🙄', '😎', '🥵', '😱', '🤡', '💯', '👀', '🫡']],
  ['Signs', ['✅', '❌', '⚠️', '❗', '❓', '➡️', '⬅️', '⬆️', '⬇️', '🔁', '⏸️', '▶️', '🔇', '🔊', '📍', '🆕']],
  ['Hype', ['🏆', '👑', '💎', '⚡', '💥', '🎯', '🚀', '🎉', '🥇', '💪', '👏', '🙌', '🤝', '✨', '🌟', '💫']],
  ['Money & work', ['💰', '💸', '🤑', '📈', '📉', '🧠', '💡', '🛠️', '⏰', '📱', '💻', '🎮', '🎧', '🎬', '📸', '🎤']],
  ['Nature', ['🌊', '🌅', '🌙', '☀️', '🌈', '❄️', '🍃', '🌸', '🐾', '🦋', '🐉', '🍕', '☕', '🍔', '🍜', '🍺']],
];

export function mount(host) {
  const sel = [...S.sel];
  const clip = sel.length === 1 ? S.project.clips.find((c) => c.id === sel[0]) : null;
  const stickerClip = clip?.kind === 'sticker' ? clip : null;
  const known = new Set(SETS.flatMap(([, list]) => list));
  const rest = EMOJI.filter((e) => !known.has(e));

  host.innerHTML = `
    <div class="panel-h"><h2>Stickers</h2></div>
    <p class="panel-sub">${EMOJI.length} emoji, ${Object.keys(SHAPES).length} shapes and callouts, ${STICKER_ANIMS.length} animations, ${STICKER_REACTIONS.length} ways to react to a tracked subject.</p>

    ${stickerClip ? `
      <details class="group" open>
        <summary>This sticker</summary>
        <div class="gbody">${stickerEditor(stickerClip)}</div>
      </details>` : ''}

    <details class="group" open>
      <summary>Emoji <span class="tiny muted">${EMOJI.length}</span></summary>
      <div class="gbody">
        <input class="input" id="sk-search" placeholder="Search — fire, arrow, trophy…" style="margin-bottom:10px">
        ${SETS.map(([name, list]) => `
          <p class="tiny muted" style="margin:8px 0 4px" data-set="${esc(name.toLowerCase())}">${esc(name)}</p>
          <div class="egrid" data-set="${esc(name.toLowerCase())}">${list.map((e) => `<button data-emoji="${esc(e)}" title="${esc(e)}">${e}</button>`).join('')}</div>`).join('')}
        ${rest.length ? `<p class="tiny muted" style="margin:8px 0 4px">More</p><div class="egrid">${rest.map((e) => `<button data-emoji="${esc(e)}" title="${esc(e)}">${e}</button>`).join('')}</div>` : ''}
      </div>
    </details>

    <details class="group" open>
      <summary>Shapes &amp; callouts <span class="tiny muted">${Object.keys(SHAPES).length}</span></summary>
      <div class="gbody">
        <div class="chips" id="sk-shapes">
          ${Object.entries(SHAPES).map(([id, sh]) => {
            const locked = sh.tier !== 'free' && !licence.can('all-filters');
            return `<button class="chip ${locked ? 'locked' : ''}" data-shape="${esc(id)}" data-tier="${esc(sh.tier)}">${esc(sh.name)}</button>`;
          }).join('')}
        </div>
        <p class="tiny muted" style="margin:10px 0 0">
          Tap one to drop it at the playhead. A speech bubble, a bar and a burst take words; a countdown counts; a progress bar fills.
          Select it on the timeline to size, place, colour and animate it, or make it react to something you have tracked.
        </p>
      </div>
    </details>

    <details class="group">
      <summary>What a sticker can do</summary>
      <div class="gbody">
        <p class="tiny" style="margin:0 0 6px"><b>Animations</b> — ${STICKER_ANIMS.map((a) => esc(Array.isArray(a) ? a[1] : a.name || a)).join(', ')}.</p>
        <p class="tiny" style="margin:0"><b>Reactions</b> — ${STICKER_REACTIONS.map(([, name]) => esc(name)).join(', ')}. Track a subject first (Inspector → Track); the sticker then follows it, keeps its distance, leans into its motion or points at it, sampled live from the track.</p>
      </div>
    </details>`;

  host.addEventListener('click', (e) => {
    const em = e.target.closest('[data-emoji]');
    if (em) { addSticker('emoji', em.dataset.emoji); return; }
    const sh = e.target.closest('[data-shape]');
    if (sh) {
      const feature = sh.dataset.tier === 'free' ? 'text' : 'all-filters';
      licence.gate(feature, () => addSticker('shape', sh.dataset.shape), { what: 'That callout' });
    }
  });
  $('#sk-search', host).addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    // Emoji have no words of their own here, so search matches the set names.
    for (const el of host.querySelectorAll('[data-set]')) el.hidden = Boolean(q) && !el.dataset.set.includes(q);
  });
  if (stickerClip) wireStickerEditor(host);
}
