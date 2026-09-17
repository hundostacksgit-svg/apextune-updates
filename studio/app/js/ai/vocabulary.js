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
  [/pixelate|pixel|8.?bit/i, 'pixelate', { size: 14 }],
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
  [/\bunderline\b|\bline under (the )?(title|text|words|it)\b/i, 'underline'],
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
  [/\b(letters|text|title)\b[^.]*\b(scale|grow|pulse)\b[^.]*\b(music|audio|sound)\b|\b(scale|grow|pulse)\b[^.]*\b(letters|text|title)\b[^.]*\b(music|audio|sound)\b/i, 'audioScale'],
  [/\bwave\b[^.]*\b(letters|text|title)\b|\b(letters|text|title)\b[^.]*\bwave\b/i, 'waveLoop'],
  [/\bjitter(s|ing|y)?\b[^.]*\b(letters|text|title)\b|\b(letters|text|title)\b[^.]*\bjitter/i, 'jitterLoop'],
];

/*
 * Cutting on the beat is not the beat expression.
 *
 * "Bounce on the beat" makes a property pulse; "cut on the beat" is where the
 * edit lands, which beat-synced cutting does. They share four words, and the
 * expression rule used to take both — so a whole brief ("make a 20 second
 * phonk edit, cut on the beat, speed lines on the drops and a VHS look") came
 * back as one expression on one clip, with nothing reported as unhandled.
 */
export const BEAT_CUT_WORDS = /\b(cut|cuts|cutting|sync|syncs|synced|syncing|snap|snaps|snapped|snapping|edit|edits|edited|time|timed|land|lands|landing|change|changes|switch|switches)\b[^.]{0,30}?\bon (the |every |each )?beat\b|\b(cut|cuts|cutting|sync|syncs|synced|syncing|snap|snaps|snapped|edit|edits|edited)\b[^.]{0,30}?\bto the beat\b/i;

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

/* ---- taking the background out, which is not the same as taking a thing out ---- */
/*
 * "Remove the background" read as tap-to-remove an object called "the
 * background": the eraser opened and waited for a tap that could never mean
 * anything. It is its own feature — a matte, not a patch — and this is the
 * phrase that reaches it.
 */
export const BG_REMOVE_WORDS = new RegExp([
  /* The background has to be what the verb acts on. Allowing anything between
     the two turned "get rid of the sign in the background" — which is about
     the sign, and is tap-to-remove — into a background key. */
  '\\b(remove|cut out|get rid of|take out|drop|kill|knock out|delete|erase|key out)\\s+(the\\s+|this\\s+|my\\s+)?background\\b(?!\\s+(noise|hiss|hum|buzz|sound|audio|music))',
  '\\bbackground remov',
  '\\bgreen ?screen\\b',
  '\\bchroma ?key\\b',
  '\\bcut (me|him|her|them|the subject|the person) out\\b',
  '\\bmatte (out )?the background\\b',
].join('|'), 'i');

/* ---- music: the style somebody names, and the words that mean "put music on it" ---- */
/*
 * The style ids are beatmaker.js's, so a word here reaches the same music the
 * Sound panel does. Longer names first: "uk drill" must beat "drill", and
 * "trap soul" must beat "trap", or every R&B request comes back as a trap
 * beat. The verifier checks every id against BEAT_STYLES.
 */
