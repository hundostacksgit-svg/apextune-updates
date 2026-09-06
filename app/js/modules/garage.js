/* Garage: keep several vehicles and file each scan against the right one. */
import { $, esc, toast, fmt, rows, confirmDialog, empty } from '../ui.js';
import { store } from '../store.js';
import { verdict } from '../report.js';

export async function mount(host, arg) {
  if (arg) return detail(host, arg);
  return list(host);
}

/* ---------------- list ---------------- */

function list(host) {
  const vehicles = store.vehicles();

  host.innerHTML = `
    <h1>Garage</h1>
    <p class="sub">${vehicles.length
      ? `${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'}. Scans file themselves against the matching VIN.`
      : 'Add your vehicles so every scan is filed against the right one.'}</p>

    ${vehicles.length ? vehicles.map((v) => {
      const reps = store.reportsForVehicle(v.id);
      const last = reps[0];
      return `<a class="card tap card-row" href="#/garage/${esc(v.id)}" style="display:flex">
        <span class="glyph">⛃</span>
        <span class="grow">
          <h3>${esc(v.name)}</h3>
          <div class="small muted">${v.vin ? esc(v.vin) : 'No VIN saved'}</div>
          <div class="small muted">${reps.length} scan${reps.length === 1 ? '' : 's'}${
            last ? ` · last ${esc(fmt.when(last.ts))}` : ''}</div>
        </span>
        ${last ? `<span class="badge ${verdict(last.score).tone}">${last.score}</span>` : ''}
        <span class="arrow">›</span>
      </a>`;
    }).join('') : empty('⛃', 'No vehicles yet', 'Add one below, or run a car scan and save it — a scan with a VIN offers to add the vehicle for you.')}

    <div class="spacer"></div>
    <button class="btn btn-primary" id="add">Add a vehicle</button>
  `;

  $('#add', host).onclick = () => editor(host, null);
  return {};
}

/* ---------------- add / edit ---------------- */

function editor(host, vehicle) {
  const v = vehicle || { name: '', vin: '', notes: '' };
  host.innerHTML = `
    <h1>${vehicle ? 'Edit vehicle' : 'Add a vehicle'}</h1>
    <p class="sub">Only a name is required. Adding the VIN lets scans file themselves automatically.</p>

    <div class="card">
      <label class="small muted" for="f-name">Name</label>
      <input id="f-name" value="${esc(v.name)}" placeholder="e.g. Silver Civic" maxlength="40"
        style="width:100%;padding:12px;margin-top:6px;border-radius:10px;border:1px solid var(--line);
               background:var(--bg-2);color:var(--text);font-size:16px">
    </div>
    <div class="card">
      <label class="small muted" for="f-vin">VIN <span class="muted">(optional)</span></label>
      <input id="f-vin" value="${esc(v.vin || '')}" placeholder="17 characters"
        autocapitalize="characters" autocomplete="off" spellcheck="false"
        style="width:100%;padding:12px;margin-top:6px;border-radius:10px;border:1px solid var(--line);
               background:var(--bg-2);color:var(--text);font-family:var(--mono);font-size:16px">
      <div class="small muted" id="vin-note" style="margin-top:7px">
        Find it on the dash by the windscreen, or run a car scan — it reads the VIN for you.
      </div>
    </div>
    <div class="card">
      <label class="small muted" for="f-notes">Notes <span class="muted">(optional)</span></label>
      <input id="f-notes" value="${esc(v.notes || '')}" placeholder="e.g. 2012, 1.8 petrol" maxlength="80"
        style="width:100%;padding:12px;margin-top:6px;border-radius:10px;border:1px solid var(--line);
               background:var(--bg-2);color:var(--text);font-size:16px">
    </div>

    <div class="btn-row">
      <button class="btn" id="cancel">Cancel</button>
      <button class="btn btn-primary" id="save">Save</button>
    </div>
  `;

  const vinInput = $('#f-vin', host);
  vinInput.addEventListener('input', () => {
    // Strip first, then cap: doing it the other way round (or with maxlength)
    // would throw away the tail of a VIN pasted with spaces or punctuation.
    const val = vinInput.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '').slice(0, 17);
    if (val !== vinInput.value) vinInput.value = val;
    const note = $('#vin-note', host);
    if (!val) {
      note.textContent = 'Find it on the dash by the windscreen, or run a car scan — it reads the VIN for you.';
      note.style.color = '';
    } else if (val.length === 17) {
      note.textContent = 'Looks like a valid VIN.';
      note.style.color = 'var(--ok)';
    } else {
      note.textContent = `${val.length} of 17 characters. VINs never contain I, O or Q.`;
      note.style.color = 'var(--text-3)';
    }
  });

  $('#cancel', host).onclick = () => list(host);
  $('#save', host).onclick = () => {
    const name = $('#f-name', host).value.trim();
    if (!name) { toast('Give the vehicle a name', 'bad'); return; }
    const vin = vinInput.value.trim();
    if (vin && vin.length !== 17) { toast('A VIN is exactly 17 characters — clear it or fix it', 'bad'); return; }
    store.saveVehicle({ id: vehicle?.id, name, vin, notes: $('#f-notes', host).value.trim() });
    toast(vehicle ? 'Vehicle updated' : 'Vehicle added', 'ok');
    list(host);
  };
}

/* ---------------- one vehicle ---------------- */

function detail(host, id) {
  const v = store.getVehicle(id);
  if (!v) {
    host.innerHTML = `${empty('?', 'Vehicle not found', 'It may have been deleted.')}
      <a class="btn" href="#/garage">Back to garage</a>`;
    return {};
  }
  const reps = store.reportsForVehicle(id);
  const scores = reps.filter((r) => Number.isFinite(r.score)).map((r) => r.score);
  const trend = scores.length >= 2 ? scores[0] - scores[scores.length - 1] : null;

  host.innerHTML = `
    <h1>${esc(v.name)}</h1>
    <p class="sub">${reps.length} scan${reps.length === 1 ? '' : 's'} on record</p>

    ${rows([
      ['VIN', v.vin || 'Not saved'],
      ['Notes', v.notes],
      ['Added', new Date(v.createdAt).toLocaleDateString()],
      ['Latest score', scores.length ? `${scores[0]}/100` : null],
      ['Since first scan', trend === null ? null
        : trend === 0 ? 'unchanged'
        : `${trend > 0 ? '+' : ''}${trend} points`],
    ])}

    <div class="btn-row">
      <button class="btn" id="edit">Edit</button>
      <a class="btn btn-primary" href="#/car">New scan</a>
    </div>

    <h2>Scan history</h2>
    ${reps.length ? reps.map((r) => {
      const vd = verdict(r.score);
      return `<a class="card tap card-row" href="#/reports/${esc(r.id)}" style="display:flex">
        <span class="grow">
          <h3>${esc(r.title)}</h3>
          <div class="small muted">${esc(fmt.when(r.ts))}</div>
        </span>
        <span class="badge ${vd.tone}">${r.score}</span>
        <span class="arrow">›</span>
      </a>`;
    }).join('') : '<div class="card"><div class="small muted">No scans filed against this vehicle yet.</div></div>'}

    <div class="hr"></div>
    <button class="btn btn-danger" id="del">Remove this vehicle</button>
    <div class="spacer"></div>
    <a class="btn" href="#/garage">Back to garage</a>
  `;

  $('#edit', host).onclick = () => editor(host, v);
  $('#del', host).onclick = async () => {
    const ok = await confirmDialog({
      title: `Remove ${v.name}?`,
      body: reps.length
        ? `Its ${reps.length} saved scan${reps.length === 1 ? '' : 's'} will be kept but no longer filed against a vehicle.`
        : 'This removes the vehicle from your garage.',
      confirmText: 'Remove',
      danger: true,
    });
    if (!ok) return;
    store.deleteVehicle(id);
    toast('Vehicle removed');
    location.hash = '#/garage';
  };
  return {};
}
