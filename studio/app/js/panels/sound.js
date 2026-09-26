/*
 * Sound: music to cut to, and the sounds an edit reaches for.
 *
 * Four things, in the order somebody needs them.
 *
 *   The library — 544 tracks across rap, drill, R&B, afrobeats, house, pop,
 *   lo-fi and the rest. None of them is shipped: a track is a style and a
 *   seed, and the audio is written on the device when you press add. That is
 *   why the whole library is a few kilobytes, why nothing gets claimed on
 *   upload, and why the beat grid is exact rather than detected.
 *
 *   Your own music — the answer for somebody who wants a particular song.
 *   Bring the file, and the beats are found in it so every "on the beat"
 *   tool works the same as it does on ours. What you do about the rights to
 *   it is between you and the platform you post to, and the panel says so.
 *
 *   The beat maker — the same engine, but you choose the style and the tempo
 *   rather than picking a finished track.
 *
 *   Sound effects — the whooshes, hits, risers and small sounds a montage is
 *   built from, each a few lines of synthesis.
 *
 * Nothing here costs a download or a request, and everything it makes is then
 * ordinary audio: trim it, filter it, duck it, like anything else.
 */

import { $, $$, esc, toast } from '../ui.js';
import { S, actions } from '../main.js';
import { BEAT_STYLES, STYLE_FAMILIES, renderBeat, bufferToWav } from '../engine/beatmaker.js';
import { TRACKS, MOODS, LIBRARY_SIZE, findTracks, trackById } from '../engine/music-library.js';
import { SFX, SFX_GROUPS, SFX_BY_ID, renderSfx, sfxFile } from '../engine/sfx.js';
import { addClip, addTrack, duration } from '../engine/project.js';

let style = 'trap';
let bpm = null;
let seconds = 30;
let busy = false;
let audition = null;          // an AudioContext for previews, made on the first press
let playing = null;           // the preview that is sounding, so a second press stops it
const previewCache = new Map();

/* What the library browser is filtered to, kept across re-mounts. */
const filter = { q: '', family: null, mood: null, tempo: null };
const TEMPOS = [['slow', 0, 95], ['mid', 95, 125], ['fast', 125, 999]];
/* The chips are the moods people press for; the search box knows all of them. */
const SHOWN_MOODS = ['dark', 'hard', 'chill', 'smooth', 'uplifting', 'epic', 'sad', 'warm'];

