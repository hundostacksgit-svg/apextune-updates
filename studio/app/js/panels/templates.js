/*
 * The templates panel.
 *
 * One tap builds a whole edit in a named style. Each one shows what it needs
 * before you press it, and what it is about to do afterwards — the same plan
 * screen the AI uses, because they are the same machinery.
 */

import { $, $$, esc, toast, empty } from '../ui.js';
import { S, actions } from '../main.js';
import { TEMPLATES, buildTemplate } from '../engine/templates.js';
import { applyPlan } from '../ai/apply.js';
import { duration } from '../engine/project.js';

let pending = null;
let busy = false;

export function mount(host) {
  const hasMedia = S.project.media.length > 0;
  const music = S.project.media.find((m) => m.kind === 'audio');

  host.innerHTML = `
    <div class="panel-h"><h2>Styles</h2></div>
    <p class="panel-sub">
      A finished edit in one tap. You see every step before it runs, and one
      <span class="kbd">Ctrl</span>+<span class="kbd">Z</span> undoes the lot.
    </p>

    ${hasMedia ? '' : `<div class="note">
      <b>Import something first.</b> These edit your footage — they don't generate any.
      <button class="btn btn-sm" id="t-import" style="margin-top:9px">Choose files</button>
    </div>`}

    ${music ? (S.beats ? `<div class="note ok tiny">
      <b>${S.beats.bpm} BPM</b> detected in ${esc(music.name)} — the beat-based styles will lock to it.
    </div>` : `<div class="note info tiny">
      Music found. <button class="btn btn-sm" id="t-beats" style="margin-top:7px">Find the beat</button>
    </div>`) : `<div class="note tiny">
      No music imported. The beat-based styles will space the cuts evenly instead.
    </div>`}

    <div id="t-list" style="margin-top:14px">
      ${TEMPLATES.map((t) => `
        <button class="tpl" data-tpl="${esc(t.id)}">
          <span class="te">${t.emoji}</span>
          <span class="tt">
            <b>${esc(t.name)}</b>
            <span>${esc(t.blurb)}</span>
            <em>Needs: ${esc(t.wants)}</em>
          </span>
        </button>`).join('')}
    </div>

    <div id="t-plan" style="margin-top:14px"></div>`;

  $('#t-import', host)?.addEventListener('click', () => $('#file-input').click());
  $('#t-beats', host)?.addEventListener('click', async () => {
    const { openPanel } = await import('./index.js');
    openPanel('audio');
    setTimeout(() => $('#a-beats')?.click(), 80);
  });

  $('#t-list', host).addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tpl]');
    if (!btn) return;
    if (!hasMedia) { toast('Import some clips first'); return; }
    preview(host, btn.dataset.tpl);
  });

  if (pending) preview(host, pending.id, true);
  void $$;
}

function preview(host, id, quiet = false) {
  const ctx = {
    ratio: S.project.settings.ratio,
    wantRatio: null,
    hasMusic: S.project.media.some((m) => m.kind === 'audio'),
    bpm: S.beats?.bpm || null,
    targetDur: null,
    pace: null,
    clipCount: S.project.media.filter((m) => m.kind !== 'audio').length,
    onTimeline: S.project.clips.length,
  };
  const built = buildTemplate(id, ctx);
  if (!built) return;
  pending = { id, built };

  const box = $('#t-plan', host);
  box.innerHTML = `
    <div class="note info" style="margin-top:0">
      <b>${built.template.emoji} ${esc(built.template.name)}</b><br>
      <span class="tiny">${esc(built.template.blurb)}</span>
    </div>
    ${built.steps.map((s) => `
      <div class="tiny" style="padding:8px 0;border-bottom:1px solid var(--line-soft)">
        <b>${esc(s.label)}</b><br><span class="muted">${esc(s.detail || '')}</span>
      </div>`).join('')}
    <div class="btn-row">
      <button class="btn btn-primary btn-full" id="t-run">Build it</button>
    </div>
    <p class="tiny muted" style="margin-top:8px">
      ${S.project.clips.length && id !== 'sync-only'
        ? 'This replaces what is on your video tracks. Undo puts it straight back.'
        : 'Everything lands as normal clips you can drag, trim or change.'}
    </p>`;

  $('#t-run', box).addEventListener('click', () => run(host, id));
  if (!quiet) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

async function run(host, id) {
  if (busy) return;
  // No licence check and no quota: these are deterministic and local. The
  // paid tiers are for the effects library and the free-form AI, not for this.

  const btn = $('#t-run', host);
  busy = true;
  if (btn) { btn.disabled = true; btn.textContent = 'Building…'; }

  try {
    const built = pending?.built || buildTemplate(id, {
      ratio: S.project.settings.ratio,
      hasMusic: S.project.media.some((m) => m.kind === 'audio'),
      bpm: S.beats?.bpm || null,
      onTimeline: S.project.clips.length,
    });
    const report = await applyPlan(S.project, { steps: built.steps }, { beats: S.beats });

    actions.commit(`Style: ${built.template.name}`);
    actions.seek(0);

    const failed = report.failed.length;
    toast(failed
      ? `${report.done.length} steps done, ${failed} could not run`
      : `${built.template.name} — ${duration(S.project).toFixed(1)}s built`,
      failed ? '' : 'ok', 4200);

    const box = $('#t-plan', host);
    if (box) {
      box.innerHTML = `
        <div class="note ok" style="margin-top:0"><b>Done.</b> Everything is a normal edit now —
          drag it, trim it, change any effect, or undo the whole thing.</div>
        ${report.done.map((d) => `<div class="tiny" style="padding:6px 0;border-bottom:1px solid var(--line-soft)">
          ✓ ${esc(d.step.label)}${d.note ? `<br><span class="muted">${esc(d.note)}</span>` : ''}</div>`).join('')}
        ${report.failed.map((f) => `<div class="tiny" style="padding:6px 0;color:var(--bad)">
          ✕ ${esc(f.step.label)}<br><span class="muted">${esc(f.why)}</span></div>`).join('')}`;
    }
    pending = null;
  } catch (err) {
    toast(err.message, 'bad', 5000);
  } finally {
    busy = false;
  }
}

export { empty };
