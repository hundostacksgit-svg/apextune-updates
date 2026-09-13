/* Titles: add one, then style it. Text is a clip like any other. */

import { $, $$, esc, toast, slider, selectRow, toggleRow, group } from '../ui.js';
import { S, actions, drawFrame } from '../main.js';
import { addClip, addTrack, clipById, duration } from '../engine/project.js';
import { TITLE_PRESETS, FONT_GROUPS, ANIMS, defaultText, TEXT_ANIMATOR_PRESETS, TEXT_ANIMATOR_BY_ID, ANIMATOR_PROPS, ANIMATOR_RANGE, SELECTOR_SHAPES, defaultAnimator } from '../engine/titles.js';
import { setKeyframe } from '../engine/project.js';
import { openExpressionEditor } from '../expr-ui.js';
import { TEXT_STYLE_GROUPS, applyTextStyle } from '../engine/text-styles.js';
import { attachPreviews } from '../engine/preview.js';
import { loadFont, isLoaded } from '../engine/fonts-library.js';
import { EMOJI, SHAPES, STICKER_ANIMS, STICKER_REACTIONS, defaultSticker, defaultReact } from '../engine/stickers.js';
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
        Tap a layout to drop a title at the playhead. Select it on the timeline to edit the words.
      </div>`}

    ${styleGallery(clip)}
    ${animGallery(clip)}
    ${animatorGallery(clip)}

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

  if (stickerClip) wireStickerEditor(host);

  $('#t-presets', host).addEventListener('click', (e) => {
    const btn = e.target.closest('[data-preset]');
    if (!btn) return;
    const feature = btn.dataset.tier === 'free' ? 'text' : 'all-filters';
    licence.gate(feature, () => addTitle(btn.dataset.preset), { what: 'That title style' });
  });

  /*
   * A style or an animation goes on the selected title, or — with none
   * selected — onto a fresh one at the playhead, so the gallery is never a
   * row of buttons that do nothing until you have done something else first.
   */
  $('#t-styles', host)?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tstyle]');
    if (!btn) return;
    const feature = btn.dataset.tier === 'free' ? 'text' : 'all-filters';
    licence.gate(feature, () => useStyle(btn.dataset.tstyle), { what: 'That text style' });
  });
  $('#t-anims', host)?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tanim]');
    if (!btn) return;
    useAnim(btn.dataset.tanim);
  });
  wireAnimators(host);
  $('#t-style-search', host)?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    for (const grp of $$('#t-styles details', host)) {
      let shown = 0;
      for (const chip of $$('[data-tstyle]', grp)) {
        const hit = !q || chip.dataset.search.includes(q);
        chip.hidden = !hit;
        if (hit) shown++;
      }
      grp.hidden = shown === 0;
      if (q) grp.open = true;
    }
  });
  // Every chip gets a real picture of itself — the style on the sample frame,
  // the animation playing on hover — the same way the effect library does.
  attachPreviews(host, 'tstyle');
  attachPreviews(host, 'tanim');

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

  /*
   * Picking a font fetches it, then redraws.
   *
   * The set happens first so the panel responds at once, and the redraw
   * happens again when the face lands — canvas draws in a fallback until the
   * font is really loaded, so without that second draw the viewer keeps
   * showing the old typeface until something else happens to trigger a frame.
   */
  host.addEventListener('click', async (e) => {
    const pick = e.target.closest('[data-font]');
    if (!pick) return;
    const id = pick.dataset.font;
    actions.patchSelected((c) => { if (c.kind === 'title') c.text.font = id; }, 'Change font');
    if (isLoaded(id)) return;
    pick.classList.add('loading');
    const ok = await loadFont(id);
    pick.classList.remove('loading');
    if (!ok) { toast('That font needs a connection — using the closest match on this device'); return; }
    drawFrame?.();
  });

  // Filter as you type, the same way the effect and look libraries do.
  $('#t-font-search', host)?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    for (const grp of $$('#t-fonts details', host)) {
      let shown = 0;
      for (const chip of $$('[data-font]', grp)) {
        const hit = !q || chip.dataset.search.includes(q);
        chip.hidden = !hit;
        if (hit) shown++;
      }
      grp.hidden = shown === 0;
      if (q) grp.open = true;
    }
  });
}

/*
 * The font picker.
 *
 * Two hundred typefaces in a flat dropdown is a list nobody scrolls, so it is
 * a search box over grouped options — and each option is rendered *in its own
 * typeface*, which is the only way to choose one. A list of names in the
 * system font tells you nothing about what you are picking.
 *
 * The names that are still loading show in their fallback until the face
 * arrives, which is honest: that is exactly what a title would look like right
 * now too.
 */
function fontRow(current) {
  const chip = (f) => `<button class="chip ${current === f.id ? 'on' : ''}"
    data-font="${esc(f.id)}"
    data-search="${esc(`${f.name} ${f.group} ${f.id}`.toLowerCase())}"
    style="font-family:${esc(f.stack)}"
    title="${esc(f.name)}">${esc(f.name)}</button>`;

  const groups = Object.entries(FONT_GROUPS);
  const owning = groups.find(([, list]) => list.some((f) => f.id === current))?.[0];

  return `
    <div class="field" style="margin-top:14px">
      <label for="t-font-search">Font</label>
      <input class="input" id="t-font-search" placeholder="Search typefaces — bold, script, mono…">
    </div>
    <div id="t-fonts">
      ${groups.map(([name, list]) => `
        <details class="group" ${name === (owning || 'On this device') ? 'open' : ''}>
          <summary>${esc(name)} <span class="tiny muted">${list.length}</span></summary>
          <div class="gbody"><div class="chips">${list.map(chip).join('')}</div></div>
        </details>`).join('')}
    </div>`;
}

function styleEditor(clip) {
  const t = { ...defaultText(), ...clip.text };
  return `
    <div class="field" style="margin-top:16px">
      <label for="t-content">Words</label>
      <textarea class="input" id="t-content" data-k="content" rows="3">${esc(t.content)}</textarea>
    </div>
    ${fontRow(t.font)}
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

