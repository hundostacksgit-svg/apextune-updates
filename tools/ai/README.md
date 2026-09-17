# The AI bench

The on-device planner (`studio/app/js/ai/`) is a pure function of words and a
description of the project, so it can be run in Node against hundreds of
requests in a second. This folder does that.

```
node tools/ai/bench.mjs                    # one line per prompt, then the failures in full
node tools/ai/bench.mjs --full             # every prompt with its whole plan
node tools/ai/bench.mjs --grep captions    # only prompts containing a word
node tools/ai/bench.mjs --report out.txt   # the full listing to a file
```

The exit code is the number of failed expectations, so it works as a test.

## The bank

`prompts.mjs` is what people type into the AI box, sorted by kind: direct
instructions on an edit that exists, whole briefs on an empty timeline, vague
asks, questions about the app, slang and typos, lengths written every way,
negations, four other languages, and the strange (empty, emoji, code, a URL,
three thousand characters). Each runs against a described project:

| Context | What it is |
|---|---|
| `fresh` | five clips and a song imported, nothing on the timeline |
| `edited` | the same, already cut into six shots — where a rebuild must never happen |
| `wide` / `widecut` | the same in a 16:9 project, so "make it vertical" has to change the shape |
| `nomusic` | clips, no song |
| `photos` | a folder of photos and a song |
| `talking` | one long talking-head recording on the timeline |
| `empty` | nothing imported |

A prompt carries `want`, a list of expectations: `op:addTitle`, `!op:layout`,
`only:setVolume`, `steps:0`, `answer`, `question`, `source:direct`,
`arg:setVolume.target=2`, `ratio:9:16`, `dur:20`, `warn:/no music/`. A prompt
without one still runs and is listed; add the expectation once the right
answer is settled.

## What the planner does now

Reading, in order, all on the device:

1. **normalise.js** — politeness and filler off the ends, slang expanded
   ("bnw", "slo mo", "subs", "w/o"), a typo within one keystroke of an editing
   word corrected, Spanish / French / Portuguese / German editing words
   translated. Every change is a note the panel shows: nothing is guessed
   silently.
2. **answers.js** — a reply for anything that is not an edit: greetings,
   "what can you do", how-to questions (answered from the guide), prices and
   the AI allowance (read from config, never typed), privacy, things the
   editor does by hand (freeze, split, crop), things it does not do (generate
   footage, remove someone's watermark), code, links, nonsense. Costs no AI
   action and never reaches the cloud.
3. **direct.js** — an instruction with a target and a change, several per
   sentence: sound, speed, colour, framing, fades, effects on and off, titles,
   captions, transitions, stickers, shapes, the canvas shape, the music, the
   order of the clips, the length of the whole edit, a clip by its file name.
   A rule that recognises the verb but not enough to act on asks instead of
   guessing.
4. **planner.js** — a whole edit from a sentence (montage, named style, or
   composed), with negations binding ("no captions", "keep the colours") and
   one rule above all: an edit that exists is never replaced unless the words
   said rebuild, start over or from scratch.

Adding a phrasing is a row in a table in `vocabulary.js` or `direct.js`, and a
line in `prompts.mjs` that proves it.
