/*
 * Understanding a specific instruction, offline.
 *
 * There are two brains behind the assistant. When a Worker is configured the
 * request goes to a real language model, which understands anything; this is
 * the other one, and it runs on the device with no network at all.
 *
 * It used to only recognise whole styles — "make it an anime edit" — so a
 * sentence like "mute the third clip and slow the last one to half speed" fell
 * through to a generic template. That is the thing that made the assistant
 * feel like it could only follow premade lines.
 *
 * This file does not try to be a language model. It does one thing a language
 * model does not need to be asked for: it recognises *direct instructions* —
 * a verb, a target, and a value — and turns them into the exact operations
 * apply.js runs. Between them they cover what people actually type.
 *
 * Where it cannot work out what somebody meant, it says so and hands over,
 * rather than guessing. A wrong edit applied confidently is worse than an
 * honest "I did not follow that". A rule that recognises the verb but not
 * enough to act on returns a question instead of a step — "delete what?" —
 * and the planner shows the question rather than inventing a target.
 */

import { EFFECT_WORDS, SHAPE_WORDS, ANIMATOR_WORDS, EXPRESSION_WORDS, NULL_WORDS, PARENT_WORDS,
  MUSIC_WORDS, MUSIC_ASK, MUSIC_VERB, AUDIO_FIX_WORDS, BG_REMOVE_WORDS, BEAT_CUT_WORDS,
  TRANSITION_WORDS, RATIO_WORDS, STICKER_WORDS, repairOptions, firstMatch } from './vocabulary.js';

/* ------------------------------------------------------------------ *
 * Which clips
 * ------------------------------------------------------------------ */

const ORDINALS = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6,
  seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5, '6th': 6, '7th': 7, '8th': 8, '9th': 9, '10th': 10,
};

const GENERIC_NAME = new Set(['clip', 'clips', 'video', 'videos', 'final', 'new', 'copy', 'edit', 'export', 'untitled', 'movie', 'film', 'img', 'mov', 'mp4', 'vid', 'shot', 'take', 'the', 'and', 'for', 'with']);

/* Targets that are layers rather than shots. */
const LAYER = new Set(['title', 'titles', 'shape', 'shapes', 'null', 'sticker', 'music']);

/**
 * Pull a target out of a phrase.
 *
 * Returns undefined when nothing was named, which means "all" — "add grain"
 * with no target is a whole-timeline instruction and should stay one.
 */
export function parseTarget(text, names = []) {
  const s = ` ${String(text || '').toLowerCase()} `;

  // A clip by what its file is called: "the drone shot", "slow down IMG_4472".
  // A stem has to be a real word of the name, three letters or more, and not
  // one of the words every file has — "clip", "video", "final", "new".
  for (const name of names) {
    const base = String(name || '').replace(/\.[a-z0-9]{2,4}$/i, '');
    if (base.length >= 3 && s.includes(` ${base.toLowerCase()} `)) return { media: base };
    const stems = base.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !GENERIC_NAME.has(w));
    for (const stem of stems) {
      if (new RegExp(`(?:^|[^a-z0-9])${stem}(?:$|[^a-z0-9])`).test(s) && !/^\d+$/.test(stem)) return { media: base, stem };
    }
  }

  // Layers that are not shots, by kind.
  if (/\b(every|all( the)?)\s+titles?\b|\bthe titles\b/.test(s)) return 'titles';
  if (/\b(the|my|this|that)\s+(title|text|headline|logo text|caption|words)\b|\bthe logo\b/.test(s)) return 'title';
  if (/\b(the|my|this)\s+shapes\b/.test(s)) return 'shapes';
  if (/\b(the|my|this)\s+shape\b/.test(s)) return 'shape';
  if (/\b(the|my|this)\s+null\b/.test(s)) return 'null';
  if (/\b(the|my|this)\s+sticker\b/.test(s)) return 'sticker';
  // The music is a clip too, and "the song" never means a shot.
  if (/\b(the|my|this|that)\s+(music|song|beat|backing track|soundtrack|audio track|music track)\b/.test(s)) return 'music';

  if (/\b(this|the selected|selected|these)\s+(clip|one|shot|clips|ones|shots|two|three)\b|\bthese\b|\bthis one\b|\bthe selection\b/.test(s)) return 'selected';
  if (/\b(every|all|each)\s+(clip|shot|one)\b|\bto (all|everything)\b|\bthe whole (thing|timeline|video|edit)\b|\beverything\b|\ball of (it|them)\b/.test(s)) return 'all';
  if (/\b(last|final|ending|closing)\s+(clip|shot|one)\b/.test(s)) return 'last';
  if (/\b(first|opening|starting)\s+(clip|shot|one)\b/.test(s)) return 'first';
  if (/\bevery other\b|\balternate\b/.test(s)) return 'odd';

  // "the last two", "the first three"
  const many = s.match(/\b(last|first)\s+(\d+|two|three|four|five)\s+(clips|shots|ones)\b/);
  if (many) {
    const words = { two: 2, three: 3, four: 4, five: 5 };
    const n = Number(many[2]) || words[many[2]] || 2;
    return many[1] === 'first' ? `1-${n}` : { tail: n };
  }

  // "clips 2 to 5", "clips 2-5" — but not "clip 2 to 3 seconds" or "clip 1 to 50%".
  const range = s.match(/\bclips?\s+(\d+)\s*(?:-|–|to|through|thru)\s*(\d+)\b(?!\s*(?:%|s\b|sec|second|x\b|times|degrees|°|fps|bpm|percent))/);
  if (range) return `${range[1]}-${range[2]}`;

  // "clip 3", "shot 3", "the 3rd clip", "the third one"
  const numbered = s.match(/\b(?:clip|shot)\s+#?(\d+)\b/) || s.match(/\bnumber\s+(\d+)\b/);
  if (numbered) return Number(numbered[1]);

  for (const [word, n] of Object.entries(ORDINALS)) {
    if (new RegExp(`\\b${word}\\s+(clip|shot|one)\\b`).test(s)) return n;
  }

  // "from 3 to 8 seconds", "between 2s and 5s", "the first 10 seconds"
  const span = s.match(/\b(?:from|between)\s+([\d.]+)\s*s?\s*(?:to|and|-|–)\s*([\d.]+)\s*s(?:ec|econds)?\b/);
  if (span) return { from: Number(span[1]), to: Number(span[2]) };
  const head = s.match(/\bfirst\s+([\d.]+)\s*s(?:ec|econds)?\b/);
  if (head) return { from: 0, to: Number(head[1]) };
  const after = s.match(/\bafter\s+([\d.]+)\s*s(?:ec|econds)?\b/);
  if (after) return { from: Number(after[1]), to: Infinity };

  return undefined;
}

/* ------------------------------------------------------------------ *
 * Numbers
 * ------------------------------------------------------------------ */

