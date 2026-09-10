/*
 * The AI editor panel.
 *
 * Type what you want, see exactly what it intends to do, then let it do it.
 * The plan is shown as a list before anything is applied and every step can be
 * switched off — this is the difference between a tool and a slot machine.
 *
 * Applying a whole plan is one entry in the undo history, so "undo the AI"
 * is a single Ctrl+Z rather than fourteen.
 */

import { $, $$, esc, toast, empty } from '../ui.js';
import { S, actions } from '../main.js';
import { duration } from '../engine/project.js';
import { EXAMPLES } from '../ai/planner.js';
import { applyPlan } from '../ai/apply.js';
import { askForPlan, available as cloudAvailable, transcribe } from '../ai/remote.js';
import * as licence from '../licence.js';

let lastPlan = null;
let busy = false;

export function mount(host) {
  const remaining = licence.aiRemaining();
  const limit = licence.aiLimit();
  const hasMedia = S.project.media.length > 0;

  host.innerHTML = `
    <div class="panel-h">
      <h2>AI editor</h2>
      <span class="tiny muted">${limit === Infinity ? 'Unlimited' : `${remaining} left this month`}</span>
    </div>
    <p class="panel-sub">
      Describe the edit. It plans it, you approve it, it lands on the timeline as normal clips.
    </p>

    ${hasMedia ? '' : `<div class="note">
      <b>Import something first.</b> The AI edits your footage — it doesn't generate any.
      <button class="btn btn-sm" id="ai-import" style="margin-top:9px">Choose files</button>
    </div>`}

    <textarea class="input" id="ai-prompt" rows="4"
      placeholder="Make a 30 second TikTok trailer, fast cuts on the beat, teal and orange, big captions"></textarea>

    <div class="btn-row" style="margin-top:9px">
      <button class="btn btn-primary btn-full" id="ai-plan" ${hasMedia ? '' : 'disabled'}>
        ✨ Plan the edit
      </button>
    </div>

    <details class="group" style="margin-top:12px">
      <summary>Examples</summary>
      <div class="gbody">
        ${EXAMPLES.map((x) => `<button class="btn btn-sm btn-ghost btn-full"
          style="justify-content:flex-start;text-align:left;margin-bottom:6px;white-space:normal"
          data-example="${esc(x)}">${esc(x)}</button>`).join('')}
      </div>
    </details>

    <div id="ai-result" style="margin-top:14px"></div>

    <div class="note tiny" style="margin-top:16px">
      ${cloudAvailable()
        ? 'Free-form language goes to the cloud planner. Only your words and the <em>names</em> of your files are sent — never the footage itself.'
        : 'Running the built-in planner, on this device. Nothing leaves your machine. Connect a key in Settings for free-form phrasing.'}
    </div>`;

  $('#ai-import', host)?.addEventListener('click', () => $('#file-input').click());

  $$('[data-example]', host).forEach((b) => b.addEventListener('click', () => {
    $('#ai-prompt', host).value = b.dataset.example;
    $('#ai-prompt', host).focus();
  }));

  $('#ai-plan', host).addEventListener('click', () => runPlan(host));
  $('#ai-prompt', host).addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') runPlan(host);
  });

  if (lastPlan) paintPlan(host, lastPlan);
}

/* ------------------------------------------------------------------ */

async function runPlan(host) {
  if (busy) return;
  const prompt = $('#ai-prompt', host).value.trim();
  if (!prompt) { toast('Tell it what you want first'); return; }

  if (licence.aiRemaining() <= 0) { licence.outOfAiPrompt(); return; }

  busy = true;
  const btn = $('#ai-plan', host);
  btn.disabled = true;
  btn.textContent = 'Thinking…';

  try {
    const ctx = {
      media: S.project.media,
      ratio: S.project.settings.ratio,
      beats: S.beats,
      duration: duration(S.project),
      canTranscribe: cloudAvailable(),
    };
    lastPlan = await askForPlan(prompt, S.project, ctx);
    paintPlan(host, lastPlan);
  } catch (err) {
    toast(err.message, 'bad', 5000);
  } finally {
    busy = false;
    btn.disabled = false;
    btn.textContent = '✨ Plan the edit';
  }
}

