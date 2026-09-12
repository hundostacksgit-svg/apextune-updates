/* The media pool: what you've imported, and getting it onto the timeline. */

import { $, $$, el, esc, empty, dur, bytes, toast } from '../ui.js';
import { S, actions } from '../main.js';
import { isReady } from '../engine/media.js';
import { suggestFor, insertBroll } from '../engine/broll.js';

/*
 * Two views of the same bin. The grid is for recognising footage by its
 * picture; the list is the compositor's project panel — name, type, size,
 * frame rate, length, dimensions in columns, sortable by any of them — for
 * the person with forty files who needs the 59.94 one. The choice and the
 * sort are remembered.
 */
const VIEW_KEY = 'omnidx.studio.media.view';
const SORT_KEY = 'omnidx.studio.media.sort';
let view = (() => { try { return localStorage.getItem(VIEW_KEY) || 'grid'; } catch { return 'grid'; } })();
let sortBy = (() => { try { return localStorage.getItem(SORT_KEY) || 'added'; } catch { return 'added'; } })();
let sortDir = 1;

const COLS = [
  ['name', 'Name'], ['kind', 'Type'], ['size', 'Size'], ['fps', 'Rate'], ['duration', 'Length'], ['dims', 'Size (px)'],
];

function sorted(media) {
  const list = media.slice();
  const key = sortBy;
  list.sort((a, b) => {
    let x, y;
    if (key === 'dims') { x = (a.width || 0) * (a.height || 0); y = (b.width || 0) * (b.height || 0); }
    else if (key === 'added') { x = a.addedAt || 0; y = b.addedAt || 0; }
    else { x = a[key] ?? ''; y = b[key] ?? ''; }
    if (typeof x === 'string') return x.localeCompare(String(y)) * sortDir;
    return ((x || 0) - (y || 0)) * sortDir;
  });
  return list;
}

export function mount(host) {
  const { media } = S.project;

  host.innerHTML = `
    <div class="panel-h">
      <h2>Media</h2>
      <span style="display:flex;gap:4px;align-items:center">
        <button class="btn btn-sm btn-ghost mview ${view === 'grid' ? 'on' : ''}" id="m-view-grid" title="Thumbnails">▦</button>
        <button class="btn btn-sm btn-ghost mview ${view === 'list' ? 'on' : ''}" id="m-view-list" title="Columns — name, type, size, rate, length">☰</button>
        <button class="btn btn-sm btn-primary" id="m-add">＋ Import</button>
      </span>
    </div>
    <p class="panel-sub">Drag onto a track, or double-click to add it to the end.</p>
    ${media.length ? (view === 'list' ? listMarkup(media) : `<div class="mgrid" id="m-grid"></div>`) : empty('🎞',
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
  $('#m-view-grid', host).addEventListener('click', () => { view = 'grid'; try { localStorage.setItem(VIEW_KEY, view); } catch { /* fine */ } mount(host); });
  $('#m-view-list', host).addEventListener('click', () => { view = 'list'; try { localStorage.setItem(VIEW_KEY, view); } catch { /* fine */ } mount(host); });

  const list = $('#m-list', host);
  if (list) {
    wireList(host, list);
    measureRates(media, host);
    return;
  }

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
/* the columns view                                                    */
/* ------------------------------------------------------------------ */

function listMarkup(media) {
  const arrow = (k) => (sortBy === k ? (sortDir > 0 ? ' ▴' : ' ▾') : '');
  return `
    <table class="mlist" id="m-list">
      <thead><tr>${COLS.map(([k, label]) => `<th data-sort="${k}" class="${sortBy === k ? 'on' : ''}">${esc(label)}${arrow(k)}</th>`).join('')}<th></th></tr></thead>
      <tbody>
        ${sorted(media).map((m) => `
          <tr draggable="true" data-media="${esc(m.id)}" title="${esc(m.name)}" class="${m.missing ? 'missing' : ''}">
            <td class="mn"><span class="mk">${m.kind === 'audio' ? '♪' : m.kind === 'image' ? '▣' : '▶'}</span>${esc(m.missing ? `⚠ ${m.name}` : m.name)}</td>
            <td>${esc(m.kind === 'video' ? 'Video' : m.kind === 'audio' ? 'Audio' : 'Image')}</td>
            <td class="mono">${esc(bytes(m.size || 0))}</td>
            <td class="mono" data-fps="${esc(m.id)}">${m.fps ? `${m.fps}${m.vfr ? ' vfr' : ''}` : (m.kind === 'video' ? '…' : '—')}</td>
            <td class="mono">${esc(dur(m.duration))}</td>
            <td class="mono">${m.width ? `${m.width}×${m.height}` : '—'}</td>
            <td><button class="rm" title="Remove from project" data-rm="${esc(m.id)}">✕</button></td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function wireList(host, list) {
  list.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-sort]');
    if (th) {
      if (sortBy === th.dataset.sort) sortDir = -sortDir; else { sortBy = th.dataset.sort; sortDir = 1; }
      try { localStorage.setItem(SORT_KEY, sortBy); } catch { /* fine */ }
      mount(host);
      return;
    }
    const rm = e.target.closest('[data-rm]');
    if (rm) {
      e.stopPropagation();
      const used = S.project.clips.filter((c) => c.mediaId === rm.dataset.rm).length;
      if (used && !confirm(`That file is used by ${used} clip${used === 1 ? '' : 's'}. Remove it anyway?`)) return;
      actions.removeMedia(rm.dataset.rm);
      toast('Removed from the project — the file on your disk is untouched');
    }
  });
  list.addEventListener('dragstart', (e) => {
    const row = e.target.closest('[data-media]');
    if (!row) return;
    e.dataTransfer.setData('text/omnidx-media', row.dataset.media);
    e.dataTransfer.effectAllowed = 'copy';
  });
  list.addEventListener('dblclick', (e) => {
    const row = e.target.closest('[data-media]');
    if (row) actions.appendMedia(row.dataset.media);
  });
}

/*
 * A file's frame rate, measured once, the first time the columns ask for
 * it. Read from the frames' own presentation times rather than trusted from
 * a header, so a 29.97 file says 29.97 and a variable-rate screen recording
 * says so. Kept on the record so the next open does not measure again.
 */
const measuring = new Set();
async function measureRates(media, host) {
  const { elementFor } = await import('../engine/media.js');
  const { inspectFrameRate } = await import('../engine/proxy.js');
  for (const m of media) {
    if (m.kind !== 'video' || m.fps || m.missing || measuring.has(m.id)) continue;
    measuring.add(m.id);
    try {
      const node = elementFor(m, `rate-${m.id}`);
      if (!node) continue;
      // eslint-disable-next-line no-await-in-loop -- one file at a time, or ten videos play at once
      const rate = await inspectFrameRate(node, { samples: 16 });
      if (rate?.fps) { m.fps = rate.fps; m.vfr = rate.variable; }
      else m.fps = 0;
      const cell = host.querySelector(`[data-fps="${CSS.escape(m.id)}"]`);
      if (cell) cell.textContent = m.fps ? `${m.fps}${m.vfr ? ' vfr' : ''}` : '—';
    } catch { m.fps = 0; } finally { measuring.delete(m.id); }
  }
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