export function addTitle(presetId, { quiet = false } = {}) {
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
  if (!quiet) toast('Title added — type into the Words box', 'ok');
}


/* ------------------------------------------------------------------ */
/* styles and animations                                                */
/* ------------------------------------------------------------------ */

function styleGallery(clip) {
  const current = clip?.text?.styleId || null;
  const groups = Object.entries(TEXT_STYLE_GROUPS);
  const total = groups.reduce((n, [, l]) => n + l.length, 0);
  const owning = groups.find(([, list]) => list.some((st) => st.id === current))?.[0];
  return `
    <details class="group" style="margin-top:16px" open id="t-style-wrap">
      <summary>Text styles <span class="tiny muted">${total}</span></summary>
      <div class="gbody">
        <p class="tiny muted" style="margin:0 0 8px">Outlines, neon, gradients, shaded colours, 3D blocks, glass.
          ${clip ? 'Tap one to restyle the selected title.' : 'Tap one to add a title in that style.'}</p>
        <div class="field" style="margin:0 0 8px">
          <input class="input" id="t-style-search" placeholder="Search styles — neon, gold, glass, 3D…" aria-label="Search text styles">
        </div>
        <div id="t-styles">
          ${groups.map(([name, list]) => `
            <details class="group" ${name === (owning || groups[0][0]) ? 'open' : ''}>
              <summary>${esc(name)} <span class="tiny muted">${list.length}</span></summary>
              <div class="gbody"><div class="chips chips-prev">${list.map((st) => {
                const locked = st.tier !== 'free' && !licence.can('all-filters');
                return `<button class="chip ${current === st.id ? 'on' : ''} ${locked ? 'locked' : ''}"
                  data-tstyle="${esc(st.id)}" data-tier="${esc(st.tier)}"
                  data-search="${esc(`${st.name} ${st.group} ${st.id}`.toLowerCase())}"
                  title="${esc(st.name)}">${esc(st.name)}</button>`;
              }).join('')}</div></div>
            </details>`).join('')}
        </div>
      </div>
    </details>`;
}

function animGallery(clip) {
  const current = clip?.text?.anim || null;
  return `
    <details class="group" style="margin-top:12px" ${clip ? 'open' : ''} id="t-anim-wrap">
      <summary>Animations <span class="tiny muted">${ANIMS.length}</span></summary>
      <div class="gbody">
        <p class="tiny muted" style="margin:0 0 8px">Hover or press one to watch it. Letter-by-letter, glitch, neon flicker, rubber band, wipe, and the loops.</p>
        <div class="chips chips-prev" id="t-anims">
          ${ANIMS.map(([id, name]) => `<button class="chip ${current === id ? 'on' : ''}"
            data-tanim="${esc(id)}" title="${esc(name)}">${esc(name)}</button>`).join('')}
        </div>
      </div>
    </details>`;
}

