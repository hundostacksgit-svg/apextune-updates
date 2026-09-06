/* Diagnostic Trouble Code decoding and plain-English lookup. */

const SYS = ['P', 'C', 'B', 'U']; // Powertrain, Chassis, Body, Network

/** Turn two raw bytes into a code string like "P0301". Returns null for the 0000 padding. */
export function decodeDTC(a, b) {
  if (a === 0 && b === 0) return null;
  const letter = SYS[(a >> 6) & 0x03];
  const d1 = (a >> 4) & 0x03;
  const d2 = a & 0x0f;
  const d3 = (b >> 4) & 0x0f;
  const d4 = b & 0x0f;
  return `${letter}${d1}${d2.toString(16).toUpperCase()}${d3.toString(16).toUpperCase()}${d4.toString(16).toUpperCase()}`;
}

/** Decode a flat byte array (pairs) into code strings. */
export function decodeDTCBytes(bytes) {
  const out = [];
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const code = decodeDTC(bytes[i], bytes[i + 1]);
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

/* The generic SAE codes people actually see. Manufacturer-specific codes
   (second digit 1 or 2) fall through to the range description below. */
const DB = {
  P0010: 'Camshaft position actuator circuit, bank 1',
  P0011: 'Camshaft position timing over-advanced, bank 1',
  P0014: 'Camshaft position timing over-advanced, bank 1 exhaust',
  P0016: 'Crankshaft / camshaft position correlation, bank 1 sensor A',
  P0017: 'Crankshaft / camshaft position correlation, bank 1 sensor B',
  P0020: 'Camshaft position actuator circuit, bank 2',
  P0021: 'Camshaft position timing over-advanced, bank 2',
  P0030: 'O2 sensor heater circuit, bank 1 sensor 1',
  P0031: 'O2 sensor heater circuit low, bank 1 sensor 1',
  P0032: 'O2 sensor heater circuit high, bank 1 sensor 1',
  P0036: 'O2 sensor heater circuit, bank 1 sensor 2',
  P0050: 'O2 sensor heater circuit, bank 2 sensor 1',
  P0068: 'MAP / MAF vs. throttle position correlation',
  P0087: 'Fuel rail pressure too low',
  P0088: 'Fuel rail pressure too high',
  P0089: 'Fuel pressure regulator performance',
  P0100: 'Mass air flow circuit malfunction',
  P0101: 'Mass air flow circuit range / performance',
  P0102: 'Mass air flow circuit low input',
  P0103: 'Mass air flow circuit high input',
  P0106: 'Manifold pressure sensor range / performance',
  P0107: 'Manifold pressure sensor low input',
  P0108: 'Manifold pressure sensor high input',
  P0110: 'Intake air temperature sensor circuit',
  P0111: 'Intake air temperature sensor range / performance',
  P0112: 'Intake air temperature sensor low input',
  P0113: 'Intake air temperature sensor high input',
  P0115: 'Engine coolant temperature sensor circuit',
  P0116: 'Coolant temperature sensor range / performance',
  P0117: 'Coolant temperature sensor low input',
  P0118: 'Coolant temperature sensor high input',
  P0119: 'Coolant temperature sensor intermittent',
  P0120: 'Throttle position sensor A circuit',
  P0121: 'Throttle position sensor A range / performance',
  P0122: 'Throttle position sensor A low input',
  P0123: 'Throttle position sensor A high input',
  P0125: 'Coolant temperature too low for closed-loop fuel control',
  P0128: 'Coolant thermostat below regulating temperature',
  P0130: 'O2 sensor circuit, bank 1 sensor 1',
  P0131: 'O2 sensor low voltage, bank 1 sensor 1',
  P0132: 'O2 sensor high voltage, bank 1 sensor 1',
  P0133: 'O2 sensor slow response, bank 1 sensor 1',
  P0134: 'O2 sensor no activity detected, bank 1 sensor 1',
  P0135: 'O2 sensor heater circuit, bank 1 sensor 1',
  P0136: 'O2 sensor circuit, bank 1 sensor 2',
  P0137: 'O2 sensor low voltage, bank 1 sensor 2',
  P0138: 'O2 sensor high voltage, bank 1 sensor 2',
  P0139: 'O2 sensor slow response, bank 1 sensor 2',
  P0140: 'O2 sensor no activity detected, bank 1 sensor 2',
  P0141: 'O2 sensor heater circuit, bank 1 sensor 2',
  P0150: 'O2 sensor circuit, bank 2 sensor 1',
  P0151: 'O2 sensor low voltage, bank 2 sensor 1',
  P0152: 'O2 sensor high voltage, bank 2 sensor 1',
  P0155: 'O2 sensor heater circuit, bank 2 sensor 1',
  P0157: 'O2 sensor low voltage, bank 2 sensor 2',
  P0161: 'O2 sensor heater circuit, bank 2 sensor 2',
  P0171: 'System too lean, bank 1',
  P0172: 'System too rich, bank 1',
  P0174: 'System too lean, bank 2',
  P0175: 'System too rich, bank 2',
  P0180: 'Fuel temperature sensor A circuit',
  P0190: 'Fuel rail pressure sensor circuit',
  P0191: 'Fuel rail pressure sensor range / performance',
  P0200: 'Injector circuit malfunction',
  P0201: 'Injector circuit, cylinder 1',
  P0202: 'Injector circuit, cylinder 2',
  P0203: 'Injector circuit, cylinder 3',
  P0204: 'Injector circuit, cylinder 4',
  P0205: 'Injector circuit, cylinder 5',
  P0206: 'Injector circuit, cylinder 6',
  P0217: 'Engine over-temperature condition',
  P0219: 'Engine over-speed condition',
  P0221: 'Throttle position sensor B range / performance',
  P0234: 'Turbocharger / supercharger overboost',
  P0299: 'Turbocharger / supercharger underboost',
  P0300: 'Random / multiple cylinder misfire detected',
  P0301: 'Cylinder 1 misfire detected',
  P0302: 'Cylinder 2 misfire detected',
  P0303: 'Cylinder 3 misfire detected',
  P0304: 'Cylinder 4 misfire detected',
  P0305: 'Cylinder 5 misfire detected',
  P0306: 'Cylinder 6 misfire detected',
  P0307: 'Cylinder 7 misfire detected',
  P0308: 'Cylinder 8 misfire detected',
  P0315: 'Crankshaft position system variation not learned',
  P0316: 'Misfire detected on startup',
  P0325: 'Knock sensor 1 circuit, bank 1',
  P0327: 'Knock sensor 1 circuit low, bank 1',
  P0328: 'Knock sensor 1 circuit high, bank 1',
  P0330: 'Knock sensor 2 circuit, bank 2',
  P0335: 'Crankshaft position sensor A circuit',
  P0336: 'Crankshaft position sensor A range / performance',
  P0340: 'Camshaft position sensor A circuit, bank 1',
  P0341: 'Camshaft position sensor A range / performance, bank 1',
  P0344: 'Camshaft position sensor A intermittent, bank 1',
  P0351: 'Ignition coil A primary / secondary circuit',
  P0352: 'Ignition coil B primary / secondary circuit',
  P0353: 'Ignition coil C primary / secondary circuit',
  P0354: 'Ignition coil D primary / secondary circuit',
  P0355: 'Ignition coil E primary / secondary circuit',
  P0356: 'Ignition coil F primary / secondary circuit',
  P0401: 'EGR flow insufficient',
  P0402: 'EGR flow excessive',
  P0403: 'EGR control circuit',
  P0404: 'EGR control circuit range / performance',
  P0405: 'EGR sensor A circuit low',
  P0411: 'Secondary air injection incorrect flow',
  P0420: 'Catalyst system efficiency below threshold, bank 1',
  P0421: 'Warm-up catalyst efficiency below threshold, bank 1',
  P0430: 'Catalyst system efficiency below threshold, bank 2',
  P0440: 'Evaporative emission system malfunction',
  P0441: 'EVAP incorrect purge flow',
  P0442: 'EVAP system leak detected (small leak)',
  P0443: 'EVAP purge control valve circuit',
  P0446: 'EVAP vent control circuit',
  P0449: 'EVAP vent valve / solenoid circuit',
  P0451: 'EVAP pressure sensor range / performance',
  P0452: 'EVAP pressure sensor low input',
  P0455: 'EVAP system leak detected (large leak / loose gas cap)',
  P0456: 'EVAP system leak detected (very small leak)',
  P0457: 'EVAP leak — fuel cap loose or off',
  P0461: 'Fuel level sensor range / performance',
  P0462: 'Fuel level sensor low input',
  P0480: 'Cooling fan 1 control circuit',
  P0500: 'Vehicle speed sensor A malfunction',
  P0501: 'Vehicle speed sensor range / performance',
  P0505: 'Idle air control system malfunction',
  P0506: 'Idle control system RPM lower than expected',
  P0507: 'Idle control system RPM higher than expected',
  P0511: 'Idle air control circuit',
  P0520: 'Engine oil pressure sensor circuit',
  P0521: 'Engine oil pressure sensor range / performance',
  P0522: 'Engine oil pressure sensor low voltage',
  P0524: 'Engine oil pressure too low',
  P0532: 'A/C refrigerant pressure sensor A circuit low',
  P0562: 'System voltage low',
  P0563: 'System voltage high',
  P0571: 'Brake switch A circuit',
  P0600: 'Serial communication link malfunction',
  P0601: 'Control module memory checksum error',
  P0603: 'Control module KAM error',
  P0605: 'Control module ROM error',
  P0606: 'ECM / PCM processor fault',
  P0620: 'Generator control circuit',
  P0625: 'Generator field terminal circuit low',
  P0645: 'A/C clutch relay control circuit',
  P0650: 'Malfunction indicator lamp control circuit',
  P0700: 'Transmission control system malfunction',
  P0701: 'Transmission control system range / performance',
  P0705: 'Transmission range sensor circuit',
  P0706: 'Transmission range sensor range / performance',
  P0715: 'Input / turbine speed sensor circuit',
  P0716: 'Input / turbine speed sensor range / performance',
  P0720: 'Output speed sensor circuit',
  P0730: 'Incorrect gear ratio',
  P0731: 'Gear 1 incorrect ratio',
  P0732: 'Gear 2 incorrect ratio',
  P0733: 'Gear 3 incorrect ratio',
  P0734: 'Gear 4 incorrect ratio',
  P0740: 'Torque converter clutch circuit malfunction',
  P0741: 'Torque converter clutch stuck off',
  P0742: 'Torque converter clutch stuck on',
  P0750: 'Shift solenoid A malfunction',
  P0751: 'Shift solenoid A performance / stuck off',
  P0755: 'Shift solenoid B malfunction',
  P0765: 'Shift solenoid D malfunction',
  P0776: 'Pressure control solenoid B performance',
  P0796: 'Pressure control solenoid C performance',
  P0801: 'Reverse inhibit control circuit',
  P0830: 'Clutch pedal switch A circuit',
  P2096: 'Post-catalyst fuel trim system too lean, bank 1',
  P2097: 'Post-catalyst fuel trim system too rich, bank 1',
  P2100: 'Throttle actuator control motor circuit',
  P2101: 'Throttle actuator control motor range / performance',
  P2119: 'Throttle actuator control throttle body range / performance',
  P2135: 'Throttle position sensor A/B voltage correlation',
  P2138: 'Accelerator pedal sensor D/E voltage correlation',
  P2181: 'Cooling system performance',
  P2187: 'System too lean at idle, bank 1',
  P2195: 'O2 sensor signal stuck lean, bank 1 sensor 1',
  P2196: 'O2 sensor signal stuck rich, bank 1 sensor 1',
  P2270: 'O2 sensor signal stuck lean, bank 1 sensor 2',
  P2279: 'Intake air system leak',
  P2404: 'EVAP leak detection pump sensor range / performance',
  P244A: 'Diesel particulate filter differential pressure too low',
  P244B: 'Diesel particulate filter differential pressure too high',
  P2463: 'Diesel particulate filter soot accumulation',
  C0035: 'Left front wheel speed sensor circuit',
  C0040: 'Right front wheel speed sensor circuit',
  C0045: 'Left rear wheel speed sensor circuit',
  C0050: 'Right rear wheel speed sensor circuit',
  C0110: 'ABS pump motor circuit',
  C0121: 'Valve relay circuit',
  C0265: 'ABS motor relay circuit',
  C0561: 'ABS system disabled information stored',
  B0001: 'Driver frontal stage 1 deployment control',
  B0081: 'Passenger presence sensor',
  B1000: 'ECU malfunction',
  U0001: 'High-speed CAN communication bus',
  U0100: 'Lost communication with ECM / PCM A',
  U0101: 'Lost communication with TCM',
  U0121: 'Lost communication with ABS control module',
  U0140: 'Lost communication with body control module',
  U0155: 'Lost communication with instrument panel cluster',
  U0401: 'Invalid data received from ECM / PCM A',
};

/* Fallback descriptions by numeric range when the exact code isn't in the table. */
const RANGES = [
  [0x0000, 0x0099, 'Fuel and air metering — auxiliary emission control'],
  [0x0100, 0x0199, 'Fuel and air metering — sensors and circuits'],
  [0x0200, 0x0299, 'Fuel and air metering — injector circuits'],
  [0x0300, 0x0399, 'Ignition system or misfire'],
  [0x0400, 0x0499, 'Auxiliary emission controls (EGR, EVAP, catalyst)'],
  [0x0500, 0x0599, 'Vehicle speed, idle control and auxiliary inputs'],
  [0x0600, 0x0699, 'Computer output circuit / control module'],
  [0x0700, 0x0899, 'Transmission'],
  [0x0900, 0x0999, 'Transmission actuators'],
];

/* Drivability / safety risk, used to rank codes and colour the summary. */
const CRITICAL = /^(P0(21[79]|30[0-8]|31[56]|52[124]|56[23]|60[1356])|P2181|U010[01])/;
const MINOR    = /^(P0(4[4-6][0-9]|1[12][0-9]|46[12]|53[0-9])|P244[0-9])/; // EVAP leaks, sensor range, comfort
const MAJOR    = /^(P0(0[0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9]|6[0-9]|7[0-9]|8[0-9])|P2[0-4]|C0|U0)/;

export function severity(code) {
  if (CRITICAL.test(code)) return 'critical';
  if (MINOR.test(code)) return 'minor';
  if (MAJOR.test(code)) return 'major';
  return 'minor';
}

export function describe(code) {
  if (!code) return 'Unknown code';
  const known = DB[code.toUpperCase()];
  if (known) return known;

  const letter = code[0];
  const digits = parseInt(code.slice(1), 16);
  const manufacturer = code[1] === '1' || code[1] === '2';

  if (letter === 'P') {
    for (const [lo, hi, text] of RANGES) {
      if (digits >= lo && digits <= hi) {
        return manufacturer ? `Manufacturer-specific powertrain code — ${text.toLowerCase()}` : text;
      }
    }
    return manufacturer ? 'Manufacturer-specific powertrain code' : 'Generic powertrain code';
  }
  if (letter === 'C') return manufacturer ? 'Manufacturer-specific chassis code (ABS, suspension, steering)' : 'Chassis code — ABS, suspension or steering';
  if (letter === 'B') return manufacturer ? 'Manufacturer-specific body code (airbags, lighting, comfort)' : 'Body code — airbags, lighting or comfort systems';
  if (letter === 'U') return manufacturer ? 'Manufacturer-specific network code' : 'Network / communication code between modules';
  return 'Unrecognised code';
}

/**
 * Look up or search the code table. An exact code match wins; otherwise this
 * matches on code prefix and on words in the description, so "misfire" or
 * "P030" both find the misfire family. Works entirely offline.
 */
export function searchCodes(query, limit = 40) {
  const q = String(query || '').trim().toUpperCase();
  if (!q) return [];

  const exact = DB[q];
  const out = [];
  if (exact) out.push({ code: q, desc: exact, exact: true });

  // A well-formed code that is not in the table still deserves an answer.
  if (!exact && /^[PCBU][0-3][0-9A-F]{3}$/.test(q)) {
    out.push({ code: q, desc: describe(q), exact: true, generated: true });
  }

  const needle = q.toLowerCase();
  for (const [code, desc] of Object.entries(DB)) {
    if (out.some((o) => o.code === code)) continue;
    if (code.startsWith(q) || desc.toLowerCase().includes(needle)) {
      out.push({ code, desc, exact: false });
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** How many codes the offline table holds — quoted on the landing page. */
export const CODE_COUNT = Object.keys(DB).length;

/** Readiness monitor names, decoded from Mode 01 PID 01 bytes B/C/D. */
export function decodeMonitors(d) {
  if (!d || d.length < 4) return { mil: false, count: 0, monitors: [] };
  const mil = (d[0] & 0x80) !== 0;
  const count = d[0] & 0x7f;
  const compression = (d[1] & 0x08) !== 0; // ignition type: 1 = compression (diesel)

  const monitors = [
    { name: 'Misfire',            supported: (d[1] & 0x01) !== 0, ready: (d[1] & 0x10) === 0 },
    { name: 'Fuel System',        supported: (d[1] & 0x02) !== 0, ready: (d[1] & 0x20) === 0 },
    { name: 'Components',         supported: (d[1] & 0x04) !== 0, ready: (d[1] & 0x40) === 0 },
  ];

  const spark = [
    ['Catalyst', 0x01], ['Heated Catalyst', 0x02], ['EVAP System', 0x04],
    ['Secondary Air', 0x08], ['A/C Refrigerant', 0x10], ['O2 Sensor', 0x20],
    ['O2 Heater', 0x40], ['EGR System', 0x80],
  ];
  const diesel = [
    ['NMHC Catalyst', 0x01], ['NOx / SCR', 0x02], ['Reserved', 0x04],
    ['Boost Pressure', 0x08], ['Reserved', 0x10], ['Exhaust Sensor', 0x20],
    ['PM Filter', 0x40], ['EGR / VVT', 0x80],
  ];

  for (const [name, bit] of (compression ? diesel : spark)) {
    if (name === 'Reserved') continue;
    monitors.push({ name, supported: (d[2] & bit) !== 0, ready: (d[3] & bit) === 0 });
  }

  return { mil, count, compression, monitors };
}
