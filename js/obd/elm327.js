/* ELM327 driver: command queue, response framing, and the OBD-II service calls. */
import { PIDS, decodeSupport } from './pids.js';
import { decodeDTCBytes, decodeMonitors } from './dtc.js';

const PROMPT = '>';
const NO_DATA = /NO DATA|UNABLE TO CONNECT|BUS INIT|CAN ERROR|STOPPED|ERROR|\?$/i;

/**
 * CAN (ISO 15765) trouble-code replies lead with a DTC count byte; the older
 * ISO 9141 / KWP2000 replies do not. Strip it only when the leading byte
 * genuinely matches the non-empty code pairs that follow, so a real code
 * beginning 0x02 is never mistaken for a count.
 */
export function stripDTCCount(d) {
  if (d.length < 2) return d;
  const n = d[0];
  const rest = d.slice(1);
  if (n > 32 || rest.length % 2 !== 0) return d;
  let filled = 0;
  for (let i = 0; i + 1 < rest.length; i += 2) if (rest[i] || rest[i + 1]) filled++;
  return n === filled ? rest : d;
}

export class ELM327 {
  constructor(transport, { onLog } = {}) {
    this.t = transport;
    this.onLog = onLog || (() => {});
    this.buf = '';
    this.queue = [];
    this.pending = null;
    this.connected = false;
    this.info = { adapter: '', protocol: '', voltage: null };
    this.supported = new Set();

    this.t.onData((chunk) => this._ingest(chunk));
    this.t.onDisconnect?.(() => {
      this.connected = false;
      this._failAll(new Error('Adapter disconnected'));
      this.onDisconnected?.();
    });
  }

  /* ---------- plumbing ---------- */

  _ingest(chunk) {
    this.buf += chunk;
    if (!this.buf.includes(PROMPT)) return;
    const idx = this.buf.indexOf(PROMPT);
    const raw = this.buf.slice(0, idx);
    this.buf = this.buf.slice(idx + 1);

    const p = this.pending;
    this.pending = null;
    if (p) {
      clearTimeout(p.timer);
      this.onLog({ dir: 'rx', text: raw.replace(/[\r\n]+/g, ' ').trim() });
      p.resolve(raw);
    }
    this._drain();
  }

