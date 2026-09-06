import { esc, fmt } from '../ui.js';
import { store } from '../store.js';
import { verdict } from '../report.js';
import { isStandalone, canInstall, promptInstall } from '../app.js';

const CARDS = [
  { href: '#/car',    glyph: '⛃', title: 'Vehicle Scan',   sub: 'Read check-engine codes, live sensors and readiness. Needs an OBD-II adapter — or try demo mode.' },
  { href: '#/phone',  glyph: '▭', title: 'This Device',    sub: 'Battery, sensors, screen, cameras, mic, touch and speed. No extra hardware.' },
  { href: '#/system', glyph: '▤', title: 'System & Network',sub: 'CPU, memory, GPU, storage and connection quality for this machine.' },
];

export async function mount(host) {
  const reports = store.reports();
  const recent = reports.slice(0, 3);
  const showInstall = !isStandalone();

  host.innerHTML = `
    <h1>Diagnostics</h1>
    <p class="sub">Check your car, your phone and your computer — all offline, all on this device.</p>

    ${showInstall ? `
      <div class="note info" id="install-note">
        <strong>Add to your home screen</strong><br>
        Runs full screen and works with no signal — handy in a parking lot or garage.
        <div class="btn-row" style="margin-bottom:0">
          <button class="btn btn-primary" id="do-install">${canInstall() ? 'Install app' : 'How to install'}</button>
        </div>
      </div>` : ''}

    <h2>Run a scan</h2>
    ${CARDS.map((c) => `
      <a class="card tap card-row" href="${c.href}" style="display:flex">
        <span class="glyph">${c.glyph}</span>
        <span class="grow">
          <h3>${esc(c.title)}</h3>
          <div class="small muted">${esc(c.sub)}</div>
        </span>
        <span class="arrow">›</span>
      </a>`).join('')}

    <h2>Recent reports</h2>
    ${recent.length ? recent.map((r) => {
      const v = verdict(r.score);
      return `<a class="card tap card-row" href="#/reports/${esc(r.id)}" style="display:flex">
        <span class="grow">
          <h3>${esc(r.title)}</h3>
          <div class="small muted">${esc(fmt.when(r.ts))}</div>
        </span>
        <span class="badge ${v.tone}">${r.score}</span>
      </a>`;
    }).join('') + `<a class="btn" href="#/reports" style="margin-top:4px">View all ${reports.length}</a>`
      : `<div class="card"><div class="small muted">No scans yet. Run one above and it will be saved here.</div></div>`}

    <h2>Hardware</h2>
    <a class="card tap card-row" href="#/gear" style="display:flex">
      <span class="glyph">⚙</span>
      <span class="grow">
        <h3>What you need to buy</h3>
        <div class="small muted">Only the car side needs an adapter. Budget picks from about $15.</div>
      </span>
      <span class="arrow">›</span>
    </a>

    <div class="hr"></div>
    <p class="small muted">Nothing leaves your device. Reports are stored locally and are only shared when you tap Share.</p>
  `;

  host.querySelector('#do-install')?.addEventListener('click', async () => {
    const ok = await promptInstall();
    if (!ok && !canInstall()) location.hash = '#/gear';
  });

  return {};
}
