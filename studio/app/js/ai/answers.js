/*
 * Replies that are not edits.
 *
 * Most of what lands in the AI box is an instruction. Some of it is "hi",
 * "how do I export", "is this free", "make me famous", or nothing at all.
 * Those used to fall through to the planner, which would build a whole edit
 * out of "hello" — the one behaviour guaranteed to make an assistant look
 * stupid on the first thing anybody types.
 *
 * This file answers them. It reads the same app the guide does: the guide
 * articles for how-to questions, the editions and their prices from config,
 * the AI allowance per edition, the skill levels. Nothing here is a claim the
 * rest of the app does not already make, and every number comes from the
 * place the pricing page reads it from.
 *
 * It runs first, on the device, and never spends an AI action. A reply is
 * `{ answer, questions? }`; null means "this is an edit, plan it".
 */

import { GUIDE } from '../guide.js';
import { EDITIONS, AI_QUOTA, PAY } from '../../../assets/config.js';
import { DESCRIPTIONS } from '../levels.js';
import { editWords, readable } from './normalise.js';
import { VAGUE, EFFECT_WORDS, SHAPE_WORDS, ANIMATOR_WORDS, EXPRESSION_WORDS, MUSIC_WORDS, TRANSITION_WORDS, LOOK_WORDS, firstMatch } from './vocabulary.js';

const price = (id) => `$${EDITIONS[id].once.toFixed(2)}`;
const EXAMPLES = '"mute clip 2", "make the last shot black and white", "add captions", "20 second phonk edit, cut on the beat"';

/* ---- how-to: the guide, searched properly ---- */
const STOP = new Set('how do i can you where is are the a an my to it this that what which of in on for with does and or its'.split(' '));

/*
 * Known topics go straight to their article, by title. Word scoring is the
 * fallback, and it gets "motion tracking" wrong ("motion" sits in the speed
 * article's title) — a table of the questions people ask most does not.
 */
