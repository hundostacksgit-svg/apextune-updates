/*
 * Reading what people actually type, before anything tries to understand it.
 *
 * The planner and the direct reader are tables of phrasings. They are good at
 * "make clip 2 black and white" and blind to "can u make clip 2 bnw pls",
 * which is the same request from the same person on a phone. This file
 * closes that gap without pretending to be a language model:
 *
 *   - politeness and filler come off the ends ("can you please…", "…rn pls")
 *   - slang and abbreviations expand ("bnw", "slo mo", "subs", "w/o", "yt")
 *   - a typo within one keystroke of an editing word becomes that word
 *     ("blak", "captons", "transiton", "spped")
 *   - the common editing words in Spanish, French, Portuguese and German
 *     become their English ones ("blanco y negro", "sous-titres")
 *
 * Every change is reported back as a note, so the panel can say "I read
 * 'blak' as 'black'" rather than silently acting on a guess. The original
 * text is kept for anything that must be verbatim, like a title in quotes.
 */

/* ---- filler at either end ---- */
const OPENERS = [
  /^(?:hey|hi|hello|yo|ok|okay|so|um|uh|also|and|then|now|alright|right)[,!.\s]+/i,
  /^(?:please|pls|plz|kindly)\s+/i,
  /^(?:would|do|could|d)(?:'?ya|ou)? (?:you|u) mind\s+/i,
  /^(?:is it possible to|any chance you could|any chance to|could you possibly|if you could|i was wondering if you could|it would be great if you could)\s+/i,
  /^(?:can|could|would|will|cud|wud|can't you|why don't you)\s+(?:you|u|ya)\s+(?:please\s+|pls\s+|plz\s+)?/i,
  /^(?:i|we)\s+(?:want|need|would like|'d like|wanna|would love|just want|just need)\s+(?:you\s+to\s+|u\s+to\s+|to\s+)?/i,
  /^(?:help me|help)\s+(?:to\s+)?(?=\w)/i,
  /^(?:go ahead and|just go and|try to|try and|make sure to|be sure to|go and)\s+/i,
  /^(?:just|simply|basically|literally)\s+/i,
];
const CLOSERS = [
  /[\s,]+\b(?:please|pls|plz|thanks|thank you|thx|ty|lol|lmao|rn|asap|now|for me|if you can|if u can|when you can|ok\?|okay\?|thanks in advance)\b[.!?\s]*$/i,
];

/* ---- slang and abbreviations, longest first ---- */
const SLANG = [
  [/\bb\s*[&/+]\s*w\b|\bbnw\b|\bbw\b/g, 'black and white'],
  [/\bslo[\s-]?mo\b|\bslowmo\b|\bslow[\s-]?mo\b/g, 'slow motion'],
  [/\bsubs\b/g, 'captions'],
  [/\bvids?\b/g, 'video'],
  [/\bpics?\b|\bpix\b/g, 'photos'],
  [/\bw\/o\b/g, 'without'],
  [/\bw\/\b/g, 'with '],
  [/\bgimme\b/g, 'give me'],
  [/\bwanna\b/g, 'want to'],
  [/\bgotta\b/g, 'have to'],
  [/\blemme\b/g, 'let me'],
  [/\bu\b/g, 'you'],
  [/\bur\b/g, 'your'],
  [/\bpls\b|\bplz\b/g, 'please'],
  [/\btik\s*tok\b|\btick\s*tock\b|\btic\s*toc\b/g, 'tiktok'],
  [/\big\b|\binsta\b|\bthe gram\b/g, 'instagram'],
  [/\byt\b|\byoutube shorts\b/g, 'youtube'],
  [/\bbg\b/g, 'background'],
  [/\bfx\b/g, 'effects'],
  [/\bsecs?\b/g, 'seconds'],
  [/\bmins?\b/g, 'minutes'],
  [/\bhrs?\b/g, 'hours'],
  [/\bsped\b/g, 'speed'],
  [/\bfast af\b|\bfast as fuck\b|\bhella fast\b|\bsuper fast\b/g, 'crazy fast'],
  [/\b(?:ngl|tbh|lowkey|highkey|fr|frfr|asap|lol|lmao|omg|bruh|bro|dude|fam|literally|basically|kinda|sorta|honestly|really|actually|like)\b\s*/g, ''],
  [/\baf\b\s*/g, ''],
  [/\bfucking\b|\bfuckin\b|\bfreaking\b|\bfrickin\b|\bdamn\b|\bbloody\b/g, ''],
];

/* ---- other languages: the editing words, longest phrase first ---- */
const LANGS = [
  /* Spanish */
  [/\bblanco y negro\b/g, 'black and white'], [/\bcamara lenta\b/g, 'slow motion'], [/\bmas rapido\b/g, 'faster'], [/\bmas lento\b/g, 'slower'],
  [/\bsubtitulos\b/g, 'captions'], [/\bmusica\b/g, 'music'], [/\btitulo\b/g, 'title'], [/\btransicion(?:es)?\b/g, 'transition'],
  [/\bsilencia(?:r)?\b|\bmutea(?:r)?\b/g, 'mute'], [/\bborra(?:r)?\b|\belimina(?:r)?\b|\bquita(?:r)?\b/g, 'delete'], [/\bagrega(?:r)?\b|\banade\b|\bpon(?:er|le)?\b/g, 'add'],
  [/\bhazme\b|\bhaz\b|\bcrea(?:r)?\b/g, 'make'], [/\bacelera(?:r)?\b/g, 'speed up'], [/\brecorta(?:r)?\b/g, 'trim'],
  [/\bultimo\b/g, 'last'], [/\bprimero?\b/g, 'first'], [/\bsegundos?\b/g, 'seconds'], [/\bminutos?\b/g, 'minutes'],
  [/\bbrillante\b|\bmas brillo\b/g, 'brighter'], [/\boscuro\b|\bmas oscuro\b/g, 'darker'], [/\bvertical\b/g, 'vertical'],
  [/\bun video\b|\bun video\b/g, 'a video'], [/\bun edit\b/g, 'an edit'], [/\bpara\b/g, 'for'], [/\bel clip\b/g, 'clip'], [/\ben\b(?= (?:black|slow|clip))/g, 'in'],
  [/\bde\b(?= \d)/g, 'of'], [/\by\b/g, 'and'], [/\bcon\b/g, 'with'], [/\bsin\b/g, 'without'], [/\btodo\b/g, 'everything'],
  /* French */
  [/\bnoir et blanc\b/g, 'black and white'], [/\bsous[- ]titres\b/g, 'captions'], [/\bmusique\b/g, 'music'], [/\btitre\b/g, 'title'],
  [/\bcoupe le son\b|\bcoupe le son du\b|\bmets en sourdine\b/g, 'mute'], [/\bsupprime(?:r)?\b|\benleve(?:r)?\b/g, 'delete'], [/\bajoute(?:r|z)?\b|\bmets\b|\bmettre\b/g, 'add'],
  [/\bplus rapide\b|\baccelere\b/g, 'faster'], [/\bplus lent\b|\bralentis?\b/g, 'slower'], [/\bralenti\b/g, 'slow motion'],
  [/\bdernier\b|\bderniere\b/g, 'last'], [/\bpremier\b|\bpremiere\b/g, 'first'], [/\bsecondes?\b/g, 'seconds'], [/\bfais(?:-moi)?\b|\bcree\b/g, 'make'],
  [/\ble clip\b|\bdu clip\b/g, 'clip'], [/\bdes\b/g, ''], [/\ben\b(?= black)/g, 'in'], [/\bet\b/g, 'and'], [/\bavec\b/g, 'with'], [/\bsans\b/g, 'without'],
  /* Portuguese */
  [/\bpreto e branco\b/g, 'black and white'], [/\blegendas\b/g, 'captions'], [/\bmusica\b/g, 'music'], [/\btitulo\b/g, 'title'],
  [/\bsilencia(?:r)?\b|\bmuta(?:r)?\b/g, 'mute'], [/\bapaga(?:r)?\b|\bremover\b|\bexclui(?:r)?\b/g, 'delete'], [/\badiciona(?:r)?\b|\bcoloque\b|\bcoloca(?:r)?\b|\bpoe\b/g, 'add'],
  [/\bmais rapido\b/g, 'faster'], [/\bmais lento\b/g, 'slower'], [/\bcamera lenta\b/g, 'slow motion'],
  [/\bultimo\b/g, 'last'], [/\bprimeiro\b/g, 'first'], [/\bsegundos?\b/g, 'seconds'], [/\bfa[zç]a?\b|\bcria(?:r)?\b/g, 'make'],
  [/\bo clipe\b|\bclipe\b/g, 'clip'], [/\bem\b(?= black)/g, 'in'], [/\be\b/g, 'and'], [/\bcom\b/g, 'with'], [/\bsem\b/g, 'without'],
  /* German */
  [/\bschwarz[- ]?weiss\b/g, 'black and white'], [/\buntertitel\b/g, 'captions'], [/\bmusik\b/g, 'music'], [/\btitel\b/g, 'title'],
  [/\bstumm(?:schalten)?\b/g, 'mute'], [/\blosche?n?\b|\bentferne?n?\b/g, 'delete'], [/\bfuge?\b[^.]{0,20}\bhinzu\b|\bhinzufugen\b/g, 'add'],
  [/\bschneller\b/g, 'faster'], [/\blangsamer\b/g, 'slower'], [/\bzeitlupe\b/g, 'slow motion'],
  [/\bletzte[nrs]?\b/g, 'last'], [/\berste[nrs]?\b/g, 'first'], [/\bsekunden?\b/g, 'seconds'], [/\bmach(?:e|en)?\b/g, 'make'],
  [/\bden clip\b|\bder clip\b/g, 'clip'], [/\bund\b/g, 'and'], [/\bmit\b/g, 'with'], [/\bohne\b/g, 'without'],
];

/*
 * The editing vocabulary, for two jobs: a typo within one keystroke of one of
 * these becomes it, and a sentence with none of them (and none of the common
 * words below) is not about editing at all.
 */
export const EDIT_TERMS = [
  'add', 'apply', 'audio', 'anime', 'aesthetic', 'ambient', 'arrow', 'animate', 'animation', 'aspect',
  'background', 'beat', 'beats', 'black', 'blur', 'blurry', 'bigger', 'bright', 'brighter', 'brighten', 'bars', 'bass', 'bounce', 'burn',
  'caption', 'captions', 'censor', 'cinematic', 'clear', 'clip', 'clips', 'countdown', 'colour', 'color', 'colours', 'colors', 'contrast', 'crop', 'cut', 'cuts', 'clean', 'countdown', 'clutch', 'confetti', 'cool', 'cooler', 'cold',
  'dark', 'darker', 'darken', 'delete', 'dissolve', 'drop', 'drill', 'duplicate', 'duck', 'dreamy', 'desaturate', 'degrees', 'dust',
  'edit', 'edits', 'effect', 'effects', 'emoji', 'embers', 'export', 'expression', 'everything',
  'face', 'fade', 'fast', 'faster', 'filter', 'filters', 'first', 'flash', 'flip', 'footage', 'frame', 'frames', 'freeze', 'fire', 'film', 'font', 'fonts', 'funny',
  'glitch', 'glow', 'grade', 'grain', 'grayscale', 'greyscale', 'gaming', 'gym',
  'highlight', 'highlights', 'hook', 'horizontal', 'hype', 'hiss', 'hum',
  'impact', 'instagram', 'intro',
  'landscape', 'last', 'letter', 'letters', 'letterbox', 'lofi', 'logo', 'longer', 'look', 'loop', 'louder', 'lower', 'lyric', 'lighter', 'lighten',
  'make', 'meme', 'minute', 'minutes', 'mirror', 'monochrome', 'montage', 'motion', 'move', 'music', 'mute', 'muted',
  'neon', 'noir', 'noise', 'normalise', 'normalize', 'null', 'orange', 'teal', 'golden', 'pastel', 'kodak', 'moonlight', 'sunburn', 'bleach', 'plate', 'sign', 'short', 'long', 'quick', 'brief',
  'opacity', 'outro', 'overlay',
  'parent', 'phonk', 'photo', 'photos', 'pixelate', 'portrait', 'progress', 'punchy', 'pulse',
  'quieter', 'quiet', 'quicker', 'opaque', 'rotated', 'flipped', 'mirrored', 'blurred', 'sharper', 'warmer', 'cooler', 'bigger', 'smaller', 'longer', 'brightness', 'darkness', 'faded', 'glowing', 'pop', 'vibrant', 'punchier', 'viral', 'professional',
  'rain', 'ramp', 'ramps', 'ratio', 'recap', 'reel', 'reels', 'remove', 'render', 'repair', 'reverse', 'rotate', 'rgb',
  'saturate', 'saturated', 'saturation', 'desaturated', 'scale', 'scaled', 'second', 'seconds', 'select', 'selected', 'shake', 'shaky', 'shape', 'shapes', 'sharpen', 'shorten', 'shorter', 'shorts', 'shot', 'shots', 'silence', 'silences', 'slide', 'slideshow', 'slow', 'slower', 'smooth', 'snow', 'song', 'sound', 'sparks', 'speed', 'spin', 'split', 'square', 'stabilise', 'stabilize', 'sticker', 'stickers', 'strobe', 'subtitle', 'subtitles', 'sync', 'synced',
  'text', 'tiktok', 'tighten', 'tight', 'tighter', 'timeline', 'title', 'titles', 'track', 'trailer', 'transition', 'transitions', 'trap', 'trim', 'typewriter', 'type', 'typed', 'types', 'typing', 'transparent', 'translucent',
  'unmute', 'upbeat',
  'velocity', 'vertical', 'vhs', 'video', 'videos', 'vintage', 'vivid', 'voice', 'volume', 'vlog',
  'warm', 'warmer', 'warp', 'watermark', 'white', 'widescreen', 'wiggle', 'wipe',
  'youtube',
  'zoom',
];

/* Ordinary words that are neither typos nor evidence of an editing request. */
const COMMON = new Set(('the a an and or but of to in on at for with from by as is are was were be been being it its this that these those there here '
  + 'i me my we our you your he she they them their his her it him one ones all any some every each few more most less much many very too so than then '
  + 'when where what which who whom whose why how can could would should will shall may might must do does did done have has had having get got gets '
  + 'make made makes want wants need needs like likes just only also even still again once after before between into onto over under up down out off '
  + 'about above below through across around against without within along following during until while because if else not no yes ok okay please '
  + 'thanks thank good bad better best great nice cool cute fine well right wrong new old big small little long short high low same different other '
  + 'thing things stuff bit bits part parts whole half kind sort way ways time times start end beginning middle top bottom left side front back next '
  + 'last first second third fourth fifth own really pretty quite rather sure maybe probably kinda sorta lot lots hard easy quick fast slow '
  + 'go going gone come came take took put set let give gave keep kept turn turned show see saw look looked find found try tried use used help '
  + 'say said tell told know knew think thought feel felt seem seems seemed hello hi hey yo bye later today tonight now soon ever never always '
  + 'people person guy girl man woman him her his face head hand car dog cat house room night day morning sun sky sea water city street '
  + 'clear tighten tight tighter trip cute snake shoot tree witch later lately quite fight light might sight write wrote trade blade shade tape cape cap map tap '
  + 'show slot shop chop prop plot plan clan span scan stale whale mail rail tail fail nail sail wait bait hair pair fair care dare rare fare wear bear dear fear gear hear near tear year '
  + 'hate date gate late mate rate fate main gain pain vain lane cane sane fine line mine nine pine vine wine dine hire tire wire dire tone bone cone done gone lone none zone lute route '
  + 'mood food hood wood book cook hook took next test best rest nest vest west tile mile pile file tram true cup cub exit emit omit unit aid odd made jade wade grow blow stow loot loom '
  + 'worm ward warn harm farm form pool tool fool wool skin shin spit spun spine wife wide ripe pipe typo room boom doom moon noon soon gum sum rum hut hub hug hue trap tram grip drip '
  + 'seat beat heat meat neat feat song long gong wrong strong lung sung hung rung band bend bond fund hand land sand wand mind kind find wind bind lint mint hint tint pint').split(/\s+/));

/* Damerau–Levenshtein, optimal string alignment. Words are short; this is cheap. */
function distance(a, b) {
  const m = a.length; const n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

const TERMS = new Set(EDIT_TERMS);

/**
 * The editing word a misspelling was meant to be, or null.
 *
 * Deliberately narrow: four letters or more, one keystroke away (two for
 * long words), the candidate no shorter than what was typed (so "cute" does
 * not become "cut"), and exactly one candidate — "trip" is a keystroke from
 * both "trim" and "trap", so it stays "trip".
 */
function correction(word) {
  if (word.length < 4 || TERMS.has(word) || COMMON.has(word)) return null;
  const allow = word.length >= 8 ? 2 : 1;
  let best = null; let ties = 0;
  for (const term of EDIT_TERMS) {
    if (term.length < word.length) continue;
    const d = distance(word, term);
    if (d === 0) return null;
    if (d <= allow) {
      if (best && d === best.d) ties++;
      else if (!best || d < best.d) { best = { term, d }; ties = 0; }
    }
  }
  return best && !ties ? best.term : null;
}

/**
 * The request, cleaned. Returns the text to read and the notes to show.
 *
 * `text` is lower case: everything that reads it lower-cases first anyway,
 * and the original is kept by the caller for the things that are verbatim.
 */
export function normalise(input) {
  const raw = String(input ?? '');
  const notes = [];
  let s = raw
    .replace(/<[^>]{1,80}>/g, ' ')                  // stray markup
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ').trim().toLowerCase()
    // Accents off, so "último" and "ultimo" are one word to the tables below
    // (and to \b, which does not know that ú is a letter). ß is "ss".
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss');

  /* Other languages first, so the filler and slang rules see English. */
  let translated = false;
  for (const [re, en] of LANGS) {
    if (re.test(s)) { s = s.replace(re, en); translated = true; }
  }
  s = s.replace(/\s+/g, ' ').trim();

  /* Filler at the ends, as many times as it takes. Never strip a sentence to nothing. */
  let before;
  do {
    before = s;
    for (const re of OPENERS) { const t = s.replace(re, ''); if (t.trim().length >= 2) s = t; }
    for (const re of CLOSERS) { const t = s.replace(re, ''); if (t.trim().length >= 2) s = t; }
    s = s.trim();
  } while (s !== before);

  for (const [re, to] of SLANG) s = s.replace(re, to);
  s = s.replace(/\s+/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();

  /*
   * Typos, one word at a time. Left alone: quoted text (a title), the words
   * after "says" or "called" (also a title), and anything Capitalised in the
   * original that is not the first word (a name — "JAKE" is not "make").
   * Held-back text is parked behind a placeholder no sentence contains.
   */
  const quoted = [];
  const park = (t) => { quoted.push(t); return `{{q${quoted.length - 1}}}`; };
  s = s.replace(/"[^"]{1,90}"|'[^']{2,90}'/g, (q) => park(q));
  s = s.replace(/\b(says?|saying|reads?|reading|called|named|titled)\s+(.+?)(?=\s+(?:at|on|for|in|over)\s+(?:\d|the\b)|$)/, (m, verb, rest) => `${verb} ${park(rest)}`);
  const proper = new Set((raw.match(/(?<!^)(?<=\s)[A-Z][A-Za-z]{2,}/g) || []).map((w) => w.toLowerCase()));
  s = s.replace(/[a-z]{4,}/g, (word) => {
    if (proper.has(word)) return word;
    const fix = correction(word);
    if (fix) { notes.push(`"${word}" as "${fix}"`); return fix; }
    return word;
  });
  s = s.replace(/\{\{q(\d+)\}\}/g, (_, i) => quoted[Number(i)]);

  if (translated) notes.unshift(`in English: "${s}"`);
  return { text: s, raw, notes };
}

/** How many editing words a sentence carries — none means it is not about editing. */
export function editWords(text) {
  const words = String(text || '').toLowerCase().match(/[a-z]+/g) || [];
  return words.filter((w) => TERMS.has(w)).length;
}

/** Whether the sentence has any recognisable word in it at all. */
export function readable(text) {
  const t = String(text || '').toLowerCase();
  const words = t.match(/[a-z]+/g) || [];
  if (!words.length) return /^\s*[\d:.\s]+\s*$/.test(t) && /\d/.test(t);   // a bare number is a length or a shape
  return words.some((w) => TERMS.has(w) || COMMON.has(w));
}
