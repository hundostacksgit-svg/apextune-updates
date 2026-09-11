/*
 * Audio tools: the master level, the music analysis, the creative filters, and
 * the two operations that save the most time — cutting silence and snapping
 * cuts to the beat.
 */

import { $, $$, esc, toast, slider } from '../ui.js';
import { MeterState, drawMeter, gainLabel, gainToFader, faderToGain } from '../engine/meters.js';
import { S, actions, engine } from '../main.js';
import { decode, detectBeats, detectSilence, peaks } from '../engine/media.js';
import { repair, describeRepair, detectHum } from '../engine/audio-repair.js';
import { AUDIO_FX, makeAudioFx } from '../engine/audio-fx.js';
import { clipById } from '../engine/project.js';
import { applyPlan } from '../ai/apply.js';
import * as licence from '../licence.js';

let meterTimer = null;

export function mount(host) {
  const music = S.project.media.find((m) => m.kind === 'audio');
  const voice = S.project.media.filter((m) => m.kind !== 'audio' && m.hasAudio);

  host.innerHTML = `
    <div class="panel-h"><h2>Audio</h2></div>
    <p class="panel-sub">Levels, music and the two tools that save the most time.</p>

    <!--
      A mixer, not a volume slider.

      The question an editor has about audio is never "how loud is it" on a
      scale of nothing to full — it is "am I going to clip" and "is this loud
      enough to survive what the platform does to it". Both are questions about
      decibels, which is why the meter is in dB with the zones marked, and why
      the fader reads out in dB with unity where a desk puts it.
    -->
    <div class="group mixer">
      <div class="mixer-strip">
        <div class="ms-name">Master</div>
        <canvas id="a-meter-cv" class="ms-meter" width="120" height="360"
          aria-label="Master level meter"></canvas>
        <input type="range" class="ms-fader" id="a-master-fader"
          min="0" max="1" step="0.001" orient="vertical"
          value="${gainToFader(engine.audio?.masterVolume ?? 1)}"
          aria-label="Master fader">
        <div class="ms-db" id="a-master-db">${gainLabel(engine.audio?.masterVolume ?? 1)} dB</div>
      </div>
      <div class="mixer-help">
        <p class="tiny muted" style="margin:0 0 8px">
          <b>Green to −18</b> is comfortable. <b>Amber to −6</b> is loud but fine.
          <b>Red</b> is asking the encoder to make a decision you will not like.
        </p>
        <p class="tiny muted" style="margin:0">
          The thin line that lags behind is the peak hold — a clip lasts one sample
          and you would never catch it otherwise. If the strip across the top turns
          red, something clipped in the last couple of seconds.
        </p>
        <div class="btn-row" style="margin-top:10px">
          <button class="btn btn-sm btn-ghost" id="a-master-reset">Back to 0 dB</button>
        </div>
      </div>
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

    ${fxSection()}

    <div class="group" style="padding:12px">
      <b style="font-size:12.5px">Ducking</b>
      <p class="tiny muted" style="margin:4px 0 10px">
        Turn a track's <span class="mono">⤓</span> button on in the timeline headers and it drops
        under any voice automatically. No keyframes needed.
      </p>
    </div>`;

  // Guarded: the panel host outlives its contents, so an unguarded listener
  // here would be added again on every re-render and fire N times per drag.
  if (!host.dataset.masterWired) {
    host.dataset.masterWired = '1';
    host.addEventListener('input', (e) => {
      if (e.target.dataset.k !== 'master') return;
      const v = Number(e.target.value);
      engine.audio?.setMasterVolume(v);
      const label = host.querySelector('[data-val="master"]');
      if (label) label.textContent = `${Math.round(v * 100)}%`;
    });
  }

  wireFx(host);

  $('#a-beats', host)?.addEventListener('click', () => findBeats(music));
  $('#a-beatcut', host)?.addEventListener('click', () => beatCut(music));
  $('#a-silence', host)?.addEventListener('click', () => cutSilence());
  $('#a-repair', host)?.addEventListener('click', () => runRepair(host));

  startMeter(host);
}

