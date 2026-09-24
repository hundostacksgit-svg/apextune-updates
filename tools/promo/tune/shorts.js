/*
 * The TikTok cuts: seven 9:16 edits of the tutorial's footage, each built
 * around one hook a stranger scrolling past would stop for. short.js draws
 * them, short-score.js scores them, render-shorts.mjs renders them.
 *
 * 120 BPM (a beat is 0.5 s, a bar 2 s); every cut lands on a beat, every
 * short is a whole number of bars so the music loops when TikTok does.
 *
 * shots    which moment of the tutorial is on screen: src is a held tutorial
 *          time, or [from, speed] to play it (speed 2 = twice as fast)
 * cam      where the camera looks, in the desktop's pixels: {t, to} sets it,
 *          {a, b, to} moves it; `key` names a measured element (tutorial.js R)
 * hook     the first two seconds' text; *stars* colour a phrase
 * caps     the captions, one phrase at a time
 * boxes    a ring around something on screen (a selector, or text inside one)
 * cards    graphics over the picture: count, list, ram, cmd, code, games, names, end
 *
 * The rules are the site's: numbers only from the example run and labelled
 * "Example run", no frame-rate figure, no competitor named, no "AI".
 */
export const BPM = 120;
export const BEAT = 60 / BPM;

const END = (lines) => ({ type: 'end', lines });

