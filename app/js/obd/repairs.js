/*
 * What actually causes a code, and what to check first.
 *
 * Causes are ordered by how often they turn out to be the culprit, and fixes
 * are ordered cheapest-first — which is the opposite of how most people attack
 * a code. The classic example is P0420: the usual reflex is to buy a catalytic
 * converter, when an upstream oxygen sensor or an exhaust leak is the cause far
 * more often and costs a fraction as much.
 *
 * These are the common cases for a generic code, not a diagnosis. Anything that
 * touches fuel, brakes or airbags belongs with a technician.
 */

/** difficulty: 'easy' (hand tools, driveway) | 'moderate' (some experience) | 'shop' */
const R = {
  /* ---- misfires ---- */
  MISFIRE_ONE: {
    causes: ['Worn or fouled spark plug on that cylinder', 'Failing ignition coil',
             'Clogged or leaking fuel injector', 'Vacuum leak near that cylinder',
             'Low compression — worn rings or a burnt valve'],
    fix: ['Swap the coil with a neighbouring cylinder and rescan. If the misfire follows the coil, that is your answer.',
          'Do the same with the spark plug.', 'Inspect the plug — its condition tells you a lot about what is happening in that cylinder.',
          'If it stays on the same cylinder with known-good parts, test compression.'],
    difficulty: 'easy', cost: '$15 – $90 for plugs or a coil',
    urgent: 'Keep driving on a misfire and raw fuel can destroy the catalytic converter, turning a $60 job into a $1,200 one. If the light is flashing, stop driving.',
  },
  MISFIRE_RANDOM: {
    causes: ['Vacuum leak', 'Worn plugs across the board', 'Weak fuel pump or clogged filter',
             'Failing ignition coil pack', 'Bad mass air flow sensor'],
    fix: ['If the plugs have not been changed in 60k miles, start there — it is the most common answer.',
          'Listen for a vacuum leak with the engine idling, or spray soapy water around intake hoses and watch the idle change.',
          'Clean the mass air flow sensor with MAF cleaner. Never touch the element.',
          'Check fuel pressure against the spec for your engine.'],
    difficulty: 'easy', cost: '$30 – $150',
    urgent: 'A flashing check-engine light means an active misfire that is damaging the catalytic converter. Pull over.',
  },

  /* ---- fuel trim ---- */
  LEAN: {
    causes: ['Vacuum leak — the most common cause by far', 'Dirty mass air flow sensor',
             'Weak fuel pump or clogged fuel filter', 'Leaking intake manifold gasket',
             'Failing oxygen sensor reporting wrongly'],
    fix: ['Check every intake hose and the PCV valve for cracks. A $6 hose fixes this more often than anything else.',
          'Clean the mass air flow sensor.', 'Look at fuel trims in live data — if they are high at idle but normal at speed, it is a vacuum leak; high everywhere points at fuel delivery.',
          'Test fuel pressure.'],
    difficulty: 'easy', cost: '$6 – $120',
  },
  RICH: {
    causes: ['Dirty or failing mass air flow sensor', 'Leaking fuel injector',
             'Failing oxygen sensor', 'Fuel pressure regulator stuck high', 'Clogged air filter'],
    fix: ['Check the air filter first — it costs nothing to look.',
          'Clean the mass air flow sensor.', 'Check fuel pressure.',
          'Inspect the plugs — black and sooty confirms it is running rich.'],
    difficulty: 'easy', cost: '$15 – $180',
  },

  /* ---- catalyst ---- */
  CATALYST: {
    causes: ['Failing downstream oxygen sensor — check this before anything else',
             'Exhaust leak before or near the sensor', 'An unfixed misfire or fuel trim problem that cooked the converter',
             'Genuinely failed catalytic converter'],
    fix: ['Do not buy a converter yet. Fix any other stored codes first — a misfire or a rich condition is often the real cause.',
          'Inspect the exhaust for leaks around the manifold and sensor bungs.',
          'Compare upstream and downstream sensor readings in live data. A downstream sensor that mirrors the upstream one points at the converter; one that is lazy or flat points at the sensor.',
          'Only then consider the converter.'],
    difficulty: 'moderate', cost: '$40 for a sensor, $300 – $2,000 for a converter',
    urgent: 'This is the single most over-replaced part in car repair. An oxygen sensor is roughly a tenth of the price — rule it out first.',
  },

  /* ---- EVAP ---- */
  EVAP_LEAK: {
    causes: ['Loose, cracked or wrong fuel cap — check this first, every time',
             'Cracked EVAP hose', 'Failing purge valve', 'Failing vent valve', 'Rusted filler neck'],
    fix: ['Take the fuel cap off, check the seal for cracks, and refit it until it clicks. Then drive for a day or two and rescan.',
          'A new cap is about $15 and fixes this a large share of the time.',
          'If it returns, inspect EVAP hoses along the tank and around the charcoal canister.',
          'A shop can smoke-test the system to find a leak you cannot see.'],
    difficulty: 'easy', cost: '$0 – $15 for a cap, $40 – $200 for a valve',
    urgent: 'Nothing here will damage the engine. It will fail an emissions test, and you may smell fuel.',
  },
  EVAP_VALVE: {
    causes: ['Failed purge or vent solenoid', 'Blocked charcoal canister',
             'Damaged wiring or connector at the valve', 'Debris holding the vent valve open'],
    fix: ['Find the valve and unplug it — corroded or green pins are your answer.',
          'A solenoid can often be tested by listening for a click when power is applied.',
          'Vent valves sit near the tank and collect road dirt; clean before replacing.'],
    difficulty: 'moderate', cost: '$40 – $200',
  },

  /* ---- sensors ---- */
  MAF: {
    causes: ['Dirty sensing element — extremely common', 'Air leak between the sensor and the throttle body',
             'Clogged air filter', 'Failed sensor', 'Damaged wiring'],
    fix: ['Buy a can of MAF cleaner, unplug the sensor, spray the wire or film element and let it dry fully. Do not touch it. This fixes it most of the time and costs about $8.',
          'Check the intake boot between the sensor and throttle body for splits.',
          'Replace the air filter if it is dirty.'],
    difficulty: 'easy', cost: '$8 for cleaner, $60 – $300 for a sensor',
  },
  O2_SENSOR: {
    causes: ['Worn-out sensor — they are consumables, typically 100k miles',
             'Failed heater circuit inside the sensor', 'Blown fuse on the heater circuit',
             'Damaged wiring or connector', 'Exhaust leak near the sensor'],
    fix: ['Check the fuse for the oxygen sensor heater circuit first — it costs nothing.',
          'Inspect the connector for corrosion and melted insulation; they sit near hot exhaust.',
          'Note which sensor the code names. Bank 1 Sensor 1 is upstream on the cylinder bank with cylinder 1.',
          'Use penetrating oil and let it soak — seized sensors strip easily.'],
    difficulty: 'moderate', cost: '$30 – $150',
  },
  COOLANT_TEMP: {
    causes: ['Failed coolant temperature sensor', 'Low coolant', 'Corroded connector', 'Wiring fault'],
    fix: ['Check the coolant level cold. Low coolant can trip this and matters far more than the code.',
          'Inspect the connector at the sensor.', 'The sensor is usually cheap and easy to reach.'],
    difficulty: 'easy', cost: '$15 – $60',
  },
  INTAKE_TEMP: {
    causes: ['Failed intake air temperature sensor', 'Damaged connector or wiring',
             'Sensor contaminated by oil from a dirty air filter'],
    fix: ['Many intake air temperature sensors are built into the mass air flow sensor — clean it first.',
          'Check the connector.'],
    difficulty: 'easy', cost: '$15 – $80',
  },
  THROTTLE: {
    causes: ['Carbon build-up in the throttle body', 'Failing throttle position sensor',
             'Damaged wiring', 'Failing throttle actuator motor'],
    fix: ['Clean the throttle body with throttle body cleaner — carbon build-up causes this constantly.',
          'Some cars need a throttle relearn afterwards; check for your model.',
          'Inspect the connector.'],
    difficulty: 'easy', cost: '$10 for cleaner, $80 – $350 for a throttle body',
  },
  CRANK_CAM: {
    causes: ['Failed crankshaft or camshaft position sensor', 'Damaged wiring or connector',
             'Stretched timing chain', 'Debris on the reluctor wheel'],
    fix: ['These sensors usually fail when hot — if the car stalls warm and restarts cold, that is a strong hint.',
          'Inspect the connector and harness routing near the exhaust.',
          'A correlation code between crank and cam often means timing chain stretch, which is a real repair, not a sensor.'],
    difficulty: 'moderate', cost: '$40 – $200 for a sensor, far more for timing',
    urgent: 'If the engine stalls or will not start, do not keep cranking. Timing problems can bend valves.',
  },
  THERMOSTAT: {
    causes: ['Thermostat stuck open', 'Low coolant', 'Failing coolant temperature sensor'],
    fix: ['Watch the temperature gauge. If it never reaches normal or takes far too long, the thermostat is stuck open.',
          'Check the coolant level cold.', 'A thermostat is usually cheap; the labour depends on where it sits.'],
    difficulty: 'moderate', cost: '$20 – $60 part',
    urgent: 'A thermostat stuck open wastes fuel and wears the engine. One stuck closed overheats it — that is serious.',
  },
  EGR: {
    causes: ['Carbon-blocked EGR passages', 'Stuck EGR valve', 'Failed EGR solenoid or sensor',
             'Vacuum line disconnected'],
    fix: ['Remove and clean the EGR valve and its passages. Carbon build-up causes this far more often than a failed part.',
          'Check the vacuum lines if your system uses them.'],
    difficulty: 'moderate', cost: '$10 for cleaner, $80 – $350 for a valve',
  },
  IDLE: {
    causes: ['Dirty throttle body or idle air control valve', 'Vacuum leak',
             'Failing idle air control valve', 'Dirty mass air flow sensor'],
    fix: ['Clean the throttle body and idle air control valve.',
          'Check for vacuum leaks.', 'Some cars need an idle relearn after cleaning.'],
    difficulty: 'easy', cost: '$10 – $150',
  },
  VVT: {
    causes: ['Low or dirty engine oil — check this first', 'Clogged VVT solenoid screen',
             'Failed VVT solenoid', 'Stretched timing chain'],
    fix: ['Check the oil level and condition. Variable valve timing runs on oil pressure, and dirty or low oil trips these codes constantly.',
          'If the oil is overdue, change it and rescan before buying parts.',
          'Remove the VVT solenoid and clean its screen.'],
    difficulty: 'moderate', cost: '$0 – $60 for an oil change, $60 – $200 for a solenoid',
  },
  CHARGING: {
    causes: ['Failing battery', 'Failing alternator', 'Loose or corroded battery terminals',
             'Worn drive belt'],
    fix: ['Clean the battery terminals — corrosion causes this more often than people expect.',
          'Most parts stores test batteries and alternators free.',
          'Check the belt tension.'],
    difficulty: 'easy', cost: '$0 – $250',
    urgent: 'A charging fault will leave you stranded. Deal with it before a long drive.',
  },
  TRANSMISSION: {
    causes: ['Low or burnt transmission fluid', 'Failing shift solenoid',
             'Worn clutch packs', 'Faulty speed sensor', 'Wiring fault'],
    fix: ['Check the transmission fluid level and colour. Burnt-smelling dark fluid tells you a lot.',
          'This code often means a separate transmission code is stored — have those read too.',
          'Transmission work is generally not a driveway job.'],
    difficulty: 'shop', cost: '$100 for a fluid service to several thousand',
    urgent: 'Driving on a slipping transmission accelerates the damage quickly.',
  },
  FUEL_PRESSURE: {
    causes: ['Clogged fuel filter', 'Weak fuel pump', 'Failing fuel pressure regulator',
             'Leaking injector', 'Failed pressure sensor'],
    fix: ['Replace the fuel filter if it is serviceable and overdue.',
          'Listen for the fuel pump priming when you turn the key to on.',
          'Have fuel pressure measured against spec.'],
    difficulty: 'moderate', cost: '$20 for a filter, $150 – $700 for a pump',
  },
  MODULE: {
    causes: ['Corroded ground strap or connector', 'Low battery voltage during a previous start',
             'Water in a connector', 'Genuinely failed control module'],
    fix: ['Check and clean the engine and chassis ground straps before anything else.',
          'Inspect connectors for water and green corrosion.',
          'Modules very rarely fail on their own — suspect wiring and grounds first.'],
    difficulty: 'moderate', cost: '$0 – $60 for wiring, $300+ for a module',
  },
  NETWORK: {
    causes: ['Corroded or damaged connector', 'Chafed CAN bus wiring',
             'Low battery voltage', 'A module that has lost power or ground'],
    fix: ['Check battery voltage and terminals first — low voltage produces communication codes across the whole car.',
          'Look for chafed wiring where the harness passes through the bulkhead.',
          'Recently fitted accessories and stereos are a common cause.'],
    difficulty: 'moderate', cost: '$0 – $150',
  },
INJECTOR: {
    causes: ['Clogged fuel injector', 'Failed injector coil winding',
             'Damaged connector or wiring at the injector', 'Driver circuit fault in the ECM'],
    fix: ['Try a bottle of quality injector cleaner and a tank of fuel first — cheap and it works often enough to be worth trying.',
          'Unplug the named injector and check its resistance against spec; compare with its neighbours.',
          'Inspect the connector — heat near the head hardens them and they crack.',
          'Swap the injector with a neighbouring cylinder and rescan to confirm.'],
    difficulty: 'moderate', cost: '$10 for cleaner, $60 – $250 per injector',
  },
  COIL: {
    causes: ['Failed ignition coil', 'Worn spark plug making the coil work harder',
             'Cracked coil boot letting spark escape', 'Damaged connector or wiring'],
    fix: ['Swap the named coil with a neighbouring cylinder and rescan. If the code follows the coil, replace it.',
          'Replace the spark plug at the same time — a worn plug is what kills coils.',
          'Check the boot for carbon tracking, a thin black line where spark has been arcing.'],
    difficulty: 'easy', cost: '$30 – $90 per coil',
    urgent: 'A dead coil means a dead cylinder, and raw fuel going into the catalytic converter. Do not put this off.',
  },
  KNOCK: {
    causes: ['Failed knock sensor', 'Damaged wiring or connector — they sit in a hot, awkward place',
             'Actual engine knock from low-octane fuel or carbon build-up',
             'Loose sensor mounting bolt — torque matters on these'],
    fix: ['Try a tank of higher-octane fuel first and see whether it clears. Genuine knock will.',
          'Inspect the wiring; on many engines the sensor sits under the intake manifold and the harness chafes.',
          'If replacing, torque the sensor exactly to spec — too loose or too tight and it reads wrong.'],
    difficulty: 'moderate', cost: '$40 – $150 plus labour to reach it',
    urgent: 'The engine pulls timing to protect itself, so you lose power and fuel economy. Persistent real knock damages pistons.',
  },
  BOOST: {
    causes: ['Split or loose intercooler or boost hose — check first', 'Leaking intake pipe clamp',
             'Failing wastegate or actuator', 'Clogged air filter', 'Failing turbocharger'],
    fix: ['Inspect every boost hose and clamp between turbo, intercooler and throttle. A split hose is the usual answer and is cheap.',
          'Look for oily residue at joints — that marks where boost is escaping.',
          'Check the air filter.', 'Only then suspect the turbo itself.'],
    difficulty: 'moderate', cost: '$20 for a hose, $700+ for a turbo',
  },
  OVERHEAT: {
    causes: ['Low coolant', 'Failed thermostat stuck closed', 'Failed water pump',
             'Radiator fan not running', 'Blocked radiator', 'Head gasket failure'],
    fix: ['Stop driving. This is the one code you do not drive on.',
          'Check the coolant level once the engine is completely cold — never open a hot system.',
          'With the engine warm, confirm the radiator fan actually spins.',
          'Milky oil or white exhaust smoke points at a head gasket — that is a shop job.'],
    difficulty: 'shop', cost: '$20 for coolant to several thousand for a head gasket',
    urgent: 'Overheating warps heads and destroys engines, often within minutes. Pull over and let it cool.',
  },
  OIL_PRESSURE: {
    causes: ['Low oil level', 'Failed oil pressure sensor', 'Wrong oil viscosity',
             'Clogged oil pickup screen', 'Worn bearings or oil pump'],
    fix: ['Check the oil level immediately. If it is low, top it up and find out where it went.',
          'A sensor is cheap; genuinely low oil pressure is not. Confirm with a mechanical gauge before assuming it is the sensor.',
          'Check that the last oil change used the right viscosity.'],
    difficulty: 'moderate', cost: '$20 for a sensor to an engine rebuild',
    urgent: 'If the oil pressure light is on as well, stop the engine now. Running without oil pressure destroys it in minutes.',
  },
  COOLING_FAN: {
    causes: ['Failed fan relay', 'Blown fuse', 'Failed fan motor',
             'Failed coolant temperature sensor', 'Damaged wiring'],
    fix: ['Check the fuse and relay first — both are cheap and easy.',
          'Let the engine reach operating temperature and confirm whether the fan runs at all.',
          'Swap the fan relay with an identical one elsewhere in the box to test it.'],
    difficulty: 'easy', cost: '$10 for a relay, $150 – $400 for a fan assembly',
    urgent: 'Without a working fan the engine will overheat in traffic, even if it is fine on the motorway.',
  },
  SPEED_SENSOR: {
    causes: ['Failed vehicle speed sensor', 'Damaged wiring', 'Corroded connector',
             'Failed wheel speed sensor feeding the signal'],
    fix: ['Inspect the connector at the sensor — they sit low and collect water.',
          'Note whether the speedometer, cruise control or ABS also misbehave; that narrows it down fast.'],
    difficulty: 'moderate', cost: '$30 – $130',
  },
  FUEL_LEVEL: {
    causes: ['Worn fuel level sending unit inside the tank', 'Corroded connector',
             'Damaged wiring to the tank'],
    fix: ['Check the connector at the top of the tank, usually under a rear seat or access panel.',
          'The sending unit is part of the in-tank pump assembly on many cars, which makes it a bigger job than it sounds.'],
    difficulty: 'moderate', cost: '$60 – $400',
    urgent: 'Nothing will break, but your fuel gauge cannot be trusted. Track mileage instead until it is fixed.',
  },
  SECONDARY_AIR: {
    causes: ['Failed secondary air pump', 'Blocked or corroded air passages',
             'Failed check valve', 'Failed control solenoid'],
    fix: ['Listen for the pump running for a minute or so after a cold start. Silence points at the pump or its relay.',
          'Check the relay and fuse.', 'These passages block with carbon on high-mileage engines.'],
    difficulty: 'moderate', cost: '$50 – $500',
  },
  DPF: {
    causes: ['Diesel particulate filter loaded with soot from short journeys',
             'Failed differential pressure sensor or blocked sensor hoses',
             'Failed EGR causing excess soot', 'Genuinely full filter'],
    fix: ['Take the car for a sustained motorway drive — 20 minutes at speed lets it regenerate. Short trips are what cause this.',
          'Check the small pressure sensor hoses for soot blockage or splits.',
          'A forced regeneration at a shop is the next step before replacement.'],
    difficulty: 'moderate', cost: '$0 for a long drive, $60 for a sensor, $1,000+ for a filter',
  },
  AIRBAG: {
    causes: ['Connector under a seat disturbed by seat movement or cleaning',
             'Failed clock spring in the steering column', 'Failed sensor or module',
             'A deployed airbag not yet reset'],
    fix: ['Check the yellow connectors under the front seats — they get kicked loose surprisingly often.',
          'Disconnect the battery and wait before touching anything in the airbag system.'],
    difficulty: 'shop', cost: '$0 for a connector, $200 – $1,500 for parts',
    urgent: 'While this light is on your airbags may not deploy in a crash. Treat it as safety work, not a convenience fault.',
  },
  BRAKE_SWITCH: {
    causes: ['Misadjusted or failed brake light switch', 'Broken switch plunger or bumper',
             'Damaged wiring'],
    fix: ['Have someone check whether your brake lights actually work.',
          'The switch sits above the brake pedal and is usually a cheap, quick replacement.',
          'Many cars will not shift out of park or engage cruise control with this fault.'],
    difficulty: 'easy', cost: '$15 – $50',
    urgent: 'If your brake lights are out, nobody behind you knows you are stopping. Fix it now.',
  },
  FUEL_TEMP: {
    causes: ['Failed fuel temperature sensor', 'Damaged connector or wiring'],
    fix: ['Inspect the connector.', 'The sensor is usually inexpensive; access varies by model.'],
    difficulty: 'moderate', cost: '$30 – $120',
  },
  ABS_WHEEL: {
    causes: ['Dirty or damaged wheel speed sensor', 'Damaged reluctor ring',
             'Corroded connector', 'Wiring broken near the suspension'],
    fix: ['Clean the sensor and its mounting face — metal dust and rust build up there.',
          'Check the wiring where it flexes with the suspension.'],
    difficulty: 'moderate', cost: '$30 – $150',
    urgent: 'Your normal brakes still work, but ABS and traction control are disabled. Allow more stopping distance in the wet.',
  },
};

