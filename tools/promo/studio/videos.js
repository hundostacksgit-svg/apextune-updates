/*
 * The promo videos, as data.
 *
 * Every video is a hook, two or three scenes that show the thing, and the
 * end card. Durations are in beats of the named track, so scene changes land
 * on the music. Coordinates for the app scenes are fractions of the
 * screenshot (0..1 across and down), measured from shots.mjs's 1600x1000
 * capture, so they survive the 2x and any future re-shoot at the same layout.
 *
 * Copy rules, so nothing here has to be walked back later:
 *  - every claim matches the pricing page's comparison table;
 *  - the price is always "$19.99 once" for Creator, and "free to start";
 *  - the address is on every frame (the watermark) and again on the end card.
 */

/*
 * The two grades a drop scene's cuts come in.
 *
 * Here rather than in comp.js because comp.js is a page script with nothing
 * exported, and verify-promo-specs.mjs has to apply the same numbers to the
 * same screenshots to tell whether a cut will read as a cut. Two copies of
 * these four numbers is two copies that drift, and the drift would show up as
 * a verifier that passes while the video loses cuts — which is the exact
 * failure the check exists to catch.
 */
/*
 * The second reference, as measured facts rather than a theory about it.
 *
 * Three attempts went into getting this right and the first two were wrong in
 * the same way: they tried to derive a beat grid and then cut to it.
 *
 *  - The app's own detectBeats said 122 BPM at 0.44 confidence.
 *  - Autocorrelating the low band said 97.1 BPM.
 *  - A least-squares fit to the reference's cut times said 97.26 BPM, and a
 *    video cut to it did not line up with the track at all.
 *
 * Measuring the actual transients explains why. There are NO strong onsets in
 * the first 11.8 seconds — that section of the track has no beat to cut to, so
 * a grid fitted through those cuts was fitting the editor's own even rhythm and
 * calling it tempo. After the drop the onsets do not sit on a clean grid
 * either: the best period found by searching every period from 0.2s to 1.05s
 * leaves an RMS error of 48ms and a worst case of 110ms, which is not a grid,
 * it is a groove.
 *
 * So there is no grid, and the right answer is the obvious one that got walked
 * past: THE REFERENCE IS THE GROUND TRUTH. Its editor cut this footage to this
 * track and the result works. Every cut below is one of their measured cut
 * times, used directly. The rebuild lines up with the track exactly as well as
 * the reference does, which is the most that can be claimed and is what was
 * actually wanted.
 *
 * The one deliberate change: the reference's subject changes at 12.367s, half a
 * second after the drop at 11.81s. Here the mark arrives ON the drop and the
 * call-out is before it.
 */
/** The drop: first strong low-frequency transient in the track, measured. */
export const REF_DROP = 11.81;
/** The reference editor's own cut times, from dissect.mjs. */
export const REF_CUTS = [
  0, 1.3, 2.533, 3.733, 4.933, 6.167, 7.4, 8.633, 9.9,
  12.367, 13.633, 14.233, 14.867, 15.5, 16.7, 17.333, 17.933, 18.5, 19.8, 20.4,
  21, 21.633, 22.267, 23.467, 24.067, 24.7, 25.333, 26.533, 27.167, 27.767,
  28.4, 29, 30.367, 31.467,
];
/** Where their end card starts, and the whole thing's length. */
export const REF_END = 31.467;
export const REF_LEN = 35.527;

/*
 * The third sent-in reference, measured the same way.
 *
 * 27.67s square, but the last four seconds are TikTok's own download outro
 * (the logo and the username bar), not the edit — the edit ends at 23.667s on
 * the final hit. The drop: the low band sits at 4-14 units to 8.22s and climbs
 * to 73 by 8.60s; the first fast cut is at 8.5s and that is where this changes.
 * Cuts from dissect.mjs at threshold 0.12, which on this picture found the
 * flash cuts the default threshold folded together. The flashes themselves are
 * the frames whose mean luma is over 150 — eight of them, measured, none on a
 * pattern the cut list could express, so they are their own list.
 */
export const REF3_DROP = 8.5;
export const REF3_CUTS = [
  0, 1.9, 4.967, 8.5, 9.133, 9.233, 9.667, 9.767, 10.2, 10.533, 10.733, 10.8, 11.2, 11.267,
  11.467, 11.967, 12.367, 12.733, 13.733, 13.8, 13.867, 14.033, 14.167, 14.333, 14.467, 14.7,
  14.8, 14.867, 14.967, 15.5, 15.967, 16.433, 16.6, 16.667, 17.7, 17.767, 18.067, 18.233,
  18.467, 18.567, 23.667,
];
export const REF3_FLASHES = [9.7, 10.733, 11.367, 12.733, 13.767, 15.967, 16.633, 18.5];
export const REF3_END = 18.567;
export const REF3_LEN = 23.667;

export const DROP_TONES = {
  cool: { b: 0.72, h: -16, s: 0.82 },
  warm: { b: 1.55, h: 18, s: 1.35 },
};

/* ---- views into the editor screenshots: where to look, and how close ---- */
const V = {
  whole:     { cx: 0.5,  cy: 0.5,  w: 1 },
  timeline:  { cx: 0.5,  cy: 0.72, w: 0.34 },
  panel:     { cx: 0.13, cy: 0.33, w: 0.3 },
  panelTop:  { cx: 0.13, cy: 0.25, w: 0.3 },
  viewer:    { cx: 0.51, cy: 0.32, w: 0.6 },
  inspector: { cx: 0.9,  cy: 0.33, w: 0.3 },
  dialog:    { cx: 0.5,  cy: 0.5,  w: 0.42 },
  topRight:  { cx: 0.85, cy: 0.1,  w: 0.4 },
};
const hold = (v, t0, t1) => [{ at: t0, ...v }, { at: t1, ...v }];
const move = (a, t0, b, t1) => [{ at: t0, ...a }, { at: t1, ...b }];

/* ---- the words that recur ---- */
const BASE_TAGS = ['#videoediting', '#videoeditor', '#editingapp', '#nosubscription', '#contentcreator', '#fyp'];
const tags = (...extra) => [...extra, ...BASE_TAGS].slice(0, 8);
const END = (line, ...extra) => ({ type: 'end', beats: 10, line, tags: tags(...extra) });
/* TikTok allows five hashtags in a caption, so everything made after the first
   twenty-two carries five and no more: four chosen for the video plus #fyp. */
const tags5 = (...extra) => [...extra, '#fyp'].slice(0, 5);
const END5 = (line, ...extra) => ({ type: 'end', beats: 10, line, tags: tags5(...extra), bio: 'omnidx.net' });
const PRICE_LINE = 'Free to start. <b>$19.99 once</b> for everything in Creator.';

/* ---- lists that recur ---- */
const EFFECT_ITEMS = ['Motion blur', 'RGB split', 'Glow', 'Speed lines', 'Halftone', 'Posterize time', 'Pixelate', 'Scanlines', 'VHS wobble', 'Prism',
  'Lens flare', 'Light leak', 'Zoom blur', 'Shake', 'Echo', 'Turbulent displace', 'Fractal noise', 'Light sweep', 'Audio spectrum', 'Particles'];
const ANIMATOR_ITEMS = ['Typewriter', 'Fade by letter', 'Rise by letter', 'Fall by letter', 'Zoom by word', 'Rotate in', 'Blur in', 'Tracking in', 'Random pop', 'Beat bounce', 'Audio scale', 'Wave loop'];
const EXPRESSION_ITEMS = ['wiggle', 'loop', 'beat', 'audio', 'inertia', 'spin', 'drift', 'blink', 'ping-pong', 'stutter', 'shake & settle', 'breathe'];
const SHAPE_ITEMS = ['Progress bar', 'Line reveal', 'Ring fill', 'Box outline', 'Neon ring', 'Saber line', 'Burst lines', 'Dashed orbit', 'Dot grid', 'Star pop', 'Wobble blob', 'Hexagon'];
const PARTICLE_ITEMS = ['Snow', 'Rain', 'Sparks', 'Embers', 'Confetti', 'Dust', 'Bokeh', 'Bubbles', 'Star field', 'Custom system'];
const PLATFORM_ITEMS = [['📱', 'TikTok 9:16'], ['▶️', 'YouTube 16:9'], ['🎞️', 'Reels'], ['⚡', 'Shorts'], ['◼️', 'Square 1:1'], ['📐', '4:5 feed'], ['🎬', '4K 60'], ['🎥', 'ProRes']];
const MONTAGE_ITEMS = ['Beat montage', 'Anime opening', 'Phonk', 'Velocity', 'Cinematic', 'Trailer', 'Sports', 'Gaming', 'Travel', 'Vlog', 'Lo-fi', 'Drill', 'Horror', 'Wedding', 'Car', 'Fitness', 'Glitch', 'Meme'];
const FREE_ITEMS = ['Unlimited tracks', 'No watermark', '78 effects', '8 transitions', '11 edit styles', 'Titles + stickers', '1080p export', 'Works offline', 'Autosave'];
const AUDIO_ITEMS = ['Noise reduction', 'Hum removal', 'Click repair', 'Level matching', 'Ducking under voice', 'Loudness to spec', 'EQ + dynamics', '17 creative filters'];
const TIME_ITEMS = ['Speed ramp', 'Time remap', 'Freeze frame', 'Reverse', 'Slow-mo', 'Velocity edit', 'Posterize time', 'Stutter'];
const MUSIC_ITEMS = [['🎤', 'Rap, trap, drill'], ['🇬🇧', 'UK drill, grime'], ['💿', 'R&B, trap soul'], ['🌍', 'Afrobeats, amapiano'],
  ['🏝️', 'Reggaeton, dancehall'], ['🏠', 'House, techno, EDM'], ['🎸', 'Pop, indie, rock'], ['📼', 'Lo-fi, jazz hop'], ['🎬', 'Cinematic, trailer']];
const TRACK_ITEMS = ['Titles', 'Stickers', 'Lens flare', 'Blur a face', 'Transitions', 'Callouts', 'Emoji', 'Masks'];
/*
 * The limitations, as a video. This is the one people share: a feature list is
 * an advert and everybody discounts it, while the list of what a thing cannot
 * do is the only claim an unknown seller makes against their own interest —
 * which is exactly why it gets believed, and why it earns the rest of the set
 * a hearing. Every line matches studio/trust/#cant word for word.
 */
const CANT_ITEMS = [['🚫', 'Generate video that isn\'t there'], ['✍️', 'Type your captions for you, yet'],
  ['📷', 'Stabilise a shaky shot'], ['🖊️', 'Draw a mask with a pen'], ['🔒', 'Stop a licence being shared'],
  ['🔄', 'Sync projects between devices, yet'], ['🖥️', 'Beat a $6,000 workstation at 8K']];
/*
 * What each edit style actually builds, taken from the app's own planner rather
 * than written to sound good: `plan('make me a phonk edit', …)` prints these
 * labels. Anybody who opens the app after one of these videos gets the video
 * they were shown, which is the only reason to name the steps at all.
 */
const PHONK_STEPS = ['Cut in 3 sections', 'Kickback ramp on the build', 'Velocity ramp on the drop', 'Phonk dark grade',
  'Vignette — hard', 'Film grain', 'Punch in on every beat', 'Impact frames', 'VHS — worn tape', 'Camera shake',
  'Flash', 'Whip pan on the cuts'];
const ANIME_STEPS = ['Cut in 6 sections', 'Velocity ramp on the drop', 'Slow-mo hit on the breather', 'Anime pop grade',
  'Glow / bloom', 'Punch in on every beat', 'Impact frames', 'Chromatic split', 'Speed lines — radial', 'Motion blur',
  'Zoom punch on the cuts', 'Whip pan on the drop'];
const VELOCITY_STEPS = ['Cut in 3 sections', 'Punch ramp on the build', 'Stutter ramp on the fast part', 'Punch grade',
  'Glow / bloom', 'Punch in on every beat', 'Impact frames', 'Zoom blur', 'Motion blur', 'Zoom punch on the cuts',
  'Whip pan on the cuts', 'Dip to black to land'];
const UPDATE_ITEMS = [['✨', 'Motion blur'], ['🌨️', 'Particles'], ['〰️', 'Expressions'], ['🔤', 'Text animators'], ['◇', 'Shape layers'], ['🎯', 'Motion tracking'], ['🎚️', 'Audio repair'], ['📤', 'Export everywhere'], ['⚡', 'Smooth playback'], ['🤖', 'AI montages']];

/* ---- the AI demo ---- */
const AI_PROMPT = 'Make a 20 second phonk edit, cut on the beat, speed lines on the drops and a VHS look';
const AI_STEPS = ['Cut the 4 clips to the beat — 21 cuts', 'Speed lines on every drop', 'VHS 1987 look on all clips', 'Phonk beat at 132 bpm, ducked under voice'];

