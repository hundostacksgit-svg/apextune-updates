/* Titles: add one, then style it. Text is a clip like any other. */

import { $, $$, esc, toast, slider, selectRow, toggleRow, group } from '../ui.js';
import { S, actions } from '../main.js';
import { addClip, addTrack, clipById, duration } from '../engine/project.js';
import { TITLE_PRESETS, FONTS, ANIMS, defaultText } from '../engine/titles.js';
import { EMOJI, SHAPES, STICKER_ANIMS, defaultSticker } from '../engine/stickers.js';
import * as licence from '../licence.js';

export function mount(host) {
  const sel = [...S.sel].map((id) => clipById(S.project, id)).filter((c) => c?.kind === 'title');
  const clip = sel.length === 1 ? sel[0] : null;

  const stickerClip = [...S.sel].map((id) => clipById(S.project, id)).find((c) => c?.kind === 'sticker');

  host.innerHTML = `
    <div class="panel-h"><h2>Text &amp; stickers</h2></div>
    <p class="panel-sub">Both sit on their own tracks, above the picture.</p>

    <div class="chips" id="t-presets">
      ${TITLE_PRESETS.map((p) => {
        const locked = p.tier !== 'free' && !licence.can('all-filters');
        return `<button class="chip ${locked ? 'locked' : ''}" data-preset="${esc(p.id)}"
          data-tier="${esc(p.tier)}">${esc(p.name)}</button>`;
      }).join('')}
    </div>

    ${clip ? styleEditor(clip) : `
      <div class="note tiny" style="margin-top:14px">
        Tap a style to drop a title at the playhead. Select it on the timeline to edit the words.
      </div>`}

    <details class="group" style="margin-top:16px" ${stickerClip ? 'open' : ''}>
      <summary>Stickers &amp; callouts</summary>
      <div class="gbody">
        <div class="egrid" id="t-emoji">
          ${EMOJI.map((e) => `<button data-emoji="${esc(e)}" title="${esc(e)}">${e}</button>`).join('')}
        </div>
        <div class="chips" id="t-shapes" style="margin-top:10px">
          ${Object.entries(SHAPES).map(([id, sh]) => {
            const locked = sh.tier !== 'free' && !licence.can('all-filters');
            return `<button class="chip ${locked ? 'locked' : ''}" data-shape="${esc(id)}"
              data-tier="${esc(sh.tier)}">${esc(sh.name)}</button>`;
          }).join('')}
        </div>
        ${stickerClip ? stickerEditor(stickerClip) : `
          <p class="tiny muted" style="margin:10px 0 0">
            Tap one to drop it at the playhead. Select it on the timeline to move, colour and animate it —
            or pin it to a motion track in the Inspector so it follows something.
          </p>`}
      </div>
    </details>`;

  $('#t-emoji', host)?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-emoji]');
    if (btn) addSticker('emoji', btn.dataset.emoji);
  });

  $('#t-shapes', host)?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-shape]');
    if (!btn) return;
    const feature = btn.dataset.tier === 'free' ? 'text' : 'all-filters';
    licence.gate(feature, () => addSticker('shape', btn.dataset.shape), { what: 'That callout' });
  });

  if (stickerClip) {
    host.addEventListener('input', (e) => {
      const key = e.target.dataset.sk;
      if (!key) return;
      const value = e.target.type === 'range' ? Number(e.target.value) : e.target.value;
      actions.patchSelected((c) => { if (c.kind === 'sticker') c.sticker[key] = value; },
        `Sticker ${key}`, `sticker:${key}`);
      const label = host.querySelector(`[data-val="${CSS.escape(key)}"]`);
      if (label && e.target.type === 'range') label.textContent = String(Math.round(value * 100) / 100);
    });
    host.addEventListener('change', (e) => {
      const key = e.target.dataset.sk;
      if (key && (e.target.tagName === 'SELECT' || e.target.type === 'color')) {
        actions.patchSelected((c) => { if (c.kind === 'sticker') c.sticker[key] = e.target.value; }, 'Edit sticker');
      }
    });
  }

  $('#t-presets', host).addEventListener('click', (e) => {
    const btn = e.target.closest('[data-preset]');
    if (!btn) return;
    const feature = btn.dataset.tier === 'free' ? 'text' : 'all-filters';
    licence.gate(feature, () => addTitle(btn.dataset.preset), { what: 'That title style' });
  });

  if (!clip) return;

  host.addEventListener('input', (e) => {
    const key = e.target.dataset.k;
    if (!key) return;
    const value = e.target.type === 'checkbox' ? e.target.checked
      : e.target.type === 'range' ? Number(e.target.value)
      : e.target.value;
    actions.patchSelected((c) => { if (c.kind === 'title') c.text[key] = value; },
      `Edit title ${key}`, `title:${key}`);
    const label = host.querySelector(`[data-val="${CSS.escape(key)}"]`);
    if (label && e.target.type === 'range') label.textContent = fmt(key, value);
  });

  host.addEventListener('change', (e) => {
    if (e.target.dataset.k && (e.target.tagName === 'SELECT' || e.target.type === 'color')) {
      actions.patchSelected((c) => { if (c.kind === 'title') c.text[e.target.dataset.k] = e.target.value; },
        'Edit title');
    }
  });

  void $$;
}

