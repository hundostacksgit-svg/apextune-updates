/*
 * The templates panel.
 *
 * One tap builds a whole edit in a named style. Each one shows what it needs
 * before you press it, and what it is about to do afterwards — the same plan
 * screen the AI uses, because they are the same machinery.
 */

import { $, $$, esc, toast, empty } from '../ui.js';
import { S, actions } from '../main.js';
import { TEMPLATES, TEMPLATE_GROUPS_ALL, buildTemplate } from '../engine/templates.js';
import { MONTAGES, buildMontageById } from '../engine/montage.js';
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

    <!-- A hundred and thirty styles is only a library if you can find one.
         Search first, then groups — the same treatment the effect, look and
         transition libraries got, for the same reason. -->
    <input class="input" id="t-search" placeholder="Search styles — noir, vhs, karaoke, drone…"
           style="margin:14px 0 10px">
    <div id="t-list">
      <!-- Whole edits first: these build the cut, not just the look. -->
      <details class="group" open>
        <summary>Full montages <span class="tiny muted">${MONTAGES.length}</span></summary>
        <div class="gbody">
          <p class="tiny muted" style="margin:0 0 8px">The whole edit: sections, pace, ramps, slams, transitions, title — to your music, or to a beat made on the spot.</p>
          ${MONTAGES.map((m) => `
            <button class="tpl" data-montage="${esc(m.id)}"
              data-search="${esc(`${m.name} ${m.blurb} ${m.genre} montage`.toLowerCase())}">
              <span class="te">${m.emoji}</span>
              <span class="tt">
                <b>${esc(m.name)}</b>
                <span>${esc(m.blurb)}</span>
                <em>Needs: clips or photos. Music optional — it makes a beat if there is none.</em>
              </span>
            </button>`).join('')}
        </div>
      </details>
      ${Object.entries(TEMPLATE_GROUPS_ALL).map(([group, list]) => `
        <details class="group" ${group === 'Originals' ? 'open' : ''}>
          <summary>${esc(group)} <span class="tiny muted">${list.length}</span></summary>
          <div class="gbody">
            ${list.map((t) => `
              <button class="tpl" data-tpl="${esc(t.id)}"
                data-search="${esc(`${t.name} ${t.blurb} ${(t.tags || []).join(' ')}`.toLowerCase())}">
                <span class="te">${t.emoji}</span>
                <span class="tt">
                  <b>${esc(t.name)}</b>
                  <span>${esc(t.blurb)}</span>
                  <em>Needs: ${esc(t.wants)}</em>
                </span>
              </button>`).join('')}
          </div>
        </details>`).join('')}
    </div>

    <div id="t-plan" style="margin-top:14px"></div>`;

  // Filter as you type, opening the groups that still have something in them.
  $('#t-search', host)?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    for (const grp of $$('#t-list details', host)) {
      let shown = 0;
      for (const card of $$('[data-tpl]', grp)) {
        const hit = !q || card.dataset.search.includes(q);
        card.hidden = !hit;
        if (hit) shown++;
      }
      grp.hidden = shown === 0;
      if (q) grp.open = true;
    }
  });

  $('#t-import', host)?.addEventListener('click', () => $('#file-input').click());
  $('#t-beats', host)?.addEventListener('click', async () => {
    const { openPanel } = await import('./index.js');
    openPanel('audio');
    setTimeout(() => $('#a-beats')?.click(), 80);
  });

  $('#t-list', host).addEventListener('click', (e) => {
    const mb = e.target.closest('[data-montage]');
    if (mb) {
      if (!hasMedia) { toast('Import some clips first'); return; }
      previewMontage(host, mb.dataset.montage);
      return;
    }
    const btn = e.target.closest('[data-tpl]');
    if (!btn) return;
    if (!hasMedia) { toast('Import some clips first'); return; }
    preview(host, btn.dataset.tpl);
  });

  if (pending) (pending.montage ? previewMontage : preview)(host, pending.id, true);
}

/*
 * Whether a style should also build the cut.
 *
 * Remembered per session rather than per template: somebody who wants styles
 * to leave their edit alone wants that for every style, and being asked again
 * on each one is the same annoyance in smaller pieces.
 */
let rebuildChoice = null;

function previewMontage(host, id, quiet = false) {
  const media = S.project.media;
  const ctx = {
    ratio: S.project.settings.ratio, hasMusic: media.some((m) => m.kind === 'audio'), bpm: S.beats?.bpm || null,
    clipCount: media.filter((m) => m.kind !== 'audio').length, onTimeline: S.project.clips.length,
    hasPhotos: media.some((m) => m.kind === 'image') && media.filter((m) => m.kind !== 'audio').every((m) => m.kind === 'image'),
    hasSpeech: media.some((m) => m.kind === 'video' && m.hasAudio), rebuild: true,
  };
  const built = buildMontageById(id, ctx);
  if (!built) return;
  pending = { id, built: { template: built.montage, steps: built.steps }, montage: true };
  const box = $('#t-plan', host);
  box.innerHTML = `
    <div class="note info" style="margin-top:0">
      <b>${built.montage.emoji} ${esc(built.montage.name)}</b><br>
      <span class="tiny">${esc(built.summary)}</span>
    </div>
    ${built.steps.map((s) => `
      <div class="tiny" style="padding:8px 0;border-bottom:1px solid var(--line-soft)">
        <b>${esc(s.label)}</b><br><span class="muted">${esc(s.detail || '')}</span>
      </div>`).join('')}
    <div class="btn-row"><button class="btn btn-primary btn-full" id="t-run">Build it</button></div>
    <p class="tiny muted" style="margin-top:8px">This replaces what is on your video tracks. Undo puts it straight back.</p>`;
  $('#t-run', box).addEventListener('click', () => run(host, id));
  if (!quiet) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
  // Default: build the cut only when there is nothing to preserve. An edited
  // timeline gets styled, not rebuilt.
  const hasEdit = S.project.clips.length > 0;
  ctx.rebuild = rebuildChoice ?? !hasEdit;

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
    ${hasEdit ? `
      <label class="tp-toggle" style="margin:12px 0 4px;display:flex;gap:8px;align-items:flex-start">
        <input type="checkbox" id="t-rebuild" ${ctx.rebuild ? 'checked' : ''}>
        <span class="tiny">Re-cut my timeline as well
          <span class="muted" style="display:block">
            Off: your cuts stay exactly as they are and only the style goes on.
            On: the clips are laid out again from scratch.</span></span>
      </label>` : ''}
    <div class="btn-row">
      <button class="btn btn-primary btn-full" id="t-run">
        ${ctx.rebuild ? 'Build it' : 'Apply the style'}</button>
    </div>
    <p class="tiny muted" style="margin-top:8px">
      ${!hasEdit
        ? 'Everything lands as normal clips you can drag, trim or change.'
        : ctx.rebuild
          ? 'This replaces what is on your video tracks. Undo puts it straight back.'
          : 'Your cuts are left alone — this puts the effects, grade and transitions on top of them.'}
    </p>`;

  // Changing the switch rebuilds the plan, so the list of steps shown is
  // always the list that will actually run. A preview that does not match what
  // the button does is worse than no preview.
  $('#t-rebuild', box)?.addEventListener('change', (e) => {
    rebuildChoice = e.target.checked;
    preview(host, id, true);
  });

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
      rebuild: rebuildChoice ?? !S.project.clips.length,
    });
    const ctx = {
      beats: S.beats, selection: [...S.sel],
      // A montage with no music makes a beat; it goes through the same import as an upload.
      importFile: async (file) => { const made = await actions.importFiles([file], { silent: true }); return made?.[0] || S.project.media.find((m) => m.name === file.name) || null; },
    };
    const report = await applyPlan(S.project, { steps: built.steps }, ctx);
    if (ctx.beats && ctx.beatBuffer) S.beats = ctx.beats;

    actions.commit(`${pending?.montage ? 'Montage' : 'Style'}: ${built.template.name}`);
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
