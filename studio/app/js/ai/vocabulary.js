/*
 * The AI's vocabulary for the motion-design features.
 *
 * One table per kind of thing, read by both the planner (a whole edit asked
 * for in a sentence) and the direct reader (one instruction about one clip),
 * so a word means the same thing whichever way it arrives. "Snow" is the
 * snow particles from either door; "type it on" is the typewriter animator
 * from either door. Keeping the tables in one file is the only way they
 * stay in step — and the verifier checks every id here against the library
 * it names, so a renamed preset cannot leave a dead word behind.
 *
 * Order matters inside a table: the reader takes the first match, so the
 * specific phrase ("shake and settle", an expression) sits above the general
 * word ("shake", an effect).
 */

/* ---- effects, by name. params are the starting values a sentence implies. ---- */
export const EFFECT_WORDS = [
  [/motion blur|blur the motion|smear/i, 'motionBlur', { amount: 55 }],
  [/zoom blur|radial blur/i, 'zoomBlur', { amount: 45 }],
  [/shake|shaky|handheld|hand-held|earthquake/i, 'shake', { amount: 40 }],
  [/rgb split|chromatic|colou?r split|aberration/i, 'rgbSplit', { amount: 28, pulse: 60 }],
  [/glow|bloom|dreamy light/i, 'glow', { amount: 40 }],
  [/speed ?lines?|manga lines|action lines/i, 'speedLines', { amount: 60 }],
  [/halftone|manga dots|comic dots/i, 'halftone', { amount: 60 }],
  [/posteri[sz]e time|stepped frame|frame hold look|stop[- ]motion look|\bon twos\b|choppy frames/i, 'posterizeTime', { rate: 8 }],
  [/cel ?shade|posteri[sz]e(?! time)|cartoon|toon/i, 'posterize', { levels: 5, outline: 40 }],
  [/pixelate|pixel|8.?bit|censor/i, 'pixelate', { size: 14 }],
  [/scanlines?|crt|old tv|retro screen/i, 'scanlines', { amount: 40 }],
  [/mirror|kaleidoscope|symmetr/i, 'mirror', { mode: 'h' }],
  [/vhs|tape wobble|camcorder wobble/i, 'vhsWobble', { amount: 40 }],
  [/prism|lens fringe/i, 'prism', { amount: 35 }],
  [/lens flare|tracked flare|sun flare|flare on (him|her|them|the subject)/i, 'lensFlareTracked', { amount: 60 }],
  [/light ?leak|sun leak/i, 'lightLeak', { amount: 45 }],
  [/letterbox|black bars|cinema bars|widescreen bars/i, 'letterbox', { amount: 12 }],
  [/blur\s+(out\s+)?(the|his|her|their|my|a)?\s*(face|plate|number|sign|screen|logo)|censor|hide\s+(the|his|her|their|my)?\s*face/i,
    'blurRegion', { size: 20, strength: 22 }],
  [/flash|strobe/i, 'flash', { amount: 70, every: 0.5, length: 0.08 }],

  /* the compositor's effects */
  [/\bsnow(ing|fall|flakes?)?\b/i, 'particlesSnow', {}],
  [/\brain(ing|fall|drops?)?\b/i, 'particlesRain', {}],
  [/\bsparks?\b|\bwelding\b/i, 'particlesSparks', {}],
  [/\bembers?\b|\bfire ?flies\b/i, 'particlesEmbers', {}],
  [/\bconfetti\b|\bparty popper\b/i, 'particlesConfetti', {}],
  [/\bdust( motes| particles)?\b|\bfloating dust\b/i, 'particlesDust', {}],
  [/\bbokeh\b/i, 'particlesBokeh', {}],
  [/\bbubbles?\b/i, 'particlesBubbles', {}],
  [/\bstar ?field\b|\bwarp stars\b|\bflying through space\b/i, 'particlesStars', {}],
  [/\bparticles?\b|\bparticle system\b/i, 'particles', {}],
  [/\bfractal noise\b|\bnoise (background|texture|plate)\b|\bclouds?\b|\bsmoke\b/i, 'fractalNoise', {}],
  [/\bdisplacement map\b|\bglass distortion\b/i, 'displacementMap', {}],
  [/\bturbulen|\bdisplace(ment)?\b|\bmelt(ing|s)?\b|\bheat (haze|shimmer)\b|\bwater ripple\b/i, 'turbulentDisplace', {}],
  [/(?<!tape |sound |audio |slap ?)\becho\b|\bmotion trails?\b|\bghost(ing)?\b|\blight trails?\b/i, 'echo', {}],
  [/\blight sweep\b|\bshine\b|\bsheen\b|\bglint\b/i, 'lightSweep', {}],
  [/\bgradient (ramp|background|behind)\b|\bcolou?r ramp\b/i, 'gradientRamp', {}],
  [/\bsolid fill\b|\brecolou?r\b|\bfill (it|the title|the text|the shape) (with )?(a )?colou?r\b/i, 'fill', {}],
  [/\baudio (spectrum|visuali[sz]er|bars)\b|\bspectrum\b|\bvisuali[sz]er\b|\bequali[sz]er bars\b/i, 'audioSpectrum', {}],
  [/\bwaveform\b|\baudio wave\b|\bsound wave\b/i, 'audioWaveform', {}],
];