const NUMBER_WORDS = {
  half: 0.5, double: 2, twice: 2, triple: 3, quarter: 0.25,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

/**
 * The sentence with its clip references taken out, so a number that names a
 * clip is never read as a value. "slow down clip 4" used to come back as a
 * quarter speed, and "trim clip 2 to 3 seconds" as clips 2 to 3.
 */
function values(s) {
  return String(s)
    .replace(/\b(?:clips?|shots?)\s+#?\d+(?:\s*(?:-|–|to|through|thru)\s*\d+(?!\s*(?:%|s\b|sec|second|x\b|times|degrees|°|fps|bpm|percent)))?\b/g, ' ')
    .replace(/\bnumber\s+\d+\b/g, ' ')
    .replace(/\b\d+(?:st|nd|rd|th)\s+(?:clip|shot|one)\b/g, ' ')
    .replace(/\b(?:first|last)\s+(?:\d+|two|three|four|five)\s+(?:clips|shots|ones)\b/g, ' ');
}

/** A multiplier from "2x", "half speed", "to 0.5", "double". */
function parseMultiplier(s) {
  const v = values(s);
  const x = v.match(/\b([\d.]+)\s*(?:x|times)\b/);
  if (x) return Number(x[1]);
  const pct = v.match(/\b([\d.]+)\s*(?:%|percent)/);
  if (pct) return Number(pct[1]) / 100;
  for (const [word, n] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b(?!\\s+(?:seconds?|clips?|shots?|ones?))`).test(v)) return n;
  }
  const to = v.match(/\b(?:to|at)\s+([\d.]+)\s*(?:speed)?\b(?!\s*(?:seconds?|s\b|%|degrees))/);
  if (to && Number(to[1]) > 0 && Number(to[1]) <= 10) return Number(to[1]);
  return null;
}

/** Seconds from "2 seconds", "1.5s", "half a second", "two seconds". */
function parseSeconds(s) {
  const v = values(s);
  const m = v.match(/\b([\d.]+)\s*s(?:ec|ecs|econd|econds)?\b/);
  if (m) return Number(m[1]);
  if (/\bhalf a second\b/.test(v)) return 0.5;
  if (/\b(?:a|one) second\b/.test(v)) return 1;
  const w = v.match(/\b(two|three|four|five|six|seven|eight|nine|ten)\s+seconds?\b/);
  if (w) return NUMBER_WORDS[w[1]];
  const mins = v.match(/\b([\d.]+)\s*min(?:ute|utes)?\b/);
  if (mins) return Number(mins[1]) * 60;
  if (/\b(?:a|one) minute\b/.test(v)) return 60;
  if (/\bhalf a minute\b/.test(v)) return 30;
  return null;
}

/** A percentage as a fraction, from "50%" or "50 percent". */
function parsePercent(s) {
  const m = values(s).match(/\b([\d.]+)\s*(?:%|percent)/);
  return m ? Number(m[1]) / 100 : null;
}

/* ------------------------------------------------------------------ *
 * The instructions
 * ------------------------------------------------------------------ */

/*
 * Each rule is a phrasing, and what it means.
 *
 * Ordered most specific first, because "make it black and white" and "make it
 * faster" both start with "make it" and the first match wins. A rule returns
 * the step it produces, `{ ask }` when it matched the verb but not enough to
 * act on — which is how "delete it" (delete what?) asks instead of guessing —
 * or null to let the sentence fall through.
 */
/* "remove the <thing>" — as opposed to removing an effect, a clip, the audio, a gap. */
const ERASE_THING = /\b(remove|get rid of|erase|take out|cut out|delete|hide|wipe out|paint out)\s+(the|that|this|my|a|an|those|these)\s+([a-z][a-z' -]{1,40}?)(?=\s+(from|in|out of)\b|\s*[.!]?\s*$)/i;
const EDIT_NOUNS = /\b(effect|effects|filter|filters|look|grade|audio|sound|music|song|track|clip|clips|shot|shots|cut|cuts|title|titles|text|sticker|stickers|transition|transitions|watermark|caption|captions|subtitle|subtitles|layer|layers|silence|silences|gap|gaps|noise|hum|hiss|frame|frames|second|seconds|keyframe|keyframes|expression|animator|mask|masks|marker|markers|selection|everything|all of it|last one|first one|beat|background|colou?rs?|grading|fade|fades|zoom|blur|glow|shake|grain)\b/i;
const REMOVAL = /\b(remove|take off|take out|get rid of|without|clear|delete|drop|kill|lose|turn off|switch off|undo)\b|\bno\b/;

const nice = (id) => String(id).replace(/([A-Z])/g, ' $1').toLowerCase().trim();

const RULES = [
  /* ---- motion design: the specific phrase before the general word ---- */
  {
    id: 'parent',
    test: (s) => PARENT_WORDS.test(s) && !/\bparental\b/.test(s) && !/\bfollow (for|me|us|along)\b/.test(s) && !/\b(title|text)\b.{0,20}\b(says|saying|reads)\b/.test(s),
    build: (s, target) => {
      const m = s.match(/\b(?:parent|attach|pin|stick)\b(.*?)\bto\b(.*)$/) || s.match(/^(.*?)\bfollows?\b(.*)$/);
      if (!m) return null;
      const child = parseTarget(m[1]) ?? target ?? 'selected';
      const parent = parseTarget(m[2]) ?? (/\bnull\b|\bit\b|\bthat\b/.test(m[2]) ? 'null' : null);
      if (parent === null) return { ask: 'Follow what? Say "parent the title to the null" or "make clip 2 follow the logo".' };
      return { op: 'setParent', args: { target: child, parent },
        label: `${describe(child)} follows ${describe(parent)}`, detail: 'Position, scale and rotation come from the parent from now on.' };
    },
  },
  {
    id: 'null',
    test: (s) => NULL_WORDS.test(s),
    build: () => ({ op: 'addNull', args: {}, label: 'Add a null object', detail: 'An invisible layer to parent things to.' }),
  },
  {
    id: 'animator',
    test: (s) => Boolean(firstMatch(ANIMATOR_WORDS, s)),
    build: (s, target) => {
      const hit = firstMatch(ANIMATOR_WORDS, s);
      const t = target === undefined || target === 'all' || target === 'selected' ? 'titles' : target;
      return { op: 'textAnimator', args: { target: t, preset: hit[1] },
        label: `${nice(hit[1])} on ${describe(t)}`, detail: 'A text animator; open the title to change its timing.' };
    },
  },
  {
    id: 'shape',
    test: (s) => Boolean(firstMatch(SHAPE_WORDS, s)) && /\b(add|put|draw|make|give|with|a|an)\b/.test(s) && !REMOVAL.test(s),
    build: (s) => {
      const hit = firstMatch(SHAPE_WORDS, s);
      const at = Number((values(s).match(/\bat\s+([\d.]+)\s*s\b/) || [])[1]) || 0;
      return { op: 'addShape', args: { preset: hit[1], at }, label: `Add a ${nice(hit[1])}`, detail: 'A shape layer on its own track, animating itself.' };
    },
  },
  {
    id: 'expression',
    test: (s, target) => {
      const hit = expressionHit(s);
      if (!hit) return false;
      // "fade in and out" on shots is a fade, not an opacity expression.
      if (hit[1] === 'fadeInOut' && !LAYER.has(target)) return false;
      return true;
    },
    build: (s, target) => {
      const hit = expressionHit(s);
      return { op: 'addExpression', args: { target, preset: hit[1] },
        label: `${nice(hit[1])} on ${describe(target)}`, detail: 'An expression, not keyframes: it runs for the whole clip.' };
    },
  },
  /* The background, which is a matte and not a patch. */
  {
    id: 'remove-background',
    test: (s) => BG_REMOVE_WORDS.test(s),
    build: (s, target) => ({ op: 'addEffect', args: { target: target ?? 'all', effect: 'removeBackground', params: {} },
      label: `Remove the background on ${describe(target)}`,
      detail: 'The background is worked out from the clip itself — no green screen. Adjust the sensitivity in the Effects panel.' }),
  },
  /* The sound is bad. Named parts if they were named, all of it if not. */
  {
    id: 'repair-audio',
    test: (s) => AUDIO_FIX_WORDS.test(s),
    build: (s, target) => {
      const opts = repairOptions(s);
      const parts = [opts.hum && 'hum', opts.noise && 'hiss', opts.clicks && 'clicks', opts.level && 'level'].filter(Boolean);
      const t = target === 'music' ? null : target;
      return { op: 'repairAudio', args: { target: t ?? null, ...opts },
        label: `Clean up the audio${t ? ` on ${describe(t)}` : ''}`,
        detail: `${parts.join(', ')} — spectral noise reduction, a notch at the mains frequency, de-clicking and levelling. The original stays on disk.` };
    },
  },
  /* The music under a voice. */
  {
    id: 'duck',
    test: (s) => /\bduck\b|\bunder (my|the) (voice|talking|speech|dialogue)\b|\blower the music when\b|\bmusic (down|quieter) (when|while|under)\b/.test(s),
    build: () => ({ op: 'duckMusic', args: { on: true }, label: 'Duck the music under the voice',
      detail: 'The music track dips whenever there is speech on another track, and comes back up between lines.' }),
  },
  /* Taking the music off again. */
  {
    id: 'remove-music',
    test: (s) => /\b(remove|delete|take (off|out|away)|get rid of|drop|kill|lose|no more)\b.{0,12}\b(the |my |this |that )?(music|song|beat|soundtrack|backing track|audio track)\b/.test(s),
    build: () => ({ op: 'deleteClips', args: { target: 'music', ripple: false }, label: 'Take the music off',
      detail: 'The track comes off the timeline; the file stays in your media.' }),
  },
  /* A beat at a tempo, made here. */
  {
    id: 'generate-beat',
    test: (s) => /\b(\d{2,3})\s*bpm\b|\b(beat|track|music)\b.{0,20}\bat\s+(\d{2,3})\b(?!\s*(?:s\b|sec|second|%))/.test(s) && /\b(add|make|generate|put|give|need|want|create|drop)\b/.test(s),
    build: (s) => {
      const bpm = Number((s.match(/\b(\d{2,3})\s*bpm\b/) || s.match(/\bat\s+(\d{2,3})\b/) || [])[1]) || null;
      const hit = firstMatch(MUSIC_WORDS, s);
      return { op: 'generateBeat', args: { style: hit ? hit[1] : 'trap', bpm, seconds: 32 },
        label: `Make a ${hit ? hit[1] : 'trap'} beat at ${bpm} BPM`, detail: 'Written on the device, so the beat grid is exact and nothing gets claimed.' };
    },
  },
  /* Music, by style or by mood, out of the library. */
  {
    id: 'music',
    test: (s) => !/\b(remove|delete|mute|quieter|louder|fade|duck|volume|turn)\b/.test(s)
      && (MUSIC_ASK.test(s) || (Boolean(firstMatch(MUSIC_WORDS, s)) && (MUSIC_VERB.test(s) || s.split(' ').length <= 3))),
    build: (s) => {
      const hit = firstMatch(MUSIC_WORDS, s);
      const secs = Number((values(s).match(/\b(\d+)\s*(s|sec|secs|seconds)\b/) || [])[1]) || null;
      return { op: 'addMusic', args: { style: hit ? hit[1] : null, want: s, seconds: secs },
        label: hit ? `Add a ${hit[1]} track` : 'Add music from the library',
        detail: 'Written on the device from the library — nothing to licence, and the beat grid is exact.' };
    },
  },
  /* Keep my clips, move the cuts onto the beat. */
  {
    id: 'sync',
    test: (s) => /\bsync\b|\bre-?time\b|\bline (them|it|the clips|my clips) up\b|\bmatch (the )?(cuts?|clips?|edit) (to|with) the (beat|music|song|track)\b|\b(cuts?|clips?|it|this|them) (on|to|onto) the beat\b|\bcut (it |this |them )?(on|to) the beat\b|\bon beat\b/.test(s)
      && !BEAT_CUT_WORDS.test(s.replace(/\bcut\b/g, 'cut')) || /\bsync\b|\bre-?time\b|\bkeep my order\b/.test(s),
    build: (s) => ({ op: 'syncToTrack', args: { every: /\bfast|every beat|quick\b/.test(s) ? 2 : /\bslow|every (four|4|8|eight)\b/.test(s) ? 8 : 4, keepOrder: true, trim: true },
      label: 'Re-time your cuts onto the beat', detail: 'Your clips, your order — each cut is moved onto a beat. Nothing is replaced.' }),
  },
  /* Dead air. */
  {
    id: 'silence',
    test: (s) => /\b(remove|cut|strip|delete|trim|kill|lose|get rid of|take out|edit out|chop)\b.{0,24}\b(silen|dead ?air|pauses?|gaps?|the umm?s?|filler)\b|\b(silences?|dead ?air|pauses?)\b.{0,20}\b(out|gone|removed)\b|\btighten( it| this| them| the edit)?( up)?\b|\bjump ?cut (it|this|the video)\b|\bcut the (fat|waffle|dead space)\b/.test(s),
    build: () => ({ op: 'removeSilence', args: { minLen: 0.35, pad: 0.08 }, label: 'Cut out the silences',
      detail: 'Gaps longer than a third of a second go, and the timeline closes up behind them.' }),
  },
  /* A thing in the picture, by name: "remove the can", "get rid of the sign in the back". */
  {
    id: 'erase',
    test: (s) => ERASE_THING.test(s) && !firstMatch(EFFECT_WORDS, s) && !EDIT_NOUNS.test(s.match(ERASE_THING)?.[3] || '') && !/\b(the )?(title|captions?|subtitles?|music|song|transitions?|effects?|clips?|shots?|last|first)\b/.test(s.match(ERASE_THING)?.[3] || ''),
    build: (s, target) => {
      const what = (s.match(ERASE_THING)?.[3] || 'that').trim().replace(/\s+(from|in|out of)\s+.*$/, '');
      return { op: 'eraseObject', args: { target, what },
        label: `Remove the ${what} from the shot`, detail: 'Tap it in the picture when the viewer asks; it is followed through the shot and filled in behind.' };
    },
  },
  /* An effect off again, by name: "take the glow off", "remove the shake from clip 2". */
  {
    id: 'remove-effect',
    test: (s) => Boolean(firstMatch(EFFECT_WORDS, s)) && /\b(remove|take\b.{0,20}\boff|take (out|away)|get rid of|delete|clear|kill|lose|turn off|switch off|undo|no more)\b/.test(s),
    build: (s, target) => {
      const hit = firstMatch(EFFECT_WORDS, s);
      return { op: 'removeEffect', args: { target, effect: hit[1] },
        label: `Take the ${nice(hit[1])} off ${describe(target)}`, detail: '' };
    },
  },
  {
    id: 'clearEffects',
    test: (s) => /\b(remove|take off|clear|get rid of|delete|strip|kill|turn off|switch off|disable|no more)\b.*\b(effects?|filters?|fx)\b|\b(no|without) (effects|filters)\b/.test(s),
    build: (s, target) => ({ op: 'removeEffect', args: { target },
      label: `Clear effects on ${describe(target)}`, detail: '' }),
  },
  {
    id: 'effect',
    test: (s) => Boolean(firstMatch(EFFECT_WORDS, s)) && !/\b(remove|take\b.{0,20}\boff|get rid of|without|no|clear|delete)\b/.test(s),
    build: (s, target) => {
      const hit = firstMatch(EFFECT_WORDS, s);
      return { op: 'addEffect', args: { target: target ?? 'all', effect: hit[1], params: hit[2] || {} },
        label: `${nice(hit[1])} on ${describe(target)}`, detail: 'Change its settings in the Effects panel.' };
    },
  },
  /* The shape of the canvas. */
  {
    id: 'ratio',
    test: (s) => (/\b(make|change|switch|convert|turn|set|flip|crop|reframe|resize|export|format)\b.{0,30}\b(vertical|horizontal|landscape|portrait|square|widescreen|9:16|16:9|1:1|4:5|2\.39|cinemascope|anamorphic)\b/.test(s)
      || /\b(for|to|into) (tiktok|youtube|instagram|reels?|shorts?|stories|a phone|phones)\b/.test(s) && !/\b(post|upload|share|send|export)\b/.test(s)
      || /^(9:16|16:9|1:1|4:5|vertical|landscape|square|portrait|widescreen)$/.test(s.trim())),
    build: (s) => {
      const hit = firstMatch(RATIO_WORDS, s.replace(/\bphone\b/, 'vertical'));
      if (!hit) return { ask: 'Which shape — 9:16 for TikTok, 16:9 for YouTube, or 1:1?' };
      return { op: 'setRatio', args: { ratio: hit[1] }, label: `Switch the canvas to ${hit[1]}`,
        detail: hit[1] === '9:16' ? 'Full-screen on a phone, which is what TikTok, Reels and Shorts want.' : `Everything is reframed to ${hit[1]}; nothing is cut.` };
    },
  },
  /* Words on the picture. */
  {
    id: 'title',
    test: (s) => /\b(add|put|insert|drop|place|give|make|create|show|write|overlay)\b.{0,30}\b(title|text|heading|headline|words|lower third|end ?card|hook)\b|\b(title|text|headline)\b.{0,10}\b(that )?(says|saying|reads|reading)\b/.test(s)
      && !/\bcaptions?\b|\bsubtitles?\b|\banimat|\bletter by letter|\btype (it |the title )?on\b/.test(s),
    build: (s, target, ctx) => {
      const raw = ctx.raw || s;
      const quoted = raw.match(/["“]([^"”]{1,90})["”]/) || raw.match(/'([^']{2,90})'/);
      const said = s.match(/\b(?:says?|saying|reads?|reading|that reads|with the words?)\s+(.{1,80}?)(?=\s+(?:at|on|for|in|over|across)\s+(?:\d|the (?:start|end|opening|beginning|top|bottom|middle))|\s*$)/);
      let content = quoted ? quoted[1] : said ? said[1].replace(/^["']|["']$/g, '').replace(/[.!?]+$/, '').trim() : null;
      if (content && !quoted) {
        // Keep the original's capitals: "add a title that says GO" is GO, not go.
        const i = raw.toLowerCase().indexOf(content.toLowerCase());
        if (i >= 0) content = raw.slice(i, i + content.length);
      }
      if (!content) return { ask: 'What should it say? Put the words in quotes: add a title that says "SUMMER".' };
      const v = values(s);
      let at = 0;
      const atSecs = v.match(/\bat\s+([\d.]+)\s*s(?:ec|econds)?\b/);
      if (atSecs) at = Number(atSecs[1]);
      else if (/\b(at|on|for|over) the (end|ending|last|close)\b|\bend ?card\b/.test(s)) at = -2.6;
      else if (/\bin the middle\b|\bhalfway\b/.test(s)) at = 'middle';
      const preset = /\blower third\b/.test(s) ? 'lower' : /\bend ?card\b|\bat the end\b/.test(s) ? 'endcard' : /\bhook\b/.test(s) ? 'hook' : /\bquote\b/.test(s) ? 'quote' : /\bsubtitle\b/.test(s) ? 'subtitle' : /\bglitch/.test(s) ? 'glitchy' : 'headline';
      const dur = parseSeconds(v.replace(/\bat\s+[\d.]+\s*s(?:ec|econds)?\b/, '')) || 2.2;
      return { op: 'addTitle', args: { content, preset, at, dur },
        label: `Put "${content.length > 34 ? `${content.slice(0, 33)}…` : content}" on ${at === 0 ? 'the opening' : at === 'middle' ? 'the middle' : at < 0 ? 'the end' : `${at}s`}`,
        detail: 'Animated in, inside the safe area so no platform button covers it.' };
    },
  },
  /* Captions, timed to the speech. */
  {
    id: 'captions',
    test: (s) => (/\b(add|put|make|generate|create|turn on|give|want|need|auto)\b.{0,20}\b(captions?|subtitles?|subs)\b|^\s*(captions?|subtitles?)\s*$|\b(caption|subtitle)\s+(this|it|the video|everything|him|her|them)\b|\bauto[- ]?captions?\b|\bwith captions\b/.test(s))
      && !REMOVAL.test(s),
    build: (s) => {
      const style = /\bkaraoke\b|\bword by word\b|\bhighlight/.test(s) ? 'karaoke' : /\bbig\b|\bbold\b|\bimpact\b|\bhuge\b/.test(s) ? 'bold' : /\byoutube\b|\bclean\b|\bbroadcast\b|\bsimple\b|\bplain\b/.test(s) ? 'clean' : 'tiktok';
      return { op: 'captions', args: { style }, label: `Add ${style} captions`,
        detail: 'Timed to where the speech actually is. Change the look in the Text panel afterwards.' };
    },
  },
  /* Transitions between the shots. */
  {
    id: 'transitions',
    test: (s) => (/\b(add|put|use|give|make|insert|with)\b.{0,24}\b(transitions?|dissolves?|cross ?fades?|wipes?|whip pans?|zoom punch(es)?)\b|\b(dissolve|cross ?fade|whip pan|whip|glitch|wipe|slide|spin|zoom punch|dip to black|fade to black|film burn|iris)\b.{0,30}\b(between|on every cut|on each cut|between the (clips|shots)|between every (clip|shot)|on the cuts)\b|^\s*(add )?transitions?\s*$/.test(s))
      && !REMOVAL.test(s),
    build: (s) => {
      const hit = firstMatch(TRANSITION_WORDS, s);
      const type = hit ? hit[1] : 'dissolve';
      const dur = parseSeconds(s) || (/\bfast|quick|short|snappy\b/.test(s) ? 0.22 : /\bslow|long|soft\b/.test(s) ? 0.7 : 0.4);
      return { op: 'addTransitions', args: { type, dur }, label: `Put a ${nice(type)} on every cut`,
        detail: 'Drag either edge on the timeline to change one.' };
    },
  },
  {
    id: 'remove-transitions',
    test: (s) => /\b(remove|take off|take out|get rid of|delete|clear|kill|lose|no|without)\b.{0,16}\b(the )?(transitions?|dissolves?|cross ?fades?)\b|\bhard cuts? only\b|\bstraight cuts\b/.test(s),
    build: (s, target) => ({ op: 'removeTransitions', args: { target }, label: `Take the transitions off ${describe(target)}`, detail: 'Straight cuts.' }),
  },
  /* A sticker or an emoji. */
  {
    id: 'sticker',
    test: (s) => (/\b(add|put|drop|place|stick|slap|throw)\b.{0,24}\b(emoji|sticker|arrow|circle|box|burst|bubble|scribble|spotlight|focus|fire|heart|skull|eyes|star|money|clap|tick|check ?mark|100|laughing|countdown)\b/.test(s) || /\p{Extended_Pictographic}/u.test(s))
      && !REMOVAL.test(s),
    build: (s, target, ctx) => {
      const raw = ctx.raw || s;
      const emoji = raw.match(/\p{Extended_Pictographic}(?:️)?/u);
      const hit = firstMatch(STICKER_WORDS, s);
      const kind = emoji ? 'emoji' : hit ? hit[1] : 'emoji';
      const value = emoji ? emoji[0] : hit ? hit[2] : '🔥';
      const at = Number((values(s).match(/\bat\s+([\d.]+)\s*s(?:ec|econds)?\b/) || [])[1]) || 0;
      const anim = /\bpoint(ing)?\b/.test(s) ? 'point' : /\bbounc/.test(s) ? 'bounce' : 'pop';
      const y = /\b(top|above)\b/.test(s) ? 0.2 : /\b(bottom|below)\b/.test(s) ? 0.78 : 0.4;
      return { op: 'addSticker', args: { kind, value, at, dur: 1.6, y, anim },
        label: `Add ${kind === 'emoji' ? value : `an ${value}`} sticker at ${at}s`, detail: 'Drag it in the viewer to move it; the Stickers panel has the rest.' };
    },
  },
  /* ---- sound on the shots ---- */
  {
    id: 'mute',
    test: (s) => /\b(mute|muted|muting|silence|silenced|kill the (audio|sound)|no sound on|turn the sound off|sound off|audio off)\b/.test(s) && !/\bun-?mute\b|\bsilences\b|\bdead air\b/.test(s),
    build: (s, target) => ({ op: 'setVolume', args: { target, mute: true },
      label: `Mute ${describe(target)}`, detail: 'The picture stays; the sound goes.' }),
  },
  {
    id: 'unmute',
    test: (s) => /\bun-?mute\b|\bbring the (sound|audio) back\b|\bsound back on\b|\bturn the sound (back )?on\b/.test(s),
    build: (s, target) => ({ op: 'setVolume', args: { target, mute: false },
      label: `Unmute ${describe(target)}`, detail: 'Sound back on.' }),
  },
  {
    id: 'volume',
    test: (s) => /\b(volume|louder|quieter|softer|turn (it |the sound |the audio |the music |the volume )?(up|down)|turn (up|down)|lower the (volume|sound|audio|music)|raise the (volume|sound|audio|music)|too loud|too quiet|can'?t hear|(volume|sound|audio) (up|down))\b/.test(s),
    build: (s, target) => {
      let v = parsePercent(s);
      if (v === null) {
        if (/\blouder|turn (it |the \w+ )?up|raise|too quiet|can'?t hear|volume up|sound up|audio up\b/.test(s)) v = 1.4;
        else if (/\bquieter|softer|turn (it |the \w+ )?down|lower|too loud|volume down|sound down|audio down\b/.test(s)) v = 0.6;
      }
      if (v === null) return { ask: 'Up or down? Say "louder", "quieter", or a number like "volume 50%".' };
      return { op: 'setVolume', args: { target, volume: v },
        label: `Volume to ${Math.round(v * 100)}% on ${describe(target)}`, detail: '' };
    },
  },
  /* ---- time ---- */
  {
    id: 'speed',
    test: (s) => /\b(speed|speeding|slow|slowing|fast|faster|slower|slo-?mo|slow motion|quicker|timelapse|hyperlapse)\b/.test(s) && !/\b(fast cuts?|quick cuts?|speed ?lines?|speed ?ramp)\b/.test(s),
    build: (s, target) => {
      let v = parseMultiplier(s);
      if (v === null) {
        if (/\bslow(er)?\b|\bslo-?mo\b|\bslow motion\b/.test(s)) v = 0.5;
        else if (/\bfast(er)?\b|\bspeed (it |them |this )?up\b|\bquicker\b|\btimelapse\b|\bhyperlapse\b/.test(s)) v = 2;
      }
      if (!v) return { ask: 'Faster or slower, and by how much? Say "2x faster" or "half speed".' };
      // "slow it down 2x" means half speed, not double.
      if (/\bslow/.test(s) && v > 1) v = 1 / v;
      return { op: 'setClipSpeed', args: { target, speed: v },
        label: `${v}× on ${describe(target)}`,
        detail: v < 1 ? 'Longer on the timeline, because the shot now takes more time.'
          : 'Shorter on the timeline, and everything after it moves up.' };
    },
  },
  /* ---- colour ---- */
  {
    id: 'blackwhite',
    test: (s) => /\bblack and white\b|\bblack & white\b|\bgreyscale\b|\bgrayscale\b|\bmonochrome\b|\bmono\b|\bdesaturate\b|\bno colou?r\b|\bcolou?rless\b/.test(s) && !/\bnot black and white\b|\bkeep the colou?r/.test(s),
    build: (s, target) => ({ op: 'setColor', args: { target, saturation: -100 },
      label: `Black and white on ${describe(target)}`, detail: 'Saturation all the way down.' }),
  },
  {
    id: 'brightness',
    test: (s) => /\b(bright|brighter|brighten|brightening|dark|darker|darken|darkening|expos\w*|too dim|lighter|lighten|blown out|washed out)\b/.test(s) && !/\bdark (beat|drill|phonk|trap|track|music|song|vibe|mood|edit|grade|look)\b/.test(s),
    build: (s, target) => {
      // "too dark" wants more light; "too bright" wants less.
      const up = /\btoo dark|so dark|very dark|really dark|can'?t see|too dim|underexposed|not bright enough|brighter|brighten|lighter|lighten\b/.test(s)
        || (/\bbright/.test(s) && !/\btoo bright|so bright|way too bright|blown out|overexposed\b/.test(s));
      const amt = Number((values(s).match(/\b(\d+)\s*%/) || [])[1]);
      const v = (amt ? Math.min(100, amt) : 25) * (up ? 1 : -1);
      return { op: 'setColor', args: { target, exposure: v },
        label: `${up ? 'Brighter' : 'Darker'} on ${describe(target)}`, detail: `Exposure ${v > 0 ? '+' : ''}${v}.` };
    },
  },
  {
    id: 'saturation',
    test: (s) => /\b(saturat|more colou?r|less colou?r|vivid|punchy colou?r|colou?rs? pop|pop the colou?rs?|vibrant|colou?rful|washed out colou?r)/.test(s),
    build: (s, target) => {
      const down = /\bless|de-?satur|too (much )?colou?r|too saturated\b/.test(s);
      return { op: 'setColor', args: { target, saturation: down ? -40 : 35 },
        label: `${down ? 'Less' : 'More'} colour on ${describe(target)}`, detail: '' };
    },
  },
  {
    id: 'contrast',
    test: (s) => /\bcontrast\b|\bflat(ter)?\b|\bpunchier\b|\bmore punch\b|\bcrushed blacks?\b|\bdeeper blacks?\b/.test(s),
    build: (s, target) => {
      const down = /\bless contrast|flat|too (much )?contrast|too contrasty\b/.test(s);
      return { op: 'setColor', args: { target, contrast: down ? -30 : 35 },
        label: `${down ? 'Less' : 'More'} contrast on ${describe(target)}`, detail: '' };
    },
  },
  {
    id: 'warmth',
    test: (s) => /\b(warm|warmer|warm (it|this|them) up|cooler|cool (it|this|them|down)|cool down|colder|orange tint|blue tint|temperature|more orange|more blue|too warm|too cold|too cool|too orange|too blue)\b/.test(s) && !/\bgolden hour\b|\bteal and orange\b|\bwarm (look|grade|filter)\b/.test(s),
    build: (s, target) => {
      const warm = /\bwarm|orange|golden\b/.test(s) && !/\btoo warm|too orange\b/.test(s) || /\btoo cold|too cool|too blue\b/.test(s);
      return { op: 'setColor', args: { target, temperature: warm ? 30 : -30 },
        label: `${warm ? 'Warmer' : 'Cooler'} on ${describe(target)}`, detail: '' };
    },
  },
  /* ---- the whole edit's length ---- */
  {
    id: 'fit-length',
    test: (s) => /\b(make|cut|bring|get|trim|shorten|take|fit|keep)\b.{0,12}\b(it|this|the (whole )?(edit|video|thing|timeline|cut))\b.{0,16}\b(down )?to\b.{0,6}\b\d/.test(s)
      || /\bmake (it|this|the video|the edit) (\d+(\.\d+)?|a|one|half a|two|three|ten|fifteen|twenty|thirty|sixty|ninety) ?(-| )?(seconds?|minutes?|s|secs?|mins?)\b/.test(s)
      || /\b(under|max|maximum|no longer than|at most) (\d+) ?(seconds?|s|secs?)\b/.test(s),
    build: (s) => {
      const secs = parseSeconds(s.replace(/\b(fifteen|twenty|thirty|sixty|ninety)\b/g, (w) => ({ fifteen: 15, twenty: 20, thirty: 30, sixty: 60, ninety: 90 })[w]));
      if (!secs) return { ask: 'How long? Say "make it 20 seconds".' };
      return { op: 'fitDuration', args: { seconds: secs }, label: `Fit the edit into ${secs} seconds`,
        detail: 'Every shot is trimmed in proportion, so the pacing stays the same and the whole thing ends on time.' };
    },
  },
  {
    id: 'length-ask',
    test: (s) => /\bmake (it|this|the video|the edit) (shorter|longer|tighter|snappier|quicker|briefer)\b|\bshorten (it|this|the video|the edit)\b|\bcut (it|this) down\b|\btoo long\b|\btoo short\b/.test(s),
    build: () => ({ ask: 'How long should it be? Say "make it 20 seconds" and every shot is trimmed in proportion — or "cut out the silences" if it is a talking video.' }),
  },
  /* ---- clips coming and going ---- */
  {
    id: 'delete',
    // Plurals matter here. \bclip\b does not match "clips" — there is no word
    // boundary between the p and the s — so "delete the last two clips", the
    // most natural way to say it, matched nothing at all.
    test: (s, target) => /\b(delete|deleting|remove|removing|get rid of|cut out|drop|take out|take off|bin|ditch|lose|kill)\b.*\b(clips?|shots?|ones?|it|them|this|that|title|titles|text|captions?|subtitles?|sticker|shape|logo)\b/.test(s)
      || (Boolean(target && target.media) && /\b(delete|remove|get rid of|cut|drop|bin|ditch|lose|kill|take out)\b/.test(s)),
    build: (s, target) => {
      if (/\bcaptions?\b|\bsubtitles?\b/.test(s)) return { ask: 'Captions come off by clicking the caption track and pressing Delete — I cannot pick them out by sentence yet.' };
      if (target === undefined) return { ask: 'Delete what? Say "delete clip 3", "delete the last one", or select clips and say "delete these".' };
      return { op: 'deleteClips', args: { target },
        label: `Remove ${describe(target)}`, detail: 'The gap closes behind it.' };
    },
  },
  {
    id: 'trim-ends',
    test: (s) => /\b(cut|take|trim|shave|chop|lose)\b.{0,12}\b(a|one|half a|\d+(\.\d+)?|two|three)\s*(seconds?|s)\b.{0,12}\b(off|from)\b.{0,12}\b(start|beginning|front|head|end|back|tail)\b/.test(s),
    build: (s, target) => {
      const secs = parseSeconds(s) || 1;
      const head = /\b(start|beginning|front|head)\b/.test(s);
      return { op: 'trimClips', args: { target, ...(head ? { head: secs } : { tail: secs }) },
        label: `${secs}s off the ${head ? 'start' : 'end'} of ${describe(target)}`, detail: 'Everything after it moves up.' };
    },
  },
  {
    id: 'trim',
    test: (s) => /\b(trim|trimming|shorten|shortening|make .* (\d|two|three|four|five|a|one|half a) ?(-| )?seconds?|cut .* (down|to)|max(imum)? .* seconds?)\b/.test(s),
    build: (s, target) => {
      const secs = parseSeconds(s);
      if (!secs) return { ask: 'To how long? Say "trim clip 2 to 3 seconds" or "make every shot two seconds".' };
      return { op: 'trimClips', args: { target, dur: secs },
        label: `${secs}s on ${describe(target)}`, detail: 'Everything after it moves up.' };
    },
  },
  /* ---- framing ---- */
  {
    id: 'rotate',
    test: (s) => /\brotat|\bturn (it|this|the clip|clip \d+) (\d+|around|sideways|upside down)|\bupside down\b|\bsideways\b|\b(\d+) degrees\b/.test(s),
    build: (s, target) => {
      // The number that is not the clip's: "rotate the last clip 180" turns it 180, not 90.
      const nums = (s.match(/-?\d+/g) || []).map(Number);
      if (typeof target === 'number') { const i = nums.indexOf(target); if (i >= 0) nums.splice(i, 1); }
      let deg = nums.find((n) => Math.abs(n) >= 1 && Math.abs(n) <= 360) || 0;
      if (!deg) deg = /\bupside down\b/.test(s) ? 180 : 90;
      if (/\b(anti-?clockwise|counter-?clockwise|left)\b/.test(s)) deg = -Math.abs(deg);
      return { op: 'setTransform', args: { target, rotate: deg },
        label: `Rotate ${describe(target)} ${deg}°`, detail: '' };
    },
  },
  {
    id: 'flip',
    test: (s) => /\bflip\b|\bmirror\b|\bmirrored\b|\breflect\b/.test(s) && !/\bflip the order\b/.test(s),
    build: (s, target) => ({ op: 'addEffect', args: { target: target ?? 'all', effect: 'mirror', params: { mode: /\bvertical|upside|top to bottom\b/.test(s) ? 'v' : 'h' } },
      label: `Mirror ${describe(target)}`, detail: 'The Mirror effect; its settings are in the Effects panel.' }),
  },
  {
    id: 'zoom',
    test: (s) => /\b(zoom|zooming|scale|scaling|bigger|smaller|punch in|enlarge|shrink|closer|tighter framing)\b/.test(s) && !/\bzoom (transition|punch|blur)\b|\bbeat zoom\b/.test(s),
    build: (s, target) => {
      let v = parseMultiplier(s);
      if (v === null) v = /\bout\b|\bsmaller\b|\bshrink\b|\bwider\b/.test(s) ? 0.8 : /\ba (bit|little|touch|tad)\b|\bslightly\b/.test(s) ? 1.12 : 1.25;
      return { op: 'setTransform', args: { target, scale: v },
        label: `Scale ${v}× on ${describe(target)}`, detail: '' };
    },
  },
  {
    id: 'opacity',
    test: (s) => /\b(opacity|transparen\w*|see-?through|translucent|ghosted|opaque)\b/.test(s),
    build: (s, target) => {
      const pct = parsePercent(s);
      const v = pct !== null ? pct : /\bhalf\b/.test(s) ? 0.5 : /\bopaque|solid|fully visible|100\b/.test(s) ? 1 : 0.6;
      return { op: 'setTransform', args: { target, opacity: v },
        label: `${Math.round(v * 100)}% opacity on ${describe(target)}`, detail: '' };
    },
  },
  /* ---- fades: the sound's, or the picture's ---- */
  {
    id: 'fade',
    test: (s) => /\bfade\b|\bfades\b|\bfading\b/.test(s) && !/\bfaded\b|\bfade (look|grade|film)\b|\bletters?\b|\bletter by letter\b/.test(s),
    build: (s, target) => {
      const secs = parseSeconds(s) || 0.5;
      const fadeIn = /\bfade\b.{0,20}\bin\b|\bfades? in\b/.test(s);
      const fadeOut = /\bfade\b.{0,20}\bout\b|\bfades? out\b|\bto black\b/.test(s);
      const both = (!fadeIn && !fadeOut) || (fadeIn && fadeOut) || /\bin and out\b|\bboth ends?\b/.test(s);
      const audio = /\b(audio|sound|music|volume|song|track|voice)\b/.test(s) || target === 'music';
      if (audio) {
        const args = { target };
        if (both || fadeIn) args.fadeIn = secs;
        if (both || fadeOut) args.fadeOut = secs;
        return { op: 'setVolume', args, label: `Fade the sound ${both ? 'in and out' : fadeIn ? 'in' : 'out'} on ${describe(target)}`, detail: `${secs}s.` };
      }
      if (target === undefined || target === 'all' || /\b(at|on) the (start|beginning|end|opening|close)\b/.test(s)) {
        return { op: 'fadeEnds', args: { dur: secs }, label: both ? 'Fade in and out' : fadeIn ? 'Fade in from black' : 'Fade out to black', detail: `${secs}s at ${both ? 'each end' : fadeIn ? 'the start' : 'the end'}.` };
      }
      const args = { target };
      if (both || fadeIn) args.fadeIn = secs;
      if (both || fadeOut) args.fadeOut = secs;
      return { op: 'fadeClips', args, label: `Fade ${both ? 'in and out' : fadeIn ? 'in' : 'out'} on ${describe(target)}`, detail: `${secs}s.` };
    },
  },
  /* ---- order ---- */
  {
    id: 'reverseOrder',
    test: (s) => /\breverse the order\b|\bbackwards order\b|\bflip the order\b|\bin reverse order\b|\border backwards\b/.test(s),
    build: () => ({ op: 'reorderClips', args: { order: 'reverse' },
      label: 'Reverse the order of the clips', detail: '' }),
  },
  {
    id: 'reorder',
    test: (s) => /\b(move|put|swap|switch|shuffle|reorder|rearrange|randomi[sz]e|mix up)\b/.test(s) && /\b(clips?|shots?|ones?|first|last|start|beginning|end|order|around)\b/.test(s) && !/\bplayhead\b|\bmove (it |the clip )?(up|down) a (track|layer)\b/.test(s),
    build: (s, target, ctx) => {
      const n = ctx.clipCount || 0;
      if (!n) return { ask: 'There is nothing on the timeline to reorder yet.' };
      const base = Array.from({ length: n }, (_, i) => i + 1);
      const num = (m) => (m ? (Number(m) || ORDINALS[m] || ({ last: n, first: 1 })[m] || null) : null);
      const shuffle = () => { const a = [...base]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
      let order = null; let label = '';
      if (/\bshuffle|randomi[sz]e|mix up|random order\b/.test(s)) { order = shuffle(); label = 'Shuffle the clips'; }
      else {
        const N = '(\\d+|first|last|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)';
        const swap = s.match(new RegExp(`\\b(?:swap|switch)\\b.{0,10}?\\b(?:clips?|shots?|the)?\\s*#?${N}\\b.{0,14}?\\b(?:and|with|for)\\b.{0,10}?\\b(?:clips?|shots?|the)?\\s*#?${N}\\b`));
        const move = s.match(new RegExp(`\\b(?:move|put)\\b.{0,12}?\\b(?:clips?|shots?|the)?\\s*#?${N}\\b(?:\\s+(?:clip|shot|one))?.{0,12}?\\b(?:to the |at the |to |as the )?(start|beginning|front|first|end|back|last)\\b`));
        const before = s.match(new RegExp(`\\b(?:move|put)\\b.{0,12}?\\b(?:clips?|shots?|the)?\\s*#?${N}\\b.{0,10}?\\b(before|after)\\b.{0,10}?\\b(?:clips?|shots?|the)?\\s*#?${N}\\b`));
        if (swap && num(swap[1]) && num(swap[2])) {
          const a = num(swap[1]); const b = num(swap[2]);
          order = base.map((v) => (v === a ? b : v === b ? a : v)); label = `Swap clips ${a} and ${b}`;
        } else if (before && num(before[1]) && num(before[3])) {
          const a = num(before[1]); const b = num(before[3]);
          const rest = base.filter((v) => v !== a); const i = rest.indexOf(b) + (before[2] === 'after' ? 1 : 0);
          rest.splice(i, 0, a); order = rest; label = `Move clip ${a} ${before[2]} clip ${b}`;
        } else if (move && num(move[1])) {
          const a = num(move[1]); const rest = base.filter((v) => v !== a);
          const toStart = /start|beginning|front|first/.test(move[2]);
          order = toStart ? [a, ...rest] : [...rest, a]; label = `Move clip ${a} to the ${toStart ? 'start' : 'end'}`;
        }
      }
      if (!order) return { ask: 'Move which clip where? Say "move clip 4 to the start", "swap clip 1 and 2", or "shuffle the clips".' };
      if (order.length !== n || new Set(order).size !== n || order.some((v) => v < 1 || v > n)) return { ask: `There are only ${n} clips on the timeline.` };
      return { op: 'reorderClips', args: { order }, label, detail: 'Everything stays; only the order changes.' };
    },
  },
];

