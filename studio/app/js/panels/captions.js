/*
 * Captions.
 *
 * Two halves to this problem: knowing *when* someone speaks, and knowing
 * *what* they said. The first is a signal-processing job we can do on the
 * device, and it is the tedious half. The second needs speech recognition,
 * which no browser offers for a file — so with no key configured we do the
 * timing and hand you a list to type into, one box per phrase, each one
 * clickable to hear it. With a key configured, both halves are automatic.
 *
 * Calling that "auto-captions" without the caveat would be a lie, so the panel
 * says which mode it is in.
 */

import { $, $$, esc, toast, tc } from '../ui.js';
import { S, actions } from '../main.js';
import { applyPlan } from '../ai/apply.js';
import { CAPTION_STYLES } from '../engine/titles.js';
import { available as cloudAvailable } from '../ai/remote.js';
import * as licence from '../licence.js';

export function mount(host) {
  const cues = S.project.captions || [];
  const hasVoice = S.project.clips.some((c) => {
    const m = S.project.media.find((x) => x.id === c.mediaId);
    return m?.hasAudio;
  });

  host.innerHTML = `
    <div class="panel-h">
      <h2>Captions</h2>
      <span class="tiny muted">${cues.length || 'no'} line${cues.length === 1 ? '' : 's'}</span>
    </div>
    <p class="panel-sub">
      ${cloudAvailable()
        ? 'Transcribed from your audio and timed to it.'
        : 'Timings are found automatically. You type the words — one box per phrase.'}
    </p>

    <div class="field">
      <label for="cap-style">Style</label>
      <select class="input" id="cap-style">
        ${Object.entries(CAPTION_STYLES).map(([id, s]) =>
          `<option value="${esc(id)}" ${cues[0]?.style === id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
      </select>
    </div>

    <div class="btn-row" style="margin-top:0">
      <button class="btn btn-primary btn-full" id="cap-make" ${hasVoice ? '' : 'disabled'}>
        ${cloudAvailable() ? 'Transcribe and caption' : 'Find the speech and lay out captions'}
      </button>
    </div>
    ${hasVoice ? '' : '<p class="tiny muted" style="margin-top:9px">Nothing on the timeline has an audio track yet.</p>'}

    <div id="cap-list" style="margin-top:16px">
      ${cues.length ? cues.map((c, i) => `
        <div class="group" style="padding:9px 10px;margin-bottom:7px">
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
            <button class="btn btn-sm btn-ghost" data-goto="${i}" title="Jump here"
              style="padding:3px 8px">${esc(tc(c.start, S.project.settings.fps).slice(3, 11))}</button>
            <span class="tiny muted" style="flex:1">${(c.end - c.start).toFixed(1)}s</span>
            <button class="btn btn-sm btn-ghost" data-del="${i}" style="padding:3px 8px">✕</button>
          </div>
          <input class="input" data-cue="${i}" value="${esc(c.text)}"
            placeholder="Type what's said here…">
        </div>`).join('')
        : '<p class="tiny muted">No captions yet.</p>'}
    </div>

    ${cues.length ? `<div class="btn-row">
      <button class="btn btn-sm btn-ghost" id="cap-srt">Export .srt</button>
      <button class="btn btn-sm btn-ghost" id="cap-clear">Clear all</button>
    </div>` : ''}`;

  $('#cap-make', host)?.addEventListener('click', () => generate(host));

  $('#cap-style', host).addEventListener('change', (e) => {
    for (const c of S.project.captions) c.style = e.target.value;
    actions.commit('Caption style');
  });

  $('#cap-list', host).addEventListener('input', (e) => {
    const i = e.target.dataset.cue;
    if (i === undefined) return;
    S.project.captions[Number(i)].text = e.target.value;
    actions.commit('Edit caption', `cap:${i}`);
  });

  $('#cap-list', host).addEventListener('click', (e) => {
    const goto = e.target.closest('[data-goto]');
    if (goto) { actions.seek(S.project.captions[Number(goto.dataset.goto)].start); return; }
    const del = e.target.closest('[data-del]');
    if (del) {
      S.project.captions.splice(Number(del.dataset.del), 1);
      actions.commit('Delete caption');
    }
  });

  $('#cap-srt', host)?.addEventListener('click', exportSrt);
  $('#cap-clear', host)?.addEventListener('click', () => {
    S.project.captions = [];
    actions.commit('Clear captions');
  });

  void $$;
}

async function generate(host) {
  if (!licence.gate('ai-captions', () => {}, { what: 'Auto-captions' })) return;
  const style = $('#cap-style', host).value;
  const btn = $('#cap-make', host);
  btn.disabled = true;
  btn.textContent = 'Listening…';
  try {
    const report = await applyPlan(S.project, {
      steps: [{ op: 'captions', args: { style }, label: 'Add captions' }],
    }, {});
    if (report.failed.length) { toast(report.failed[0].why, 'bad', 5000); return; }
    actions.commit('Add captions');
    toast(report.done[0]?.note || 'Captions placed', 'ok', 5200);
  } finally {
    btn.disabled = false;
  }
}

/** SRT, because every platform accepts it and it's four lines of code. */
function exportSrt() {
  const cues = S.project.captions.filter((c) => c.text.trim());
  if (!cues.length) { toast('No caption text to export yet'); return; }
  const stamp = (s) => {
    const ms = Math.floor((s % 1) * 1000);
    const total = Math.floor(s);
    const pad = (n, w = 2) => String(n).padStart(w, '0');
    return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)},${pad(ms, 3)}`;
  };
  const body = cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n');
  const blob = new Blob([body], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${S.project.name.replace(/[^\w-]+/g, '-')}.srt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  toast('Subtitle file saved', 'ok');
}
