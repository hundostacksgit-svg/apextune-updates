/* Saved report history: list, detail, share and delete. */
import { $, esc, toast, fmt, rows, scoreRing, confirmDialog, empty, testItem } from '../ui.js';
import { store } from '../store.js';
import { verdict, toText, shareReport, copyReport, downloadReport } from '../report.js';
import { severity, describe } from '../obd/dtc.js';

const KIND_LABEL = { car: 'Vehicle', device: 'Device', system: 'System' };

export async function mount(host, id) {
  if (id) return detail(host, id);
  return list(host);
}

/* ---------------- list ---------------- */

function list(host) {
  const reports = store.reports();

  host.innerHTML = `
    <h1>Reports</h1>
    <p class="sub">${reports.length ? `${reports.length} saved scan${reports.length === 1 ? '' : 's'}, stored only on this device.` : 'Saved scans appear here.'}</p>

    ${reports.length ? reports.map((r) => {
      const v = verdict(r.score);
      return `<a class="card tap card-row" href="#/reports/${esc(r.id)}" style="display:flex">
        <span class="grow">
          <h3>${esc(r.title)}</h3>
          <div class="small muted">${esc(KIND_LABEL[r.kind] || r.kind)} · ${esc(fmt.when(r.ts))}</div>
        </span>
        <span class="badge ${v.tone}">${r.score}</span>
        <span class="arrow">›</span>
      </a>`;
    }).join('') : empty('≣', 'No reports yet', 'Run a scan from any tab and tap Save report.')}

    ${reports.length ? `<div class="hr"></div>
      <button class="btn btn-danger" id="wipe">Delete all reports</button>` : ''}
  `;

  $('#wipe') && ($('#wipe').onclick = async () => {
    const ok = await confirmDialog({
      title: 'Delete all reports?',
      body: `This permanently removes all ${reports.length} saved scans from this device. It cannot be undone.`,
      confirmText: 'Delete all',
      danger: true,
    });
    if (!ok) return;
    store.clearReports();
    toast('All reports deleted');
    list(host);
  });

  return {};
}

/* ---------------- detail ---------------- */

function detail(host, id) {
  const r = store.getReport(id);
  if (!r) {
    host.innerHTML = `${empty('?', 'Report not found', 'It may have been deleted.')}
      <a class="btn" href="#/reports">Back to reports</a>`;
    return {};
  }

  const v = verdict(r.score);

  host.innerHTML = `
    <h1>${esc(r.title)}</h1>
    <p class="sub">${esc(new Date(r.ts).toLocaleString())}</p>

    ${scoreRing(r.score, v.label, `${KIND_LABEL[r.kind] || r.kind} report`)}

    <div class="btn-row">
      <button class="btn btn-primary" id="share">Share</button>
      <button class="btn" id="copy">Copy</button>
      <button class="btn" id="dl">Save file</button>
    </div>

    ${r.kind === 'car' ? carBody(r) : testBody(r)}

    <h2>Raw text</h2>
    <pre class="log" style="max-height:320px">${esc(toText(r))}</pre>

    <div class="hr"></div>
    <button class="btn btn-danger" id="del">Delete this report</button>
    <div class="spacer"></div>
    <a class="btn" href="#/reports">Back to all reports</a>
  `;

  $('#share').onclick = () => shareReport(r);
  $('#copy').onclick  = () => copyReport(r);
  $('#dl').onclick    = () => downloadReport(r);
  $('#del').onclick   = async () => {
    const ok = await confirmDialog({
      title: 'Delete this report?',
      body: 'It will be removed from this device permanently.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    store.deleteReport(r.id);
    toast('Report deleted');
    location.hash = '#/reports';
  };

  return {};
}

function carBody(r) {
  const d = r.data || {};
  const groups = [
    ['Stored', d.dtc?.stored || [], ''],
    ['Pending', d.dtc?.pending || [], 'pending'],
    ['Permanent', d.dtc?.permanent || [], 'permanent'],
  ];
  const any = groups.some(([, c]) => c.length);
  const notReady = (d.status?.monitors || []).filter((m) => m.supported && !m.ready);

  return `
    <h2>Trouble codes</h2>
    ${any ? groups.filter(([, c]) => c.length).map(([label, codes, cls]) =>
      codes.map((c) => `<div class="dtc ${cls}">
        <div class="code">${esc(c)}</div>
        <div class="desc">${esc(describe(c))}</div>
        <div class="meta">${esc(label)} · ${esc(severity(c))}</div>
      </div>`).join('')).join('')
      : '<div class="card"><div class="small" style="color:var(--ok)">No trouble codes recorded.</div></div>'}

    <h2>Vehicle</h2>
    ${rows([
      ['VIN', d.vin || 'Not reported'],
      ['Protocol', d.info?.protocol],
      ['Adapter', d.info?.adapter],
      ['Battery', Number.isFinite(d.voltage) ? `${d.voltage.toFixed(1)} V` : null],
      ['Check-engine light', d.status ? (d.status.mil ? 'ON' : 'Off') : null],
      ['Monitors not ready', d.status ? String(notReady.length) : null],
    ])}

    ${d.live && Object.keys(d.live).length ? `<h2>Live data at scan time</h2>
      ${rows(Object.entries(d.live).map(([k, val]) =>
        [k, typeof val === 'number' ? String(Number(val.toFixed(2))) : String(val)]))}` : ''}
  `;
}

function testBody(r) {
  const d = r.data || {};
  return `
    <h2>Checks</h2>
    <ul class="tests">${(d.tests || []).map(testItem).join('')}</ul>
    ${d.facts?.length ? `<h2>Details</h2>${rows(d.facts)}` : ''}
  `;
}
