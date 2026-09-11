/*
 * Turning a sentence into an edit.
 *
 * This is the local planner and it runs entirely on the device — no key, no
 * network, no account. It reads the request for the handful of things that
 * actually decide what an edit looks like (how long, how fast, what shape,
 * what mood, captions or not, cut to the music or not) and emits a plan: an
 * ordered list of operations that apply.js then performs as ordinary timeline
 * edits.
 *
 * A plan is deliberately a data structure and not a black box. The AI panel
 * shows every step before running it, each one lands on the timeline as
 * something you can drag or undo, and nothing is applied that you can't see.
 *
 * When a cloud key is configured, remote.js asks a language model for the same
 * JSON so free-form phrasing works too. This file is the floor, not the
 * ceiling — and it is why the feature still works on a plane.
 */

import { matchTemplate, buildTemplate, TEMPLATES } from '../engine/templates.js';
import { readInstructions } from './direct.js';
import { EFFECTS } from '../engine/effects.js';

const NUM_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40, fortyfive: 45, sixty: 60, ninety: 90,
};

/* Each entry: what to look for, and what it decides. Keeping this as a table
   rather than a wall of ifs is what makes it reviewable — and easy to extend
   when someone asks for a phrasing we didn't think of. */
const LOOK_WORDS = [
  [/teal (and|&) orange|blockbuster|cinematic colou?r/i, 'cinematic'],
  [/black (and|&) white|b\s*&\s*w|monochrome|greyscale|grayscale|mono\b/i, 'mono'],
  [/noir|moody black/i, 'noir'],
  [/vintage|retro|old school|film look|faded/i, 'fade'],
  [/vhs|camcorder|90s|nineties/i, 'vhs'],
  [/warm|golden hour|sunset|cosy|cozy/i, 'warm'],
  [/cold|cool tone|blue tone|icy|winter/i, 'cool'],
  [/neon|cyberpunk|night ?life/i, 'neon'],
  [/moonlight|night|dark and blue/i, 'moonlight'],
  [/vivid|colou?rful|saturated|pop(?:py)? colou?r/i, 'vivid'],
  [/punchy|punch\b|contrasty/i, 'punch'],
  [/kodak|film stock|2383/i, 'kodak'],
  [/pastel|soft colou?r/i, 'pastel'],
  [/bleach|desaturat/i, 'bleach'],
  [/sunburn|hot|desert/i, 'sunburn'],
];

const TRANSITION_WORDS = [
  [/zoom (transition|punch)|punch in|zoom cut/i, 'zoomPunch'],
  [/whip|swipe pan|whoosh/i, 'whip'],
  [/glitch|digital|broken/i, 'glitch'],
  [/film burn|burn/i, 'filmBurn'],
  [/dip to black|fade to black/i, 'dipBlack'],
  [/dip to white|flash/i, 'dipWhite'],
  [/slide/i, 'slideLeft'],
  [/spin/i, 'spin'],
  [/blur (transition|dissolve)/i, 'blurDissolve'],
  [/iris|circle/i, 'circle'],
  [/wipe/i, 'wipe'],
  [/dissolve|cross ?fade|smooth transition/i, 'dissolve'],
];

/* Effects people name directly. Anything not in here still reaches the effect
   through a template, so this list is a shortcut, not the only door. */
const EFFECT_WORDS = [
  [/motion blur|blur the motion|smear/i, 'motionBlur', { amount: 55 }],
  [/zoom blur|radial blur/i, 'zoomBlur', { amount: 45 }],
  [/shake|shaky|handheld|hand-held|earthquake/i, 'shake', { amount: 40 }],
  [/rgb split|chromatic|colou?r split|aberration/i, 'rgbSplit', { amount: 28, pulse: 60 }],
  [/glow|bloom|dreamy light/i, 'glow', { amount: 40 }],
  [/speed ?lines?|manga lines|action lines/i, 'speedLines', { amount: 60 }],
  [/halftone|manga dots|comic dots/i, 'halftone', { amount: 60 }],
  [/cel ?shade|posteri[sz]e|cartoon|toon/i, 'posterize', { levels: 5, outline: 40 }],
  [/pixelate|pixel|8.?bit|censor/i, 'pixelate', { size: 14 }],
  [/scanlines?|crt|old tv|retro screen/i, 'scanlines', { amount: 40 }],
  [/mirror|kaleidoscope|symmetr/i, 'mirror', { mode: 'h' }],
  [/vhs|tape wobble|camcorder wobble/i, 'vhsWobble', { amount: 40 }],
  [/prism|lens fringe/i, 'prism', { amount: 35 }],
  [/light ?leak|lens flare|sun leak/i, 'lightLeak', { amount: 45 }],
  [/letterbox|black bars|cinema bars|widescreen bars/i, 'letterbox', { amount: 12 }],
  [/blur\s+(out\s+)?(the|his|her|their|my|a)?\s*(face|plate|number|sign|screen|logo)|censor|hide\s+(the|his|her|their|my)?\s*face/i,
    'blurRegion', { size: 20, strength: 22 }],
  [/flash|strobe/i, 'flash', { amount: 70, every: 0.5, length: 0.08 }],
];