/* ---- shape layers: a finished piece by the name a person would use ---- */
export const SHAPE_WORDS = [
  [/\bprogress bar\b|\bloading bar\b/i, 'progressBar'],
  [/\bunderline\b/i, 'underline'],
  [/\bline reveal\b|\bdraw(s|ing)? (a |the )?line\b|\bline that draws\b/i, 'lineReveal'],
  [/\bring fill\b|\bloading ring\b|\bring loader\b|\bcircular progress\b/i, 'ringFill'],
  [/\bbox outline\b|\boutline(d)? box\b|\bframe (the )?(shot|title|text)\b/i, 'boxOutline'],
  [/\bcircle burst\b|\bburst circle\b/i, 'circleBurst'],
  [/\bstar pop\b|\bpopping star\b/i, 'starPop'],
  [/\bburst lines\b|\bradiating lines\b|\bline burst\b/i, 'burstLines'],
  [/\bdashed orbit\b|\borbit ring\b/i, 'dashedOrbit'],
  [/\bdot grid\b|\bgrid of dots\b/i, 'dotGrid'],
  [/\bspiral squares\b|\bsquare spiral\b/i, 'spiralSquares'],
  [/\bsab(er|re) line\b|\blight ?sab(er|re)\b|\bsab(er|re)\b/i, 'saberLine'],
  [/\bneon ring\b/i, 'neonRing'],
  [/\bwobble blob\b|\bblob\b/i, 'wobbleBlob'],
  [/\bscribble circle\b|\bscribble\b/i, 'scribbleCircle'],
  [/\bburst star\b|\bstar ?burst\b/i, 'burstStar'],
  [/\bhexagon\b/i, 'hexagon'],
  [/\barrow (in|shape|layer)\b|\bshape arrow\b/i, 'arrowIn'],
];

