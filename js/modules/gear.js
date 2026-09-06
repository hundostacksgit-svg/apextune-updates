/* Buyer's guide: the only place money is needed is the car adapter. */
import { esc } from '../ui.js';

const ADAPTERS = [
  {
    name: 'Generic ELM327 BLE (Bluetooth 4.0)',
    price: '$15 – $22',
    tone: 'ok',
    best: 'Cheapest thing that works',
    notes: 'Search "ELM327 BLE 4.0 OBD2". Must say BLE / Bluetooth 4.0 — plain "Bluetooth 3.0" adapters use Classic SPP, which no browser can talk to. Quality varies between sellers; buy from one with returns.',
  },
  {
    name: 'Vgate iCar Pro BLE 4.0',
    price: '$28 – $40',
    tone: 'ok',
    best: 'The value pick — buy this one',
    notes: 'The most reliable cheap BLE adapter. Sleeps when the car is off so it will not drain your battery, and it pairs with this app first try. Get the BLE 4.0 version, not the Wi-Fi or Classic one.',
  },
  {
    name: 'ELM327 USB cable',
    price: '$10 – $18',
    tone: '',
    best: 'Laptops, or phones with a USB-C OTG cable',
    notes: 'Connects over Web Serial instead of Bluetooth. Rock solid and the cheapest option, but you are tethered to the car. On a phone you also need a USB-C OTG adapter (about $8).',
  },
  {
    name: 'OBDLink LX / CX',
    price: '$60 – $110',
    tone: 'info',
    best: 'If you scan cars often',
    notes: 'Genuine chipset, much faster polling, far better on stubborn vehicles. Overkill for occasional use — only worth it if the cheap ones frustrate you.',
  },
];

const AVOID = [
  ['Wi-Fi OBD-II adapters', 'They make your phone join their own network. Browsers cannot reach them, and you lose mobile data while connected.'],
  ['Bluetooth 3.0 / "Classic" adapters', 'They use the SPP profile. No browser on any platform can open an SPP link — this is an OS restriction, not an app limitation.'],
  ['$6 mystery clones', 'Often fake chips that hang mid-scan or read only one protocol. The $10 you save is not worth a scan that stalls.'],
];

export async function mount(host) {
  host.innerHTML = `
    <h1>What you need</h1>
    <p class="sub">Device and system checks need nothing at all. Only the vehicle scan needs a small adapter.</p>

    <div class="note ok" style="border-color:rgba(49,208,122,.3);background:rgba(49,208,122,.06)">
      <strong>Already free:</strong> every Device and System test runs on hardware you own. Start there.
    </div>

    <h2>OBD-II adapters</h2>
    <p class="small muted">Any car sold in the US from 1996, in the EU from 2001 (petrol) / 2004 (diesel), has an OBD-II port — usually under the dash near your left knee.</p>

    ${ADAPTERS.map((a) => `
      <div class="card">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
          <h3>${esc(a.name)}</h3>
          <span class="badge ${a.tone || 'idle'}">${esc(a.price)}</span>
        </div>
        <div class="small" style="color:var(--accent);font-weight:650;margin:3px 0 6px">${esc(a.best)}</div>
        <div class="small muted">${esc(a.notes)}</div>
      </div>`).join('')}

    <h2>Skip these</h2>
    ${AVOID.map(([n, why]) => `
      <div class="card" style="border-left:3px solid var(--bad)">
        <h3>${esc(n)}</h3>
        <div class="small muted">${esc(why)}</div>
      </div>`).join('')}

    <h2>Browser support</h2>
    <div class="rows">
      <div class="row"><span class="rk">Chrome on Android</span><span class="rv">Bluetooth + USB</span></div>
      <div class="row"><span class="rk">Chrome / Edge on desktop</span><span class="rv">Bluetooth + USB</span></div>
      <div class="row"><span class="rk">Safari / any iPhone browser</span><span class="rv">Demo mode only</span></div>
    </div>
    <div class="note warn" style="margin-top:11px">
      <strong>iPhone users:</strong> Apple does not allow Web Bluetooth or Web Serial in any iOS browser, so live car scanning cannot work from a web app on iPhone. Everything else in this app works fully, and demo mode lets you see exactly what a scan looks like. For live car data on iPhone you need a native app plus a Wi-Fi adapter.
    </div>

    <h2>Deeper PC diagnostics</h2>
    <div class="card">
      <h3>Companion script — free</h3>
      <div class="small muted">A browser cannot see disk SMART health, temperatures or per-process memory. The repo ships <span class="mono">tools/sysreport.py</span>: run it once on your PC with Python and it prints a full hardware report you can paste alongside these results. No install, no dependencies.</div>
    </div>

    <div class="hr"></div>
    <a class="btn" href="#/car">Go to vehicle scan</a>
  `;
  return {};
}
