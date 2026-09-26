/*
 * The front-page console.
 *
 * The first thing on the page is the tune running — the lines it prints, in
 * the order it prints them, with the process count on the right falling as
 * each section lands — rather than a screenshot or a paragraph. It is an
 * example run on an example PC and the badge on the window says so; the
 * real script prints your machine and your numbers.
 *
 * It plays once on its own, pauses while the pointer is over it or the tab is
 * hidden, and loops with a breath between runs. With reduced motion asked
 * for, it shows the finished run at once.
 */

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* [delay ms, class, text, process count after this line (optional)] */
const RUN = [
  [0,    'h',   '== Reading this PC'],
  [260,  'dim', '  Windows 11 Pro 24H2 (build 26100)'],
  [180,  'dim', '  CPU  AMD Ryzen 5 5600X · 6 cores / 12 threads'],
  [180,  'dim', '  GPU  NVIDIA GeForce RTX 3060'],
  [180,  'dim', '  RAM  16 GB · NVMe · desktop · UEFI · Secure Boot on'],
  [320,  'w',   '  Processes running now: 214'],
  [700,  'h',   '== Your key'],
  [420,  'ok',  '  Key accepted. Locked to this PC.'],
  [700,  'h',   '== Safety first'],
  [520,  '',    '  + Restore point "OmniDx Tune" created'],
  [300,  '',    '  + Every change recorded: C:\\OmniDx\\undo\\undo.ps1'],
  [700,  'h',   '== Startup apps'],
  [420,  '',    '  + 11 disabled: Discord, Spotify, Steam, Epic, OneDrive, Teams, Edge, Cortana…', 206],
  [600,  'h',   '== Services'],
  [560,  '',    '  + 38 stopped: print spooler (no printer), fax, phone link, maps, diagnostics…', 168],
  [600,  'h',   '== Scheduled tasks'],
  [420,  '',    '  + 19 telemetry and upload tasks off', 161],
  [600,  'h',   '== Preinstalled apps'],
  [520,  '',    '  + 14 removed: Phone Link, Maps, Weather, News, Feedback Hub, 3D Viewer…', 139],
  [600,  'h',   '== Telemetry, background activity, the shell'],
  [480,  '',    '  + Diagnostics off · background apps off · widgets, tips, ads off', 112],
  [600,  'h',   '== The OmniDx power plan'],
  [520,  '',    '  + Created and active: CPU 100/100 · boost aggressive · no core parking · PCIe, USB power saving off'],
  [600,  'h',   '== Network'],
  [480,  '',    '  + Ethernet: Nagle off · power saving off · interrupt moderation off'],
  [600,  'h',   '== Discord, Spotify, browsers'],
  [360,  '',    '  + Discord: hardware acceleration on, no auto-start'],
  [300,  '',    '  + Spotify: hardware acceleration on, no auto-start'],
  [300,  '',    '  + Chrome: no background mode'],
  [600,  'h',   '== Game profiles'],
  [520,  '',    '  + Fortnite · VALORANT · Marvel Rivals found: high priority, GPU high performance, fullscreen optimisations off'],
  [800,  'h',   '== Done'],
  [420,  'ok',  '  Processes: 214 → 86. Restart for the real number.', 86],
  [300,  'w',   '  Report, BIOS checklist and per-game settings: C:\\OmniDx\\report.txt'],
];
const BEFORE = 214;
const AFTER = 86;
const LOOP_PAUSE = 5200;

export function initConsole(root) {
  const log = root.querySelector('.console-log');
  const count = root.querySelector('[data-count]');
  const meter = root.querySelector('[data-meter]');
  if (!log) return;

  let timers = [];
  let paused = false;
  let pendingRestart = null;

  const setCount = (n) => {
    if (count) count.textContent = String(n);
    if (meter) meter.style.width = `${Math.round((n / BEFORE) * 100)}%`;
  };

  const finish = () => {
    log.innerHTML = RUN.map(([, cls, text]) => `<span class="${cls}">${esc(text)}</span>`).join('\n');
    setCount(AFTER);
  };

  const clear = () => { timers.forEach(clearTimeout); timers = []; if (pendingRestart) { clearTimeout(pendingRestart); pendingRestart = null; } };

  const play = () => {
    clear();
    log.innerHTML = '<span class="caret"></span>';
    setCount(BEFORE);
    let t = 300;
    RUN.forEach(([delay, cls, text, n], i) => {
      t += delay;
      timers.push(setTimeout(() => {
        const caret = log.querySelector('.caret');
        const line = document.createElement('span');
        line.className = cls;
        line.textContent = (i ? '\n' : '') + text;
        log.insertBefore(line, caret);
        if (n !== undefined) setCount(n);
        // Keep the newest line in view without the page scrolling.
        log.scrollTop = log.scrollHeight;
      }, t));
    });
    timers.push(setTimeout(() => { log.querySelector('.caret')?.remove(); }, t + 400));
    pendingRestart = setTimeout(() => { if (!paused) play(); else pendingRestart = null; }, t + LOOP_PAUSE);
  };

  if (REDUCED) { finish(); return; }

  // Pause while somebody is reading it or the tab is away; resume after.
  root.addEventListener('pointerenter', () => { paused = true; });
  root.addEventListener('pointerleave', () => { paused = false; if (!pendingRestart && !timers.some(Boolean)) play(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clear(); finish(); } else play();
  });

  // Start when it comes into view, so the run is seen from its first line.
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { io.disconnect(); play(); }
  }, { threshold: 0.2 });
  io.observe(root);
}

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
