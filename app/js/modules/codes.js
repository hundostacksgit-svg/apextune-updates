/* Offline trouble-code lookup. No adapter, no connection, no network. */
import { $, esc, toast, empty, repairBlock } from '../ui.js';
import { searchCodes, severity, CODE_COUNT } from '../obd/dtc.js';
import { repairFor, misfireCylinder, DIFFICULTY_LABEL } from '../obd/repairs.js';
import { store } from '../store.js';

const RECENT_KEY = 'recentCodes';
const MAX_RECENT = 8;

const SEV_TONE = { critical: 'bad', major: 'warn', minor: 'info' };

const EXAMPLES = ['P0301', 'P0420', 'P0171', 'P0455', 'P0128', 'U0100'];

export async function mount(host, arg) {
  const initial = arg ? decodeURIComponent(arg).toUpperCase() : '';

  host.innerHTML = `
    <h1>Code Lookup</h1>
    <p class="sub">Type any trouble code and find out what it means. ${CODE_COUNT} codes stored
      on your device — this works with no adapter and no signal.</p>

    <div class="card" style="padding:12px">
      <input id="q" type="search" inputmode="latin" autocapitalize="characters"
        autocomplete="off" spellcheck="false" placeholder="e.g. P0301, or &quot;misfire&quot;"
        value="${esc(initial)}"
        style="width:100%;padding:13px 14px;border-radius:10px;border:1px solid var(--line);
               background:var(--bg-2);color:var(--text);font-family:var(--mono);font-size:16px">
    </div>

    <div id="chips-row"></div>
    <div id="results"></div>
  `;

  const input = $('#q', host);
  const results = $('#results', host);
  const chipsRow = $('#chips-row', host);

  function recents() {
    const r = store.pref(RECENT_KEY);
    return Array.isArray(r) ? r : [];
  }

  function remember(code) {
    const list = [code, ...recents().filter((c) => c !== code)].slice(0, MAX_RECENT);
    store.pref(RECENT_KEY, list);
  }

  function paintChips() {
    const recent = recents();
    const list = recent.length ? recent : EXAMPLES;
    chipsRow.innerHTML = `
      <div class="small muted" style="margin:14px 0 7px">${recent.length ? 'Recent' : 'Try one'}</div>
      <div class="chips">
        ${list.map((c) => `<button class="chip" data-code="${esc(c)}">${esc(c)}</button>`).join('')}
        ${recent.length ? '<button class="chip" data-clear="1">Clear</button>' : ''}
      </div>`;
    chipsRow.querySelectorAll('[data-code]').forEach((b) => {
      b.onclick = () => { input.value = b.dataset.code; run(); };
    });
    const clear = chipsRow.querySelector('[data-clear]');
    if (clear) clear.onclick = () => { store.pref(RECENT_KEY, []); paintChips(); };
  }

  function card(hit) {
    const sev = severity(hit.code);
    return `<div class="dtc ${sev === 'critical' ? '' : sev === 'major' ? 'pending' : 'permanent'}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
        <div class="code">${esc(hit.code)}</div>
        <span class="badge ${SEV_TONE[sev] || 'idle'}">${esc(sev)}</span>
      </div>
      <div class="desc">${esc(hit.desc)}</div>
      ${hit.generated
        ? '<div class="meta">Not in the table — described from its code range</div>'
        : ''}
      ${repairBlock(hit.code, repairFor(hit.code), DIFFICULTY_LABEL,
        { open: hit.exact, cylinder: misfireCylinder(hit.code) })}
    </div>`;
  }

  let timer;
  function run() {
    const q = input.value.trim();
    if (!q) {
      results.innerHTML = `<div class="note info" style="margin-top:14px">
        Enter a code like <span class="mono">P0301</span>, a partial code like
        <span class="mono">P03</span>, or a word like <span class="mono">catalyst</span>.</div>`;
      return;
    }
    const hits = searchCodes(q);
    if (!hits.length) {
      results.innerHTML = empty('?', 'No match',
        `Nothing found for "${q}". Codes look like P0301, C0035, B1000 or U0100.`);
      return;
    }
    if (hits[0].exact) remember(hits[0].code);

    results.innerHTML = `
      <div class="small muted" style="margin:14px 0 7px">
        ${hits.length} result${hits.length === 1 ? '' : 's'}</div>
      ${hits.map(card).join('')}
      <div class="note" style="margin-top:12px">
        These are the generic SAE definitions. Manufacturers assign their own meanings to some
        codes, so treat this as a starting point rather than a diagnosis.
      </div>`;
    paintChips();
  }

  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 160); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); input.blur(); } });

  paintChips();
  run();
  if (!initial) setTimeout(() => input.focus(), 120);

  return { destroy() { clearTimeout(timer); } };
}
