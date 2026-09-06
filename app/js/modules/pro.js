/* Pro status: unlock with a code, or find out how to buy one. */
import { $, esc, toast, rows, confirmDialog } from '../ui.js';
import { isPro, activate, deactivate, licence, isValidCode, format, normalise } from '../pro.js';
import { BUY, buyUrl } from '../config.js';

const INCLUDED = [
  ['Live vehicle scanning', 'Connect a real adapter over Bluetooth or USB'],
  ['Read and clear codes', 'Stored, pending and permanent, plus mode 04 clearing'],
  ['Freeze frame', 'The engine conditions captured when a fault was stored'],
  ['Data logging', 'Record a drive and export every sample as CSV'],
  ['Garage', 'Several vehicles, each with its own scan history'],
];

const FREE_FOREVER = [
  'Every device and system test',
  'Full trouble-code lookup, offline',
  'Demo mode for the whole car scan',
  'The companion PC hardware script',
];

export async function mount(host) {
  function render() {
    const lic = licence();
    host.innerHTML = lic ? active(lic) : inactive();
    wire();
  }

  function active(lic) {
    return `
      <h1>Pro is active</h1>
      <p class="sub">Thanks — everything is unlocked on this device.</p>
      <div class="card" style="border-color:var(--ok)">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
          <div>
            <h3 style="color:var(--ok)">Unlocked</h3>
            <div class="small muted mono">${esc(format(lic.code))}</div>
          </div>
          <span class="badge ok">Pro</span>
        </div>
      </div>
      ${rows([['Activated', new Date(lic.at).toLocaleDateString()]])}

      <h2>What you have</h2>
      ${rows(INCLUDED.map(([n, d]) => [n, d]))}

      <div class="note" style="margin-top:14px">
        Your code is stored in this browser. Enter it again on another device or
        after clearing browsing data — it isn't tied to one machine.
      </div>

      <div class="hr"></div>
      <button class="btn btn-danger" id="off">Remove this licence</button>
      <div class="spacer"></div>
      <a class="btn" href="#/home">Back to home</a>`;
  }

  function inactive() {
    return `
      <h1>Unlock Pro</h1>
      <p class="sub">One payment of ${esc(BUY.price)}. No subscription, no account.</p>

      <div class="card">
        <label class="small muted" for="code">Already have a code?</label>
        <input id="code" placeholder="OMNIDX-XXXX-XXXX-XXXX"
          autocapitalize="characters" autocomplete="off" spellcheck="false"
          style="width:100%;padding:13px;margin-top:6px;border-radius:10px;border:1px solid var(--line);
                 background:var(--bg-2);color:var(--text);font-family:var(--mono);font-size:16px">
        <div class="small muted" id="hint" style="margin-top:8px">Paste the code from your receipt.</div>
        <div class="btn-row" style="margin-bottom:0">
          <button class="btn btn-primary" id="go">Activate</button>
        </div>
      </div>

      <h2>What Pro adds</h2>
      ${rows(INCLUDED.map(([n, d]) => [n, d]))}

      <h2>Free forever</h2>
      <div class="note">
        ${FREE_FOREVER.map((f) => `• ${esc(f)}`).join('<br>')}
      </div>

      <h2>Buy a code</h2>
      <a class="btn btn-primary" href="${esc(buyUrl())}" target="_blank" rel="noopener">
        Pay ${esc(BUY.price)}${BUY.checkoutUrl ? '' : ` with Cash App (${esc(BUY.cashtag)})`}
      </a>
      <div class="note warn" style="margin-top:12px">
        <strong>Put your email in the payment note.</strong> Cash App doesn't pass along an order,
        so that note is the only way to know where to send your code. It's sent back by hand,
        usually within a day.
        ${BUY.contactEmail ? `<br>Nothing after 24 hours? Contact <span class="mono">${esc(BUY.contactEmail)}</span>.` : ''}
      </div>

      <div class="spacer"></div>
      <a class="btn" href="#/car">Try demo mode instead</a>`;
  }

  function wire() {
    const off = $('#off', host);
    if (off) {
      off.onclick = async () => {
        const ok = await confirmDialog({
          title: 'Remove this licence?',
          body: 'Pro features lock again on this device. Your code keeps working — you can enter it here any time.',
          confirmText: 'Remove',
          danger: true,
        });
        if (!ok) return;
        deactivate();
        toast('Licence removed');
        render();
      };
      return;
    }

    const input = $('#code', host);
    const hint = $('#hint', host);
    const submit = () => {
      const raw = input.value;
      if (!normalise(raw)) { toast('Enter your code first', 'bad'); return; }
      if (!isValidCode(raw)) {
        hint.textContent = 'That code isn\'t valid. Check for typos — codes never contain I, O, 0 or 1.';
        hint.style.color = 'var(--bad)';
        toast('Code not recognised', 'bad');
        return;
      }
      activate(raw);
      toast('Pro unlocked — thank you', 'ok');
      render();
    };

    input.addEventListener('input', () => {
      const v = normalise(input.value).slice(0, 18);
      input.value = v.length > 6 ? format(v) : v;
      hint.textContent = 'Paste the code from your receipt.';
      hint.style.color = '';
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    $('#go', host).onclick = submit;
  }

  render();
  return {};
}
