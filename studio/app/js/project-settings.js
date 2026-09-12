/*
 * Project settings: the composition dialog.
 *
 * Everything about the canvas in one place, the way a compositor asks for
 * it: a preset that names the destination, the size in pixels with the
 * shape held while one number changes, the frame rate including the
 * broadcast fractions, the preview resolution, the start timecode, the
 * length as it stands, and the colour behind the picture. The start screen
 * asks the same questions before there is a project; this is where they
 * are answered afterwards, and it says what each change costs — a new
 * shape re-frames every shot, a new rate re-times nothing but changes what
 * a frame is.
 *
 * The presets are named for where the picture is going and what it is,
 * not for a vendor: the sizes and rates are the industry's, the names are
 * ours.
 */

import { $, $$, esc, modal, closeModal, toast, tc } from './ui.js';
import { S, actions } from './main.js';
import { RATIOS, duration } from './engine/project.js';

export const PRESETS = [
  { group: 'Social', name: 'Vertical HD',         w: 1080, h: 1920, fps: 30 },
  { group: 'Social', name: 'Vertical HD 60',      w: 1080, h: 1920, fps: 60 },
  { group: 'Social', name: 'Vertical 4K',         w: 2160, h: 3840, fps: 30 },
  { group: 'Social', name: 'Square HD',           w: 1080, h: 1080, fps: 30 },
  { group: 'Social', name: 'Portrait 4:5',        w: 1080, h: 1350, fps: 30 },
  { group: 'Social', name: 'Landscape HD',        w: 1920, h: 1080, fps: 30 },
  { group: 'HD',     name: 'HD 1080p · 23.976',   w: 1920, h: 1080, fps: 23.976 },
  { group: 'HD',     name: 'HD 1080p · 24',       w: 1920, h: 1080, fps: 24 },
  { group: 'HD',     name: 'HD 1080p · 25',       w: 1920, h: 1080, fps: 25 },
  { group: 'HD',     name: 'HD 1080p · 29.97',    w: 1920, h: 1080, fps: 29.97 },
  { group: 'HD',     name: 'HD 1080p · 50',       w: 1920, h: 1080, fps: 50 },
  { group: 'HD',     name: 'HD 1080p · 59.94',    w: 1920, h: 1080, fps: 59.94 },
  { group: 'HD',     name: 'HD 1080p · 60',       w: 1920, h: 1080, fps: 60 },
  { group: 'HD',     name: 'HD 720p · 30',        w: 1280, h: 720,  fps: 30 },
  { group: 'HD',     name: 'HD 720p · 60',        w: 1280, h: 720,  fps: 60 },
  { group: 'UHD',    name: 'QHD 1440p · 30',      w: 2560, h: 1440, fps: 30 },
  { group: 'UHD',    name: 'UHD 4K · 23.976',     w: 3840, h: 2160, fps: 23.976 },
  { group: 'UHD',    name: 'UHD 4K · 24',         w: 3840, h: 2160, fps: 24 },
  { group: 'UHD',    name: 'UHD 4K · 25',         w: 3840, h: 2160, fps: 25 },
  { group: 'UHD',    name: 'UHD 4K · 29.97',      w: 3840, h: 2160, fps: 29.97 },
  { group: 'UHD',    name: 'UHD 4K · 30',         w: 3840, h: 2160, fps: 30 },
  { group: 'UHD',    name: 'UHD 4K · 50',         w: 3840, h: 2160, fps: 50 },
  { group: 'UHD',    name: 'UHD 4K · 60',         w: 3840, h: 2160, fps: 60 },
  { group: 'UHD',    name: 'UHD 8K · 24',         w: 7680, h: 4320, fps: 24 },
  { group: 'Cinema', name: 'Scope 2.39 · 24',     w: 3840, h: 1606, fps: 24 },
  { group: 'Cinema', name: 'Scope 2.39 · 25',     w: 3840, h: 1606, fps: 25 },
  { group: 'Cinema', name: 'Scope HD · 24',       w: 1920, h: 803,  fps: 24 },
];

export const RATES = [
  [23.976, '23.976'], [24, '24'], [25, '25'], [29.97, '29.97'], [30, '30'], [48, '48'], [50, '50'], [59.94, '59.94'], [60, '60'], [120, '120'],
];

