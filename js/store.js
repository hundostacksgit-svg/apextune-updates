/* Local persistence. Everything stays on the device — nothing is uploaded. */

const KEY_REPORTS = 'apextune.reports.v1';
const KEY_PREFS   = 'apextune.prefs.v1';
const MAX_REPORTS = 60;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
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
