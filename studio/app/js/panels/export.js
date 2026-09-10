/*
 * The export dialog.
 *
 * Presets are named after where the video is going, not after a resolution,
 * because "1080×1920 H.264" is not what anyone is thinking when they finish a
 * TikTok. The estimate underneath is honest about how long it will take and
 * why — a realtime capture of a three-minute video takes three minutes and
 * pretending otherwise just makes people think it has hung.
 */

import { $, $$, esc, toast, dur, modal, closeModal } from '../ui.js';
import { S } from '../main.js';
import { engine } from '../main.js';
import { duration } from '../engine/project.js';
import {
  PRESETS, QUALITY, exportProject, download, safeName, pickMime, extensionFor, hasAudio,
} from '../engine/exporter.js';
import * as licence from '../licence.js';
import { saveBytes, isDesktop, proResAvailable, transcode } from '../desktop.js';
import {
  available as codecsAvailable, probe as probeCodecs, selfTest, exportWithCodecs,
} from '../engine/exporter-wc.js';

let running = null;

export function openExport() {
  const total = duration(S.project);
  if (total <= 0.05) { toast('Put something on the timeline first'); return; }

  const ratio = S.project.settings.ratio;
  const suggested = PRESETS.find((p) => Math.abs((p.w / p.h) - ratioValue(ratio)) < 0.02) || PRESETS[0];
  const mime = pickMime();

  const body = modal(`
    <h3>Export</h3>
    <div id="x-loading" class="tiny muted">Checking what this device can encode…</div>
    <p class="small">${esc(S.project.name)} · ${dur(total)} · ${S.project.clips.length} clips</p>

    <div class="field">
      <label for="x-preset">Where is this going?</label>
      <select class="input" id="x-preset">
        ${PRESETS.map((p) => {
          const locked = p.tier !== 'free' && !licence.can('export-4k');
          return `<option value="${esc(p.id)}" ${p.id === suggested.id ? 'selected' : ''}
            data-tier="${esc(p.tier)}">${esc(p.name)} — ${p.w}×${p.h} @${p.fps}${locked ? ' (Creator)' : ''}</option>`;
        }).join('')}
      </select>
    </div>

    <div class="field">
      <label for="x-quality">Quality</label>
      <select class="input" id="x-quality">
        ${Object.entries(QUALITY).map(([id, q]) =>
          `<option value="${esc(id)}" ${id === 'medium' ? 'selected' : ''}>${esc(q.label)}</option>`).join('')}
      </select>
    </div>

    <div class="field" id="x-codec-field" hidden>
      <label for="x-codec">Format</label>
      <select class="input" id="x-codec"></select>
      <p class="tiny muted" id="x-codec-note" style="margin:6px 0 0"></p>
    </div>

    <div class="note info" id="x-note"></div>

    <div class="btn-row" style="justify-content:flex-end">
      <button class="btn btn-ghost" id="x-cancel">Cancel</button>
      <button class="btn btn-primary" id="x-go">Export</button>
    </div>`);

  /*
   * What this machine can encode is a question, not an assumption. Chrome has
   * H.264 and AAC; a Chromium without proprietary codecs does not; HEVC
   * depends on the hardware. Asking takes a moment, so the dialog opens first
   * and fills this in.
   */
  let caps = { video: [], audio: [], canMuxAudio: false };
  let fast = null;              // the codec the fast path will use, if any

  (async () => {
    const preset0 = PRESETS.find((p) => p.id === $('#x-preset', body).value) || suggested;
    caps = await probeCodecs({ width: preset0.w, height: preset0.h, framerate: preset0.fps });

    const options = [];
    for (const v of caps.video) {
      const locked = (v.id === 'hevc' || v.id === 'hevc10') && !licence.can('export-4k');
      options.push(`<option value="${esc(v.id)}" ${locked ? 'disabled' : ''}>${esc(v.label)}${
        locked ? ' — Creator' : ''}</option>`);
    }
    if (isDesktop() && proResAvailable()) {
      options.push('<option value="prores">Apple ProRes 422 — desktop only</option>');
      options.push('<option value="dnxhr">Avid DNxHR — desktop only</option>');
    }
    options.push('<option value="webm">WebM — always works</option>');

    const field = $('#x-codec-field', body);
    if (field) {
      $('#x-codec', body).innerHTML = options.join('');
      field.hidden = options.length <= 1;
    }
    $('#x-loading', body)?.remove();
    paintNote();
    $('#x-codec', body)?.addEventListener('change', paintNote);
  })();

  const chosenCodec = () => {
    const id = $('#x-codec', body)?.value;
    return caps.video.find((v) => v.id === id) || null;
  };

  const paintNote = () => {
    const preset = PRESETS.find((p) => p.id === $('#x-preset', body).value);
    const id = $('#x-codec', body)?.value;
    const picked = chosenCodec();
    const realtime = !picked && hasAudio(S.project);
    fast = picked;

    let how;
    if (id === 'prores' || id === 'dnxhr') {
      how = `<b>Rendered here, then converted by ffmpeg in the desktop app.</b> `
        + `${id === 'prores' ? 'ProRes' : 'DNxHR'} files are large — think a gigabyte a minute — `
        + 'and that is the point: they are for handing to another editor or a colourist, not for uploading.';
    } else if (picked) {
      how = `<b>Usually faster than ${dur(total)}.</b> Frames are encoded one at a time, so nothing `
        + 'is dropped, the tab can go in the background, and the result is frame-exact. '
        + esc(picked.note);
      if (hasAudio(S.project) && !caps.canMuxAudio) {
        how += '<br><b>This browser has no AAC encoder</b>, so the sound would be dropped on this path — '
          + 'pick WebM, or use Chrome.';
      }
    } else {
      how = `<b>About ${dur(total)}.</b> `
        + (realtime
          ? 'This browser has no encoder we can drive directly, so the video is captured as it plays. Keep this tab in front while it runs.'
          : 'This timeline is silent, so frames are rendered one at a time.');
    }

    $('#x-note', body).innerHTML = `${how}
      <br><span class="tiny muted">${preset.w}×${preset.h} @${preset.fps}fps · ${esc(preset.note)}</span>`;
  };
  paintNote();
  $('#x-preset', body).addEventListener('change', paintNote);

  $('#x-cancel', body).addEventListener('click', closeModal);
  $('#x-go', body).addEventListener('click', async () => {
    const preset = PRESETS.find((p) => p.id === $('#x-preset', body).value);
    const quality = $('#x-quality', body).value;
    const codecId = $('#x-codec', body)?.value;
    if (preset.tier !== 'free' && !licence.can('export-4k')) {
      licence.upgradePrompt('export-4k', `${preset.name} export`);
      return;
    }
    if ((codecId === 'hevc' || codecId === 'hevc10') && !licence.can('export-4k')) {
      licence.upgradePrompt('export-4k', 'H.265 export');
      return;
    }
    closeModal();
    start(preset, quality, codecId, caps);
  });

  void $$;
}

