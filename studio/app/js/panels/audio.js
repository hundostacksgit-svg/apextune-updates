/*
 * Audio tools: the master level, the music analysis, and the two operations
 * that save the most time — cutting silence and snapping cuts to the beat.
 */

import { $, esc, toast, slider } from '../ui.js';
import { S, actions, engine } from '../main.js';
import { decode, detectBeats, detectSilence, peaks } from '../engine/media.js';
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