const RATIO_WORDS = [
  [/tiktok|reel|short|vertical|9:16|portrait|story|stories/i, '9:16'],
  [/youtube|landscape|16:9|widescreen|horizontal/i, '16:9'],
  [/square|1:1/i, '1:1'],
  [/instagram (feed|post)|4:5/i, '4:5'],
  [/cinemascope|2\.39|anamorphic|letterbox/i, '2.39:1'],
];

/* ------------------------------------------------------------------ */
/* reading the request                                                 */
/* ------------------------------------------------------------------ */

export function understand(prompt) {
  const s = String(prompt || '').toLowerCase();
  const intent = {
    raw: prompt,
    targetDur: null,
    ratio: null,
    pace: null,
    beatSync: false,
    look: null,
    captions: false,
    captionStyle: 'tiktok',
    removeSilence: false,
    transition: null,
    noTransitions: /no transition|hard cut|straight cut|cuts only/i.test(s),
    fadeEnds: /fade (in and out|at the (start|beginning) and end)|fade ends/i.test(s),
    title: null,
    hook: null,
    kenBurns: false,
    shuffle: /shuffle|random order|mix (it |them )?up/i.test(s),
    speed: null,
    reframe: false,
    logo: /add my logo|my logo|watermark my/i.test(s),
    noMusic: /no music|without music|mute the music|silent|no sound|no audio/i.test(s),

    /* Keep what is already on the timeline and only re-time it. This is a
       different request from "build me an edit" and getting them confused
       throws away someone's work, so the test is deliberately generous. */
    // Asking outright for the edit to be rebuilt. Without one of these, a
    // style applied to work already on the timeline leaves the cuts alone.
    rebuild: /\bre-?(cut|edit|build|arrange)\b|start (again|over|from scratch)|lay (it|them) out again|redo the (cut|edit)|from scratch\b/i.test(s) ? true : undefined,
    syncExisting: /\bsync\b|re-?time|match (the )?(beat|music|audio|song|track)|(to|with|on) the (beat|music|audio|song|track)\b|line (them |it )?up (to|with)|on beat\b/i.test(s)
      && !/\bmake me\b|\bbuild\b|\bcreate\b|\bnew edit\b/i.test(s),

    effects: [],
    template: null,
    energy: null,
    ctaText: null,
  };

  /* ---- how long ---- */
  const secs = s.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)\b/);
  const mins = s.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)\b/);
  // The unit has to be a whole word. Matching a bare "s" turned "the ones on
  // TikTok" into a one-second edit, which is exactly the kind of silent
  // misread that makes an AI feel broken.
  const worded = s.match(new RegExp(`\\b(${Object.keys(NUM_WORDS).join('|')})[- ]?(?:secs?|seconds?)\\b`));
  if (secs) intent.targetDur = Number(secs[1]);
  else if (mins) intent.targetDur = Number(mins[1]) * 60;
  else if (worded) intent.targetDur = NUM_WORDS[worded[1]];

  /* ---- shape ---- */
  for (const [re, ratio] of RATIO_WORDS) if (re.test(s)) { intent.ratio = ratio; break; }

  /* ---- pace ---- */
  if (/fast cut|quick cut|snappy|punchy|rapid|energetic|hype|high energy|fast-paced/i.test(s)) intent.pace = 'fast';
  else if (/slow|calm|relaxed|cinematic|gentle|dreamy|montage|ambient/i.test(s)) intent.pace = 'slow';
  else if (/medium|normal|steady/i.test(s)) intent.pace = 'medium';

  /* ---- music ---- */
  intent.beatSync = /on (the )?beat|to the (beat|music|song|track)|beat.?sync|sync(ed)? to|rhythm|drop/i.test(s);

  /* ---- look ---- */
  for (const [re, look] of LOOK_WORDS) if (re.test(s)) { intent.look = look; break; }

  /* ---- captions ---- */
  if (/caption|subtitle|text on screen|words on screen|auto.?caption|\bsubs\b/i.test(s)) intent.captions = true;
  if (/youtube caption|clean caption|broadcast/i.test(s)) intent.captionStyle = 'youtube';
  if (/karaoke|word by word|highlight/i.test(s)) intent.captionStyle = 'karaoke';
  if (/big caption|bold caption|impact/i.test(s)) intent.captionStyle = 'bold';

  /* ---- talking head cleanup ---- */
  /* Deliberately loose. People write "cut all the silence out", "get rid of
     the dead air", "trim the pauses" — a pattern that only matches one exact
     phrasing is a feature nobody finds. */
  intent.removeSilence =
    /\b(remove|removing|cut|cutting|strip|delete|trim|kill|lose|get rid of)\b[\s\S]{0,24}\b(silen|dead ?air|pause|gap|um+s?\b)/i.test(s)
    || /\b(silence|dead ?air|pauses?)\b[\s\S]{0,20}\b(remove|removed|cut|gone|out)\b/i.test(s)
    || /\btighten (it|this|them|the edit)?\b|\bjump ?cut/i.test(s);

  /* ---- transitions ---- */
  if (!intent.noTransitions) {
    for (const [re, id] of TRANSITION_WORDS) if (re.test(s)) { intent.transition = id; break; }
  }

  /* ---- text ---- */
  const quoted = String(prompt || '').match(/["“']([^"”']{2,90})["”']/);
  if (quoted) intent.title = quoted[1];
  const titleWord = s.match(/(?:title|headline|text)\s+(?:that\s+)?(?:says|saying|reading)\s+(.{2,80})/i);
  if (!intent.title && titleWord) intent.title = titleWord[1].replace(/[.?!]+$/, '').trim();
  if (/hook|opener|intro text|attention/i.test(s)) intent.hook = intent.title || null;

  /* ---- misc ---- */
  intent.kenBurns = /ken burns|slow zoom|pan (and|&) zoom|movement on (the )?(photo|image|stills?)/i.test(s);
  intent.reframe = /reframe|crop to|fit to (vertical|portrait)|convert to (vertical|portrait)/i.test(s);
  const sp = s.match(/(\d+(?:\.\d+)?)\s*(?:x|times)\s*(?:speed|faster|slower)/);
  if (sp) intent.speed = Number(sp[1]);
  else if (/slow ?mo(tion)?/i.test(s)) intent.speed = 0.5;
  else if (/speed (it |them )?up|timelapse|hyperlapse/i.test(s)) intent.speed = 2;

  /* ---- explicitly named effects ---- */
  for (const [re, id, params] of EFFECT_WORDS) {
    if (re.test(s) && EFFECTS[id]) intent.effects.push({ effect: id, params });
  }

  /* ---- energy, which is finer than pace ---- */
  if (/frantic|insane|crazy fast|hyper|brainrot|chaotic/i.test(s)) intent.energy = 'frantic';
  else if (intent.pace === 'fast') intent.energy = 'fast';
  else if (intent.pace === 'slow') intent.energy = 'slow';

  /* ---- a named style ---- */
  const matched = matchTemplate(prompt);
  if (matched) intent.template = matched.template.id;
  if (intent.syncExisting && !matched) intent.template = 'sync-only';

  /* ---- a call to action for the ad template ---- */
  const cta = String(prompt || '').match(/(?:cta|call to action|end(?:ing|card)?)\s+(?:that\s+)?(?:says|saying|reading)\s+(.{2,60})/i);
  if (cta) intent.ctaText = cta[1].replace(/[.?!]+$/, '').trim();

  return intent;
}

