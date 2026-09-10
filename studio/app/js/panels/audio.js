/*
 * Audio tools: the master level, the music analysis, and the two operations
 * that save the most time — cutting silence and snapping cuts to the beat.
 */

import { $, esc, toast, slider } from '../ui.js';
import { S, actions, engine } from '../main.js';
import { decode, detectBeats, detectSilence, peaks } from '../engine/media.js';
import { repair, describeRepair, detectHum } from '../engine/audio-repair.js';
import { applyPlan } from '../ai/apply.js';
import * as licence from '../licence.js';

let meterTimer = null;

export function mount(host) {
  const music = S.project.media.find((m) => m.kind === 'audio');
  const voice = S.project.media.filter((m) => m.kind !== 'audio' && m.hasAudio);

  host.innerHTML = `
    <div class="panel-h"><h2>Audio</h2></div>
    <p class="panel-sub">Levels, music and the two tools that save the most time.</p>

    <div class="group" style="padding:12px">
      ${slider({ key: 'master', label: 'Master volume', value: engine.audio?.masterVolume ?? 1,
        min: 0, max: 1.6, step: 0.02, fmt: (v) => `${Math.round(v * 100)}%` })}
      <div style="height:6px;border-radius:99px;background:var(--surface-3);overflow:hidden;margin-top:6px">
        <i id="a-meter" style="display:block;height:100%;width:0;background:var(--grad);
          border-radius:99px;transition:width .08s"></i>
      </div>
      <p class="tiny muted" style="margin:7px 0 0">Peaks touching the right edge will clip. Aim for three-quarters.</p>
    </div>

    ${music ? `
      <div class="group" style="padding:12px">
        <b style="font-size:12.5px">${esc(music.name)}</b>
        <p class="tiny muted" style="margin:4px 0 10px">
          ${S.beats ? `${S.beats.bpm} BPM · ${S.beats.beats.length} beats detected`
            : 'Tempo not analysed yet.'}
        </p>
        <div class="btn-row" style="margin-top:0">
          <button class="btn btn-sm" id="a-beats">${S.beats ? 'Re-analyse tempo' : 'Find the beat'}</button>
          <button class="btn btn-sm btn-primary" id="a-beatcut">Cut to the beat</button>
        </div>
      </div>` : `
      <div class="note tiny">Import a music file and the beat tools appear here.</div>`}

    ${voice.length ? `
      <div class="group" style="padding:12px">
        <b style="font-size:12.5px">Silence removal</b>
        <p class="tiny muted" style="margin:4px 0 10px">
          Finds every pause longer than a third of a second, cuts it out and closes the gap.
          This is the jump-cut look, done in one press.
        </p>
        <button class="btn btn-sm btn-primary btn-full" id="a-silence">Cut the silences</button>
      </div>` : ''}

    ${voice.length || music ? `
      <details class="group">
        <summary>Repair the audio</summary>
        <div class="gbody">
          <p class="tiny muted" style="margin:0 0 10px">
            The four things people leave an editor for a DAW to do. Runs on the selected clip's
            audio, or on the first clip with sound if nothing is selected.
          </p>
          ${slider({ key: 'nr', label: 'Reduce background noise', value: 1.2, min: 0, max: 2.4, step: 0.1,
            fmt: (v) => (v < 0.05 ? 'off' : v < 1 ? 'gentle' : v < 1.8 ? 'normal' : 'heavy') })}
          <label style="display:flex;gap:8px;align-items:center;font-size:12.5px;margin:8px 0">
            <input type="checkbox" id="a-hum" checked> Remove mains hum (50/60Hz)</label>
          <label style="display:flex;gap:8px;align-items:center;font-size:12.5px;margin:8px 0">
            <input type="checkbox" id="a-click" checked> Repair clicks and pops</label>
          <label style="display:flex;gap:8px;align-items:center;font-size:12.5px;margin:8px 0">
            <input type="checkbox" id="a-level" checked> Even out the level</label>
          <button class="btn btn-sm btn-primary btn-full" id="a-repair" style="margin-top:10px">
            Repair audio</button>
          <p class="tiny muted" id="a-repair-note" style="margin:9px 0 0"></p>
        </div>
      </details>` : ''}

    <div class="group" style="padding:12px">
      <b style="font-size:12.5px">Ducking</b>
      <p class="tiny muted" style="margin:4px 0 10px">
        Turn a track's <span class="mono">⤓</span> button on in the timeline headers and it drops
        under any voice automatically. No keyframes needed.
      </p>
    </div>`;

  host.addEventListener('input', (e) => {
    if (e.target.dataset.k !== 'master') return;
    const v = Number(e.target.value);
    engine.audio?.setMasterVolume(v);
    const label = host.querySelector('[data-val="master"]');
    if (label) label.textContent = `${Math.round(v * 100)}%`;
  });

  $('#a-beats', host)?.addEventListener('click', () => findBeats(music));
  $('#a-beatcut', host)?.addEventListener('click', () => beatCut(music));
  $('#a-silence', host)?.addEventListener('click', () => cutSilence());
  $('#a-repair', host)?.addEventListener('click', () => runRepair(host));

  startMeter(host);
}

