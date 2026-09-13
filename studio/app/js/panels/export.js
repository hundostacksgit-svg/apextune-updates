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
import { reframedCopy, PLATFORM_SET } from '../engine/reframe.js';
import {
  PRESETS, QUALITY, exportProject, download, safeName, pickMime, extensionFor, hasAudio,
} from '../engine/exporter.js';
import * as licence from '../licence.js';
import { canShareFile, toFile, shareFile, suggestFor } from '../engine/share.js';
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

    <!--
      One edit, every shape. The same cut rendered vertical, landscape, square
      and portrait in turn, each reframed to cover its canvas and centred on a
      tracked subject where there is one. Four files, one press, no re-editing.
    -->
    <label class="tp-toggle" style="display:flex;gap:9px;align-items:flex-start;margin:0 0 12px">
      <input type="checkbox" id="x-all">
      <span class="small">Export for every platform
        <span class="tiny muted" style="display:block">${PLATFORM_SET.map((p) => p.ratio).join(', ')} — four files from this one edit, each reframed to fit${S.project.motionTracks?.length ? ', centred on what you tracked' : ''}.</span></span>
    </label>

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
    if ($('#x-all', body)?.checked) { startBatch(quality, codecId, caps); return; }
    start(preset, quality, codecId, caps);
  });

  void $$;
}

function ratioValue(r) {
  const [a, b] = String(r).split(':').map(Number);
  return b ? a / b : 9 / 16;
}

/* ------------------------------------------------------------------ */