/* ------------------------------------------------------------------ */
/* building the plan                                                   */
/* ------------------------------------------------------------------ */

const PACE_SECONDS = { fast: 0.9, medium: 2.2, slow: 4.5 };

/**
 * Build the plan.
 *
 * `context` describes what we have to work with: the media pool, whether a
 * music track was found and what its tempo is, the current ratio, and whether
 * anything is already on the timeline.
 */
export function plan(prompt, context) {
  const intent = understand(prompt);
  const warnings = [];
  const questions = [];

  const videos = context.media.filter((m) => m.kind === 'video' || m.kind === 'image');
  const music = context.media.find((m) => m.kind === 'audio');
  const onTimeline = context.clipCount || 0;

  if (!videos.length && !music) {
    return {
      intent, steps: [], warnings: ['There is no footage to work with yet. Add some clips and ask again.'],
      questions: [], summary: 'Nothing to edit yet.',
    };
  }

  /* Everything a template needs to make its decisions. */
  const ctx = {
    ratio: context.ratio,
    wantRatio: intent.ratio,
    hasMusic: Boolean(music) && !intent.noMusic,
    bpm: context.beats?.bpm || null,
    targetDur: intent.targetDur,
    pace: intent.energy || intent.pace || null,
    shuffle: intent.shuffle,
    clipCount: videos.length,
    onTimeline,
    /*
     * Whether a named style should rebuild the cut or only style it.
     *
     * Same rule the Styles panel uses: an empty timeline gets built, an edited
     * one gets styled. "Make it an anime edit" on an edit somebody has already
     * made means put the anime look on it, not throw it away and start again —
     * and the words that mean otherwise are asked for explicitly.
     */
    rebuild: intent.rebuild ?? !onTimeline,
    hookText: intent.hook || intent.title || null,
    ctaText: intent.ctaText || null,
    captionStyle: intent.captionStyle,
  };

  let steps = [];
  let source = null;

  /* ---------------- 0. a direct instruction ---------------- */
  /*
   * Checked before anything else, because a specific instruction must beat a
   * style match on the same words.
   *
   * "Slow the last clip down" contains "slow", which the style matcher reads
   * as a pace and happily turns into a whole cinematic re-edit. Somebody who
   * named one clip and one property wants that done to that clip and nothing
   * else — treating it as a style request is exactly the behaviour that made
   * the assistant feel like it only followed premade lines.
   */
  const direct = readInstructions(prompt, { clipCount: onTimeline });
  if (direct && onTimeline > 0) {
    return {
      intent, steps: direct.steps,
      warnings: direct.unhandled.length
        // Said plainly rather than swallowed. Somebody who asked for three
        // things and got two needs to know which one was missed, or they will
        // assume it all worked and find out at export.
        ? [`I did not follow: "${direct.unhandled.join('", "')}". Try naming the clip and what to change, `
           + 'like "mute clip 2" or "slow the last shot to half speed".']
        : [],
      questions: [],
      summary: direct.steps.length === 1
        ? direct.steps[0].label
        : `${direct.steps.length} changes to specific clips.`,
      source: { id: 'direct', name: 'Direct instruction' },
    };
  }

  /* ---------------- 1. a named style ---------------- */
  if (intent.template) {
    const built = buildTemplate(intent.template, ctx);
    if (built) {
      steps = [...built.steps];
      source = built.template;
    }
  }

  /* ---------------- 2. no style named: compose one ---------------- */
  if (!steps.length) {
    steps = composeGeneric(intent, ctx, context, warnings);
  }

  /* ---------------- 3. things asked for on top of the style ---------------- */

  /*
   * An explicit request always beats the template's default. "Cinematic but
   * black and white" must not come out teal and orange, for the same reason
   * "cinematic in 9:16" must not come out landscape: they said the words.
   */
  if (intent.look) {
    const graded = steps.find((st) => st.op === 'applyLook');
    if (graded) {
      graded.args = { look: intent.look, strength: 1 };
      graded.label = `Grade everything ${lookName(intent.look).toLowerCase()}`;
      graded.detail = 'You asked for this look by name, so it replaces the one this style normally uses.';
    } else {
      steps.push({
        op: 'applyLook', args: { look: intent.look, strength: 1 },
        label: `Grade everything with the ${lookName(intent.look)} look`,
        detail: 'Applied per clip, so you can change or remove it on any single shot.',
      });
    }
  }

  if (intent.noTransitions) {
    steps = steps.filter((st) => st.op !== 'addTransitions');
  }

  // Named effects always win: "anime edit but no shake" or "add motion blur"
  // has to survive whatever the template decided.
  for (const fx of intent.effects) {
    const already = steps.find((st) => st.op === 'addEffect' && st.args?.effect === fx.effect);
    if (already) { already.args.params = { ...already.args.params, ...fx.params }; continue; }
    steps.push({
      op: 'addEffect',
      args: { effect: fx.effect, params: fx.params, scope: 'all' },
      label: `Add ${EFFECTS[fx.effect]?.name.toLowerCase() || fx.effect}`,
      detail: 'You asked for this one by name, so it goes on every shot. Remove it from any clip in the Effects panel.',
    });
  }

  if (intent.removeSilence && !steps.some((st) => st.op === 'removeSilence')) {
    steps.splice(1, 0, {
      op: 'removeSilence', args: { minLen: 0.35, pad: 0.08 },
      label: 'Cut out the silences',
      detail: 'Gaps longer than a third of a second go, and the timeline closes up behind them.',
    });
  }

  if (intent.captions && !steps.some((st) => st.op === 'captions')) {
    steps.push({
      op: 'captions', args: { style: intent.captionStyle },
      label: `Add ${intent.captionStyle} captions`,
      detail: context.canTranscribe
        ? 'Transcribed from the audio and timed to it.'
        : 'Timed to where the speech actually is — you type the words once and they land on the right beats.',
    });
  }

  if (intent.title && !steps.some((st) => st.op === 'addTitle')) {
    steps.push({
      op: 'addTitle',
      args: { content: intent.title, preset: intent.hook ? 'hook' : 'headline', at: 0, dur: 2.2 },
      label: `Put "${truncate(intent.title, 34)}" on the opening`,
      detail: 'Animated in, inside the safe area so no platform button covers it.',
    });
  }

  if (intent.speed && intent.speed !== 1 && !steps.some((st) => st.op === 'speedRamp' || st.op === 'setSpeed')) {
    steps.push({
      op: 'setSpeed', args: { speed: intent.speed },
      label: intent.speed > 1 ? `Speed everything up ${intent.speed}×` : `Slow everything to ${intent.speed}×`,
      detail: intent.speed > 1 ? 'Audio is kept, at the new rate.' : 'Slow motion looks best on footage shot at 60fps or higher.',
    });
  }

  /* ---------------- 4. tell them what we could not do ---------------- */

  if (intent.beatSync && !ctx.hasMusic) {
    warnings.push('No music track found, so the cuts are evenly spaced rather than beat-matched. Import a song and ask again to sync them.');
  }
  if (intent.syncExisting && !onTimeline) {
    warnings.push('Nothing is on the timeline to re-time, so this builds a fresh edit instead. Drop your clips on a track first if you wanted to keep your own order.');
  }
  if (intent.logo) {
    warnings.push('I cannot add a logo I have not seen — import the image and drag it onto a track above the video.');
  }
  if (intent.reframe && !intent.ratio) {
    questions.push('What shape do you want it reframed to — 9:16 for TikTok, 16:9 for YouTube, or 1:1?');
  }
  if (!intent.targetDur && !intent.syncExisting && videos.length > 6) {
    questions.push(`You have ${videos.length} clips and did not say how long it should be. I have gone with a natural length — tell me a number of seconds if you want it tighter.`);
  }

  /* ---------------- 5. one last sanity pass ---------------- */
  steps = validateSteps(steps, ctx, warnings);

  return {
    intent,
    steps,
    warnings,
    questions,
    template: source ? { id: source.id, name: source.name, emoji: source.emoji } : null,
    summary: summarise(intent, steps, videos.length, ctx.wantRatio || ctx.ratio, source),
  };
}

