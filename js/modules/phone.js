/* Device diagnostics: everything measurable from the browser, no extra hardware. */
import { $, toast, testItem, rows, scoreRing, fmt } from '../ui.js';
import { scoreTests, verdict, save, shareReport } from '../report.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function mount(host) {
  const state = {
    tests: [],
    facts: [],
    running: false,
    cleanups: [],
    stream: null,
    audioCtx: null,
  };

  const api = {
    destroy() {
      state.cleanups.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
      state.cleanups = [];
      state.stream?.getTracks().forEach((t) => t.stop());
      state.stream = null;
      try { state.audioCtx?.close(); } catch { /* ignore */ }
      state.audioCtx = null;
      document.querySelector('.fullscreen-test')?.remove();
    },
  };

  /* ---------------- test definitions ---------------- */

  const TESTS = [
    {
      id: 'battery', name: 'Battery', detail: 'Reading charge state…',
      async run() {
        if (!navigator.getBattery) return { state: 'warn', detail: 'Battery API not exposed by this browser' };
        const b = await navigator.getBattery();
        const pct = Math.round(b.level * 100);
        state.facts.push(['Battery level', `${pct}%`]);
        state.facts.push(['Charging', b.charging ? 'Yes' : 'No']);
        if (b.charging && Number.isFinite(b.chargingTime) && b.chargingTime !== Infinity) {
          state.facts.push(['Time to full', fmt.dur(b.chargingTime)]);
        }
        if (!b.charging && Number.isFinite(b.dischargingTime) && b.dischargingTime !== Infinity) {
          state.facts.push(['Time remaining', fmt.dur(b.dischargingTime)]);
        }
        if (pct <= 15 && !b.charging) return { state: 'warn', detail: `${pct}% — low, plug in soon`, value: pct };
        return { state: 'ok', detail: `${pct}%${b.charging ? ' and charging' : ''}`, value: pct };
      },
    },
    {
      id: 'memory', name: 'Memory', detail: 'Checking available RAM…',
      async run() {
        const gb = navigator.deviceMemory;
        const heap = performance.memory?.jsHeapSizeLimit;
        if (gb) state.facts.push(['Device memory', `${gb} GB (approx)`]);
        if (heap) state.facts.push(['JS heap limit', fmt.bytes(heap)]);
        if (!gb && !heap) return { state: 'warn', detail: 'Not reported by this browser' };
        if (gb && gb <= 2) return { state: 'warn', detail: `${gb} GB — apps may be killed in the background` };
        return { state: 'ok', detail: gb ? `${gb} GB or more` : 'Reported healthy' };
      },
    },
    {
      id: 'storage', name: 'Storage', detail: 'Estimating free space…',
      async run() {
        if (!navigator.storage?.estimate) return { state: 'warn', detail: 'Storage estimate unavailable' };
        const { quota = 0, usage = 0 } = await navigator.storage.estimate();
        if (!quota) return { state: 'warn', detail: 'Browser reported no quota' };
        const pct = (usage / quota) * 100;
        state.facts.push(['Storage available to apps', fmt.bytes(quota)]);
        state.facts.push(['Used by this site', fmt.bytes(usage)]);
        if (pct > 90) return { state: 'bad', detail: `${pct.toFixed(0)}% of the browser quota used` };
        return { state: 'ok', detail: `${fmt.bytes(quota - usage)} available` };
      },
    },
    {
      id: 'cpu', name: 'Processor', detail: 'Running benchmark…',
      async run() {
        const cores = navigator.hardwareConcurrency || 0;
        if (cores) state.facts.push(['Logical cores', String(cores)]);

        // Fixed integer workload; wall time is a rough single-core speed proxy.
        await sleep(16); // let the UI paint before we block
        const t0 = performance.now();
        let acc = 0;
        for (let i = 0; i < 4_000_000; i++) acc = (acc + i * 2654435761) % 4294967296;
        const ms = performance.now() - t0;
        const score = Math.round(400000 / Math.max(ms, 1));
        state.facts.push(['Benchmark', `${score} pts (${ms.toFixed(0)} ms)`]);
        if (acc < 0) return { state: 'bad', detail: 'Benchmark produced invalid result' };

        if (ms > 900) return { state: 'warn', detail: `Slow — ${score} pts. Close background apps and retest.`, value: score };
        return { state: 'ok', detail: `${score} pts${cores ? ` · ${cores} cores` : ''}`, value: score };
      },
    },
    {
      id: 'gpu', name: 'Graphics', detail: 'Querying renderer…',
      async run() {
        const c = document.createElement('canvas');
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        if (!gl) return { state: 'bad', detail: 'WebGL unavailable — hardware acceleration may be off' };
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        const vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
        state.facts.push(['GPU', String(renderer)]);
        state.facts.push(['GPU vendor', String(vendor)]);
        state.facts.push(['Max texture size', `${gl.getParameter(gl.MAX_TEXTURE_SIZE)} px`]);
        const soft = /swiftshader|software|llvmpipe|basic render/i.test(String(renderer));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        if (soft) return { state: 'warn', detail: 'Software rendering — GPU acceleration is disabled' };
        return { state: 'ok', detail: String(renderer).slice(0, 46) };
      },
    },
    {
      id: 'display', name: 'Display', detail: 'Measuring refresh rate…',
      async run() {
        const w = screen.width, h = screen.height, dpr = devicePixelRatio || 1;
        state.facts.push(['Screen', `${w} × ${h} logical (${Math.round(w * dpr)} × ${Math.round(h * dpr)} physical)`]);
        state.facts.push(['Pixel ratio', `${dpr}×`]);
        state.facts.push(['Colour depth', `${screen.colorDepth}-bit`]);

        const hz = await measureHz();
        state.facts.push(['Refresh rate', `${hz} Hz (measured)`]);
        if (hz < 45) return { state: 'warn', detail: `${hz} Hz — frames are being dropped`, value: hz };
        return { state: 'ok', detail: `${w}×${h} @ ${hz} Hz`, value: hz };
      },
    },
    {
      id: 'network', name: 'Network', detail: 'Testing connection…',
      async run() {
        const c = navigator.connection;
        if (c) {
          if (c.effectiveType) state.facts.push(['Connection class', c.effectiveType]);
          if (c.downlink) state.facts.push(['Estimated downlink', `${c.downlink} Mbps`]);
          if (Number.isFinite(c.rtt)) state.facts.push(['Estimated RTT', `${c.rtt} ms`]);
          if (c.saveData) state.facts.push(['Data saver', 'On']);
        }
        if (!navigator.onLine) return { state: 'warn', detail: 'Offline — app still works from cache' };

        const samples = [];
        for (let i = 0; i < 4; i++) {
          const t = performance.now();
          try {
            await fetch(`icons/favicon-32.png?ping=${Date.now()}_${i}`, { cache: 'no-store' });
            samples.push(performance.now() - t);
          } catch { /* one failed probe is not fatal */ }
          await sleep(45);
        }
        if (!samples.length) return { state: 'bad', detail: 'No response from the network' };
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
        const jitter = Math.max(...samples) - Math.min(...samples);
        state.facts.push(['Measured latency', `${avg.toFixed(0)} ms`]);
        state.facts.push(['Jitter', `${jitter.toFixed(0)} ms`]);
        if (avg > 400) return { state: 'bad', detail: `${avg.toFixed(0)} ms — very slow`, value: avg };
        if (avg > 160) return { state: 'warn', detail: `${avg.toFixed(0)} ms — sluggish`, value: avg };
        return { state: 'ok', detail: `${avg.toFixed(0)} ms round trip`, value: avg };
      },
    },
    {
      id: 'sensors', name: 'Motion sensors', detail: 'Listening for movement…',
      async run() {
        if (typeof DeviceMotionEvent === 'undefined') {
          return { state: 'warn', detail: 'No motion sensors on this device' };
        }
        // iOS gates motion behind an explicit user gesture, handled by the button below.
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
          return { state: 'warn', detail: 'Tap "Test motion sensors" below to grant access' };
        }
        const got = await new Promise((resolve) => {
          let done = false;
          const on = (e) => {
            const a = e.accelerationIncludingGravity;
            if (a && (a.x !== null || a.y !== null)) {
              done = true;
              window.removeEventListener('devicemotion', on);
              resolve({ x: a.x, y: a.y, z: a.z });
            }
          };
          window.addEventListener('devicemotion', on);
          setTimeout(() => { if (!done) { window.removeEventListener('devicemotion', on); resolve(null); } }, 1400);
        });
        if (!got) return { state: 'warn', detail: 'No sensor data received' };
        const mag = Math.hypot(got.x || 0, got.y || 0, got.z || 0);
        state.facts.push(['Accelerometer', `${mag.toFixed(2)} m/s² total`]);
        if (mag < 4 || mag > 16) return { state: 'warn', detail: `Reading ${mag.toFixed(1)} m/s² — expected about 9.8 at rest` };
        return { state: 'ok', detail: `Accelerometer reading ${mag.toFixed(1)} m/s²` };
      },
    },
    {
      id: 'media', name: 'Cameras & microphones', detail: 'Enumerating devices…',
      async run() {
        if (!navigator.mediaDevices?.enumerateDevices) return { state: 'warn', detail: 'Media device list unavailable' };
        const devs = await navigator.mediaDevices.enumerateDevices();
        const cams = devs.filter((d) => d.kind === 'videoinput');
        const mics = devs.filter((d) => d.kind === 'audioinput');
        const spks = devs.filter((d) => d.kind === 'audiooutput');
        state.facts.push(['Cameras detected', String(cams.length)]);
        state.facts.push(['Microphones detected', String(mics.length)]);
        if (spks.length) state.facts.push(['Audio outputs', String(spks.length)]);
        if (!cams.length && !mics.length) return { state: 'warn', detail: 'None detected — grant permission to see them' };
        return { state: 'ok', detail: `${cams.length} camera${cams.length === 1 ? '' : 's'}, ${mics.length} mic${mics.length === 1 ? '' : 's'}` };
      },
    },
    {
      id: 'location', name: 'Location', detail: 'Checking GPS…',
      async run() {
        if (!navigator.geolocation) return { state: 'warn', detail: 'No geolocation support' };
        const perm = await navigator.permissions?.query({ name: 'geolocation' }).catch(() => null);
        if (perm?.state === 'denied') return { state: 'warn', detail: 'Permission denied in browser settings' };
        return { state: 'warn', detail: 'Tap "Test GPS accuracy" below to run this' };
      },
    },
    {
      id: 'platform', name: 'Platform', detail: 'Collecting system details…',
      async run() {
        const ua = navigator.userAgentData;
        state.facts.push(['Platform', ua?.platform || navigator.platform || 'Unknown']);
        state.facts.push(['Mobile', ua?.mobile !== undefined ? (ua.mobile ? 'Yes' : 'No') : (/Mobi|Android/i.test(navigator.userAgent) ? 'Yes' : 'No')]);
        state.facts.push(['Languages', (navigator.languages || [navigator.language]).join(', ')]);
        state.facts.push(['Time zone', Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown']);
        state.facts.push(['Touch points', String(navigator.maxTouchPoints || 0)]);
        state.facts.push(['Cookies enabled', navigator.cookieEnabled ? 'Yes' : 'No']);
        state.facts.push(['User agent', navigator.userAgent]);
        return { state: 'ok', detail: ua?.platform || navigator.platform || 'Details collected' };
      },
    },
  ];

  function measureHz() {
    return new Promise((resolve) => {
      let frames = 0;
      const t0 = performance.now();
      const tick = () => {
        frames++;
        if (performance.now() - t0 < 520) requestAnimationFrame(tick);
        else resolve(Math.round((frames * 1000) / (performance.now() - t0)));
      };
      requestAnimationFrame(tick);
    });
  }

  /* ---------------- rendering ---------------- */

  function render() {
    const graded = state.tests.filter((t) => ['ok', 'warn', 'bad'].includes(t.state));
    const done = graded.length === TESTS.length;
    const score = scoreTests(state.tests);
    const v = verdict(score);

    host.innerHTML = `
      <h1>This Device</h1>
      <p class="sub">Everything here runs on hardware you already own. Nothing is uploaded.</p>

      ${done ? scoreRing(score, v.label,
        `${graded.filter((t) => t.state === 'ok').length} of ${graded.length} checks passed`) : ''}

      <button class="btn ${state.running ? '' : 'btn-primary'}" id="run" ${state.running ? 'disabled' : ''}>
        ${state.running ? 'Running…' : (done ? 'Run again' : 'Run automatic checks')}
      </button>

      ${done ? `<div class="btn-row">
        <button class="btn" id="save">Save report</button>
        <button class="btn" id="share">Share</button>
      </div>` : '<div class="spacer"></div>'}

      <h2>Automatic checks</h2>
      <ul class="tests">${state.tests.map(testItem).join('')}</ul>

      <h2>Hands-on tests</h2>
      <p class="small muted" style="margin-top:-4px">These need you to look, listen or touch — tap one to start.</p>
      <div class="grid">
        <button class="btn" id="t-screen">Dead pixels</button>
        <button class="btn" id="t-touch">Touchscreen</button>
        <button class="btn" id="t-speaker">Speakers</button>
        <button class="btn" id="t-mic">Microphone</button>
        <button class="btn" id="t-camera">Cameras</button>
        <button class="btn" id="t-gps">GPS accuracy</button>
        <button class="btn" id="t-motion">Motion sensors</button>
        <button class="btn" id="t-vibrate">Vibration</button>
      </div>

      ${state.facts.length ? `<h2>Details</h2>${rows(state.facts)}` : ''}
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
      await sleep(60); // keep the progression legible
      try {
        const res = await def.run();
        setTest(def.id, res);
      } catch (e) {
        setTest(def.id, { state: 'warn', detail: `Could not run: ${e.message}` });
      }
    }
    state.running = false;
    render();
  }

  /* ---------------- interactive tests ---------------- */

  function overlay(html, onClose) {
    const el = document.createElement('div');
    el.className = 'fullscreen-test';
    el.style.mixBlendMode = 'normal';
    el.innerHTML = html;
    document.body.appendChild(el);
    const close = () => { el.remove(); onClose?.(); };
    state.cleanups.push(close);
    return { el, close };
  }

  function screenTest() {
    const colors = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffffff'];
    let i = 0;
    const { el, close } = overlay('');
    const paint = () => {
      el.style.background = colors[i];
      el.style.color = (colors[i] === '#ffffff') ? '#111' : '#fff';
      el.innerHTML = `<div><div style="font-size:15px;opacity:.8">Look for spots, lines or discoloured pixels</div>
        <div style="font-size:12px;margin-top:8px;opacity:.6">${i + 1} of ${colors.length} — tap to continue</div></div>`;
    };
    paint();
    el.onclick = () => { i++; if (i >= colors.length) { close(); toast('Screen test finished'); } else paint(); };
  }

  function touchTest() {
    const { el, close } = overlay('');
    el.style.background = '#0b0c10';
    el.style.mixBlendMode = 'normal';
    const cv = document.createElement('canvas');
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none';
    el.appendChild(cv);
    const hint = document.createElement('div');
    hint.style.cssText = 'position:absolute;top:calc(env(safe-area-inset-top) + 20px);left:0;right:0;text-align:center;font-size:14px;color:#a3abbb;pointer-events:none;z-index:2';
    hint.innerHTML = 'Drag around the whole screen — gaps mean dead spots<br><span style="font-size:12px;opacity:.7">Double-tap to finish</span>';
    el.appendChild(hint);

    const dpr = devicePixelRatio || 1;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    let max = 0;

    const draw = (e) => {
      e.preventDefault();
      max = Math.max(max, e.touches?.length || 1);
      const pts = e.touches ? Array.from(e.touches) : [e];
      for (const p of pts) {
        const g = ctx.createRadialGradient(p.clientX, p.clientY, 0, p.clientX, p.clientY, 22);
        g.addColorStop(0, 'rgba(255,158,43,.95)');
        g.addColorStop(1, 'rgba(255,74,58,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.clientX, p.clientY, 22, 0, 7); ctx.fill();
      }
    };
    cv.addEventListener('touchmove', draw, { passive: false });
    cv.addEventListener('touchstart', draw, { passive: false });
    cv.addEventListener('pointermove', (e) => { if (e.buttons) draw(e); });

    let last = 0;
    cv.addEventListener('pointerdown', () => {
      const now = Date.now();
      if (now - last < 320) { close(); toast(`Touch test done — up to ${max} finger${max === 1 ? '' : 's'} tracked`, 'ok'); }
      last = now;
    });
  }

  async function speakerTest() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      state.audioCtx = ctx;
      await ctx.resume();
      const notes = [[440, 'Left / low'], [880, 'Mid'], [1760, 'High']];
      toast('Playing test tones — listen for buzzing or silence');
      for (const [hz] of notes) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = hz;
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.72);
        osc.connect(g).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.75);
        await sleep(820);
      }
      await ctx.close();
      state.audioCtx = null;
      state.facts.push(['Speaker test', 'Tones played — judge by ear']);
      toast('Speaker test finished', 'ok');
    } catch (e) {
      toast(`Speaker test failed: ${e.message}`, 'bad');
    }
  }

  async function micTest() {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      toast(`Microphone blocked: ${e.name}`, 'bad');
      return;
    }
    state.stream = stream;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    state.audioCtx = ctx;
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    const buf = new Uint8Array(an.frequencyBinCount);

    const { el, close } = overlay(`
      <div style="width:100%;max-width:340px">
        <h3 style="margin-bottom:6px">Say something</h3>
        <div class="small" style="color:#a3abbb;margin-bottom:16px">The bar should jump when you speak.</div>
        <div style="height:14px;border-radius:99px;background:#1b1f28;overflow:hidden">
          <div id="mic-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#ff9e2b,#ff4a3a);transition:width .06s"></div>
        </div>
        <div class="mono" id="mic-db" style="margin-top:10px;color:#a3abbb;font-size:13px">-- dB</div>
        <button class="btn" id="mic-done" style="margin-top:20px">Done</button>
      </div>`);
    el.style.background = '#0b0c10';
    el.style.mixBlendMode = 'normal';

    let peak = 0, raf;
    const loop = () => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const b of buf) { const v = (b - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / buf.length);
      const pct = Math.min(100, rms * 320);
      peak = Math.max(peak, pct);
      const bar = el.querySelector('#mic-bar');
      if (bar) {
        bar.style.width = `${pct}%`;
        el.querySelector('#mic-db').textContent = rms > 0.0005 ? `${(20 * Math.log10(rms)).toFixed(0)} dB` : 'silent';
      }
      raf = requestAnimationFrame(loop);
    };
    loop();

    const finish = () => {
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
      state.stream = null;
      ctx.close().catch(() => {});
      state.audioCtx = null;
      close();
      const ok = peak > 6;
      state.facts.push(['Microphone test', ok ? `Picked up audio (peak ${peak.toFixed(0)}%)` : 'No audio detected']);
      toast(ok ? 'Microphone works' : 'No sound detected — check the mic', ok ? 'ok' : 'bad');
      render();
    };
    el.querySelector('#mic-done').onclick = finish;
  }

  async function cameraTest() {
    let devices;
    try {
      devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    } catch { devices = []; }

    let idx = 0;
    const open = async () => {
      state.stream?.getTracks().forEach((t) => t.stop());
      const constraint = devices[idx]?.deviceId
        ? { video: { deviceId: { exact: devices[idx].deviceId } } }
        : { video: { facingMode: idx % 2 ? 'environment' : 'user' } };
      try {
        state.stream = await navigator.mediaDevices.getUserMedia(constraint);
        const v = document.querySelector('#cam-v');
        if (v) v.srcObject = state.stream;
        const track = state.stream.getVideoTracks()[0];
        const s = track.getSettings();
        const lbl = document.querySelector('#cam-l');
        if (lbl) lbl.textContent = `${track.label || `Camera ${idx + 1}`} — ${s.width}×${s.height}`;
      } catch (e) {
        toast(`Camera blocked: ${e.name}`, 'bad');
      }
    };

    const { el, close } = overlay(`
      <div style="width:100%;max-width:420px;text-align:center">
        <video id="cam-v" autoplay playsinline muted
          style="width:100%;border-radius:14px;background:#000;aspect-ratio:3/4;object-fit:cover"></video>
        <div class="small mono" id="cam-l" style="color:#a3abbb;margin-top:10px">Starting…</div>
        <div style="display:flex;gap:9px;margin-top:16px">
          <button class="btn" id="cam-next">Next camera</button>
          <button class="btn btn-primary" id="cam-done">Done</button>
        </div>
      </div>`);
    el.style.background = '#0b0c10';
    el.style.mixBlendMode = 'normal';

    await open();
    el.querySelector('#cam-next').onclick = async () => {
      idx = (idx + 1) % Math.max(1, devices.length || 2);
      await open();
    };
    el.querySelector('#cam-done').onclick = () => {
      state.stream?.getTracks().forEach((t) => t.stop());
      state.stream = null;
      close();
      state.facts.push(['Camera test', `${devices.length || 'unknown'} camera(s) previewed`]);
      toast('Camera test finished', 'ok');
      render();
    };
  }

  function gpsTest() {
    if (!navigator.geolocation) { toast('No geolocation support', 'bad'); return; }
    toast('Getting a fix — this can take a moment outdoors');
    setTest('location', { state: 'run', detail: 'Waiting for a GPS fix…' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const acc = pos.coords.accuracy;
        state.facts.push(['GPS accuracy', `±${acc.toFixed(0)} m`]);
        if (Number.isFinite(pos.coords.altitude)) state.facts.push(['Altitude', `${pos.coords.altitude.toFixed(0)} m`]);
        state.facts.push(['Fix source', acc < 25 ? 'GPS satellites' : acc < 500 ? 'Wi-Fi / cell towers' : 'Coarse network estimate']);
        const st = acc < 30 ? 'ok' : acc < 200 ? 'warn' : 'bad';
        setTest('location', { state: st, detail: `Fix accurate to ±${acc.toFixed(0)} m` });
        toast(`Location fixed to ±${acc.toFixed(0)} m`, st === 'ok' ? 'ok' : '');
        render();
      },
      (err) => {
        setTest('location', { state: 'bad', detail: err.message });
        toast(`GPS failed: ${err.message}`, 'bad');
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }

  async function motionTest() {
    if (typeof DeviceMotionEvent === 'undefined') { toast('No motion sensors', 'bad'); return; }
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        const r = await DeviceMotionEvent.requestPermission();
        if (r !== 'granted') { toast('Motion permission denied', 'bad'); return; }
      } catch { toast('Motion permission failed', 'bad'); return; }
    }

    const { el, close } = overlay(`
      <div style="width:100%;max-width:340px;text-align:center">
        <h3>Tilt and shake the device</h3>
        <div class="small" style="color:#a3abbb;margin-bottom:16px">All three axes should move.</div>
        <div class="mono" id="m-read" style="font-size:15px;line-height:2;color:#e9ecf2">waiting…</div>
        <button class="btn" id="m-done" style="margin-top:20px">Done</button>
      </div>`);
    el.style.background = '#0b0c10';
    el.style.mixBlendMode = 'normal';

    const seen = { x: 0, y: 0, z: 0 };
    let gyro = false;
    const on = (e) => {
      const a = e.accelerationIncludingGravity || {};
      seen.x = Math.max(seen.x, Math.abs(a.x || 0));
      seen.y = Math.max(seen.y, Math.abs(a.y || 0));
      seen.z = Math.max(seen.z, Math.abs(a.z || 0));
      if (e.rotationRate && (e.rotationRate.alpha || e.rotationRate.beta)) gyro = true;
      const r = el.querySelector('#m-read');
      if (r) r.innerHTML = `X ${(a.x || 0).toFixed(2)}<br>Y ${(a.y || 0).toFixed(2)}<br>Z ${(a.z || 0).toFixed(2)}`
        + `<br><span style="font-size:12px;color:#6f7889">gyro ${gyro ? 'detected' : 'not seen yet'}</span>`;
    };
    window.addEventListener('devicemotion', on);
    state.cleanups.push(() => window.removeEventListener('devicemotion', on));

    el.querySelector('#m-done').onclick = () => {
      window.removeEventListener('devicemotion', on);
      close();
      const axes = Object.values(seen).filter((v) => v > 0.4).length;
      state.facts.push(['Accelerometer axes active', `${axes} of 3`]);
      state.facts.push(['Gyroscope', gyro ? 'Working' : 'Not detected']);
      setTest('sensors', {
        state: axes === 3 ? 'ok' : axes ? 'warn' : 'bad',
        detail: `${axes} of 3 axes responded${gyro ? ', gyro OK' : ''}`,
      });
      toast(axes === 3 ? 'All three axes working' : `${axes} of 3 axes responded`, axes === 3 ? 'ok' : 'bad');
      render();
    };
  }

  function vibrateTest() {
    if (!navigator.vibrate) { toast('No vibration motor exposed', 'bad'); return; }
    const ok = navigator.vibrate([160, 90, 160, 90, 420]);
    state.facts.push(['Vibration', ok ? 'Pattern sent to motor' : 'Rejected by browser']);
    toast(ok ? 'Did you feel three buzzes?' : 'Vibration blocked', ok ? 'ok' : 'bad');
  }

  /* ---------------- wiring ---------------- */

  function wire() {
    $('#run').onclick = runAll;
    $('#save') && ($('#save').onclick = () => {
      const r = save('device', 'Device Health', scoreTests(state.tests), { tests: state.tests, facts: state.facts });
      toast('Report saved', 'ok');
      location.hash = `#/reports/${r.id}`;
    });
    $('#share') && ($('#share').onclick = () => shareReport({
      kind: 'device', title: 'Device Health', ts: Date.now(),
      score: scoreTests(state.tests), data: { tests: state.tests, facts: state.facts },
    }));

    $('#t-screen').onclick  = screenTest;
    $('#t-touch').onclick   = touchTest;
    $('#t-speaker').onclick = speakerTest;
    $('#t-mic').onclick     = micTest;
    $('#t-camera').onclick  = cameraTest;
    $('#t-gps').onclick     = gpsTest;
    $('#t-motion').onclick  = motionTest;
    $('#t-vibrate').onclick = vibrateTest;
  }

  state.tests = TESTS.map((t) => ({ id: t.id, name: t.name, detail: 'Not run yet', state: 'idle' }));
  render();
  return api;
}
