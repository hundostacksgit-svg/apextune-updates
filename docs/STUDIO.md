# OmniDx Studio — how it's built

The editor at [`studio/app/`](../studio/app/). No framework, no build step, no
bundler: it is ES modules served as files, the same way the diagnostics app is.
Open `studio/app/index.html` through any static server and you are running it.

If you are here to change something, this is the map.

---

## The shape of it

```
studio/
  index.html            the marketing site
  pricing/  download/  account/
  assets/
    config.js           prices, payment links, entitlements  ← start here
    auth.js             accounts, devices, licence keys
    studio.js           site behaviour (shared with the app's account screen)
    studio.css          site design system
  app/
    index.html          the editor shell — every panel mounts into it
    css/app.css         the editor's design system
    js/
      main.js           state, actions, boot, keyboard        ← and here
      timeline-ui.js    drawing the timeline and every gesture on it
      store.js          IndexedDB: projects, media, crash mirror
      licence.js        what this copy is allowed to do
      levels.js         beginner / intermediate / expert
      palette.js        Ctrl+K
      tutorial.js       the walkthrough
      desktop.js        Electron bridge (no-op in a browser)
      engine/           the parts that don't know about the DOM
      ai/               natural language → plan → timeline operations
      panels/           one file per panel, plus the inspector
  desktop/              Electron shell
  mobile/               Capacitor config
server/                 optional Cloudflare Worker
```

## The two rules

**1. The project document is plain JSON and nothing else.**

`S.project` holds no class instances, no DOM nodes, no blobs, no AudioBuffers.
This is what makes undo a `structuredClone`, autosave a `put`, and "save
project file" a `JSON.stringify`. Runtime handles — object URLs, decoded audio,
video elements — live in a side table in `engine/media.js`, keyed by media id.

If you add a field to a clip, ask whether it survives `structuredClone`. If it
doesn't, it belongs in `media.js`, not on the document.

**2. Panels never change the project directly.**

They call `actions.*` in `main.js`, and `actions` decides what to repaint.
There is no event bus and no observer. A panel that reaches into another
panel's DOM is a bug.

```js
// yes
actions.patchSelected((clip) => { clip.color.contrast = 20; }, 'Change contrast', 'colour:contrast');

// no
S.project.clips[0].color.contrast = 20;   // nothing repaints, nothing undoes
```

The third argument to `commit`/`patchSelected` is a coalescing key: repeats
within 1.2 seconds merge into one undo entry, which is why dragging a slider
leaves one step in the history and not two hundred.

## The engine

None of `engine/` touches the DOM except through a canvas it was handed. That
is deliberate — it means the exporter can render to an offscreen canvas at 4K
while the preview renders the same frame at 1080, from the same code.

| File | Does |
|---|---|
| `project.js` | The document schema and every operation on it: split, trim, move, ripple, snap, keyframes. Pure functions over a plain object. |
| `render.js` | Draw the timeline at time *t*. Source frame → crop → transform → filter → grade passes → blend. Transitions take two finished clip canvases. |
| `filters.js` | The colour pipeline. Stage 1 is a CSS filter string (GPU); stage 2 is composited passes for what CSS can't do. A "look" is a bundle of both. |
| `transitions.js` | Pure `(ctx, w, h, from, to, progress)` functions. No state, so scrubbing backwards looks like scrubbing forwards. |
| `titles.js` | Text layout, wrapping and the per-word animations, straight onto canvas. |
| `media.js` | Import, probing, thumbnails, filmstrips, waveform peaks, tempo detection, silence detection. Owns the decoder pool. |
| `audio.js` | The Web Audio graph: element → per-clip filter chain → per-clip gain → master, plus a tap for the exporter. |
| `audio-fx.js` | The 17 creative audio filters. One `buildAudioChain(ctx, fx)` serves both the live `AudioContext` and the export's `OfflineAudioContext`, so a filter cannot preview differently from how it renders. |
| `audio-repair.js` | Noise reduction, mains-hum removal, click repair, level matching — offline, sample-by-sample. |
| `audio-render.js` | The offline mix for export: the same gains, fades, ducking and filter chains, rendered faster than realtime. |
| `playback.js` | The transport. Wall-clock, not a frame counter, so picture chases sound. |
| `exporter.js` | Realtime capture when there's audio, frame-by-frame when there isn't. |
| `history.js` | Snapshot undo with named entries. |