/** Codes that map straight to a repair entry. */
const DIRECT = {
  P0180: 'FUEL_TEMP',
  P0200: 'INJECTOR', P0201: 'INJECTOR', P0202: 'INJECTOR', P0203: 'INJECTOR',
  P0204: 'INJECTOR', P0205: 'INJECTOR', P0206: 'INJECTOR',
  P0217: 'OVERHEAT', P0219: 'OVERHEAT',
  P0234: 'BOOST', P0299: 'BOOST',
  P0325: 'KNOCK', P0327: 'KNOCK', P0328: 'KNOCK', P0330: 'KNOCK',
  P0351: 'COIL', P0352: 'COIL', P0353: 'COIL', P0354: 'COIL', P0355: 'COIL', P0356: 'COIL',
  P0411: 'SECONDARY_AIR',
  P0461: 'FUEL_LEVEL', P0462: 'FUEL_LEVEL',
  P0480: 'COOLING_FAN', P0532: 'COOLING_FAN',
  P0500: 'SPEED_SENSOR', P0501: 'SPEED_SENSOR',
  P0520: 'OIL_PRESSURE', P0521: 'OIL_PRESSURE', P0522: 'OIL_PRESSURE', P0524: 'OIL_PRESSURE',
  P0571: 'BRAKE_SWITCH', P0830: 'BRAKE_SWITCH',
  'P244A': 'DPF', 'P244B': 'DPF', P2463: 'DPF',
  B0001: 'AIRBAG', B0081: 'AIRBAG',
  P0022: 'VVT', P0031: 'O2_SENSOR', P0032: 'O2_SENSOR',
  P2096: 'CATALYST', P2097: 'CATALYST',
  P2195: 'O2_SENSOR', P2196: 'O2_SENSOR', P2270: 'O2_SENSOR',
  P0300: 'MISFIRE_RANDOM', P0316: 'MISFIRE_RANDOM',
  P0171: 'LEAN', P0174: 'LEAN', P2187: 'LEAN', P2279: 'LEAN',
  P0172: 'RICH', P0175: 'RICH',
  P0420: 'CATALYST', P0421: 'CATALYST', P0430: 'CATALYST',
  P0440: 'EVAP_LEAK', P0442: 'EVAP_LEAK', P0455: 'EVAP_LEAK', P0456: 'EVAP_LEAK', P0457: 'EVAP_LEAK',
  P0441: 'EVAP_VALVE', P0443: 'EVAP_VALVE', P0446: 'EVAP_VALVE', P0449: 'EVAP_VALVE',
  P0451: 'EVAP_VALVE', P0452: 'EVAP_VALVE', P2404: 'EVAP_VALVE',
  P0100: 'MAF', P0101: 'MAF', P0102: 'MAF', P0103: 'MAF', P0068: 'MAF',
  P0106: 'MAF', P0107: 'MAF', P0108: 'MAF',
  P0110: 'INTAKE_TEMP', P0111: 'INTAKE_TEMP', P0112: 'INTAKE_TEMP', P0113: 'INTAKE_TEMP',
  P0115: 'COOLANT_TEMP', P0116: 'COOLANT_TEMP', P0117: 'COOLANT_TEMP', P0118: 'COOLANT_TEMP',
  P0119: 'COOLANT_TEMP', P0125: 'COOLANT_TEMP',
  P0128: 'THERMOSTAT', P2181: 'THERMOSTAT',
  P0120: 'THROTTLE', P0121: 'THROTTLE', P0122: 'THROTTLE', P0123: 'THROTTLE', P0221: 'THROTTLE',
  P2100: 'THROTTLE', P2101: 'THROTTLE', P2119: 'THROTTLE', P2135: 'THROTTLE', P2138: 'THROTTLE',
  P0335: 'CRANK_CAM', P0336: 'CRANK_CAM', P0340: 'CRANK_CAM', P0341: 'CRANK_CAM',
  P0344: 'CRANK_CAM', P0016: 'CRANK_CAM', P0017: 'CRANK_CAM', P0315: 'CRANK_CAM',
  P0401: 'EGR', P0402: 'EGR', P0403: 'EGR', P0404: 'EGR', P0405: 'EGR',
  P0505: 'IDLE', P0506: 'IDLE', P0507: 'IDLE', P0511: 'IDLE',
  P0010: 'VVT', P0011: 'VVT', P0014: 'VVT', P0020: 'VVT', P0021: 'VVT',
  P0562: 'CHARGING', P0563: 'CHARGING', P0620: 'CHARGING', P0625: 'CHARGING',
  P0700: 'TRANSMISSION', P0701: 'TRANSMISSION', P0705: 'TRANSMISSION', P0706: 'TRANSMISSION',
  P0715: 'TRANSMISSION', P0716: 'TRANSMISSION', P0720: 'TRANSMISSION', P0730: 'TRANSMISSION',
  P0731: 'TRANSMISSION', P0732: 'TRANSMISSION', P0733: 'TRANSMISSION', P0734: 'TRANSMISSION',
  P0740: 'TRANSMISSION', P0741: 'TRANSMISSION', P0742: 'TRANSMISSION', P0750: 'TRANSMISSION',
  P0751: 'TRANSMISSION', P0755: 'TRANSMISSION', P0765: 'TRANSMISSION', P0776: 'TRANSMISSION',
  P0796: 'TRANSMISSION', P0801: 'TRANSMISSION',
  P0087: 'FUEL_PRESSURE', P0088: 'FUEL_PRESSURE', P0089: 'FUEL_PRESSURE',
  P0190: 'FUEL_PRESSURE', P0191: 'FUEL_PRESSURE', P0230: 'FUEL_PRESSURE',
  P0600: 'MODULE', P0601: 'MODULE', P0603: 'MODULE', P0605: 'MODULE', P0606: 'MODULE',
  P0650: 'MODULE', P0645: 'MODULE',
  C0035: 'ABS_WHEEL', C0040: 'ABS_WHEEL', C0045: 'ABS_WHEEL', C0050: 'ABS_WHEEL',
};

