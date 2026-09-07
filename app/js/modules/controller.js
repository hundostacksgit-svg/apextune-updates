/*
 * Controller test — PS5, Xbox, Switch Pro and generic pads over Bluetooth or USB.
 *
 * The console itself cannot be reached from a browser, but the controller can,
 * and the controller is the part that actually wears out. Stick drift is the
 * common failure and it is measurable: leave the sticks alone and watch how far
 * the reported position wanders from centre.
 */
import { $, esc, toast, rows } from '../ui.js';

const DRIFT_SAMPLE_MS = 4000;
/* A healthy stick at rest sits within a few thousandths of centre. Pads apply
   their own deadzone, so anything reported above these values is real movement
   the console can see. */
const DRIFT_OK = 0.05;
const DRIFT_BAD = 0.12;

const BUTTON_NAMES = [
  'A / Cross', 'B / Circle', 'X / Square', 'Y / Triangle',
  'L1 / LB', 'R1 / RB', 'L2 / LT', 'R2 / RT',
  'Select / Share', 'Start / Options', 'L3', 'R3',
  'D-pad Up', 'D-pad Down', 'D-pad Left', 'D-pad Right', 'Home',
];

export async function mount(host) {
  const state = { raf: null, pressed: new Set(), drift: null, driftResult: null, lastPad: null };

  const api = {
    destroy() {
      cancelAnimationFrame(state.raf);
      state.raf = null;
      state.drift = null;
    },
  };

  if (!('getGamepads' in navigator)) {
    host.innerHTML = `<h1>Controller</h1>
      <div class="note bad"><strong>This browser has no gamepad support.</strong>
      Try Chrome, Edge or Safari.</div>
      <a class="btn" href="#/home">Back</a>`;
    return api;
  }

  function pad() {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
    return pads.find((p) => p && p.connected) || null;
  }

  function driftTone(v) {
    return v <= DRIFT_OK ? 'ok' : v <= DRIFT_BAD ? 'warn' : 'bad';
  }

  function renderIdle() {
    host.innerHTML = `
      <h1>Controller Test</h1>
      <p class="sub">Works with PS5, Xbox, Switch Pro and most generic pads, over Bluetooth or USB.</p>

      <div class="card">
        <h3>Connect your controller, then press any button</h3>
        <div class="small muted" style="margin-top:6px">
          Browsers only reveal a gamepad after you press something on it — that's a privacy rule,
          not a fault. Pair it in your device's Bluetooth settings first, or plug it in.
        </div>
      </div>

      <div class="card" id="waiting" style="text-align:center;padding:34px">
        <div class="spinner" style="margin:0 auto 14px"></div>
        <div class="small muted">Waiting for a controller…</div>
      </div>

      <h2>What this checks</h2>
      ${rows([
        ['Stick drift', 'Whether the sticks report movement while untouched'],
        ['Every button', 'Confirms each one registers'],
        ['Trigger range', 'That L2/R2 sweep smoothly from 0 to 100%'],
        ['Rumble', 'If the pad exposes it to the browser'],
      ])}
      <div class="note" style="margin-top:12px">
        <strong>Consoles themselves can't be scanned from a browser.</strong> There's no way to reach a
        PS5 or Xbox over the network like this. The controller and the screen it's plugged into are the
        parts that genuinely can be tested — and they're the parts that usually fail.
      </div>`;
  }

  function renderPad(gp) {
    const axes = gp.axes || [];
    const dr = state.driftResult;
    host.innerHTML = `
      <h1>Controller Test</h1>
      <p class="sub mono">${esc(gp.id.slice(0, 60))}</p>

      <h2>Stick drift</h2>
      ${dr ? driftResultHtml(dr) : `
        <div class="note info">
          <strong>Put the controller down and don't touch it.</strong> Take your thumbs off both
          sticks completely, then start the test. It samples for four seconds.
        </div>`}
      <button class="btn ${dr ? '' : 'btn-primary'}" id="drift">
        ${state.drift ? 'Sampling…' : dr ? 'Test again' : 'Start drift test'}
      </button>
      <div id="drift-live"></div>

      <h2>Sticks</h2>
      <div class="grid" id="sticks"></div>

      <h2>Triggers</h2>
      <div id="triggers"></div>

      <h2>Buttons</h2>
      <p class="small muted" style="margin-top:-4px">Press each one — it lights up and stays lit.</p>
      <div class="btngrid" id="buttons"></div>

      <h2>Rumble</h2>
      <button class="btn" id="rumble">Test rumble</button>
      <div class="small muted" style="margin-top:8px">
        Only some browser and controller combinations expose this.
      </div>

      <div class="hr"></div>
      ${rows([
        ['Buttons reported', String((gp.buttons || []).length)],
        ['Axes reported', String(axes.length)],
        ['Mapping', gp.mapping || 'non-standard'],
      ])}`;
    wirePad();
  }

  function driftResultHtml(d) {
    const worst = Math.max(d.left, d.right);
    const tone = driftTone(worst);
    const verdict = tone === 'ok'
      ? 'No meaningful drift. These sticks are healthy.'
      : tone === 'warn'
      ? 'Slight drift. You may notice it in games with fine aim; not yet a failure.'
      : 'Real drift. This is the fault that makes a character walk on its own.';
    return `
      <div class="card" style="border-color:var(--${tone === 'ok' ? 'ok' : tone === 'warn' ? 'warn' : 'bad'})">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
          <h3>${tone === 'ok' ? 'Sticks look good' : tone === 'warn' ? 'Minor drift' : 'Drift detected'}</h3>
          <span class="badge ${tone}">${tone === 'ok' ? 'Pass' : tone === 'warn' ? 'Watch' : 'Fail'}</span>
        </div>
        <div class="small muted" style="margin-top:6px">${esc(verdict)}</div>
      </div>
      <div class="grid">
        ${stat('Left stick', (d.left * 100).toFixed(1), '%', driftTone(d.left))}
        ${stat('Right stick', (d.right * 100).toFixed(1), '%', driftTone(d.right))}
      </div>
      <div class="note small" style="margin-top:11px">
        Measured as the furthest each stick wandered from centre while untouched, over
        ${DRIFT_SAMPLE_MS / 1000} seconds. Under ${DRIFT_OK * 100}% is healthy;
        over ${DRIFT_BAD * 100}% is what people mean by stick drift.
        ${worst > DRIFT_OK ? '<br><br><strong>Worth trying first:</strong> compressed air around the stick base, then a firm circle of the stick to reseat it. If that fails, the potentiometer module is a common and cheap replacement part — though on a PS5 pad it means soldering.' : ''}
      </div>`;
  }

  function stat(label, value, unit, tone) {
    return `<div class="stat ${tone}"><div class="k">${esc(label)}</div>
      <div class="v">${esc(value)}<span class="u">${esc(unit)}</span></div></div>`;
  }

  function stickSvg(x, y, label) {
    const cx = 50 + x * 34, cy = 50 + y * 34;
    const mag = Math.hypot(x, y);
    const tone = mag <= DRIFT_OK ? 'var(--ok)' : mag <= DRIFT_BAD ? 'var(--warn)' : 'var(--bad)';
    return `<div class="gauge">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="38" fill="none" stroke="var(--line)" stroke-width="3"/>
        <circle cx="50" cy="50" r="${(DRIFT_OK * 34 * 2).toFixed(1)}" fill="none"
          stroke="var(--ok)" stroke-width="1.5" opacity=".45"/>
        <line x1="50" y1="12" x2="50" y2="88" stroke="var(--line-soft)" stroke-width="1"/>
        <line x1="12" y1="50" x2="88" y2="50" stroke="var(--line-soft)" stroke-width="1"/>
        <circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="7" fill="${tone}"/>
      </svg>
      <div class="gl">${esc(label)}</div>
      <div class="gu mono">${x.toFixed(2)}, ${y.toFixed(2)}</div>
    </div>`;
  }

  function paintLive(gp) {
    const a = gp.axes || [];
    const sticks = $('#sticks', host);
    if (sticks) {
      sticks.innerHTML = stickSvg(a[0] || 0, a[1] || 0, 'Left stick')
                       + stickSvg(a[2] || 0, a[3] || 0, 'Right stick');
    }

    const btns = gp.buttons || [];
    const trig = $('#triggers', host);
    if (trig) {
      const bar = (i, name) => {
        const v = btns[i] ? btns[i].value : 0;
        return `<div style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;font-size:13.5px">
            <span>${esc(name)}</span><span class="mono">${Math.round(v * 100)}%</span></div>
          <div class="bar"><i style="width:${(v * 100).toFixed(1)}%"></i></div></div>`;
      };
      trig.innerHTML = bar(6, 'L2 / LT') + bar(7, 'R2 / RT');
    }

    btns.forEach((b, i) => { if (b.pressed) state.pressed.add(i); });
    const grid = $('#buttons', host);
    if (grid) {
      grid.innerHTML = btns.map((b, i) => {
        const cls = b.pressed ? 'on' : state.pressed.has(i) ? 'seen' : '';
        return `<span class="bpad ${cls}">${esc(BUTTON_NAMES[i] || `Button ${i}`)}</span>`;
      }).join('');
    }
  }

  function wirePad() {
    $('#drift', host).onclick = () => startDrift();
    $('#rumble', host).onclick = async () => {
      const gp = pad();
      const act = gp && (gp.vibrationActuator || (gp.hapticActuators && gp.hapticActuators[0]));
      if (!act || !act.playEffect) { toast('This pad or browser does not expose rumble', 'bad'); return; }
      try {
        await act.playEffect('dual-rumble', { duration: 700, strongMagnitude: 1, weakMagnitude: 0.7 });
        toast('Did you feel it?', 'ok');
      } catch {
        toast('Rumble was refused by the browser', 'bad');
      }
    };
  }

  function startDrift() {
    const gp = pad();
    if (!gp) { toast('No controller detected', 'bad'); return; }
    state.drift = { until: performance.now() + DRIFT_SAMPLE_MS, left: 0, right: 0 };
    state.driftResult = null;
    $('#drift', host).textContent = 'Sampling…';
    $('#drift', host).disabled = true;
  }

  function tick() {
    const gp = pad();

    if (!gp) {
      if (state.lastPad !== null) { state.lastPad = null; state.pressed.clear(); renderIdle(); }
      state.raf = requestAnimationFrame(tick);
      return;
    }
    if (state.lastPad !== gp.index) {
      state.lastPad = gp.index;
      state.pressed.clear();
      state.driftResult = null;
      renderPad(gp);
      toast(`Connected: ${gp.id.slice(0, 28)}`, 'ok');
    }

    paintLive(gp);

    if (state.drift) {
      const a = gp.axes || [];
      state.drift.left = Math.max(state.drift.left, Math.hypot(a[0] || 0, a[1] || 0));
      state.drift.right = Math.max(state.drift.right, Math.hypot(a[2] || 0, a[3] || 0));
      const left = Math.max(0, state.drift.until - performance.now());
      const live = $('#drift-live', host);
      if (live) {
        live.innerHTML = `<div class="note warn" style="margin-top:11px">
          <strong>Sampling — hands off.</strong> ${(left / 1000).toFixed(1)}s left.
          Worst so far: left ${(state.drift.left * 100).toFixed(1)}%,
          right ${(state.drift.right * 100).toFixed(1)}%.</div>`;
      }
      if (left <= 0) {
        state.driftResult = { left: state.drift.left, right: state.drift.right };
        state.drift = null;
        renderPad(gp);
      }
    }
    state.raf = requestAnimationFrame(tick);
  }

  renderIdle();
  window.addEventListener('gamepadconnected', () => { /* picked up by the poll */ });
  state.raf = requestAnimationFrame(tick);
  return api;
}
