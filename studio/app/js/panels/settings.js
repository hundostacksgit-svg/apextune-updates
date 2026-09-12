/*
 * Settings, projects and the account, in one panel.
 *
 * Kept together on purpose: "where is that setting" is one of the loudest
 * complaints about every editor, and the answer here is always the same place,
 * plus Ctrl+K.
 */

import { $, $$, esc, toast, bytes, confirmDialog, selectRow } from '../ui.js';

/*
 * Frame rates worth offering, and why each is here.
 *
 * 23.976 and 29.97 are not rounding errors — they are the real rates of
 * anything that has been near American broadcast, and editing 23.976 footage on
 * a 24 timeline drifts by a frame every 41 seconds. Anyone who has been handed
 * a camera original knows to look for them, and their absence is the first sign
 * a tool is not serious.
 */
const FPS_OPTIONS = [
  [23.976, '23.976 — film, NTSC'],
  [24, '24 — film'],
  [25, '25 — PAL, Europe'],
  [29.97, '29.97 — NTSC broadcast'],
  [30, '30 — the safe default'],
  [48, '48 — high frame rate film'],
  [50, '50 — PAL, smooth'],
  [59.94, '59.94 — NTSC, smooth'],
  [60, '60 — gaming and sport'],
  [120, '120 — for slowing down later'],
];
import { S, actions, paintAccount } from '../main.js';
import * as store from '../store.js';
import * as levels from '../levels.js';
import * as licence from '../licence.js';
import { RATIOS } from '../engine/project.js';
import { API, setApiBase, EDITIONS, buyUrl, DEVICE_LIMIT } from '../../../assets/config.js';
import * as auth from '../../../assets/auth.js';