function paintPlan(host, plan) {
  const out = $('#ai-result', host);
  if (!out) return;

  if (!plan.steps.length) {
    out.innerHTML = `<div class="note bad">${esc(plan.warnings?.[0] || "That didn't turn into anything to do.")}</div>`;
    return;
  }

  out.innerHTML = `
    <div class="note info" style="margin-top:0">
      <b>The plan</b> — ${esc(plan.summary)}
      ${plan.source === 'cloud' ? '<br><span class="tiny muted">Planned in the cloud.</span>'
        : '<br><span class="tiny muted">Planned on this device.</span>'}
    </div>
    ${(plan.warnings || []).map((w) => `<div class="note tiny">${esc(w)}</div>`).join('')}
    <div id="ai-steps">
      ${plan.steps.map((s, i) => `
        <label class="group" style="display:block;cursor:pointer">
          <div style="display:flex;gap:10px;padding:11px 12px;align-items:flex-start">
            <input type="checkbox" data-step="${i}" checked style="margin-top:3px">
            <span style="flex:1;min-width:0">
              <b style="font-size:12.5px">${esc(s.label)}</b>
              ${s.detail ? `<br><span class="tiny muted">${esc(s.detail)}</span>` : ''}
            </span>
          </div>
        </label>`).join('')}
    </div>
    <div class="btn-row">
      <button class="btn btn-primary btn-full" id="ai-apply">Do it</button>
    </div>
    <p class="tiny muted" style="margin-top:9px">
      One <span class="kbd">Ctrl</span>+<span class="kbd">Z</span> puts everything back exactly as it was.
    </p>`;

  $('#ai-apply', out).addEventListener('click', () => doApply(host, plan));
}

async function doApply(host, plan) {
  if (busy) return;
  const chosen = $$('#ai-steps [data-step]', host)
    .filter((box) => box.checked)
    .map((box) => plan.steps[Number(box.dataset.step)]);

  if (!chosen.length) { toast('Nothing ticked'); return; }
  if (!licence.spendAi()) { licence.outOfAiPrompt(); return; }

  busy = true;
  const btn = $('#ai-apply', host);
  btn.disabled = true;
  btn.textContent = 'Editing…';

  try {
    const ctx = {
      beats: S.beats,
      transcribe: cloudAvailable() ? (project) => transcribeProject(project) : null,
    };
    const report = await applyPlan(S.project, { ...plan, steps: chosen }, ctx);

    // One history entry for the whole run: undoing an AI edit should be one
    // keystroke, not one per step.
    actions.commit(`AI: ${plan.intent?.raw ? String(plan.intent.raw).slice(0, 40) : 'edit'}`);
    actions.seek(0);

    const failed = report.failed.length;
    toast(failed
      ? `${report.done.length} steps done, ${failed} could not run`
      : `Done — ${report.done.length} step${report.done.length === 1 ? '' : 's'} applied`,
      failed ? '' : 'ok', 4200);

    paintReport(host, report);
  } catch (err) {
    toast(err.message, 'bad', 5000);
  } finally {
    busy = false;
  }
}

function paintReport(host, report) {
  const out = $('#ai-result', host);
  if (!out) return;
  out.innerHTML = `
    <div class="note ok" style="margin-top:0"><b>Applied.</b> Everything below is a normal edit —
      drag it, trim it, change the look, or undo the lot.</div>
    ${report.done.map((d) => `<div class="tiny" style="padding:7px 0;border-bottom:1px solid var(--line-soft)">
      ✓ ${esc(d.step.label)}${d.note ? `<br><span class="muted">${esc(d.note)}</span>` : ''}</div>`).join('')}
    ${report.failed.map((f) => `<div class="tiny" style="padding:7px 0;color:var(--bad)">
      ✕ ${esc(f.step.label)}<br><span class="muted">${esc(f.why)}</span></div>`).join('')}
    <div class="btn-row"><button class="btn btn-sm btn-ghost btn-full" id="ai-again">Plan something else</button></div>`;
  $('#ai-again', out).addEventListener('click', () => { lastPlan = null; mount($('#panel')); });
}

/**
 * Send just the audio for transcription. Extracting it means rendering the
 * mix, which is the only way to caption an edit rather than a single file.
 */
async function transcribeProject(project) {
  void project;
  try {
    const { blobOf } = await import('../engine/media.js');
    const track = S.project.media.find((m) => m.hasAudio && blobOf(m));
    if (!track) return null;
    return await transcribe(blobOf(track));
  } catch (err) {
    toast(`Transcription unavailable: ${err.message}`, 'bad', 4200);
    return null;
  }
}

export { empty };