const TOPICS = [
  [/\bmotion tracking\b|\btrack(?:ing)? (?:a|the|my|his|her|an) (?:face|person|object|subject|thing)\b|\bface track|\btracker\b/, /Following a face/],
  [/\bremove (?:a |the |an )?(?:thing|object|can|sign|person|guy|someone)\b|\btake .* out of (?:the|a) shot\b|\berase\b|\btap.to.remove\b/, /Taking a thing out/],
  [/\bremove (?:the )?background\b|\bgreen ?screen\b|\bchroma\b/, /Finding an effect/],
  [/\blut|\bcurves\b|\bgrading\b|\bcolou?r wheels?\b|\bcolou?r panel\b|\bgrade\b/, /Grading/],
  [/\bmulticam\b|\bangles?\b/, /Multicam/],
  [/\bfreeze frame\b|\bmatch frame\b|\bshuttle\b|\binsert\b|\boverwrite\b/, /Freeze, match frame/],
  [/\bspeed ramps?\b|\bramps?\b/, /^Speed ramps$/],
  [/\bspeed\b|\bslow motion\b|\bslo-?mo\b/, /Speed, slow motion/],
  [/\bexpressions?\b|\bwiggle\b/, /Expressions/],
  [/\bshape layers?\b|\bshapes?\b/, /Shape layers/],
  [/\bparent(?:ing)?\b|\bnull object|\banchor point/, /Parenting/],
  [/\bparticles?\b|\bdisplacement\b|\bfractal\b|\becho\b/, /Particles, noise/],
  [/\btext animators?\b|\bletter by letter\b/, /Text animators/],
  [/\binstall\b|\bas an app\b|\bhome screen\b/, /Install it as an app/],
  [/\bevery platform\b|\ball platforms\b|\bvertical and landscape\b/, /Export for every platform/],
  [/\bexport|\bposting\b|\bpost (?:it |this )?to\b|\bformats?\b|\bpresets? (?:for|to) export\b/, /Exporting and posting/],
  [/\blevels?\b|\bbeginner\b|\bexpert\b|\bintermediate\b/, /three skill levels/],
  [/\bcaptions?\b|\bsubtitles?\b|\btypefaces?\b|\bfonts?\b|\btitles?\b|\btext\b/, /Titles, captions/],
  [/\bcutaway\b|\bb-?roll\b/, /cutaway/],
  [/\bcopy (?:an|another|that|this|someone'?s) (?:edit|video|style)\b|\bcopy .* edit\b|\breference video\b/, /Copying another/],
  [/\bmontage\b/, /whole montage/],
  [/\bloudness\b|\bchannel strip\b|\blufs\b|\bmix\b|\bmixer\b/, /channel strip/],
  [/\bmasks?\b|\bwindows?\b|\bqualifier\b|\bgrade one thing\b/, /Windows and the qualifier/],
  [/\bripple\b|\broll\b|\bslip\b|\bslide edit\b|\btrim modes?\b|\btrims?\b/, /four trims/],
  [/\bkeyframes?\b|\bgraph editor\b|\banimat(?:e|ing) (?:a |the )?(?:value|property|position|scale)\b/, /keyframes and the graph/],
  [/\bgroup(?:ing)?\b|\bcompound\b|\bnest\b/, /Grouping clips/],
  [/\badjustment layers?\b|\bscene detect|\bflat video\b/, /Adjustment layers/],
  [/\bpages?\b|\bcut page\b|\bdeliver\b/, /Pages: one screen/],
  [/\bwhere .* (?:files|projects?|saved)\b|\bwhere .* go\b|\bautosave\b|\bsaved\b/, /Where your files/],
  [/\bstart screen\b|\bprojects? list\b|\bopen (?:a |the )?project\b/, /start screen/],
  [/\btabs?\b|\bsidebar\b|\brail\b|\bpanels?\b/, /tabs down the side/],
  [/\bright[- ]click\b|\bcontext menu\b|\bfull[- ]screen timeline\b/, /Right-click/],
  [/\boverlays?\b|\blayers?\b|\bmute a track\b|\btake the sound off\b|\bsound off a clip\b/, /Layers, overlays/],
  [/\bundo\b|\bhistory\b|\bgo back\b/, /Undoing/],
  [/\bpresets?\b/, /Presets: a whole/],
  [/\baudio\b|\bsound\b|\bnoise\b|\bhiss\b|\bclean(?:ing)? up\b/, /Levels, cleaning up/],
  [/\baccount\b|\banother device\b|\bsign in\b|\blog in\b/, /account on another device/],
  [/\beffects?\b|\bfilters?\b|\bfind (?:an|the) effect\b/, /Finding an effect/],
  [/\bsplit\b|\bimport\b|\bfirst edit\b|\bget(?:ting)? started\b|\bbasics\b/, /Your first edit/],
];

function guideAnswer(q) {
  const words = q.toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => !STOP.has(w) && w.length > 1) || [];
  if (!words.length) return null;
  for (const [re, titleRe] of TOPICS) {
    if (!re.test(q.toLowerCase())) continue;
    const a = GUIDE.find((x) => titleRe.test(x.title));
    if (a) {
      const lines = a.body.slice(0, 3).map(([h, t]) => `**${h}.** ${t.replace(/\*\*/g, '')}`);
      return `**${a.title}**\n${lines.join('\n')}\n\nThe whole article is under Learn (the ? tab) → ${a.group}.`;
    }
  }
  // The question's own phrase, whole: "motion tracking" as two words scores
  // the speed article for "motion"; as a phrase it scores the tracking one.
  const phrase = words.join(' ');
  let best = null;
  for (const a of GUIDE) {
    const title = a.title.toLowerCase();
    const body = a.body.map(([h, t]) => `${h} ${t}`).join(' ').toLowerCase();
    let score = 0;
    for (const w of words) {
      if (title.includes(w)) score += 3;
      else if (body.includes(w)) score += 1;
    }
    if (words.length > 1 && (title.includes(phrase) || body.includes(phrase))) score += 6;
    if (score > (best?.score || 0)) best = { a, score };
  }
  if (!best || best.score < 2) return null;
  const lines = best.a.body.slice(0, 3).map(([h, t]) => `**${h}.** ${t.replace(/\*\*/g, '')}`);
  return `**${best.a.title}**\n${lines.join('\n')}\n\nThe whole article is under Learn (the ? tab) → ${best.a.group}.`;
}

/* ---- the table: a test, and what to say ---- */
const REPLIES = [
  /* nothing, or noise */
  { id: 'empty', test: (r) => !r.trim(), say: () => `Say what you want done and I plan it — you approve it before anything moves. Try ${EXAMPLES}.` },
  { id: 'emoji', test: (r) => !/[a-z0-9]/i.test(r) && /\p{Extended_Pictographic}/u.test(r), say: (r) => `I can put that on the picture: say "add a ${r.trim().slice(0, 4)} sticker" (and where, like "at 2 seconds").` },
  { id: 'punctuation', test: (r) => !/[a-z0-9]/i.test(r), say: () => `I did not catch that. Say what to change — ${EXAMPLES}.` },

  { id: 'code', test: (r) => /<\/?[a-z]+[^>]*>|\b(?:drop table|select \* from|insert into|delete from|alert\(|function\s*\(|=>\s*\{|console\.log|<script)\b|;\s*--\s*$|^\s*[{[].*[}\]]\s*$/i.test(r),
    say: () => `That looks like code. I read plain sentences — ${EXAMPLES}.` },

  /* talk */
  { id: 'greeting', test: (s) => /^(?:hi+|hello+|hey+|yo+|sup|what'?s up|whats up|hola|bonjour|hallo|oi|good (?:morning|afternoon|evening)|howdy|hiya)\b[\s!.?]*(?:there|guys|bro|mate)?[\s!.?]*$/.test(s),
    say: () => `Hi. I plan edits from a sentence — you approve the plan, then it lands on the timeline as normal clips. Try ${EXAMPLES}.` },
  { id: 'thanks', test: (s) => /^(?:thanks|thank you|thank u|thx|ty|cheers|gracias|merci|danke|appreciate it|nice one|perfect|great|awesome)\b[\s!.a-z]*$/.test(s) && s.length < 40,
    say: () => 'Any time. Say the next change when you are ready.' },
  { id: 'ack', test: (s) => /^(?:ok(?:ay)?|k|yes|yep|yeah|ya|no|nope|nah|sure|fine|cool|lol|lmao|haha|hmm+|idk|test|testing|ping|null|undefined|nan|true|false|asdf\w*|qwerty\w*|why|what|huh|eh|nothing|never ?mind|nvm|stop|wait|hold on|hang on|one sec|cancel|cancel that|forget it|skip)\b[\s!.?]*$/.test(s),
    say: () => `Nothing to do yet. Say what to change — ${EXAMPLES}.` },
  { id: 'incomplete', test: (s) => /^(?:make|add|put|do|create|build|give me|show me|change|set|turn|get|remove|delete|fix|edit)\b[\s!.?]*$/.test(s),
    say: (s) => `${s.trim().replace(/[!.?]+$/, '')} what? Say the thing and the change — ${EXAMPLES}.` },
  { id: 'nice', test: (s) => /^(?:i love (?:you|this|it)|love (?:you|this|it)|you(?:'?re| are) (?:the best|amazing|great|awesome|a legend|good)|this is (?:great|amazing|awesome|fire|sick)|bye|goodbye|good ?night|see you|see ya|cya|later|peace|take care|good job|well done|nice work)\b[\s!.?]*$/.test(s),
    say: () => 'Cheers. The plan button is here whenever the next edit is.' },
  { id: 'profanity', test: (s) => /^(?:fuck|fuck this|fuck it|shit|wtf|ffs|bullshit|this is bullshit|screw this|damn it)[\s!.]*$/.test(s),
    say: () => 'Rough one. Tell me what went wrong — "the last clip is too dark", "undo the captions" — and I will sort the edit out.' },

  /* who and what */
  { id: 'identity', test: (s) => /\b(?:who|what) are you\b|\bare you (?:chat\s?gpt|gpt|claude|gemini|siri|alexa|an? (?:ai|bot|robot|human|person|real))\b|\bwhat (?:model|ai|llm) (?:are you|is this)\b|\bwhich (?:model|ai)\b|\byour name\b/.test(s),
    say: () => 'I am the OmniDx Studio editing assistant. On this device I read direct instructions and named styles and turn them into a plan you approve. With the server switched on, a language model plans free-form requests the same way. I do not generate footage, and I never see yours — only the file names and what you type.' },
  { id: 'what', test: (s) => /^(?:help|help me|what can you do|what do you do|what can i (?:say|ask|type|do)|how does this work|how do you work|what should i (?:type|say|write)|what is this|what does this do|examples?)\b[\s?!.]*$/.test(s),
    say: () => `Three kinds of thing:\n**A change to specific clips** — "mute clip 2", "slow the last shot to half speed", "brighten clips 2 to 4", "delete the first one".\n**Something on top of the edit** — "add captions", "add a phonk beat", "put a title that says GO on the opening", "dissolve between every clip", "make it vertical".\n**A whole edit from your clips** — "20 second anime edit, cuts on the beat, impact frames", "cinematic trailer with black bars", "top 5 countdown".\nSeveral at once is fine: "mute clip 2 and slow the last one down". You see every step before anything runs, and one Ctrl+Z takes the whole thing back.` },
  { id: 'omnidx', test: (s) => /\bwhat is omnidx\b|\bwhat'?s omnidx\b|\bwhat is this app\b|\bwhat is omnidx studio\b/.test(s),
    say: () => `OmniDx Studio is a video editor that runs in the browser, on your device, with nothing uploaded. ${EDITIONS.free.name} is free with the whole editor in it; ${EDITIONS.creator.name} is ${price('creator')} once, no subscription, and adds this assistant among other things.` },

  /* money */
  { id: 'locked', test: (s) => /\bpaid but\b|\bbought (?:it )?but\b|\bpurchased but\b|\bstill locked\b|\bnot unlocked\b|\bdidn'?t unlock\b|\bwon'?t unlock\b|\bactivat(?:e|ion)\b|\blicen[cs]e (?:key|code|not working|isn'?t working|on another|to another|on my other)\b|\b(?:use|move|transfer) (?:my |the )?(?:licen[cs]e|account|purchase) (?:on|to) (?:another|a new|my other|a second)\b|\banother device\b|\bnew (?:phone|laptop|computer)\b/.test(s),
    say: () => 'Paid and still locked: open omnidx.net/studio/activate — it unlocks your copy from the receipt, no key to type. For a second device, Learn → "Your account on another device" walks through the move code: a short code from the device that is unlocked, typed into the new one, and both stay unlocked.' },
  { id: 'price', test: (s) => /\b(?:how much|cost|costs|price|prices|pricing|pay|paid|buy|purchase|subscription|subscribe|monthly|per month|a month|free\b|trial|premium|upgrade|plans?)\b/.test(s) && !/\bfree (?:up|space|the)\b/.test(s),
    say: () => `${EDITIONS.free.name} is free: the whole editor, no watermark, no time limit, no account. ${EDITIONS.creator.name} is ${price('creator')}, ${EDITIONS.studio.name} ${price('studio')}, ${EDITIONS.team.name} ${price('team')} — each paid once, ever, and every update after it is free. There is no subscription and never will be. The full comparison is on the pricing page (omnidx.net/studio/pricing).` },
  { id: 'refund', test: (s) => /\brefund|money back|charged|charge me|\bcancel (my |the )?(subscription|plan|payment|order|it)|how do i cancel/.test(s),
    say: () => `There is no subscription to cancel — every edition is paid once. Ask for a refund within two weeks and you get one, no explanation needed${PAY.supportEmail ? ` — email ${PAY.supportEmail}` : ''}. It says so on the pricing page, so it is not a favour, it is the deal.` },
  { id: 'compare', test: (s) => /\bbetter than\b|\bvs\.?\b|\bversus\b|\bcompared? (to|with)\b|\bcapcut|premiere|davinci|resolve\b|final cut|imovie|after effects|filmora|kinemaster|vn editor/.test(s),
    say: () => `I am not going to rank it against another editor — you can, in five minutes, for free. What it is: a full editor that runs on your device with nothing uploaded, ${EDITIONS.free.name} free with no watermark, the paid editions bought once with every update free after. The pricing page lists what is built, line by line.` },
  { id: 'support', test: (s) => /\btalk to (a |an )?(human|person|someone|real person|agent)\b|\bcontact (support|you|someone|the team)\b|\bcustomer (service|support)\b|\bsupport email\b|\bhelp desk\b|\bemail (you|support|the dev)\b|\bwho made this\b|\bwho built this\b|\bwho is behind\b|\bwho are the devs?\b/.test(s),
    say: () => `${PAY.supportEmail ? `Email ${PAY.supportEmail} — ` : ''}Learn → Still stuck opens an email with your build number and browser already filled in, which is the first thing anyone would ask for. OmniDx Studio is made by one small team; the trust page (omnidx.net/studio/trust) says who and how.` },
  { id: 'scam', test: (s) => /\bscam|legit|rip ?off|fake|sketchy|trust (?:this|you|it)\b/.test(s),
    say: () => 'Fair question, and there is a page for it: omnidx.net/studio/trust — what is built, what is not, how the money works, and how to check any of it. Short version: the editor runs on your device, nothing is uploaded, the free edition has no catch, and a refund inside two weeks is automatic.' },

  /* privacy */
  { id: 'privacy', test: (s) => /\boffline|no internet|without internet|without wifi|upload|uploaded|uploading|private|privacy|my (?:videos|footage|files|data|clips) (?:go|safe|private|stored)|(?:store|storing|keep|keeping|save|saving|collect|collecting|sell|selling|use|using|train on) my (?:videos?|footage|files|data|clips|face|voice)|where (?:do|does|are) (?:my|the) (?:files|videos|projects)|cloud|your servers?\b|see my (?:video|footage|files)|train(?:ed|ing)? (?:on|with) my/.test(s),
    say: () => 'Everything runs on this device. Your footage is never uploaded — the editor reads the files from where they are and renders on your machine, so it works with no internet at all. The one thing that can leave is this box: with the server switched on, your words and your file *names* go to the planner, never a frame or a sound. Projects are saved on this device every five seconds.' },

  /* the AI itself */
  { id: 'quota', test: (s) => /\bhow many (?:ai|edits|prompts|requests|uses|plans)|\bai (?:limit|quota|allowance|credits|uses)|\b(?:left|remaining) this month|\bwhy is (?:the )?ai locked|\bai (?:is )?locked|\bunlock (?:the )?ai\b|\bpaid feature\b/.test(s),
    say: () => `${EDITIONS.free.name} has no AI actions — the assistant starts at ${EDITIONS.creator.name} (${price('creator')}, once), which gives ${AI_QUOTA.creator} a month; ${EDITIONS.studio.name} and ${EDITIONS.team.name} are unlimited. Planning is free; an action is spent only when you press Do it. Two things that cost nothing on any edition: the Styles panel, which builds a whole edit with cuts on the beat, and "Copy an edit you like", which rebuilds any video's shape with your clips.` },

  /* the app */
  { id: 'levels', test: (s) => /\b(?:skill )?levels?\b.*\b(?:difference|mean|what|which)|\bbeginner|intermediate|expert|professional mode\b|\bwhat (?:is|are) the (?:three )?(?:levels|modes)\b/.test(s),
    say: () => Object.values(DESCRIPTIONS).map((l) => `**${l.name}** — ${l.line}`).join('\n') + '\n\nSwitch in Settings; going up never hides anything you have done.' },
  { id: 'phone', test: (s) => /\b(?:on|for) (?:my )?(?:phone|iphone|android|ipad|tablet|mobile)\b|\bis there an app\b|\bapp store|play store|\binstall\b|\bdownload the app\b/.test(s),
    say: () => 'Yes. It is the same editor on a phone, with sheets and gestures instead of panels — open omnidx.net/studio/app in the phone\'s browser. To have it as an app, use Install from the browser menu (Learn → "Install it as an app" walks through it), or omnidx.net/studio/download for every platform.' },
  { id: 'shortcuts', test: (s) => /\bshortcuts?\b|\bhotkeys?\b|\bkey ?binds?\b/.test(s),
    say: () => 'Space plays, S splits at the playhead, C is the razor, V the selection tool, Delete removes the selected clips, Ctrl+D duplicates, Ctrl+Z undoes, Ctrl+E exports, Ctrl+K finds anything. The full list is under Learn → Keyboard.' },
  { id: 'undo', test: (s) => /^(?:undo|undo that|undo it|undo everything|undo all|undo it all|undo the last (?:thing|one|step)|go back|take that back|revert|redo|redo that)\b[\s!.]*$/.test(s),
    say: () => 'Ctrl+Z (⌘Z on a Mac) — the Undo button in the top bar says what it will take back before you press it. For something a few steps ago, Edit → History lists every change with the time; click one and the project goes back to exactly then.' },
  { id: 'export', test: (s) => /^(?:export|export it|export this|export the video|save|save it|save the video|download|download it|download the video|render|render it)\b[\s!.]*$/.test(s),
    say: () => 'Press Export (Ctrl+E), pick a preset — 720p to 4K, vertical or wide — and it renders on this device. Projects save themselves every five seconds, so there is no Save to press. After the render it offers to post: on a phone that is the share sheet, so TikTok and the rest are one press away.' },
  { id: 'howto-music', test: (s) => /\bhow (?:do|can|to) (?:i |you )?(?:add|put|import|use|get|find|pick) (?:some |a |my |my own |the )?(?:music|song|songs|beat|beats|track|tracks|audio|sound)\b|\bwhere (?:is|are) the (?:music|beats|songs|library|sound library)\b|\bmy own (?:music|song|track)\b/.test(s),
    say: () => 'Two ways. Your own song: + Import (or drag the file in), then double-click it in Media and it lands on the audio track. From the library: open Sound on the rail — 544 tracks written on the device, nothing to licence — or just tell me: "add a phonk beat", "add some lofi", "add a beat at 140 bpm". Either way the beat grid is exact, so "cut on the beat" lands.' },
  { id: 'howto-transitions', test: (s) => /\bwhere (?:is|are|do i find) (?:the )?transitions?\b|\bhow (?:do|can|to) (?:i |you )?(?:add|put|use|find|do) (?:a |the |some )?transitions?\b/.test(s),
    say: () => 'The Transitions tab on the rail: drag one onto a cut, or select a clip and press one to put it on its start. Drag either edge on the timeline to change the length. Or say it: "put a dissolve on every cut", "whip pan between the shots", "glitch transition on clip 3".' },
  { id: 'fps4k', test: (s) => /\b(?:make|export|render|do) (?:it|this|the video)?\s*(?:in |at )?(?:4k|8k|1080p|720p|60 ?fps|30 ?fps|24 ?fps|hd|uhd)\b|^(?:4k|60 ?fps)$/.test(s),
    say: () => 'That is an export setting rather than an edit: Export → pick the 4K or 1080p preset (vertical 4K is there too). Frame rate is in Settings — 24, 25, 30, 60, and the broadcast rates. The edit itself does not change.' },

  /* things it does not do, said plainly */
  { id: 'generate', test: (s) => /\b(?:generate|create|make|render|draw|imagine|animate|produce)\b.{0,30}\b(?:a |an |some )?(?:video|clip|footage|image|picture|scene|animation|cartoon|character|avatar)\b.{0,20}\b(?:of|from|with|about)\b (?:a |an |the )?(?:cat|dog|text|prompt|description|nothing|scratch|thin air|words|my (?:face|voice|photo))|\btext[- ]to[- ]video|\bai (?:video|image) generat|\bfrom (?:a )?(?:text|prompt|description)$|\badd my face\b|\bdeepfake|\bface swap|\bclone my voice|\bai voice\b|\bmake me (?:famous|rich)\b/.test(s),
    say: () => 'It edits your footage; it does not make any. Import clips, photos or music and I can cut, grade, time to the beat, caption, and build a whole montage from them — but nothing appears that you did not shoot. For a face or a voice, record it on your phone and import the file. As for viral: I can make the edit fast, clean and cut on the beat, which is the part I control.' },
  { id: 'voiceover', test: (s) => /\bvoice ?over|narrat|read (?:this|it) out|text to speech|\btts\b/.test(s),
    say: () => 'There is no synthetic voice in the editor. Record the voiceover on your phone (any voice memo app), import the file, and drop it on an audio track — the music ducks under it automatically. Then say "add captions" and they are timed to it.' },
  { id: 'posts', test: (s) => /\b(?:write|give|suggest|make|come up with|generate)\b.{0,20}\b(?:caption|captions|hashtags?|title|description|hook|script|ideas?)\b.{0,20}\b(?:for|to post|tiktok|instagram|youtube|reel)|\bwhat should i post\b|\bpost ideas?\b|\bhashtags?\b[\s?!.]*$/.test(s),
    say: () => 'I plan edits, not posts — but the formula that works is short: first line says what happens in the video, second line is the one question people will comment on, then three tags that name the thing (not "#fyp"). Put the text in the app with "add a title that says …" and it goes on the picture too.' },
  { id: 'offtopic', test: (s) => /\b(?:joke|weather|time is it|what time|homework|essay|recipe|stock|crypto|bitcoin|lottery|girlfriend|boyfriend|meaning of life|who won|news today|translate this)\b/.test(s),
    say: () => 'Not my department — I only plan edits in here. If there is footage on the timeline, say what to change and I will get on with it.' },
  { id: 'injection', test: (s) => /\bignore (?:all |the |your )?(?:previous|prior|above|earlier) (?:instructions|prompts?|rules)|\bsystem prompt|\bapi key|\bsecret key|\breveal your (?:instructions|prompt)|\bjailbreak|\bdeveloper mode\b/.test(s),
    say: () => 'I only plan edits here, and I do not hold any keys. If there is footage on the timeline, tell me what to change.' },
  { id: 'watermark', test: (s) => /\bremove\b.{0,30}\bwatermark\b|\bwatermark\b.{0,30}\b(?:remove|off|get rid|delete)\b|\btiktok logo\b.{0,20}\b(?:remove|off)\b/.test(s),
    say: () => 'Taking someone else\'s watermark off their video is not something I will help with. If it is your own export from another app, re-export it from here without one — nothing made in OmniDx Studio carries a watermark on any edition. If you like an edit you saw, use "Copy an edit you like" below: it rebuilds that edit\'s shape with your clips, and nothing from theirs.' },
  { id: 'url', test: (s) => /https?:\/\/|www\.|\.com\/|tiktok\.com|youtube\.com|youtu\.be|instagram\.com/.test(s),
    say: () => 'I cannot open links. Save the video to your device, then use "Copy an edit you like" in this panel — drop the file in and it works out how that edit was cut and rebuilds the same shape with your clips. Nothing from the video you drop in ends up in yours.' },
  { id: 'logo', test: (s) => /\b(?:add|put|insert|place|drop)\b.{0,15}\b(?:my |the |a |our )?(?:logo|watermark|brand mark)\b|\bwatermark (?:it|this|my)\b/.test(s),
    say: () => 'I cannot add a logo I have not seen. Import the image (+ Import, or drag it in), drag it onto a track above the video, and place it with the Inspector. Once it is on the timeline I can work with it — "make the logo wiggle", "spin the logo", "fade the logo in".' },
  { id: 'copyright', test: (s) => /\bcopyright|copyrighted|royalty|content id|claimed|dmca|licen[cs]e (?:to use|for) .{0,20}(?:song|music|track)|can i use .{0,20}(?:song|music|track)\b/.test(s),
    say: () => 'Every track in the app\'s music library is written on your device, so nothing can be claimed on upload — say "add a phonk beat" or pick one in Sound. A song you import yourself is your own responsibility: TikTok and YouTube match uploads against the labels\' catalogues, and a claimed song can mute or demonetise the post.' },
  { id: 'crash', test: (s) => /\bcrash|crashed|froze|frozen|lost my (?:project|work|edit|video)|where (?:did|is|are|has) my (?:project|video|edit|work|clips|files)|disappeared|gone|not saved|didn'?t save|wiped/.test(s),
    say: () => 'Your work is saved every five seconds, and a copy is written the instant anything changes. Reopen the editor: it offers to put you back exactly where you were. The start screen lists every project on this device; Edit → History inside a project lists every change with the time, so nothing is thrown away.' },
  { id: 'exportfail', test: (s) => /\bexport (?:failed|fails|failing|broke|is broken|won'?t work|not working|stuck|error|is slow|takes?|taking|so long|too long)|\bcan'?t export|\brender (?:failed|fails|error|is slow|takes)|\bslow export/.test(s),
    say: () => 'Try a smaller preset first (1080p rather than 4K), close other tabs, and make sure the device has a few gigabytes free — an export writes the whole file before it hands it over. Chrome and Edge render fastest. If it still stops, the error text and your build number (Learn → Still stuck) are what support needs.' },
  { id: 'laggy', test: (s) => /\blag|laggy|lagging|stutter|choppy|slow to play|playback is slow|preview is slow|preview (?:is )?(?:laggy|choppy)|freezes when/.test(s),
    say: () => 'Playback is the preview, not the export — the export is always full quality. For a smoother preview: lower the preview quality under the viewer, untick a few heavy effects while you cut (glow, motion blur, particles) and put them back for export, and on a phone keep the number of layers down. Long 4K clips are the usual cause; proxies (Media → Make proxies) fix that.' },
  { id: 'limits', test: (s) => /\bhow long can\b|\bmax(?:imum)? (?:length|duration|size|resolution|file)|\bhow big\b|\bfile size limit\b|\blength limit\b|\bwhat resolution\b|\bhighest resolution\b|\bup to 4k\b|\bsupport 4k\b/.test(s),
    say: () => 'No time limit and no file-size limit on the edit — the timeline is as long as your footage. Export presets run from 720p to 4K (DCI 4K and vertical 4K included) at your project frame rate. The practical limit is the device: a long 4K export needs a few gigabytes free and a while to render.' },
  { id: 'browser', test: (s) => /\bsafari|chrome|firefox|edge browser|\bedge\b|brave|opera|which browser|what browser|browser (?:does|do|is|works)/.test(s),
    say: () => 'It runs in the browser on any current device. Chrome and Edge are where it is tested most and export fastest; Safari on iPhone and Mac is what the phone app is, so that works too. If something misbehaves elsewhere, try it in Chrome first — and Install from the browser menu makes it its own app either way.' },
  { id: 'import', test: (s) => /\bimport from (?:google drive|dropbox|icloud|onedrive|the cloud|youtube|tiktok|instagram|a link|url)\b|\b(?:google drive|dropbox|icloud|onedrive)\b/.test(s),
    say: () => 'Import takes files from the device: + Import, or drag them onto the window. From Google Drive, Dropbox or iCloud, download the file first (the Files app on a phone, the desktop client on a computer), then import it. Nothing is fetched from a link.' },
  { id: 'complaint', test: (s) => /\b(?:this app|the app|this editor|the editor|omnidx|this|it|you) (?:sucks|is (?:trash|garbage|useless|broken|shit|terrible|awful|bad|dogshit))|\buseless\b|\bhate this\b|\bworst\b/.test(s),
    say: () => 'Say what went wrong and I will fix the edit, or say what you tried and I will tell you the control for it. If it is the editor itself, Learn → Still stuck reaches a person, with your build number already filled in.' },

  /* things the editor does by hand, not by sentence */
  { id: 'manual', test: (s) => /\b(?:freeze frame|freeze (?:it|this|the|on|at)|reverse (?:it|this|the |clip|shot|the clip)|play (?:it |this )?backwards|duplicate|copy the clip|(?<!rgb |colou?r |screen )split (?:it|this|the|clip|at|in)|cut (?:it |this |the clip )?in half|crop (?:it|this|the|clip|to|in)|stabili[sz]e|sharpen|loop (?:it|this|the)|make it loop|add (?:a |some )?keyframes?|keyframe (?:it|the|this)|add a mask|mask (?:it|the|out|this))\b/.test(s) && !/\breverse the order\b|\bflip the order\b|\bbackwards order\b|\bremove\b.{0,20}\bcrop\b/.test(s),
    say: (s) => {
      if (/\bfreeze/.test(s)) return 'Freeze frame: put the playhead on the moment, right-click the clip → Freeze frame (Intermediate level and up). The frame holds and everything after it slides along.';
      if (/\breverse|backwards/.test(s)) return 'Reverse: select the clip, then in the Inspector set the speed to a negative number — -1 plays it backwards at normal speed. Speed ramps can reverse in the middle of a shot too.';
      if (/\bduplicate|copy the clip|loop/.test(s)) return 'Select the clip and press Ctrl+D — the copy lands right after it. Press it again for another. That is also how to loop a shot: duplicate it a few times.';
      if (/\bsplit|cut in half/.test(s)) return 'Put the playhead where you want the cut and press S. Or press C for the razor and click the clip where you want it cut; V goes back to the normal tool.';
      if (/\bcrop/.test(s)) return 'Select the clip → Inspector → Crop, and drag the edges in the viewer. For a different shape for the whole video, say "make it vertical" or "make it square" and I will change the canvas.';
      if (/\bstabili/.test(s)) return 'There is no stabiliser in the editor yet. A slight zoom in ("zoom into clip 2") hides the worst of a shaky edge, and the Shake effect can add motion on purpose, but it cannot take real camera shake out.';
      if (/\bsharpen/.test(s)) return 'There is no sharpen control yet. More contrast ("more contrast on clip 3") and a touch of Clarity in Colour → Curves is the closest thing, and it goes a long way on soft phone footage.';
      if (/\bkeyframe/.test(s)) return 'Select the clip, open the Inspector, and press the diamond next to any value to set a keyframe at the playhead. Move the playhead, change the value, and it keys itself. The graph editor is under the timeline for easing.';
      if (/\bmask/.test(s)) return 'Select the clip → Masks panel → draw a shape or a window on the picture. It can be tracked to follow something. A grade or an effect on that clip then applies inside the mask only.';
      return null;
    } },
  { id: 'clear', test: (s) => /^(?:delete|remove|clear|wipe|erase|reset)\s+(?:everything|all of it|the whole (?:thing|timeline|project|edit)|it all|all|the timeline|the project)\s*[!.]*$|^\s*start (?:over|again|from scratch|fresh)\b[\s!.]*$|\bclear the timeline\b/.test(s),
    say: () => 'That clears the whole timeline, so I will not do it from a sentence. Press Ctrl+A then Delete to do it yourself — one Ctrl+Z brings it back. To rebuild instead of clear, say what you want it to become: "start over with a 20 second phonk edit".',
    ask: () => ['Rebuild it as something? Say a style and a length.'] },
];

/**
 * A reply for a request that is not an edit, or null.
 *
 * `raw` is what was typed; `text` is the normalised version. The chat
 * patterns look at the raw text, because "hey" as an opener has already been
 * stripped from the normalised one.
 */
export function quickAnswer(raw, text) {
  const r = String(raw ?? '');
  const rs = r.trim().toLowerCase().replace(/\s+/g, ' ');
  const s = String(text || '');

  if (VAGUE.test(rs) || VAGUE.test(s)) return null;

  for (const rule of REPLIES) {
    const hit = ['empty', 'emoji', 'punctuation', 'code', 'greeting', 'thanks', 'ack', 'profanity'].includes(rule.id)
      ? rule.test(['empty', 'emoji', 'punctuation', 'code'].includes(rule.id) ? r : rs)
      : (rule.test(s) || rule.test(rs));
    if (!hit) continue;
    const answer = rule.say(s || rs);
    if (!answer) continue;
    return { answer, questions: rule.ask ? rule.ask() : [], id: rule.id };
  }

  /* A question about the app: the guide answers it. */
  const asksSomething = /^(?:how (?:do|can|would|should|does|is|long|much|many|big)\b|how to\b|where (?:is|are|do|can|did|does|has|have)\b|what (?:is|are|does|do|was|were|about|resolution|format|formats|size)\b|what\b.{0,30}\b(?:can|do|does|is|are) (?:i|you|it|this)\b|which\b|is (?:there|it|this|that)\b|are (?:there|you|they|these)\b|does (?:it|this|the app|that)\b|do (?:you|i|they)\b|why\b|who\b|when\b|can (?:it|this|the app|i)\b|should i\b|will (?:it|this)\b)/.test(rs)
    || (/\?\s*$/.test(rs) && /\b(?:how|where|what|which|is there|does|can i|do you|why|who)\b/.test(rs));
  if (asksSomething && !(editWords(s) > 0 && /^(?:make|mute|slow|speed|delete|remove|add|put|trim|zoom|fade|brighten|darken|rotate|flip|cut|sync|clean|fix)\b/.test(s))) {
    const fromGuide = guideAnswer(rs);
    if (fromGuide) return { answer: fromGuide, questions: [], id: 'guide' };
    if (/\b(?:how|where)\b/.test(rs)) {
      return { answer: `I could not find that in the guide. Open Learn (the ? tab) and search there — it covers the whole editor. If it is something to change in the edit, say it as an instruction: ${EXAMPLES}.`, questions: [], id: 'guide-miss' };
    }
  }

  /* Not a word of it is about editing, or about anything. */
  if (!readable(s) && !readable(r)) {
    return { answer: `I did not catch that. Say what to change — ${EXAMPLES}.`, questions: [], id: 'unreadable' };
  }
  const namesSomething = [EFFECT_WORDS, SHAPE_WORDS, ANIMATOR_WORDS, EXPRESSION_WORDS, MUSIC_WORDS, TRANSITION_WORDS, LOOK_WORDS].some((t) => firstMatch(t, s));
  if (!namesSomething && editWords(s) === 0 && !/\d/.test(s) && s.split(' ').length <= 3 && !/\b(?:it|this|that|everything|all)\b/.test(s)) {
    return { answer: `I did not find anything to do in "${r.trim().slice(0, 60)}". Say what to change — ${EXAMPLES}.`, questions: [], id: 'nothing' };
  }
  return null;
}