export function mount(host) {
  const st = S.project.settings;
  const ed = licence.edition();

  host.innerHTML = `
    <div class="panel-h"><h2>Settings</h2></div>

    <details class="group" open>
      <summary>This project</summary>
      <div class="gbody">
        <div class="field"><label for="s-name">Name</label>
          <input class="input" id="s-name" value="${esc(S.project.name)}"></div>
        ${selectRow({ key: 'ratio', label: 'Aspect ratio', value: st.ratio,
          options: Object.entries(RATIOS).map(([id, r]) => [id, `${id} — ${r.label}`]) })}
        ${selectRow({ key: 'fps', label: 'Frame rate', value: st.fps,
          options: FPS_OPTIONS })}
        <p class="tiny muted" style="margin:-6px 0 12px">
          This is the timeline's own rate — what a frame step moves by, what the timecode counts,
          and what motion blur uses as its shutter. Export can still be any rate you like.
        </p>
        <div class="field"><label for="s-bg">Background</label>
          <input class="input" type="color" id="s-bg" value="${esc(st.background)}"></div>
        <div class="btn-row">
          <button class="btn btn-sm" id="s-save-file">Save project file</button>
          <button class="btn btn-sm btn-primary" id="s-bundle">Save bundle (with footage)</button>
          <button class="btn btn-sm btn-ghost" id="s-open-file">Open a file or bundle</button>
        </div>
        <p class="tiny muted" style="margin:9px 0 0">
          A <b>project file</b> is readable JSON — small, but it needs the footage already on the
          other machine. A <b>bundle</b> carries the footage with it, so a project opens intact on
          your phone, someone else's laptop, or a desktop install. It is also an ordinary ZIP:
          rename it and any computer opens it, with or without this app.
        </p>
      </div>
    </details>

    <details class="group">
      <summary>Projects</summary>
      <div class="gbody" id="s-projects">
        <p class="tiny muted">Loading…</p>
      </div>
    </details>

    <details class="group">
      <summary>Account &amp; licence</summary>
      <div class="gbody">
        <div class="note ${ed === 'free' ? '' : 'ok'}" style="margin-top:0">
          <b>${esc(EDITIONS[ed].name)} edition</b> — ${esc(EDITIONS[ed].blurb)}
        </div>
        ${auth.isSignedIn()
          ? `<p class="tiny muted">Signed in as ${esc(auth.session()?.email || 'this device')}.
             ${DEVICE_LIMIT[ed]} device${DEVICE_LIMIT[ed] === 1 ? '' : 's'} allowed.</p>
             <div class="btn-row"><button class="btn btn-sm btn-ghost" id="s-signout">Sign out</button></div>`
          : `<p class="tiny muted">You don't need an account to edit. It exists to move a paid
             licence between your devices. Signed up on another device? Get a <b>move code</b> from its
             Account page and paste it on the Account page here.</p>`}
        <div class="field" style="margin-top:12px">
          <label for="s-key">Licence key</label>
          <input class="input mono" id="s-key" placeholder="OMNIDX-STU-XXXX-XXXX-XXXX"
            style="text-transform:uppercase">
        </div>
        <div class="btn-row" style="margin-top:0">
          <button class="btn btn-sm" id="s-redeem">Unlock</button>
          <a class="btn btn-sm btn-ghost" href="../account/" target="_blank" rel="noopener">Account page</a>
        </div>
        ${ed !== 'studio' ? `<div class="btn-row">
          <a class="btn btn-sm btn-primary btn-full" href="${esc(buyUrl(ed === 'free' ? 'creator' : 'studio'))}"
             target="_blank" rel="noopener">
            Get ${esc(ed === 'free' ? 'Creator' : 'Studio')} —
            $${(ed === 'free' ? EDITIONS.creator.once : EDITIONS.studio.once).toFixed(2)}</a>
        </div>` : ''}
        <p class="tiny muted" style="margin:10px 0 0">
          AI actions this month: ${licence.aiLimit() === Infinity ? 'unlimited'
            : `${licence.aiLimit() - licence.aiRemaining()} of ${licence.aiLimit()} used`}.
        </p>
      </div>
    </details>

    <details class="group">
      <summary>Skill level</summary>
      <div class="gbody">
        ${levels.LEVELS.map((l) => `
          <label style="display:flex;gap:9px;align-items:flex-start;padding:8px 0;cursor:pointer">
            <input type="radio" name="lvl" value="${l}" ${levels.current() === l ? 'checked' : ''}
              style="margin-top:3px">
            <span><b style="font-size:12.5px">${esc(levels.DESCRIPTIONS[l].name)}</b>
              <br><span class="tiny muted">${esc(levels.DESCRIPTIONS[l].line)}</span></span>
          </label>`).join('')}
      </div>
    </details>

    <details class="group">
      <summary>Playback &amp; proxies</summary>
      <div class="gbody" id="s-proxies">
        <p class="tiny muted" style="margin-top:0">
          A proxy is a small copy of a big clip, used only while you edit. Export always goes back
          to the original — a proxy can never end up in your finished video.
        </p>
        <label style="display:flex;gap:8px;align-items:center;font-size:12.5px;margin:10px 0">
          <input type="checkbox" id="s-proxy-on" checked> Use proxies while editing</label>
        <div id="s-proxy-list"></div>
      </div>
    </details>

    <details class="group">
      <summary>Storage</summary>
      <div class="gbody" id="s-storage"><p class="tiny muted">Checking…</p></div>
    </details>

    <details class="group" data-min="expert">
      <summary>Cloud brain (optional)</summary>
      <div class="gbody">
        <p class="tiny muted" style="margin-top:0">
          Point this copy at your own OmniDx Worker for free-form AI phrasing, transcription and
          cross-device sync. Leave it empty and everything runs on this device. The code for the
          Worker is in <span class="mono">server/</span> in the repository.
        </p>
        <div class="field">
          <label for="s-api">Worker URL</label>
          <input class="input mono" id="s-api" placeholder="https://api.omnidx.net"
            value="${esc(API.base)}">
        </div>
        <div class="btn-row" style="margin-top:0">
          <button class="btn btn-sm" id="s-api-save">Save</button>
        </div>
      </div>
    </details>`;

  wire(host);
  paintProjects(host);
  paintStorage(host);
  paintProxies(host);
}

