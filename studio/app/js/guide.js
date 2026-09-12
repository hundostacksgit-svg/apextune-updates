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
    id: 'compound',
    group: 'The timeline',
    title: 'Grouping clips into one',
    body: [
      ['Why', 'A sequence you have finished with should behave like one thing. Ten shots that make a title sequence want to be dragged, graded, sped up and reused as a unit — and doing any of that to ten clips is ten chances to get one of them wrong.'],
      ['How', 'Select two or more clips and press **Ctrl+G**, or right-click → *Group into one*. They become a single clip on the timeline, marked with a folder edge.'],
      ['Getting them back', '**Ctrl+Shift+G**, or right-click → *Ungroup*. Everything comes back exactly where it was, with its own trims, grades and volumes intact.'],
      ['Treat the whole thing at once', 'A grade, an effect or a window on the group applies to everything inside it. That is most of the point: one look over a sequence instead of the same look pasted onto every shot in it.'],
      ['Groups can hold groups', 'A group inside a group is a real thing people build, and it works — the picture is rendered by rendering the inner timeline, however many levels deep it goes.'],
      ['Nothing is copied', 'The footage stays in your media pool. Grouping does not duplicate a file, and ungrouping does not have to find one again.'],
    ],
  },
  {
    id: 'adjust',
    group: 'The timeline',
    title: 'Adjustment layers, and getting your cuts back out of a flat video',
    body: [
      ['One grade over many clips', 'Timeline menu → **Add an adjustment layer**, or right-click empty track space. It sits on its own layer and grades and treats everything composited below it — so a look over a nine-shot sequence is one thing to change instead of nine.'],
      ['What it reaches', 'Everything on lower layers, for as long as it lasts. Anything on a layer above it is drawn afterwards and stays untouched, which is how you keep a title or a logo out of the grade.'],
      ['Everything works on it', 'The same grade, the same effects, the same windows. Put a window on an adjustment layer and you are grading one corner of a whole sequence; fade its opacity and the treatment fades with it.'],
      ['Finding the cuts in a flat video', 'Select a clip that used to be an edit — an export, a download — and Clip menu → **Find the cuts in this clip**, or right-click it. It scans the footage, finds the hard cuts and splits there.'],
      ['What it can and cannot see', 'Hard cuts only. A dissolve is the same change spread over twenty frames and is indistinguishable from a fast pan, so claiming to find both would mean cutting in the middle of every whip pan in the file. It says when it finds nothing rather than guessing.'],
      ['It decides what counts from your footage', 'A locked-off interview and a handheld skate video have completely different amounts of ordinary frame-to-frame change. It measures what normal looks like in your file and only calls something a cut when it stands well clear of that.'],
      ['Undo takes it all back', 'However many splits it makes, it is one entry in the history.'],
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
    id: 'start',
    group: 'Getting around',
    title: 'The start screen',
    body: [
      ['What it is', 'The list of every project on this device, and the one place a new one is made. It opens with the app and comes back from the File menu.'],
      ['Making one', 'A name, a shape (vertical, landscape, square, portrait, cinemascope), a size for that shape from light to 4K or a custom one that keeps the shape, a frame rate, and the colour behind the picture. All of these are awkward to change once there are clips on the timeline, which is why they are asked here.'],
      ['Start with', 'A blank timeline, or a door into something the editor already does: a montage built from your clips, an edit copied from a video you like, a photo dump from stills. Each lands you where that leads.'],
      ['Finding one', 'Search by name, sort by recent, name or length. A row shows the first clip’s picture, the shape, the frame rate and when you were last in it.'],
      ['Rename, copy, delete', 'The three buttons on a row. Rename is in place — Enter keeps it, Escape does not. A copy shares the footage rather than doubling it. Delete asks first; the files on your device are untouched either way.'],
      ['From another device', '**Open a project file** takes a .omnidx.json saved from another copy of the app. Its media has to be re-imported if it is not on this device — the file is the edit, not the footage.'],
    ],
  },
  {
    id: 'tabs',
    group: 'Getting around',
    title: 'The tabs down the side',
    body: [
      ['Fifteen of them', 'Media, AI, Styles, Filters, Effects, Transitions, Overlays, Colour, Text, Stickers, Audio, Sound, Captions, Settings, Learn. The first nine answer to the number keys. On a phone the same row runs along the bottom and scrolls sideways.'],
      ['Filters', 'The look library — 117 of them, film, mood, genre, social, mono, technical — with a strength slider. It lands on the clips you have selected, or on every clip when nothing is; the line under the title always says which. Colour is the same idea with the dials: wheels, curves, LUT files, the corrector stack.'],
      ['Effects, Transitions, Overlays', 'Three views of what is done to a shot. **Effects** is the whole engine, with every dial. **Transitions** is the 116 ways from one shot to the next, one length for the lot, on the selected clips or on every cut. **Overlays** is the part of the effects library that sits *on* the picture — leaks, flares, frames, weather, grain, tape wear — for the person who wants a light leak and not a wall of three hundred.'],
      ['Text and Stickers', '**Text** is titles: presets, fonts, 49 styles, 35 animations. **Stickers** is emoji, shapes and callouts, and the editor that sizes, colours, animates them and makes them react to something you have tracked. A sticker dropped from either panel is the same sticker.'],
      ['Audio and Sound', '**Audio** is what happens to sound you have: levels, repair, the channel strip, loudness, 148 filters. **Sound** is sound you do not have yet: a beat made to your tempo in eight styles, and 32 sound effects — whooshes, hits, risers, glitches, small sounds, beds — made on the spot and dropped on their own track at the playhead.'],
      ['Nothing is duplicated', 'Every tab writes the same fields on the same clips. A filter picked in Filters can be refined in Colour; a transition set in Transitions shows in Effects; a sticker from Stickers sits in Text’s list. Undo is one history.'],
    ],
  },
  {
    id: 'everyplatform',
    group: 'Export',
    title: 'Export for every platform',
    body: [
      ['One press, four files', 'Export → **Export for every platform**. The same edit is rendered vertical, landscape, square and portrait in turn, at the 1080-class size for each shape and your project’s frame rate, and each file is named by its shape.'],
      ['How it reframes', 'The picture always fills the frame, so a wide edit made vertical keeps a slice of it. Left alone, that is the middle. A shot you have tracked is centred on its subject instead — the crop follows the person, not the frame. A shot you have already slid or scaled keeps your framing, clamped so no bars appear.'],
      ['Your edit is not touched', 'Every shape is rendered from a copy. The project on the timeline stays the shape you made it.'],
      ['Stopping', 'Cancel stops the shape being rendered and the ones after it. What has already been saved stays saved.'],
    ],
  },
  {
    id: 'moveaccount',
    group: 'Account',
    title: 'Your account on another device',
    body: [
      ['Why it asks', 'Until the sync server is switched on, an account is a record on the device that made it. Signing in somewhere else finds nothing to check against — that is not your account gone, it is a second device that has never met it.'],
      ['Two ways forward', 'On the sign-in form, **Create it here with these details** makes the account on this device in one press; anything you bought stays unlocked, because a purchase is not tied to the account. Or bring the account over with a move code.'],
      ['The move code', 'On the device that has the account: Account → **Move to another device** → your password → **Make a code**. On the other device: Account → **Signing in from another device?** → paste the code, type the same password, **Bring my account here**. The purchase comes with it and never downgrades one already there.'],
      ['What the code is', 'The account record and the purchase, encrypted with a key derived from your password and a fresh salt. Without the password it is noise; it carries no key of its own, and nothing about your projects or footage.'],
    ],
  },
  {
    id: 'montage',
    group: 'The AI',
    title: 'A whole montage from a sentence, or one press',
    body: [
      ['Say the edit', '*"Make me an anime edit, 30 seconds, starts slow and goes crazy, title that says JJK"*. That is not a style on top of a cut — it is the cut. The plan shows every part: the sections and their pace, the speed ramps on the drop, the impact frames, the transitions per section, the title, the music fitted to the end.'],
      ['Or press one', 'AI panel → **Make a montage from my clips** → pick one of 21 — anime opening, phonk drift, velocity edit, cinematic trailer, sports hype, gaming clutch, travel recap, car reel, wedding highlight, lo-fi day, photo dump and the rest. Same builder, no sentence, and no AI credit, because it runs on this device. The Styles panel has the same list under **Full montages**.'],
      ['Sections, not a single pace', 'Every montage has a shape — intro, build, drop, breather, second drop, outro — and each section has its own beats-per-cut, its own transition, its own ramp. The drop is loud because the rest is not.'],
      ['Every cut on the beat', 'With music in the pool the cuts land on its beat grid; the section edges land on beats too, so a section is a whole number of beats. There is never a gap between shots: a file shorter than its slot is skipped for one that fits.'],
      ['No music? It makes some', 'A beat in the style of the montage — trap, phonk, drill, house, hype, cinematic, lo-fi, drum and bass — rendered on the spot and put in the pool as a real file, so its grid is known to the sample and every cut lands. Swap in your own song afterwards and **sync to the music** re-times the cuts.'],
      ['Ramps that keep the grid', 'A ramp that needs more footage than the shot has slides its in-point earlier to find it, and only then plays a little quieter. The shot never shrinks, so the cut after it stays on the beat.'],
      ['It knows what it is not', '*"cut clip 3 at 5 seconds"* and *"add anime speed lines to clip 2"* are not requests for a montage, and never become one. Tested on 33,000 generated sentences and 800 single-clip instructions: all read correctly.'],
      ['Whole thing, one undo', 'It lands as ordinary clips, effects and titles — change any of it — and one Ctrl+Z takes all of it back.'],
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
      ['Finding the beat', 'Import a song and its tempo and beat grid are read at once, and used by every "on the beat" tool. It reads the kick and the snare separately from the hats — a trap kick on a three-three-two figure would otherwise read as a beat and a half — settles the octave by what the hats are doing, and fits the grid to the hits by least squares so a three-minute song does not drift a beat by the end. Measured: within one per cent and a few milliseconds on eight styles at twenty tempos; drum and bass and fast house read at half time, which is how they are counted anyway.'],
      ['The fader', 'Unity (0 dB) sits three-quarters up, where a mixing desk puts it. Double-click it to go back there.'],
      ['Cleaning up', 'Audio panel → **Repair**. It learns the noise from a quiet moment and subtracts it, finds mains hum and notches it out, and takes out clicks. It works on the decoded audio, not the file, so the original is untouched.'],
      ['Creative filters', '17 of them — underwater, telephone, radio, megaphone, cathedral, slowed, nightcore and the rest. They apply to a clip, and they are rendered the same way in the export as in the preview.'],
    ],
  },
  {
    id: 'strip',
    group: 'Audio',
    title: 'The channel strip, and getting the loudness right',
    body: [
      ['Where it is', 'Audio panel → **Channel strip**, with one clip selected. Six bands of EQ, a compressor, pan and a trim.'],
      ['The EQ', 'A **low cut** takes the rumble out of a voice — traffic, air conditioning, a hand on the desk — and is the single most useful thing here. **Presence** around 4kHz is what makes speech clear. The rest are there when you need them.'],
      ['The compressor', 'Evens out the loud and quiet parts so a whisper is audible without a shout hurting. It only turns the loud parts down, so the clip ends up quieter overall — **level it back up** is how you get it back.'],
      ['No limiter, deliberately', 'A limiter was built, measured and taken out: the browser\u2019s own dynamics node does not hold a ceiling, and a control that promises a number it cannot meet is worse than no control. The ceiling is enforced where it can be exact — at the loudness check, below.'],
      ['Loudness', 'Audio panel → **Loudness** → pick where you are posting → **Measure my mix**. It renders your actual mix and measures it the way the platforms do (ITU-R BS.1770), then tells you how far off you are and offers to fix it in one press.'],
      ['Why it matters', 'Every platform turns anything louder than its target down. Mastering louder than YouTube\u2019s -14 LUFS does not play louder — it plays turned down, with your dynamics squashed for nothing. Being too quiet is the opposite problem: it sounds weak beside everything around it.'],
      ['When it cannot fix it', 'If your peaks are already near the ceiling it will only raise the level as far as it safely can, and say so. Compress the loudest clips to make room for the rest.'],
      ['It is free', 'The strip is part of Creator. The loudness check is not gated, because it only tells you the truth about your own mix.'],
    ],
  },
  {
    id: 'text',
    group: 'Text',
    title: 'Titles, captions and 194 typefaces',
    body: [
      ['Adding a title', 'Text panel → tap a layout. It lands at the playhead as a normal clip you can drag and trim.'],
      ['Text styles', '49 of them under **Text styles**, each chip a real render of the style on a frame: bold and double outlines, neon in four colours, gold, chrome, sunset and holographic gradients, shaded reds and blues, 3D blocks and long shadows, glass, ghost and watermark translucency, 70s, 80s chrome, VHS, typewriter, comic, anime slam. Tap one with a title selected and only its look changes — the words, size and position are yours and stay. Tap one with nothing selected and it adds a title in that style.'],
      ['Animations', '35 under **Animations**, and they play in their chips when you hover or press. Fade, pop, slides from every side, zoom, blur, spin, flip, drop-in, rubber band, typewriter, scramble, word-by-word, words sliding in, karaoke, letter-by-letter, letters falling and rising, wave, tracking-in, wipe reveal, glitch, neon flicker, and the loops: pulse, breathe, swing, jitter, blink.'],
      ['Choosing a typeface', 'Search the font list — every name is set in its own typeface, because a list of names in the system font tells you nothing. Picking one fetches it; the offline fallbacks are chosen to look like the real thing, so text still renders sensibly with no signal.'],
      ['Captions', 'Captions panel. Styles match what each platform produces, so a video posted from here does not look out of place next to native ones.'],
      ['Tracking text to something', 'Inspector → track a point in the clip, then pin the title to it. It follows.'],
      ['How good the tracker is', 'Measured against a known path at 640 wide: 0.65px mean error, 1.5px worst, through a fast pan, a fifteen-degree turn and a subject that grows by a quarter. When something passes in front of the subject it keeps the box moving along the last motion, looks for the original appearance in a wide ring, and fills the hidden stretch with a straight line when it finds it again — marked as guessed, so you can see which points it made up.'],
      ['Remove background', 'Effects → **Matte** → Remove background, or type it into Find. Two methods, picked for you. On a still camera it builds a background plate from the clip — the median of frames across it, which the moving subject falls out of — and keys against that: the cleanest edge. On a moving camera, or a person who sits still (a plate would bake them in), it keys the person directly: a colour model seeded from the face, no plate, no green screen. Both vote out speckle, drop islands, settle against the last frame so the edge does not crawl, and feather on the way up. Honest limits: hair against a wall of the same colour, and a subject dressed like the background.'],
      ['Stickers that react', 'After a track finishes, **Give it a sticker** drops one that hovers over the subject. Select it and the Text panel offers twelve reactions: follow, hover, orbit, lean into the motion, trail behind, grow with speed, point at it from where you left it, shadow underneath, get pulled in, tighten when it stops, pop when it stops, or ride in its hand. It holds a reference to the track rather than a copy, so re-tracking moves every sticker on it — and a slow-motion ramp on the shot slows the sticker with it.'],
      ['Cut through it', 'After a track finishes, **Cut through it** puts a zoom-through on the next cut aimed at the tracked spot: the picture dives into the thing you tracked and comes out in the next shot. Nine transitions in the **Tracked** group take an anchor — iris, spin, whip, portal, radial wipe, glitch, blur — and any of them can be swapped in from the Inspector.'],
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
  {
    id: 'projects',
    group: 'Getting going',
    title: 'Opening the editor, and your list of projects',
    body: [
      ['What you land on', 'Opening the editor shows your projects, newest first, with how many clips are in each and when you last touched it. Click one and it opens where you left it.'],
      ['The first time', 'There is nothing to list yet, so the new-project form is right there: give it a name, pick a shape — 9:16 for TikTok and Reels, 16:9 for YouTube, 1:1 or 4:5 for a feed — and a frame rate. You can change all three later in Settings.'],
      ['Getting back to the list', 'Menu bar → **File → Open project**, or the folder icon at the bottom-right of the page bar. It has a Cancel on it, so looking at the list never loses what you are working on.'],
      ['Where they live', 'On this device, in the browser\u2019s own storage — not on a server. Clearing site data for omnidx.net clears them, and a project made on your phone is not on your laptop. **File → Save a copy** writes a bundle you can move across yourself.'],
      ['Straight into a new one', 'Add `?new=1` to the editor address and it skips the list entirely. `?project=<id>` opens one by name.'],
    ],
  },
  {
    id: 'presets',
    group: 'Effects',
    title: 'Presets: a whole treatment in one tap',
    body: [
      ['What a preset is', 'A grade, a stack of effects with their settings tuned to each other, a transform and an audio strip — saved together under a name. **Effects** panel, top section. There are nearly three hundred, in forty-nine groups, with a search box.'],
      ['Why not just add the effects', 'The settings are the whole thing. Scanlines at 40 with a chroma shift at 8 and a tape wobble at 12 reads as a VHS tape; the same three effects at their defaults read as a mess. Somebody has to dial them in, and a preset is that work, saved.'],
      ['Using one', 'Select a clip and click a preset. Nothing selected means every video clip. The chip shows the real stack running on a real frame — on your own footage once you have imported some — so what you see is what you get.'],
      ['They replace, they do not pile up', 'Trying a second preset takes the first one off. Two stacked is almost never what anybody meant, and the result looks like neither. Undo takes the whole thing back in one press.'],
      ['Save your own', '**＋ Save preset** in the Effects panel header. Select the one clip you got right, name it, and it appears under **Mine** — with a ✕ to delete it, which the shipped ones do not have. It keeps the grade, the effects and their exact settings, and it survives closing the app.'],
      ['Copy the look off one clip onto the rest', 'Get one shot right, then **Ctrl+Alt+C** on it and **Ctrl+Alt+V** on the others — right-click has both as **Copy attributes** and **Paste attributes**. It carries the grade, the effects with their exact settings, the reframe and the audio strip, and it carries none of the edit: nothing moves, nothing retrims. Select twelve clips and one paste does all twelve, as one undo.'],
      ['What they never touch', 'Where a clip sits, how long it is, its in point, its speed, its transitions, its keyframes, its masks. Those are the edit. A preset called Neon Night has no business moving a shot.'],
    ],
  },
  {
    id: 'speedramps',
    group: 'The timeline',
    title: 'Speed ramps',
    body: [
      ['What a ramp is', 'Speed that changes through the shot: fast into a moment, slow through it, fast out. Inspector → **Speed & timing** → a row of sixteen curves. The curve is the label — Velocity, Slow-mo hit, Bullet time, Punch, Kickback, Land, Ease in, Ease out, Dip, Double tap, Stutter, Timelapse, Hyperlapse, Reveal, Hold and go, Heartbeat.'],
      ['It fits the footage', 'A ramp that averages faster than 1× needs more of the file than the clip is long. Rather than running off the end and holding the last frame, the clip is shortened to what the file can cover and the ramp reshaped to it. The toast says so when it happens. (A montage does the opposite — keeps the shot’s length and eases the ramp — because its cuts are on the beat and must stay there.)'],
      ['Shapes, not seconds', 'Each ramp is written in fractions of the clip, so the same gesture fits a two-second shot and a ten-second one. Trim the clip and press the ramp again to refit it.'],
      ['Flat speed and ramps are one control', 'Pressing ½×, 1× or 2× takes a ramp off; pressing a ramp replaces the flat speed. **Remove ramp** puts the clip back to 1×.'],
    ],
  },
  {
    id: 'editcommands',
    group: 'The timeline',
    title: 'Freeze, match frame, insert, overwrite and the shuttle',
    body: [
      ['Freeze a frame', '**E**. Cuts either side of the playhead and holds the frame in between for two seconds. The held part is an ordinary clip — trim it, grade it, put effects on it, drag it somewhere else — and it is silent, because a held frame with the sound still running is a sync error you can hear.'],
      ['Find a frame in its file', '**Y**. Tells you where in the original the frame you are looking at came from, and selects the clip. It follows speed ramps and reversal rather than subtracting the clip\u2019s start, so the answer is right on a shot you have slowed down.'],
      ['Insert and overwrite', 'Right-click a file in the Media panel. **Insert here** makes room — everything after the playhead on that track slides later, and anything the playhead is inside gets cut in two. **Overwrite here** lands on top and takes the space it needs. They are not a preference: overwriting when you meant to insert loses work, and inserting when you meant to overwrite pushes the whole cut out of sync with the music.'],
      ['J, K, L', 'The oldest transport there is. **L** plays forward and doubles the speed each press — 1x, 2x, 4x, 8x, 16x. **J** does the same backwards. **K** stops. Pressing J while running forward slows you down and only turns round at 1x, which is what makes it a shuttle rather than two play buttons. Space also drops you out of it.'],
      ['Backwards has no sound', 'No browser will play a media element at a negative rate, so reverse shuttle steps the playhead instead: the picture moves and the sound does not. That is the same limitation reversed clips have, and it is stated rather than hidden.'],
    ],
  },
  {
    id: 'multicam',
    group: 'The timeline',
    title: 'Multicam: several angles, cut live',
    body: [
      ['Line them up', 'Import every angle, then **Clip → Line up angles by sound**, or **Sync angles** in the Angles panel. Two cameras recording the same room heard the same door close, so correlating *when things happened* lines them up exactly — where matching a clap by eye never quite does.'],
      ['One clip, not six tracks', 'They become a single multicam clip that knows which angle is live at each moment. Trim it, grade it, move it — it behaves like any other clip.'],
      ['Watch them all at once', 'The **Angles** panel on the Cut and Edit pages shows every angle live while the timeline plays. That is the point of it: without it you can only see the angle you already picked, so picking a different one means stopping and playing again.'],
      ['Cut as it plays', 'Press **1** to **9** while it runs. The cut lands where the playhead was. Watch the take once, tapping as you go, and the edit is done — everything after is trimming. The whole pass is one undo step, not forty.'],
      ['If it could not line one up', 'An angle whose sound did not match gets an amber ! on its tile and is stacked at zero. That is the one to nudge by hand. Being told now is much better than finding out in the export.'],
      ['Finishing', '**Clip → Flatten the multicam into clips** turns the switches into ordinary clips, one per cut, from the right angle. Nothing downstream needs to know multicam was ever involved.'],
    ],
  },
  {
    id: 'pages',
    group: 'Finishing',
    title: 'Pages: one screen per job',
    body: [
      ['The bar along the bottom', 'At Intermediate and Professional there is a row of pages: **Media, Cut, Edit, Motion, Colour, Fairlight, Deliver**. They are the same project seen seven ways — switching pages never changes your edit, only what is on screen around it.'],
      ['Why bother', 'Cutting wants a long timeline and a small picture. Grading wants the opposite, plus a node graph, scopes and a strip of shots. One layout cannot be right for both, and the usual compromise is a screen that is wrong for everything.'],
      ['Switching', '**Shift+1** through **Shift+7**, or click one. Where you were is remembered, so the app opens on the page you were last working in.'],
      ['Turning docks on and off', 'Bottom-right of the page bar: **Gallery, Nodes, Scopes, Strip, Lightbox, Primaries**. Each page remembers its own set, so closing the gallery on Colour does not close it everywhere.'],
      ['No duplicates', 'The Colour panel carries scopes and wheels of its own, because at Intermediate with no docks open that is the only place for them. With the docks up they step aside rather than showing you the same control twice. Close the dock and the panel\u2019s copy comes straight back.'],
      ['Beginner', 'None of this appears. Beginner is one screen on purpose and stays one screen.'],
    ],
  },
  {
    id: 'nodes',
    group: 'Colour',
    title: 'Correctors: grading in a chain, not in one box',
    body: [
      ['What the graph shows', 'On the Colour page, the **Nodes** dock shows your grade as a chain: Source, then each corrector in turn, then Output. Corrector 1 is the clip\u2019s own grade — the wheels and sliders you have always had.'],
      ['Adding one', '**+ Serial**, or **Alt+S**. The new corrector reads the finished output of the one before it, which is the whole point: key the sky in corrector 2 and push it, then key skin out of *that result* in corrector 3. One set of controls cannot do that no matter how many of them there are.'],
      ['Which one you are editing', 'Click a corrector to select it. The Colour panel says which one it is writing to, and every wheel, slider, look and window you touch goes to that corrector alone.'],
      ['Turning one off', 'The power symbol on the corrector. Its grade comes straight out of the picture and goes back when you press it again — the settings are kept either way, so it is a comparison, not a delete.'],
      ['Deleting', 'Select it and press **✕**. Corrector 1 cannot be deleted because it is the clip\u2019s own grade; reset it instead.'],
      ['Before and after', 'Hold **\\** or press and hold **BYPASS** above the picture. Everything comes off, the frame gets an amber border so there is no mistaking it, and it all comes back when you let go.'],
      ['Both at once', '**SPLIT**, next to it, puts the graded shot on one side of a line and the shot as it was on the other. Drag the line, or focus it and use the arrow keys. A toggle shows you two pictures a second apart and asks you to remember the first; this is how you notice the skin went ruddy while you were busy with the sky.'],
    ],
  },
  {
    id: 'primaries',
    group: 'Colour',
    title: 'The wheels along the bottom',
    body: [
      ['Where they are', 'The **Primaries** band sits under the picture on the Colour page: Lift, Gamma and Gain, the six numbers you reach for between wheel moves, and the name of the corrector it is writing to.'],
      ['Lift, Gamma, Gain', 'Lift moves the shadows, Gamma the midtones — where faces and skin sit, and the one to reach for first — and Gain the highlights. Drag toward a colour to push that part of the range toward it; how far from the centre is how much.'],
      ['Back to neutral', 'Double-click a wheel, or press the ↺ beside its name. **Reset** at the right of the band puts the whole corrector back — the one you are on, not the whole clip.'],
      ['The numbers under each wheel', 'The red, green and blue offsets that wheel is producing. They are what you compare between shots — matching one shot to another is a job done with numbers, not by eye and memory.'],
      ['It follows the node graph', 'Pick a different corrector and the band moves with it, and says which one it is on. The same wheels are in the Colour panel; they are the same control, so it makes no difference which you touch.'],
    ],
  },
  {
    id: 'gallery',
    group: 'Colour',
    title: 'Stills, the clip strip and the lightbox',
    body: [
      ['Grabbing a still', 'Happy with a shot? Press **Grab** in the Gallery. It saves that grade — the whole chain and its windows — with a thumbnail of what it did.'],
      ['Using one', 'Click a still and it goes on the shot you are on. That is how a sequence gets matched: you do not write the numbers down, you grab the one that works and apply it to the next.'],
      ['The strip under the picture', 'Every shot in the timeline, in order. Click one and the playhead goes to the middle of it and selects it. Grading is done shot by shot, and "the next shot" is a question a timeline answers badly.'],
      ['The lightbox', 'Turn it on from the page bar to see every shot at once. It is for one job — spotting the one that does not match the others — and it closes when you click a shot.'],
      ['Scopes', 'The Scopes dock reads the actual frame, not your screen. A monitor running warm makes everything look warm, so you correct toward blue and deliver a blue file. Parade, waveform, vectorscope and histogram.'],
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
