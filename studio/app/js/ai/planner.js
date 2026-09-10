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
  };

  /* ---- how long ---- */
  const secs = s.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)\b/);
  const mins = s.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)\b/);
  const worded = s.match(new RegExp(`\\b(${Object.keys(NUM_WORDS).join('|')})\\s*(?:s|sec|second|seconds)\\b`));
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
  const steps = [];
  const warnings = [];

  const videos = context.media.filter((m) => m.kind === 'video' || m.kind === 'image');
  const music = context.media.find((m) => m.kind === 'audio');

  if (!videos.length && !music) {
    return {
      intent,
      steps: [],
      warnings: ['There is no footage to work with yet. Add some clips and ask again.'],
      summary: 'Nothing to edit yet.',
    };
  }

  /* ---- 1. canvas shape ---- */
  const ratio = intent.ratio || context.ratio || '9:16';
  if (ratio !== context.ratio) {
    steps.push({
      op: 'setRatio', args: { ratio },
      label: `Switch the canvas to ${ratio}`,
      detail: ratio === '9:16' ? 'Full-screen on a phone, which is what TikTok, Reels and Shorts all want.'
        : `Everything is re-framed to ${ratio}.`,
    });
  }

  /* ---- 2. lay the clips out ---- */
  const pace = intent.pace || (intent.targetDur && intent.targetDur <= 20 ? 'fast' : 'medium');
  let beats = null;
  if (intent.beatSync) {
    if (context.beats?.beats?.length) {
      beats = context.beats;
      steps.push({
        op: 'beatCut',
        args: { targetDur: intent.targetDur, every: pace === 'fast' ? 2 : pace === 'slow' ? 8 : 4, shuffle: intent.shuffle },
        label: `Cut on the beat at ${context.beats.bpm} BPM`,
        detail: `Every ${pace === 'fast' ? '2nd' : pace === 'slow' ? '8th' : '4th'} beat gets a cut, so the edit lands with the music instead of near it.`,
      });
    } else {
      warnings.push('No music track found, so the cuts are evenly spaced instead of beat-matched. Import a song and ask again to sync them.');
    }
  }
  if (!beats) {
    steps.push({
      op: 'layout',
      args: {
        targetDur: intent.targetDur,
        clipLength: PACE_SECONDS[pace],
        shuffle: intent.shuffle,
        pickBest: true,
      },
      label: intent.targetDur
        ? `Build a ${formatDur(intent.targetDur)} cut from ${videos.length} clip${videos.length === 1 ? '' : 's'}`
        : `Lay ${videos.length} clip${videos.length === 1 ? '' : 's'} out at a ${pace} pace`,
      detail: intent.targetDur
        ? `Each shot holds about ${PACE_SECONDS[pace]}s. Where a clip is longer than it needs to be, the most active part is used rather than the first few seconds.`
        : 'Clips go down in order, trimmed to a consistent length.',
    });
  }

  /* ---- 3. silence removal (before anything measures duration) ---- */
  if (intent.removeSilence) {
    steps.push({
      op: 'removeSilence', args: { minLen: 0.35, pad: 0.08 },
      label: 'Cut out the silences',
      detail: 'Gaps longer than a third of a second are removed and the timeline closes up behind them. This is the jump-cut look, done automatically.',
    });
  }

  /* ---- 4. speed ---- */
  if (intent.speed && intent.speed !== 1) {
    steps.push({
      op: 'setSpeed', args: { speed: intent.speed },
      label: intent.speed > 1 ? `Speed everything up ${intent.speed}×` : `Slow everything to ${intent.speed}×`,
      detail: intent.speed > 1 ? 'Audio on sped-up clips is kept, at the new rate.' : 'Slow motion looks best on footage shot at 60fps or higher.',
    });
  }

  /* ---- 5. look ---- */
  if (intent.look) {
    steps.push({
      op: 'applyLook', args: { look: intent.look, strength: 1 },
      label: `Grade everything with the ${lookName(intent.look)} look`,
      detail: 'Applied per clip, so you can change or remove it on any single shot afterwards.',
    });
  }

  /* ---- 6. transitions ---- */
  if (intent.transition) {
    steps.push({
      op: 'addTransitions', args: { type: intent.transition, dur: pace === 'fast' ? 0.22 : 0.5 },
      label: `Put a ${transitionName(intent.transition)} on every cut`,
      detail: 'Short enough to feel deliberate. Drag either edge on the timeline to change one.',
    });
  } else if (!intent.noTransitions && pace === 'slow') {
    steps.push({
      op: 'addTransitions', args: { type: 'dissolve', dur: 0.6 },
      label: 'Cross-dissolve between shots',
      detail: 'A slow montage reads better with dissolves than with hard cuts.',
    });
  }

  /* ---- 7. movement on stills ---- */
  if (intent.kenBurns || (videos.some((m) => m.kind === 'image') && pace !== 'fast')) {
    steps.push({
      op: 'kenBurns', args: { amount: 0.12 },
      label: 'Add a slow push on the photos',
      detail: 'A still image on screen for three seconds looks broken. A gentle zoom fixes it.',
    });
  }

  /* ---- 8. captions ---- */
  if (intent.captions) {
    steps.push({
      op: 'captions', args: { style: intent.captionStyle },
      label: `Add ${intent.captionStyle} captions`,
      detail: context.canTranscribe
        ? 'Transcribed from the audio, then timed to it.'
        : 'Timed to where the speech actually is in the audio — you type the words once and they land on the right beats. Connect a transcription key in Settings to skip the typing.',
    });
  }

  /* ---- 9. titles ---- */
  if (intent.title) {
    steps.push({
      op: 'addTitle',
      args: { content: intent.title, preset: intent.hook ? 'hook' : 'headline', at: 0, dur: 2.2 },
      label: `Put "${truncate(intent.title, 34)}" on the opening`,
      detail: 'Animated in, inside the safe area so no platform button covers it.',
    });
  }

  /* ---- 10. music ---- */
  if (music && !intent.noMusic) {
    steps.push({
      op: 'fitMusic', args: { fadeOut: 1.2, duck: true },
      label: `Fit ${truncate(music.name, 28)} to the edit`,
      detail: 'Trimmed to length with a fade at the end, and ducked under any voice on the timeline.',
    });
  }

  /* ---- 11. tops and tails ---- */
  if (intent.fadeEnds || pace === 'slow') {
    steps.push({
      op: 'fadeEnds', args: { dur: 0.5 },
      label: 'Fade in at the start and out at the end',
      detail: 'Half a second at each end.',
    });
  }

  return {
    intent,
    steps,
    warnings,
    summary: summarise(intent, steps, videos.length, ratio),
  };
}

/* ------------------------------------------------------------------ */
/* wording                                                             */
/* ------------------------------------------------------------------ */

function summarise(intent, steps, clipCount, ratio) {
  const bits = [];
  bits.push(intent.targetDur ? `A ${formatDur(intent.targetDur)} ${ratio} edit` : `A ${ratio} edit`);
  bits.push(`from ${clipCount} clip${clipCount === 1 ? '' : 's'}`);
  if (intent.beatSync) bits.push('cut to the music');
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
  'Make a 30 second TikTok trailer, fast cuts on the beat, teal and orange, big captions',
  'Cut all the silence out of my talking head video and add captions',
  'Turn this into a slow cinematic 16:9 montage with a fade at the start and end',
  'Make a 15 second Instagram reel, punchy, zoom transitions',
  'Black and white, slow, no transitions, 1 minute',
  'Beat sync these clips to the song and add a hook that says "wait for it"',
];
