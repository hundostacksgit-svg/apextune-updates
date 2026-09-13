/*
 * Ctrl+K.
 *
 * "Where is that setting" is answered here, once, for everything: tools,
 * effects, looks, transitions, panels, project settings and your own clips are
 * all in the same list and all found by typing part of their name.
 */

import { $, $$, esc } from './ui.js';

let items = [];
let filtered = [];
let cursor = 0;

/** Fuzzy-ish: every character of the query, in order, somewhere in the label. */
function score(query, text) {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 1;
  if (t.startsWith(q)) return 1000;
  const direct = t.indexOf(q);
  if (direct >= 0) return 500 - direct;
  let qi = 0, hits = 0, last = -1;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      hits++;
      if (last === i - 1) hits++;      // reward runs
      last = i;
      qi++;
    }
  }
  return qi === q.length ? hits : -1;
}

async function build() {
  const [main, panelsMod, filters, transitions, titles, exporter] = await Promise.all([
    import('./main.js'),
    import('./panels/index.js'),
    import('./engine/filters.js'),
    import('./engine/transitions.js'),
    import('./engine/titles.js'),
    import('./panels/export.js'),
  ]);
  const { S, actions, togglePlay, setZoom } = main;

  const list = [];

  for (const [id, p] of Object.entries(panelsMod.PANELS)) {
    list.push({ icon: '▤', title: p.title, sub: 'Panel', run: () => panelsMod.openPanel(id) });
  }

  list.push(
    { icon: '▶', title: 'Play / pause', sub: 'Space', run: togglePlay },
    { icon: '⌗', title: 'Split at playhead', sub: 'S', run: actions.splitAtPlayhead },
    { icon: '🗑', title: 'Delete selected clips', sub: 'Delete', run: actions.deleteSelected },
    { icon: '⧉', title: 'Duplicate selected clips', sub: 'Ctrl+D', run: actions.duplicateSelected },
    { icon: '⚑', title: 'Add marker', sub: 'M', run: actions.addMarker },
    { icon: '↶', title: 'Undo', sub: 'Ctrl+Z', run: actions.undo },
    { icon: '↷', title: 'Redo', sub: 'Ctrl+Shift+Z', run: actions.redo },
    { icon: '⇪', title: 'Export', sub: 'Ctrl+E', run: exporter.openExport },
    { icon: '＋', title: 'Import files', sub: 'Add video, photos or music', run: () => $('#file-input').click() },
    { icon: '💾', title: 'Save project file', sub: 'Portable JSON', run: actions.exportProjectFile },
    { icon: '🆕', title: 'New project', sub: '', run: actions.newProject },
    { icon: '🔍', title: 'Fit timeline to window', sub: 'Shift+Z', run: () => $('#zoom-fit').click() },
    { icon: '🔎', title: 'Zoom in', sub: '+', run: () => setZoom(S.zoom * 1.4) },
    { icon: '◐', title: 'Toggle dark / light', sub: '', run: () => $('#btn-theme').click() },
  );

  for (const level of ['beginner', 'intermediate', 'expert']) {
    list.push({
      icon: '◧', title: `Switch to ${level}`, sub: 'Skill level',
      run: () => $(`#level-switch [data-level="${level}"]`)?.click(),
    });
  }

  for (const [id, r] of Object.entries((await import('./engine/project.js')).RATIOS)) {
    list.push({ icon: '▭', title: `Canvas ${id}`, sub: r.label, run: () => actions.setRatio(id) });
  }

  for (const look of filters.LOOKS) {
    list.push({
      icon: '🎨', title: `Look: ${look.name}`, sub: 'Colour',
      run: () => {
        const ids = S.sel.size ? [...S.sel] : S.project.clips.map((c) => c.id);
        for (const id of ids) {
          const c = S.project.clips.find((x) => x.id === id);
          if (c) { c.color.look = look.id; c.color.strength = 1; }
        }
        actions.commit(`Look: ${look.name}`);
      },
    });
  }

  for (const t of transitions.TRANSITION_LIST) {
    list.push({
      icon: t.icon, title: `Transition: ${t.name}`, sub: 'Applies to the selection',
      run: () => {
        for (const id of S.sel) {
          const c = S.project.clips.find((x) => x.id === id);
          if (c) c.transitionIn = { type: t.id, dur: Math.min(0.4, c.dur / 3) };
        }
        actions.commit(`Transition: ${t.name}`);
      },
    });
  }

  for (const preset of titles.TITLE_PRESETS) {
    list.push({
      icon: 'T', title: `Title: ${preset.name}`, sub: 'Text',
      run: () => { panelsMod.openPanel('text'); setTimeout(() => $(`[data-preset="${preset.id}"]`)?.click(), 60); },
    });
  }

  for (const m of S.project.media) {
    list.push({
      icon: m.kind === 'audio' ? '🎵' : '🎞', title: m.name, sub: 'Add to the timeline',
      run: () => actions.appendMedia(m.id),
    });
  }

  for (const marker of S.project.markers) {
    list.push({ icon: '⚑', title: marker.label, sub: 'Jump to marker', run: () => actions.seek(marker.t) });
  }

  return list;
}

export async function openPalette() {
  // A takeover the user asked for beats a menu they opened a moment ago. The
  // palette sits below the menu in the stack on purpose — menus win against
  // things that appear by themselves — so it has to say so explicitly.
  const { closeMenus } = await import('./menubar.js');
  closeMenus();
  const box = $('#palette');
  const input = $('#pal-input');
  items = await build();
  box.hidden = false;
  input.value = '';
  input.focus();
  paint('');

  const onKey = (e) => {
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); cursor = Math.min(cursor + 1, filtered.length - 1); highlight(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); cursor = Math.max(cursor - 1, 0); highlight(); }
    if (e.key === 'Enter') { e.preventDefault(); run(cursor); }
  };
  const onInput = () => paint(input.value);
  const onClickOut = (e) => { if (!e.target.closest('.pal-box')) close(); };

  input.addEventListener('keydown', onKey);
  input.addEventListener('input', onInput);
  box.addEventListener('mousedown', onClickOut);

  function close() {
    box.hidden = true;
    input.removeEventListener('keydown', onKey);
    input.removeEventListener('input', onInput);
    box.removeEventListener('mousedown', onClickOut);
  }

  function run(i) {
    const item = filtered[i];
    if (!item) return;
    close();
    try { item.run(); } catch (err) { console.error(err); }
  }

  $('#pal-list').onclick = (e) => {
    const row = e.target.closest('[data-i]');
    if (row) run(Number(row.dataset.i));
  };
}

function paint(query) {
  filtered = items
    .map((item) => ({ item, s: score(query, `${item.title} ${item.sub}`) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 40)
    .map((x) => x.item);
  cursor = 0;
  $('#pal-list').innerHTML = filtered.length
    ? filtered.map((item, i) => `
      <div class="pal-item ${i === 0 ? 'on' : ''}" data-i="${i}">
        <span class="pi">${esc(item.icon)}</span>
        <span class="pt"><b>${esc(item.title)}</b>${item.sub ? `<span>${esc(item.sub)}</span>` : ''}</span>
      </div>`).join('')
    : '<div class="pal-item"><span class="pt"><b>Nothing matches that</b></span></div>';
}

function highlight() {
  $$('#pal-list .pal-item').forEach((row, i) => row.classList.toggle('on', i === cursor));
  $$('#pal-list .pal-item')[cursor]?.scrollIntoView({ block: 'nearest' });
}
