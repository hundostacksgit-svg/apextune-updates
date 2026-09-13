/*
 * Sound: a beat to cut to, and the sounds an edit reaches for.
 *
 * Two libraries, both made on the spot rather than shipped. The beat maker
 * renders a bar-repeating beat in eight styles at any tempo and puts it in
 * the pool as a real file with an exact grid, so every "on the beat" tool
 * lands to the sample. The sound effects are the whooshes, hits, risers,
 * glitches and small sounds a montage is built from, each a few lines of
 * synthesis; press one to hear it, press add to put it on its own track at
 * the playhead. Neither costs a download or a request, and both are then
 * ordinary audio — trim it, filter it, duck it, like anything else.
 */

import { $, $$, esc, toast, selectRow } from '../ui.js';
import { S, actions } from '../main.js';
import { BEAT_STYLES, renderBeat, bufferToWav } from '../engine/beatmaker.js';
import { SFX, SFX_GROUPS, SFX_BY_ID, renderSfx, sfxFile } from '../engine/sfx.js';
import { addClip, addTrack, duration } from '../engine/project.js';

let style = 'trap';
let bpm = null;
let seconds = 30;
let busy = false;
let audition = null;          // an AudioContext for previews, made on the first press

export function mount(host) {
  const hasMusic = S.project.media.some((m) => m.kind === 'audio');
  const tempo = bpm || BEAT_STYLES[style].bpm;
  host.innerHTML = `
    <div class="panel-h"><h2>Sound</h2></div>
    <p class="panel-sub">A beat made to your tempo, and ${SFX.length} sound effects made on the spot.</p>

    <details class="group" open>
      <summary>Beat maker</summary>
      <div class="gbody">
        <div class="chips" id="sd-styles">
          ${Object.entries(BEAT_STYLES).map(([id, b]) => `<button class="chip ${id === style ? 'on' : ''}" data-style="${esc(id)}" title="${esc(b.blurb)}">${esc(b.name)}</button>`).join('')}
        </div>
        <p class="tiny muted" style="margin:8px 0 10px">${esc(BEAT_STYLES[style].blurb)}</p>
        <div class="field" style="display:flex;gap:10px;align-items:end">
          <div style="flex:1"><label for="sd-bpm">Tempo (BPM)</label>
            <input class="input" type="number" id="sd-bpm" min="60" max="200" step="1" value="${tempo}"></div>
          <div style="flex:1"><label for="sd-len">Length</label>
            <select class="input" id="sd-len">
              ${[15, 30, 45, 60, 90, 120].map((s) => `<option value="${s}" ${s === seconds ? 'selected' : ''}>${s}s</option>`).join('')}
            </select></div>
        </div>
        <div class="btn-row" style="margin-top:10px">
          <button class="btn btn-primary btn-full" id="sd-make" ${busy ? 'disabled' : ''}>${busy ? 'Making…' : 'Make the beat'}</button>
        </div>
        <p class="tiny muted" style="margin:8px 0 0">
          ${hasMusic ? 'It goes into the pool beside your music; drag it on, or sync the cuts to it from Audio.' : 'It goes into the pool and onto the timeline, and every "on the beat" tool uses its exact grid.'}
        </p>
      </div>
    </details>

    <details class="group" open>
      <summary>Sound effects <span class="tiny muted">${SFX.length}</span></summary>
      <div class="gbody">
        <input class="input" id="sd-search" placeholder="Search sounds — whoosh, boom, riser, click…" style="margin-bottom:10px">
        <div id="sd-lib">
          ${SFX_GROUPS.map((group) => `
            <details class="group" ${group === 'Whooshes' ? 'open' : ''}>
              <summary>${esc(group)} <span class="tiny muted">${SFX.filter((s) => s.group === group).length}</span></summary>
              <div class="gbody">
                ${SFX.filter((s) => s.group === group).map((s) => `
                  <div class="sd-row" data-search="${esc(`${s.name} ${s.group} ${s.blurb}`.toLowerCase())}">
                    <button class="btn btn-sm btn-ghost" data-play="${esc(s.id)}" title="Hear it">▶</button>
                    <div class="sd-txt"><b>${esc(s.name)}</b><span class="tiny muted">${esc(s.blurb)} · ${s.seconds.toFixed(1)}s</span></div>
                    <button class="btn btn-sm" data-add="${esc(s.id)}" title="Add at the playhead">+ Add</button>
                  </div>`).join('')}
              </div>
            </details>`).join('')}
        </div>
        <p class="tiny muted" style="margin:10px 0 0">Each lands on its own <b>Sound effects</b> track at the playhead, as a normal clip.</p>
      </div>
    </details>`;

  $('#sd-styles', host).addEventListener('click', (e) => {
    const b = e.target.closest('[data-style]');
    if (!b) return;
    style = b.dataset.style; bpm = null;
    mount(host);
  });
  $('#sd-bpm', host).addEventListener('change', (e) => { bpm = Math.max(60, Math.min(200, Number(e.target.value) || BEAT_STYLES[style].bpm)); });
  $('#sd-len', host).addEventListener('change', (e) => { seconds = Number(e.target.value) || 30; });
  $('#sd-make', host).addEventListener('click', () => makeBeat(host));

  $('#sd-search', host).addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    for (const grp of $$('#sd-lib details', host)) {
      let shown = 0;
      for (const row of $$('.sd-row', grp)) { const hit = !q || row.dataset.search.includes(q); row.hidden = !hit; if (hit) shown++; }
      grp.hidden = shown === 0;
      if (q) grp.open = true;
    }
  });
  host.addEventListener('click', (e) => {
    const play = e.target.closest('[data-play]');
    if (play) { hear(play.dataset.play); return; }
    const add = e.target.closest('[data-add]');
    if (add) addSfx(add.dataset.add);
  });
}

