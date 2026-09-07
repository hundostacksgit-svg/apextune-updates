/*
 * Display test — monitor, laptop screen, phone, or the TV a console is plugged
 * into. Everything here is judged by eye, so each test says what a fault looks
 * like rather than just showing a colour and leaving you to guess.
 */
import { $, esc, toast } from '../ui.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TESTS = [
  {
    id: 'dead', name: 'Dead & stuck pixels', time: '~1 min',
    what: 'Solid colours, one at a time. A dead pixel stays black on every screen; a stuck one stays one colour.',
    look: 'Look for any dot that does not match its background. Get close — they are small.',
  },
  {
    id: 'bleed', name: 'Backlight bleed', time: '~30 sec',
    what: 'Pure black in a dark room. LCD panels leak light around the edges.',
    look: 'Cloudy patches or bright corners. A little is normal on LCD; large glowing areas are not. OLED shows none at all.',
  },
  {
    id: 'uniformity', name: 'Uniformity', time: '~40 sec',
    what: 'Flat grey at several levels. Reveals patchiness a photo would hide.',
    look: 'Blotches, tinted corners, or a visible grid. Slight vignetting at the edges is normal.',
  },
  {
    id: 'banding', name: 'Colour banding', time: '~30 sec',
    what: 'Smooth gradients. A panel with poor colour depth shows steps instead of a smooth fade.',
    look: 'Visible stripes rather than a continuous blend, especially in the darker half.',
  },
  {
    id: 'ghost', name: 'Ghosting & response', time: '~30 sec',
    what: 'A block moving across the screen at speed.',
    look: 'A smeared trail behind the block means slow pixel response. Some blur is normal; a long tail is not.',
  },
  {
    id: 'contrast', name: 'Black level', time: '~30 sec',
    what: 'Near-black steps. Tests whether dark detail survives.',
    look: 'You should be able to count distinct steps. If the darkest few merge into one black, your brightness or contrast is crushing shadow detail.',
  },
  {
    id: 'sharp', name: 'Text clarity', time: '~20 sec',
    what: 'Fine text and a one-pixel grid.',
    look: 'Fuzzy text or coloured fringes usually mean the display is not running at its native resolution — a common and fixable problem.',
  },
];