/* ---- text animators: how the letters arrive ---- */
export const ANIMATOR_WORDS = [
  [/\btypewriter\b|\btype(s|d)? (it |the title |the text )?on\b|\btyping\b/i, 'typewriterHard'],
  [/\bletter by letter\b|\bcharacter by character\b|\bone letter at a time\b|\bfade (up|in) (the )?letters\b/i, 'fadeByChar'],
  [/\bletters? (rise|rising)\b|\brise by (letter|character)\b|\brise up\b/i, 'riseByChar'],
  [/\bletters? (fall|drop)\b|\bfall by (letter|character)\b|\bdrop in\b/i, 'fallByChar'],
  [/\bzoom (out )?by word\b|\bwords land\b/i, 'zoomByWord'],
  [/\bword by word\b|\bone word at a time\b/i, 'scaleByWord'],
  [/\brotate in\b|\bswing in\b/i, 'rotateIn'],
  [/\bblur in\b|\bresolve (out of|from) (a )?blur\b/i, 'blurIn'],
  [/\btracking out\b|\bspread (out )?and fade\b/i, 'trackingOut'],
  [/\btracking in\b|\bcinematic title\b|\btighten(s)? into place\b/i, 'trackingIn'],
  [/\brandom (pop|order)\b|\bpop in randomly\b/i, 'randomPop'],
  [/\bslide in from the left\b|\bletters slide in\b/i, 'slideFromLeft'],
  [/\b(letters|text|title)\b[^.]*\bbounce\b[^.]*\bbeat\b|\bbounce\b[^.]*\b(letters|text|title)\b[^.]*\bbeat\b/i, 'beatBounce'],
  [/\b(letters|text|title)\b[^.]*\b(scale|grow|pulse)\b[^.]*\b(music|audio|sound)\b/i, 'audioScale'],
  [/\bwave\b[^.]*\b(letters|text|title)\b|\b(letters|text|title)\b[^.]*\bwave\b/i, 'waveLoop'],
  [/\bjitter(s|ing|y)?\b[^.]*\b(letters|text|title)\b|\b(letters|text|title)\b[^.]*\bjitter/i, 'jitterLoop'],
];

/* ---- expressions: a movement without keys, by what it does ---- */
export const EXPRESSION_WORDS = [
  [/\bflash(es|ing)?\b[^.]*\bbeat\b|\bbeat\b[^.]*\bflash/i, 'beatOpacity'],
  [/\b(bounce|bounces|pop|pops|pump|pumps|jump|jumps|punch|punches)\b[^.]*\bbeat\b|\bon (the |every )?beat\b/i, 'beat'],
  [/\bkick\b[^.]*\bbass\b|\bwith the bass\b|\bto the bass\b/i, 'audioBass'],
  [/\btilt\b[^.]*\b(music|audio|sound)\b/i, 'audioRot'],
  [/\b(react|reacts|pulse|pulses|grow|grows|scale|scales|move|moves|dance|dances)\b[^.]*\b(music|audio|sound|song|track|volume)\b|\b(music|audio)[- ]reactive\b/i, 'audio'],
  [/\bwiggle\b[^.]*\brotat|\brotat\w*\b[^.]*\bwiggle|\bsway(s|ing)?\b/i, 'wiggleRot'],
  [/\bbreath(e|es|ing)\b|\bwiggle\b[^.]*\bscale|\bscale\b[^.]*\bwiggle/i, 'wiggleScale'],
  [/\bwiggle|\bjitter|\bhand-?held drift|\bdrift around/i, 'wiggle'],
  [/\bspin(s|ning)?\b|\brotate forever\b|\bkeep(s)? turning\b/i, 'spin'],
  [/\bdrift(s)? right\b|\bdrift\b/i, 'drift'],
  [/\bblink(s|ing)?\b/i, 'blink'],
  [/\bfade in and out\b|\bfade both ends\b/i, 'fadeInOut'],
  [/\bping-?pong\b|\bback and forth\b/i, 'pingpong'],
  [/\bloop and climb\b|\bkeep(s)? climbing\b/i, 'offset'],
  [/\bloop (the |its )?(keys|animation|keyframes)\b|\bloop(s|ing)? forever\b|\brepeat the animation\b/i, 'loop'],
  [/\bovershoot|\bsettle(s)?\b[^.]*\bbounc|\bspringy\b|\binertia\b/i, 'inertia'],
  [/\bshake and settle\b|\bhit and settle\b|\bimpact shake\b/i, 'shakeDecay'],
  [/\bstop[- ]motion\b|\bstutter\b|\bon twos\b/i, 'stutter'],
];

/* ---- layers that exist to be parents ---- */
export const NULL_WORDS = /\b(add|make|create|give me)\b[^.]*\bnull\b|\bnull object\b|\bcontrol(ler)? layer\b/i;
export const PARENT_WORDS = /\b(parent|attach|pin|stick)\b[^.]{0,40}\bto\b|\bfollow(s)?\b/i;

/** The first table entry a sentence matches, or null. */
export function firstMatch(table, text) {
  const s = String(text || '');
  for (const row of table) if (row[0].test(s)) return row;
  return null;
}
