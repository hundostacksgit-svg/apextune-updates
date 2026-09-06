/* Byte-level links to an ELM327 adapter.
   Each transport exposes: open(), write(str), onData(cb), close(), name, kind. */

const enc = new TextEncoder();
const dec = new TextDecoder();

/* Service/characteristic UUIDs used by the ELM327 clones on the market.
   Web Bluetooth requires every service be declared up front. */
export const BLE_SERVICES = [
  0xfff0,  // Vgate iCar Pro / most generic BLE clones (FFF1 notify, FFF2 write)
  0xffe0,  // HM-10 based adapters (FFE1 notify + write)
  0x18f0,  // LELink (2AF0 notify, 2AF1 write)
  0xfd00,
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART
  '0000ffe5-0000-1000-8000-00805f9b34fb',
];

export function bleSupported()    { return typeof navigator !== 'undefined' && !!navigator.bluetooth; }
export function serialSupported() { return typeof navigator !== 'undefined' && !!navigator.serial; }

/* ------------------------------------------------------------------ */
/* Bluetooth LE                                                        */
/* ------------------------------------------------------------------ */
export class BleTransport {
  constructor() {
    this.kind = 'ble';
    this.name = 'Bluetooth adapter';
    this.device = null;
    this.rx = null;   // notify characteristic
    this.tx = null;   // write characteristic
    this._cb = null;
    this._onDisconnect = null;
  }

  onData(cb) { this._cb = cb; }
  onDisconnect(cb) { this._onDisconnect = cb; }

  async open() {
    if (!bleSupported()) throw new Error('This browser has no Web Bluetooth. Use Chrome on Android, or a desktop Chrome/Edge.');

    this.device = await navigator.bluetooth.requestDevice({
      // Adapters advertise wildly inconsistent names, so accept all and filter by service.
      acceptAllDevices: true,
      optionalServices: BLE_SERVICES,
    });
    this.name = this.device.name || 'Bluetooth adapter';

    this.device.addEventListener('gattserverdisconnected', () => {
      this._onDisconnect?.();
    });

    const server = await this.device.gatt.connect();
    const services = await server.getPrimaryServices();
    if (!services.length) throw new Error('Adapter exposed no services. Unpair it in system Bluetooth settings, then retry.');

    // Pick the first service that offers both a writable and a notifying characteristic.
    for (const svc of services) {
      let chars;
      try { chars = await svc.getCharacteristics(); } catch { continue; }
      const tx = chars.find((c) => c.properties.write || c.properties.writeWithoutResponse);
      const rx = chars.find((c) => c.properties.notify || c.properties.indicate);
      if (tx && rx) { this.tx = tx; this.rx = rx; break; }
    }
    if (!this.tx || !this.rx) {
      throw new Error('No usable read/write channel found on this adapter. It may be a Bluetooth Classic (SPP) device, which browsers cannot reach.');
    }

    await this.rx.startNotifications();
    this.rx.addEventListener('characteristicvaluechanged', (e) => {
      this._cb?.(dec.decode(e.target.value));
    });
    return true;
  }

  async write(str) {
    if (!this.tx) throw new Error('Not connected');
    const bytes = enc.encode(str);
    // Many clones drop anything past 20 bytes per write — chunk to be safe.
    for (let i = 0; i < bytes.length; i += 20) {
      const slice = bytes.slice(i, i + 20);
      if (this.tx.properties.writeWithoutResponse) await this.tx.writeValueWithoutResponse(slice);
      else await this.tx.writeValue(slice);
    }
  }

  async close() {
    try { await this.rx?.stopNotifications(); } catch { /* already gone */ }
    try { this.device?.gatt?.disconnect(); } catch { /* already gone */ }
    this.rx = this.tx = null;
  }
}

/* ------------------------------------------------------------------ */
/* USB / serial (Web Serial)                                           */
/* ------------------------------------------------------------------ */
export class SerialTransport {
  constructor(baud = 38400) {
    this.kind = 'serial';
    this.name = 'USB adapter';
    this.baud = baud;
    this.port = null;
    this._reader = null;
    this._writer = null;
    this._cb = null;
    this._onDisconnect = null;
    this._pump = null;
  }

  onData(cb) { this._cb = cb; }
  onDisconnect(cb) { this._onDisconnect = cb; }

  async open() {
    if (!serialSupported()) throw new Error('This browser has no Web Serial. Use desktop Chrome/Edge, or Chrome on Android with an OTG cable.');
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate: this.baud });
    this._writer = this.port.writable.getWriter();
    this._reader = this.port.readable.getReader();

    this._pump = (async () => {
      try {
        for (;;) {
          const { value, done } = await this._reader.read();
          if (done) break;
          if (value) this._cb?.(dec.decode(value));
        }
      } catch {
        this._onDisconnect?.();
      }
    })();
    return true;
  }

  async write(str) {
    if (!this._writer) throw new Error('Not connected');
    await this._writer.write(enc.encode(str));
  }

  async close() {
    try { await this._reader?.cancel(); } catch { /* ignore */ }
    try { this._reader?.releaseLock(); } catch { /* ignore */ }
    try { this._writer?.releaseLock(); } catch { /* ignore */ }
    try { await this.port?.close(); } catch { /* ignore */ }
    this.port = this._reader = this._writer = null;
  }
}