/* ------------------------------------------------------------------ */
/* creative filters                                                    */
/* ------------------------------------------------------------------ */
/*
 * One filter per clip, applied live on playback and baked into the export by
 * the same module — see engine/audio-fx.js. The panel edits the selected
 * clips; with nothing selected it says so rather than silently doing nothing,
 * which is the failure mode that makes people think a feature is broken.
 */

/** The clips this panel would act on: selected, and carrying sound. */
function fxTargets() {
  return [...S.sel]
    .map((id) => clipById(S.project, id))
    .filter((c) => c && c.kind !== 'title' && c.kind !== 'sticker');
}

/** The filter shown in the panel — the first selected clip's, if they agree. */
function currentFx() {
  const clips = fxTargets();
  if (!clips.length) return null;
  const first = clips[0].audioFx;
  return clips.every((c) => c.audioFx?.id === first?.id) ? first : null;
}

function fxSection() {
  const clips = fxTargets();
  const fx = currentFx();
  const spec = fx && AUDIO_FX[fx.id];
  const canPro = licence.can('audio-fx-pro');

  const groups = {};
  for (const [id, def] of Object.entries(AUDIO_FX)) {
    (groups[def.group] ||= []).push([id, def]);
  }

  const chips = Object.entries(groups).map(([group, list]) => `
    <div class="fx-group-h">${esc(group)}</div>
    <div class="fx-chips">${list.map(([id, def]) => `
      <button class="fx-chip ${fx?.id === id ? 'on' : ''} ${def.pro && !canPro ? 'locked' : ''}"
              data-fx="${esc(id)}" title="${esc(def.blurb)}">
        ${esc(def.name)}${def.pro && !canPro ? '<i>Pro</i>' : ''}
      </button>`).join('')}</div>`).join('');

  return `
    <details class="group" ${fx ? 'open' : ''} id="a-fx">
      <summary>Audio filters</summary>
      <div class="gbody">
        <p class="tiny muted" style="margin:0 0 10px">
          Underwater, telephone, cathedral, robot — seventeen of them. They play live while
          you scrub and are rendered into the export, not stuck on afterwards.
        </p>

        ${clips.length ? '' : `<div class="note tiny" style="margin-bottom:10px">
          <b>Select a clip first.</b> Filters belong to a clip, so the same timeline can have a
          radio voice in one shot and a normal one in the next.</div>`}

        ${chips}

        ${spec ? `
          <div class="fx-active">
            <b style="font-size:12.5px">${esc(spec.name)}</b>
            <p class="tiny muted" style="margin:3px 0 9px">${esc(spec.blurb)}</p>
            ${slider({ key: 'fx-mix', label: 'Amount', value: fx.mix ?? 1,
              min: 0, max: 1, step: 0.02, fmt: (v) => `${Math.round(v * 100)}%` })}
            ${(spec.params || []).map((prm) => slider({
              key: `fxp-${prm.key}`, label: prm.label,
              value: fx.params?.[prm.key] ?? spec.defaults[prm.key],
              min: prm.min, max: prm.max, step: prm.step,
              fmt: (v) => (prm.step >= 1 ? `${v > 0 ? '+' : ''}${Math.round(v)}` : `${Math.round(v * 100)}%`),
            })).join('')}
            ${spec.alsoSetsSpeed ? `<p class="tiny muted" style="margin:8px 0 0">
              This look also sets the clip's speed to ${Math.round(spec.alsoSetsSpeed * 100)}% so
              the picture slows with the sound. Change it in the inspector if you'd rather it
              didn't.</p>` : ''}
            <button class="btn btn-sm btn-full" id="a-fx-off" style="margin-top:10px">Remove the filter</button>
          </div>` : ''}
      </div>
    </details>`;
}

