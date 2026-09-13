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
const TRACK_ITEMS = ['Titles', 'Stickers', 'Lens flare', 'Blur a face', 'Transitions', 'Callouts', 'Emoji', 'Masks'];
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
      { type: 'hook', beats: 8, lines: ['AUTO CAPTIONS', 'THAT ACTUALLY', 'LOOK GOOD.'], grad: [2] },
      { type: 'app', beats: 14, shot: 'panel-captions', box: 'tall', tag: 'the captions panel', view: hold(V.panel, 0, 6),
        cursor: [{ at: 0.5, x: 0.16, y: 0.25 }, { at: 1.4, x: 0.13, y: 0.171, click: true }], spots: [{ at: 1.6, x: 0.046, y: 0.152, w: 0.17, h: 0.04, label: 'one click', below: true }],
        caps: [[0, 'one click. <em>it finds the speech.</em>'], [7, 'styled for TikTok. <em>timed to the word.</em>']] },
      { type: 'statement', beats: 6, lines: ['Sound off?', 'Still watched.'], grad: [1] },
      { type: 'end', beats: 12, line: 'Auto-captions are in Creator. ' + PRICE_LINE, tags: tags('#captions', '#accessibility') },
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