async function paintProxies(host) {
  const box = $('#s-proxy-list', host);
  if (!box) return;
  const { canProxy, shouldProxy, buildProxy } = await import('../engine/proxy.js');
  const { hasProxy, setProxyMode } = await import('../engine/media.js');

  $('#s-proxy-on', host)?.addEventListener('change', (e) => {
    setProxyMode(e.target.checked);
    actions.refresh();
  });

  if (!await canProxy()) {
    box.innerHTML = '<p class="tiny muted">This browser has no H.264 encoder, so proxies are not '
      + 'available here. Chrome, Edge or the desktop app can make them.</p>';
    return;
  }

  const big = S.project.media.filter((m) => m.kind === 'video');
  if (!big.length) { box.innerHTML = '<p class="tiny muted">No video imported yet.</p>'; return; }

  box.innerHTML = big.map((m) => `
    <div style="display:flex;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line-soft)">
      <span class="tiny" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        ${esc(m.name)} <span class="muted">${m.width || '?'}×${m.height || '?'}</span></span>
      ${hasProxy(m) ? '<span class="tiny" style="color:var(--ok)">proxy ready</span>'
        : shouldProxy(m)
          ? `<button class="btn btn-sm" data-proxy="${esc(m.id)}">Make proxy</button>`
          : '<span class="tiny muted">not needed</span>'}
    </div>`).join('');

  box.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-proxy]');
    if (!btn) return;
    const media = S.project.media.find((m) => m.id === btn.dataset.proxy);
    if (!media) return;
    btn.disabled = true;
    try {
      const out = await buildProxy(media, {
        onProgress: ({ done, total }) => { btn.textContent = `${Math.round((done / total) * 100)}%`; },
      });
      media.proxyHash = out.hash;
      const { loadProxy } = await import('../engine/proxy.js');
      await loadProxy(media);
      actions.commit('Build proxy');
      toast(`Proxy ready — ${out.width}×${out.height}, ${bytes(out.size)}`, 'ok', 4200);
    } catch (err) {
      toast(err.message, 'bad', 6000);
      btn.disabled = false;
      btn.textContent = 'Make proxy';
    }
  });
}

function wire(host) {
  $('#s-name', host).addEventListener('change', (e) => {
    S.project.name = e.target.value.trim() || 'Untitled project';
    $('#proj-name').value = S.project.name;
    actions.commit('Rename project');
  });

  host.addEventListener('change', (e) => {
    if (e.target.dataset.k === 'ratio') actions.setRatio(e.target.value);
    if (e.target.dataset.k === 'fps') {
      S.project.settings.fps = Number(e.target.value);
      actions.commit('Frame rate');
    }
    if (e.target.name === 'lvl') {
      levels.set(e.target.value);
      $$('#level-switch button').forEach((b) => b.classList.toggle('on', b.dataset.level === e.target.value));
      actions.refresh();
    }
  });

  $('#s-bg', host).addEventListener('change', (e) => {
    S.project.settings.background = e.target.value;
    actions.commit('Background colour');
  });

  $('#s-save-file', host).addEventListener('click', actions.exportProjectFile);

  $('#s-bundle', host).addEventListener('click', async () => {
    const btn = $('#s-bundle', host);
    btn.disabled = true;
    try {
      const { pack, bundleName } = await import('../engine/bundle.js');
      const blob = await pack(S.project, {
        onProgress: ({ name, done, total }) => {
          btn.textContent = name ? `Packing ${done + 1}/${total}…` : 'Writing…';
        },
      });
      const { saveBytes } = await import('../desktop.js');
      const name = bundleName(S.project);
      if (!await saveBytes(blob, name)) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 20000);
      }
      toast(`${name} — ${bytes(blob.size)}, footage included`, 'ok', 5000);
    } catch (err) {
      toast(`Could not build the bundle: ${err.message}`, 'bad', 6000);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save bundle (with footage)';
    }
  });

  $('#s-open-file', host).addEventListener('click', () => {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = '.json,.omnidxpkg,.zip,application/json,application/zip';
    picker.addEventListener('change', async () => {
      const file = picker.files?.[0];
      if (!file) return;
      try {
        // A bundle carries its footage; a bare project file does not. Told
        // apart by content, not by extension, because people rename things.
        const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
        const isZip = head[0] === 0x50 && head[1] === 0x4b;
        if (isZip) {
          toast('Opening bundle…');
          const { unpack } = await import('../engine/bundle.js');
          const { project, media } = await unpack(file);
          await actions.loadDocument(project);
          if (media.length) {
            await actions.importFiles(media.map((m) => m.file), { silent: true });
            toast(`Opened with ${media.length} file${media.length === 1 ? '' : 's'} of footage`, 'ok', 5000);
          } else {
            toast('Project opened', 'ok');
          }
        } else {
          await actions.loadDocument(JSON.parse(await file.text()));
          toast('Project opened', 'ok');
        }
      } catch (err) {
        toast(`That file could not be opened: ${err.message}`, 'bad', 6000);
      }
    });
    picker.click();
  });

  $('#s-redeem', host).addEventListener('click', async () => {
    try {
      await licence.redeem($('#s-key', host).value);
      paintAccount();
      actions.refresh();
    } catch (err) {
      toast(err.message, 'bad', 5000);
    }
  });

  $('#s-signout', host)?.addEventListener('click', async () => {
    await auth.signOut();
    paintAccount();
    actions.refresh();
    toast('Signed out');
  });

  $('#s-api-save', host)?.addEventListener('click', () => {
    const url = setApiBase($('#s-api', host).value);
    toast(url ? `Connected to ${url}` : 'Back to running everything locally', 'ok');
  });
}