function wireFx(host) {
  $$('[data-fx]', host).forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.fx;
    const spec = AUDIO_FX[id];
    if (spec.pro && !licence.gate('audio-fx-pro', () => {}, { what: `The ${spec.name} filter` })) return;
    if (!fxTargets().length) {
      toast('Select a clip on the timeline first', 'bad');
      return;
    }
    actions.patchSelected((clip) => {
      clip.audioFx = clip.audioFx?.id === id ? null : makeAudioFx(id);
      // Two of the looks are half tempo change. Setting only the audio half
      // would put the sound out of step with the picture, which is not the
      // effect anybody means when they ask for "slowed and reverb".
      if (clip.audioFx && spec.alsoSetsSpeed) {
        clip.speed = spec.alsoSetsSpeed;
        clip.speedKeys = null;
      }
    }, `Audio filter: ${spec.name}`);
    // patchSelected commits, and committing re-mounts this panel — so there is
    // deliberately no repaint here.
  }));

  $('#a-fx-off', host)?.addEventListener('click', () => {
    actions.patchSelected((clip) => { clip.audioFx = null; }, 'Remove audio filter');
  });

  /*
   * Filter sliders write straight to the clip and commit only when the drag
   * ends.
   *
   * Committing on every `input` would push a history entry per pixel and, worse,
   * re-render this panel underneath the slider being dragged — which drops the
   * drag on the floor. So: `input` mutates and relabels, `change` (mouse up,
   * or a keyboard arrow) is the one that becomes an undo step.
   */
  if (host.dataset.fxWired) return;
  host.dataset.fxWired = '1';

  const fxKey = (e) => {
    const key = e.target?.dataset?.k || '';
    return (key === 'fx-mix' || key.startsWith('fxp-')) ? key : null;
  };

  host.addEventListener('input', (e) => {
    const key = fxKey(e);
    if (!key) return;
    const v = Number(e.target.value);
    for (const clip of fxTargets()) {
      if (!clip.audioFx) continue;
      if (key === 'fx-mix') clip.audioFx.mix = v;
      else clip.audioFx.params = { ...clip.audioFx.params, [key.slice(4)]: v };
    }
    const spec = AUDIO_FX[currentFx()?.id];
    const prm = spec?.params?.find((x) => x.key === key.slice(4));
    const label = host.querySelector(`[data-val="${CSS.escape(key)}"]`);
    if (label) {
      label.textContent = (key === 'fx-mix' || !prm || prm.step < 1)
        ? `${Math.round(v * 100)}%`
        : `${v > 0 ? '+' : ''}${Math.round(v)}`;
    }
    // Heard immediately while the transport is running; otherwise on the next
    // play or seek, which is when there is anything to hear.
    engine.audio?.sync(S.project, S.time, S.playing);
  });

  host.addEventListener('change', (e) => {
    if (!fxKey(e)) return;
    actions.commit('Adjust audio filter', 'audiofx');
  });
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

/*
 * The meter runs on animation frames, not a timer.
 *
 * A peak lasts one sample. A meter sampled every ninetieth of a second misses
 * most of them, and the whole point of the thing is catching the transient
 * that will clip the export — so it reads as often as the browser will paint,
 * and stops entirely when the panel is gone rather than running forever behind
 * a closed sheet.
 */
function startMeter(host) {
  cancelAnimationFrame(meterTimer);
  const cv = $('#a-meter-cv', host);
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const state = new MeterState();

  const tick = () => {
    if (!document.body.contains(cv)) return;
    state.push(engine.audio?.level?.() ?? 0);
    drawMeter(ctx, 0, 0, cv.width, cv.height, [state]);
    meterTimer = requestAnimationFrame(tick);
  };
  tick();

  const fader = $('#a-master-fader', host);
  const readout = $('#a-master-db', host);
  const applyFader = (pos) => {
    const gain = faderToGain(pos);
    engine.audio?.setMasterVolume?.(gain);
    if (readout) readout.textContent = `${gainLabel(gain)} dB`;
  };
  fader?.addEventListener('input', (e) => applyFader(Number(e.target.value)));
  // Double-click a fader to return it to unity. Every desk does this, and
  // hunting for exactly 0.0 dB by dragging is miserable.
  fader?.addEventListener('dblclick', () => {
    fader.value = String(gainToFader(1));
    applyFader(gainToFader(1));
  });
  $('#a-master-reset', host)?.addEventListener('click', () => {
    if (!fader) return;
    fader.value = String(gainToFader(1));
    applyFader(gainToFader(1));
  });
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