/*
 * The expression the sentence asks for, or nothing.
 *
 * One place rather than two, because the rule's test and its build have to
 * agree: a test that matches and a build that returns something else is a step
 * nobody asked for. The beat expression is the case — "cut on the beat" says
 * where the cuts land, not that a property should pulse, and beat-synced
 * cutting handles it.
 */
function expressionHit(s) {
  const hit = firstMatch(EXPRESSION_WORDS, s);
  if (!hit) return null;
  if ((hit[1] === 'beat' || hit[1] === 'beatOpacity') && BEAT_CUT_WORDS.test(s)) return null;
  return hit;
}

function describe(target) {
  if (target === 'title') return 'the title';
  if (target === 'titles') return 'every title';
  if (target === 'shape' || target === 'shapes') return target === 'shape' ? 'the shape' : 'the shapes';
  if (target === 'null') return 'the null';
  if (target === 'sticker') return 'the sticker';
  if (target === 'music') return 'the music';
  if (target === undefined || target === 'all') return 'every clip';
  if (target === 'selected') return 'the selected clips';
  if (target === 'first') return 'the first clip';
  if (target === 'last') return 'the last clip';
  if (target === 'odd') return 'every other clip';
  if (typeof target === 'number') return `clip ${target}`;
  if (typeof target === 'string') return `clips ${target}`;
  if (target && target.tail) return `the last ${target.tail} clips`;
  if (target && target.media) return `the "${target.media}" clip`;
  if (target && typeof target === 'object') return `${target.from}s to ${target.to}s`;
  return 'the clips';
}

