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
import { MONTAGES, buildMontageById } from '../engine/montage.js';
import { BEAT_STYLES } from '../engine/beatmaker.js';
import * as licence from '../licence.js';

let lastPlan = null;
let busy = false;

export function mount(host) {
  const remaining = licence.aiRemaining();
  const limit = licence.aiLimit();
  const hasMedia = S.project.media.length > 0;
  // Not "you have run out" — this edition never had any. Saying so up front,
  // and pointing at the free thing that does the same job, is better than a
  // button that looks live and then sells at you.
  const locked = limit === 0;

  host.innerHTML = `
    <div class="panel-h">
      <h2>AI editor</h2>
      <span class="tiny muted">${
        limit === Infinity ? 'Unlimited'
          : locked ? `${licence.requires('ai-edit')?.name || 'Creator'} and up`
          : `${remaining} left this month`}</span>
    </div>
    <p class="panel-sub">
      Describe the edit. It plans it, you approve it, it lands on the timeline as normal clips.
    </p>

    <!--
      Which brain is answering, said out loud.

      There are two. With a Worker configured, the request goes to a real
      language model that understands anything you type. Without one it falls
      back to the on-device reader, which handles direct instructions — "mute
      clip 2", "slow the last shot to half speed" — and recognised styles, and
      nothing else.

      That gap used to be invisible, which is the worst possible way to ship
      it: people typed something specific, got a generic template back, and
      concluded the assistant was stupid rather than switched off.
    -->
    ${cloudAvailable() ? `
      <p class="tiny muted" style="margin:-4px 0 12px">
        <b style="color:var(--ok)">●</b> Full language understanding — say anything.
      </p>`
    : `
      <details class="note tiny" style="margin:0 0 12px">
        <summary><b>Running on the on-device reader</b> — direct instructions only</summary>
        <p style="margin:8px 0 0">
          It follows things like <em>"mute clip 2"</em>, <em>"make the third one black
          and white"</em>, <em>"slow the last clip to half speed"</em>, <em>"delete the last
          two"</em>, <em>"brighten clips 2 to 4"</em> — a target and a change. It also knows
          the named styles.
        </p>
        <p style="margin:8px 0 0">
          For free-form requests it needs the server switched on, which is where the
          language model lives. Paste your Worker URL in
          <b>Settings → Advanced</b> and this panel changes to full understanding.
        </p>
      </details>`}

    ${locked ? `<div class="note info">
      <b>AI editing is a paid feature.</b> It starts at
      ${esc(licence.requires('ai-edit')?.name || 'Creator')} —
      $${(licence.requires('ai-edit')?.once ?? 19.99).toFixed(2)}, paid once, no subscription.
      <br><br>
      <b>Two free ways to do the same job,</b> both running entirely on this device:
      <b>Copy an edit you like</b> just below — drop in any video and it rebuilds that edit's
      shape with your clips — and the <b>Styles</b> panel, which builds a complete edit with
      cuts on the beat, a look, transitions and captions. Neither costs anything, ever.
      <div class="btn-row" style="margin-top:10px">
        <button class="btn btn-sm btn-primary" id="ai-styles">Open Styles instead</button>
        <button class="btn btn-sm" id="ai-upgrade">What's in ${esc(licence.requires('ai-edit')?.name || 'Creator')}?</button>
      </div>
    </div>` : ''}

    ${hasMedia ? '' : `<div class="note">
      <b>Import something first.</b> The AI edits your footage — it doesn't generate any.
      <button class="btn btn-sm" id="ai-import" style="margin-top:9px">Choose files</button>
    </div>`}

    <!-- Copy an edit you like. Free, because it runs entirely on this device —
         no request leaves the machine, so there is nothing to meter. -->
    <details class="group" id="ai-ref" style="margin-bottom:12px">
      <summary>Copy an edit you like</summary>
      <div class="gbody">
        <p class="tiny muted" style="margin:0 0 10px">
          Drop in a video whose style you want — a TikTok you saved, a trailer, anything.
          It works out how that edit was cut and rebuilds the same shape with <b>your</b> clips.
          Nothing from the video you drop in ends up in yours: not a frame, not a sound.
          Runs on this device, so it is free and works offline.
        </p>
        <button class="btn btn-sm btn-full" id="ref-pick">Choose a video to copy</button>
        <input type="file" id="ref-file" accept="video/*" hidden>
        <div id="ref-out" style="margin-top:10px"></div>
      </div>
    </details>

    <textarea class="input" id="ai-prompt" rows="4"
      placeholder="Make a 30 second TikTok trailer, fast cuts on the beat, teal and orange, big captions"></textarea>

    <div class="btn-row" style="margin-top:9px">
      <button class="btn btn-primary btn-full" id="ai-plan" ${hasMedia && !locked ? '' : 'disabled'}>
        ✨ Plan the edit
      </button>
    </div>

    <!--
      The one-press montage.

      Clips in, finished edit out. No sentence to write: pick the kind
      of thing, and it builds the whole cut — sections, pace, ramps,
      slams, transitions, title — to your music if there is any, or to a
      beat it makes on the spot so every cut lands. Free, because it is
      deterministic and local: the paid AI is the free-form sentence.
    -->
    <details class="group" open id="ai-montage" style="margin-top:12px">
      <summary>Make a montage from my clips <span class="tiny muted">${MONTAGES.length} kinds</span></summary>
      <div class="gbody">
        <p class="tiny muted" style="margin:0 0 8px">
          ${S.project.media.some((m) => m.kind === 'audio')
            ? 'Cut to your music — every cut on the beat.'
            : 'No music yet: it will make a beat to cut to, or <button class="lnk" id="ai-add-music">add your own track</button> first.'}
        </p>
        <div class="chips" id="ai-montages">
          ${MONTAGES.map((m) => `<button class="chip" data-montage="${esc(m.id)}" title="${esc(m.blurb)}">${m.emoji} ${esc(m.name)}</button>`).join('')}
        </div>
        <p class="tiny muted" style="margin:8px 0 0">Every one shows its steps first. One Ctrl+Z takes the whole thing back.</p>
      </div>
    </details>

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
  $('#ai-styles', host)?.addEventListener('click', async () => {
    const { openPanel } = await import('./index.js');
    openPanel('templates');
  });
  $('#ai-upgrade', host)?.addEventListener('click', () => licence.upgradePrompt('ai-edit', 'AI editing'));

  $$('[data-example]', host).forEach((b) => b.addEventListener('click', () => {
    $('#ai-prompt', host).value = b.dataset.example;
    $('#ai-prompt', host).focus();
  }));

  $('#ref-pick', host)?.addEventListener('click', () => $('#ref-file', host).click());
  $('#ref-file', host)?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) runReference(host, file);
    e.target.value = '';          // so choosing the same file twice still fires
  });

  $('#ai-montages', host)?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-montage]');
    if (btn) planMontage(host, btn.dataset.montage);
  });
  $('#ai-add-music', host)?.addEventListener('click', () => $('#file-input')?.click());
  $('#ai-plan', host).addEventListener('click', () => runPlan(host));
  $('#ai-prompt', host).addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') runPlan(host);
  });

  if (lastPlan) paintPlan(host, lastPlan);
}

/* ------------------------------------------------------------------ */
/* copying an edit from a reference video                              */
/* ------------------------------------------------------------------ */
/*
 * Deliberately free and deliberately local. Everything here is arithmetic over
 * frames this device already decoded, so there is no request to charge for —
 * and it keeps working on a plane, which an AI feature never does.
 */

let refBusy = false;

async function runReference(host, file) {
  if (refBusy) return;
  refBusy = true;
  const out = $('#ref-out', host);
  const started = performance.now();

  const bar = (p, label) => {
    out.innerHTML = `<div class="note tiny" style="margin:0">
      <b>${esc(label)}</b>
      <div style="height:5px;border-radius:99px;background:var(--surface-3);overflow:hidden;margin-top:7px">
        <i style="display:block;height:100%;width:${Math.round(p * 100)}%;background:var(--grad)"></i>
      </div></div>`;
  };

  try {
    const { analyseReference, describeReference, planFromReference } =
      await import('../engine/reference.js');

    bar(0.02, 'Opening the video');
    const profile = await analyseReference(file, { onProgress: (p, label) => bar(p, label) });

    const plan = planFromReference(profile, {
      media: S.project.media,
      beats: S.beats,
      targetDur: null,
    });

    const took = ((performance.now() - started) / 1000).toFixed(1);
    out.innerHTML = `
      <div class="note ok tiny" style="margin:0 0 10px">
        <b>Read it in ${took}s.</b> Here is what that edit is doing:
      </div>
      <ul style="margin:0 0 12px;padding-left:18px;font-size:12px;color:var(--text-2)">
        ${describeReference(profile).map((l) => `<li>${esc(l)}</li>`).join('')}
      </ul>
      ${(plan.warnings || []).map((w) => `<div class="note tiny">${esc(w)}</div>`).join('')}
      <button class="btn btn-sm btn-primary btn-full" id="ref-apply">
        Rebuild this with my clips</button>
      <p class="tiny muted" style="margin:9px 0 0">
        It copies the <b>shape</b> of the edit — the rhythm, the pacing, the ratio, roughly the
        grade. It cannot copy the footage, and does not try to.
      </p>`;

    $('#ref-apply', out).addEventListener('click', async () => {
      if (!plan.steps.length) { toast(plan.summary, 'bad'); return; }
      const report = await applyPlan(S.project, plan, { beats: S.beats, selection: [...S.sel] });
      if (report.failed.length) { toast(report.failed[0].why, 'bad', 5000); return; }
      actions.commit('Copy an edit');
      toast(plan.summary, 'ok', 5000);
    });
  } catch (err) {
    // Cancelling is not a failure and should not read like one.
    out.innerHTML = err.message === 'cancelled' ? ''
      : `<div class="note tiny" style="margin:0;color:var(--bad)">${esc(err.message)}</div>`;
  } finally {
    refBusy = false;
  }
}

/* ------------------------------------------------------------------ */

/** A montage preset, planned like anything else and shown before it runs. */
function planMontage(host, id) {
  const hasClips = S.project.media.some((m) => m.kind !== 'audio');
  if (!hasClips) { toast('Import some clips or photos first — it edits your footage, it does not make any', 'bad', 4200); return; }
  const media = S.project.media;
  const ctx = {
    ratio: S.project.settings.ratio,
    hasMusic: media.some((m) => m.kind === 'audio'),
    bpm: S.beats?.bpm || null,
    clipCount: media.filter((m) => m.kind !== 'audio').length,
    onTimeline: S.project.clips.length,
    hasPhotos: media.some((m) => m.kind === 'image') && media.filter((m) => m.kind !== 'audio').every((m) => m.kind === 'image'),
    hasSpeech: media.some((m) => m.kind === 'video' && m.hasAudio),
    rebuild: true,
  };
  const built = buildMontageById(id, ctx);
  if (!built) return;
  lastPlan = {
    steps: built.steps, warnings: [], questions: [],
    template: { id: built.montage.id, name: built.montage.name, emoji: built.montage.emoji },
    summary: built.summary, source: 'montage', intent: { raw: built.montage.name, montage: built.montage },
  };
  paintPlan(host, lastPlan);
}

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
      // The planner needs to know whether there is anything to re-time, or a
      // "sync my clips" request silently turns into "replace my clips".
      clipCount: S.project.clips.filter((c) => c.kind !== 'title' && c.kind !== 'sticker').length,
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
      ${plan.template ? `<b>${plan.template.emoji} ${esc(plan.template.name)}</b><br>` : '<b>The plan</b> — '}
      ${esc(plan.summary)}
      ${plan.source === 'cloud' ? '<br><span class="tiny muted">Planned in the cloud.</span>'
        : '<br><span class="tiny muted">Planned on this device.</span>'}
    </div>
    ${(plan.questions || []).map((q) => `<div class="note tiny">
      <b>One thing —</b> ${esc(q)}<br>
      <span class="muted">The plan below works either way; say more and press Plan again to change it.</span>
    </div>`).join('')}
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
  // A montage preset is deterministic and local, like a style: no quota.
  const isMontage = plan.source === 'montage' || plan.source?.id === 'montage';
  if (!isMontage && !licence.spendAi()) { licence.outOfAiPrompt(); return; }

  busy = true;
  const btn = $('#ai-apply', host);
  btn.disabled = true;
  btn.textContent = 'Editing…';

  try {
    const ctx = {
      beats: S.beats,
      // What is highlighted right now, so "this clip" and "the selected ones"
      // mean something rather than quietly applying to the whole timeline.
      selection: [...S.sel],
      transcribe: cloudAvailable() ? (project) => transcribeProject(project) : null,
      // A generated beat goes through the same import as an upload.
      importFile: async (file) => { const made = await actions.importFiles([file], { silent: true }); return made?.[0] || S.project.media.find((m) => m.name === file.name) || null; },
    };
    const report = await applyPlan(S.project, { ...plan, steps: chosen }, ctx);
    if (ctx.beats && ctx.beatBuffer) S.beats = ctx.beats;   // a made beat's grid is exact; detection is not

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
