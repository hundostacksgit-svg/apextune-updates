/* SAE J1979 Mode 01 parameter definitions.
   Each decoder receives the data bytes AFTER the "41 <pid>" echo is stripped. */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const PIDS = {
  0x04: { key: 'load',        name: 'Engine Load',        unit: '%',   bytes: 1, max: 100,  dec: (d) => (d[0] * 100) / 255 },
  0x05: { key: 'coolant',     name: 'Coolant Temp',       unit: '°C',  bytes: 1, min: -40, max: 130, dec: (d) => d[0] - 40 },
  0x06: { key: 'stft1',       name: 'Short Fuel Trim B1', unit: '%',   bytes: 1, min: -100, max: 99, dec: (d) => (d[0] * 100) / 128 - 100 },
  0x07: { key: 'ltft1',       name: 'Long Fuel Trim B1',  unit: '%',   bytes: 1, min: -100, max: 99, dec: (d) => (d[0] * 100) / 128 - 100 },
  0x08: { key: 'stft2',       name: 'Short Fuel Trim B2', unit: '%',   bytes: 1, min: -100, max: 99, dec: (d) => (d[0] * 100) / 128 - 100 },
  0x09: { key: 'ltft2',       name: 'Long Fuel Trim B2',  unit: '%',   bytes: 1, min: -100, max: 99, dec: (d) => (d[0] * 100) / 128 - 100 },
  0x0A: { key: 'fuelPress',   name: 'Fuel Pressure',      unit: 'kPa', bytes: 1, max: 765,  dec: (d) => d[0] * 3 },
  0x0B: { key: 'map',         name: 'Intake Manifold',    unit: 'kPa', bytes: 1, max: 255,  dec: (d) => d[0] },
  0x0C: { key: 'rpm',         name: 'Engine RPM',         unit: 'rpm', bytes: 2, max: 8000, dec: (d) => ((d[0] << 8) + d[1]) / 4 },
  0x0D: { key: 'speed',       name: 'Vehicle Speed',      unit: 'km/h',bytes: 1, max: 255,  dec: (d) => d[0] },
  0x0E: { key: 'timing',      name: 'Timing Advance',     unit: '°',   bytes: 1, min: -64, max: 63, dec: (d) => d[0] / 2 - 64 },
  0x0F: { key: 'intakeTemp',  name: 'Intake Air Temp',    unit: '°C',  bytes: 1, min: -40, max: 130, dec: (d) => d[0] - 40 },
  0x10: { key: 'maf',         name: 'Mass Air Flow',      unit: 'g/s', bytes: 2, max: 655,  dec: (d) => ((d[0] << 8) + d[1]) / 100 },
  0x11: { key: 'throttle',    name: 'Throttle Position',  unit: '%',   bytes: 1, max: 100,  dec: (d) => (d[0] * 100) / 255 },
  0x1F: { key: 'runTime',     name: 'Run Time',           unit: 's',   bytes: 2, max: 65535,dec: (d) => (d[0] << 8) + d[1] },
  0x21: { key: 'distMil',     name: 'Distance w/ MIL On', unit: 'km',  bytes: 2, max: 65535,dec: (d) => (d[0] << 8) + d[1] },
  0x22: { key: 'railPress',   name: 'Fuel Rail Pressure', unit: 'kPa', bytes: 2, max: 5177, dec: (d) => ((d[0] << 8) + d[1]) * 0.079 },
  0x23: { key: 'railGauge',   name: 'Fuel Rail Gauge',    unit: 'kPa', bytes: 2, max: 655350, dec: (d) => ((d[0] << 8) + d[1]) * 10 },
  0x2F: { key: 'fuelLevel',   name: 'Fuel Level',         unit: '%',   bytes: 1, max: 100,  dec: (d) => (d[0] * 100) / 255 },
  0x31: { key: 'distClear',   name: 'Distance Since Clear',unit: 'km', bytes: 2, max: 65535,dec: (d) => (d[0] << 8) + d[1] },
  0x33: { key: 'baro',        name: 'Barometric Pressure',unit: 'kPa', bytes: 1, max: 255,  dec: (d) => d[0] },
  0x42: { key: 'voltage',     name: 'Module Voltage',     unit: 'V',   bytes: 2, max: 18,   dec: (d) => ((d[0] << 8) + d[1]) / 1000 },
  0x43: { key: 'absLoad',     name: 'Absolute Load',      unit: '%',   bytes: 2, max: 100,  dec: (d) => (((d[0] << 8) + d[1]) * 100) / 255 },
  0x44: { key: 'lambda',      name: 'Commanded Lambda',   unit: 'λ',   bytes: 2, max: 2,    dec: (d) => ((d[0] << 8) + d[1]) / 32768 },
  0x45: { key: 'relThrottle', name: 'Relative Throttle',  unit: '%',   bytes: 1, max: 100,  dec: (d) => (d[0] * 100) / 255 },
  0x46: { key: 'ambient',     name: 'Ambient Air Temp',   unit: '°C',  bytes: 1, min: -40, max: 130, dec: (d) => d[0] - 40 },
  0x47: { key: 'absThrottleB',name: 'Absolute Throttle B',unit: '%',   bytes: 1, max: 100,  dec: (d) => (d[0] * 100) / 255 },
  0x4C: { key: 'cmdThrottle', name: 'Commanded Throttle', unit: '%',   bytes: 1, max: 100,  dec: (d) => (d[0] * 100) / 255 },
  0x4D: { key: 'timeMil',     name: 'Time w/ MIL On',     unit: 'min', bytes: 2, max: 65535,dec: (d) => (d[0] << 8) + d[1] },
  0x4E: { key: 'timeClear',   name: 'Time Since Clear',   unit: 'min', bytes: 2, max: 65535,dec: (d) => (d[0] << 8) + d[1] },
  0x5A: { key: 'pedal',       name: 'Accelerator Pedal',  unit: '%',   bytes: 1, max: 100,  dec: (d) => (d[0] * 100) / 255 },
  0x5B: { key: 'hybridBatt',  name: 'Hybrid Battery Life',unit: '%',   bytes: 1, max: 100,  dec: (d) => (d[0] * 100) / 255 },
  0x5C: { key: 'oilTemp',     name: 'Engine Oil Temp',    unit: '°C',  bytes: 1, min: -40, max: 210, dec: (d) => d[0] - 40 },
  0x5E: { key: 'fuelRate',    name: 'Fuel Rate',          unit: 'L/h', bytes: 2, max: 3212, dec: (d) => ((d[0] << 8) + d[1]) / 20 },
};