  _failAll(err) {
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(err); this.pending = null; }
    while (this.queue.length) this.queue.shift().reject(err);
  }

  _drain() {
    if (this.pending || !this.queue.length) return;
    const job = this.queue.shift();
    this.pending = job;
    job.timer = setTimeout(() => {
      if (this.pending === job) {
        this.pending = null;
        this.buf = '';
        job.reject(new Error(`Timed out waiting for "${job.cmd}"`));
        this._drain();
      }
    }, job.timeout);

    this.onLog({ dir: 'tx', text: job.cmd });
    this.t.write(`${job.cmd}\r`).catch((e) => {
      clearTimeout(job.timer);
      if (this.pending === job) this.pending = null;
      job.reject(e);
      this._drain();
    });
  }

  /** Send one command and resolve with its raw text response. */
  send(cmd, timeout = 5000) {
    return new Promise((resolve, reject) => {
      this.queue.push({ cmd, timeout, resolve, reject });
      this._drain();
    });
  }

  /** Send but never throw — returns '' on failure. Used for optional probes. */
  async trySend(cmd, timeout = 4000) {
    try { return await this.send(cmd, timeout); } catch { return ''; }
  }

  /* ---------- response parsing ---------- */

  /** Split a raw reply into cleaned lines, dropping echo and adapter chatter. */
  static lines(raw) {
    return String(raw)
      .split(/[\r\n]+/)
      .map((l) => l.trim())
      .filter((l) => l && l !== PROMPT && !/^SEARCHING/i.test(l));
  }

  /**
   * Pull the payload bytes for a response to `mode`/`pid`.
   * Handles single frames ("41 0C 1A F8") and ISO-TP multi-frame
   * replies ("014" then "0: 49 02 ...", "1: ...").
   */
  static payload(raw, mode, pid = null) {
    const lines = ELM327.lines(raw);
    if (!lines.length || lines.some((l) => NO_DATA.test(l))) return null;

    const respMode = (mode + 0x40).toString(16).toUpperCase().padStart(2, '0');
    const multi = lines.some((l) => /^[0-9A-F]+\s*:/i.test(l));

    let bytes = [];
    if (multi) {
      const frames = lines
        .filter((l) => /^[0-9A-F]+\s*:/i.test(l))
        .sort((a, b) => parseInt(a, 16) - parseInt(b, 16));
      for (const f of frames) {
        const body = f.slice(f.indexOf(':') + 1);
        bytes.push(...ELM327.hexBytes(body));
      }
    } else {
      // Multiple ECUs can answer; take the first line that carries our mode.
      const hit = lines.find((l) => l.replace(/\s+/g, '').toUpperCase().startsWith(respMode)) || lines[0];
      bytes = ELM327.hexBytes(hit);
    }

    // Trim to the start of our mode echo, then drop mode (+ pid).
    const at = bytes.indexOf(parseInt(respMode, 16));
    if (at < 0) return null;
    bytes = bytes.slice(at + 1);

    if (pid !== null) {
      if (bytes[0] !== pid) return null;
      bytes = bytes.slice(1);
    }
    return bytes;
  }

  static hexBytes(str) {
    const clean = String(str).replace(/[^0-9A-Fa-f]/g, '');
    const out = [];
    for (let i = 0; i + 1 < clean.length; i += 2) out.push(parseInt(clean.substr(i, 2), 16));
    return out;
  }

  /* ---------- session ---------- */

  async connect() {
    await this.t.open();

    // Reset takes the longest; give it room.
    const id = await this.send('ATZ', 9000).catch(() => '');
    this.info.adapter = ELM327.lines(id).filter((l) => /ELM|OBD|v\d/i.test(l)).pop()
      || ELM327.lines(id).pop() || 'Unknown adapter';

    await this.trySend('ATE0');   // echo off — halves the bytes we parse
    await this.trySend('ATL0');   // no linefeeds
    await this.trySend('ATH0');   // no headers
    await this.trySend('ATST64'); // ~100 ms per-request timeout
    await this.trySend('ATSP0');  // auto-detect protocol

    this.connected = true;

    const rv = await this.trySend('ATRV', 3000);
    const v = /(\d+\.\d+)\s*V/i.exec(rv);
    if (v) this.info.voltage = parseFloat(v[1]);

    // The first PID request forces protocol negotiation, so allow extra time.
    const first = await this.trySend('0100', 12000);
    const base = ELM327.payload(first, 0x01, 0x00);
    if (base) decodeSupport(0x00, base).forEach((p) => this.supported.add(p));

    const dp = await this.trySend('ATDP', 3000);
    this.info.protocol = ELM327.lines(dp).pop() || 'Unknown';

    if (!this.supported.size) {
      this.info.ecuReachable = false;
    } else {
      this.info.ecuReachable = true;
      // Walk the remaining support banks.
      for (const bank of [0x20, 0x40, 0x60, 0x80]) {
        if (!this.supported.has(bank)) break;
        const cmd = `01${bank.toString(16).toUpperCase().padStart(2, '0')}`;
        const r = await this.trySend(cmd, 5000);
        const d = ELM327.payload(r, 0x01, bank);
        if (!d) break;
        decodeSupport(bank, d).forEach((p) => this.supported.add(p));
      }
    }
    return this.info;
  }

  supports(pid) {
    // If the ECU never gave us a support map, just try the PID anyway.
    return this.supported.size === 0 || this.supported.has(pid);
  }

  /** Read one Mode 01 PID; resolves to a number, or null if unavailable. */
  async readPID(pid) {
    const def = PIDS[pid];
    if (!def) return null;
    const cmd = `01${pid.toString(16).toUpperCase().padStart(2, '0')}`;
    const raw = await this.trySend(cmd, 3500);
    const d = ELM327.payload(raw, 0x01, pid);
    if (!d || d.length < def.bytes) return null;
    const v = def.dec(d);
    return Number.isFinite(v) ? v : null;
  }

  /** Read many PIDs sequentially; returns { key: value }. */
  async readMany(pidList) {
    const out = {};
    for (const pid of pidList) {
      if (!this.supports(pid)) continue;
      const v = await this.readPID(pid);
      if (v !== null) out[PIDS[pid].key] = v;
    }
    return out;
  }

  /** MIL state, stored-code count and readiness monitors. */
  async readStatus() {
    const raw = await this.trySend('0101', 4000);
    const d = ELM327.payload(raw, 0x01, 0x01);
    return d ? decodeMonitors(d) : null;
  }

  /** Trouble codes from mode 03 (stored), 07 (pending) and 0A (permanent). */
  async readDTCs() {
    const grab = async (cmd, mode) => {
      const raw = await this.trySend(cmd, 6000);
      const d = ELM327.payload(raw, mode);
      if (!d) return [];
      return decodeDTCBytes(stripDTCCount(d));
    };
    const [stored, pending, permanent] = [
      await grab('03', 0x03),
      await grab('07', 0x07),
      await grab('0A', 0x0a),
    ];
    return { stored, pending, permanent };
  }

  /** Clear codes and reset readiness monitors (mode 04). */
  async clearDTCs() {
    const raw = await this.send('04', 8000);
    return !NO_DATA.test(raw);
  }

  /** Vehicle Identification Number via mode 09 PID 02. */
  async readVIN() {
    const raw = await this.trySend('0902', 7000);
    const d = ELM327.payload(raw, 0x09, 0x02);
    if (!d) return null;
    // Keep printable ASCII, which drops the leading message-count byte and any padding.
    const text = String.fromCharCode(...d.filter((b) => b >= 0x20 && b <= 0x7e)).trim();
    const vin = text.slice(-17).toUpperCase();
    // A VIN is exactly 17 characters and never contains I, O or Q. Anything else
    // is a misread, and showing a mangled string is worse than showing nothing.
    return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? vin : null;
  }

  /** Live adapter-measured battery voltage (works with the engine off). */
  async readVoltage() {
    const rv = await this.trySend('ATRV', 3000);
    const m = /(\d+\.\d+)/.exec(rv);
    return m ? parseFloat(m[1]) : null;
  }

  async disconnect() {
    this.connected = false;
    this._failAll(new Error('Disconnected'));
    try { await this.t.close(); } catch { /* already closed */ }
  }
}