export const MUSIC_WORDS = [
  [/\buk drill\b|\bbritish drill\b/i, 'ukdrill'],
  [/\btrap ?soul\b/i, 'trapsoul'],
  [/\bjersey club\b|\bjersey\b/i, 'jerseyclub'],
  [/\bdeep house\b/i, 'deephouse'],
  [/\bboom ?bap\b|\bold school hip ?hop\b|\b90s hip ?hop\b/i, 'boombap'],
  [/\bjazz ?hop\b|\bjazzy hip ?hop\b/i, 'jazzhop'],
  [/\bneo ?soul\b/i, 'neosoul'],
  [/\bslow jam\b/i, 'slowjam'],
  [/\bsynth ?wave\b|\bretro ?wave\b|\b80s synth\b/i, 'synthwave'],
  [/\bhyper ?pop\b/i, 'hyperpop'],
  [/\bamapiano\b/i, 'amapiano'],
  [/\bafro ?beats?\b|\bafro ?pop\b/i, 'afrobeats'],
  [/\breggaeton\b|\bdembow\b/i, 'reggaeton'],
  [/\bdancehall\b/i, 'dancehall'],
  [/\bdrum (and|n'?|&) bass\b|\bdnb\b|\bjungle\b/i, 'dnb'],
  [/\bdub ?step\b/i, 'dubstep'],
  [/\bmemphis\b/i, 'memphis'],
  [/\bdrill\b/i, 'drill'],
  [/\bphonk\b/i, 'phonk'],
  [/\br\s*&\s*b\b|\brnb\b|\br and b\b/i, 'rnb'],
  [/\btechno\b/i, 'techno'],
  [/\bhouse\b/i, 'house'],
  [/\bedm\b|\bfestival\b|\bbig room\b/i, 'edm'],
  [/\blo-?fi\b/i, 'lofi'],
  [/\bambient\b/i, 'ambient'],
  [/\btrailer\b/i, 'trailer'],
  [/\bcinematic (music|score|track|beat)\b|\bfilm score\b|\borchestral\b/i, 'cinematic'],
  [/\bhorror (music|score|track)\b|\bscary music\b/i, 'horror'],
  [/\bindie\b/i, 'indie'],
  [/\bfunk(y)?\b/i, 'funk'],
  [/\brock\b|\bguitar (track|music)\b/i, 'rock'],
  [/\bpop (song|track|music|beat)\b/i, 'pop'],
  [/\btrap\b/i, 'trap'],
  [/\bhype (music|track|beat)\b/i, 'hype'],
];

/** "put music on it" — with or without a named style. */
export const MUSIC_ASK = /\b(add|put|give me|make me|need|want|find|pick|choose|drop|throw|lay|use)\b[^.]{0,30}\b(music|beat|song|track|instrumental|backing track|soundtrack|tune|audio track)\b|\b(music|a beat|a song|a track)\b[^.]{0,20}\b(on|under|behind|to) (it|this|the (edit|video|clip|montage))\b|^(?:some |a |an )?(music|beat|song)\b/i;

/** "add some uk drill", "put phonk under this" — a style word doing the job of the noun. */
export const MUSIC_VERB = /\b(add|put|give me|need|want|throw|lay|use|drop|play|under|behind|over|with)\b/i;

/** The transitions people name, shared with the planner so a word means one thing. */
export const TRANSITION_WORDS = [
  [/\bzoom (transition|punch)\b|\bpunch in\b|\bzoom cut\b/i, 'zoomPunch'],
  [/\bwhip\b|\bswipe pan\b|\bwhoosh\b/i, 'whip'],
  [/\bglitch\b|\bdigital\b|\bbroken\b/i, 'glitch'],
  [/\bfilm burn\b|\bburn\b/i, 'filmBurn'],
  [/\bdip to black\b|\bfade to black\b|\bfade through black\b/i, 'dipBlack'],
  [/\bdip to white\b|\bflash\b/i, 'dipWhite'],
  [/\bslide\b/i, 'slideLeft'],
  [/\bspin\b/i, 'spin'],
  [/\bblur (transition|dissolve)\b/i, 'blurDissolve'],
  [/\biris\b|\bcircle\b/i, 'circle'],
  [/\bwipe\b/i, 'wipe'],
  [/\bdissolve\b|\bcross ?fade\b|\bsmooth transition\b|\bsoft transition\b/i, 'dissolve'],
];

/** Shapes of the canvas, by the words people use. Word boundaries matter: "shorten" is not "short". */
export const RATIO_WORDS = [
  [/\binstagram (feed|post|grid)\b|\bfeed post\b|4:5/i, '4:5'],
  [/\bsquare\b|1:1/i, '1:1'],
  [/\bcinemascope\b|2\.39|\banamorphic\b/i, '2.39:1'],
  [/\btiktok\b|\breels?\b|\bshorts?\b|\bvertical\b|9:16|\bportrait\b|\bstory\b|\bstories\b|\bphone\b|\binstagram\b|\bsnapchat\b/i, '9:16'],
  [/\byoutube\b|\blandscape\b|16:9|\bwidescreen\b|\bhorizontal\b|\bwide\b|\btv\b/i, '16:9'],
];

/* The looks people name. Whole words: "hot" inside "shot" used to grade every request sunburn. */
export const LOOK_WORDS = [
  [/\bteal (and|&) orange\b|\bblockbuster\b|\bcinematic colou?r/i, 'cinematic'],
  [/\bblack (and|&) white\b|\bb\s*&\s*w\b|\bmonochrome\b|\bgreyscale\b|\bgrayscale\b|\bmono\b/i, 'mono'],
  [/\bnoir\b|\bmoody black\b/i, 'noir'],
  [/\bvintage\b|\bretro\b|\bold school\b|\bfilm look\b|\bfaded\b/i, 'fade'],
  [/\bvhs\b|\bcamcorder\b|\b90s\b|\bnineties\b/i, 'vhs'],
  [/\bwarm(er|th)?\b|\bgolden hour\b|\bsunset\b|\bcosy\b|\bcozy\b/i, 'warm'],
  [/\bcold\b|\bcool tone\b|\bblue tone\b|\bicy\b|\bwinter\b/i, 'cool'],
  [/\bneon\b|\bcyberpunk\b|\bnight ?life\b/i, 'neon'],
  [/\bmoonlight\b|\bnight\b|\bdark and blue\b/i, 'moonlight'],
  [/\bvivid\b|\bcolou?rful\b|\bsaturated\b|\bpop(?:py)? colou?rs?\b/i, 'vivid'],
  [/\bpunchy\b|\bpunch\b|\bcontrasty\b/i, 'punch'],
  [/\bkodak\b|\bfilm stock\b|\b2383\b/i, 'kodak'],
  [/\bpastel\b|\bsoft colou?rs?\b/i, 'pastel'],
  [/\bbleach\b|\bdesaturated\b/i, 'bleach'],
  [/\bsunburn\b|\bdesert\b|\bscorching\b/i, 'sunburn'],
];

/* "without the impact frames", "no shake": the effect a style would add, taken back out. Each row: the words, and the ops or effect ids it removes. */
export const EFFECT_NEGATIONS = [
  [/\bimpact frames?\b|\bslams?\b|\bflash frames?\b/i, { ops: ['impactFrames'] }],
  [/\bshake\b|\bshaky\b/i, { effects: ['shake'] }],
  [/\bvhs\b|\btape\b/i, { effects: ['vhsWorn', 'vhsWobble'] }],
  [/\bglow\b|\bbloom\b/i, { effects: ['glow'] }],
  [/\brgb split\b|\bchromatic\b|\baberration\b/i, { effects: ['rgbSplit'] }],
  [/\bspeed ?lines?\b|\baction lines\b/i, { effects: ['linesRadial', 'speedLines'] }],
  [/\bmotion blur\b/i, { effects: ['motionBlur'] }],
  [/\bflash(es|ing)?\b|\bstrobe\b/i, { effects: ['flash'] }],
  [/\bglitch(es|y)?\b/i, { effects: ['blockGlitch', 'glitch'] }],
  [/\bgrain\b/i, { effects: ['filmGrain'] }],
  [/\bblack bars\b|\bletterbox\b|\bcinematic bars\b/i, { effects: ['crop239', 'letterbox'] }],
  [/\bzooms?\b|\bbeat zoom\b|\bpunch[- ]ins?\b/i, { ops: ['beatZoom'] }],
  [/\bvignette\b/i, { effects: ['vignetteHard', 'vignette'] }],
  [/\bspeed ramps?\b|\bramps?\b/i, { ops: ['sectionRamp', 'speedRamp'] }],
];

/** The effect negations a sentence carries: "anime edit without the impact frames, no shake". */
export function negatedEffects(text) {
  const s = String(text || '');
  const out = { ops: new Set(), effects: new Set() };
  for (const [re, what] of EFFECT_NEGATIONS) {
    const word = (s.match(re) || [''])[0];
    if (!word) continue;
    const w = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b(?:no|without|minus|skip|drop|lose|not|never|don'?t (?:add|want|use|put)|leave out|hold the|none of the)\\s+(?:the |any |a |an |those |that )?${w}`, 'i').test(s)
      || new RegExp(`${w}\\s+(?:off|out)\\b`, 'i').test(s)) {
      for (const o of what.ops || []) out.ops.add(o);
      for (const e of what.effects || []) out.effects.add(e);
    }
  }
  return out;
}

/* The vague ones: an opinion about the result, not an instruction. Shared so the reply module lets them through to the planner. */
export const VAGUE = /\b(?:make (?:it|this|them) (?:good|better|great|nice|nicer|cool|cooler|clean|cleaner|pop|pro|professional|look (?:good|better|great|nice|professional|clean|expensive|cinematic)|viral|fire|sick|hard|slap|go viral)|do something (?:cool|nice|good|creative|fun)|surprise me|just edit it|idk|i don'?t know|whatever|anything|your call|you (?:choose|decide|pick)|fix it|clean it up|polish it|improve it|go crazy|go wild|cook|do your thing|do it|just do it|make magic|work your magic)\b|^(?:go|start|begin|run|edit|edit it|edit this|edit these|edit them|video|do it|short|long|quick|fast|slow|epic|chill|hype|calm|dreamy|sad|happy|dark|moody|clean|simple|minimal)[\s!.]*$/i;

/** Stickers by name: an emoji, or one of the sticker shapes. */
export const STICKER_WORDS = [
  [/\bfire\b|\bflames?\b|\blit\b/i, 'emoji', '🔥'],
  [/\bheart\b|\blove\b/i, 'emoji', '❤️'],
  [/\bskull\b|\bdead\b/i, 'emoji', '💀'],
  [/\blaugh(ing)?\b|\bcrying laughing\b|\bfunny face\b/i, 'emoji', '😂'],
  [/\b100\b|\bhundred\b/i, 'emoji', '💯'],
  [/\beyes\b/i, 'emoji', '👀'],
  [/\bstar\b/i, 'emoji', '⭐'],
  [/\bmoney\b|\bcash\b/i, 'emoji', '💸'],
  [/\bclap\b/i, 'emoji', '👏'],
  [/\bcheck ?mark\b|\btick\b/i, 'emoji', '✅'],
  [/\bwarning\b/i, 'emoji', '⚠️'],
  [/\barrow\b/i, 'shape', 'arrow'],
  [/\bcircle\b|\bring\b/i, 'shape', 'circle'],
  [/\bbox\b|\bsquare\b|\brectangle\b/i, 'shape', 'box'],
  [/\bburst\b/i, 'shape', 'burst'],
  [/\bspeech bubble\b|\bbubble\b/i, 'shape', 'bubble'],
  [/\bcountdown\b/i, 'shape', 'countdown'],
  [/\bscribble\b/i, 'shape', 'scribble'],
  [/\bfocus\b|\bspotlight\b/i, 'shape', 'focus'],
];

/* ---- audio repair: the sound is bad and should not be ---- */
/*
 * Deliberately not called AI anywhere. This is spectral subtraction, notch
 * filters at the mains frequency, de-clicking against a running median and
 * RMS levelling — describing it as a model would be a claim we cannot back.
 */
export const AUDIO_FIX_WORDS = /\b(clean ?up|fix|repair|sort out|improve|rescue|salvage)\b[^.]{0,24}\b(audio|sound|recording|voice|mic|vocals)\b|\b(audio|sound|recording|mic|voice|vocals)\b[^.]{0,16}\b(is|sounds?|are)\b[^.]{0,16}\b(bad|rough|terrible|awful|noisy|muddy|rubbish|horrible|crap|uneven|distorted|clipping|peaking)\b|\b(remove|get rid of|kill|take out|reduce|delete|cut|lose|fix)\b[^.]{0,20}\b(hiss|hum|buzz|background noise|room noise|clicks?|pops?|crackle|static|the noise|noise)\b|\bnoise reduction\b|\bde-?noise\b|\bde-?click\b|\bnormali[sz]e (the )?(audio|sound|level|volume)?\b|\beven out the (level|levels|volume|audio|sound)\b|\blevel the audio\b/i;

/** Which parts of the repair a sentence asked for; all of them by default. */
export function repairOptions(text) {
  const s = String(text || '');
  const only = {
    noise: /\bhiss|\bnoise|\bstatic|\bde-?noise|\bbackground\b/i.test(s),
    hum: /\bhum\b|\bbuzz\b|\bmains\b|\b50\s?hz\b|\b60\s?hz\b|\bground loop\b/i.test(s),
    clicks: /\bclicks?\b|\bpops?\b|\bcrackle\b|\bde-?click\b/i.test(s),
    level: /\blevel\b|\bvolume\b|\bnormali[sz]e\b|\bquiet\b|\bloud\b|\beven out\b/i.test(s),
  };
  /* "clean up the audio" names nothing in particular and means all of it. */
  if (!only.noise && !only.hum && !only.clicks && !only.level) return { noise: 1.5, hum: true, clicks: true, level: true };
  return { noise: only.noise ? 1.8 : 0, hum: only.hum, clicks: only.clicks, level: only.level };
}

/* ---- layers that exist to be parents ---- */
export const NULL_WORDS = /\b(add|make|create|give me)\b[^.]*\bnull\b|\bnull object\b|\bcontrol(ler)? layer\b/i;
export const PARENT_WORDS = /\b(parent|attach|pin|stick)\b[^.]{0,40}\bto\b|\bfollow(s)?\b/i;

/** The first table entry a sentence matches, or null. */
export function firstMatch(table, text) {
  const s = String(text || '');
  for (const row of table) if (row[0].test(s)) return row;
  return null;
}
