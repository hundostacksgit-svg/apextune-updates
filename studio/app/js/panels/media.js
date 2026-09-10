/* The media pool: what you've imported, and getting it onto the timeline. */

import { $, $$, el, esc, empty, dur, bytes, toast } from '../ui.js';
import { S, actions } from '../main.js';
import { isReady } from '../engine/media.js';

export function mount(host) {
  const { media } = S.project;

  host.innerHTML = `
    <div class="panel-h">
      <h2>Media</h2>
      <button class="btn btn-sm btn-primary" id="m-add">＋ Import</button>
    </div>
    <p class="panel-sub">Drag onto a track, or double-click to add it to the end.</p>
    ${media.length ? `<div class="mgrid" id="m-grid"></div>` : empty('🎞',
      'Nothing imported yet',
      'Drop video, photos or music anywhere in this window. Nothing is uploaded — it stays on this device.')}
    ${media.length ? `<p class="tiny muted" style="margin-top:14px">
      ${media.length} item${media.length === 1 ? '' : 's'} ·
      ${bytes(media.reduce((s, m) => s + (m.size || 0), 0))}
    </p>` : ''}
    ${S.beats ? `<div class="note info" style="margin-top:12px">
      <b>${S.beats.bpm} BPM detected</b> in your music.
      The AI editor can cut every shot to land on a beat.
    </div>` : ''}`;

  $('#m-add', host).addEventListener('click', () => $('#file-input').click());

  const grid = $('#m-grid', host);
  if (!grid) return;

  for (const m of media) {
    const item = el('div', {
      class: 'mitem', draggable: 'true', 'data-media': m.id,
      title: `${m.name}\n${m.width || '?'}×${m.height || '?'} · ${dur(m.duration)}`,
    });
    const thumb = el('div', { class: 'th' });
    if (m.poster) thumb.appendChild(el('img', { src: m.poster, alt: '' }));
    else thumb.textContent = m.kind === 'audio' ? '🎵' : (m.missing || !isReady(m)) ? '⚠️' : '🎞';
    item.append(
      thumb,
      el('span', { class: 'md' }, dur(m.duration)),
      el('button', { class: 'rm', title: 'Remove from project', 'data-rm': m.id }, '✕'),
      el('div', { class: 'mn' }, m.missing ? `⚠ ${m.name}` : m.name),
    );
    grid.appendChild(item);
  }

  grid.addEventListener('dragstart', (e) => {
    const item = e.target.closest('[data-media]');
    if (!item) return;
    e.dataTransfer.setData('text/omnidx-media', item.dataset.media);
    e.dataTransfer.effectAllowed = 'copy';
  });

  grid.addEventListener('dblclick', (e) => {
    const item = e.target.closest('[data-media]');
    if (item) actions.appendMedia(item.dataset.media);
  });

  grid.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (!rm) return;
    e.stopPropagation();
    const used = S.project.clips.filter((c) => c.mediaId === rm.dataset.rm).length;
    if (used && !confirm(`That file is used by ${used} clip${used === 1 ? '' : 's'}. Remove it anyway?`)) return;
    actions.removeMedia(rm.dataset.rm);
    toast('Removed from the project — the file on your disk is untouched');
  });

  void $$;
}