/** The shape a size belongs to, or null when it is not one of the five. */
export function shapeFor(w, h) {
  if (!(w > 0 && h > 0)) return null;
  const aspect = w / h;
  let best = null, gap = Infinity;
  for (const [id, r] of Object.entries(RATIOS)) {
    const d = Math.abs(aspect - r.w / r.h) / (r.w / r.h);
    if (d < gap) { gap = d; best = id; }
  }
  return gap < 0.02 ? best : null;
}

/* hh:mm:ss:ff <-> seconds, on the project's timebase. */
export function parseTimecode(text, fps) {
  const m = String(text || '').trim().match(/^(\d{1,2})[:;](\d{1,2})[:;](\d{1,2})(?:[:;.](\d{1,3}))?$/);
  if (!m) return null;
  const base = Math.round(fps);
  const [, hh, mm, ss, ff] = m;
  return Number(hh) * 3600 + Number(mm) * 60 + Number(ss) + (Number(ff || 0) / Math.max(1, base));
}

export function openProjectSettings() {
  const st = S.project.settings;
  const fps = st.fps || 30;
  const known = RATES.some(([v]) => v === fps);
  const body = modal(`
    <div class="ps">
      <h3 style="margin:0 0 2px">Project settings</h3>
      <p class="tiny muted" style="margin:0 0 14px">The canvas, the clock and the colour behind the picture. A new shape re-frames every shot; a new rate changes what a frame is and nothing else.</p>

      <div class="field"><label for="ps-name">Name</label><input class="input" id="ps-name" value="${esc(S.project.name)}" maxlength="80"></div>

      <div class="field"><label for="ps-preset">Preset</label>
        <select class="input" id="ps-preset">
          <option value="">Custom</option>
          ${[...new Set(PRESETS.map((p) => p.group))].map((g) => `<optgroup label="${esc(g)}">${PRESETS.filter((p) => p.group === g).map((p, i) => `<option value="${esc(`${p.w}x${p.h}@${p.fps}`)}" ${p.w === st.width && p.h === st.height && p.fps === fps ? 'selected' : ''}>${esc(p.name)} · ${p.w}×${p.h} · ${p.fps} fps</option>`).join('')}</optgroup>`).join('')}
        </select></div>

      <div class="ps-grid">
        <div class="field"><label for="ps-w">Width</label><input class="input mono" type="number" id="ps-w" min="64" max="8192" step="2" value="${st.width}"></div>
        <div class="field"><label for="ps-h">Height</label><input class="input mono" type="number" id="ps-h" min="64" max="8192" step="2" value="${st.height}"></div>
        <label class="tiny ps-lock"><input type="checkbox" id="ps-lock" checked> Lock shape to <b id="ps-shape">${esc(st.ratio)}</b></label>
      </div>
      <p class="tiny muted" id="ps-info" style="margin:-4px 0 10px"></p>

      <div class="ps-grid">
        <div class="field"><label for="ps-fps">Frame rate</label>
          <select class="input" id="ps-fps">
            ${RATES.map(([v, l]) => `<option value="${v}" ${v === fps ? 'selected' : ''}>${l} fps${v === 23.976 || v === 29.97 || v === 59.94 ? ' · broadcast' : ''}</option>`).join('')}
            <option value="custom" ${known ? '' : 'selected'}>Custom…</option>
          </select></div>
        <div class="field" id="ps-fps-custom-wrap" ${known ? 'hidden' : ''}><label for="ps-fps-custom">Custom rate</label><input class="input mono" type="number" id="ps-fps-custom" min="1" max="240" step="0.001" value="${fps}"></div>
        <div class="field"><label for="ps-quality">Preview</label>
          <select class="input" id="ps-quality">
            <option value="auto">Auto</option><option value="full">Full</option><option value="half">Half</option>
          </select></div>
      </div>
      <p class="tiny muted" style="margin:-4px 0 10px">Pixels are square. Drop-frame counting is shown for 29.97 and 59.94; the file is never changed by it.</p>

      <div class="ps-grid">
        <div class="field"><label for="ps-tc">Start timecode</label><input class="input mono" id="ps-tc" value="${esc(tc(st.startTc || 0, fps))}" placeholder="00:00:00:00"></div>
        <div class="field"><label>Length</label><input class="input mono" value="${esc(tc(duration(S.project), fps))}" readonly title="The timeline is as long as what is on it"></div>
        <div class="field"><label for="ps-bg">Background</label>
          <span class="start-colour"><input type="color" id="ps-bg" value="${esc(st.background || '#000000')}"><em id="ps-bg-name">${esc(st.background || '#000000')}</em></span></div>
      </div>

      <p class="tiny" id="ps-err" style="color:var(--bad);min-height:16px;margin:0 0 8px"></p>
      <div class="btn-row" style="justify-content:flex-end">
        <button class="btn btn-sm" type="button" data-x="cancel">Cancel</button>
        <button class="btn btn-sm btn-primary" type="button" data-x="ok">Apply</button>
      </div>
    </div>`);

  const w = $('#ps-w', body), h = $('#ps-h', body), lock = $('#ps-lock', body), shape = $('#ps-shape', body), info = $('#ps-info', body);
  const fpsSel = $('#ps-fps', body), fpsCustom = $('#ps-fps-custom', body), fpsWrap = $('#ps-fps-custom-wrap', body);
  const preset = $('#ps-preset', body);
  $('#ps-quality', body).value = $('#quality')?.value || 'auto';
  let held = shapeFor(Number(w.value), Number(h.value)) || st.ratio;

  const paint = () => {
    const W = Number(w.value), H = Number(h.value);
    const r = shapeFor(W, H);
    shape.textContent = r || 'none of the five';
    const mb = (W * H * 4) / 1048576;
    info.textContent = W > 0 && H > 0
      ? `${W} × ${H} · ${(W / H).toFixed(3)}:1 · ${mb.toFixed(1)} MB per 8-bit frame${r ? '' : ' · pick a size in one of the five shapes'}`
      : '';
  };
  const readFps = () => (fpsSel.value === 'custom' ? Number(fpsCustom.value) : Number(fpsSel.value));
  paint();

  w.addEventListener('input', () => {
    if (lock.checked) { const r = RATIOS[held]; if (r && Number(w.value) > 0) h.value = Math.round((Number(w.value) * r.h) / r.w / 2) * 2; }
    preset.value = '';
    paint();
  });
  h.addEventListener('input', () => {
    if (lock.checked) { const r = RATIOS[held]; if (r && Number(h.value) > 0) w.value = Math.round((Number(h.value) * r.w) / r.h / 2) * 2; }
    preset.value = '';
    paint();
  });
  lock.addEventListener('change', () => { if (lock.checked) held = shapeFor(Number(w.value), Number(h.value)) || held; });
  preset.addEventListener('change', () => {
    const m = preset.value.match(/^(\d+)x(\d+)@([\d.]+)$/);
    if (!m) return;
    w.value = m[1]; h.value = m[2];
    held = shapeFor(Number(m[1]), Number(m[2])) || held;
    const rate = Number(m[3]);
    if (RATES.some(([v]) => v === rate)) { fpsSel.value = String(rate); fpsWrap.hidden = true; }
    else { fpsSel.value = 'custom'; fpsCustom.value = rate; fpsWrap.hidden = false; }
    paint();
  });
  fpsSel.addEventListener('change', () => { fpsWrap.hidden = fpsSel.value !== 'custom'; if (fpsSel.value === 'custom') fpsCustom.focus(); });
  $('#ps-bg', body).addEventListener('input', (e) => { $('#ps-bg-name', body).textContent = e.target.value; });

  $('[data-x="cancel"]', body).addEventListener('click', closeModal);
  $('[data-x="ok"]', body).addEventListener('click', () => {
    const err = $('#ps-err', body);
    const W = Math.round(Number(w.value) / 2) * 2, H = Math.round(Number(h.value) / 2) * 2;
    const ratio = shapeFor(W, H);
    if (!ratio) { err.textContent = 'That size is not one of the five shapes the editor knows (9:16, 16:9, 1:1, 4:5, 2.39:1). Pick a preset, or lock the shape and change one number.'; return; }
    const rate = readFps();
    if (!(rate >= 1 && rate <= 240)) { err.textContent = 'The frame rate needs to be between 1 and 240.'; return; }
    const startTc = parseTimecode($('#ps-tc', body).value, rate);
    if (startTc === null) { err.textContent = 'The start timecode reads hh:mm:ss:ff.'; return; }
    actions.applyProjectSettings({
      name: $('#ps-name', body).value.trim() || S.project.name,
      ratio, width: W, height: H, fps: rate, startTc,
      background: $('#ps-bg', body).value,
      quality: $('#ps-quality', body).value,
    });
    closeModal();
    toast('Project settings applied', 'ok');
  });
  void $$;
}
