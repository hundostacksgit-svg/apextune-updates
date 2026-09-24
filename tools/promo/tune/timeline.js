/*
 * The one timeline the tutorial's picture and sound both read.
 *
 * Every cut, keystroke, click and printed line is defined here once, so the
 * score can put a hit exactly where the picture cuts and a key sound exactly
 * where a key goes down. 100 BPM: a beat is 0.6 s, a bar 2.4 s, and every
 * section starts on a bar line.
 *
 * What it shows is what the one command really does: PowerShell, the
 * administrator prompt, then the OmniDx Tune window (drawn from the window's
 * own layout in tune/omnidx.ps1), the key, the run with its live log, the
 * game's settings file, the report and undo. The log's wording is the
 * script's own; the PC and its numbers are the example run the front page
 * shows, and the picture says so.
 */
export const BPM = 100;
export const BEAT = 60 / BPM;
export const BAR = BEAT * 4;
export const FPS = 30;
const bar = (n) => +(n * BAR).toFixed(3);

export const CUE = {
  open1: 0.35, open2: 2.4,
  title: bar(2),
  desk: bar(4), startClick: 10.75, searchType: 11.25, psClick: 13.05, termOpen: 13.3,
  step2: bar(7), typeStart: 17.7, enter: bar(9), admin: bar(9) + 0.12,
  uac: bar(9) + 0.55, uacYes: 23.45, elevated: 23.7,
  verify: bar(10), verified: bar(10) + 0.5,
  step3: bar(11), probe: bar(12) - 0.2,
  step4: bar(13), untick: bar(13) + 1.2,
  step5: bar(14), keyClick: bar(14) + 0.65, keyPaste: bar(14) + 1.3, runClick: bar(15),
  step6: bar(15), done: bar(19) + 0.6,
  step7: bar(21), step8: bar(23),
  step9: bar(25), undoArm: bar(25) + 0.7, undoClick: bar(25) + 1.5,
  outro: bar(27), card: bar(29), end: bar(31),
};
export const DURATION = CUE.end;

// A deterministic generator, so every render of the video is the same video.
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Keystrokes with a person's rhythm: quicker inside a word, a beat longer after a space, a small think before a symbol.
function typing(text, start, seed, base = 0.085) {
  const r = rng(seed); const keys = []; let t = start;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], prev = text[i - 1];
    let d = base * (0.65 + r() * 0.8);
    if (prev === ' ') d += 0.06 + r() * 0.08;
    if ('|.$=\'-/'.includes(ch)) d += 0.07 + r() * 0.06;
    t += d; keys.push({ t, ch });
  }
  return keys;
}

export const SEARCH = 'powershell';
export const COMMAND = 'irm omnidx.net/go.ps1 | iex';
export const SEARCH_KEYS = typing(SEARCH, CUE.searchType, 7, 0.07);
export const COMMAND_KEYS = typing(COMMAND, CUE.typeStart, 11, 0.09);
export const REPORT_COMMAND = "$env:OMNIDX_MODE='report'; irm omnidx.net/go.ps1 | iex";
export const PROMPT = 'PS C:\\Users\\Player> ';
export const KEY = 'TUNE-9WQ2-4C9E-GK3R-D94C';

// When the pointer clicks, for the score. Where is the composition's business: it aims at the element.
export const CLICKS = [CUE.startClick, CUE.psClick, CUE.uacYes, CUE.untick, CUE.keyClick, CUE.runClick, CUE.undoArm, CUE.undoClick];

// The PC the example run reads. Same PC as the front page's console.
// The run on screen is shown eight times faster than it ran; the log's own seconds are the real ones.
export const SPEED = 8;

export const PC = {
  os: 'Microsoft Windows 11 Pro 10.0.26100 (build 26100)',
  cpu: 'AMD Ryzen 5 5600X 6-Core Processor',
  gpu: 'NVIDIA GeForce RTX 3060  (driver 32.0.15.6614)',
  ram: '16 GB, 2 sticks, 2133 MT/s',
  board: 'Micro-Star International Co., Ltd. B550-A PRO (MS-7C56)',
  kind: 'Desktop, NVMe, 165 Hz',
  sec: 'Secure Boot on, TPM yes, memory integrity on',
  keeps: 'Keeps: Wi-Fi, Xbox controller',
  warn: 'RAM is running at 2133 MT/s but is rated for 3200: the memory profile (XMP / EXPO) is off in the BIOS. That is item 1 on your checklist and the biggest free gain on this PC.',
  before: 214, target: 80, after: 86,
};