function ratioValue(r) {
  const [a, b] = String(r).split(':').map(Number);
  return b ? a / b : 9 / 16;
}

/* ------------------------------------------------------------------ */

async function start(preset, quality, codecId, caps) {
  const overlay = $('#render-overlay');
  const fill = $('#ro-fill');
  const note = $('#ro-note');
  const title = $('#ro-title');
  const preview = $('#ro-preview');
  overlay.hidden = false;
  fill.style.width = '0%';
  title.textContent = `Exporting — ${preset.name}`;
  note.textContent = 'Starting…';

  const startedAt = performance.now();
  const wantsProRes = codecId === 'prores' || codecId === 'dnxhr';
  const picked = wantsProRes ? null : caps?.video?.find((v) => v.id === codecId);

  const progress = ({ done, total, phase, mode }) => {
    const pct = Math.min(100, (done / total) * 100);
    fill.style.width = `${pct.toFixed(1)}%`;
    const elapsed = (performance.now() - startedAt) / 1000;
    const left = pct > 2 ? (elapsed / pct) * (100 - pct) : null;
    note.textContent = phase === 'finishing' ? 'Writing the file…'
      : phase === 'mixing audio' ? 'Mixing the audio…'
      : phase === 'encoding audio' ? 'Encoding the audio…'
      : `${pct.toFixed(0)}% · ${mode === 'realtime' ? 'recording' : 'rendering'}${
        left ? ` · about ${dur(left)} left` : ''}`;
  };

  /*
   * Take the fast path only once it has proved it produces a file a player
   * will open. Someone spending ten minutes on a render that turns out to be a
   * dead file is the worst outcome available here, so the muxer earns its
   * place rather than being trusted.
   */
  if (picked && (!hasAudio(S.project) || caps.canMuxAudio)) {
    note.textContent = 'Checking the encoder…';
    const proved = await selfTest(picked.codec);
    if (proved) {
      running = exportWithCodecs(S.project, {
        preset, quality, codec: picked.codec,
        audioCodec: hasAudio(S.project) && caps.canMuxAudio ? 'mp4a.40.2' : null,
        onFirstFrame: (canvas) => {
          try { preview.srcObject = canvas.captureStream(12); preview.play().catch(() => {}); }
          catch { /* one stream per canvas on some builds */ }
        },
        onProgress: progress,
      });
      finishWith(running, overlay, preview, wantsProRes ? codecId : null);
      $('#ro-cancel').onclick = () => { running?.cancel(); note.textContent = 'Stopping…'; };
      return;
    }
    toast('The fast encoder did not check out on this device — using the reliable path instead', '', 5000);
  }

  running = exportProject(S.project, {
    preset,
    quality,
    audioEngine: engine.audio,
    onFirstFrame: (canvas) => {
      // Show the frames going by. It is the difference between a progress bar
      // and knowing it is actually working.
      try { preview.srcObject = canvas.captureStream(12); preview.play().catch(() => {}); }
      catch { /* not every browser will hand back a second stream */ }
    },
    onProgress: progress,
  });

  $('#ro-cancel').onclick = () => {
    running?.cancel();
    note.textContent = 'Stopping — you will still get everything rendered so far…';
  };

  finishWith(running, overlay, preview, wantsProRes ? codecId : null);
}