/** Look up repair guidance for a code. Returns null when there is none. */
export function repairFor(code) {
  const c = String(code || '').toUpperCase();

  if (DIRECT[c]) return R[DIRECT[c]];
  if (/^P030[1-9]$|^P031[0-2]$/.test(c)) return R.MISFIRE_ONE;      // single-cylinder misfire
  if (/^P01(3|4|5|6)\d$/.test(c)) return R.O2_SENSOR;               // O2 sensor family
  if (/^P00(3|5|6)\d$/.test(c)) return R.O2_SENSOR;                 // O2 heater family
  if (/^U0\d\d\d$/.test(c)) return R.NETWORK;                       // module communication
  if (/^P07\d\d$|^P08\d\d$/.test(c)) return R.TRANSMISSION;
  if (/^C0\d\d\d$/.test(c)) return R.ABS_WHEEL;
  return null;
}

/** Which cylinder a misfire code points at, for a more specific heading. */
export function misfireCylinder(code) {
  const m = /^P03(0[1-9]|1[0-2])$/.exec(String(code || '').toUpperCase());
  return m ? parseInt(m[1], 10) : null;
}

export const DIFFICULTY_LABEL = {
  easy: 'Most people can do this',
  moderate: 'Some experience needed',
  shop: 'Take it to a shop',
};