// The elevated window go.ps1 opens: the banner, then the download checked against its published hash.
export const ELEVATED = [
  { t: CUE.elevated + 0.05, text: 'Windows PowerShell' },
  { t: CUE.elevated + 0.05, text: 'Copyright (C) Microsoft Corporation. All rights reserved.' },
  { t: CUE.elevated + 0.05, text: '' },
  { t: CUE.elevated + 0.05, text: 'Install the latest PowerShell for new features and improvements! https://aka.ms/PSWindows' },
  { t: CUE.elevated + 0.05, text: '' },
  { t: CUE.verified, text: '  Script verified: sha256 7c41d09e5b2a... matches the copy the Windows check tested (v1.77.0, checked 2026-09-24 20:02)', cls: 'dim' },
  { t: CUE.verified + 0.5, text: '' },
  { t: CUE.verified + 0.5, text: '  OmniDx Tune  v1.77.0', cls: 'mag' },
  { t: CUE.verified + 0.5, text: '  200 processes. Under 100. One run.', cls: 'dim' },
];

// What starts with Windows on this PC: ticked means it gets switched off. The pointer unticks Discord.
export const STARTUP = ['Discord', 'Spotify', 'Steam Client Bootstrapper', 'EpicGamesLauncher', 'OneDrive', 'Microsoft Teams', 'Microsoft Edge Update', 'Razer Synapse', 'CCleaner Browser Update', 'Cortana', 'Adobe Updater Startup Utility'];
export const UNTICKED = 'Discord';