async function findBeats(music) {
  if (!music) return;
  toast('Analysing…');
  const buffer = await decode(music);
  if (!buffer) { toast('That file could not be decoded for analysis', 'bad'); return; }
  S.beats = detectBeats(buffer);
  music.peaks ||= peaks(buffer, 900);
  if (!S.beats?.beats?.length) { toast('No steady beat found in that track', 'bad'); return; }
  // Markers make the beat grid visible on the ruler, so a manual cut can land
  // on it too — the automatic version is not the only way to use this.
  S.project.markers = S.beats.beats
    .filter((_, i) => i % 4 === 0)
    .slice(0, 240)
    .map((t, i) => ({ t, label: `Bar ${i + 1}`, color: '#00d1ff' }));
  actions.commit('Detect beats');
  toast(`${S.beats.bpm} BPM — every 4th beat marked on the ruler`, 'ok', 4000);
}

async function beatCut(music) {
  if (!music) return;
  if (!licence.gate('beat-sync', () => {}, { what: 'Beat-synced cutting' })) return;
  if (!S.beats) await findBeats(music);
  if (!S.beats) return;
  const report = await applyPlan(S.project, {
    steps: [{ op: 'beatCut', args: { every: 4 }, label: 'Cut on the beat' }],
  }, { beats: S.beats });
  if (report.failed.length) { toast(report.failed[0].why, 'bad', 5000); return; }
  actions.commit('Cut to the beat');
  toast(report.done[0]?.note || 'Cut to the beat', 'ok', 4000);
}

async function cutSilence() {
  if (!licence.gate('silence-cut', () => {}, { what: 'Silence removal' })) return;
  toast('Listening through the timeline…');
  const report = await applyPlan(S.project, {
    steps: [{ op: 'removeSilence', args: {}, label: 'Cut the silences' }],
  }, {});
  if (report.failed.length) { toast(report.failed[0].why, 'bad', 5000); return; }
  actions.commit('Cut silences');
  toast(report.done[0]?.note || 'Done', 'ok', 4200);
  void detectSilence;
}

function startMeter(host) {
  clearInterval(meterTimer);
  const bar = $('#a-meter', host);
  if (!bar) return;
  meterTimer = setInterval(() => {
    if (!document.body.contains(bar)) { clearInterval(meterTimer); return; }
    const level = engine.audio?.level?.() ?? 0;
    bar.style.width = `${Math.min(100, level * 100)}%`;
  }, 90);
}


/* ------------------------------------------------------------------ */
/* repair                                                              */
/* ------------------------------------------------------------------ */

/*
 * Repair is destructive to the decoded buffer but not to the file: the
 * original stays on disk untouched, and the repaired version is what the
 * timeline plays and exports. Undo puts the original back because the media
 * record is part of the project document.
 */
async function runRepair(host) {
  if (!licence.gate('audio-repair', () => {}, { what: 'Audio repair' })) return;

  const clip = [...S.sel]
    .map((id) => S.project.clips.find((c) => c.id === id))
    .find((c) => c && S.project.media.find((m) => m.id === c.mediaId)?.hasAudio);
  const media = clip
    ? S.project.media.find((m) => m.id === clip.mediaId)
    : S.project.media.find((m) => m.hasAudio);

  if (!media) { toast('Nothing with audio to repair', 'bad'); return; }

  const btn = $('#a-repair', host);
  const note = $('#a-repair-note', host);
  btn.disabled = true;
  btn.textContent = 'Listening…';

  try {
    const buffer = await decode(media);
    if (!buffer) throw new Error('that file could not be decoded');

    const { buffer: fixed, report } = await repair(buffer, {
      noise: Number($('#nr', host)?.value ?? host.querySelector('[data-k="nr"]')?.value ?? 1.2),
      hum: $('#a-hum', host)?.checked !== false,
      clicks: $('#a-click', host)?.checked !== false,
      level: $('#a-level', host)?.checked !== false,
      onProgress: ({ phase }) => { btn.textContent = `${phase}…`; },
    });

    // Swap the repaired audio in and rebuild the waveform so the timeline
    // shows what you will actually hear.
    replaceBuffer(media, fixed);
    media.peaks = peaks(fixed, 900);
    media.repaired = true;
    actions.commit('Repair audio');

    note.textContent = describeRepair(report);
    note.style.color = 'var(--ok)';
    toast(describeRepair(report), 'ok', 6000);
  } catch (err) {
    note.textContent = err.message;
    note.style.color = 'var(--bad)';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Repair audio';
  }
}

/** Put a repaired buffer where the decoder cache would have put the original. */
async function replaceBuffer(media, buffer) {
  const { attach } = await import('../engine/media.js');
  const { toWav } = await import('../engine/audio-render.js');
  const wav = toWav(buffer);
  // Written back as a WAV so every later decode — export included — gets the
  // repaired audio, rather than the cache and the file disagreeing.
  attach(media, { blob: wav, objectUrl: URL.createObjectURL(wav) });
  const store = await import('../store.js');
  await store.putMedia(media.hash, new File([wav], `${media.name}.repaired.wav`, { type: 'audio/wav' }),
    { repaired: true, name: media.name });
}