function finishWith(handle, overlay, preview, proResFormat) {
  handle.promise.then(async (out) => {
    overlay.hidden = true;
    try { preview.srcObject = null; } catch { /* already cleared */ }
    let blob = out.blob;
    let ext = extensionFor(out.mime);

    // ProRes and DNxHR are not things a browser can encode. The desktop build
    // has ffmpeg, so the render happens here and the conversion happens there.
    if (proResFormat) {
      try {
        const converted = await transcode(blob, proResFormat);
        if (converted) { blob = converted.blob; ext = converted.ext; }
      } catch (err) {
        toast(`Kept the standard file — ${err.message}`, '', 6000);
      }
    }

    const name = safeName(S.project.name, ext);
    // On the desktop this is a real Save dialog; in a browser it's a download.
    if (!await saveBytes(blob, name)) download(blob, name);
    if (out.partial) {
      modal(`<h3>Export stopped early</h3>
        <p>It stopped because ${esc(out.reason || 'it was cancelled')}. The part that had already
           rendered has been saved as <span class="mono">${esc(name)}</span> and it plays normally —
           nothing was thrown away.</p>
        <div class="btn-row" style="justify-content:flex-end">
          <button class="btn btn-primary" data-x="ok">OK</button></div>`);
      $('[data-x="ok"]')?.addEventListener('click', closeModal);
    } else {
      toast(`Saved ${name}`, 'ok', 5000);
    }
  }).catch((err) => {
    overlay.hidden = true;
    modal(`<h3>Export failed</h3>
      <p>${esc(err.message)}</p>
      <div class="btn-row" style="justify-content:flex-end">
        <button class="btn btn-primary" data-x="ok">OK</button></div>`);
    $('[data-x="ok"]')?.addEventListener('click', closeModal);
  }).finally(() => { running = null; });
}

/** Listed in the command palette. */
export const mount = openExport;