### Why snapshots for undo

A command stack with inverse operations is smaller. It is also the thing that
eventually has a code path which forgets to record its inverse, and the user's
undo silently skips a step. A project document is a few hundred KB at worst.
We keep whole copies and the stack cannot be wrong.

## The AI

`ai/planner.js` reads a sentence and produces a **plan**: an ordered list of
`{op, args, label, detail}`. `ai/apply.js` performs those ops using the same
`project.js` functions the mouse does. That is the whole design:

- The panel shows every step before running it, with a checkbox each.
- Applying the lot is **one** history entry, so one Ctrl+Z undoes an AI edit.
- The AI has no private access to the document. If it can do it, you can do it.

`ai/remote.js` swaps in a language model when a Worker is configured, and
validates whatever comes back against the same operation list before it reaches
`apply.js`. Anything unknown is dropped, not run. On any failure it falls back
to the local planner rather than showing an error.

To add an operation: write it in the `OPS` object in `apply.js`, and teach
`planner.js` when to emit it. Both places, or the cloud planner will produce
steps the local one never suggests.

## Skill levels

Two halves. Visibility is one attribute on `<html>` and one CSS rule:

```css
html[data-level="beginner"] [data-min="intermediate"],
html[data-level="beginner"] [data-min="expert"],
html[data-level="intermediate"] [data-min="expert"] { display: none !important; }
```

Tag a control `data-min="expert"` and it is gone below expert. Nothing is
disabled or greyed out — those read as the software judging you, which is the
feeling that makes people close an editor and not come back.

The other half is **density**, and it is the half that decides whether someone
who edits for a living takes the app seriously. Each level redefines the layout
variables and, at the top, some of the surface colours:

| Level | Shown as | Inspector | Timeline | Body text | Chrome |
|---|---|---|---|---|---|
| `beginner` | Beginner | hidden | 210px | 13.5px | as-is |
| `intermediate` | Intermediate | 310px | 310px | 13.5px | as-is |
| `expert` | **Professional** | 322px | 348px | 12.75px | neutral greys, tabular figures, uppercase panel heads |

`expert` is the internal id and stays that way so existing saved preferences
keep working; "Professional" is what it is called on screen, and that name comes
from `DESCRIPTIONS` in `levels.js` rather than being written into any markup.

The grey chrome at the top level is not decoration. Judging a grade next to
saturated blue furniture is your own eye lying to you about what the image is
doing, which is why every serious finishing application is grey.

## Storage

IndexedDB, three stores: `projects`, `media`, `prefs`. Media is keyed by a
**content fingerprint** (SHA-256 of the first and last megabyte plus the size —
hashing 4 GB in full would freeze the tab). This is why moving or renaming a
file doesn't break a project.

`localStorage` holds only the crash mirror, the theme, the level and the
licence, because those need to be written synchronously as a tab dies.

## Testing it

There is no test runner in the repo. What there is:

```bash
python3 -m http.server 8765          # serve the repo
# then open http://localhost:8765/studio/app/
```

Every module is a plain ES module, so `node -e "import('./studio/app/js/engine/project.js')"`
type-checks syntax without a browser, and the pure parts (`project.js`,
`planner.js`, `filters.js`, `history.js`) can be exercised straight from Node.

The end-to-end path worth checking after any change to the engine: import a
file, run an AI plan, scrub, undo, export. That exercises nearly everything.

## Adding a panel

1. `studio/app/js/panels/yours.js` exporting `mount(host)`.
2. Register it in `panels/index.js`.
3. Add a button to the rail in `app/index.html` with `data-panel="yours"`.
4. Read state from `S`, change it through `actions`. Never repaint yourself —
   `refreshPanel()` re-mounts you after every commit.