function styleEditor(clip) {
  const t = { ...defaultText(), ...clip.text };
  return `
    <div class="field" style="margin-top:16px">
      <label for="t-content">Words</label>
      <textarea class="input" id="t-content" data-k="content" rows="3">${esc(t.content)}</textarea>
    </div>
    ${selectRow({ key: 'font', label: 'Font', value: t.font, options: FONTS.map((f) => [f.id, f.name]) })}
    ${selectRow({ key: 'anim', label: 'Animation', value: t.anim, options: ANIMS })}
    ${slider({ key: 'size', label: 'Size', value: t.size, min: 0.02, max: 0.2, step: 0.002,
      fmt: (v) => `${Math.round(v * 1000)}` })}
    ${slider({ key: 'y', label: 'Vertical position', value: t.y, min: 0.05, max: 0.95, step: 0.01,
      fmt: (v) => `${Math.round(v * 100)}%` })}
    ${slider({ key: 'x', label: 'Horizontal position', value: t.x, min: 0.05, max: 0.95, step: 0.01,
      fmt: (v) => `${Math.round(v * 100)}%` })}
    <div class="field"><label for="t-colour">Colour</label>
      <input class="input" type="color" id="t-colour" data-k="color" value="${esc(t.color)}"></div>
    ${group('Outline &amp; background', `
      <div class="field"><label for="t-stroke">Outline colour</label>
        <input class="input" type="color" id="t-stroke" data-k="stroke" value="${esc(t.stroke || '#000000')}"></div>
      ${slider({ key: 'strokeWidth', label: 'Outline thickness', value: t.strokeWidth, min: 0, max: 0.35, step: 0.01,
        fmt: (v) => `${Math.round(v * 100)}` })}
      ${toggleRow({ key: 'shadow', label: 'Drop shadow', on: t.shadow })}
      ${toggleRow({ key: 'uppercase', label: 'ALL CAPS', on: t.uppercase })}
    `, false)}
    ${group('Advanced', `
      ${selectRow({ key: 'align', label: 'Alignment', value: t.align,
        options: [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']] })}
      ${slider({ key: 'weight', label: 'Weight', value: t.weight, min: 300, max: 900, step: 100,
        fmt: (v) => String(Math.round(v)) })}
      ${slider({ key: 'letterSpacing', label: 'Letter spacing', value: t.letterSpacing, min: -0.08, max: 0.3, step: 0.01,
        fmt: (v) => Number(v).toFixed(2) })}
      ${slider({ key: 'lineHeight', label: 'Line height', value: t.lineHeight, min: 0.9, max: 2, step: 0.02,
        fmt: (v) => Number(v).toFixed(2) })}
      ${slider({ key: 'animDur', label: 'Animation length', value: t.animDur, min: 0.08, max: 1.5, step: 0.02,
        fmt: (v) => `${Number(v).toFixed(2)}s` })}
    `, false, 'data-min="expert"')}`;
}

function fmt(key, v) {
  if (key === 'size') return String(Math.round(v * 1000));
  if (key === 'x' || key === 'y' || key === 'strokeWidth') return `${Math.round(v * 100)}%`;
  if (key === 'animDur') return `${Number(v).toFixed(2)}s`;
  if (key === 'letterSpacing' || key === 'lineHeight') return Number(v).toFixed(2);
  return String(Math.round(v));
}

function addTitle(presetId) {
  const preset = TITLE_PRESETS.find((p) => p.id === presetId) || TITLE_PRESETS[0];
  let track = S.project.tracks.find((t) => t.kind === 'video' && t.name === 'Titles');
  if (!track) track = addTrack(S.project, 'video', 'Titles');
  const clip = addClip(S.project, {
    trackId: track.id,
    start: S.time,
    dur: 2.4,
    kind: 'title',
    text: { ...defaultText(preset.text?.content || 'Your text here'), ...preset.text },
  });
  actions.select([clip.id]);
  actions.commit(`Add title (${preset.name})`);
  toast('Title added — type into the Words box', 'ok');
}


/* ------------------------------------------------------------------ */
/* stickers                                                            */
/* ------------------------------------------------------------------ */

function stickerEditor(clip) {
  const st = { ...defaultSticker(), ...clip.sticker };
  const needsText = st.kind === 'shape' && ['bubble', 'bar', 'burst', 'countdown'].includes(st.value);
  return `
    <div style="margin-top:12px;border-top:1px solid var(--line-soft);padding-top:12px">
      ${needsText ? `<div class="field"><label for="s-text">Words</label>
        <input class="input" id="s-text" data-sk="text" value="${esc(st.text || '')}"
          placeholder="${st.value === 'countdown' ? '3' : 'Type here'}"></div>` : ''}
      ${slider({ key: 'size', label: 'Size', value: st.size, min: 0.04, max: 0.7, step: 0.01,
        fmt: (v) => `${Math.round(v * 100)}%` }).replace('data-k=', 'data-sk=')}
      ${slider({ key: 'x', label: 'Across', value: st.x, min: 0, max: 1, step: 0.01,
        fmt: (v) => `${Math.round(v * 100)}%` }).replace('data-k=', 'data-sk=')}
      ${slider({ key: 'y', label: 'Down', value: st.y, min: 0, max: 1, step: 0.01,
        fmt: (v) => `${Math.round(v * 100)}%` }).replace('data-k=', 'data-sk=')}
      ${slider({ key: 'rotate', label: 'Rotation', value: st.rotate, min: -180, max: 180, step: 1,
        fmt: (v) => `${Math.round(v)}°` }).replace('data-k=', 'data-sk=')}
      ${selectRow({ key: 'anim', label: 'Animation', value: st.anim, options: STICKER_ANIMS })
        .replace('data-k=', 'data-sk=')}
      ${st.kind === 'shape' ? `
        <div class="field"><label for="s-col">Colour</label>
          <input class="input" type="color" id="s-col" data-sk="colour" value="${esc(st.colour)}"></div>` : ''}
      ${st.value === 'progress' ? slider({ key: 'progress', label: 'Fill', value: st.progress,
        min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` }).replace('data-k=', 'data-sk=') : ''}
    </div>`;
}

function addSticker(kind, value) {
  let track = S.project.tracks.find((t) => t.kind === 'video' && t.name === 'Stickers');
  if (!track) track = addTrack(S.project, 'video', 'Stickers');
  const at = Math.min(S.time, Math.max(0, duration(S.project) - 0.3));
  const clip = addClip(S.project, {
    trackId: track.id,
    start: at,
    dur: 1.8,
    kind: 'sticker',
    sticker: defaultSticker(kind, value),
  });
  actions.select([clip.id]);
  actions.commit(`Add ${kind === 'emoji' ? value : SHAPES[value]?.name || value}`);
  toast('Added — drag it on the timeline, or pin it to a motion track in the Inspector', 'ok', 3600);
}
