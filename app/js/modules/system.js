/* System & network: benchmarks and capability checks for the machine you're on. */
import { $, toast, testItem, rows, scoreRing, fmt } from '../ui.js';
import { scoreTests, verdict, save, shareReport } from '../report.js';
import { shareCard } from '../card.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Worker body for the multi-core test — same integer loop as the single-core run. */
const WORKER_SRC = `
onmessage = (e) => {
  const t0 = performance.now();
  let acc = 0;
  for (let i = 0; i < e.data; i++) acc = (acc + i * 2654435761) % 4294967296;
  postMessage({ ms: performance.now() - t0, acc });
};`;

export async function mount(host) {
  const state = { tests: [], facts: [], running: false, workers: [] };

  const api = {
    destroy() {
      state.workers.forEach((w) => w.terminate());
      state.workers = [];
    },
  };

  const TESTS = [
    {
      id: 'cpu1', name: 'CPU — single core', detail: 'Running integer benchmark…',
      async run() {
        await sleep(16);
        const t0 = performance.now();
        let acc = 0;
        for (let i = 0; i < 8_000_000; i++) acc = (acc + i * 2654435761) % 4294967296;
        const ms = performance.now() - t0;
        const score = Math.round(800000 / Math.max(ms, 1));
        state.facts.push(['Single-core score', `${score} pts`]);
        state.facts.push(['Single-core time', `${ms.toFixed(0)} ms`]);
        state._single = { ms, score };
        if (ms > 1600) return { state: 'warn', detail: `${score} pts — slow, close background apps`, value: score };
        return { state: 'ok', detail: `${score} pts in ${ms.toFixed(0)} ms`, value: score };
      },
    },
    {
      id: 'cpuN', name: 'CPU — all cores', detail: 'Spawning workers…',
      async run() {
        const cores = navigator.hardwareConcurrency || 0;
        state.facts.push(['Logical cores reported', cores ? String(cores) : 'Not reported']);
        if (!cores || typeof Worker === 'undefined') return { state: 'warn', detail: 'Workers unavailable — skipped' };

        const n = Math.min(cores, 16);
        const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
        try {
          const workers = Array.from({ length: n }, () => new Worker(url));
          state.workers = workers;
          const t0 = performance.now();
          const results = await Promise.all(workers.map((w) => new Promise((res, rej) => {
            w.onmessage = (e) => res(e.data);
            w.onerror = rej;
            w.postMessage(8_000_000);
          })));
          const wall = performance.now() - t0;
          workers.forEach((w) => w.terminate());
          state.workers = [];

          const total = Math.round((n * 800000) / Math.max(wall, 1));
          const scaling = state._single ? (n * state._single.ms) / wall : null;
          state.facts.push(['Multi-core score', `${total} pts across ${n} threads`]);
          if (scaling) state.facts.push(['Parallel scaling', `${scaling.toFixed(1)}× of single core`]);
          if (results.some((r) => !Number.isFinite(r.ms))) return { state: 'bad', detail: 'A worker returned no result' };

          if (scaling && scaling < n * 0.4) {
            return { state: 'warn', detail: `${total} pts — scaling only ${scaling.toFixed(1)}×, cores may be throttled`, value: total };
          }
          return { state: 'ok', detail: `${total} pts across ${n} threads`, value: total };
        } finally {
          URL.revokeObjectURL(url);
        }
      },
    },
    {
      id: 'mem', name: 'Memory', detail: 'Allocating test buffers…',
      async run() {
        const gb = navigator.deviceMemory;
        if (gb) state.facts.push(['Device memory class', `${gb} GB`]);
        const m = performance.memory;
        if (m) {
          state.facts.push(['JS heap limit', fmt.bytes(m.jsHeapSizeLimit)]);
          state.facts.push(['JS heap in use', fmt.bytes(m.usedJSHeapSize)]);
        }

        // Allocate in 32 MB steps until it fails, up to 1 GB, then release.
        let held = [];
        let mb = 0;
        try {
          for (let i = 0; i < 32; i++) {
            held.push(new Uint8Array(32 * 1024 * 1024).fill(1));
            mb += 32;
          }
        } catch { /* hit the ceiling — that is the measurement */ }
        held = null;
        state.facts.push(['Allocated in one go', `${mb} MB`]);

        if (mb < 128) return { state: 'bad', detail: `Only ${mb} MB allocatable — memory is very tight` };
        if (mb < 512) return { state: 'warn', detail: `${mb} MB allocatable`, value: mb };
        return { state: 'ok', detail: `${mb} MB allocatable${gb ? ` · ${gb} GB class` : ''}`, value: mb };
      },
    },
    {
      id: 'gpu', name: 'GPU', detail: 'Measuring fill rate…',
      async run() {
        const c = document.createElement('canvas');
        c.width = c.height = 512;
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        if (!gl) return { state: 'bad', detail: 'WebGL unavailable — acceleration disabled' };

        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
        state.facts.push(['Renderer', renderer]);
        state.facts.push(['WebGL version', gl.getParameter(gl.VERSION)]);
        state.facts.push(['Shading language', gl.getParameter(gl.SHADING_LANGUAGE_VERSION)]);
        state.facts.push(['Max texture size', `${gl.getParameter(gl.MAX_TEXTURE_SIZE)} px`]);
        state.facts.push(['Max render buffer', `${gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)} px`]);

        // Repeated full-canvas clears + reads: crude but comparable fill-rate proxy.
        const t0 = performance.now();
        for (let i = 0; i < 240; i++) {
          gl.clearColor((i % 16) / 16, 0.3, 0.6, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
        gl.finish?.();
        const px = new Uint8Array(4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const ms = performance.now() - t0;
        state.facts.push(['Fill-rate test', `${ms.toFixed(0)} ms for 240 frames`]);

        const soft = /swiftshader|software|llvmpipe|basic render/i.test(renderer);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        if (soft) return { state: 'warn', detail: 'Software rendering — no GPU acceleration' };
        if (ms > 900) return { state: 'warn', detail: `Slow fill rate (${ms.toFixed(0)} ms)`, value: ms };
        return { state: 'ok', detail: renderer.slice(0, 46), value: ms };
      },
    },
    {
      id: 'disk', name: 'Storage speed', detail: 'Writing and reading test data…',
      async run() {
        if (!('caches' in window)) return { state: 'warn', detail: 'Cache Storage unavailable — skipped' };
        const SIZE = 8 * 1024 * 1024;
        const blob = new Blob([new Uint8Array(SIZE).fill(7)]);
        const cache = await caches.open('omnidx-benchmark');
        const key = '/__bench__';
        try {
          const w0 = performance.now();
          await cache.put(key, new Response(blob));
          const wms = performance.now() - w0;

          const r0 = performance.now();
          const res = await cache.match(key);
          const back = await res.arrayBuffer();
          const rms = performance.now() - r0;

          if (back.byteLength !== SIZE) return { state: 'bad', detail: 'Data read back did not match what was written' };

          const wMBs = (SIZE / 1048576) / (wms / 1000);
          const rMBs = (SIZE / 1048576) / (rms / 1000);
          state.facts.push(['Write speed', `${wMBs.toFixed(0)} MB/s`]);
          state.facts.push(['Read speed', `${rMBs.toFixed(0)} MB/s`]);

          if (navigator.storage?.estimate) {
            const { quota = 0, usage = 0 } = await navigator.storage.estimate();
            state.facts.push(['Storage quota', fmt.bytes(quota)]);
            state.facts.push(['Storage used', fmt.bytes(usage)]);
          }
          if (wMBs < 12) return { state: 'warn', detail: `${wMBs.toFixed(0)} MB/s write — slow disk or heavy load`, value: wMBs };
          return { state: 'ok', detail: `${wMBs.toFixed(0)} MB/s write · ${rMBs.toFixed(0)} MB/s read`, value: wMBs };
        } finally {
          await cache.delete(key).catch(() => {});
          await caches.delete('omnidx-benchmark').catch(() => {});
        }
      },
    },
    {
      id: 'net', name: 'Network throughput', detail: 'Measuring download speed…',
      async run() {
        const c = navigator.connection;
        if (c?.effectiveType) state.facts.push(['Connection class', c.effectiveType]);
        if (c?.downlink) state.facts.push(['Browser downlink estimate', `${c.downlink} Mbps`]);
        if (!navigator.onLine) return { state: 'warn', detail: 'Offline — skipped' };

        // Pull our own largest asset a few times; same-origin, no third party involved.
        const URLS = ['../icons/icon-512.png', '../icons/maskable-512.png', 'css/app.css'];
        let bytes = 0;
        const t0 = performance.now();
        for (let i = 0; i < 6; i++) {
          const u = `${URLS[i % URLS.length]}?bench=${Date.now()}_${i}`;
          try {
            const res = await fetch(u, { cache: 'no-store' });
            bytes += (await res.arrayBuffer()).byteLength;
          } catch { /* skip failed pull */ }
        }
        const secs = (performance.now() - t0) / 1000;
        if (!bytes) return { state: 'bad', detail: 'Nothing downloaded — connection failed' };
        const mbps = (bytes * 8) / secs / 1e6;
        state.facts.push(['Measured throughput', `${mbps.toFixed(1)} Mbps over ${fmt.bytes(bytes)}`]);
        state.facts.push(['Note', 'Small-file test — a floor, not your line speed']);
        if (mbps < 1) return { state: 'warn', detail: `${mbps.toFixed(1)} Mbps — very slow`, value: mbps };
        return { state: 'ok', detail: `${mbps.toFixed(1)} Mbps (small-file test)`, value: mbps };
      },
    },
    {
      id: 'features', name: 'Browser capabilities', detail: 'Checking APIs…',
      async run() {
        const F = [
          ['Web Bluetooth', !!navigator.bluetooth, 'needed for wireless car adapters'],
          ['Web Serial', !!navigator.serial, 'needed for USB car adapters'],
          ['Service Worker', 'serviceWorker' in navigator, 'offline support'],
          ['WebAssembly', typeof WebAssembly === 'object', ''],
          ['Web Workers', typeof Worker !== 'undefined', ''],
          ['WebGL 2', !!document.createElement('canvas').getContext('webgl2'), ''],
          ['Web Share', !!navigator.share, 'sharing reports'],
          ['Clipboard', !!navigator.clipboard, ''],
          ['Geolocation', !!navigator.geolocation, ''],
          ['Media devices', !!navigator.mediaDevices, 'camera and mic tests'],
          ['Vibration', !!navigator.vibrate, ''],
          ['Secure context', window.isSecureContext, 'required by most of the above'],
        ];
        for (const [n, ok, why] of F) state.facts.push([n, ok ? 'Yes' : `No${why ? ` — ${why}` : ''}`]);
        state._features = F;

        const missing = F.filter(([, ok]) => !ok).length;
        if (!window.isSecureContext) return { state: 'bad', detail: 'Not a secure context — most hardware APIs are blocked' };
        if (missing > 4) return { state: 'warn', detail: `${missing} capabilities unavailable in this browser` };
        return { state: 'ok', detail: `${F.length - missing} of ${F.length} available` };
      },
    },
  ];

  /* ---------------- rendering ---------------- */

  function render() {
    const graded = state.tests.filter((t) => ['ok', 'warn', 'bad'].includes(t.state));
    const done = graded.length === TESTS.length;
    const score = scoreTests(state.tests);
    const v = verdict(score);

    host.innerHTML = `
      <h1>System &amp; Network</h1>
      <p class="sub">Benchmarks and capability checks for the machine you are running this on.</p>

      ${done ? scoreRing(score, v.label,
        `${graded.filter((t) => t.state === 'ok').length} of ${graded.length} checks passed`) : ''}

      <button class="btn ${state.running ? '' : 'btn-primary'}" id="run" ${state.running ? 'disabled' : ''}>
        ${state.running ? 'Running…' : (done ? 'Run again' : 'Run benchmarks')}
      </button>
      ${state.running ? '<div class="note warn" style="margin-top:11px">Benchmarks load the CPU on purpose — the app may feel briefly unresponsive. Keep it in the foreground.</div>' : ''}

      ${done ? `<div class="btn-row">
        <button class="btn" id="save">Save report</button>
        <button class="btn" id="share">Share</button>
        <button class="btn" id="card">Share as image</button>
      </div>` : '<div class="spacer"></div>'}

      <h2>Benchmarks</h2>
      <ul class="tests">${state.tests.map(testItem).join('')}</ul>

      ${state.facts.length ? `<h2>Details</h2>${rows(state.facts)}` : ''}

      <h2>Deeper hardware scan</h2>
      <div class="card">
        <h3>Companion script</h3>
        <p class="small muted">A browser is sandboxed — it cannot read disk SMART health, CPU temperatures,
        installed RAM sticks or running processes. The repo ships a zero-dependency Python script that can.</p>
        <div class="log" style="max-height:none">python3 tools/sysreport.py</div>
        <p class="small muted" style="margin-top:10px">Works on Windows, macOS and Linux with any Python 3.
        It prints a full report to your terminal and writes <span class="mono">omnidx-system-report.txt</span>
        next to itself. Nothing is uploaded.</p>
      </div>
    `;
    wire();
  }

  function setTest(id, patch) {
    const t = state.tests.find((x) => x.id === id);
    if (!t) return;
    Object.assign(t, patch);
    const li = host.querySelector(`[data-test="${id}"]`);
    if (li) li.outerHTML = testItem(t);
  }

  async function runAll() {
    if (state.running) return;
    state.running = true;
    state.facts = [];
    state.tests = TESTS.map((t) => ({ id: t.id, name: t.name, detail: t.detail, state: 'idle' }));
    render();

    for (const def of TESTS) {
      setTest(def.id, { state: 'run', detail: def.detail });
      await sleep(90);
      try {
        setTest(def.id, await def.run());
      } catch (e) {
        setTest(def.id, { state: 'warn', detail: `Could not run: ${e.message}` });
      }
    }
    state.running = false;
    render();
  }

  function wire() {
    $('#run').onclick = runAll;
    $('#save') && ($('#save').onclick = () => {
      const r = save('system', 'System Benchmark', scoreTests(state.tests), { tests: state.tests, facts: state.facts });
      toast('Report saved', 'ok');
      location.hash = `#/reports/${r.id}`;
    });
    const asReport = () => ({
      kind: 'system', title: 'System Benchmark', ts: Date.now(),
      score: scoreTests(state.tests), data: { tests: state.tests, facts: state.facts },
    });
    $('#share') && ($('#share').onclick = () => shareReport(asReport()));
    $('#card') && ($('#card').onclick = () => shareCard(asReport()));
  }

  state.tests = TESTS.map((t) => ({ id: t.id, name: t.name, detail: 'Not run yet', state: 'idle' }));
  render();
  return api;
}