export async function mount(host) {
  const state = { cleanup: [], raf: null, results: {} };

  const api = {
    destroy() {
      cancelAnimationFrame(state.raf);
      state.cleanup.forEach((fn) => { try { fn(); } catch { /* already gone */ } });
      state.cleanup = [];
      document.querySelector('.fullscreen-test')?.remove();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    },
  };

  function measureHz() {
    return new Promise((resolve) => {
      let f = 0;
      const t0 = performance.now();
      const tick = () => {
        f++;
        if (performance.now() - t0 < 900) requestAnimationFrame(tick);
        else resolve(Math.round((f * 1000) / (performance.now() - t0)));
      };
      requestAnimationFrame(tick);
    });
  }

  function overlay(bg = '#000') {
    const el = document.createElement('div');
    el.className = 'fullscreen-test';
    el.style.cssText = `position:fixed;inset:0;z-index:300;background:${bg};mix-blend-mode:normal;
      display:grid;place-items:center;overflow:hidden;cursor:pointer`;
    document.body.appendChild(el);
    el.requestFullscreen?.().catch(() => { /* fullscreen refused; still usable */ });
    const close = () => {
      el.remove();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
    state.cleanup.push(close);
    return { el, close };
  }

  function hud(text, sub = '') {
    return `<div style="position:absolute;left:0;right:0;bottom:6vh;text-align:center;
      font-size:16px;color:#888;pointer-events:none;text-shadow:0 1px 3px #000">
      ${esc(text)}${sub ? `<br><span style="font-size:13px;opacity:.75">${esc(sub)}</span>` : ''}</div>`;
  }

  function finish(id, el, close) {
    close();
    state.results[id] = true;
    render();
    toast('Test finished — mark what you saw', 'ok');
  }

  /* ---------------- individual tests ---------------- */

  const RUN = {
    dead() {
      const colors = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff',
                      '#ffff00', '#00ffff', '#ff00ff'];
      let i = 0;
      const { el, close } = overlay(colors[0]);
      const paint = () => {
        el.style.background = colors[i];
        el.innerHTML = hud(`${i + 1} of ${colors.length} — tap for the next colour`,
          'Any dot that does not match is a dead or stuck pixel');
      };
      paint();
      el.onclick = () => { i++; i >= colors.length ? finish('dead', el, close) : paint(); };
    },

    bleed() {
      const { el, close } = overlay('#000');
      el.innerHTML = hud('Turn the lights off and look at the edges and corners',
        'Tap to finish');
      el.onclick = () => finish('bleed', el, close);
    },

    uniformity() {
      const levels = ['#141414', '#3c3c3c', '#7f7f7f', '#bdbdbd', '#e8e8e8'];
      let i = 0;
      const { el, close } = overlay(levels[0]);
      const paint = () => {
        el.style.background = levels[i];
        el.innerHTML = hud(`Grey ${i + 1} of ${levels.length} — tap for the next`,
          'Look for blotches or tinted corners');
      };
      paint();
      el.onclick = () => { i++; i >= levels.length ? finish('uniformity', el, close) : paint(); };
    },

    banding() {
      const { el, close } = overlay('#000');
      el.innerHTML = `
        <div style="position:absolute;inset:0;display:flex;flex-direction:column">
          <div style="flex:1;background:linear-gradient(90deg,#000,#fff)"></div>
          <div style="flex:1;background:linear-gradient(90deg,#000,#f00)"></div>
          <div style="flex:1;background:linear-gradient(90deg,#000,#0f0)"></div>
          <div style="flex:1;background:linear-gradient(90deg,#000,#00f)"></div>
        </div>${hud('Smooth fade, or visible stripes?', 'Tap to finish')}`;
      el.onclick = () => finish('banding', el, close);
    },

    ghost() {
      const { el, close } = overlay('#101010');
      el.innerHTML = `<div id="gbox" style="position:absolute;top:50%;left:0;width:150px;height:150px;
        margin-top:-75px;background:#fff;border-radius:12px"></div>
        ${hud('Watch for a smeared trail behind the block', 'Tap to finish')}`;
      const box = el.querySelector('#gbox');
      const t0 = performance.now();
      const anim = () => {
        const w = window.innerWidth - 150;
        const p = ((performance.now() - t0) / 1800) % 2;
        box.style.transform = `translateX(${(p < 1 ? p : 2 - p) * w}px)`;
        state.raf = requestAnimationFrame(anim);
      };
      anim();
      el.onclick = () => { cancelAnimationFrame(state.raf); finish('ghost', el, close); };
    },

    contrast() {
      const steps = [0, 4, 8, 12, 16, 20, 26, 32, 40, 50];
      const { el, close } = overlay('#000');
      el.innerHTML = `<div style="position:absolute;inset:0;display:flex">
        ${steps.map((v) => `<div style="flex:1;background:rgb(${v},${v},${v});
          display:flex;align-items:flex-end;justify-content:center;padding-bottom:14vh;
          color:#666;font-size:13px">${v}</div>`).join('')}</div>
        ${hud('How many separate steps can you count?', 'All ten means your black level is right. Tap to finish')}`;
      el.onclick = () => finish('contrast', el, close);
    },

    sharp() {
      const { el, close } = overlay('#fff');
      el.innerHTML = `
        <div style="position:absolute;inset:0;background:
          repeating-linear-gradient(0deg,#000 0 1px,#fff 1px 2px)"></div>
        <div style="position:relative;background:#fff;padding:26px 30px;border-radius:10px;
          max-width:80vw;color:#000;font-size:15px;line-height:1.5;text-align:center">
          <div style="font-weight:700;margin-bottom:8px">Text clarity check</div>
          The quick brown fox jumps over the lazy dog. 0123456789.<br>
          Fuzzy edges or colour fringing usually means the display is not running
          at its native resolution.
        </div>
        ${hud('The background should be an even grey, not a shimmering pattern', 'Tap to finish')}`;
      el.onclick = () => finish('sharp', el, close);
    },
  };

  /* ---------------- screen ---------------- */

  function render() {
    const dpr = devicePixelRatio || 1;
    const done = Object.keys(state.results).length;
    host.innerHTML = `
      <h1>Display Test</h1>
      <p class="sub">Works on a monitor, a laptop screen, a phone — or the TV your console is
         plugged into. Run these in a dark room for the best read.</p>

      <div class="rows">
        ${[['Reported resolution', `${screen.width} × ${screen.height}`],
           ['Actual pixels', `${Math.round(screen.width * dpr)} × ${Math.round(screen.height * dpr)}`],
           ['Pixel ratio', `${dpr}×`],
           ['Colour depth', `${screen.colorDepth}-bit`]]
          .map(([k, v]) => `<div class="row"><span class="rk">${esc(k)}</span><span class="rv">${esc(v)}</span></div>`)
          .join('')}
        <div class="row"><span class="rk">Refresh rate</span>
          <span class="rv" id="hz">measuring…</span></div>
      </div>

      <h2>Tests${done ? ` · ${done} of ${TESTS.length} run` : ''}</h2>
      ${TESTS.map((t) => `
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
            <h3>${esc(t.name)}</h3>
            ${state.results[t.id] ? '<span class="badge ok">Run</span>'
              : `<span class="badge idle">${esc(t.time)}</span>`}
          </div>
          <div class="small muted" style="margin-top:5px">${esc(t.what)}</div>
          <div class="small" style="margin-top:8px;color:var(--accent)">
            <strong>What a fault looks like:</strong> <span class="muted">${esc(t.look)}</span></div>
          <button class="btn" data-run="${esc(t.id)}" style="margin-top:12px">
            ${state.results[t.id] ? 'Run again' : 'Start'}</button>
        </div>`).join('')}

      <div class="note warn">
        <strong>Fullscreen matters.</strong> Each test goes fullscreen so browser chrome doesn't
        hide edge problems. If your browser blocks it, the test still runs — just ignore the bars.
      </div>`;

    host.querySelectorAll('[data-run]').forEach((b) => {
      b.onclick = () => RUN[b.dataset.run]?.();
    });
    measureHz().then((hz) => {
      const el = $('#hz', host);
      if (el) el.textContent = `${hz} Hz measured`;
    });
  }

  render();
  return api;
}
