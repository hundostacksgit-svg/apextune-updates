/* Local persistence. Everything stays on the device — nothing is uploaded. */

const KEY_REPORTS = 'omnidx.reports.v1';
const KEY_PREFS   = 'omnidx.prefs.v1';
const KEY_VEHICLES = 'omnidx.vehicles.v1';
const MAX_REPORTS = 60;

/* Keys used before the rename to OmniDx. Storage is per-origin, so anything
   saved by the old build is still here; adopt it once, then forget about it. */
const LEGACY_KEYS = { [KEY_REPORTS]: 'apextune.reports.v1', [KEY_PREFS]: 'apextune.prefs.v1' };

function read(key, fallback) {
  try {
    let raw = localStorage.getItem(key);
    if (raw === null && LEGACY_KEYS[key]) {
      raw = localStorage.getItem(LEGACY_KEYS[key]);
      if (raw !== null) {
        localStorage.setItem(key, raw);
        localStorage.removeItem(LEGACY_KEYS[key]);
      }
    }
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // private mode / quota exceeded — app still works, just no history
  }
}

export const store = {
  reports() {
    const list = read(KEY_REPORTS, []);
    return Array.isArray(list) ? list : [];
  },

  saveReport(report) {
    const list = this.reports();
    const rec = { id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ts: Date.now(), ...report };
    list.unshift(rec);
    write(KEY_REPORTS, list.slice(0, MAX_REPORTS));
    return rec;
  },

  getReport(id) {
    return this.reports().find((r) => r.id === id) || null;
  },

  deleteReport(id) {
    write(KEY_REPORTS, this.reports().filter((r) => r.id !== id));
  },

  clearReports() {
    write(KEY_REPORTS, []);
  },

  /* ---------- garage ---------- */

  vehicles() {
    const list = read(KEY_VEHICLES, []);
    return Array.isArray(list) ? list : [];
  },

  saveVehicle({ id, name, vin, notes }) {
    const list = this.vehicles();
    const existing = id ? list.find((v) => v.id === id) : null;
    if (existing) {
      Object.assign(existing, { name, vin, notes });
    } else {
      list.push({
        id: `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        name, vin, notes, createdAt: Date.now(),
      });
    }
    write(KEY_VEHICLES, list);
    return existing || list[list.length - 1];
  },

  getVehicle(id) {
    return this.vehicles().find((v) => v.id === id) || null;
  },

  /** Match a scanned VIN to a saved vehicle so reports file themselves. */
  vehicleByVin(vin) {
    if (!vin) return null;
    return this.vehicles().find((v) => v.vin && v.vin.toUpperCase() === vin.toUpperCase()) || null;
  },

  deleteVehicle(id) {
    write(KEY_VEHICLES, this.vehicles().filter((v) => v.id !== id));
    // Detach rather than delete: the scans still happened.
    const reports = this.reports().map((r) => (r.vehicleId === id ? { ...r, vehicleId: null } : r));
    write(KEY_REPORTS, reports);
  },

  reportsForVehicle(id) {
    return this.reports().filter((r) => r.vehicleId === id);
  },

  prefs() {
    return read(KEY_PREFS, {});
  },

  pref(key, value) {
    if (value === undefined) return this.prefs()[key];
    const p = this.prefs();
    p[key] = value;
    write(KEY_PREFS, p);
    return value;
  },
};
