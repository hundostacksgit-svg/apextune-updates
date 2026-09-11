/*
 * The walkthrough guide.
 *
 * The first-run tour points at eight things and gets out of the way, which is
 * right for a first run and useless three days later when somebody wants to
 * know how speed ramping works. This is the other half: the whole app,
 * written out, searchable, in the app rather than on a website somebody has to
 * find.
 *
 * Written as answers to questions people actually have, in the order they
 * have them. Not a feature list — a feature list tells you what exists, which
 * is the one thing somebody staring at the screen already knows.
 *
 * Every article names the real control, the real menu, the real shortcut. A
 * guide that says "use the colour tools" rather than "Colour panel → Curves &
 * LUTs → Load a .cube file" is a guide that has to be read twice and followed
 * once.
 */

export const GUIDE = [
  {
    id: 'start',
    group: 'Getting going',
    title: 'Your first edit, in five minutes',
    body: [
      ['Bring your clips in', 'Press **+ Import** on the timeline bar, or drag files onto the window. Video, photos and music all go in the same way. Nothing is uploaded — the files stay on your device and the editor reads them from there.'],
      ['Put them on the timeline', 'Double-click a clip in the Media panel to drop it at the end, or drag it where you want it. Clips snap to each other so there are no one-frame gaps.'],
      ['Cut', 'Move the playhead and press **S** to split. Or press **C** for the razor and click the clip where you want the cut. **V** goes back to normal.'],
      ['Make it look like something', 'Open **Styles** and press one. It puts the grade, effects and transitions on what you already have without touching your cuts.'],
      ['Get it out', 'Press **Export**, pick where it is going, and it renders. Nothing leaves your device unless you choose to share it.'],
    ],
  },
  {
    id: 'undo',
    group: 'Getting going',
    title: 'Undoing something',
    body: [
      ['The quick way', '**Ctrl+Z** (**⌘Z** on a Mac). The Undo button in the top bar tells you what it will take back before you press it — "Undo Add clip", not just an arrow.'],
      ['If it was a few steps ago', 'Menu bar → **Edit → History**. Every change is listed, newest first, with the time. Click any one and the project goes back to exactly how it was then. Nothing is thrown away, so you can come forward again.'],
      ['The bar that appears', 'After every change a short bar shows what just happened with an Undo on it. It is there for about six seconds and it is the fastest way back from a mistake you noticed immediately.'],
    ],
  },
  {
    id: 'tracks',
    group: 'The timeline',
    title: 'Layers, overlays and taking the sound off a clip',
    body: [
      ['Stacking video', 'Drag a clip **above** the top video track and a new overlay layer appears under it. Higher tracks draw on top. You can keep going — there is no limit.'],
      ['Taking just the sound', 'Drag a clip **down** onto an audio track. The picture stops being drawn and the sound keeps playing, which is how you put a voice or a bit of atmosphere under other shots. Drag it back up and the picture returns; nothing was thrown away.'],
      ['Muting a whole track', 'The speaker icon on the track header. The eye hides a video track from the picture without deleting anything.'],
      ['Ripple', 'With **Ripple** ticked on the timeline bar, deleting or shortening a clip slides everything after it back to close the gap. Untick it to leave holes on purpose.'],
    ],
  },
  {
    id: 'rightclick',
    group: 'The timeline',
    title: 'Right-click menus, layers and the full-screen timeline',
    body: [
      ['Right-click anything', 'A clip, the empty space on a layer, a layer header, the ruler, a file in the media pool, or the picture itself — each has its own menu, and each starts with **Undo**, naming the thing it will take back.'],
      ['On a phone', 'Hold your finger on it for half a second. Same menus, bigger rows. A press that turns into a drag never opens one, so moving a clip still just moves it.'],
      ['On a clip', 'Split here (where you clicked, not where the playhead is), split at the playhead, cut, copy, paste, duplicate, delete, take the sound off, mute, hold this frame, speed, colour, effects, audio, tracking, layer properties, the graph editor, nudge a frame either way, rename, and select everything on that layer.'],
      ['Cut, copy and paste', '**Ctrl+X**, **Ctrl+C**, **Ctrl+V** work on clips now, and paste drops them at the playhead — or, from a right-click, exactly where you clicked. A pasted clip is its own clip: grading the copy does not touch the original.'],
      ['Taking the sound off', '**Take the sound off this clip** puts the audio on its own layer, lined up with the picture, and mutes the picture so nothing is heard twice. That is how you hold a line of dialogue over the shot that comes after it.'],
      ['More layers', 'The **＋ Video layer** and **＋ Audio layer** buttons on the timeline bar, or right-click a layer header for *Add a layer above this one*. Dragging a clip above the top video track still makes one on its own — the buttons just say the feature is there.'],
      ['Layer headers', 'Right-click one to mute, hide, lock, rename, make it taller or shorter, select everything on it, close its gaps, or delete it. The last video layer cannot be deleted, and the option says so by being greyed rather than by vanishing.'],
      ['The timeline full screen', 'The **⤢** button at the right of the timeline bar, or **Shift+F**. The timeline fills the window and the picture steps aside; the top bar stays, so undo, export and the menus are still there. **Escape** or Shift+F brings it back.'],
    ],
  },
  {
    id: 'keyframes',
    group: 'The timeline',
    title: 'Animating anything: keyframes and the graph editor',
    body: [
      ['What a keyframe is', 'A keyframe is a note saying "at this moment, this value". Two of them make a move: the app fills in every frame in between. That is all animation is, in any program.'],
      ['Open a layer up', 'Press the small **▸** in the corner of a clip on the timeline. The clip unfolds into its properties — position, scale, rotation, opacity, volume, the grade, and every parameter of every effect on it.'],
      ['Make something move', 'Press the **⏲ stopwatch** next to a property. That drops the first key where the playhead is. Now move the playhead somewhere else and change the value — drag the scale slider, or the exposure — and a second key appears there on its own. Play it back and it moves.'],
      ['Once a stopwatch is on', 'That property\u2019s slider sets a value **at the playhead** rather than for the whole clip. That is deliberate, and it is the entire gesture: park, drag, park, drag.'],
      ['The diamonds', 'Every key is a diamond in its lane. Drag one sideways to change **when** it happens. Click one and press **Delete** to remove it — the clip itself is not touched. Double-click one to change its easing, which cycles through linear, ease, ease in, ease out and hold; the shape of the diamond tells you which it is.'],
      ['The graph editor', 'The **∿** button at the top of the unfolded layer. Diamonds tell you when something changes; the graph tells you how fast, which is the part that reads as good or cheap. Each property is its own coloured curve. Drag a dot up or down to change its value and sideways to change its timing, both at once.'],
      ['Seeing only what moves', 'The **◆** button next to ∿ switches between every property and only the ones that are actually animated. On a clip with four effects on it that is the difference between six rows and forty.'],
      ['Where it also lives', 'Clip menu → **Show layer properties**, and **Graph editor** beside it, for when the clip is too narrow to carry a caret.'],
      ['What it costs', 'Unfolding a layer and reading its properties is free on every edition. Laying a key down is part of Creator and above.'],
    ],
  },
  {
    id: 'trim',
    group: 'The timeline',
    title: 'The four trims: ripple, roll, slip and slide',
    body: [
      ['Why four', 'These are the whole vocabulary of editing. Each changes a different one of three things — what you see, where it sits, and how long everything after it is — and knowing which one you want is most of the craft.'],
      ['Turn it on', 'Press **T**, or the **⇹** button on the timeline bar. Press **V** to go back to normal dragging. The cursor tells you which trim you are about to get before you start, and a readout tells you what it is doing while you drag.'],
      ['Roll — grab a cut', 'Drag the join between two clips. One grows by exactly what the other loses, so **nothing after it moves**. This is "cut a beat later", and it is the most common trim in a finished edit precisely because it cannot knock anything out of sync.'],
      ['Ripple — grab an outer edge', 'Drag an edge with no clip against it, or hold **Alt** on a cut. The shot gets longer or shorter and everything after it moves with it. The edit changes length.'],
      ['Slip — grab the middle', 'The clip stays exactly where it is and exactly as long, and a different part of the take plays in it. "Same hole, different moment."'],
      ['Slide — Alt and the middle', 'The clip keeps its content and length and moves in time, while the clips either side absorb the movement. "This reaction lands too early."'],
      ['Handles', 'The readout shows how much unused footage sits either side of the clip. When a trim runs out of it, it stops and says **out of source** rather than quietly giving you less than you asked for.'],
    ],
  },
  {
    id: 'speed',
    group: 'The timeline',
    title: 'Speed, slow motion and ramps',
    body: [
      ['A flat change', 'Select a clip and use **Speed** in the Inspector. The clip gets shorter or longer to match — otherwise the picture runs faster inside a slot of the same length and the edit never actually moves.'],
      ['A ramp', 'Styles → **Velocity** puts a real speed curve inside each shot: slow head, fast tail. That is the look people mean by a velocity edit, and it is a curve rather than a single number.'],
      ['Ask for it', 'AI panel: *"slow the last clip to half speed"*. It applies to that clip and nothing else.'],
    ],
  },
  {
    id: 'colour',
    group: 'Colour',
    title: 'Grading: looks, wheels, curves and LUTs',
    body: [
      ['Start with a look', 'Colour panel → search or browse. There are 118, each previewed on your own footage rather than a stock frame, so you are judging what it does to *your* shot.'],
      ['Then fine-tune', 'The sliders under the looks are the standard set. A look is just a bundle of those values, so you can take any of them apart.'],
      ['Wheels', 'Professional level only. **Lift** moves the shadows, **Gamma** the midtones — where faces live, and usually the one to reach for first — and **Gain** the highlights. The R, G and B numbers under each wheel are how you match one shot to another: read them off one, type them into the next.'],
      ['Curves', 'Colour → **Curves & LUTs**. Drag the line to bend it, click it to add a point, drag a point off the edge to remove it. The histogram behind the grid is your actual frame, so you can see where the picture sits in the range.'],
      ['LUTs', 'Same panel → **Load a .cube file**. Any LUT pack works — it is the format Resolve and Premiere export. The file is read on your device and never uploaded. Most film LUTs are too strong at 100%; around 60 is usually where they land.'],
      ['Scopes', 'Professional level. Parade, waveform, vectorscope and histogram. Worth using because eyes lie: a monitor running warm makes every shot look warm, so you correct toward blue and everything you deliver is blue. A scope reads the file, not your screen.'],
    ],
  },
  {
    id: 'windows',
    group: 'Colour',
    title: 'Windows and the qualifier: grading one thing, not the shot',
    body: [
      ['What they are for', 'Every grade so far covered the whole frame, which is right for a look and useless for "brighten his face" or "take the sky down two stops". A **window** says where a grade happens. The **qualifier** says what colour. Use both and you are grading one jacket in a crowd.'],
      ['Add a window', 'Colour panel → **Windows & qualifier** → Rectangle, Oval or Free shape. Drag it on the picture: the body moves it, the corners resize it about its centre so it stays over what you put it over, and the arm on top turns it. Hold **Shift** while turning to snap to fifteen degrees.'],
      ['Soften it', 'A hard-edged oval on somebody\u2019s face reads as a mistake from across the room. **Softness** feathers the edge; most windows want a good deal of it.'],
      ['Inside or outside', '**Everything outside it instead** inverts a window. Several windows add together, and an inverted one cuts a hole in the others — so an oval plus a smaller inverted oval is a ring.'],
      ['Cut the picture instead', 'The dropdown on each window switches it from limiting the grade to cutting the layer itself. That is the compositing use: everything outside the shape becomes transparent and the layer below shows through.'],
      ['The qualifier', 'Switch it on and pick a colour — either with the picker, by clicking the picture, or with the hue, saturation and brightness ranges by hand. Only that colour gets the grade.'],
      ['Watch the matte', 'Press **Show the matte** and you are looking at the selection rather than the picture: white is selected, black is not, grey is a soft edge. This is how the job is actually done — get the edges clean here first, then look at what the grade did. **Soften the edges** is the control for the speckle a compressed frame leaves behind.'],
      ['Both together', 'A window limits a qualifier rather than competing with it. "This colour, but only over there" is what makes a secondary usable on a busy frame.'],
      ['They animate', 'Every setting on a window has a stopwatch in the layer properties, so a window can follow a moving subject — and a motion track can be pinned straight onto one.'],
    ],
  },
  {
    id: 'effects',
    group: 'Effects',
    title: 'Finding an effect among three hundred',
    body: [
      ['Search first', 'The Effects panel has a search box. Type what you want — *glitch*, *grain*, *leak*, *mirror*, *rain* — rather than scrolling.'],
      ['Every chip shows what it does', 'The picture on each chip is the real effect running on your own footage. Hover or press one and it animates. Nothing is a stock screenshot, so what you see is exactly what you get.'],
      ['Transitions', 'Same panel, further down. 107 of them, grouped. A transition goes *into* the selected clip — it blends from whatever is before it on the same track.'],
      ['Taking one off', 'Select the clip and remove it from the stack in the Inspector, or ask: *"clear the effects on clip 3"*.'],
    ],
  },
  {
    id: 'faces',
    group: 'Effects',
    title: 'Following a face through a shot',
    body: [
      ['One press', 'Select a video clip, Inspector → Motion tracking → **Track something in this clip**, then **🙂 Follow the face** in the viewer. It puts the box on the face; press **Track it** and it follows through the shot.'],
      ['What you can pin to it', 'Blur the background, darken everything but the face, soften the skin, or light the face — and the hiding options, blur or pixelate, for when you want somebody unrecognisable.'],
      ['It is only keyframes', 'What comes back is ordinary keyframes on the clip. Unfold the layer and you can drag any of them, or change the effect\u2019s size and strength in the Effects panel, exactly like anything you keyframed by hand.'],
      ['It runs on your device', 'No model is downloaded and nothing is uploaded — the face is found from skin chroma in the frame itself. That means it is not a neural detector: it will occasionally lock onto a large hand, and it works on every complexion equally because it measures colour rather than brightness.'],
      ['When it says it cannot find one', 'Move the playhead to a frame where somebody is facing the camera and press it again, or drag the box yourself — a hand-drawn box tracks just as well. **✨ Find it for me** is the fallback for shots with no person in them; it picks the most trackable thing instead.'],
    ],
  },
  {
    id: 'ai',
    group: 'The AI',
    title: 'Telling it what to do',
    body: [
      ['Be specific', 'It follows a target and a change: *"mute clip 2"*, *"make the third one black and white"*, *"slow the last clip to half speed"*, *"delete the last two"*, *"brighten clips 2 to 4"*, *"make the first 5 seconds black and white"*.'],
      ['Several at once', '*"mute clip 2 and slow the last one down"* becomes two separate steps, and you see both before anything runs.'],
      ['Nothing happens without you', 'It shows the plan first. You approve it, and the whole thing undoes in one keystroke.'],
      ['Two brains', 'With a server configured it uses a full language model and you can say anything. Without one it uses the on-device reader, which handles direct instructions and named styles. The panel tells you which one is answering — if it says "on-device reader", free-form requests will not work until the Worker is switched on.'],
    ],
  },
  {
    id: 'broll',
    group: 'The AI',
    title: 'Finding a cutaway for a moment',
    body: [
      ['Where it is', 'Media panel → **Find a cutaway for here**. It ranks your own clips against whatever is happening at the playhead.'],
      ['What it reads', 'The caption line under the playhead, if there is one — words like *running*, *quiet*, *at night*, *the whole valley* each imply a kind of picture. Failing that, the tempo of your music. And either way, it steers away from a second face when there is already one on screen, because that is what a cutaway is for.'],
      ['Name your files', 'A clip called **kitchen.mp4** wins a line about a kitchen. Measurement can tell it a shot is indoors and still; only the name can tell it what the thing is.'],
      ['It says why', 'Every suggestion lists what it matched on, and the panel says what it was looking for before it says what it found. If the reasoning is not convincing, ignore it — that is the difference between a suggestion and a shuffle.'],
      ['What it never does', 'It never suggests the clip already on screen, never a file that has gone missing, never music, and never fills the list out with something that does not fit. "Nothing here suits this" is a real answer.'],
      ['Accepting one', 'It goes **over** the top on an overlay layer, muted, so the take underneath keeps talking. Drag it, trim it, or one undo and it is gone. Nothing under it was touched.'],
      ['Your own footage only', 'There is no stock library and nothing is fetched. It ranks what you imported, using measurements taken once when you imported it, so it answers instantly.'],
    ],
  },
  {
    id: 'copy',
    group: 'The AI',
    title: 'Copying another video’s edit',
    body: [
      ['What it does', 'AI panel → paste or pick a finished video. It watches it, finds where every cut lands, how long the shots are, how fast the camera moves and how the colour sits, then builds a plan in that shape for your footage.'],
      ['What it does not do', 'It does not copy the video itself or anything in it. It measures the edit and reproduces the pattern.'],
      ['It stays on your device', 'The analysis runs in the browser. The video you paste is never uploaded.'],
    ],
  },
  {
    id: 'audio',
    group: 'Audio',
    title: 'Levels, cleaning up and effects',
    body: [
      ['Reading the meter', 'Green to −18 is comfortable, amber to −6 is loud but fine, red is asking the encoder to make a decision you will not like. The thin line that lags behind is the peak hold — a clip lasts one sample and you would never see it otherwise. A red strip across the top means something clipped in the last couple of seconds.'],
      ['The fader', 'Unity (0 dB) sits three-quarters up, where a mixing desk puts it. Double-click it to go back there.'],
      ['Cleaning up', 'Audio panel → **Repair**. It learns the noise from a quiet moment and subtracts it, finds mains hum and notches it out, and takes out clicks. It works on the decoded audio, not the file, so the original is untouched.'],
      ['Creative filters', '17 of them — underwater, telephone, radio, megaphone, cathedral, slowed, nightcore and the rest. They apply to a clip, and they are rendered the same way in the export as in the preview.'],
    ],
  },
  {
    id: 'text',
    group: 'Text',
    title: 'Titles, captions and 200 typefaces',
    body: [
      ['Adding a title', 'Text panel → tap a style. It lands at the playhead as a normal clip you can drag and trim.'],
      ['Choosing a typeface', 'Search the font list — every name is set in its own typeface, because a list of names in the system font tells you nothing. Picking one fetches it; the offline fallbacks are chosen to look like the real thing, so text still renders sensibly with no signal.'],
      ['Captions', 'Captions panel. Styles match what each platform produces, so a video posted from here does not look out of place next to native ones.'],
      ['Tracking text to something', 'Inspector → track a point in the clip, then pin the title to it. It follows.'],
    ],
  },
  {
    id: 'export',
    group: 'Finishing',
    title: 'Exporting and posting',
    body: [
      ['Pick a preset', 'Export → 16 presets from 720p to DCI 4K, including vertical 4K. Frame rate is set in Settings, including 23.976, 29.97 and 59.94 for anyone who needs them.'],
      ['Straight to a platform', 'After it renders it offers to post. On a phone that is the system share sheet, so TikTok, YouTube, Instagram and everything else installed is one press away and the file never goes through anyone else’s server. On a desktop it is the file plus a direct link to the platform’s own upload page.'],
      ['Check the framing first', 'Tick **All platforms** under the viewer to see the same frame cropped for TikTok, YouTube and a square post at once. It tells you how much of the picture each one throws away.'],
    ],
  },
  {
    id: 'levels',
    group: 'Finishing',
    title: 'The three skill levels',
    body: [
      ['Beginner', 'Nine tools and hover tips on everything. Nothing on screen you do not need yet.'],
      ['Intermediate', 'The full timeline and inspector at a working density — ripple, roll, slip, transitions, markers, motion tracking.'],
      ['Professional', 'Everything: keyframes with bezier easing, curves, scopes, colour wheels, LUT slots, speed ramping, frame-accurate timecode, and the raw project JSON.'],
      ['Switching', 'Top bar, or Settings menu. It changes what is on screen, never what your project contains — moving down a level hides controls, it does not remove anything you made with them.'],
    ],
  },
  {
    id: 'privacy',
    group: 'Finishing',
    title: 'Where your files actually go',
    body: [
      ['Nowhere, by default', 'Footage, audio and projects are held on your device. Editing, effects, colour, export and the reference analysis all run in the browser.'],
      ['The exceptions, in full', 'Free-form AI phrasing and transcription send your text and a short description of your media to a server, if one is configured. Never the footage, never the audio, never a frame. Web fonts are fetched from Google Fonts when you pick one.'],
      ['Sharing', 'Only when you press share or open a platform’s upload page yourself.'],
    ],
  },
];

/** Every article flattened for searching. */
export function searchGuide(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return GUIDE;
  return GUIDE.filter((a) => {
    const hay = `${a.title} ${a.group} ${a.body.map(([h, t]) => `${h} ${t}`).join(' ')}`.toLowerCase();
    return hay.includes(q);
  });
}

/** Group -> articles, in declaration order. */
export const GUIDE_GROUPS = GUIDE.reduce((acc, a) => {
  (acc[a.group] ||= []).push(a);
  return acc;
}, {});