/* =================================================================== */
export const VIDEOS = [
  {
    id: '01-no-subscription', title: 'Stop paying monthly', music: 'hype-150-24s',
    scenes: [
      { type: 'hook', beats: 8, lines: ['STOP PAYING', '$23 A MONTH', 'TO EDIT VIDEOS'], grad: [1] },
      { type: 'price', beats: 14, cap: 'one payment. <em>that\'s it.</em>' },
      { type: 'app', beats: 10, shot: 'editor', box: 'wide', tag: 'the whole editor', view: [...hold(V.whole, 0, 1.4), { at: 2.6, ...V.timeline }], cap: 'a full editor. <i>in your browser.</i>' },
      { type: 'statement', beats: 6, lines: ['One payment.', 'Yours forever.'], grad: [1] },
      END('No monthly anything. ' + PRICE_LINE, '#onetimepurchase', '#capcut'),
    ],
  },
  {
    id: '02-ai-sentence', title: 'One sentence, whole edit', music: 'trap-140-24s',
    scenes: [
      { type: 'hook', beats: 8, lines: ['I TYPED', 'ONE SENTENCE.', 'IT EDITED THE VIDEO.'], grad: [2] },
      { type: 'typing', beats: 16, prompt: AI_PROMPT, steps: AI_STEPS, caps: [[0, 'type what you want. <em>it plans the edit.</em>'], [11, 'you approve. <em>it does it.</em>']] },
      { type: 'app', beats: 8, shot: 'panel-ai', box: 'tall', tag: 'the AI panel', view: hold(V.panel, 0, 4),
        cursor: [{ at: 0.3, x: 0.16, y: 0.24 }, { at: 1.2, x: 0.13, y: 0.34, click: true }], spots: [{ at: 1.4, x: 0.045, y: 0.205, w: 0.172, h: 0.16, label: 'runs on your device' }],
        cap: 'nothing uploads. <i>it runs on your device.</i>' },
      { type: 'statement', beats: 6, lines: ['It edits.', 'You approve.'], grad: [1] },
      END('The AI editor is in Creator. ' + PRICE_LINE, '#aiediting', '#aivideo'),
    ],
  },
  {
    id: '03-cut-on-the-beat', title: 'Every cut on the beat', music: 'phonk-132-24s',
    scenes: [
      { type: 'hook', beats: 8, lines: ['EVERY CUT', 'ON THE BEAT.', 'AUTOMATICALLY.'], mint: [1] },
      { type: 'timeline', beats: 16, every: 2, note: '🥁 Sync to the music', cap: 'drop your clips. <em>it cuts on the beat.</em>' },
      { type: 'app', beats: 8, shot: 'panel-audio', box: 'tall', tag: 'real beat detection', view: hold(V.panel, 0, 4),
        spots: [{ at: 0.5, x: 0.047, y: 0.425, w: 0.17, h: 0.13, label: '58 beats detected' }], cursor: [{ at: 0.8, x: 0.12, y: 0.5 }, { at: 1.6, x: 0.094, y: 0.525, click: true }],
        cap: 'it listens to the track. <i>not guessing.</i>' },
      { type: 'end', beats: 12, line: 'Beat-synced cutting is in Creator. ' + PRICE_LINE, tags: tags('#beatsync', '#montage') },
    ],
  },
  {
    id: '04-340-effects', title: '340 effects, no packs', music: 'dnb-174-24s',
    scenes: [
      { type: 'hook', beats: 10, lines: ['340 EFFECTS.', 'NO PLUGINS.', 'NO PACKS TO BUY.'], grad: [0] },
      { type: 'list', beats: 20, count: 340, title: 'effects, built in', items: EFFECT_ITEMS.slice(0, 18), stepBeats: 0.8, cap: 'motion blur to particles. <em>all included.</em>' },
      { type: 'app', beats: 14, shot: 'panel-effects', box: 'tall', tag: 'the effects panel', view: [...hold(V.panel, 0, 1.5), { at: 2.5, ...V.panelTop }],
        cursor: [{ at: 0.4, x: 0.15, y: 0.2 }, { at: 1.3, x: 0.095, y: 0.27, click: true }, { at: 2.4, x: 0.166, y: 0.27, click: true }],
        spots: [{ at: 0.2, x: 0.05, y: 0.11, w: 0.165, h: 0.035, label: '290 presets, live on the clip' }], cap: 'every preset previews <i>on your clip.</i>' },
      { type: 'end', beats: 14, line: 'All 340 effects in Creator. ' + PRICE_LINE, tags: tags('#vfx', '#aftereffects') },
    ],
  },
  {
    id: '05-private-offline', title: 'Your footage stays yours', music: 'cinematic-90-24s',
    scenes: [
      { type: 'hook', beats: 6, lines: ['YOUR FOOTAGE', 'NEVER LEAVES', 'YOUR DEVICE.'], mint: [1] },
      { type: 'statement', beats: 6, lines: ['No upload.', 'No cloud.', 'No account to start.'], grad: [2] },
      { type: 'app', beats: 8, shot: 'editor', box: 'wide', tag: 'edits on your device', view: [...hold(V.whole, 0, 1.6), { at: 3.4, ...V.viewer }], cap: 'works offline. <em>on a plane. anywhere.</em>' },
      { type: 'end', beats: 10, line: 'Private by design. ' + PRICE_LINE, tags: tags('#privacy', '#offline') },
    ],
  },
  {
    id: '06-expressions', title: 'After Effects expressions in a browser', music: 'hype-150-24s',
    scenes: [
      { type: 'hook', beats: 8, lines: ['AFTER EFFECTS', 'EXPRESSIONS.', 'IN A BROWSER.'], grad: [1] },
      { type: 'list', beats: 14, title: 'expressions, no keyframes', items: EXPRESSION_ITEMS, big: true, stepBeats: 0.75, cap: 'wiggle. loop. react to the beat. <em>one click each.</em>' },
      { type: 'app', beats: 10, shot: 'editor', box: 'tall', tag: 'any property', view: hold(V.inspector, 0, 4),
        spots: [{ at: 0.4, x: 0.808, y: 0.09, w: 0.185, h: 0.29, label: 'Transform → add expression', below: false }], cursor: [{ at: 0.6, x: 0.88, y: 0.2 }, { at: 1.5, x: 0.86, y: 0.157, click: true }],
        cap: 'position. scale. rotation. opacity. <i>all of it.</i>' },
      { type: 'statement', beats: 6, lines: ['Motion design.', 'Without the rent.'], grad: [1] },
      END('Expressions, shape layers and text animators are in Creator. ' + PRICE_LINE, '#motiondesign', '#aftereffects'),
    ],
  },
  {
    id: '07-text-animators', title: 'Text that animates letter by letter', music: 'trap-140-24s',
    scenes: [
      { type: 'hook', beats: 8, lines: ['TEXT THAT', 'ANIMATES', 'LETTER BY LETTER.'], grad: [2] },
      { type: 'list', beats: 14, title: 'text animators', items: ANIMATOR_ITEMS, stepBeats: 0.75, cap: 'per character. <em>with range selectors.</em>' },
      { type: 'app', beats: 10, shot: 'panel-text', box: 'tall', tag: 'the text panel', view: hold(V.panel, 0, 4),
        cursor: [{ at: 0.4, x: 0.15, y: 0.2 }, { at: 1.2, x: 0.087, y: 0.107, click: true }], spots: [{ at: 1.8, x: 0.046, y: 0.36, w: 0.17, h: 0.1, label: '49 text styles' }],
        cap: '49 styles. <i>tap one, it\'s on the timeline.</i>' },
      { type: 'statement', beats: 4, lines: ['Titles that move.'], grad: [0] },
      END('Titles, animators and styles are in Creator. ' + PRICE_LINE, '#typography', '#kinetictypography'),
    ],
  },
  {
    id: '08-particles', title: 'Real particle systems', music: 'phonk-132-24s',
    scenes: [
      { type: 'hook', beats: 10, lines: ['SNOW.', 'RAIN.', 'SPARKS.', 'EMBERS.', 'CONFETTI.'], grad: [2], stagger: 0.32, size: 'lg' },
      { type: 'list', beats: 12, count: 10, title: 'particle systems', items: PARTICLE_ITEMS, big: true, stepBeats: 0.75, cap: 'real particles. <em>not stickers.</em>' },
      { type: 'app', beats: 10, shot: 'panel-overlays', box: 'tall', tag: 'overlays and weather', view: hold(V.panel, 0, 4),
        cursor: [{ at: 0.4, x: 0.15, y: 0.3 }, { at: 1.3, x: 0.092, y: 0.23, click: true }], spots: [{ at: 0.2, x: 0.05, y: 0.14, w: 0.165, h: 0.03, label: '68 light overlays' }],
        cap: 'leaks, flares, frames, weather. <i>on top of anything.</i>' },
      { type: 'end', beats: 12, line: 'Particles, fractal noise and displacement in Creator. ' + PRICE_LINE, tags: tags('#particles', '#vfx') },
    ],
  },
  {
    id: '09-shape-layers', title: 'Shape layers with trim paths', music: 'house-126-24s',
    scenes: [
      { type: 'hook', beats: 8, lines: ['SHAPE LAYERS', 'WITH TRIM PATHS', 'AND REPEATERS.'], grad: [1] },
      { type: 'list', beats: 12, title: 'shape presets', items: SHAPE_ITEMS, stepBeats: 0.75, cap: 'draw it once. <em>repeat it 40 times.</em>' },
      { type: 'app', beats: 10, shot: 'panel-shapes', box: 'tall', tag: 'the shapes panel', view: hold(V.panel, 0, 4),
        cursor: [{ at: 0.5, x: 0.16, y: 0.25 }, { at: 1.4, x: 0.1, y: 0.16, click: true }], cap: 'vector shapes. <i>in the browser.</i>' },
      { type: 'statement', beats: 4, lines: ['Trim. Repeat. Wiggle.'], grad: [0] },
      END('Shape layers are in Creator. ' + PRICE_LINE, '#motiongraphics', '#shapes'),
    ],
  },
  {
    id: '10-export-everywhere', title: 'One edit, every platform', music: 'hype-150-24s',
    scenes: [
      { type: 'hook', beats: 8, lines: ['ONE EDIT.', 'EVERY', 'PLATFORM.'], grad: [2] },
      { type: 'list', beats: 12, title: 'export presets, safe zones included', items: PLATFORM_ITEMS, stepBeats: 0.75, cap: 'the right size. <em>the first time.</em>' },
      { type: 'app', beats: 12, shot: 'export', box: 'wide', tag: 'export', view: hold(V.dialog, 0, 5),
        cursor: [{ at: 0.4, x: 0.5, y: 0.6 }, { at: 1.4, x: 0.354, y: 0.457, click: true }], spots: [{ at: 1.6, x: 0.34, y: 0.44, w: 0.32, h: 0.05, label: 'four files from one edit', below: true }],
        cap: 'four files. <em>one click.</em>' },
      { type: 'statement', beats: 6, lines: ['Reframed to fit.', 'Subject-aware.'], grad: [1] },
      END('Presets for every platform, no watermark on any tier. ' + PRICE_LINE, '#youtubeshorts', '#reels'),
    ],
  },
  {
    id: '11-every-device', title: 'Phone, tablet, laptop, one licence', music: 'house-126-24s',
    scenes: [
      { type: 'hook', beats: 8, lines: ['PHONE.', 'TABLET.', 'LAPTOP.', 'ONE LICENCE.'], mint: [3], stagger: 0.3, size: 'lg' },
      { type: 'app', beats: 12, shot: 'phone', frame: 'phone', tag: 'on your phone', view: hold(V.whole, 0, 5), cap: 'the same editor. <em>on your phone.</em>' },
      { type: 'app', beats: 8, shot: 'editor', box: 'wide', tag: 'on your desk', view: hold(V.whole, 0, 4), cap: 'and on your desk. <i>same project.</i>' },
      { type: 'statement', beats: 6, lines: ['Buy once.', 'Sign in anywhere.'], grad: [1] },
      END('One licence for every device you own. ' + PRICE_LINE, '#mobileediting', '#editingapp'),
    ],
  },
  {
    id: '12-auto-captions', title: 'Captions that look good', music: 'trap-140-24s',
    scenes: [
      /* Not "auto captions". With no key configured the app finds every phrase
         of speech and lays out a styled, timed caption for each one, and you
         type the words — which is what captions.js says on the button, in those
         words. A promo that claims the half the app deliberately does not claim
         is the exact thing that gets a small app called a scam. */
      { type: 'hook', beats: 8, lines: ['CAPTIONS', 'TIMED TO', 'THE WORD.'], grad: [2] },
      { type: 'app', beats: 14, shot: 'panel-captions', box: 'tall', tag: 'the captions panel', view: hold(V.panel, 0, 6),
        cursor: [{ at: 0.5, x: 0.16, y: 0.25 }, { at: 1.4, x: 0.13, y: 0.171, click: true }], spots: [{ at: 1.6, x: 0.046, y: 0.152, w: 0.17, h: 0.04, label: 'one click', below: true }],
        caps: [[0, 'one click. <em>it finds every phrase.</em>'], [7, 'styled for TikTok. <em>timed to the word.</em>']] },
      { type: 'statement', beats: 6, lines: ['Sound off?', 'Still watched.'], grad: [1] },
      { type: 'end', beats: 12, line: 'Caption timing and styles are in Creator. ' + PRICE_LINE, tags: tags('#captions', '#accessibility') },
    ],
  },
  {
    id: '13-motion-tracking', title: 'Track anything', music: 'dnb-174-24s',
    scenes: [
      { type: 'hook', beats: 10, lines: ['TRACK', 'ANYTHING.', 'STICK TEXT TO IT.'], grad: [1] },
      { type: 'app', beats: 14, shot: 'editor', box: 'wide', tag: 'motion tracking', view: [...hold(V.viewer, 0, 1), { at: 2.2, cx: 0.51, cy: 0.3, w: 0.35 }],
        spots: [{ at: 1.2, x: 0.53, y: 0.26, w: 0.06, h: 0.11, label: 'tracked' }], cap: 'built in. <em>no plugin.</em>' },
      { type: 'list', beats: 14, title: 'things that follow the track', items: TRACK_ITEMS, big: true, stepBeats: 0.75, cap: 'pin it once. <i>forget it.</i>' },
      { type: 'statement', beats: 6, lines: ['Pin it.', 'Forget it.'], grad: [1] },
      { type: 'end', beats: 14, line: 'Motion tracking is in Creator. ' + PRICE_LINE, tags: tags('#motiontracking', '#vfx') },
    ],
  },
  {
    id: '14-colour', title: 'Real colour tools', music: 'cinematic-90-24s',
    scenes: [
      { type: 'hook', beats: 6, lines: ['REAL', 'COLOUR TOOLS.'], grad: [1], sub: 'wheels · curves · scopes · LUTs' },
      { type: 'wipe', beats: 6, shot: 'sunset', labels: ['flat', 'graded'], cap: 'three-way wheels. <em>real scopes.</em>' },
      { type: 'app', beats: 8, shot: 'panel-color', box: 'tall', tag: 'the colour page', view: hold(V.panel, 0, 6),
        spots: [{ at: 0.5, x: 0.046, y: 0.09, w: 0.17, h: 0.16, label: 'RGB parade', below: true }], cap: 'waveform. vectorscope. parade. <i>like the big apps.</i>' },
      { type: 'end', beats: 10, line: 'Wheels, curves and scopes in Creator. ' + PRICE_LINE, tags: tags('#colorgrading', '#cinematic') },
    ],
  },
  {
    id: '15-audio-repair', title: 'Bad audio, fixed', music: 'lofi-84-24s',
    scenes: [
      { type: 'hook', beats: 6, lines: ['BAD AUDIO?', 'FIXED.', 'ONE CLICK.'], mint: [1] },
      { type: 'list', beats: 8, title: 'audio repair', items: AUDIO_ITEMS, stepBeats: 0.5, cap: 'noise. hum. clicks. <em>gone.</em>' },
      { type: 'app', beats: 6, shot: 'panel-audio', box: 'tall', tag: 'the audio panel', view: hold(V.panel, 0, 5),
        spots: [{ at: 0.4, x: 0.046, y: 0.565, w: 0.17, h: 0.035, label: 'repair the audio' }], cursor: [{ at: 0.6, x: 0.16, y: 0.5 }, { at: 1.4, x: 0.13, y: 0.58, click: true }],
        cap: 'a studio chain. <i>EQ, dynamics, loudness.</i>' },
      { type: 'end', beats: 8, line: 'Audio repair and a real mix chain in Creator. ' + PRICE_LINE, tags: tags('#audioediting', '#podcast') },
    ],
  },
  {
    id: '16-speed-ramps', title: 'Speed ramps without the headache', music: 'phonk-132-24s',
    scenes: [
      { type: 'hook', beats: 8, lines: ['SPEED RAMPS', 'WITHOUT THE', 'HEADACHE.'], grad: [0] },
      { type: 'app', beats: 12, shot: 'editor', box: 'wide', tag: 'the timeline', view: hold({ cx: 0.3, cy: 0.72, w: 0.34 }, 0, 6),
        cursor: [{ at: 0.4, x: 0.36, y: 0.75 }, { at: 1.3, x: 0.2, y: 0.72, click: true }, { at: 2.6, x: 0.27, y: 0.72 }], spots: [{ at: 1.5, x: 0.135, y: 0.69, w: 0.165, h: 0.058, label: '100% → 30% → 100%' }],
        cap: 'drag the curve. <em>bezier eased.</em>' },
      { type: 'list', beats: 10, title: 'time tools', items: TIME_ITEMS, big: true, stepBeats: 0.5, cap: 'every keyframe, <i>eased.</i>' },
      { type: 'statement', beats: 4, lines: ['Smooth by default.'], grad: [0] },
      END('Speed ramps and keyframes with bezier easing in Creator. ' + PRICE_LINE, '#speedramp', '#velocityedit'),
    ],
  },
  {
    id: '17-montage-styles', title: '21 montage styles', music: 'hype-150-24s',
    scenes: [
      { type: 'hook', beats: 8, lines: ['21 MONTAGE', 'STYLES.', 'CLIPS IN. EDIT OUT.'], grad: [1] },
      { type: 'list', beats: 14, count: 21, title: 'kinds of montage', items: MONTAGE_ITEMS, stepBeats: 0.5, cap: 'pick a style. <em>it builds the whole edit.</em>' },
      { type: 'app', beats: 10, shot: 'panel-templates', box: 'tall', tag: 'the styles panel', view: hold(V.panel, 0, 4),
        cursor: [{ at: 0.5, x: 0.16, y: 0.3 }, { at: 1.4, x: 0.13, y: 0.4, click: true }], spots: [{ at: 0.2, x: 0.046, y: 0.08, w: 0.17, h: 0.075, label: 'beat detected' }],
        cap: 'cuts, ramps, slams, title. <i>to your music.</i>' },
      { type: 'statement', beats: 6, lines: ['A finished edit.', 'Not a filter.'], grad: [0] },
      END('Montages, styles and the AI editor are in Creator. ' + PRICE_LINE, '#montage', '#amv'),
    ],
  },
  {
    id: '18-free-forever', title: 'Free forever, no watermark', music: 'house-126-24s',
    scenes: [
      { type: 'hook', beats: 8, lines: ['FREE.', 'FOREVER.', 'NO WATERMARK.'], mint: [2] },
      { type: 'list', beats: 12, title: 'in the free version', items: FREE_ITEMS, stepBeats: 0.6, cap: 'not a trial. <em>the free one.</em>' },
      { type: 'app', beats: 8, shot: 'editor', box: 'wide', tag: 'starter', view: [...hold(V.whole, 0, 1.4), { at: 3, ...V.timeline }], cap: 'this is the free one. <i>seriously.</i>' },
      { type: 'statement', beats: 6, lines: ['Upgrade once.', 'If you ever want to.'], grad: [0] },
      END('Starter is free forever. Creator is <b>$19.99 once</b>. No trial, no watermark.', '#freeapp', '#capcutalternative'),
    ],
  },
  {
    id: '19-daily-updates', title: 'You pay once, it keeps getting better', music: 'trap-140-24s',
    scenes: [
      { type: 'hook', beats: 8, lines: ['YOU PAY ONCE.', 'YOU GET EVERYTHING', 'THAT COMES AFTER.'], grad: [2] },
      { type: 'list', beats: 14, title: 'added since launch', items: UPDATE_ITEMS, stepBeats: 0.6, cap: 'all of it free. <em>no version 2.</em>' },
      { type: 'app', beats: 8, shot: 'editor', box: 'wide', tag: 'today\'s build', view: [...hold(V.whole, 0, 1.4), { at: 3, ...V.viewer }], cap: 'the app updates itself. <i>nothing to reinstall.</i>' },
      { type: 'statement', beats: 6, lines: ['No version 2.', 'No upgrade fee.'], grad: [1] },
      { type: 'end', beats: 12, line: 'Every update free, forever. <b>$19.99 once.</b> That is the whole deal.', tags: tags('#indieapp', '#buildinpublic') },
    ],
  },
  {
    id: '20-vs-subscriptions', title: 'What $19.99 gets you', music: 'drill-142-24s',
    scenes: [
      { type: 'hook', beats: 8, lines: ['WHAT $19.99', 'GETS YOU', 'HERE VS THERE.'], grad: [0] },
      { type: 'price', beats: 14, other: { name: 'a subscription editor', price: 22.99, years: 5, note: 'and you still own nothing' }, ours: { checks: ['You own it', 'Every device', 'Every update'] }, cap: 'five years: <em>$1,379</em> vs <em>$19.99</em>' },
      { type: 'app', beats: 10, shot: 'panel-effects', box: 'tall', tag: 'what\'s inside', view: [...hold(V.panel, 0, 1.5), { at: 3, ...V.panelTop }], cap: '340 effects. <i>included.</i>' },
      { type: 'statement', beats: 6, lines: ['Own your editor.'], grad: [0] },
      END('Own it for <b>$19.99 once</b>. Free version forever.', '#subscriptionfatigue', '#onetimepurchase'),
    ],
  },
  {
    id: '21-cant-do', title: "Everything it can't do", music: 'lofi-84-24s',
    scenes: [
      { type: 'hook', beats: 6, lines: ['EVERYTHING', 'MY VIDEO EDITOR', "CAN'T DO."], size: 'lg', grad: [2] },
      { type: 'statement', beats: 4, lines: ['A features list is an advert.', 'This one is not.'], grad: [1] },
      { type: 'list', beats: 12, title: "the honest list", items: CANT_ITEMS, stepBeats: 0.75, cap: 'all of it is on the site. <em>before you pay.</em>' },
      { type: 'app', beats: 6, shot: 'editor', box: 'wide', tag: 'everything else works', view: [...hold(V.whole, 0, 1.2), { at: 2.6, ...V.timeline }], cap: 'the rest of it <i>does work.</i>' },
      { type: 'statement', beats: 4, lines: ['Free version.', 'Find out yourself.'], grad: [1] },
      { type: 'end', beats: 8, line: 'The full list is at <b>omnidx.net/studio/trust</b>. Free to start, <b>$19.99 once</b>.', tags: tags('#honestreview', '#buildinpublic'), bio: 'omnidx.net' },
    ],
  },
  /*
   * The two that get a reaction in the first second.
   *
   * Both moments are the app's real output rather than a mock-up: the wipe is
   * a frame of the table clip and the same frame after erase.js filled the can
   * out of it, and the waveform scene is drawn from audio-repair.json, which is
   * written by running the app's audio-repair pass over a deliberately awful
   * recording. So the numbers on screen are measurements.
   *
   * The audio half is deliberately not called AI. It is spectral subtraction,
   * notch filters, de-click and RMS levelling — real signal processing, and
   * naming it after a fashion instead of after what it does is the exact move
   * PROMOTION.md says gets an unknown app called a scam. "Hum, hiss, clicks,
   * level — gone in one pass" is both true and a better line.
   */
  {
    id: '22-instant-wow', title: 'Tap it, it is gone. Then fix the sound.', music: 'trap-140-24s',
    scenes: [
      { type: 'hook', beats: 6, lines: ['TWO BUTTONS', 'THAT LOOK LIKE', 'A CHEAT CODE.'], grad: [2] },
      { type: 'wipe', beats: 11, pair: 'erase', labels: ['the shot', 'the can, gone'],
        tap: { x: 0.199, y: 0.56, at: 0.85, label: 'tap the can' },
        cap: 'tap the thing. <em>it is gone.</em>' },
      { type: 'app', beats: 7, shot: 'panel-erase', box: 'wide', tag: 'one tap, in the app',
        view: [...hold({ cx: 0.5, cy: 0.31, w: 0.5 }, 0, 1.4), { at: 2.9, cx: 0.42, cy: 0.33, w: 0.3 }],
        cap: 'it follows the thing <i>through the whole shot.</i>' },
      { type: 'statement', beats: 3, lines: ['Now the sound.'], mint: [0] },
      { type: 'sound', beats: 13, labels: ['straight off the phone', 'after one pass'],
        chips: ['60Hz hum', 'hiss', 'clicks', 'wandering level'],
        cap: 'hum, hiss, clicks, level. <em>one pass.</em>' },
      { type: 'app', beats: 6, shot: 'panel-audio', box: 'tall', tag: 'the audio panel',
        view: [...hold({ cx: 0.13, cy: 0.42, w: 0.32 }, 0, 0.8), { at: 2.4, cx: 0.13, cy: 0.52, w: 0.26 }],
        spots: [{ at: 0.6, x: 0.046, y: 0.565, w: 0.17, h: 0.035, label: 'repair the audio' }],
        cap: 'then EQ, dynamics, <i>loudness to spec.</i>' },
      { type: 'end', beats: 7, line: 'Both are in Creator. Free to start, <b>$19.99 once</b>, no subscription.',
        tags: tags('#objectremoval', '#audiorepair'), bio: 'omnidx.net' },
    ],
  },

  /* ===================================================================== *
   * The narrated tours: no music, a voice, and a mark in the corner.
   *
   * A different shape from everything above. Those are twenty seconds of cuts
   * on a beat; these are a minute of somebody showing you the thing and
   * telling you what it is, which is what people actually watch to the end of
   * when they are deciding whether to try software.
   *
   * Every scene has a `say`. voice.mjs speaks each one, measures it, and the
   * scene holds for exactly that long — so the picture never arrives early or
   * outstays the sentence. `cap` is the same line cut down for sound-off
   * viewers, which is most of them.
   *
   * The rules the copy follows are docs/PROMOTION.md §3: no number that is not
   * on the pricing page, nothing about transcription, and the audio repair is
   * never called AI.
   * ===================================================================== */
  {
    id: 'tour-01-what-it-is', title: 'The tour: what it actually is', voice: true, wm: 'corner', formats: ['tiktok'],
    scenes: [
      { type: 'hook', size: 'lg', lines: ['A VIDEO EDITOR', 'YOU BUY ONCE.'], grad: [1],
        say: 'This is a full video editor that runs in your browser. You buy it once. Let me show you what is actually in it.',
        cap: 'a full editor. <em>bought once.</em>' },
      { type: 'app', shot: 'editor', box: 'wide', tag: 'the editor', view: [...hold(V.whole, 0, 2), { at: 4.5, ...V.timeline }],
        /* The razor and Split are in the toolbar, which is only on screen while
           the view is still wide; the clips are what is left once it has zoomed
           into the timeline. Hence the order. */
        cursor: [{ at: 0.7, x: 0.5, y: 0.35 }, { at: 1.2, on: 'razor' }, { at: 1.55, on: 'razor', click: true },
          { at: 2.0, on: 'split' }, { at: 2.4, on: 'split', click: true },
          { at: 4.6, on: 'clip3' }, { at: 5.4, on: 'clip3', click: true }, { at: 6.8, on: 'clip2' }],
        say: 'Unlimited video and audio tracks. Trim, ripple, roll, slip and razor, the same tools a desktop editor gives you.',
        cap: 'unlimited tracks. <i>every trim mode.</i>' },
      { type: 'app', shot: 'editor', box: 'wide', tag: 'the viewer', view: [...hold({ cx: 0.51, cy: 0.30, w: 0.72 }, 0, 1.6), { at: 4, cx: 0.51, cy: 0.36, w: 0.5 }],
        say: 'It plays back at sixty frames a second with the effects on, so what you see while you cut is what you get when you export.',
        cap: '60fps playback, <em>effects on</em>' },
      { type: 'app', shot: 'panel-effects', box: 'tall', tag: 'effects', view: [...hold(V.panel, 0, 1.8), { at: 4, ...V.panelTop }],
        cursor: [{ at: 1.0, x: 0.2, y: 0.12 }, { at: 1.9, on: 'search' }, { at: 2.35, on: 'search', click: true },
          { at: 4.2, on: 'preset' }, { at: 5.0, on: 'preset', click: true }],
        say: 'Three hundred and forty effects are built in. No plugins to buy, no packs, and every one previews on your own clip before you commit.',
        cap: '340 effects. <em>no packs to buy.</em>' },
      { type: 'app', shot: 'panel-color', box: 'tall', tag: 'colour', view: hold(V.panel, 0, 4), spotBelow: true,
        /* The label clears before the cursor gets there: the pointer on a mint
           pill is a pointer nobody can see. */
        spots: [{ at: 1.1, until: 3.8, on: 'scope', label: 'waveform · vectorscope · parade' }],
        cursor: [{ at: 3.4, x: 0.22, y: 0.46 }, { at: 4.4, on: 'looks' }, { at: 4.9, on: 'looks', click: true }],
        say: 'The colour page has three way wheels, curves, LUTs and real scopes. A waveform, a vectorscope and an R G B parade.',
        cap: 'wheels, curves, <i>real scopes</i>' },
      { type: 'app', shot: 'panel-audio-chain', box: 'tall', tag: 'audio', view: [...hold({ cx: 0.13, cy: 0.44, w: 0.31 }, 0, 1.5), { at: 4, cx: 0.13, cy: 0.5, w: 0.26 }],
        cursor: [{ at: 1.2, x: 0.22, y: 0.32 }, { at: 2.2, on: 'filters' }, { at: 2.7, on: 'filters', click: true },
          { at: 4.6, on: 'strip' }, { at: 5.3, on: 'strip', click: true }, { at: 6.6, on: 'loudness' }],
        say: 'The sound side is a proper chain. E Q, dynamics, ducking under a voice, and loudness set to whatever the platform wants.',
        cap: 'EQ, dynamics, <i>loudness to spec</i>' },
      { type: 'app', shot: 'export', box: 'wide', tag: 'export', view: hold(V.dialog, 0, 4),
        cursor: [{ at: 1.0, x: 0.42, y: 0.36 }, { at: 2.0, on: 'preset' }, { at: 2.5, on: 'preset', click: true },
          { at: 4.0, on: 'all' }, { at: 4.7, on: 'all', click: true },
          { at: 6.4, on: 'go' }, { at: 7.1, on: 'go', click: true }],
        spots: [{ at: 4.95, until: 6.2, on: 'all', label: 'every platform, one render' }],
        say: 'One edit goes out to TikTok, YouTube, Reels and Shorts at the same time, each one reframed to fit, with no watermark on any of them.',
        cap: 'one edit → <em>four platforms</em>' },
      { type: 'statement', lines: ['Free to start.', 'No account.'], mint: [0],
        say: 'The free version asks you for nothing. No account, no email, no card, no download. Open the link and start cutting.',
        cap: 'no account. no card. <em>open it and cut.</em>' },
      { type: 'end', dur: 5.2, line: 'Free to start. <b>$19.99 once</b> for everything in Creator.', tags: tags5('#videoediting', '#videoeditor', '#nosubscription', '#capcutalternative'), bio: 'omnidx.net',
        say: 'It is at Omni D X dot net. Free to start, nineteen ninety nine once for everything.' },
    ],
  },
  {
    id: 'tour-02-the-ai', title: 'The tour: the AI, and the two tricks', voice: true, wm: 'corner', formats: ['tiktok'],
    scenes: [
      { type: 'hook', size: 'lg', lines: ['I TYPED', 'ONE SENTENCE.'], grad: [1],
        say: 'I typed one sentence into this editor and it built the whole thing. Here is exactly what it did.',
        cap: 'one sentence. <em>a whole edit.</em>' },
      { type: 'typing', prompt: AI_PROMPT, steps: AI_STEPS,
        say: 'You describe the edit you want. It plans every cut, every speed ramp, every effect, and shows you the list before it touches your timeline.',
        cap: 'it plans it. <em>you approve it.</em>' },
      { type: 'app', shot: 'panel-ai-plan', box: 'tall', tag: 'the plan', view: hold({ cx: 0.13, cy: 0.3, w: 0.32 }, 0, 4),
        /* Clearing two of its own steps, which is the claim: the plan is a list
           you edit, not a thing that happens to your timeline. */
        cursor: [{ at: 0.9, x: 0.22, y: 0.1 }, { at: 1.8, on: 'step2' }, { at: 2.4, on: 'step2', click: true },
          { at: 3.9, on: 'step3' }, { at: 4.5, on: 'step3', click: true }],
        say: 'Every step lands on the timeline as something you can drag, change or undo. Nothing is applied that you cannot see.',
        cap: 'every step is <i>yours to change</i>' },
      { type: 'app', shot: 'panel-ai', box: 'tall', tag: 'on your device', view: hold({ cx: 0.13, cy: 0.3, w: 0.32 }, 0, 3.5),
        cursor: [{ at: 0.8, x: 0.21, y: 0.12 }, { at: 1.8, on: 'prompt' }, { at: 2.3, on: 'prompt', click: true },
          { at: 3.6, on: 'plan' }, { at: 4.2, on: 'plan', click: true }],
        say: 'It runs on your device. Your footage is not uploaded anywhere, and it works with the wifi switched off.',
        cap: 'runs on your device. <em>nothing uploads.</em>' },
      { type: 'wipe', pair: 'erase', labels: ['the shot', 'the can, gone'], tap: { x: 0.199, y: 0.56, at: 1.1, label: 'tap the can' },
        say: 'Then there is this. Tap the thing you want gone and it is gone, followed through the whole shot, with the background filled in behind it.',
        cap: 'tap it. <em>it is gone.</em>' },
      { type: 'sound', labels: ['straight off the phone', 'after one pass'], chips: ['60Hz hum', 'hiss', 'clicks', 'wandering level'],
        say: 'And the sound. One pass takes out the mains hum, drops the hiss, repairs the clicks and evens out a level that wanders.',
        cap: 'hum, hiss, clicks, level. <em>one pass.</em>' },
      { type: 'statement', lines: ['Not a demo.', 'That is the app.'], grad: [0],
        say: 'None of that is a mock up. That is the app, on a phone or a laptop, from a link.',
        cap: 'that is the app. <i>from a link.</i>' },
      { type: 'end', dur: 5.2, line: 'The AI editor, object removal and audio repair are in Creator. <b>$19.99 once</b>.', tags: tags5('#aivideoediting', '#videoeditor', '#objectremoval', '#nosubscription'), bio: 'omnidx.net',
        say: 'Omni D X dot net. Free to start, nineteen ninety nine once.' },
    ],
  },
  {
    id: 'tour-03-whats-included', title: 'The tour: everything included', voice: true, wm: 'corner', formats: ['tiktok'],
    scenes: [
      { type: 'hook', size: 'lg', lines: ['EVERYTHING', 'IS INCLUDED.'], mint: [1],
        say: 'Here is everything you get for one payment, with nothing else to buy afterwards. I will count it out.',
        cap: 'one payment. <em>nothing else to buy.</em>' },
      { type: 'list', count: 340, title: 'effects', items: EFFECT_ITEMS.slice(0, 14), stepBeats: 0.5,
        say: 'Three hundred and forty effects. Motion blur, R G B split, glow, speed lines, particles, light leaks, the lot.',
        cap: '340 effects, <em>all included</em>' },
      { type: 'list', title: 'music, written by the app', items: MUSIC_ITEMS, stepBeats: 0.5,
        say: 'Five hundred and forty four music tracks, and the app writes every one of them on your device. Nothing to licence, and nothing that gets claimed or muted when you upload.',
        cap: '544 tracks. <em>never claimed.</em>' },
      { type: 'app', shot: 'panel-sound', box: 'tall', tag: 'the music library', view: hold(V.panel, 0, 4),
        /* Ten seconds of line, so the cursor gets to do the whole search: type,
           narrow by genre, narrow by mood, add the track. */
        cursor: [{ at: 1.0, x: 0.22, y: 0.1 }, { at: 2.0, on: 'search' }, { at: 2.5, on: 'search', click: true },
          { at: 4.0, on: 'family' }, { at: 4.6, on: 'family', click: true },
          { at: 6.0, on: 'mood' }, { at: 6.6, on: 'mood', click: true },
          { at: 8.2, on: 'add' }, { at: 8.9, on: 'add', click: true }],
        say: 'Search them by style, mood or tempo. Rap, drill, R and B, afrobeats, house, lo-fi. Or bring your own song in from a file.',
        cap: 'search by style, mood, tempo' },
      { type: 'list', title: 'text animators', items: ANIMATOR_ITEMS.slice(0, 10), stepBeats: 0.45,
        say: 'Forty nine text styles with animators that run per character. Typewriter, rise, blur in, bounce on the beat.',
        cap: '49 styles, <i>per character</i>' },
      { type: 'list', big: true, title: 'expressions', items: EXPRESSION_ITEMS, stepBeats: 0.4,
        say: 'After Effects style expressions, one click each. Wiggle, loop, react to the music, settle with inertia.',
        cap: 'expressions, <em>one click each</em>' },
      { type: 'list', title: 'export presets', items: PLATFORM_ITEMS, stepBeats: 0.5,
        say: 'Export presets for every platform with the safe zones built in, up to four K at sixty, and no watermark on any tier including the free one.',
        cap: '4K 60. <em>no watermark, ever.</em>' },
      { type: 'price', ours: { checks: ['No subscription. Ever.', 'Every update free, forever.', 'Every device you own.'] },
        say: 'All of it for nineteen ninety nine, once. Not a month. Once.',
        cap: '$19.99. <em>once.</em>' },
      { type: 'end', dur: 5.2, line: 'Everything above is in Creator, <b>$19.99 once</b>. Free version forever.', tags: tags5('#videoeditor', '#contentcreator', '#onetimepurchase', '#editingapp'), bio: 'omnidx.net',
        say: 'Omni D X dot net. There is a free version and it never expires.' },
    ],
  },
  {
    id: 'tour-04-no-subscription', title: 'The tour: why there is no subscription', voice: true, wm: 'corner', formats: ['tiktok'],
    scenes: [
      { type: 'hook', size: 'lg', lines: ['THERE IS NO', 'SUBSCRIPTION.'], grad: [1],
        say: 'There is no subscription. Not a cheap one, not a hidden one. I want to explain exactly how this is priced, because you should be suspicious.',
        cap: 'no subscription. <em>at all.</em>' },
      { type: 'price', other: { name: 'a subscription editor', price: 22.99, years: 5, note: 'and you still own nothing' }, ours: { checks: ['You own it', 'Every device', 'Every update'] },
        say: 'Five years of a subscription editor is about thirteen hundred dollars, and at the end of it you own nothing. This is nineteen ninety nine, once.',
        cap: 'five years: <em>$1,379</em> vs <em>$19.99</em>' },
      { type: 'list', title: 'in the free version', items: FREE_ITEMS, stepBeats: 0.5,
        say: 'The free version is not a trial. Unlimited tracks, seventy eight effects, titles, ten eighty p export, and no watermark. It does not expire.',
        cap: 'not a trial. <em>the free one.</em>' },
      { type: 'statement', lines: ['Every update free.', 'No version 2.'], mint: [0],
        say: 'Every update after you buy it is free, forever. There is no version two and no upgrade fee. That is a promise about what I will never charge you for.',
        cap: 'every update free. <i>no version 2.</i>' },
      { type: 'list', title: "what it can't do", items: CANT_ITEMS, stepBeats: 0.55,
        say: 'And here is what it cannot do, because a feature list is an advert. No stabilisation. No generative video. Captions do not type the words for you yet.',
        cap: 'the honest list. <em>before you pay.</em>' },
      { type: 'app', shot: 'editor', box: 'wide', tag: 'check it yourself', view: [...hold(V.whole, 0, 1.6), { at: 4, ...V.timeline }],
        cursor: [{ at: 0.6, x: 0.5, y: 0.3 }, { at: 1.3, on: 'razor' }, { at: 1.7, on: 'razor', click: true },
          { at: 3.8, on: 'clip3' }, { at: 4.5, on: 'clip3', click: true }, { at: 5.7, on: 'clip2' }],
        say: 'You do not have to believe any of this. Open it, turn your wifi off, and keep editing. Then decide.',
        cap: 'turn your wifi off. <em>keep editing.</em>' },
      { type: 'end', dur: 5.6, line: 'Everything it can\'t do is at <b>omnidx.net/studio/trust</b>. Free to start, <b>$19.99 once</b>.', tags: tags5('#nosubscription', '#onetimepurchase', '#videoeditor', '#honestreview'), bio: 'omnidx.net',
        say: 'The full list is on the site at Omni D X dot net, before you pay rather than after.' },
    ],
  },

  /* =============== the YouTube showcase: every feature, 80 seconds =============== */
  {
    id: 'yt-showcase', title: 'OmniDx Studio — the full tour', music: 'hype-150-100s', formats: ['yt'],
    scenes: [
      { type: 'hook', beats: 8, lines: ['A VIDEO EDITOR', 'YOU BUY ONCE.'], grad: [1], sub: 'omnidx.net · free to start · <b>$19.99 once</b> for everything in Creator' },
      { type: 'statement', beats: 6, lines: ['No subscription.', 'No watermark.', 'No upload.'], grad: [0] },
      { type: 'app', beats: 12, shot: 'editor', tag: 'the editor', view: [...hold(V.whole, 0, 2), { at: 3.4, ...V.timeline }, { at: 4.4, ...V.timeline }], caps: [[0, 'a full editor, <em>in the browser</em> or installed'], [6, 'trim, ripple, roll, slip, razor. <i>unlimited tracks.</i>']] },
      { type: 'typing', beats: 16, prompt: AI_PROMPT, steps: AI_STEPS, caps: [[0, 'the AI editor: <em>say what you want</em>'], [9, 'it plans every cut. <em>you approve.</em>']] },
      { type: 'app', beats: 8, shot: 'panel-ai', tag: 'the AI panel', view: hold({ cx: 0.13, cy: 0.3, w: 0.32 }, 0, 4), cursor: [{ at: 0.3, x: 0.16, y: 0.24 }, { at: 1.2, x: 0.13, y: 0.34, click: true }], cap: 'runs on your device. <i>nothing uploads.</i>' },
      { type: 'timeline', beats: 12, every: 2, note: '🥁 Sync to the music', cap: 'beat-synced cutting: <em>every cut on the beat</em>' },
      { type: 'app', beats: 10, shot: 'panel-effects', tag: 'effects', view: hold({ cx: 0.13, cy: 0.3, w: 0.32 }, 0, 5), cursor: [{ at: 0.4, x: 0.15, y: 0.2 }, { at: 1.3, x: 0.095, y: 0.27, click: true }], cap: '340 effects, <em>live on the clip</em>' },
      { type: 'list', beats: 12, count: 340, title: 'effects', items: EFFECT_ITEMS.slice(0, 16), stepBeats: 0.5, cap: 'motion blur to particles. <em>all included.</em>' },
      { type: 'app', beats: 8, shot: 'panel-text', tag: 'text', view: hold({ cx: 0.13, cy: 0.3, w: 0.32 }, 0, 4), cursor: [{ at: 0.4, x: 0.15, y: 0.2 }, { at: 1.2, x: 0.087, y: 0.107, click: true }], cap: '49 text styles and <em>per-character animators</em>' },
      { type: 'list', beats: 8, title: 'text animators', items: ANIMATOR_ITEMS, stepBeats: 0.4, cap: 'typewriter, rise, blur in, beat bounce…' },
      { type: 'app', beats: 8, shot: 'panel-shapes', tag: 'shape layers', view: hold({ cx: 0.13, cy: 0.3, w: 0.32 }, 0, 4), cap: 'shape layers with <em>trim paths and repeaters</em>' },
      { type: 'list', beats: 8, title: 'expressions', items: EXPRESSION_ITEMS, big: true, stepBeats: 0.4, cap: 'After Effects expressions, <em>one click each</em>' },
      { type: 'app', beats: 8, shot: 'panel-overlays', tag: 'overlays and particles', view: hold({ cx: 0.13, cy: 0.3, w: 0.32 }, 0, 4), cap: 'particles, leaks, flares, weather' },
      { type: 'wipe', beats: 8, shot: 'sunset', labels: ['flat', 'graded'], cap: 'colour wheels, curves, <em>real scopes</em>' },
      { type: 'app', beats: 6, shot: 'panel-color', tag: 'the colour page', view: hold({ cx: 0.13, cy: 0.3, w: 0.32 }, 0, 3), cap: 'waveform, vectorscope, RGB parade' },
      { type: 'app', beats: 8, shot: 'panel-audio', tag: 'audio', view: hold({ cx: 0.13, cy: 0.3, w: 0.32 }, 0, 4), cap: 'audio repair, EQ, dynamics, <em>loudness to spec</em>' },
      { type: 'app', beats: 10, shot: 'export', tag: 'export', view: hold(V.dialog, 0, 5), cursor: [{ at: 0.4, x: 0.5, y: 0.6 }, { at: 1.4, x: 0.354, y: 0.457, click: true }], cap: 'one edit, <em>four platforms</em>, reframed to fit' },
      { type: 'list', beats: 8, title: 'export presets', items: PLATFORM_ITEMS, stepBeats: 0.5, cap: 'safe zones included. <i>4K 60. ProRes on desktop.</i>' },
      { type: 'app', beats: 8, shot: 'phone', frame: 'phone', tag: 'on your phone', view: hold(V.whole, 0, 4), cap: 'the same editor <em>on your phone</em>, one licence' },
      { type: 'price', beats: 16, cap: 'one payment. <em>every update. every device.</em>' },
      { type: 'statement', beats: 8, lines: ['Free to start.', '$19.99 once.', 'Yours forever.'], grad: [1] },
      { type: 'end', beats: 12, line: 'Free to start. <b>$19.99 once</b> for everything in Creator, <b>$39.99</b> for Studio.', tags: tags('#onetimepurchase', '#capcutalternative'), bio: 'omnidx.net' },
    ],
  },

  /* ===================================================================
   * Four sets of three, each set a different shape, because twenty-six
   * videos in one register is one experiment run twenty-six times. The
   * short ones so far all open with a claim over a gradient; a feed that
   * has decided those are adverts will keep deciding it. These vary the
   * one thing that decision is made on — what the first second looks like.
   *
   *   n1..n3   the result first, in the platform's own idiom, no studio ground
   *   c1..c3   an objection asked the way people type it, and the answer
   *   h1..h3   how to do one thing, fast enough to be saved rather than watched
   *   e1..e3   one edit style, for the rooms that already care about it
   * =================================================================== */

  /* ---- n: silent proof. The thing happening, before anything is claimed. ---- */
  {
    id: 'n1-tap-it-gone', title: 'Native: tap it, it is gone', music: 'trap-140-24s',
    style: 'native', wm: 'corner', formats: ['tiktok'],
    scenes: [
      /* No hook. The first frame is the shot with the can still in it and a
         finger about to land on it — a title card here is the half second in
         which the feed decides this is an advert. */
      { type: 'wipe', beats: 14, pair: 'erase', labels: ['before', 'gone'],
        tap: { x: 0.199, y: 0.56, at: 1.0, label: 'tap it' }, cap: 'no mask. no keyframes.' },
      { type: 'app', beats: 10, shot: 'panel-erase', box: 'wide', tag: 'the eraser',
        view: [{ at: 0, on: 'remove', w: 0.62 }, { at: 4, on: 'remove', w: 0.44 }],
        cursor: [{ at: 0.8, x: 0.44, y: 0.5 }, { at: 1.8, on: 'remove' }, { at: 2.4, on: 'remove', click: true }],
        cap: 'it follows it through the whole clip' },
      { type: 'hook', beats: 8, size: 'lg', lines: ['omnidx.net'], grad: [0], sub: 'free version. no account.' },
    ],
  },
  {
    id: 'n2-bad-audio', title: 'Native: the sound, fixed', music: 'lofi-84-24s',
    style: 'native', wm: 'corner', formats: ['tiktok'],
    scenes: [
      { type: 'sound', beats: 12, labels: ['what the phone recorded', 'after one pass'],
        chips: ['60Hz hum', 'hiss', 'clicks', 'wandering level'], cap: 'same three seconds.' },
      { type: 'app', beats: 8, shot: 'panel-audio-chain', box: 'tall', tag: 'one pass',
        view: hold({ cx: 0.13, cy: 0.36, w: 0.3 }, 0, 4),
        cursor: [{ at: 0.7, x: 0.21, y: 0.3 }, { at: 1.7, on: 'repair' }, { at: 2.3, on: 'repair', click: true }],
        cap: 'hum, hiss, clicks, level' },
      { type: 'hook', beats: 6, size: 'lg', lines: ['omnidx.net'], grad: [0], sub: 'in the browser. nothing uploads.' },
    ],
  },
  {
    id: 'n3-its-a-phone', title: 'Native: the whole thing on a phone', music: 'house-126-24s',
    style: 'native', wm: 'corner', formats: ['tiktok'],
    scenes: [
      /* Full bleed, no frame around it: a screen recording arrives edge to edge,
         and a phone screenshot in a rounded rectangle arrives as a product shot. */
      { type: 'app', beats: 14, shot: 'phone', bleed: true, view: hold(V.whole, 0, 6),
        cap: 'this is the whole editor.' },
      { type: 'hook', beats: 8, size: 'lg', lines: ['NO APP STORE.', 'JUST A LINK.'], mint: [1] },
      { type: 'hook', beats: 6, size: 'lg', lines: ['omnidx.net'], grad: [0], sub: 'opens in the browser you already have.' },
    ],
  },

  /* ---- c: the reply. An objection, asked the way people type it. ---- */
  {
    id: 'c1-is-it-free', title: 'Reply: is it actually free', music: 'lofi-84-24s', wm: 'corner', formats: ['tiktok'],
    scenes: [
      { type: 'comment', beats: 8, who: 'a comment', q: '"free" like free trial free or actually free',
        a: ['actually free.', '<em>no account either.</em>'] },
      { type: 'list', beats: 10, title: 'in the free version', items: FREE_ITEMS, stepBeats: 0.38,
        cap: 'not a trial. <em>the free one.</em>' },
      { type: 'hook', beats: 6, lines: ['IT DOES NOT', 'EXPIRE.'], mint: [1] },
      { ...END5('Free to start. <b>$19.99 once</b> if you ever want the rest.', '#freeapp', '#capcutalternative', '#videoeditor', '#nosubscription'), beats: 6 },
    ],
  },
  {
    id: 'c2-whats-the-catch', title: 'Reply: what is the catch', music: 'cinematic-90-24s', wm: 'corner', formats: ['tiktok'],
    scenes: [
      { type: 'comment', beats: 8, who: 'a comment', q: 'ok so whats the catch',
        a: ['the catch is', '<i>the list of what it cannot do.</i>'] },
      { type: 'list', beats: 12, title: "what it can't do", items: CANT_ITEMS, stepBeats: 0.45,
        cap: 'the honest list. <em>before you pay.</em>' },
      { type: 'hook', beats: 6, lines: ['IT IS ON THE SITE.', 'BEFORE YOU PAY.'], grad: [1] },
      { ...END5('Everything it can\'t do is at <b>omnidx.net/studio/trust</b>.', '#honestreview', '#buildinpublic', '#videoeditor', '#nosubscription'), beats: 7 },
    ],
  },
  {
    id: 'c3-why-so-cheap', title: 'Reply: why is it that cheap', music: 'drill-142-24s', wm: 'corner', formats: ['tiktok'],
    scenes: [
      { type: 'comment', beats: 10, who: 'a comment', q: 'why is it 20 quid once when everyone else is 20 a month',
        a: ['because', '<i>a bill is not a feature.</i>'] },
      { type: 'price', beats: 16, cap: 'five years: <em>$1,379</em> vs <em>$19.99</em>' },
      { type: 'hook', beats: 8, lines: ['YOU OWN IT.', 'THAT IS THE WHOLE', 'DIFFERENCE.'], mint: [0] },
      END5('No subscription. ' + PRICE_LINE, '#nosubscription', '#onetimepurchase', '#videoeditor', '#editingapp'),
    ],
  },

  /* ---- h: how to do one thing. Saved, not watched. ---- */
  {
    id: 'h1-cut-to-the-beat', title: 'How to: cut to the beat', music: 'phonk-132-24s', wm: 'corner', formats: ['tiktok'],
    scenes: [
      { type: 'hook', beats: 6, size: 'lg', lines: ['CUT A WHOLE EDIT', 'TO THE BEAT.'], mint: [1], sub: 'fifteen seconds, no keyframes' },
      { type: 'app', beats: 10, shot: 'panel-audio', box: 'tall', tag: '1 · find the beat', view: hold({ cx: 0.13, cy: 0.42, w: 0.3 }, 0, 4),
        spots: [{ at: 0.6, until: 2.4, on: 'beats', label: '58 beats detected' }],
        cursor: [{ at: 2.6, x: 0.21, y: 0.36 }, { at: 3.4, on: 'cut' }, { at: 3.9, on: 'cut', click: true }],
        cap: 'it reads the track. <i>not a guess.</i>' },
      { type: 'timeline', beats: 14, every: 2, note: '2 · every cut on a beat', cap: 'drop the clips. <em>done.</em>' },
      { type: 'hook', beats: 6, lines: ['THAT IS IT.'], grad: [0], sub: 'free in every version' },
      END5('Beat-synced cutting is free. ' + PRICE_LINE, '#beatsync', '#montage', '#videoeditor', '#editingapp'),
    ],
  },
  {
    id: 'h2-remove-a-thing', title: 'How to: remove something', music: 'trap-140-24s', wm: 'corner', formats: ['tiktok'],
    scenes: [
      { type: 'hook', beats: 6, size: 'lg', lines: ['REMOVE ANYTHING', 'FROM A VIDEO.'], grad: [1], sub: 'no green screen, no pen tool' },
      { type: 'app', beats: 10, shot: 'panel-erase', box: 'wide', tag: '1 · tap the thing',
        view: [{ at: 0, on: 'msg', w: 0.6 }, { at: 4, on: 'remove', w: 0.44 }],
        cursor: [{ at: 1.0, x: 0.44, y: 0.5 }, { at: 2.0, on: 'remove' }, { at: 2.6, on: 'remove', click: true }],
        cap: 'tap it in the picture. <i>that is the selection.</i>' },
      { type: 'wipe', beats: 14, pair: 'erase', labels: ['before', 'after'],
        tap: { x: 0.199, y: 0.56, at: 0.8, label: '2 · remove it' }, cap: 'it is gone for the whole clip' },
      END5('Object removal is in Creator. ' + PRICE_LINE, '#objectremoval', '#vfx', '#videoeditor', '#editingapp'),
    ],
  },
  {
    id: 'h3-title-that-moves', title: 'How to: a title that types itself', music: 'hype-150-24s', wm: 'corner', formats: ['tiktok'],
    scenes: [
      { type: 'hook', beats: 6, size: 'lg', lines: ['A TITLE THAT', 'TYPES ITSELF.'], mint: [1], sub: 'one tap, per character' },
      { type: 'app', beats: 10, shot: 'panel-text', box: 'tall', tag: '1 · pick a style', view: [...hold(V.panel, 0, 2), { at: 4, ...V.panelTop }],
        cap: '49 styles. <i>all animated.</i>' },
      { type: 'list', beats: 14, title: 'animators', items: ANIMATOR_ITEMS, stepBeats: 0.45, cap: '2 · pick how it arrives' },
      { type: 'hook', beats: 6, lines: ['LETTER', 'BY LETTER.'], grad: [1] },
      END5('Text animators are in Creator. ' + PRICE_LINE, '#typography', '#kinetictypography', '#videoeditor', '#editingapp'),
    ],
  },

  /* ---- e: one edit style, for the rooms that already care about it. ----
     The step lists are the app's own planner output for that style, word for
     word, so anybody who opens it gets the video they were shown. */
  {
    id: 'e1-phonk', title: 'Style: phonk drift', music: 'phonk-132-24s', wm: 'corner', formats: ['tiktok'],
    scenes: [
      { type: 'hook', beats: 8, size: 'lg', lines: ['PHONK EDIT.', 'ONE BUTTON.'], mint: [1] },
      { type: 'app', beats: 10, shot: 'panel-styles-phonk', box: 'tall', tag: 'the styles panel', view: hold(V.panel, 0, 4),
        cursor: [{ at: 0.8, x: 0.21, y: 0.14 }, { at: 1.9, on: 'card' }, { at: 2.5, on: 'card', click: true }],
        cap: 'clips in. <em>edit out.</em>' },
      { type: 'list', beats: 16, title: 'what it builds', items: PHONK_STEPS, stepBeats: 0.5, cap: 'every one of these, on the beat' },
      { type: 'timeline', beats: 12, every: 1, note: '🥁 Drop — a cut every beat', cap: 'cut to your own track' },
      END5('21 montage styles, in Creator. ' + PRICE_LINE, '#phonk', '#driftedit', '#videoeditor', '#montage'),
    ],
  },
  {
    id: 'e2-anime', title: 'Style: anime opening', music: 'hype-150-24s', wm: 'corner', formats: ['tiktok'],
    scenes: [
      { type: 'hook', beats: 8, size: 'lg', lines: ['AMV OPENING.', 'SIX SECTIONS.'], grad: [1] },
      { type: 'app', beats: 10, shot: 'panel-styles-anime', box: 'tall', tag: 'the styles panel', view: hold(V.panel, 0, 4),
        cursor: [{ at: 0.8, x: 0.21, y: 0.14 }, { at: 1.9, on: 'card' }, { at: 2.5, on: 'card', click: true }],
        cap: 'intro → build → drop → breather → drop → outro' },
      { type: 'list', beats: 16, title: 'what it builds', items: ANIME_STEPS, stepBeats: 0.5, cap: 'impact frames on the big hits' },
      { type: 'timeline', beats: 12, every: 1, note: '⚡ Drop — a cut every beat', cap: 'it finds the drop itself' },
      END5('The anime opening is in Creator. ' + PRICE_LINE, '#amv', '#animeedit', '#videoeditor', '#montage'),
    ],
  },
  {
    id: 'e3-velocity', title: 'Style: velocity edit', music: 'dnb-174-24s', wm: 'corner', formats: ['tiktok'],
    scenes: [
      { type: 'hook', beats: 10, size: 'lg', lines: ['VELOCITY EDIT.', 'NO KEYFRAMES.'], mint: [1] },
      { type: 'app', beats: 12, shot: 'panel-styles-velocity', box: 'tall', tag: 'the styles panel', view: hold(V.panel, 0, 4),
        cursor: [{ at: 1.0, x: 0.21, y: 0.14 }, { at: 2.2, on: 'card' }, { at: 2.9, on: 'card', click: true }],
        cap: 'go → faster → land' },
      { type: 'list', beats: 20, title: 'what it builds', items: VELOCITY_STEPS, stepBeats: 0.45, cap: 'every ramp eased, automatically' },
      { type: 'timeline', beats: 14, every: 1, note: '💨 Faster — a cut every beat', cap: 'smooth by default' },
      END5('Speed ramping is in Creator. ' + PRICE_LINE, '#velocityedit', '#speedramp', '#videoeditor', '#editingapp'),
    ],
  },

  /* ===================================================================
   * The mog. Somebody else's cut list, our pictures.
   *
   * Built from a BMW edit the owner sent over: dissect.mjs measured it at one
   * six-second shot, thirty-one cuts in the nine seconds after it, and eight
   * two-frame impact flashes among them. Those exact times are the `cuts` below
   * — so the section lands where that track lands rather than where a guess put
   * it, and dropping the same trending sound on it in the app puts the hits back
   * where they were.
   *
   * Silent by design: the reference's audio is a commercial track and belongs to
   * whoever made it. Render with --silent and pick the sound in TikTok.
   * =================================================================== */
  {
    id: 'mog-01-subscription', title: 'The mog: what you were paying for', music: 'phonk-132-24s',
    wm: 'corner', formats: ['tiktok'],
    scenes: [
      /* Six seconds of one shot, exactly as long as the reference waits. The
         drop only hits because of how uncomfortable this got. */
      /*
       * The names, then the bill, then the frame is blown out of the way.
       *
       * Set in our own face and greyed: naming what people already pay for is
       * ordinary comparison, and no claim is made about any of them — no price,
       * no feature, nothing that could be wrong. The number underneath is about
       * subscription editors generally, which is the product's own position and
       * is on the pricing page.
       */
      { type: 'tension', dur: 6.1, per: 'what you are renting', names: ['CapCut', 'DaVinci', 'Adobe'],
        nameStep: 0.8, count: { to: 60, pre: 'MONTH' }, sub: 'and it still is not yours',
        cap: 'five years of renting an editor' },

      { type: 'drop', dur: 9.766, impactUnder: 0.12, noflash: true,
        cuts: [
      { at: 0.0, dur: 0.333 }, { at: 0.333, dur: 0.067 }, { at: 0.4, dur: 0.133 }, { at: 0.533, dur: 0.067 },
      { at: 0.6, dur: 0.133 }, { at: 0.733, dur: 0.067 }, { at: 0.8, dur: 0.333 }, { at: 1.133, dur: 0.767 },
      { at: 1.9, dur: 0.667 }, { at: 2.567, dur: 0.433 }, { at: 3.0, dur: 0.167 }, { at: 3.167, dur: 0.767 },
      { at: 3.933, dur: 0.067 }, { at: 4.0, dur: 0.067 }, { at: 4.067, dur: 0.267 }, { at: 4.333, dur: 0.067 },
      { at: 4.4, dur: 0.167 }, { at: 4.567, dur: 0.567 }, { at: 5.133, dur: 0.067 }, { at: 5.2, dur: 0.7 },
      { at: 5.9, dur: 0.533 }, { at: 6.433, dur: 0.2 }, { at: 6.633, dur: 0.133 }, { at: 6.767, dur: 0.333 },
      { at: 7.1, dur: 0.633 }, { at: 7.733, dur: 0.633 }, { at: 8.367, dur: 0.167 }, { at: 8.533, dur: 0.6 },
      { at: 9.133, dur: 0.067 }, { at: 9.2, dur: 0.333 }, { at: 9.533, dur: 0.233 },
        ],
        /*
         * Bright, dark, bright, dark, all the way down.
         *
         * The first build ran six panel screenshots back to back and the cuts
         * between them did not read as cuts — dissecting the render found six of
         * them missing, because two crops of the same dark chrome look like one
         * shot however hard the picture moves. The reference gets this for free
         * by alternating four wildly different cars; this has to do it on
         * purpose. Every other frame is footage or a phone, and the crop width
         * swings with it so the punch lands somewhere new each time.
         */
        frames: [
          /*
           * Thirty-one frames for thirty-one cuts, alternating lit and dark.
           *
           * Two separate problems solved by one list. The first: every
           * screenshot in this app is dark chrome — measured, the crops run 9 to
           * 86 mean luma out of 255 — so two consecutive panels can differ by
           * less than a scene detector's threshold however hard the picture
           * moves, and the first build lost six of these cuts that way. The
           * second: nineteen frames cycling over thirty-one cuts repeats twelve
           * of them, and the repeats are obvious because the labels come back
           * round. So: one frame per cut, ordered lit, dark, lit, dark, with the
           * grade pinned to whichever it already is — lit goes warm and
           * brighter, dark goes cool and darker. That puts every lit frame above
           * 40 and every dark one below 19, so the smallest gap between
           * consecutive cuts is 21 out of 255 wherever you look.
           *
           * An earlier pass alternated the grade on the cut *index* instead and
           * still lost five: with the list shorter than the cut list the same
           * picture came up warm on one pass and cool on the next, and two cuts
           * met in the middle. The tone belongs to the picture, not to the cut.
           *
           * verify.mjs re-measures all of it and fails under Δ8, so re-taking a
           * screenshot cannot quietly undo this.
           *
           * Only the five counts already established elsewhere in this file are
           * used as labels. The rest name the feature and no number, because a
           * number invented for a caption is a number somebody checks.
           *
           * The arrival goes first: the cut straight out of the blowout is the
           * mark, not a panel, taking the same punch as everything around it.
           */
          { mark: true },
          { shot: 'export', cx: 0.5, cy: 0.5, w: 0.44, tone: 'cool', label: 'every platform at once', push: 1.22 },
          { shot: 'panel-erase', cx: 0.51, cy: 0.42, w: 0.44, tone: 'warm', label: 'tap it. <em>gone.</em>', push: 1.3 },
          { shot: 'panel-sound', cx: 0.13, cy: 0.3, w: 0.28, tone: 'cool', label: '<em>544</em> tracks', push: 1.12 },
          { shot: 'phone', cx: 0.5, cy: 0.3, w: 0.6, tone: 'warm', label: 'it runs on your phone', push: 1.26 },
          { shot: 'panel-templates', cx: 0.13, cy: 0.33, w: 0.26, tone: 'cool', label: '<em>21</em> montages', push: 1.14 },
          { shot: 'panel-overlays', cx: 0.13, cy: 0.3, w: 0.26, tone: 'warm', label: 'particles', push: 1.17 },
          { shot: 'panel-ai-plan', cx: 0.13, cy: 0.2, w: 0.3, tone: 'cool', label: 'it plans the edit', push: 1.13 },
          { shot: 'editor', cx: 0.5, cy: 0.72, w: 0.38, tone: 'warm', label: 'unlimited tracks', push: 1.26 },
          { shot: 'panel-audio-chain', cx: 0.13, cy: 0.42, w: 0.28, tone: 'cool', label: 'EQ. dynamics. loudness.', push: 1.15 },
          { shot: 'panel-filters', cx: 0.13, cy: 0.3, w: 0.26, tone: 'warm', label: '<em>176</em> looks', push: 1.13 },
          { shot: 'panel-color', cx: 0.13, cy: 0.22, w: 0.26, tone: 'cool', label: 'real <em>scopes</em>', push: 1.16 },
          { shot: 'panel-transitions', cx: 0.13, cy: 0.5, w: 0.3, tone: 'warm', label: 'tracked transitions', push: 1.18 },
          { shot: 'panel-text', cx: 0.13, cy: 0.25, w: 0.28, tone: 'cool', label: '<em>49</em> text styles', push: 1.12 },
          { shot: 'editor', cx: 0.51, cy: 0.3, w: 0.52, tone: 'warm', label: '<em>60fps</em>, effects on', push: 1.28 },
          { shot: 'editor', cx: 0.5, cy: 0.5, w: 0.9, tone: 'cool', label: 'the whole editor', push: 1.24 },
          { shot: 'panel-erase', cx: 0.44, cy: 0.5, w: 0.3, tone: 'warm', label: 'no mask. no pen.', push: 1.32 },
          { shot: 'panel-styles-phonk', cx: 0.13, cy: 0.3, w: 0.26, tone: 'cool', label: 'phonk', push: 1.14 },
          { shot: 'panel-overlays', cx: 0.13, cy: 0.5, w: 0.3, tone: 'warm', label: 'light leaks', push: 1.16 },
          { shot: 'panel-captions', cx: 0.13, cy: 0.3, w: 0.26, tone: 'cool', label: 'captions, timed for you', push: 1.13 },
          { shot: 'phone', cx: 0.5, cy: 0.62, w: 0.55, tone: 'warm', label: 'same project, both', push: 1.3 },
          { shot: 'panel-shapes', cx: 0.13, cy: 0.5, w: 0.3, tone: 'cool', label: 'shape layers', push: 1.15 },
          { shot: 'panel-effects', cx: 0.13, cy: 0.33, w: 0.26, tone: 'warm', label: '<em>340</em> effects', push: 1.14 },
          { shot: 'panel-audio', cx: 0.13, cy: 0.35, w: 0.28, tone: 'cool', label: 'repair bad audio', push: 1.13 },
          { shot: 'panel-filters', cx: 0.13, cy: 0.55, w: 0.3, tone: 'warm', label: 'one tap, graded', push: 1.17 },
          { shot: 'panel-styles-anime', cx: 0.13, cy: 0.3, w: 0.26, tone: 'cool', label: 'anime opening', push: 1.14 },
          { shot: 'editor', cx: 0.5, cy: 0.5, w: 0.62, tone: 'warm', label: 'ripple. roll. slip.', push: 1.25 },
          { shot: 'start', cx: 0.5, cy: 0.4, w: 0.6, tone: 'cool', label: 'opens in a browser', push: 1.2 },
          { shot: 'panel-stickers', cx: 0.13, cy: 0.3, w: 0.26, tone: 'warm', label: 'stickers that follow', push: 1.15 },
          { shot: 'panel-styles-velocity', cx: 0.13, cy: 0.3, w: 0.26, tone: 'cool', label: 'velocity', push: 1.14 },
          { shot: 'phone', cx: 0.5, cy: 0.42, w: 0.85, tone: 'warm', label: 'no watermark. <em>ever.</em>', push: 1.2 },
        ] },

      { type: 'slam', dur: 3.2, kick: '$19.99 once. no subscription. ever.', noflash: true },
    ],
  },

  /* ===================================================================
   * mog-02-rivals — the second rebuild, off a second edit the owner sent.
   *
   * dissect.mjs measured that one at 35.53s, 34 shots: one white saloon held
   * twelve seconds at a cut every 1.23s, then the picture desaturates and
   * MOGGED lands in red on white for a beat at 11.7s, then a hypercar takes
   * over at 12.367s and the cut rate doubles to 0.6s for nineteen seconds.
   * Those exact times are the two cut lists below.
   *
   * 0.6s a cut is 100 BPM on the beat; 1.233s is two beats at 97.3. The marks
   * pulse at 97.3 so the hold is never actually still.
   *
   * The three logos are supplied by whoever is building this and cut out by
   * logos.mjs into PROMO_ASSETS. They are not in the repo — showing a
   * competitor is ordinary comparison, redistributing their artwork is not
   * ours to do. Render without them and the marks are simply missing, which
   * verify.mjs reports rather than letting it ship.
   *
   * Silent by design, like the other one: the reference's audio belongs to
   * whoever made it. Render with --silent and pick the sound in TikTok.
   * =================================================================== */
  {
    id: 'mog-02-rivals', title: 'The mog: three logos', music: 'phonk-132-24s',
    wm: 'corner', formats: ['tiktok'],
    ref: { cuts: [...REF_CUTS, REF_DROP], len: REF_LEN, drop: REF_DROP },
    scenes: [
      /*
       * Twelve seconds on three marks. Nine shots, the same subject every time,
       * which is the reference's structure exactly — wide, in on one, wide, in
       * on the next. `on` is which mark to centre; null is the whole row.
       */
      /*
       * Nine shots on the reference's own cut times, held to the drop.
       *
       * Not a fitted grid — see REF_CUTS above for why there is no grid to fit.
       * The last shot runs 1.91s, longer than any before it, with the call-out
       * landing inside it so that the cut out of it is the drop.
       */
      { type: 'rivals', dur: REF_DROP, bpm: 121.7,
        logos: ['davinci', 'aftereffects', 'capcut'],
        cap: 'what everyone else is using',
        /* On screen for the two thirds of a second before the bass arrives. */
        mog: { at: 11.167, text: 'MOGGED' },
        cuts: [
          /* Every shot is a different height, lean and light as well as a
             different framing. An earlier version varied only the framing and
             the three wides came out near-identical, which is what a reframe
             of three small marks on black looks like — nothing. */
          { at: 0, dur: 1.3, on: null, push: 1.18, to: 1.06, drift: 18, dy: 0,
            glow: { x: 50, y: 54, r: 58, c: 'rgba(120,140,190,.2)' } },
          { at: 1.3, dur: 1.233, on: 0, push: 1.95, to: 1.06, drift: -22, tilt: -1.5, dy: 18,
            glow: { x: 26, y: 46, r: 48, c: 'rgba(90,190,225,.22)' } },
          { at: 2.533, dur: 1.2, on: null, push: 1.22, to: 1.03, drift: 24, dy: 84, tilt: 1.1,
            glow: { x: 62, y: 72, r: 52, c: 'rgba(200,120,90,.18)' } },
          { at: 3.733, dur: 1.2, on: 1, push: 2.1, to: 1.05, drift: 20, tilt: 1.2, dy: -22,
            glow: { x: 54, y: 40, r: 44, c: 'rgba(120,110,230,.26)' } },
          { at: 4.933, dur: 1.234, on: null, push: 1.15, to: 1.08, drift: -26, dy: -70, tilt: -1.4,
            glow: { x: 38, y: 30, r: 60, c: 'rgba(150,160,200,.16)' } },
          { at: 6.167, dur: 1.233, on: 2, push: 2.0, to: 1.07, drift: 24, tilt: -1, dy: 26,
            glow: { x: 72, y: 56, r: 46, c: 'rgba(230,210,150,.2)' } },
          { at: 7.4, dur: 1.233, on: null, push: 1.25, to: 1.02, drift: -20, dy: -34, tilt: 0.9,
            glow: { x: 50, y: 24, r: 54, c: 'rgba(110,150,210,.22)' } },
          { at: 8.633, dur: 1.267, on: 1, push: 1.6, to: 1.08, drift: 18, tilt: 0.8, dy: 58,
            glow: { x: 44, y: 68, r: 50, c: 'rgba(210,110,140,.2)' } },
          { at: 9.9, dur: 1.91, on: null, push: 1.15, to: 1.12, drift: 12, dy: 6,
            glow: { x: 50, y: 50, r: 40, c: 'rgba(90,100,140,.16)' } },
        ] },

      /*
       * The mog. Twenty-four cuts at the reference's own times, opening on the
       * mark arriving — the hard cut out of MOGGED is the whole transition the
       * brief asked for, so nothing fades.
       *
       * Frames alternate lit and dark with the tone pinned to match, for the
       * reason set out at length on mog-01: every screenshot in this app is
       * dark chrome and two in a row will not read as a cut otherwise.
       */
      /* impactUnder 0 on purpose: the reference has no flash transitions at all,
         it is thirty-four hard cuts. The chromatic split on the mark's arrival
         is its own thing and still fires. */
      /*
       * The mog, on the grid.
       *
       * The beat offsets are the reference's own: relative to the beat its
       * subject changes on, it cuts at 0, 2, 3, 4, 5, 7, 8, 9, 10, 12 and so on
       * — a two-beat cut then three single-beat ones, over and over, which is
       * what gives the section its gallop. The same pattern starting one beat
       * earlier puts the mark's arrival on the drop instead of a beat after it.
       */
      /*
       * The mog, on the reference's own cut times.
       *
       * REF_CUTS from index 9 on, minus REF_DROP so they are relative to the
       * start of this scene. The mark's arrival gets the 0.557s between the
       * drop and the reference's first B cut, which is why there is one more
       * frame here than the reference has cuts: it changes subject half a
       * second after the drop, and this changes on it.
       */
      { type: 'drop', dur: REF_END - REF_DROP, impactUnder: 0, noflash: true,
        /* slice(9, -1): the last entry in REF_CUTS is where their end card
           starts, which is where this scene ends — not a cut inside it. */
        cuts: [REF_DROP, ...REF_CUTS.slice(9, -1)].map((t, i, all) => ({
          at: Number((t - REF_DROP).toFixed(3)),
          dur: Number(((i + 1 < all.length ? all[i + 1] : REF_END) - t).toFixed(3)),
        })),
        frames: [
          { mark: true },
          { shot: 'export', cx: 0.5, cy: 0.5, w: 0.44, tone: 'cool', label: 'every platform at once', push: 1.18 },
          { shot: 'panel-erase', cx: 0.51, cy: 0.42, w: 0.44, tone: 'warm', label: 'tap it. <em>gone.</em>', push: 1.22 },
          { shot: 'panel-sound', cx: 0.13, cy: 0.3, w: 0.28, tone: 'cool', label: '<em>544</em> tracks', push: 1.1 },
          { shot: 'phone', cx: 0.5, cy: 0.3, w: 0.6, tone: 'warm', label: 'it runs on your phone', push: 1.2 },
          { shot: 'panel-templates', cx: 0.13, cy: 0.33, w: 0.26, tone: 'cool', label: '<em>21</em> montages', push: 1.12 },
          { shot: 'panel-overlays', cx: 0.13, cy: 0.3, w: 0.26, tone: 'warm', label: 'particles', push: 1.14 },
          { shot: 'panel-ai-plan', cx: 0.13, cy: 0.2, w: 0.3, tone: 'cool', label: 'it plans the edit', push: 1.11 },
          { shot: 'editor', cx: 0.5, cy: 0.72, w: 0.38, tone: 'warm', label: 'unlimited tracks', push: 1.2 },
          { shot: 'panel-audio-chain', cx: 0.13, cy: 0.42, w: 0.28, tone: 'cool', label: 'EQ. dynamics. loudness.', push: 1.12 },
          { shot: 'panel-filters', cx: 0.13, cy: 0.3, w: 0.26, tone: 'warm', label: '<em>176</em> looks', push: 1.11 },
          { shot: 'panel-color', cx: 0.13, cy: 0.22, w: 0.26, tone: 'cool', label: 'real <em>scopes</em>', push: 1.13 },
          { shot: 'panel-transitions', cx: 0.13, cy: 0.5, w: 0.3, tone: 'warm', label: 'tracked transitions', push: 1.15 },
          { shot: 'panel-text', cx: 0.13, cy: 0.25, w: 0.28, tone: 'cool', label: '<em>49</em> text styles', push: 1.1 },
          { shot: 'editor', cx: 0.51, cy: 0.3, w: 0.52, tone: 'warm', label: '<em>60fps</em>, effects on', push: 1.22 },
          { shot: 'editor', cx: 0.5, cy: 0.5, w: 0.9, tone: 'cool', label: 'the whole editor', push: 1.18 },
          { shot: 'panel-erase', cx: 0.44, cy: 0.5, w: 0.3, tone: 'warm', label: 'no mask. no pen.', push: 1.24 },
          { shot: 'panel-styles-phonk', cx: 0.13, cy: 0.3, w: 0.26, tone: 'cool', label: 'phonk', push: 1.12 },
          { shot: 'phone', cx: 0.5, cy: 0.62, w: 0.55, tone: 'warm', label: 'same project, both', push: 1.22 },
          { shot: 'panel-captions', cx: 0.13, cy: 0.3, w: 0.26, tone: 'cool', label: 'captions, timed for you', push: 1.11 },
          { shot: 'panel-overlays', cx: 0.13, cy: 0.5, w: 0.3, tone: 'warm', label: 'light leaks', push: 1.14 },
          { shot: 'panel-shapes', cx: 0.13, cy: 0.5, w: 0.3, tone: 'cool', label: 'shape layers', push: 1.12 },
          { shot: 'panel-effects', cx: 0.13, cy: 0.33, w: 0.26, tone: 'warm', label: '<em>340</em> effects', push: 1.12 },
          { shot: 'start', cx: 0.5, cy: 0.4, w: 0.6, tone: 'cool', label: 'opens in a browser', push: 1.16 },
          { shot: 'panel-stickers', cx: 0.13, cy: 0.3, w: 0.26, tone: 'warm', label: 'stickers that follow', push: 1.15 },
        ] },

      { type: 'slam', dur: Number((REF_LEN - REF_END).toFixed(3)), kick: '$19.99 once. no subscription. ever.', noflash: true },
    ],
  },

  /* ===================================================================
   * mog-03-lyric — the third rebuild. Eight seconds of the mark with the
   * lyric writing itself a word at a time, the drop at 8.5s, ten seconds of
   * the app at the reference's own cut times with its own white flashes, its
   * one letter-spaced word, then the end card where their card is.
   *
   * The words are the track's own lyric, placed where the reference places
   * them. They are the sound's words, not a claim about anything.
   * =================================================================== */
  {
    id: 'mog-03-lyric', title: 'The lyric edit: the mark until the drop', music: 'phonk-132-24s',
    wm: 'corner', formats: ['tiktok'],
    ref: { cuts: REF3_CUTS, len: REF3_LEN, drop: REF3_DROP },
    scenes: [
      { type: 'lyric', dur: REF3_DROP, bpm: 100, embers: 26,
        cuts: [
          { at: 0, dur: 1.9, push: 0.92, to: 1.1, drift: 30, dy: -80, bright: 0.9 },
          { at: 1.9, dur: 3.067, push: 1.35, to: 1.08, drift: -40, dy: 60, tilt: -2, bright: 1 },
          { at: 4.967, dur: 3.533, push: 0.8, to: 1.22, drift: 20, dy: -30, tilt: 1.5, bright: 0.8 },
        ],
        lines: [
          /* line 1, mid-frame, on the first shot */
          { pos: 'mid', to: 1.9, words: [
            { t: 'ima', at: 0.0 }, { t: 'make', at: 0.2 }, { t: 'the', at: 0.4 }, { t: 'world', at: 0.45 },
            { t: 'hate', at: 0.8 }, { t: 'me', at: 0.9 } ] },
          /* line 2, the big "ima", the red word, on the second shot */
          { pos: 'mid', to: 4.967, words: [
            { t: 'ima', at: 2.4, k: 'b' }, { t: 'make', at: 2.6 }, { t: 'the', at: 2.65 }, { t: 'world', at: 2.7 },
            { t: 'hate', at: 2.8 }, { t: 'me', at: 2.85 }, { br: true },
            { t: 'be', at: 4.0 }, { t: 'the', at: 4.05 }, { t: 'supervillain', at: 4.2, k: 'r' } ] },
          /* lines 3 and 4, low in the frame, on the dark third shot */
          { pos: 'low', to: 7.2, words: [
            { t: 'ima', at: 5.6, k: 'i' }, { t: 'make', at: 5.7, k: 'i' }, { t: 'this', at: 5.9 }, { t: 'whole', at: 6.0 },
            { t: 'thing', at: 6.1 }, { t: 'crumble', at: 6.25 } ] },
          { pos: 'low', to: 8.5, words: [
            { t: 'Yeah', at: 7.0, k: 's' }, { br: true },
            { t: 'people', at: 7.25 }, { t: 'like', at: 7.35 }, { t: 'the', at: 7.4 }, { t: 'villains', at: 7.5 } ] },
        ] },

      /* Thirty-six cuts at the reference's times, red-graded, the flashes at
         its flash frames, the word where its word is. */
      { type: 'drop', dur: REF3_END - REF3_DROP, impactUnder: 0, noflash: true,
        /* Everything red: sepia collapses the app's blue and the footage's
           orange to one hue, then the rotate takes it to red. The reference is
           a dark red room and red sabres from first frame to last. */
        tones: { cool: { b: 0.6, sepia: 1, h: -52, s: 2.8 }, warm: { b: 1.5, sepia: 1, h: -44, s: 3.4 } },
        flashes: REF3_FLASHES.map((t) => Number((t - REF3_DROP).toFixed(3))),
        word: { at: Number((14.033 - REF3_DROP).toFixed(3)), dur: 0.93, text: 'D<i>A</i>NG<i>E</i>R' },
        cuts: REF3_CUTS.slice(3, -2).map((t, i, all) => ({
          at: Number((t - REF3_DROP).toFixed(3)),
          dur: Number(((i + 1 < all.length ? all[i + 1] : REF3_END) - t).toFixed(3)),
        })),
        frames: [
          { mark: true },
          { shot: 'panel-erase', cx: 0.51, cy: 0.42, w: 0.44, tone: 'warm', label: 'tap it. <em>gone.</em>', push: 1.3 },
          { shot: 'export', cx: 0.5, cy: 0.5, w: 0.44, tone: 'cool', label: 'every platform at once', push: 1.2 },
          { shot: 'phone', cx: 0.5, cy: 0.3, w: 0.6, tone: 'warm', label: 'on your phone', push: 1.26 },
          { shot: 'panel-sound', cx: 0.13, cy: 0.3, w: 0.28, tone: 'cool', label: '<em>544</em> tracks', push: 1.12 },
          { shot: 'panel-overlays', cx: 0.13, cy: 0.3, w: 0.26, tone: 'warm', label: 'particles', push: 1.17 },
          { shot: 'panel-templates', cx: 0.13, cy: 0.33, w: 0.26, tone: 'cool', label: '<em>21</em> montages', push: 1.14 },
          { shot: 'editor', cx: 0.5, cy: 0.72, w: 0.38, tone: 'warm', label: 'unlimited tracks', push: 1.26 },
          { shot: 'panel-ai-plan', cx: 0.13, cy: 0.2, w: 0.3, tone: 'cool', label: 'it plans the edit', push: 1.13 },
          { shot: 'panel-filters', cx: 0.13, cy: 0.3, w: 0.26, tone: 'warm', label: '<em>176</em> looks', push: 1.13 },
          { shot: 'panel-audio-chain', cx: 0.13, cy: 0.42, w: 0.28, tone: 'cool', label: 'EQ. dynamics. loudness.', push: 1.15 },
          { shot: 'panel-transitions', cx: 0.13, cy: 0.5, w: 0.3, tone: 'warm', label: 'tracked transitions', push: 1.18 },
          { shot: 'panel-color', cx: 0.13, cy: 0.22, w: 0.26, tone: 'cool', label: 'real <em>scopes</em>', push: 1.16 },
          { shot: 'editor', cx: 0.51, cy: 0.3, w: 0.52, tone: 'warm', label: '<em>60fps</em>, effects on', push: 1.28 },
          { shot: 'panel-text', cx: 0.13, cy: 0.25, w: 0.28, tone: 'cool', label: '<em>49</em> text styles', push: 1.12 },
          { shot: 'panel-erase', cx: 0.44, cy: 0.5, w: 0.3, tone: 'warm', label: 'no mask. no pen.', push: 1.32 },
          { shot: 'editor', cx: 0.5, cy: 0.5, w: 0.9, tone: 'cool', label: 'the whole editor', push: 1.24 },
          { shot: 'panel-overlays', cx: 0.13, cy: 0.5, w: 0.3, tone: 'warm', label: 'light leaks', push: 1.16 },
          { shot: 'panel-styles-phonk', cx: 0.13, cy: 0.3, w: 0.26, tone: 'cool', label: 'phonk', push: 1.14 },
          { shot: 'phone', cx: 0.5, cy: 0.62, w: 0.55, tone: 'warm', label: 'same project, both', push: 1.3 },
          { shot: 'panel-captions', cx: 0.13, cy: 0.3, w: 0.26, tone: 'cool', label: 'captions, timed for you', push: 1.13 },
          { shot: 'panel-effects', cx: 0.13, cy: 0.33, w: 0.26, tone: 'warm', label: '<em>340</em> effects', push: 1.14 },
          { shot: 'panel-shapes', cx: 0.13, cy: 0.5, w: 0.3, tone: 'cool', label: 'shape layers', push: 1.15 },
          { shot: 'panel-filters', cx: 0.13, cy: 0.55, w: 0.3, tone: 'warm', label: 'one tap, graded', push: 1.17 },
          { shot: 'panel-audio', cx: 0.13, cy: 0.35, w: 0.28, tone: 'cool', label: 'repair bad audio', push: 1.13 },
          { shot: 'editor', cx: 0.5, cy: 0.5, w: 0.62, tone: 'warm', label: 'ripple. roll. slip.', push: 1.25 },
          { shot: 'panel-styles-anime', cx: 0.13, cy: 0.3, w: 0.26, tone: 'cool', label: 'anime opening', push: 1.14 },
          { shot: 'panel-stickers', cx: 0.13, cy: 0.3, w: 0.26, tone: 'warm', label: 'stickers that follow', push: 1.15 },
          { shot: 'start', cx: 0.5, cy: 0.4, w: 0.6, tone: 'cool', label: 'opens in a browser', push: 1.2 },
          { shot: 'phone', cx: 0.5, cy: 0.42, w: 0.85, tone: 'warm', label: 'no watermark. <em>ever.</em>', push: 1.2 },
          { shot: 'panel-styles-velocity', cx: 0.13, cy: 0.3, w: 0.26, tone: 'cool', label: 'velocity', push: 1.14 },
          { shot: 'panel-erase', cx: 0.5, cy: 0.6, w: 0.5, tone: 'warm', label: 'it fills the gap', push: 1.22 },
          { shot: 'panel-ai', cx: 0.13, cy: 0.25, w: 0.3, tone: 'cool', label: 'say what you want', push: 1.12 },
          { shot: 'editor', cx: 0.3, cy: 0.55, w: 0.45, tone: 'warm', label: 'keyframes. curves.', push: 1.24 },
          { shot: 'panel-sound', cx: 0.13, cy: 0.5, w: 0.3, tone: 'cool', label: 'rap. drill. rnb.', push: 1.12 },
          { shot: 'phone-start', cx: 0.5, cy: 0.45, w: 0.8, tone: 'warm', label: 'installs from the browser', push: 1.2 },
        ] },

      { type: 'slam', dur: Number((REF3_LEN - REF3_END).toFixed(3)), kick: '$19.99 once. no subscription. ever.', noflash: true },
    ],
  },

  /* ===================================================================
   * show-01-genesis — the proof piece. Nothing in it is a photograph, a
   * screenshot or a clip: seven thousand particles, a projected torus, type on
   * the beat over noise, grids and streaks, and the mark assembled out of the
   * particles at the end. Render it with --scale 2 --fps 120 for real 4K at
   * 120 frames a second, or --scale 4 for 8K. Fourteen and a half seconds at
   * 132 BPM so it sits on the phonk bed the app made itself.
   * =================================================================== */
  {
    id: 'show-01-genesis', title: 'Genesis: a picture from nothing', music: 'phonk-132-24s',
    wm: 'corner', formats: ['tiktok'],
    scenes: [
      { type: 'gen', dur: 14.5, bpm: 132, particles: 7000,
        phases: { form: 2.7, hits: 5.45, resolve: 9.1, card: 12.7 },
        hits: ['4K', '120 FPS', 'NO FOOTAGE', 'NO STOCK', 'NO CAMERA', 'PURE MATH', 'DRAWN', 'LIVE'],
        kick: '$19.99 once. no subscription. ever.' },
    ],
  },

  /* ===================================================================
   * proof-01-nosub — a different body on the principle the mogs proved.
   *
   * The mogs are the only videos that beat the first test batch, and the
   * reason is the first second: something everybody recognises before the
   * app is named. This keeps that and changes everything after it. It opens
   * on the dialog every editor puts in front of the export button — no brand
   * on it, the shape is the recognition — and cuts out of it into the app
   * doing six real things with visible results, one per four beats, a real
   * cursor doing the tapping, at the mog's hard-cut rhythm. Rendered with
   * --scale 2 so every crop of the 2x screenshots lands at native 4K.
   *
   * Every number on screen is one already established elsewhere in this
   * file or on the pricing page. Nothing is claimed that the build cannot do.
   * =================================================================== */
  {
    id: 'proof-01-nosub', title: 'Proof: the dialog, then the editor', music: 'phonk-132-24s',
    wm: 'corner', formats: ['tiktok'],
    scenes: [
      { type: 'paywall', dur: 2.73, shot: 'editor', cap: 'every other editor.' },

      /* Six things with a result on screen, four beats each, on the marks
         shots.mjs measured — the cursor lands on the actual control. */
      { type: 'wipe', beats: 5, pair: 'erase', labels: ['tap it', 'gone'], cap: 'tap the thing. <em>it is gone.</em>', noflash: true },
      { type: 'app', beats: 5, shot: 'panel-ai-plan', box: 'tall', bleed: true, tag: 'one sentence in', view: hold({ cx: 0.13, cy: 0.5, w: 0.3 }, 0, 2.3),
        cursor: [{ at: 0.2, x: 0.16, y: 0.55 }, { at: 1.0, on: 'doit', click: true }],
        spots: [{ at: 1.15, on: 'doit', label: 'it does the whole plan', until: 2.2 }],
        cap: 'one sentence. <em>it plans the edit.</em>' },
      { type: 'app', beats: 5, shot: 'panel-audio', box: 'tall', bleed: true, tag: 'the sound panel', view: hold(V.panel, 0, 2.3),
        spots: [{ at: 0.3, on: 'beats', label: '58 beats detected' }],
        cursor: [{ at: 0.6, x: 0.14, y: 0.45 }, { at: 1.4, on: 'cut', click: true }],
        cap: 'drop the clips. <em>it cuts on the beat.</em>' },
      { type: 'app', beats: 5, shot: 'panel-color', box: 'tall', bleed: true, tag: 'the colour page', view: hold(V.panelTop, 0, 2.3),
        spots: [{ at: 0.4, on: 'scope', label: 'a real waveform, live' }],
        cursor: [{ at: 0.8, x: 0.15, y: 0.5 }, { at: 1.6, on: 'look', click: true }],
        cap: 'waveform. vectorscope. <em>parade.</em>' },
      { type: 'app', beats: 5, shot: 'export', box: 'wide', bleed: true, tag: 'export', view: hold(V.dialog, 0, 2.3),
        spots: [{ at: 0.3, on: 'preset', label: 'every platform at once' }],
        cursor: [{ at: 0.7, x: 0.55, y: 0.6 }, { at: 1.5, on: 'go', click: true }],
        cap: 'no watermark. <em>on any edition.</em>' },
      { type: 'app', beats: 5, shot: 'phone', frame: 'phone', box: 'tall', tag: 'same project, on a phone',
        view: hold(V.whole, 0, 2.3), cap: 'and it is on your phone.' },

      { type: 'slam', dur: 3.2, kick: '$19.99 once. no subscription. ever.', noflash: true },
    ],
  },
];