async function makeBeat(host) {
  if (busy) return;
  busy = true;
  const btn = $('#sd-make', host);
  if (btn) { btn.disabled = true; btn.textContent = 'Making…'; }
  try {
    const made = await renderBeat({ style, bpm, seconds });
    const file = bufferToWav(made.buffer, `Beat — ${BEAT_STYLES[style].name} ${made.bpm} BPM.wav`);
    const recs = await actions.importFiles([file], { silent: true });
    const rec = recs?.[0];
    if (!rec) throw new Error('The beat could not be added to the pool.');
    // The grid is known exactly; detection is the fallback for other people's songs.
    S.beats = { bpm: made.bpm, period: 60 / made.bpm, beats: made.beats, confidence: 1 };
    const hadMusicOnTimeline = S.project.clips.some((c) => S.project.tracks.find((t) => t.id === c.trackId)?.kind === 'audio');
    if (!hadMusicOnTimeline) actions.appendMedia(rec.id);
    toast(`${BEAT_STYLES[style].name} at ${made.bpm} BPM, ${Math.round(made.seconds)}s — ${hadMusicOnTimeline ? 'in the pool' : 'on the timeline'}`, 'ok', 4000);
  } catch (err) {
    toast(err.message, 'bad', 4000);
  } finally {
    busy = false;
    // The import committed, and a commit re-renders the panel — so the
    // button captured above may be a detached copy. Reach for the live one.
    const live = document.querySelector('#sd-make') || btn;
    if (live) { live.disabled = false; live.textContent = 'Make the beat'; }
  }
}

async function hear(id) {
  try {
    audition ||= new AudioContext();
    if (audition.state === 'suspended') await audition.resume();
    const { buffer } = await renderSfx(id, { sampleRate: audition.sampleRate });
    const src = audition.createBufferSource();
    src.buffer = buffer;
    src.connect(audition.destination);
    src.start();
  } catch (err) {
    toast(err.message, 'bad');
  }
}

/*
 * Rendered once per sound per project: the pool is checked by name first,
 * so adding the same whoosh nine times is nine clips of one file.
 */
async function addSfx(id) {
  const def = SFX_BY_ID[id];
  if (!def) return;
  let rec = S.project.media.find((m) => m.kind === 'audio' && m.name === `${def.name}.wav`);
  if (!rec) {
    const file = await sfxFile(id);
    const recs = await actions.importFiles([file], { silent: true });
    rec = recs?.[0];
    if (!rec) { toast('That sound could not be added', 'bad'); return; }
  }
  let track = S.project.tracks.find((t) => t.kind === 'audio' && t.name === 'Sound effects');
  if (!track) track = addTrack(S.project, 'audio', 'Sound effects');
  const at = Math.max(0, Math.min(S.time, Math.max(0, duration(S.project))));
  const clip = addClip(S.project, { mediaId: rec.id, trackId: track.id, start: at, dur: rec.duration, in: 0 });
  actions.select([clip.id]);
  actions.commit(`Add ${def.name}`);
  toast(`${def.name} at ${at.toFixed(1)}s`, 'ok');
}