/* ------------------------------------------------------------------ */
/* the generic composer, for requests that name no style               */
/* ------------------------------------------------------------------ */

function composeGeneric(intent, ctx, context, warnings) {
  const steps = [];
  const pace = ctx.pace || (ctx.targetDur && ctx.targetDur <= 20 ? 'fast' : 'medium');
  const PACE_SECONDS = { frantic: 0.6, fast: 0.9, medium: 2.2, slow: 4.5 };

  const ratio = ctx.wantRatio || ctx.ratio || '9:16';
  if (ratio !== ctx.ratio) {
    steps.push({
      op: 'setRatio', args: { ratio },
      label: `Switch the canvas to ${ratio}`,
      detail: ratio === '9:16'
        ? 'Full-screen on a phone, which is what TikTok, Reels and Shorts want.'
        : `Everything is reframed to ${ratio}.`,
    });
  }

  if (intent.syncExisting && ctx.onTimeline) {
    steps.push({
      op: 'syncToTrack',
      args: { every: pace === 'fast' ? 2 : pace === 'slow' ? 8 : 4, keepOrder: true, trim: true },
      label: `Re-time your cuts onto the beat${ctx.bpm ? ` (${ctx.bpm} BPM)` : ''}`,
      detail: 'Your clips, your order, your content — each cut is moved onto a beat. Nothing is replaced.',
    });
  } else if (intent.beatSync && ctx.hasMusic && ctx.bpm) {
    steps.push({
      op: 'beatCut',
      args: { targetDur: ctx.targetDur, every: pace === 'frantic' ? 1 : pace === 'fast' ? 2 : pace === 'slow' ? 8 : 4, shuffle: ctx.shuffle },
      label: `Cut on the beat at ${ctx.bpm} BPM`,
      detail: 'Every cut lands with the music instead of near it.',
    });
  } else {
    steps.push({
      op: 'layout',
      args: { targetDur: ctx.targetDur, clipLength: PACE_SECONDS[pace], shuffle: ctx.shuffle, pickBest: true },
      label: ctx.targetDur
        ? `Build a ${formatDur(ctx.targetDur)} cut from ${ctx.clipCount} clip${ctx.clipCount === 1 ? '' : 's'}`
        : `Lay ${ctx.clipCount} clip${ctx.clipCount === 1 ? '' : 's'} out at a ${pace} pace`,
      detail: `About ${PACE_SECONDS[pace]}s a shot, taking the most active part of each clip rather than the first few seconds.`,
    });
  }

  if (intent.look) {
    steps.push({
      op: 'applyLook', args: { look: intent.look, strength: 1 },
      label: `Grade everything with the ${lookName(intent.look)} look`,
      detail: 'Applied per clip, so you can change or remove it on any single shot.',
    });
  }

  if (intent.transition) {
    steps.push({
      op: 'addTransitions', args: { type: intent.transition, dur: pace === 'fast' ? 0.22 : 0.5 },
      label: `Put a ${transitionName(intent.transition)} on every cut`,
      detail: 'Drag either edge on the timeline to change one.',
    });
  } else if (!intent.noTransitions && (pace === 'slow' || pace === 'medium')) {
    steps.push({
      op: 'addTransitions', args: { type: 'dissolve', dur: pace === 'slow' ? 0.7 : 0.35 },
      label: 'Cross-dissolve between shots',
      detail: 'Short and unobtrusive.',
    });
  }

  if (intent.kenBurns || context.media.some((m) => m.kind === 'image')) {
    steps.push({
      op: 'kenBurns', args: { amount: 0.12 },
      label: 'Add a slow push on the photos',
      detail: 'A still on screen for three seconds looks broken; a gentle zoom fixes it.',
    });
  }

  if (ctx.hasMusic) {
    steps.push({
      op: 'fitMusic', args: { fadeOut: 1.2, duck: true },
      label: `Fit ${truncate(context.media.find((m) => m.kind === 'audio').name, 28)} to the edit`,
      detail: 'Trimmed to length with a fade at the end, and ducked under any voice.',
    });
  }

  if (intent.fadeEnds || pace === 'slow') {
    steps.push({ op: 'fadeEnds', args: { dur: 0.5 }, label: 'Fade in and out', detail: 'Half a second at each end.' });
  }

  void warnings;
  return steps;
}