// The run's live log. The headings and line shapes are the script's own
// (see studio/assets/ci-log.txt for a real one, word for word); the run is
// the example PC's. Times are when each line lands in the window.
const L = [];
const at = (t, text, cls = '') => L.push({ t: +t.toFixed(3), text, cls });
const r0 = CUE.runClick + 0.2;
const startupOff = STARTUP.filter((n) => n !== UNTICKED);
const heads = [
  ['Reading this PC', ['  Read in 3.9 s', '  ! ' + PC.warn, '  Processes running now: 214', '  Target for this PC after the tune and a restart: about 80']],
  ['Your key', ['  Key accepted. PC 1 of 1 on this key.']],
  ['Before the cut', ['  Before: 214 processes, 2890 threads, 98116 handles, 5210 MB in use, idle CPU 2.1%, DPC 0.1%']],
  ['Safety first', ['  + Restore point made. Windows can go back to this moment from Recovery.', '  + Registry and service list backed up to C:\\OmniDx\\backup\\2026-09-24_20-14-07', '  + undo.ps1 written to C:\\OmniDx\\undo']],
  ['Startup apps', [`  ${startupOff.length} things start with Windows:`, ...startupOff.map((n) => '  + off: ' + n), `  ${startupOff.length} startup entries switched off. Task Manager > Startup can switch any one back on.`]],
  ['Services', ['  + DiagTrack -> disabled  (telemetry)', '  + dmwappushservice -> disabled  (telemetry push)', '  + WerSvc -> disabled  (error reporting)', '  + MapsBroker -> disabled  (offline maps)', '  + lfsvc -> disabled  (geolocation)', '  + RetailDemo -> disabled  (retail demo)', '  + Fax -> disabled  (fax)', '  + PhoneSvc -> disabled  (Phone Link)']],
  ['Scheduled tasks', ['  + Consolidator', '  + UsageDataReporting', '  + Microsoft Compatibility Appraiser', '  + ProgramDataUpdater']],
  ['Preinstalled apps', ['  + Microsoft.BingNews', '  + Microsoft.BingWeather', '  + Microsoft.GetHelp', '  + Microsoft.WindowsMaps', '  + Microsoft.WindowsFeedbackHub']],
  ['Debloat', ['  + removed Steps Recorder (screenshots every click, retired by Microsoft)', '  + removed Internet Explorer 11']],
  ['Telemetry, background activity, the shell', ["  + Telemetry, the advertising id, activity history, suggestions, Bing in Start, Recall and Edge's reporting off; background apps off; widgets, news, Copilot and Cortana off; Game DVR off, Game Mode on; the classic right-click menu on 11"]],
  ['System tuning', ['  + NTFS last-access stamps off', '  + NTFS allowed more memory for its cache']],
  ['The OmniDx power plan', ['  + OmniDx plan created and active: CPU 100/100, boost aggressive, energy preference on performance, no core parking, no throttle states on a desktop, PCIe, USB and Wi-Fi power saving off, no sleep on mains.']],
  ['Network', ['  + TCP: autotuning normal, ECN and timestamps off, receive-side scaling on, segment coalescing off, CTCP.', '  + Ethernet: Interrupt Moderation off', '  + Ethernet: Nagle off, power saving off']],
  ['Discord, Spotify, browsers', ['  + Discord: hardware acceleration on; it still starts with Windows, as you chose', '  + Spotify: hardware acceleration on, no auto-start, friend feed off', '  + Edge: no startup boost, no background mode, hardware acceleration on']],
  ['Game profiles', ['  + Installed and profiled: Fortnite, VALORANT, Marvel Rivals', '  Every listed game: high CPU priority, high-performance GPU, fullscreen optimisations off, Game DVR off. In-game settings are in the report.']],
  ['Game settings files', ['  + Fortnite: V-Sync off, motion blur off, shadows off, post-processing low', '  + Marvel Rivals: V-Sync off, shadows low, post-processing low']],
  ['NVIDIA extras', ['  + NVIDIA telemetry service off, 3 NVIDIA crash-report and updater tasks off. The display driver and its container are untouched.']],
  ['Cleanup', ['  + Temp files, the Windows Update download cache and the peer-to-peer update cache cleared: about 1240 MB back.']],
  ['Keeping it cut', ["  + Task 'OmniDx keep' runs three minutes after sign-in, puts back whatever an update turned on, notes that start's boot time and writes card-after-restart.png with that start's count. Log: C:\\OmniDx\\keep-log.txt. Undo removes it."]],
];
// Headings spread over the run so the last lands just before Done; the lines under each follow quickly.
const span = CUE.done - 0.5 - r0;
heads.forEach(([h, lines], i) => {
  const t0 = r0 + (i / heads.length) * span;
  const step = Math.min(0.1, (span / heads.length - 0.1) / Math.max(1, lines.length));
  at(t0, '== ' + h, 'h');
  lines.forEach((ln, j) => at(t0 + 0.08 + j * step, ln));
});
at(CUE.done, '== Done', 'h');
at(CUE.done + 0.12, '  After:  86 processes, 1402 threads, 51320 handles, 3620 MB in use, idle CPU 0.6%, DPC 0.1%');
at(CUE.done + 0.24, '  Processes: 214 -> 86 now, in 82 seconds. Restart for the real number: the services that were told to stop are still unwinding.', 'ok');
export const LOG = L;
export const HEADS = L.filter((l) => l.cls === 'h').map((l) => ({ t: l.t, text: l.text.replace(/^== /, '') }));

// The undo, in the undo script's own line shapes.
const U = [];
const u = (t, text, cls = '') => U.push({ t: +t.toFixed(3), text, cls });
['service DiagTrack -> Automatic', 'service MapsBroker -> Manual', 'restored HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run\\Spotify', 'power plan restored', 'tcp settings restored', 'file restored C:\\Users\\Player\\AppData\\Local\\FortniteGame\\Saved\\Config\\WindowsClient\\GameUserSettings.ini']
  .forEach((s, i) => u(CUE.undoClick + 0.35 + i * 0.22, s));
u(CUE.undoClick + 2.0, 'Done: 412 put back. Restart to finish.', 'ok');
export const UNDO_LOG = U;