async function start(preset, quality, codecId, caps, { project = S.project, fileName = S.project.name, heading = null } = {}) {
  const overlay = $('#render-overlay');
  const fill = $('#ro-fill');
  const note = $('#ro-note');
  const title = $('#ro-title');
  const preview = $('#ro-preview');
  overlay.hidden = false;
  fill.style.width = '0%';
  title.textContent = heading || `Exporting — ${preset.name}`;
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
  if (picked && (!hasAudio(project) || caps.canMuxAudio)) {
    note.textContent = 'Checking the encoder…';
    const proved = await selfTest(picked.codec);
    if (proved) {
      running = exportWithCodecs(project, {
        preset, quality, codec: picked.codec,
        beats: S.beats,
        audioCodec: hasAudio(project) && caps.canMuxAudio ? 'mp4a.40.2' : null,
        onFirstFrame: (canvas) => {
          try { preview.srcObject = canvas.captureStream(12); preview.play().catch(() => {}); }
          catch { /* one stream per canvas on some builds */ }
        },
        onProgress: progress,
      });
      const done = finishWith(running, overlay, preview, wantsProRes ? codecId : null, fileName);
      $('#ro-cancel').onclick = () => { running?.cancel(); note.textContent = 'Stopping…'; };
      return done;
    }
    toast('The fast encoder did not check out on this device — using the reliable path instead', '', 5000);
  }

  // The desktop shell holds its weekly update check while this runs.
  window.omnidxDesktop?.rendering?.(true);
  running = exportProject(project, {
    preset,
    quality,
    beats: S.beats,
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

  return finishWith(running, overlay, preview, wantsProRes ? codecId : null, fileName);
}

/*
 * Every platform from one edit.
 *
 * The same cut, rendered vertical, landscape, square and portrait in turn,
 * each from a reframed copy — the live project is never touched — at the
 * 1080-class preset for that shape and the project's own frame rate. Files
 * are named by shape so they are told apart in a folder. Cancelling stops
 * the one being rendered and the ones after it; what is already saved
 * stays saved.
 */
let batchStopped = false;
async function startBatch(quality, codecId, caps) {
  batchStopped = false;
  const fps = S.project.settings.fps || 30;
  const base = S.project.name;
  let n = 0;
  for (const { ratio, label, suffix } of PLATFORM_SET) {
    if (batchStopped) break;
    n++;
    const target = PRESETS.find((p) => p.tier === 'free' && Math.abs((p.w / p.h) - ratioValue(ratio)) < 0.02 && Math.max(p.w, p.h) >= 1080) || PRESETS[0];
    const preset = { ...target, fps, name: label };
    let copy;
    try { copy = reframedCopy(S.project, ratio); } catch (err) { toast(err.message, 'bad'); continue; }
    // eslint-disable-next-line no-await-in-loop -- one render at a time is the point
    const out = await start(preset, quality, codecId, caps, {
      project: copy, fileName: `${base} — ${suffix}`, heading: `Exporting ${n} of ${PLATFORM_SET.length} — ${label}`,
    });
    if (!out || out.partial || out.failed) batchStopped = true;
  }
  if (!batchStopped) toast(`All ${PLATFORM_SET.length} shapes saved`, 'ok', 5000);
}

/* Resolves with what happened — { partial, failed } — once the file is saved, so a batch can go on to the next. */
function finishWith(handle, overlay, preview, proResFormat, fileName = S.project.name) {
  return handle.promise.then(async (out) => {
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

    const name = safeName(fileName, ext);
    // On the desktop this is a real Save dialog; in a browser it's a download.
    if (!await saveBytes(blob, name)) download(blob, name);
    if (!out.partial && fileName === S.project.name) offerToPost(blob, name);
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
      // Count it; the third finished export earns one quiet ask for a rating.
      import('../rate.js').then((m) => m.exported()).catch(() => {});
      // And once, the offer to make this an app: the export is the moment
      // somebody has just seen what it does.
      import('../install.js').then((m) => m.maybeNudge('export')).catch(() => {});
    }
    return { partial: Boolean(out.partial), failed: false, name };
  }).catch((err) => {
    overlay.hidden = true;
    modal(`<h3>Export failed</h3>
      <p>${esc(err.message)}</p>
      <div class="btn-row" style="justify-content:flex-end">
        <button class="btn btn-primary" data-x="ok">OK</button></div>`);
    $('[data-x="ok"]')?.addEventListener('click', closeModal);
    return { partial: false, failed: true };
  }).finally(() => { running = null; window.omnidxDesktop?.rendering?.(false); });
}

/* ------------------------------------------------------------------ */
/* where it goes next                                                  */
/* ------------------------------------------------------------------ */
/*
 * The moment after an export finishes is the one moment someone definitely
 * wants to post the thing, and it is the moment every editor drops them back
 * into a file manager instead.
 *
 * On a phone this really is one press: the system share sheet takes the file
 * and lists every app installed, TikTok and YouTube among them, and the video
 * never leaves the device on its way there. On a desktop the browser has no
 * such sheet, so the file is already saved and each platform's own upload page
 * is one click — which is where a desktop upload happens anyway.
 *
 * Posting *directly* — this app holding the account and pushing the file — is
 * not offered, because it cannot be done honestly from a page with no server:
 * it needs OAuth secrets and a reviewed developer application per platform. The
 * dialog says so rather than pretending.
 */
function offerToPost(blob, name) {
  const { width, height } = S.project.settings;
  const seconds = duration(S.project);
  const file = toFile(blob, name);
  const canShare = canShareFile(file);
  const picks = suggestFor(width, height, seconds);

  modal(`
    <h3>Saved. Where is it going?</h3>
    <p class="small" style="margin-top:0">
      <span class="mono">${esc(name)}</span> — ${width}×${height},
      ${seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`}
    </p>

    ${canShare ? `
      <button class="btn btn-primary btn-lg btn-full" id="x-share">
        Share to an app on this device</button>
      <p class="tiny muted" style="margin:8px 0 16px">
        Opens your share sheet with the video attached — TikTok, YouTube, Instagram, Messages,
        anything installed. It goes straight from this device to that app.
      </p>` : `
      <div class="note tiny" style="margin-top:0">
        Your browser cannot hand a file to another app, so the video has been saved instead.
        Open one of these and drop it in. On a phone, the same export offers a one-press share.
      </div>`}

    <div class="post-links">
      ${picks.map((p) => `
        <a class="post-link" href="${esc(p.url)}" target="_blank" rel="noopener">
          <span class="pl-ico">${p.icon}</span>
          <span class="pl-txt"><b>${esc(p.name)}</b>
            <span>${esc(p.warnings[0] || p.note)}</span></span>
          <span class="pl-go">↗</span>
        </a>`).join('')}
    </div>

    <p class="tiny muted" style="margin:14px 0 0">
      We do not post on your behalf and never ask for your accounts. Doing that would mean
      holding your login and running your video through our server — neither of which happens here.
    </p>
    <div class="btn-row" style="justify-content:flex-end">
      <button class="btn btn-ghost" data-x="ok">Done</button>
    </div>`);

  $('[data-x="ok"]')?.addEventListener('click', closeModal);
  $('#x-share')?.addEventListener('click', async () => {
    try {
      const result = await shareFile(file, { title: S.project.name, text: 'Made with OmniDx Studio' });
      if (result === 'shared') { toast('Shared', 'ok'); closeModal(); }
      // A cancel is someone changing their mind, not a failure — say nothing.
    } catch (err) {
      toast(`Could not share — ${err.message}`, 'bad', 5000);
    }
  });
}

/** Listed in the command palette. */
export const mount = openExport;