/* ------------------------------------------------------------------ *
 * Reading a whole request
 * ------------------------------------------------------------------ */

/**
 * Split on the joins people actually use, so one sentence can carry several
 * instructions: "mute clip 2 and slow the last one down".
 *
 * Deliberately conservative — splitting on every comma would tear "warm, punchy
 * grade" in half. Only "and then", " and ", ", then" and full stops count, and
 * " and " only when what follows opens like a new instruction.
 */
const VERBS = 'make|mute|un-?mute|slow|speed|delete|remove|get rid|trim|shorten|cut|zoom|scale|fade|add|put|give|apply|throw|do|turn|set|reverse|bright|dark|clear|parent|attach|pin|stick|spin|wiggle|rotate|flip|mirror|move|swap|shuffle|caption|subtitle|sync|clean|fix|take|drop|lower|raise|change|switch|convert|blur|sharpen|crop|duck|generate|draw|place|insert|match|keep|then';
function clauses(text) {
  return String(text || '')
    .replace(/\band then\b/gi, ' . ')
    .split(new RegExp(`\\.\\s+|;\\s*|,\\s*then\\b|\\s+then\\s+(?=(?:${VERBS})\\b)|\\s*,\\s+(?=(?:${VERBS})\\b)|\\s+and\\s+(?=(?:${VERBS})\\b)|\\s+&\\s+(?=(?:${VERBS})\\b)`, 'i'))
    .map((c) => c.trim().replace(/^then\s+/i, '').replace(/[.!]+$/, ''))
    .filter(Boolean);
}