// Fortnite's own settings file, before and after. The keys are the ones the script writes.
export const INI = [
  ['[ScalabilityGroups]', null],
  ['sg.ResolutionQuality=100.000000', null],
  ['sg.ViewDistanceQuality=3', null],
  ['sg.AntiAliasingQuality=3', null],
  ['sg.ShadowQuality=3', '0'],
  ['sg.GlobalIlluminationQuality=1', null],
  ['sg.PostProcessQuality=3', '0'],
  ['sg.TextureQuality=3', null],
  ['', null],
  ['[/Script/FortniteGame.FortGameUserSettings]', null],
  ['bUseVSync=True', 'False'],
  ['bMotionBlur=True', 'False'],
  ['FrameRateLimit=0.000000', null],
  ['bShowGrass=True', null],
];
// The order the four edits land in, and when (on the beat).
export const FLIPS = [10, 11, 4, 6].map((row, i) => ({ row, t: CUE.step7 + BAR * 0.5 + i * BEAT }));

// The report's BIOS checklist for this board, shortened from the script's own lines.
export const BIOS = [
  'How to get in: restart, then press Del while the MSI logo shows.',
  '1. Memory profile: enable EXPO (or DOCP / A-XMP on older boards). CONFIRMED OFF on this PC: the RAM runs at 2133 MT/s and is rated for 3200. Pick the profile matching the speed printed on the sticks.',
  '2. Re-Size BAR / Smart Access Memory: set Above 4G Decoding = Enabled, then Re-Size BAR Support = Auto/Enabled. Needs CSM off (next line).',
  '3. CSM (Compatibility Support Module): Disabled. You already boot UEFI, so nothing depends on it, and Re-Size BAR needs it off.',
  '4. Secure Boot: already on. Leave it on (VALORANT, Fortnite\'s anti-cheat and Windows 11 all expect it).',
  '8. Fast Boot: Enabled. Full Screen Logo / Boot Logo: Disabled (a second off every boot).',
];
export const CHECKS = BIOS.slice(1).map((_, i) => CUE.step8 + BAR * 0.5 + i * BEAT);

// The lines the score marks with a soft tick: each heading of the run as it lands.
export const TICKS = HEADS.map((h) => h.t).filter((t) => t > CUE.runClick && t < CUE.done);

// Big moves, for the whooshes: [time, duration, from-pan, to-pan].
export const WHOOSH = [
  [CUE.termOpen - 0.05, 0.4, -0.3, 0.2],
  [CUE.step3 - 0.1, 0.35, 0.2, -0.2],
  [CUE.step7 - 0.3, 0.55, -0.8, 0.8],
  [CUE.step8 - 0.3, 0.55, 0.7, -0.5],
  [CUE.step9 - 0.3, 0.55, -0.6, 0.6],
  [CUE.outro - 0.35, 0.6, 0, 0],
];

// The chapter captions: [start, end, eyebrow, line].
export const CAPTIONS = [
  [CUE.desk + 0.3, CUE.step2 - 0.2, 'Step 1', 'Open Windows PowerShell.'],
  [CUE.step2 + 0.2, CUE.uac - 0.1, 'Step 2', 'Type or paste the one line. Press Enter.'],
  [CUE.uac + 0.3, CUE.verify - 0.2, null, 'Windows asks for administrator rights. Click Yes.'],
  [CUE.verify + 0.3, CUE.step3 - 0.2, null, 'The download is checked against its published fingerprint before it runs.'],
  [CUE.step3 + 0.5, CUE.step4 - 0.2, 'Step 3', 'The app opens and reads your PC. Nothing changes yet.'],
  [CUE.step4 + 0.2, CUE.step5 - 0.2, null, 'Untick anything you want left alone.'],
  [CUE.step5 + 0.2, CUE.step6 - 0.1, 'Step 4', 'Paste your key. Run the tune.'],
  [CUE.step6 + 0.3, CUE.done - 0.3, null, 'A restore point first. Every change recorded.'],
  [CUE.step7 + 0.3, CUE.step8 - 0.3, 'Also', "It writes into your games' own settings files. Backed up first."],
  [CUE.step8 + 0.3, CUE.step9 - 0.3, 'Then', 'A BIOS checklist for your exact board, in the report.'],
  [CUE.step9 + 0.3, CUE.outro - 0.3, 'Changed your mind', 'Undo every run is one button.'],
];