export function mount(host) {
  const hasMusic = S.project.media.some((m) => m.kind === 'audio');
  const tempo = bpm || BEAT_STYLES[style].bpm;
  const list = visibleTracks();
  host.innerHTML = `
    <div class="panel-h"><h2>Sound</h2></div>
    <p class="panel-sub">${LIBRARY_SIZE} tracks the app writes itself, and ${SFX.length} sound effects made on the spot.</p>

    <details class="group" open>
      <summary>Music <span class="tiny muted">${LIBRARY_SIZE}</span></summary>
      <div class="gbody">
        <input class="input" id="ml-q" placeholder="Search — drill, dark, 140, R&amp;B, chill…" value="${esc(filter.q)}" style="margin-bottom:8px">
        <div class="chips flow" id="ml-fam">
          <button class="chip ${!filter.family ? 'on' : ''}" data-fam="">All</button>
          ${STYLE_FAMILIES.map((f) => `<button class="chip ${filter.family === f ? 'on' : ''}" data-fam="${esc(f)}">${esc(f)}</button>`).join('')}
        </div>
        <div class="chips flow" id="ml-mood" style="margin-top:6px">
          ${TEMPOS.map(([nm]) => `<button class="chip ${filter.tempo === nm ? 'on' : ''}" data-tempo="${esc(nm)}">${esc(nm)}</button>`).join('')}
          ${SHOWN_MOODS.map((m) => `<button class="chip ${filter.mood === m ? 'on' : ''}" data-mood="${esc(m)}">${esc(m)}</button>`).join('')}
        </div>
        <p class="tiny muted" style="margin:8px 0 6px">${list.length} track${list.length === 1 ? '' : 's'}${list.length > 60 ? ' — showing the first 60' : ''}</p>
        <div id="ml-list">
          ${list.slice(0, 60).map((t) => `
            <div class="sd-row">
              <button class="btn btn-sm btn-ghost" data-hear="${esc(t.id)}" title="Hear eight seconds of it">▶</button>
              <div class="sd-txt"><b>${esc(t.name)}</b><span class="tiny muted">${esc(t.styleName)} · ${t.bpm} BPM · ${esc(t.key)} · ${esc(t.moods.join(', '))}</span></div>
              <button class="btn btn-sm" data-track="${esc(t.id)}" title="Make it and put it in the project">+ Add</button>
            </div>`).join('') || '<p class="tiny muted">Nothing matches that. Try a style, a mood, or a tempo.</p>'}
        </div>
        <p class="tiny muted" style="margin:10px 0 0">
          Every one is written here, on your device. Nothing to licence, nothing to be claimed on upload,
          and the beat grid is exact — so "cut on the beat" lands to the sample.
        </p>
      </div>
    </details>

    <details class="group" open>
      <summary>Your own music</summary>
      <div class="gbody">
        <div class="btn-row">
          <button class="btn btn-full" id="ml-mine">Add a track from a file…</button>
        </div>
        <input type="file" id="ml-file" accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac" multiple class="file-hidden" tabindex="-1" aria-hidden="true">
        <p class="tiny muted" style="margin:8px 0 0">
          MP3, M4A, WAV, AAC, OGG or FLAC. It never leaves the device, and the beats are found in it so
          every "on the beat" tool works on it too. You can also drag a file anywhere onto the editor.
        </p>
        <p class="tiny muted" style="margin:6px 0 0">
          Using somebody else's song is between you and wherever you post it — most platforms will mute
          or claim it. The library above never will.
        </p>
      </div>
    </details>

    <details class="group">
      <summary>Beat maker <span class="tiny muted">${Object.keys(BEAT_STYLES).length} styles</span></summary>
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

    <details class="group">
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

  /* ---- the library ---- */
  let typing = null;
  $('#ml-q', host).addEventListener('input', (e) => {
    filter.q = e.target.value;
    clearTimeout(typing);
    typing = setTimeout(() => redrawList(host), 160);
  });
  $('#ml-fam', host).addEventListener('click', (e) => {
    const b = e.target.closest('[data-fam]'); if (!b) return;
    filter.family = b.dataset.fam || null; mount(host);
  });
  $('#ml-mood', host).addEventListener('click', (e) => {
    const m = e.target.closest('[data-mood]');
    const t = e.target.closest('[data-tempo]');
    if (m) filter.mood = filter.mood === m.dataset.mood ? null : m.dataset.mood;
    else if (t) filter.tempo = filter.tempo === t.dataset.tempo ? null : t.dataset.tempo;
    else return;
    mount(host);
  });

  /* ---- your own music ---- */
  $('#ml-mine', host).addEventListener('click', () => $('#ml-file', host).click());
  $('#ml-file', host).addEventListener('change', (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (files.length) addYourMusic(files);
  });

  /* ---- the beat maker ---- */
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
    const hear = e.target.closest('[data-hear]');
    if (hear) { hearTrack(hear.dataset.hear, hear); return; }
    const track = e.target.closest('[data-track]');
    if (track) { addTrackFromLibrary(track.dataset.track, track); return; }
    const play = e.target.closest('[data-play]');
    if (play) { hearSfx(play.dataset.play); return; }
    const add = e.target.closest('[data-add]');
    if (add) addSfx(add.dataset.add);
  });
}

/* ------------------------------------------------------------------ */
/* the library                                                         */
/* ------------------------------------------------------------------ */

function visibleTracks() {
  const t = TEMPOS.find(([nm]) => nm === filter.tempo);
  return findTracks({
    q: filter.q, family: filter.family, mood: filter.mood,
    bpmMin: t ? t[1] : 0, bpmMax: t ? t[2] : 999,
  });
}

/* Typing re-renders only the list. Re-mounting the whole panel on every
   keystroke throws away the input's focus and the caret with it. */
function redrawList(host) {
  const list = visibleTracks();
  const box = $('#ml-list', host);
  if (!box) return;
  box.innerHTML = list.slice(0, 60).map((t) => `
    <div class="sd-row">
      <button class="btn btn-sm btn-ghost" data-hear="${esc(t.id)}" title="Hear eight seconds of it">▶</button>
      <div class="sd-txt"><b>${esc(t.name)}</b><span class="tiny muted">${esc(t.styleName)} · ${t.bpm} BPM · ${esc(t.key)} · ${esc(t.moods.join(', '))}</span></div>
      <button class="btn btn-sm" data-track="${esc(t.id)}" title="Make it and put it in the project">+ Add</button>
    </div>`).join('') || '<p class="tiny muted">Nothing matches that. Try a style, a mood, or a tempo.</p>';
  const count = box.previousElementSibling;
  if (count) count.textContent = `${list.length} track${list.length === 1 ? '' : 's'}${list.length > 60 ? ' — showing the first 60' : ''}`;
}

/*
 * Eight seconds, at half the sample rate, kept after the first press.
 *
 * A full track takes a couple of seconds to write, which is fine when you
 * have decided and far too slow when you are browsing. An eight-second
 * excerpt at 22 kHz renders in about a quarter of a second, which is under
 * the threshold where a press feels like it did nothing.
 */
async function hearTrack(id, btn) {
  const t = trackById(id);
  if (!t) return;
  try {
    if (playing) { try { playing.stop(); } catch { /* already ended */ } playing = null; }
    audition ||= new AudioContext();
    if (audition.state === 'suspended') await audition.resume();
    let buffer = previewCache.get(id);
    if (!buffer) {
      if (btn) btn.textContent = '…';
      const made = await renderBeat({ style: t.style, seed: t.seed, seconds: 8, sampleRate: 22050 });
      buffer = made.buffer;
      previewCache.set(id, buffer);
      if (previewCache.size > 24) previewCache.delete(previewCache.keys().next().value);
    }
    const src = audition.createBufferSource();
    src.buffer = buffer;
    src.connect(audition.destination);
    src.onended = () => { if (playing === src) playing = null; };
    src.start();
    playing = src;
  } catch (err) {
    toast(err.message, 'bad');
  } finally {
    if (btn) btn.textContent = '▶';
  }
}

async function addTrackFromLibrary(id, btn) {
  const t = trackById(id);
  if (!t || busy) return;
  busy = true;
  if (btn) { btn.disabled = true; btn.textContent = 'Making…'; }
  try {
    const made = await renderBeat({ style: t.style, seed: t.seed, seconds });
    const file = bufferToWav(made.buffer, `${t.name} — ${t.styleName} ${made.bpm} BPM.wav`);
    const recs = await actions.importFiles([file], { silent: true });
    const rec = recs?.[0];
    if (!rec) throw new Error('That track could not be added to the pool.');
    rec.generated = true;          // written here, so nothing tries to "repair" it
    // The grid is known exactly; detection is the fallback for other people's songs.
    S.beats = { bpm: made.bpm, period: 60 / made.bpm, beats: made.beats, confidence: 1 };
    const hadMusicOnTimeline = S.project.clips.some((c) => S.project.tracks.find((tr) => tr.id === c.trackId)?.kind === 'audio');
    if (!hadMusicOnTimeline) actions.appendMedia(rec.id);
    toast(`${t.name} — ${made.bpm} BPM, ${Math.round(made.seconds)}s — ${hadMusicOnTimeline ? 'in the pool' : 'on the timeline'}`, 'ok', 4000);
  } catch (err) {
    toast(err.message, 'bad', 4000);
  } finally {
    busy = false;
    const live = btn && btn.isConnected ? btn : null;
    if (live) { live.disabled = false; live.textContent = '+ Add'; }
  }
}

/* ------------------------------------------------------------------ */
/* your own music                                                      */
/* ------------------------------------------------------------------ */

/*
 * Import it, put it on the timeline, and say what was found in it.
 *
 * The import already decodes an audio file and runs beat detection over it —
 * that is where S.beats comes from — so this does not redo the work. What it
 * adds is the part that was missing: somewhere obvious to press, the file
 * actually landing on the timeline rather than only in the pool, and a toast
 * that reports the tempo, so a detector that got it wrong is visible instead
 * of quietly wrong later when the cuts do not land.
 */
async function addYourMusic(files) {
  const audio = files.filter((f) => /^audio\//.test(f.type) || /\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(f.name));
  if (!audio.length) { toast('Those are not audio files — pick an MP3, M4A, WAV, AAC, OGG or FLAC.', 'bad', 5000); return; }
  const recs = await actions.importFiles(audio, { silent: true });
  const rec = recs?.[0];
  if (!rec) { toast('That file could not be read. If it plays in your browser it should import here.', 'bad', 5000); return; }
  const hadMusicOnTimeline = S.project.clips.some((c) => S.project.tracks.find((t) => t.id === c.trackId)?.kind === 'audio');
  if (!hadMusicOnTimeline) actions.appendMedia(rec.id);
  const found = S.beats;
  if (found?.beats?.length) {
    toast(`${rec.name} — ${Math.round(found.bpm)} BPM, ${found.beats.length} beats found. "Cut on the beat" is ready.`, 'ok', 5000);
  } else {
    toast(`${rec.name} is in. Open Audio → Cut to the beat to find its tempo.`, 'ok', 5000);
  }
}

/* ------------------------------------------------------------------ */
/* the beat maker and the sound effects                                */
/* ------------------------------------------------------------------ */

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
    rec.generated = true;
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

async function hearSfx(id) {
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