/*
 * Animators: per-character moves with a range selector — the mechanism
 * kinetic typography is made of. The pieces go on the selected title (or a
 * fresh one), and the editor under them exposes every animator on it:
 * property, amount, unit, shape, the selector's start, end, offset and
 * softness, each keyable at the playhead or handed to an expression.
 */
function animatorGallery(clip) {
  const locked = !licence.can('text-animators');
  const list = clip?.text?.animators || [];
  return `
    <details class="group" style="margin-top:12px" ${list.length ? 'open' : ''} id="t-animator-wrap">
      <summary>Animators — per character <span class="tiny muted">${TEXT_ANIMATOR_PRESETS.length}</span></summary>
      <div class="gbody">
        <p class="tiny muted" style="margin:0 0 8px">A property, an amount, and a selector that sweeps through the letters or words. Key the selector and the letters arrive one by one; key the amount and they all move together.</p>
        ${locked ? `<div class="note pro tiny" style="margin-bottom:8px">Text animators are in ${esc(licence.requires('text-animators')?.name || 'Creator')}.
          <button class="btn btn-sm" data-act="upgrade-animators" style="margin-top:8px">See what's included</button></div>` : ''}
        <div class="chips chips-prev" id="t-animators">
          ${TEXT_ANIMATOR_PRESETS.map((p) => `<button class="chip ${locked ? 'locked' : ''}" data-tanim="an:${esc(p.id)}" data-tanimator="${esc(p.id)}" title="${esc(p.note)}">${esc(p.name)}</button>`).join('')}
        </div>
        ${clip ? animatorEditor(clip) : ''}
      </div>
    </details>`;
}

function animatorEditor(clip) {
  const list = clip.text?.animators || [];
  const row = (key, label, min, max, step, value, fmt) => `
    <div class="sh-row">
      ${slider({ key: `an.${key}`, label, value, min, max, step, fmt })}
      <span class="sh-keys">
        <button class="kf-mini ${clip.keyframes?.[`text.animators.${key}`]?.length ? 'on' : ''}" data-ankey="${esc(key)}" title="Key this at the playhead">◆</button>
        <button class="kf-expr ${clip.expressions?.[`text.animators.${key}`] ? 'on' : ''}" data-anexpr="${esc(key)}" title="Drive this with an expression">ƒ</button>
      </span>
    </div>`;
  const pct = (v) => `${Math.round(v * 100)}%`;
  return `
    <div id="t-animator-list" style="margin-top:10px">
      ${list.map((an, k) => {
        const r = ANIMATOR_RANGE[an.prop] || ANIMATOR_RANGE.opacity;
        const sel = an.selector || {};
        return `
        <div class="an-block">
          <div class="an-head">
            <select class="input" data-anprop="${k}">${ANIMATOR_PROPS.map(([id, name]) => `<option value="${id}" ${an.prop === id ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select>
            <select class="input" data-anunit="${k}"><option value="chars" ${sel.unit !== 'words' ? 'selected' : ''}>by character</option><option value="words" ${sel.unit === 'words' ? 'selected' : ''}>by word</option></select>
            <button class="btn btn-sm btn-ghost" data-andel="${k}" title="Remove this animator">✕</button>
          </div>
          ${row(`${k}.from`, 'Amount', r.min, r.max, r.step, an.from ?? r.def, r.fmt)}
          ${row(`${k}.selector.start`, 'Selector start', 0, 1, 0.005, sel.start ?? 0, pct)}
          ${row(`${k}.selector.end`, 'Selector end', 0, 1, 0.005, sel.end ?? 1, pct)}
          ${row(`${k}.selector.offset`, 'Selector offset', -1, 1, 0.005, sel.offset ?? 0, pct)}
          ${row(`${k}.selector.edge`, 'Softness', 0, 1, 0.005, sel.edge ?? 0.15, pct)}
          <div class="an-head">
            <select class="input" data-anshape="${k}">${SELECTOR_SHAPES.map(([id, name]) => `<option value="${id}" ${(sel.shape || 'square') === id ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select>
            <label class="tiny"><input type="checkbox" data-anrandom="${k}" ${sel.random ? 'checked' : ''}> Random order</label>
          </div>
        </div>`;
      }).join('')}
      <div class="btn-row" style="margin-top:8px">
        <select class="input" id="an-add" style="max-width:190px">
          <option value="">Add an animator…</option>
          ${ANIMATOR_PROPS.map(([id, name]) => `<option value="${id}">${esc(name)}</option>`).join('')}
        </select>
        ${list.length ? `<button class="btn btn-sm btn-ghost" data-act="animators-in">Arrive over 1 s</button>
        <button class="btn btn-sm btn-ghost" data-act="animators-out">…and leave at the end</button>
        <button class="btn btn-sm btn-ghost" data-act="animators-clear">Remove all</button>` : ''}
      </div>
    </div>`;
}

function wireAnimators(host) {
  const wrap = $('#t-animator-wrap', host);
  if (!wrap) return;
  const local = (clip) => Math.max(0, Math.min(clip.dur, S.time - clip.start));
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="upgrade-animators"]')) { licence.upgradePrompt('text-animators', 'Text animators'); return; }
    const piece = e.target.closest('[data-tanimator]');
    if (piece) {
      licence.gate('text-animators', () => {
        if (!selectedTitle()) addTitle('headline', { quiet: true });
        actions.patchSelected((c) => { if (c.kind === 'title') TEXT_ANIMATOR_BY_ID[piece.dataset.tanimator]?.build(c, c.dur); }, `Text animator: ${piece.dataset.tanimator}`);
      }, { what: 'That animator' });
      return;
    }
    const clip = selectedTitle();
    if (!clip) return;
    const del = e.target.closest('[data-andel]');
    if (del) {
      const k = Number(del.dataset.andel);
      actions.patchSelected((c) => {
        if (c.kind !== 'title') return;
        c.text.animators.splice(k, 1);
        // The keys and expressions are addressed by index, so the ones after
        // the removed animator move down a slot rather than being thrown away
        // with it — removing the third animator must not un-key the first.
        const shift = (obj) => {
          if (!obj) return obj;
          const next = {};
          for (const [key, v] of Object.entries(obj)) {
            const m = key.match(/^text\.animators\.(\d+)\.(.+)$/);
            if (!m) { next[key] = v; continue; }
            const i = Number(m[1]);
            if (i === k) continue;
            next[i > k ? `text.animators.${i - 1}.${m[2]}` : key] = v;
          }
          return next;
        };
        c.keyframes = shift(c.keyframes) || {};
        if (c.expressions) c.expressions = shift(c.expressions);
      }, 'Remove animator');
      return;
    }
    const key = e.target.closest('[data-ankey]');
    if (key) {
      const prop = `text.animators.${key.dataset.ankey}`;
      const now = readAnimator(clip, key.dataset.ankey);
      actions.patchSelected((c) => { if (c.kind === 'title') setKeyframe(c, prop, local(c), now); }, 'Key animator');
      return;
    }
    const xp = e.target.closest('[data-anexpr]');
    if (xp) { openExpressionEditor(clip, `text.animators.${xp.dataset.anexpr}`, { label: `Animator ${xp.dataset.anexpr.split('.').pop()}` }); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'animators-in') {
      actions.patchSelected((c) => {
        if (c.kind !== 'title') return;
        (c.text.animators || []).forEach((_, i) => { c.keyframes[`text.animators.${i}.selector.start`] = [{ t: 0, v: 0, ease: 'ease' }, { t: Math.min(1, c.dur * 0.5), v: 1, ease: 'ease' }]; });
      }, 'Animators arrive');
    } else if (act === 'animators-out') {
      actions.patchSelected((c) => {
        if (c.kind !== 'title') return;
        (c.text.animators || []).forEach((_, i) => {
          const keys = (c.keyframes[`text.animators.${i}.selector.start`] ||= []);
          keys.push({ t: Math.max(0.1, c.dur - 0.8), v: 1, ease: 'ease' }, { t: c.dur, v: 0, ease: 'ease' });
          keys.sort((a, b) => a.t - b.t);
        });
      }, 'Animators leave');
    } else if (act === 'animators-clear') {
      actions.patchSelected((c) => {
        if (c.kind !== 'title') return;
        c.text.animators = [];
        for (const key of Object.keys(c.keyframes || {})) if (key.startsWith('text.animators.')) delete c.keyframes[key];
        for (const key of Object.keys(c.expressions || {})) if (key.startsWith('text.animators.')) delete c.expressions[key];
      }, 'Remove animators');
    }
  });
  wrap.addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    if (!k?.startsWith('an.') || e.target.type !== 'range') return;
    const clip = selectedTitle();
    if (!clip) return;
    const value = Number(e.target.value);
    const label = wrap.querySelector(`[data-val="${CSS.escape(k)}"]`);
    if (label) label.textContent = String(Math.round(value * 100) / 100);
    writeAnimator(clip, k.slice(3), value);
    drawFrame();
  });
  wrap.addEventListener('change', (e) => {
    const clip = selectedTitle();
    if (!clip) return;
    const k = e.target.dataset.k;
    if (k?.startsWith('an.') && e.target.type === 'range') { actions.patchSelected((c) => writeAnimator(c, k.slice(3), Number(e.target.value)), 'Animator', `an:${k}`); return; }
    if (e.target.id === 'an-add' && e.target.value) {
      const prop = e.target.value;
      actions.patchSelected((c) => { if (c.kind === 'title') { (c.text.animators ||= []).push(defaultAnimator(prop)); c.text.anim = 'none'; } }, 'Add animator');
      return;
    }
    const d = e.target.dataset;
    if (d.anprop !== undefined) { actions.patchSelected((c) => { const an = c.text?.animators?.[Number(d.anprop)]; if (an) { an.prop = e.target.value; an.from = ANIMATOR_RANGE[an.prop]?.def ?? 0; } }, 'Animator property'); return; }
    if (d.anunit !== undefined) { actions.patchSelected((c) => { const an = c.text?.animators?.[Number(d.anunit)]; if (an) an.selector.unit = e.target.value; }, 'Animator unit'); return; }
    if (d.anshape !== undefined) { actions.patchSelected((c) => { const an = c.text?.animators?.[Number(d.anshape)]; if (an) an.selector.shape = e.target.value; }, 'Selector shape'); return; }
    if (d.anrandom !== undefined) { actions.patchSelected((c) => { const an = c.text?.animators?.[Number(d.anrandom)]; if (an) an.selector.random = e.target.checked ? 3 : 0; }, 'Random order'); }
  });
}

function readAnimator(clip, key) {
  return key.split('.').reduce((o, kk) => (o ? o[kk] : undefined), clip.text?.animators);
}

function writeAnimator(clip, key, value) {
  if (clip.kind !== 'title') return;
  const prop = `text.animators.${key}`;
  if (clip.keyframes?.[prop]?.length) {
    setKeyframe(clip, prop, Math.max(0, Math.min(clip.dur, S.time - clip.start)), value);
    return;
  }
  const parts = key.split('.');
  let node = clip.text.animators;
  for (let i = 0; i < parts.length - 1; i++) node = node?.[parts[i]];
  if (node) node[parts.at(-1)] = value;
}

function selectedTitle() {
  return [...S.sel].map((id) => clipById(S.project, id)).find((c) => c?.kind === 'title') || null;
}

function useStyle(styleId) {
  if (!selectedTitle()) {
    addTitle('headline', { quiet: true });
  }
  const before = selectedTitle();
  actions.patchSelected((c) => { if (c.kind === 'title') applyTextStyle(c.text, styleId); }, `Text style: ${styleId}`);
  if (before) toast('Style applied', 'ok');
}

function useAnim(anim) {
  if (!selectedTitle()) addTitle('headline', { quiet: true });
  actions.patchSelected((c) => { if (c.kind === 'title') c.text.anim = anim; }, `Text animation: ${anim}`);
}

/* ------------------------------------------------------------------ */
/* stickers                                                            */
/* ------------------------------------------------------------------ */

export function stickerEditor(clip) {
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
      ${reactEditor(st)}
    </div>`;
}

/*
 * Reacting to a tracked subject.
 *
 * Only offered once there is a track to react to; before that the section
 * says how to get one rather than showing an empty list. The mode is the
 * whole idea — hover, orbit, lean, trail, point at — and the amount and the
 * offset are the two numbers that tune it.
 */
function reactEditor(st) {
  const tracks = S.project.motionTracks || [];
  const r = st.react || null;
  if (!tracks.length) {
    return `<p class="tiny muted" style="margin:12px 0 0">
      <b>React to something:</b> track a subject first (Inspector → Track), then come back here and this
      sticker can hover over it, orbit it, lean into its motion, trail behind it or point at it.</p>`;
  }
  const options = [['', 'Nothing — stay put'], ...tracks.map((tr) => [tr.id, tr.name])];
  return `
    <div style="margin-top:12px;border-top:1px solid var(--line-soft);padding-top:10px">
      <div class="field"><label for="s-react-track">React to</label>
        <select class="input" id="s-react-track" data-react="trackId">
          ${options.map(([v, n]) => `<option value="${esc(v)}" ${(r?.trackId || '') === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}
        </select></div>
      ${r?.trackId ? `
      <div class="field"><label for="s-react-mode">How</label>
        <select class="input" id="s-react-mode" data-react="mode">
          ${STICKER_REACTIONS.map(([id, name, blurb]) => `<option value="${esc(id)}" title="${esc(blurb)}" ${r.mode === id ? 'selected' : ''}>${esc(name)}</option>`).join('')}
        </select></div>
      <p class="tiny muted" style="margin:-4px 0 8px">${esc(STICKER_REACTIONS.find(([id]) => id === r.mode)?.[2] || '')}</p>
      ${slider({ key: 'amount', label: 'Amount', value: r.amount ?? 0.5, min: 0, max: 1, step: 0.02,
        fmt: (v) => `${Math.round(v * 100)}%` }).replace('data-k=', 'data-react=')}
      ${slider({ key: 'offsetX', label: 'Offset across', value: r.offsetX || 0, min: -0.4, max: 0.4, step: 0.01,
        fmt: (v) => `${Math.round(v * 100)}%` }).replace('data-k=', 'data-react=')}
      ${slider({ key: 'offsetY', label: 'Offset down', value: r.offsetY || 0, min: -0.4, max: 0.4, step: 0.01,
        fmt: (v) => `${Math.round(v * 100)}%` }).replace('data-k=', 'data-react=')}` : ''}
    </div>`;
}

/*
 * The sticker editor's listeners, shared with the Stickers tab: the same
 * sliders write the same fields whichever panel they sit in, so a sticker
 * placed from one and tuned in the other is one sticker with one history.
 */
export function wireStickerEditor(host) {
    const writeReact = (key, value, label) => {
      actions.patchSelected((c) => {
        if (c.kind !== 'sticker') return;
        if (key === 'trackId') {
          c.sticker.react = value ? { ...(c.sticker.react || defaultReact(value, 'hover')), trackId: value } : null;
          return;
        }
        if (!c.sticker.react) return;
        c.sticker.react[key] = (key === 'mode') ? value : Number(value);
      }, label, key === 'mode' || key === 'trackId' ? null : `react:${key}`);
    };
    host.addEventListener('input', (e) => {
      const rk = e.target.dataset.react;
      if (rk && e.target.type === 'range') {
        writeReact(rk, e.target.value, `Sticker reaction ${rk}`);
        const label = host.querySelector(`[data-val="${CSS.escape(rk)}"]`);
        if (label) label.textContent = `${Math.round(Number(e.target.value) * 100)}%`;
        return;
      }
      const key = e.target.dataset.sk;
      if (!key) return;
      const value = e.target.type === 'range' ? Number(e.target.value) : e.target.value;
      actions.patchSelected((c) => { if (c.kind === 'sticker') c.sticker[key] = value; },
        `Sticker ${key}`, `sticker:${key}`);
      const label = host.querySelector(`[data-val="${CSS.escape(key)}"]`);
      if (label && e.target.type === 'range') label.textContent = String(Math.round(value * 100) / 100);
    });
    host.addEventListener('change', (e) => {
      const rk = e.target.dataset.react;
      if (rk && e.target.tagName === 'SELECT') { writeReact(rk, e.target.value, rk === 'trackId' ? 'Sticker reacts to track' : 'Sticker reaction'); return; }
      const key = e.target.dataset.sk;
      if (key && (e.target.tagName === 'SELECT' || e.target.type === 'color')) {
        actions.patchSelected((c) => { if (c.kind === 'sticker') c.sticker[key] = e.target.value; }, 'Edit sticker');
      }
    });
}

export function addSticker(kind, value) {
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