/* =============== stills: Instagram feed posts and the YouTube thumbnail =============== */
export const STILLS = [
  { id: 'feed-01-stop-paying', fmt: 'feed', t: 2.4, music: 'hype-150-24s', scenes: [{ type: 'hook', beats: 20, lines: ['STOP PAYING', '$23 A MONTH', 'TO EDIT VIDEOS'], grad: [1], sub: 'free to start · <b>$19.99 once</b> · omnidx.net' }] },
  { id: 'feed-02-price', fmt: 'feed', t: 4.6, music: 'hype-150-24s', scenes: [{ type: 'price', beats: 20, cap: 'one payment. <em>that\'s it.</em>' }] },
  { id: 'feed-03-effects', fmt: 'feed', t: 12, music: 'hype-150-24s', scenes: [{ type: 'list', beats: 40, count: 340, title: 'effects, built in', items: EFFECT_ITEMS.slice(0, 16), stepBeats: 0.5, cap: 'no plugins. <em>no packs to buy.</em>' }] },
  { id: 'feed-04-editor', fmt: 'feed', t: 1.5, music: 'hype-150-24s', scenes: [{ type: 'app', beats: 20, shot: 'editor', box: 'wide', tag: 'the whole editor', view: hold(V.whole, 0, 5), cap: 'a full editor. <i>in your browser.</i>' }] },
  { id: 'feed-05-yours-forever', fmt: 'feed', t: 2.2, music: 'hype-150-24s', scenes: [{ type: 'statement', beats: 20, lines: ['One payment.', 'Yours forever.'], grad: [1], sub: 'every update · every device · <b>omnidx.net</b>' }] },
  { id: 'feed-06-end-card', fmt: 'feed', t: 3.2, music: 'hype-150-24s', scenes: [{ type: 'end', beats: 20, line: PRICE_LINE, tags: tags('#onetimepurchase', '#capcutalternative'), bio: 'omnidx.net' }] },
  { id: 'yt-thumb', fmt: 'thumb', t: 0, music: 'hype-150-24s', scenes: [{ type: 'thumb', beats: 4, big: 'NOT <b>$23/MO.</b><br>$19.99 <b>ONCE.</b>', small: 'a full video editor · <em>340 effects</em> · AI · free to start', shot: 'editor' }] },
];