/**
 * Turn a request into steps, when it is made of direct instructions.
 *
 * Returns null when nothing was recognised, so the caller can fall through to
 * the style planner. Returns `{ steps, unhandled, asks }` otherwise —
 * `unhandled` lists the clauses it could not read, which the panel shows
 * rather than pretending the whole request landed, and `asks` the questions
 * a rule had instead of a step.
 */
export function readInstructions(text, { clipCount = 0, raw = '', names = [] } = {}) {
  const parts = clauses(text);
  if (!parts.length) return null;

  const steps = [];
  const unhandled = [];
  const asks = [];
  const rawParts = clauses(raw || text);

  parts.forEach((part, i) => {
    const s = part.toLowerCase();
    let target = parseTarget(s, names);

    // "the last two" needs to know how many there are to become real indices.
    if (target && typeof target === 'object' && target.tail) {
      target = clipCount ? `${Math.max(1, clipCount - target.tail + 1)}-${clipCount}` : 'last';
    }

    const ctx = { clipCount, raw: rawParts[i] || raw || part };
    const rule = RULES.find((r) => r.test(s, target));
    if (!rule) { unhandled.push(part); return; }

    const step = rule.build(s, target, ctx);
    if (!step) { unhandled.push(part); return; }
    if (step.ask) { asks.push(step.ask); return; }

    if (step.args?.order === 'reverse') {
      step.args.order = Array.from({ length: clipCount }, (_, i2) => clipCount - i2);
    }
    steps.push(step);
  });

  if (!steps.length && !asks.length) return null;
  return { steps, unhandled, asks };
}