/* ------------------------------------------------------------------ */
/* Demo — a simulated ECU so the app is fully usable with no hardware   */
/* ------------------------------------------------------------------ */
export class DemoTransport {
  constructor() {
    this.kind = 'demo';
    this.name = 'Simulated ECU (demo)';
    this._cb = null;
    this._t0 = Date.now();
    this._echo = true;
    // A believable fault set: a misfire, a lean bank and a small EVAP leak.
    this.stored = [0x03, 0x02, 0x01, 0x71, 0x04, 0x56];
    this.pending = [0x03, 0x00];
  }

  onData(cb) { this._cb = cb; }
  onDisconnect() { /* the simulator never drops */ }
  async open() { return true; }
  async close() { this._cb = null; }

  _sim() {
    const t = (Date.now() - this._t0) / 1000;
    const idle = 780 + Math.sin(t * 1.7) * 55 + Math.sin(t * 0.4) * 30;
    const rev = Math.max(0, Math.sin(t / 9) ** 3) * 2600;
    const rpm = Math.round(idle + rev);
    const speed = Math.round(Math.max(0, Math.sin(t / 11) * 62));
    const warm = Math.min(89, 24 + t * 3.1);
    return { rpm, speed, warm, t };
  }

  async write(str) {
    const cmd = String(str).trim().toUpperCase().replace(/\s+/g, '');
    const { rpm, speed, warm, t } = this._sim();
    const hex = (n, w = 2) => Math.max(0, Math.round(n)).toString(16).toUpperCase().padStart(w, '0');
    const pair = (n) => `${hex((n >> 8) & 0xff)} ${hex(n & 0xff)}`;
    const bytes = (arr) => arr.map((b) => hex(b)).join(' ');

    let out;
    if (cmd.startsWith('AT')) {
      if (cmd === 'ATZ' || cmd === 'ATWS') out = 'ELM327 v1.5';
      else if (cmd === 'ATI') out = 'ELM327 v1.5';
      else if (cmd === 'ATRV') out = `${(13.9 + Math.sin(t / 5) * 0.28).toFixed(1)}V`;
      else if (cmd === 'ATDP') out = 'AUTO, ISO 15765-4 (CAN 11/500)';
      else if (cmd === 'ATDPN') out = 'A6';
      else out = 'OK';
    } else if (cmd.startsWith('01')) {
      const pid = parseInt(cmd.slice(2, 4), 16);
      const M = {
        0x00: 'BE 3F A8 13', 0x01: `83 07 E1 00`, 0x20: '90 07 B0 11',
        0x40: 'FA D0 80 00',
        0x04: hex(38 + Math.sin(t) * 12), 0x05: hex(warm + 40),
        0x06: hex(128 + Math.sin(t * 2) * 9), 0x07: hex(128 + 14),
        0x0B: hex(32 + (rpm / 6500) * 60), 0x0C: pair(rpm * 4), 0x0D: hex(speed),
        0x0E: hex((14 + Math.sin(t) * 6 + 64) * 2), 0x0F: hex(38 + 40),
        0x10: pair(Math.round((2.6 + (rpm / 6500) * 42) * 100)),
        0x11: hex((14 + (rev(rpm)) * 0.6) * 2.55), 0x1F: pair(Math.round(t) + 412),
        0x21: pair(37), 0x2F: hex(0.58 * 255), 0x31: pair(1043), 0x33: hex(101),
        0x42: pair(Math.round((13.9 + Math.sin(t / 5) * 0.28) * 1000)),
        0x46: hex(21 + 40), 0x4D: pair(96), 0x4E: pair(1180), 0x5C: hex(92 + 40),
      };
      const v = M[pid];
      out = v ? `41 ${hex(pid)} ${v}` : 'NO DATA';
    } else if (cmd.startsWith('03')) {
      out = `43 ${bytes(this.stored)}`;
    } else if (cmd.startsWith('07')) {
      out = `47 ${bytes(this.pending)}`;
    } else if (cmd.startsWith('0A')) {
      out = '4A 00 00';
    } else if (cmd.startsWith('04')) {
      this.stored = []; this.pending = [];
      out = '44';
    } else if (cmd === '0902') {
      // VIN 1HGBH41JXMN109186 as a multi-frame ISO-TP response (20 bytes).
      out = ['014', '0: 49 02 01 31 48 47', '1: 42 48 34 31 4A 58 4D', '2: 4E 31 30 39 31 38 36'].join('\r');
    } else if (cmd.startsWith('09')) {
      out = 'NO DATA';
    } else {
      out = 'NO DATA';
    }

    // Mimic real adapter latency, echo and the ">" prompt.
    setTimeout(() => this._cb?.(`${out}\r\r>`), 34 + Math.random() * 26);

    function rev(r) { return Math.max(0, (r - 800) / 100); }
  }
}
