/* The media pool: what you've imported, and getting it onto the timeline. */

import { $, $$, el, esc, empty, dur, bytes, toast } from '../ui.js';
import { S, actions } from '../main.js';
import { isReady } from '../engine/media.js';
import { suggestFor, insertBroll } from '../engine/broll.js';

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
    </div>` : ''}
    ${brollMarkup()}`;

  $('#m-add', host).addEventListener('click', () => $('#file-input').click());
  wireBroll(host);

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

/* ------------------------------------------------------------------ */
/* B-roll for this moment                                              */
/* ------------------------------------------------------------------ */

/*
 * Lives in the media pool rather than in a panel of its own, because it is a
 * question about the media pool: which of these belongs here. A separate tab
 * would be one more place to look for something the person is already looking
 * at.
 */
function brollMarkup() {
  if (!S.project.clips.length || S.project.media.length < 2) return '';
  return `
    <div class="group" style="margin-top:16px">
      <div class="mock-h" style="font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;
        color:var(--text-3);font-weight:700;margin-bottom:6px">B-roll for this moment</div>
      <p class="tiny muted" style="margin:0 0 9px">
        Which of your own clips suits what is happening at the playhead — and why.
      </p>
      <button class="btn btn-sm btn-full" id="m-broll">Find a cutaway for here</button>
      <div id="m-broll-out" style="margin-top:10px"></div>
    </div>`;
}

function wireBroll(host) {
  const out = $('#m-broll-out', host);
  $('#m-broll', host)?.addEventListener('click', () => {
    const found = suggestFor(S.project, S.time, { beats: S.beats });

    if (!found.list.length) {
      out.innerHTML = `<div class="note tiny">
        <b>Nothing here suits this moment.</b>
        ${found.why.length
          ? `It was looking for ${esc(found.why.join(', and '))} — and everything you have
             imported is either already on screen here or does not fit.`
          : 'Import a few cutaways, or add captions so it knows what is being said.'}
      </div>`;
      return;
    }

    /* Say what it was looking for before saying what it found. A ranked list
       with no stated criterion is just an opinion. */
    out.innerHTML = `
      ${found.why.length ? `<p class="tiny muted" style="margin:0 0 8px">
        Looking for something to suit ${esc(found.why.join(', and '))}${
          found.line ? ` — <i>“${esc(found.line.text.slice(0, 70))}”</i>` : ''}.
      </p>` : ''}
      ${found.list.map((s) => `
        <button class="tpl" data-broll="${esc(s.media.id)}" style="width:100%">
          <span class="te">${s.media.poster
            ? `<img src="${esc(s.media.poster)}" alt="" style="width:34px;height:34px;
                 object-fit:cover;border-radius:5px;display:block">`
            : '🎞'}</span>
          <span class="tt">
            <b>${esc(s.media.name)}</b>
            <span>${esc(s.reasons.slice(0, 3).join(' · ') || 'your footage')}</span>
            <em>${dur(s.media.duration)}${s.media.tags?.length
              ? ` · ${esc(s.media.tags.slice(0, 3).join(', '))}` : ''}</em>
          </span>
        </button>`).join('')}
      <p class="tiny muted" style="margin-top:8px">
        Tapping one lays it over the top as a silent overlay — the sound underneath keeps
        playing, and one undo takes it back off.
      </p>`;
  });

  out?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-broll]');
    if (!btn) return;
    const clip = insertBroll(S.project, btn.dataset.broll, S.time, 1.6);
    if (!clip) { toast('That file has gone', 'bad'); return; }
    actions.commit('Add B-roll');
    actions.select([clip.id]);
    toast('Laid over the top, muted. Drag or trim it like any other clip.', 'ok', 4200);
  });
}