export const SHORTS = [
  {
    id: 'check-your-number',
    title: 'Check your number',
    dur: 24,
    cover: 1.7,
    shots: [
      { a: 0, b: 2, src: 9.75, tm: { tab: 'cpu' }, pointer: false },
      { a: 2, b: 8, src: 9.75, tm: { tab: 'cpu', openAt: 3.0 }, pointer: false },
      { a: 8, b: 10, src: [18.5, 1.55], pointer: false },
      { a: 10, b: 16, src: [35.4, 1.83] },
      { a: 16, b: 24, src: 46.7, pointer: false },
    ],
    cam: [
      { t: 0, to: { key: 'tmProcs', s: 2.7, dx: 90, dy: -60 } },
      { a: 0, b: 2, to: { key: 'tmProcs', s: 2.9, dx: 90, dy: -60 }, e: 'io' },
      { t: 2, to: { key: 'tm', s: 0.96, dy: 30 } },
      { a: 4, b: 4.7, to: { key: 'tmProcs', s: 1.7, dx: 110, dy: 40 }, e: 'cam' },
      { t: 8, to: { key: 'prompt', s: 2.45, dx: -25 } },
      { a: 8, b: 10, to: { key: 'prompt', s: 2.55, dx: -25 }, e: 'io' },
      { t: 10, to: { key: 'run', s: 2.3, dy: -40 } },
      { a: 10.45, b: 11.2, to: { key: 'log', s: 1.9, dx: -258, dy: 77 }, e: 'cam' },
      { a: 11.2, b: 16, to: { key: 'log', s: 1.98, dx: -255, dy: 80 }, e: 'io' },
    ],
    whips: [{ t: 8, axis: 'y', dir: -1 }],
    punches: [2, 4, 10, 16, 20],
    hook: { a: 0, b: 2, text: 'Windows is running|*about 200 things*|right now.' },
    caps: [
      { a: 2.05, b: 4, text: 'Check yours: *Ctrl + Shift + Esc*' },
      { a: 4, b: 6, text: '*Performance* → CPU → *Processes*' },
      { a: 6, b: 8, text: "Most of them *aren't for you.*" },
      { a: 8.05, b: 10, text: 'One line cuts it down:' },
      { a: 10.35, b: 13, text: 'A restore point first. *Every change recorded.*' },
      { a: 13, b: 16, text: 'Startup apps, services, telemetry, *the power plan*…' },
    ],
    keys: [{ t: 2.3, keys: ['Ctrl', 'Shift', 'Esc'], until: 3.7 }],
    boxes: [
      { a: 0.25, b: 2, sel: '#tm-procs-box', label: 'Example PC' },
      { a: 4.05, b: 4.7, sel: '#tm-nav-performance' },
      { a: 4.55, b: 5.2, sel: '#tm-t-cpu' },
      { a: 5.05, b: 8, sel: '#tm-procs-box' },
    ],
    dims: [[6, 8, 0.6], [16, 24, 0.62]],
    cards: [
      { type: 'names', a: 6, b: 8, names: ['Fax', 'Retail demo', 'Offline maps', 'Phone service', 'Telemetry', 'Error reporting', 'Geolocation', 'Wallet'] },
      { type: 'count', a: 16, b: 20, from: 214, to: 86 },
      { ...END(["What's *your* number?", 'Comment it below', 'A free check that changes nothing: *omnidx.net*']), a: 20, b: 24 },
    ],
    chips: { ex: [[0.3, 24]], ff: [[10.3, 16]] },
  },

  {
    id: 'ram-speed',
    title: 'Your RAM might be running slow',
    dur: 22,
    cover: 1.7,
    shots: [
      { a: 0, b: 8, src: 9.75, tm: { tab: 'mem' }, pointer: false },
      { a: 8, b: 14, src: [56.1, 0.45], pointer: false },
      { a: 14, b: 22, src: 58.9, pointer: false },
    ],
    cam: [
      { t: 0, to: { key: 'tmSpeed', s: 2.7, dx: -40, dy: 0 } },
      { a: 0, b: 2, to: { key: 'tmSpeed', s: 2.9, dx: -40, dy: 0 }, e: 'io' },
      { a: 2, b: 2.6, to: { key: 'tm', s: 0.96, dy: 40 }, e: 'cam' },
      { a: 4, b: 8, to: { key: 'tm', s: 1.04, dy: 40 }, e: 'io' },
      { t: 8, to: { key: 'bios.1', s: 1.22, dy: 80 } },
      { a: 8, b: 14, to: { key: 'bios.1', s: 1.32, dy: 80 }, e: 'io' },
    ],
    whips: [{ t: 8, axis: 'x', dir: -1 }],
    punches: [2, 4, 8, 14, 18],
    hook: { a: 0, b: 2, text: 'Your RAM might be running|*slower than you paid for.*' },
    caps: [
      { a: 2.05, b: 4, text: 'Task Manager → *Performance* → Memory → *Speed*' },
      { a: 4, b: 6, text: 'Sticks rated *3200*. Running at *2133*.' },
      { a: 6, b: 8, text: 'One BIOS setting: *XMP* (EXPO on AMD). Usually off by default.' },
      { a: 8.1, b: 11, text: 'The *free report* checks it for you' },
      { a: 11, b: 14, text: 'and says where it is *on your board*.' },
      { a: 14.1, b: 18, text: '*Free.* It changes nothing.' },
    ],
    boxes: [
      { a: 0.25, b: 2, sel: '#tm-speed', label: 'Example PC' },
      { a: 2.6, b: 3.1, sel: '#tm-nav-performance' },
      { a: 3.05, b: 3.55, sel: '#tm-t-mem' },
      { a: 3.5, b: 4, sel: '#tm-speed' },
    ],
    dims: [[4, 8, 0.66], [8.6, 14, 0.5], [14, 22, 0.66]],
    cards: [
      { type: 'ram', a: 4, b: 8 },
      { type: 'quote', a: 8.6, b: 14, k: 'From the free report · BIOS checklist', text: '1. Memory profile: enable EXPO (or DOCP / A-XMP on older boards). *CONFIRMED OFF on this PC:* the RAM runs at 2133 MT/s and is rated for 3200.' },
      { type: 'cmd', a: 14, b: 18, title: 'The free report', lines: ["$env:OMNIDX_MODE='report'", 'irm omnidx.net/go.ps1 | iex'] },
      { ...END(["What's *your* RAM speed?", 'Comment it below', '*omnidx.net*']), a: 18, b: 22 },
    ],
    chips: { ex: [[0.3, 14]] },
  },

  {
    id: 'never-asked',
    title: 'Things Windows runs that you never asked for',
    dur: 24,
    cover: 1.6,
    shots: [
      { a: 0, b: 16, src: 39.15, pointer: false },
      { a: 16, b: 20, src: 30.2, pointer: false },
      { a: 20, b: 24, src: [60.4, 0.8] },
    ],
    cam: [
      { t: 0, to: { key: 'log', s: 1.7, dx: -250, dy: 40 } },
      { a: 0, b: 16, to: { key: 'log', s: 1.85, dx: -250, dy: 40 }, e: 'lin' },
      { t: 16, to: { key: 'pc', s: 1.9, dy: 140 } },
      { t: 20, to: { key: 'undo', s: 2.05, dx: -110, dy: 110 } },
    ],
    whips: [{ t: 16, axis: 'y', dir: 1 }, { t: 20, axis: 'x', dir: -1 }],
    punches: [2, 4, 6, 8, 10, 12, 14, 16, 20],
    hook: { a: 0, b: 2, text: 'Things Windows runs|*that you never asked for:*' },
    caps: [
      { a: 16.1, b: 18, text: 'One line switches them *off*.' },
      { a: 18, b: 20, text: 'It *keeps* what your PC uses.' },
      { a: 20.1, b: 22.2, text: 'One button puts it *all back*.' },
      { a: 22.2, b: 24, text: '*omnidx.net*' },
    ],
    boxes: [
      { a: 16.4, b: 20, text: ['#a-mt div', 'Keeps:'] },
      { a: 20.2, b: 22.4, sel: '#b-undo' },
    ],
    dims: [[0, 16, 0.74]],
    cards: [
      { type: 'list', a: 2, b: 16, per: 2, items: [
        { name: 'Fax', id: 'Fax', why: 'A fax service. Running. In 2026.' },
        { name: 'Retail demo', id: 'RetailDemo', why: 'For PCs on display in a shop.' },
        { name: 'Offline maps', id: 'MapsBroker', why: 'Map downloads. On a gaming PC.' },
        { name: 'Phone service', id: 'PhoneSvc', why: 'Phone calls through your PC.' },
        { name: 'Telemetry', id: 'DiagTrack', why: 'Usage data, sent to Microsoft.' },
        { name: 'Error reporting', id: 'WerSvc', why: 'Crash reports, uploaded.' },
        { name: 'Geolocation', id: 'lfsvc', why: 'Where your PC is.' },
      ] },
    ],
    chips: { ex: [[16.3, 24]] },
  },

  {
    id: 'game-file',
    title: 'It edits your Fortnite settings file',
    dur: 20,
    cover: 1.7,
    shots: [
      { a: 0, b: 2, src: 51.3, pointer: false },
      { a: 2, b: 8.4, src: [51.3, 0.6], pointer: false },
      { a: 8.4, b: 14, src: 44.15, pointer: false },
      { a: 14, b: 17, src: [61.3, 0.8] },
      { a: 17, b: 20, src: 63.8, pointer: false },
    ],
    cam: [
      { t: 0, to: { key: 'note', s: 1.45, dx: -114, dy: 40 } },
      { a: 0, b: 6.4, to: { key: 'note', s: 1.52, dx: -114, dy: 40 }, e: 'io' },
      { a: 6.5, b: 7.1, to: { key: 'note', s: 1.55, dx: 150, dy: 190 }, e: 'cam' },
      { t: 8.4, to: { key: 'log', s: 1.7, dx: -250, dy: 40 } },
      { t: 14, to: { key: 'undo', s: 2.0, dx: -110, dy: 110 } },
      { a: 15.1, b: 15.8, to: { key: 'log', s: 1.7, dx: -250, dy: 40 }, e: 'cam' },
    ],
    whips: [{ t: 8.4, axis: 'y', dir: -1 }, { t: 14, axis: 'x', dir: 1 }],
    punches: [2.5, 3.5, 4.5, 5.5, 8.4, 14, 17],
    hook: { a: 0, b: 2, text: 'This one line edits|*your Fortnite settings file.*' },
    caps: [
      { a: 2.5, b: 3.5, text: '*V-Sync:* off' },
      { a: 3.5, b: 4.5, text: '*Motion blur:* off' },
      { a: 4.5, b: 5.5, text: '*Shadows:* off' },
      { a: 5.5, b: 6.6, text: '*Post-processing:* low' },
      { a: 6.6, b: 8.4, text: '*Backed up* first.' },
      { a: 8.5, b: 11, text: 'Same for *7 games*.' },
      { a: 11, b: 14, text: 'Only lines already in the file. *It never adds one.*' },
      { a: 14.1, b: 17, text: 'Undo puts *every value back*.' },
    ],
    boxes: [{ a: 6.8, b: 8.4, sel: '#bk' }],
    dims: [[8.4, 14, 0.62], [17, 20, 0.62]],
    cards: [
      { type: 'games', a: 8.4, b: 14, games: ['Fortnite', 'Apex Legends', 'Counter-Strike 2', 'Rocket League', 'Rainbow Six Siege', 'Marvel Rivals', 'Minecraft'] },
      { ...END(['Which game *next*?', 'Comment it below', '*omnidx.net*']), a: 17, b: 20 },
    ],
    chips: { ex: [[0.3, 20]] },
  },

  {
    id: 'undo-first',
    title: 'Scared to run a PC optimizer?',
    dur: 24,
    cover: 1.6,
    shots: [
      { a: 0, b: 2, src: 60.55 },
      { a: 2, b: 6, src: [37.55, 0.2], pointer: false },
      { a: 6, b: 12, src: [60.2, 0.6] },
      { a: 12, b: 24, src: 63.8, pointer: false },
    ],
    cam: [
      { t: 0, to: { key: 'undo', s: 2.4, dx: -40, dy: 20 } },
      { a: 0, b: 2, to: { key: 'undo', s: 2.55, dx: -40, dy: 20 }, e: 'io' },
      { t: 2, to: { key: 'log', s: 1.7, dx: -250, dy: 40 } },
      { t: 6, to: { key: 'undo', s: 2.0, dx: -110, dy: 110 } },
      { a: 6, b: 9.8, to: { key: 'undo', s: 2.08, dx: -110, dy: 110 }, e: 'io' },
      { a: 9.8, b: 10.4, to: { key: 'log', s: 1.7, dx: -250, dy: 40 }, e: 'cam' },
    ],
    whips: [{ t: 2, axis: 'y', dir: -1 }, { t: 6, axis: 'x', dir: 1 }],
    punches: [2, 6, 12, 18, 21],
    hook: { a: 0, b: 2, text: 'Scared to run a|*PC optimizer?*' },
    caps: [
      { a: 2.1, b: 4, text: 'Good. Look at *the way back* first.' },
      { a: 4, b: 6, text: 'A *restore point* before anything changes.' },
      { a: 6.1, b: 9, text: '*Undo every run*: one button.' },
      { a: 9, b: 12, text: 'It asks twice. Then puts *all of it back*.' },
      { a: 12.1, b: 15, text: 'The whole script is *public*.' },
      { a: 15, b: 18, text: 'Read *every line* before you pay.' },
      { a: 18.1, b: 21, text: 'Or run the *free report*. It changes nothing.' },
    ],
    boxes: [
      { a: 2.4, b: 6, text: ['#logbox div', 'Restore point made'] },
      { a: 6.5, b: 9.8, sel: '#b-undo' },
      { a: 11.2, b: 12, text: ['#logbox div', 'Done:'] },
    ],
    dims: [[12, 24, 0.7]],
    cards: [
      { type: 'code', a: 12, b: 18 },
      { type: 'cmd', a: 18, b: 21, title: 'The free report', lines: ["$env:OMNIDX_MODE='report'", 'irm omnidx.net/go.ps1 | iex'] },
      { ...END(['*$19.99* once.', 'No subscription. Undo included.', '*omnidx.net*']), a: 21, b: 24 },
    ],
    chips: { ex: [[6.2, 12]] },
  },

  {
    id: 'pov-one-line',
    title: 'POV: one line into PowerShell',
    dur: 26,
    cover: 1.5,
    shots: [
      { a: 0, b: 2, src: [19.0, 1.3], pointer: false },
      { a: 2, b: 3, src: [21.6, 2.0] },
      { a: 3, b: 4, src: [24.4, 1.2], pointer: false },
      { a: 4, b: 6, src: [26.4, 1.3] },
      { a: 6, b: 8, src: [32.3, 1.85] },
      { a: 8, b: 14, src: [36.0, 1.72] },
      { a: 14, b: 17, src: 46.7, pointer: false },
      { a: 17, b: 20, src: [51.3, 0.9], pointer: false },
      { a: 20, b: 23, src: [55.9, 1.0], pointer: false },
      { a: 23, b: 26, src: 58.9, pointer: false },
    ],
    cam: [
      { t: 0, to: { key: 'prompt', s: 2.45, dx: -25 } },
      { a: 0, b: 2, to: { key: 'prompt', s: 2.55, dx: -25 }, e: 'io' },
      { t: 2, to: { cx: 960, cy: 620, s: 1.85 } },
      { t: 3, to: { key: 'verify', s: 1.05 } },
      { t: 4, to: { key: 'pc', s: 1.85, dx: 240, dy: 60 } },
      { a: 4.2, b: 6, to: { key: 'pc', s: 1.93, dx: 240, dy: 60 }, e: 'io' },
      { t: 6, to: { key: 'discord', s: 1.8, dx: 60 } },
      { a: 6.6, b: 7.1, to: { key: 'key', s: 1.8, dy: 120 }, e: 'cam' },
      { t: 8, to: { key: 'log', s: 1.9, dx: -258, dy: 77 } },
      { a: 8.2, b: 14, to: { key: 'log', s: 1.98, dx: -255, dy: 80 }, e: 'io' },
      { t: 17, to: { key: 'note', s: 1.45, dx: -114, dy: 40 } },
      { t: 20, to: { key: 'bios.1', s: 1.5, dx: -40, dy: 150 } },
      { a: 20, b: 23, to: { key: 'bios.1', s: 1.58, dx: -40, dy: 150 }, e: 'io' },
    ],
    whips: [{ t: 4, axis: 'y', dir: -1 }, { t: 17, axis: 'x', dir: -1 }, { t: 20, axis: 'x', dir: -1 }],
    punches: [2, 3, 6, 8, 14, 23],
    hook: { a: 0, b: 2, text: 'POV: you paste|*one line*|into PowerShell' },
    caps: [
      { a: 2.05, b: 3, text: 'Windows asks. *Yes.*' },
      { a: 3, b: 4, text: 'Checked against its *published hash*.' },
      { a: 4.05, b: 6, text: 'It *reads your PC* first.' },
      { a: 6, b: 8, text: 'Keep what you want. *Paste your key.*' },
      { a: 8.1, b: 11, text: 'A *restore point* first.' },
      { a: 11, b: 14, text: 'Then it *cuts*.' },
      { a: 17, b: 20, text: "It sets your *games' own settings*." },
      { a: 20, b: 23, text: 'And writes a *BIOS checklist* for your board.' },
    ],
    keys: [{ t: 1.75, keys: ['Enter'], until: 2.4 }, { t: 7.2, keys: ['Ctrl', 'V'], until: 7.9 }],
    boxes: [{ a: 3.1, b: 4, text: ['#admin-text span', 'Script verified'] }],
    dims: [[14, 17, 0.62], [23, 26, 0.66]],
    cards: [
      { type: 'count', a: 14, b: 17, from: 214, to: 86 },
      { ...END(['*$19.99* once.', 'No subscription.', 'Free report first: *omnidx.net*']), a: 23, b: 26 },
    ],
    chips: { ex: [[4.1, 23]], ff: [[8.2, 14]] },
  },

  {
    id: 'valorant-safe',
    title: 'Does it break VALORANT?',
    dur: 20,
    cover: 1.7,
    shots: [
      { a: 0, b: 10, src: 31.0, pointer: false },
      { a: 10, b: 20, src: 58.95, pointer: false },
    ],
    cam: [
      { t: 0, to: { key: 'pc', s: 2.0, dy: 30 } },
      { a: 0, b: 6, to: { key: 'pc', s: 2.12, dy: 30 }, e: 'io' },
      { t: 6, to: { key: 'foot', s: 2.0, dx: 285 } },
      { t: 10, to: { key: 'bios.4', s: 1.22, dy: 90 } },
      { a: 10, b: 15, to: { key: 'bios.4', s: 1.3, dy: 90 }, e: 'io' },
    ],
    whips: [{ t: 6, axis: 'y', dir: 1 }, { t: 10, axis: 'x', dir: -1 }],
    punches: [2, 6, 10, 15, 17.5],
    hook: { a: 0, b: 2, text: "Some 'FPS boost' tweaks|turn off *what VALORANT needs.*" },
    caps: [
      { a: 2.05, b: 4, text: '*Secure Boot. TPM. Memory integrity.*' },
      { a: 4, b: 6, text: 'This one *reads them first*, and leaves them on.' },
      { a: 6.1, b: 8, text: '*Security never lowered.*' },
      { a: 8, b: 10, text: "Memory integrity off is a box *you'd have to tick yourself.*" },
      { a: 10.1, b: 12.5, text: 'Its BIOS checklist says: *keep Secure Boot on.*' },
      { a: 12.5, b: 15, text: 'Written for *your exact board*.' },
      { a: 15.1, b: 17.5, text: 'The *free report* checks all of it.' },
    ],
    boxes: [
      { a: 0.4, b: 6, text: ['#a-mt div', 'Secure Boot'] },
      { a: 6.2, b: 10, text: ['#a-foot', 'Security never lowered'] },
    ],
    dims: [[10.2, 15, 0.5], [15, 20, 0.66]],
    cards: [
      { type: 'quote', a: 10.2, b: 15, k: 'From the report · BIOS checklist', text: "4. Secure Boot: already on. *Leave it on* (VALORANT, Fortnite's anti-cheat and Windows 11 all expect it)." },
      { type: 'cmd', a: 15, b: 17.5, title: 'The free report', lines: ["$env:OMNIDX_MODE='report'", 'irm omnidx.net/go.ps1 | iex'] },
      { ...END(['It never touches *the anti-cheat*.', 'Read every line yourself.', '*omnidx.net*']), a: 17.5, b: 20 },
    ],
    chips: { ex: [[0.3, 15]] },
  },
];
