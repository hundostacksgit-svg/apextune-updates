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
import { saveBytes } from '../desktop.js';

let running = null;

export function openExport() {
  const total = duration(S.project);
  if (total <= 0.05) { toast('Put something on the timeline first'); return; }

  const ratio = S.project.settings.ratio;
  const suggested = PRESETS.find((p) => Math.abs((p.w / p.h) - ratioValue(ratio)) < 0.02) || PRESETS[0];
  const mime = pickMime();

  const body = modal(`
    <h3>Export</h3>
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

    <div class="note info" id="x-note"></div>

    <div class="btn-row" style="justify-content:flex-end">
      <button class="btn btn-ghost" id="x-cancel">Cancel</button>
      <button class="btn btn-primary" id="x-go">Export</button>
    </div>`);

  const paintNote = () => {
    const preset = PRESETS.find((p) => p.id === $('#x-preset', body).value);
    const realtime = hasAudio(S.project);
    $('#x-note', body).innerHTML = `
      <b>${realtime ? 'About ' + dur(total) : 'Usually faster than ' + dur(total)}.</b>
      ${realtime
        ? 'Video with sound is captured as it plays, which is the only way a browser can mux audio and picture together. Keep this tab in front while it runs.'
        : 'This timeline is silent, so frames are rendered one at a time — nothing is dropped if the machine hiccups.'}
      <br><span class="tiny muted">Output: ${esc(mime || 'unavailable')} ·
      ${preset.w}×${preset.h} @${preset.fps}fps · ${esc(preset.note)}</span>`;
  };
  paintNote();
  $('#x-preset', body).addEventListener('change', paintNote);

  $('#x-cancel', body).addEventListener('click', closeModal);
  $('#x-go', body).addEventListener('click', () => {
    const preset = PRESETS.find((p) => p.id === $('#x-preset', body).value);
    const quality = $('#x-quality', body).value;
    if (preset.tier !== 'free' && !licence.can('export-4k')) {
      licence.upgradePrompt('export-4k', `${preset.name} export`);
      return;
    }
    closeModal();
    start(preset, quality);
  });

  void $$;
}

function ratioValue(r) {
  const [a, b] = String(r).split(':').map(Number);
  return b ? a / b : 9 / 16;
}

/* ------------------------------------------------------------------ */

function start(preset, quality) {
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
    onProgress: ({ done, total, phase, mode }) => {
      const pct = Math.min(100, (done / total) * 100);
      fill.style.width = `${pct.toFixed(1)}%`;
      const elapsed = (performance.now() - startedAt) / 1000;
      const left = pct > 2 ? (elapsed / pct) * (100 - pct) : null;
      note.textContent = phase === 'finishing'
        ? 'Writing the file…'
        : `${pct.toFixed(0)}% · ${mode === 'realtime' ? 'recording' : 'rendering'}${
          left ? ` · about ${dur(left)} left` : ''}`;
    },
  });

  $('#ro-cancel').onclick = () => {
    running?.cancel();
    note.textContent = 'Stopping — you will still get everything rendered so far…';
  };

  running.promise.then(async (out) => {
    overlay.hidden = true;
    try { preview.srcObject = null; } catch { /* already cleared */ }
    const name = safeName(S.project.name, extensionFor(out.mime));
    // On the desktop this is a real Save dialog; in a browser it's a download.
    if (!await saveBytes(out.blob, name)) download(out.blob, name);
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
