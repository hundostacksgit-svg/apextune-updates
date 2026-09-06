/* Vehicle scan: connect to an ELM327 adapter, read codes, monitors and live data. */
import { $, esc, toast, gauge, rows, scoreRing, confirmDialog, fmt } from '../ui.js';
import { BleTransport, SerialTransport, DemoTransport, bleSupported, serialSupported } from '../obd/transport.js';
import { ELM327 } from '../obd/elm327.js';
import { PIDS, LIVE_ORDER, SNAPSHOT_ORDER, FREEZE_ORDER, pidPct, pidTone } from '../obd/pids.js';
import { severity, describe } from '../obd/dtc.js';
import { scoreCar, verdict, save, shareReport, exportCSV } from '../report.js';
import { store } from '../store.js';

const POLL_MS = 700;

export async function mount(host) {
  const view = {
    elm: null,
    scan: null,
    poll: null,
    logLines: [],
    busy: false,
    livePids: [],
    recording: null,   // array of samples while a log is being recorded
  };

  /* ---------------- teardown ---------------- */
  const api = {
    destroy() {
      clearInterval(view.poll);
      view.poll = null;
      view.recording = null;
      view.elm?.disconnect().catch(() => {});
      view.elm = null;
    },
  };

  /* ---------------- logging ---------------- */
  function log(entry) {
    view.logLines.push(entry);
    if (view.logLines.length > 300) view.logLines.shift();
    const el = $('#obd-log');
    if (el && !el.hidden) {
      el.innerHTML = view.logLines.slice(-120)
        .map((l) => `<span class="${l.dir === 'tx' ? 'tx' : 'rx'}">${l.dir === 'tx' ? '›' : '‹'} ${esc(l.text)}</span>`)
        .join('\n');
      el.scrollTop = el.scrollHeight;
    }
  }

  /* ---------------- screens ---------------- */

  function renderPicker(errorMsg) {
    const ble = bleSupported();
    const ser = serialSupported();
    const iOS = /iP(hone|ad|od)/.test(navigator.userAgent);

    host.innerHTML = `
      <h1>Vehicle Scan</h1>
      <p class="sub">Plug your adapter into the OBD-II port, turn the ignition to ON (engine running gives the most data), then connect.</p>

      ${errorMsg ? `<div class="note bad"><strong>Could not connect.</strong><br>${esc(errorMsg)}</div>` : ''}

      ${(!ble && !ser) ? `<div class="note warn">
        <strong>${iOS ? 'iPhone and iPad cannot scan live.' : 'This browser cannot reach adapters.'}</strong><br>
        ${iOS
          ? 'Apple blocks Web Bluetooth and Web Serial in every iOS browser. Demo mode below shows exactly how a scan works; for live data use Chrome on an Android phone or a laptop.'
          : 'Open this app in Chrome or Edge to connect to an adapter.'}
      </div>` : ''}

      <button class="btn btn-primary" id="c-ble" ${ble ? '' : 'disabled'}>
        Connect over Bluetooth${ble ? '' : ' — unavailable'}
      </button>
      <div class="spacer"></div>
      <button class="btn" id="c-ser" ${ser ? '' : 'disabled'}>
        Connect over USB${ser ? '' : ' — unavailable'}
      </button>
      <div class="spacer"></div>
      <button class="btn" id="c-demo">Try demo mode — no adapter needed</button>

      <h2>Before you connect</h2>
      <div class="rows">
        <div class="row"><span class="rk">1</span><span class="rv">Adapter fully seated in the OBD-II port</span></div>
        <div class="row"><span class="rk">2</span><span class="rv">Ignition ON (engine running is best)</span></div>
        <div class="row"><span class="rk">3</span><span class="rv">Adapter LED lit</span></div>
        <div class="row"><span class="rk">4</span><span class="rv">Phone Bluetooth turned on</span></div>
      </div>
      <div class="note" style="margin-top:11px">
        Pick your adapter from the list your browser shows — the name is often
        <span class="mono">OBDII</span>, <span class="mono">Vgate</span> or <span class="mono">V-LINK</span>.
        Do <strong>not</strong> pair it in your phone's Bluetooth settings first; let the browser do it.
      </div>
      <a class="btn" href="#/gear" style="margin-top:11px">Which adapter should I buy?</a>
    `;

    $('#c-ble').onclick  = () => connect(new BleTransport());
    $('#c-ser').onclick  = () => connect(new SerialTransport());
    $('#c-demo').onclick = () => connect(new DemoTransport());
  }

  function renderProgress(step, pct) {
    host.innerHTML = `
      <h1>Scanning</h1>
      <p class="sub">Keep the app open and stay near the vehicle.</p>
      <div class="card">
        <h3 id="p-step">${esc(step)}</h3>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <div class="small muted">${pct}%</div>
      </div>
      <div class="spacer"></div>
      <button class="btn btn-danger" id="p-cancel">Cancel</button>
    `;
    $('#p-cancel').onclick = async () => {
      api.destroy();
      renderPicker();
    };
  }

  function setProgress(step, pct) {
    const s = $('#p-step');
    if (s) { s.textContent = step; $('.bar > i').style.width = `${pct}%`; $('.bar').nextElementSibling.textContent = `${pct}%`; }
  }

  /* ---------------- connect + scan ---------------- */

  async function connect(transport) {
    renderProgress('Opening connection…', 6);
    let elm;
    try {
      elm = new ELM327(transport, { onLog: log });
      view.elm = elm;
      elm.onDisconnected = () => {
        clearInterval(view.poll);
        view.poll = null;
        toast('Adapter disconnected', 'bad');
      };

      setProgress('Waking the adapter…', 14);
      const info = await elm.connect();

      if (!info.ecuReachable) {
        throw new Error('The adapter answered, but the car\'s computer did not. Turn the ignition fully ON (dash lights up), make sure the adapter is seated, then try again.');
      }

      setProgress('Reading warning-light status…', 34);
      const status = await elm.readStatus();

      setProgress('Reading trouble codes…', 52);
      const dtc = await elm.readDTCs();

      // A freeze frame only exists once something has been stored.
      let freeze = null;
      if (dtc.stored.length || dtc.permanent.length) {
        setProgress('Reading freeze frame…', 60);
        freeze = await elm.readFreezeFrame();
      }

      setProgress('Identifying vehicle…', 66);
      const vin = await elm.readVIN();

      setProgress('Reading live sensors…', 80);
      view.livePids = LIVE_ORDER.filter((p) => elm.supports(p));
      const live = await elm.readMany(view.livePids);

      setProgress('Reading trip counters…', 92);
      Object.assign(live, await elm.readMany(SNAPSHOT_ORDER.filter((p) => elm.supports(p))));

      const voltage = live.voltage ?? (await elm.readVoltage());

      view.scan = { info, status, dtc, freeze, vin, live, voltage, kind: transport.kind, at: Date.now() };
      setProgress('Done', 100);
      renderResults();
    } catch (err) {
      clearInterval(view.poll);
      try { await elm?.disconnect(); } catch { /* ignore */ }
      view.elm = null;
      renderPicker(err?.message || String(err));
    }
  }

  /* ---------------- results ---------------- */

  function dtcCard(code, cls, label) {
    const sev = severity(code);
    return `<div class="dtc ${cls}">
      <div class="code">${esc(code)}</div>
      <div class="desc">${esc(describe(code))}</div>
      <div class="meta">${esc(label)} · ${esc(sev)}</div>
    </div>`;
  }

  function renderResults() {
    const s = view.scan;
    const score = scoreCar(s);
    const v = verdict(score);
    const all = [...s.dtc.stored, ...s.dtc.pending, ...s.dtc.permanent];
    const mil = s.status?.mil;
    const notReady = (s.status?.monitors || []).filter((m) => m.supported && !m.ready);
    const isDemo = s.kind === 'demo';

    host.innerHTML = `
      <h1>Scan Results</h1>
      <p class="sub">${esc(s.info.adapter)} · ${esc(s.info.protocol || 'protocol unknown')}</p>

      ${isDemo ? '<div class="note warn"><strong>Demo mode.</strong> These readings come from a simulated engine, not a real car.</div>' : ''}

      ${scoreRing(score, v.label,
        all.length ? `${all.length} code${all.length > 1 ? 's' : ''} found` : 'No codes found',
        `<div style="margin-top:7px"><span class="badge ${mil ? 'bad' : 'ok'}">Check-engine light ${mil ? 'ON' : 'off'}</span></div>`)}

      <div class="btn-row">
        <button class="btn btn-primary" id="a-save">Save report</button>
        <button class="btn" id="a-share">Share</button>
      </div>

      <h2>Trouble codes</h2>
      ${all.length ? `
        ${s.dtc.stored.map((c) => dtcCard(c, '', 'Stored')).join('')}
        ${s.dtc.pending.map((c) => dtcCard(c, 'pending', 'Pending')).join('')}
        ${s.dtc.permanent.map((c) => dtcCard(c, 'permanent', 'Permanent')).join('')}
        <div class="note">
          <strong>Stored</strong> codes turned the light on. <strong>Pending</strong> codes failed once and will
          become stored if they repeat. <strong>Permanent</strong> codes can only be cleared by the car itself
          after it re-tests and passes.
        </div>`
        : `<div class="card"><h3 style="color:var(--ok)">No trouble codes</h3>
           <div class="small muted">Nothing stored, pending or permanent.</div></div>`}

      ${freezeHtml(s.freeze)}

      <h2>Live data</h2>
      <div class="chips">
        <button class="chip" id="a-live">Start live polling</button>
        <button class="chip" id="a-rec">Record log</button>
      </div>
      <div id="rec-status"></div>
      <div class="gauges" id="gauges">${gaugesHtml(s.live)}</div>

      <h2>Readiness monitors</h2>
      ${s.status ? `
        <div class="note ${notReady.length ? 'warn' : ''}">
          ${notReady.length
            ? `<strong>${notReady.length} monitor${notReady.length > 1 ? 's have' : ' has'} not finished self-testing.</strong>
               Most states will fail an emissions test until these complete. Drive a mix of city and highway for a few days.`
            : '<strong>All supported monitors have completed.</strong> The car is ready for an emissions test.'}
        </div>
        <div class="rows">
          ${(s.status.monitors || []).map((m) => `
            <div class="row">
              <span class="rk">${esc(m.name)}</span>
              <span class="rv">${m.supported ? (m.ready
                ? '<span style="color:var(--ok)">Ready</span>'
                : '<span style="color:var(--warn)">Not ready</span>')
                : '<span class="muted">n/a</span>'}</span>
            </div>`).join('')}
        </div>` : '<div class="card small muted">Monitor status was not reported by this vehicle.</div>'}

      <h2>Vehicle</h2>
      ${rows([
        ['VIN', s.vin || 'Not reported'],
        ['Protocol', s.info.protocol],
        ['Adapter', s.info.adapter],
        ['Battery', Number.isFinite(s.voltage) ? `${s.voltage.toFixed(1)} V` : null],
        ['Check-engine light', mil ? 'ON' : 'Off'],
        ['Run time this trip', Number.isFinite(s.live.runTime) ? fmt.dur(s.live.runTime) : null],
        ['Distance since cleared', Number.isFinite(s.live.distClear) ? `${Math.round(s.live.distClear)} km` : null],
        ['Distance with light on', Number.isFinite(s.live.distMil) ? `${Math.round(s.live.distMil)} km` : null],
        ['Supported parameters', view.elm ? String(view.elm.supported.size || '—') : null],
      ])}

      <h2>Maintenance</h2>
      <button class="btn btn-danger" id="a-clear" ${all.length ? '' : 'disabled'}>Clear trouble codes</button>
      <div class="note warn" style="margin-top:11px">
        Clearing codes does not repair anything — it only turns the light off. It also wipes every readiness
        monitor, which will fail an emissions test until the car re-tests itself over several days of driving.
        Fix the cause first, then clear.
      </div>

      <h2>Connection log</h2>
      <div class="chips"><button class="chip" id="a-log">Show raw log</button></div>
      <pre class="log" id="obd-log" hidden></pre>

      <div class="hr"></div>
      <button class="btn" id="a-disconnect">Disconnect</button>
      <p class="small muted" style="margin-top:12px">
        Code descriptions are the generic SAE definitions. Manufacturers add their own meanings for some codes —
        treat this as a starting point, not a repair order.
      </p>
    `;

    wireResults();
  }

  function paintRec() {
    const el = $('#rec-status');
    if (!el) return;
    if (!view.recording) { el.innerHTML = ''; return; }
    const n = view.recording.length;
    const secs = n ? ((view.recording[n - 1].t - view.recording[0].t) / 1000).toFixed(0) : '0';
    el.innerHTML = `<div class="note warn" style="margin-bottom:11px">
      <strong>Recording.</strong> ${n} sample${n === 1 ? '' : 's'} over ${secs}s.
      Drive as you normally would, then tap <strong>Stop and export</strong> for a CSV
      you can open in any spreadsheet.</div>`;
  }

  function freezeHtml(f) {
    if (!f || (!f.dtc && !Object.keys(f.values || {}).length)) return '';
    const pairs = FREEZE_ORDER
      .filter((p) => PIDS[p] && Number.isFinite(f.values[PIDS[p].key]))
      .map((p) => {
        const def = PIDS[p];
        const val = f.values[def.key];
        return [def.name, `${val.toFixed(def.unit === 'V' ? 1 : Math.abs(val) < 10 && !Number.isInteger(val) ? 1 : 0)} ${def.unit}`];
      });
    return `
      <h2>Freeze frame</h2>
      <div class="note info">
        <strong>A snapshot of the engine at the moment the fault was stored.</strong>
        This is what the car was actually doing when it went wrong${f.dtc ? `, recorded for <span class="mono">${esc(f.dtc)}</span>` : ''} —
        often the fastest way to work out why.
      </div>
      ${rows(pairs)}`;
  }

  function gaugesHtml(live) {
    const shown = LIVE_ORDER.filter((p) => Number.isFinite(live[PIDS[p].key]));
    if (!shown.length) return '<div class="card small muted">This vehicle reported no live sensor values.</div>';
    return shown.map((p) => {
      const def = PIDS[p];
      const val = live[def.key];
      const dp = def.unit === 'V' ? 1 : (Math.abs(val) < 10 && !Number.isInteger(val)) ? 1 : 0;
      return gauge({
        label: def.name,
        value: val.toFixed(dp),
        unit: def.unit,
        pct: pidPct(def, val),
        tone: pidTone(def.key, val),
      });
    }).join('');
  }

  /* ---------------- results wiring ---------------- */

  function wireResults() {
    $('#a-save').onclick = async () => {
      const isDemoScan = view.scan.kind === 'demo';
      let vehicleId = null;

      // File the scan against a vehicle when there is a real VIN to match on.
      // Demo scans are skipped so a simulated VIN never lands in the garage.
      if (view.scan.vin && !isDemoScan) {
        const match = store.vehicleByVin(view.scan.vin);
        if (match) {
          vehicleId = match.id;
        } else {
          const add = await confirmDialog({
            title: 'Add this vehicle to your garage?',
            body: `VIN ${view.scan.vin} is not saved yet. Adding it files this scan, and every future one `
                + 'from the same car, under one vehicle so you can watch it over time.',
            confirmText: 'Add it',
          });
          if (add) {
            vehicleId = store.saveVehicle({
              name: `Vehicle ${view.scan.vin.slice(-6)}`, vin: view.scan.vin, notes: '',
            }).id;
          }
        }
      }

      const r = save('car', isDemoScan ? 'Vehicle Scan (demo)' : 'Vehicle Scan',
        scoreCar(view.scan), view.scan, vehicleId);
      const filed = vehicleId && store.getVehicle(vehicleId);
      toast(filed ? `Saved to ${filed.name}` : 'Report saved', 'ok');
      location.hash = `#/reports/${r.id}`;
    };

    $('#a-share').onclick = () => {
      const r = { kind: 'car', title: 'Vehicle Scan', ts: Date.now(), score: scoreCar(view.scan), data: view.scan };
      shareReport(r);
    };

    $('#a-log').onclick = (e) => {
      const el = $('#obd-log');
      el.hidden = !el.hidden;
      e.target.textContent = el.hidden ? 'Show raw log' : 'Hide raw log';
      if (!el.hidden) log({ dir: 'rx', text: '--- log opened ---' });
    };

    $('#a-disconnect').onclick = async () => {
      api.destroy();
      toast('Disconnected');
      renderPicker();
    };

    $('#a-live').onclick = (e) => {
      if (view.poll) {
        clearInterval(view.poll);
        view.poll = null;
        e.target.textContent = 'Start live polling';
        e.target.classList.remove('on');
        return;
      }
      if (!view.elm?.connected) { toast('Not connected', 'bad'); return; }
      e.target.textContent = 'Stop live polling';
      e.target.classList.add('on');
      view.poll = setInterval(async () => {
        if (view.busy || !view.elm?.connected) return;
        view.busy = true;
        try {
          const fresh = await view.elm.readMany(view.livePids);
          Object.assign(view.scan.live, fresh);
          if (view.recording) {
            view.recording.push({ t: Date.now(), values: { ...fresh } });
            paintRec();
          }
          const g = $('#gauges');
          if (g) g.innerHTML = gaugesHtml(view.scan.live);
        } catch { /* transient read failure — next tick retries */ }
        view.busy = false;
      }, POLL_MS);
    };

    $('#a-rec').onclick = () => {
      if (view.recording) {
        const samples = view.recording;
        view.recording = null;
        $('#a-rec').textContent = 'Record log';
        $('#a-rec').classList.remove('on');
        exportCSV(view.scan.vin ? `omnidx-${view.scan.vin.slice(-6)}` : 'omnidx-log', samples);
        paintRec();
        return;
      }
      if (!view.elm?.connected) { toast('Not connected', 'bad'); return; }
      view.recording = [];
      $('#a-rec').textContent = 'Stop and export';
      $('#a-rec').classList.add('on');
      // Recording is fed by the polling loop, so make sure it is running.
      if (!view.poll) $('#a-live').click();
      paintRec();
    };

    $('#a-clear').onclick = async () => {
      const ok = await confirmDialog({
        title: 'Clear trouble codes?',
        body: 'This turns the check-engine light off without fixing anything, and resets all readiness monitors. '
            + 'If the fault is still present the light will come back. Emissions testing will fail until the '
            + 'monitors complete again.',
        confirmText: 'Clear codes',
        danger: true,
      });
      if (!ok) return;
      try {
        await view.elm.clearDTCs();
        toast('Codes cleared — rescanning', 'ok');
        view.scan.dtc = await view.elm.readDTCs();
        view.scan.status = await view.elm.readStatus();
        renderResults();
      } catch (e) {
        toast(`Clear failed: ${e.message}`, 'bad');
      }
    };
  }

  // Deep-link straight into demo mode from a shortcut.
  if (store.pref('autoDemo')) { store.pref('autoDemo', false); connect(new DemoTransport()); }
  else renderPicker();

  return api;
}