/* ------------------------------------------------------------------ */
/* validation                                                          */
/* ------------------------------------------------------------------ */

/**
 * The last gate before a plan is shown.
 *
 * Every failure mode here is one I hit while building the templates: two of
 * the same effect fighting each other, a grade applied before the clips exist,
 * a transition longer than the shots it joins. Catching them here is why a
 * plan does not half-apply and leave a mess to undo.
 */
function validateSteps(steps, ctx, warnings) {
  const out = [];
  const seenEffects = new Set();

  // Anything that builds the timeline has to come before anything that
  // decorates it, whatever order the template or the model emitted.
  const RANK = {
    setRatio: 0, syncToTrack: 1, beatCut: 1, layout: 1, removeSilence: 2, setSpeed: 3, speedRamp: 3,
    applyLook: 4, addEffect: 5, beatZoom: 5, impactFrames: 5, kenBurns: 5, autoZoomSpeech: 5,
    addTransitions: 6, numberClips: 7, addTitle: 7, addSticker: 7, captions: 8, fitMusic: 9, fadeEnds: 10,
  };
  const ordered = [...steps].sort((a, b) => (RANK[a.op] ?? 5) - (RANK[b.op] ?? 5));

  for (const step of ordered) {
    if (step.op === 'addEffect') {
      const id = step.args?.effect;
      if (seenEffects.has(id)) continue;           // never stack two of one effect
      seenEffects.add(id);
    }
    // A transition longer than a third of the shortest shot eats the edit.
    if (step.op === 'addTransitions' && ctx.bpm && ctx.targetDur) {
      const shotLen = (60 / ctx.bpm) * 2;
      if (step.args.dur > shotLen / 3) step.args.dur = Number((shotLen / 3).toFixed(2));
    }
    out.push(step);
  }

  if (seenEffects.size > 6) {
    warnings.push('That is a lot of effects at once — untick a few if the preview gets sluggish. Export always renders at full quality regardless.');
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* wording                                                             */
/* ------------------------------------------------------------------ */

function summarise(intent, steps, clipCount, ratio, template) {
  // Read the ratio back out of the plan: if a step changes it, that is the
  // shape of the finished edit, whatever the project was set to before.
  const ratioStep = steps.find((s) => s.op === 'setRatio');
  const finalRatio = ratioStep?.args?.ratio || ratio;

  if (steps.some((s) => s.op === 'syncToTrack')) {
    const bits = [`Your existing cuts, re-timed onto the beat`];
    if (finalRatio !== ratio) bits.push(`and reframed to ${finalRatio}`);
    return `${bits.join(' ')}. ${steps.length} step${steps.length === 1 ? '' : 's'}, nothing replaced.`;
  }

  const bits = [];
  bits.push(intent.targetDur ? `A ${formatDur(intent.targetDur)} ${finalRatio} edit` : `A ${finalRatio} edit`);
  bits.push(`from ${clipCount} clip${clipCount === 1 ? '' : 's'}`);
  if (template) bits.push(`in the ${template.name.toLowerCase()} style`);
  else if (intent.beatSync) bits.push('cut to the music');
  else if (intent.pace === 'fast') bits.push('with fast cuts');
  else if (intent.pace === 'slow') bits.push('at a slow pace');
  if (intent.look) bits.push(`graded ${lookName(intent.look).toLowerCase()}`);
  if (intent.captions) bits.push('with captions');
  return `${bits.join(', ')}. ${steps.length} step${steps.length === 1 ? '' : 's'}.`;
}

function formatDur(s) {
  if (!s) return '';
  return s >= 60 ? `${(s / 60).toFixed(s % 60 ? 1 : 0)} minute` : `${Math.round(s)} second`;
}

const LOOK_NAMES = {
  cinematic: 'Teal & Orange', mono: 'Mono', noir: 'Noir', fade: 'Faded film', vhs: 'VHS',
  warm: 'Golden hour', cool: 'Cold open', neon: 'Neon night', moonlight: 'Moonlight',
  vivid: 'Vivid', punch: 'Punch', kodak: 'Kodak 2383', pastel: 'Pastel',
  bleach: 'Bleach bypass', sunburn: 'Sunburn',
};
function lookName(id) { return LOOK_NAMES[id] || id; }

const TRANSITION_NAMES = {
  zoomPunch: 'zoom punch', whip: 'whip pan', glitch: 'glitch', filmBurn: 'film burn',
  dipBlack: 'dip to black', dipWhite: 'dip to white', slideLeft: 'slide', spin: 'spin',
  blurDissolve: 'blur dissolve', circle: 'iris', wipe: 'wipe', dissolve: 'cross dissolve',
};
function transitionName(id) { return TRANSITION_NAMES[id] || id; }

function truncate(s, n) {
  const str = String(s);
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
}

/** Examples the panel offers when someone doesn't know what to type. */
export const EXAMPLES = [
  'Make a fast paced anime edit, cuts on the beat, impact frames and speed lines',
  'Sync the clips on my timeline to the audio track, keep my order',
  'Phonk drift edit with VHS, shake and a crushed black grade',
  'Cut all the silence out of my talking head video and add captions',
  'Velocity edit with speed ramps and heavy motion blur',
  '30 second TikTok trailer, teal and orange, big captions',
  'Slow cinematic 16:9 montage with a fade at the start and end',
  'Top 10 countdown with a number on every clip',
  'Blur out his face for the whole clip',
];