/** PIDs shown as live gauges, in priority order. */
export const LIVE_ORDER = [0x0C, 0x0D, 0x05, 0x11, 0x04, 0x42, 0x0F, 0x10, 0x2F, 0x0B, 0x5C, 0x33];

/** PIDs worth capturing from a freeze frame, in the order they read best. */
export const FREEZE_ORDER = [0x0C, 0x0D, 0x05, 0x04, 0x11, 0x0B, 0x10, 0x0F, 0x06, 0x07, 0x0E];

/** PIDs pulled once for the snapshot section. */
export const SNAPSHOT_ORDER = [0x1F, 0x46, 0x31, 0x21, 0x4D, 0x4E, 0x06, 0x07, 0x0E];

export function pidByKey(key) {
  for (const [pid, def] of Object.entries(PIDS)) if (def.key === key) return { pid: Number(pid), ...def };
  return null;
}

/** Fraction 0..1 of a value across a PID's display range — drives the gauge sweep. */
export function pidPct(def, value) {
  if (!def || !Number.isFinite(value)) return 0;
  const lo = def.min ?? 0;
  const hi = def.max ?? 100;
  if (hi === lo) return 0;
  return clamp((value - lo) / (hi - lo), 0, 1);
}

/** Health tone for a reading, so bad numbers read as bad at a glance. */
export function pidTone(key, v) {
  if (!Number.isFinite(v)) return '';
  switch (key) {
    case 'coolant':  return v >= 112 ? 'bad' : v >= 104 ? 'warn' : '';
    case 'oilTemp':  return v >= 130 ? 'bad' : v >= 120 ? 'warn' : '';
    case 'voltage':  return v < 11.6 || v > 15.2 ? 'bad' : v < 12.2 || v > 14.9 ? 'warn' : '';
    case 'stft1': case 'stft2': case 'ltft1': case 'ltft2':
      return Math.abs(v) >= 25 ? 'bad' : Math.abs(v) >= 10 ? 'warn' : '';
    case 'fuelLevel': return v <= 8 ? 'warn' : '';
    case 'intakeTemp': return v >= 85 ? 'warn' : '';
    default: return '';
  }
}

/** Decode a 0100/0120/... support bitmask into the list of supported PID numbers. */
export function decodeSupport(basePid, d) {
  const out = [];
  if (!d || d.length < 4) return out;
  const mask = ((d[0] << 24) >>> 0) + (d[1] << 16) + (d[2] << 8) + d[3];
  for (let i = 0; i < 32; i++) {
    if (mask & (0x80000000 >>> i)) out.push(basePid + i + 1);
  }
  return out;
}