async function paintProjects(host) {
  const box = $('#s-projects', host);
  if (!box) return;
  const list = await store.listProjects();
  box.innerHTML = `
    <div class="btn-row" style="margin-top:0">
      <button class="btn btn-sm btn-primary" id="s-new">＋ New project</button>
    </div>
    ${list.length ? list.map((p) => `
      <div style="display:flex;gap:8px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line-soft)">
        <span style="flex:1;min-width:0">
          <b style="font-size:12.5px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${esc(p.name)}${p.id === S.project.id ? ' · open' : ''}</b>
          <span class="tiny muted">${p.clips?.length || 0} clips ·
            ${new Date(p.updatedAt || Date.now()).toLocaleDateString()}</span>
        </span>
        ${p.id === S.project.id ? '' : `<button class="btn btn-sm" data-open="${esc(p.id)}">Open</button>`}
        <button class="btn btn-sm btn-ghost" data-del="${esc(p.id)}" title="Delete">✕</button>
      </div>`).join('') : '<p class="tiny muted" style="margin-top:10px">No saved projects yet.</p>'}`;

  $('#s-new', box).addEventListener('click', actions.newProject);

  box.addEventListener('click', async (e) => {
    const open = e.target.closest('[data-open]');
    if (open) { await actions.openProject(open.dataset.open); return; }
    const del = e.target.closest('[data-del]');
    if (!del) return;
    const ok = await confirmDialog({
      title: 'Delete this project?',
      body: 'The project is removed. The video files on your disk are not touched.',
      confirmText: 'Delete', danger: true,
    });
    if (!ok) return;
    await store.deleteProject(del.dataset.del);
    paintProjects(host);
    toast('Project deleted');
  });
}

async function paintStorage(host) {
  const box = $('#s-storage', host);
  if (!box) return;
  const used = await store.usage();
  box.innerHTML = `
    ${used ? `
      <p class="tiny muted" style="margin-top:0">
        Using ${bytes(used.used)} of about ${bytes(used.quota)} the browser will give this app.
      </p>
      <div style="height:6px;border-radius:99px;background:var(--surface-3);overflow:hidden">
        <i style="display:block;height:100%;width:${Math.min(100, (used.used / used.quota) * 100).toFixed(1)}%;
          background:var(--grad)"></i>
      </div>` : '<p class="tiny muted">This browser will not say how much space it has given us.</p>'}
    <div class="btn-row">
      <button class="btn btn-sm btn-ghost" id="s-prune">Clear unused media</button>
    </div>
    <p class="tiny muted" style="margin:8px 0 0">
      Media files are kept so projects still open after you move or rename the originals.
      Clearing removes only what no project refers to any more.
    </p>`;

  $('#s-prune', box).addEventListener('click', async () => {
    const n = await store.pruneMedia();
    toast(n ? `${n} unused file${n === 1 ? '' : 's'} cleared` : 'Nothing to clear', 'ok');
    paintStorage(host);
  });
}
