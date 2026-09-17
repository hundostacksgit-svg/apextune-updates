# Ambient channel — the generator and the process

A faceless YouTube channel of long, quiet videos: rain for sleeping, a fire
for studying, the northern lights with brown noise under them. Every one of
them comes out of this repository. Nothing is recorded, nothing is
downloaded, nothing belongs to anybody else.

**What a video is made of**

- **The picture** is a one-minute loop drawn by code — the `sleep` scene in
  `tools/promo/studio/comp.js`. Every motion in it is periodic over the
  minute, so the last frame is the first frame and the repeats are
  invisible. Rendered at 3840x2160, no logo, no text.
- **The sound** is synthesised by `tools/promo/studio/ambient.mjs` from
  noise and filters in ffmpeg. It is nobody's recording, so no Content ID
  claim can ever land on it, and it is generated fresh each time, so it is
  never "reused content".
- **The length** comes from `tools/promo/studio/longform.mjs`, which repeats
  the loop under the bed for as many hours as asked, without re-encoding
  the picture. An hour takes about as long as writing the file to disk.

Five looks exist, each paired with a bed:

| Look | Loop id | Bed | What it is |
|---|---|---|---|
| rain | `amb-02-rain` | rain | Rain streaks through a dark window, slow gusts |
| aurora | `amb-01-aurora` | brown | Northern lights over a dark horizon, brown noise |
| space | `amb-03-space` | space | A slow star field, a deep drone with a long echo |
| embers | `amb-04-embers` | fire | Embers rising off a fire, crackle under a rumble |
| ocean | `amb-05-ocean` | sea | Moonlit swells, waves that come in every ten seconds |

---

## Getting a finished video with nothing installed

The repository has a workflow that builds the whole thing on GitHub's
machines and hands back a download.

1. Open **github.com/hundostacksgit-svg/apextune-updates → Actions → Ambient
   video** and press **Run workflow**.
2. Pick the branch the code is on, then:
   - **look** — one of the five, or `all` for five videos at once
   - **hours** — 1, 2, 3 or 8
   - **size** — 4K, or 1080p when the file must stay small
   - **where** — `release` puts a permanent link on the repository's
     Releases page; `artifact` keeps it on the run page only (zipped, gone
     after 90 days). Anything over 2 GB goes to an artifact whatever you
     pick, because that is the most a release file may be.
3. Wait. Rendering the loop is the slow part — an hour or two for 4K. When
   the run shows a green tick, open it: the **Summary** at the top has the
   download link, and the file is also under **Releases** on the repository
   front page.
4. Download the `.mp4` and the `-thumbnail.jpg`. Upload to YouTube with the
   title, description and tags below.

A release is public, like the repository. That is fine — the video is going
to be public on YouTube anyway — but it does put the file on the
repository's front page, so pick `artifact` if you would rather it did not.

Sizes, so you can plan: 4K rain is the heaviest picture at roughly 1.5 GB an
hour; the other four are lighter. 1080p is about a third of 4K. So 4K fits an
hour in a release, 1080p fits three, and eight hours of anything goes to an
artifact.

## Doing it on a computer instead

With `node` and `ffmpeg` installed (Windows: set `FFMPEG` to the path of
`ffmpeg.exe`), three commands:

```
mkdir -p ~/omnidx-promo/shots ~/omnidx-promo/music ~/omnidx-promo/fonts ~/omnidx-promo/footage
PROMO_ASSETS=~/omnidx-promo node tools/promo/studio/render.mjs --fmt yt --silent --scale 2 --crf 22 --video amb-02-rain --out ~/omnidx-promo/out
PROMO_ASSETS=~/omnidx-promo node tools/promo/studio/ambient.mjs --only rain
node tools/promo/studio/longform.mjs --loop ~/omnidx-promo/out/yt/amb-02-rain-silent-4k.mp4 --bed ~/omnidx-promo/ambient/rain.mp3 --hours 1 --out rain-1h.mp4
```

The `mkdir` is because `render.mjs` checks for the asset folders a promo
needs; a silent loop uses none of them, but it still wants them to exist.
Swap `amb-02-rain` and `rain` for any row of the table above. `--scale 1`
gives 1080p. `--crf` is picture quality — 22 is right for a loop that is
about to be repeated for hours, 18 is the promo default and twice the size.

## The five videos

Titles are written the way people search, not the way a promo is written:
what it is, how long, and the two words that matter to a sleep searcher
("for sleep", "no music"). Descriptions are plain. None of them mention
OmniDx — the channel is its own thing, and a sleep video with a software
plug in it reads as spam.

**Rain — `amb-02-rain`**

- Title: `Heavy Rain at Night for Deep Sleep — 1 Hour, 4K (no music)`
- Description:
  > Rain on a dark window, all night. No music, no talking, no ads in the
  > picture — just rain for sleeping, studying or blocking out a noisy room.
  > The picture loops without a seam and the sound never stops. Put it on,
  > turn the screen down, sleep.
- Tags: `rain sounds, rain for sleeping, heavy rain, sleep sounds, rain at night, white noise, sleep, insomnia, study, relax, 4K, ambient`

**Aurora — `amb-01-aurora`**

- Title: `Northern Lights with Deep Brown Noise — 1 Hour Sleep Video, 4K`
- Description:
  > The northern lights moving slowly over a dark horizon, with deep brown
  > noise underneath. Brown noise sits lower than white noise, which is why
  > people use it to fall asleep and stay asleep. No music, no talking.
- Tags: `brown noise, brown noise for sleep, northern lights, aurora, sleep sounds, deep sleep, focus, study, tinnitus relief, relax, 4K, ambient`

**Space — `amb-03-space`**

- Title: `Drifting Through Space — 1 Hour Dark Ambient Drone for Sleep and Focus, 4K`
- Description:
  > A slow star field and a deep, distant drone. Made for sleeping, late
  > studying, or having something on that asks nothing of you. No music, no
  > talking, no changes in volume.
- Tags: `space ambient, dark ambient, drone, sleep sounds, deep space, focus music, study, relax, meditation, 4K, ambient, sleep`

**Embers — `amb-04-embers`**

- Title: `Fireplace Embers Crackling — 1 Hour, 4K, for Sleep and Study`
- Description:
  > Embers rising off a fire in the dark, with the crackle and the low
  > rumble under it. For sleeping, reading, studying, or a cold night. No
  > music, no talking.
- Tags: `fireplace, fire sounds, crackling fire, fireplace for sleep, embers, sleep sounds, cozy, study, relax, 4K, ambient, sleep`

**Ocean — `amb-05-ocean`**

- Title: `Moonlit Ocean Waves for Sleep — 1 Hour, 4K, No Music`
- Description:
  > Slow swells under a moon, a wave coming in every few seconds. For
  > sleeping, calming down, or a room that is too quiet. No music, no
  > talking.
- Tags: `ocean waves, ocean sounds for sleeping, waves for sleep, sea sounds, sleep sounds, calm, relax, meditation, study, 4K, ambient, sleep`

For a 3-hour or 8-hour build, change the hours in the title and nothing else.

## The channel's face

`tools/promo/studio/channel.mjs` draws the profile picture, the banner and a
thumbnail for every loop from the loops' own frames, so the channel looks
like its videos:

```
node tools/promo/studio/render.mjs --fmt yt --silent --scale 2 --frame 20 --video amb-02-rain   # one still per loop (all five)
node tools/promo/studio/channel.mjs --name "Dim Hours" --hours 1                                 # pfp-800.png, banner-2560x1440.jpg, thumb-<look>-1h.jpg
```

The mark is a moon with a veil of cloud across its lower half — it reads at
the 98 pixels YouTube shows it at, and it is on every thumbnail's corner so
the channel is recognisable in a row of search results. `--hours 3` or `8`
makes the thumbnails for the longer builds.

**Name: Dim Hours.** Dim is the pictures, hours is the length, and it says
"sleep" without the word. Handle `@dimhours`; if that is taken, `@thedimhours`
or `@dimhoursambient`. Check by opening youtube.com/@dimhours — a channel
that already has real numbers means pick the next one.

**Why not the OmniDx name?** Three reasons, and they are all about money:

- YouTube recommends by channel. A channel whose viewers are asleep gets
  its other videos put in front of sleepers. OmniDx promos on the same
  channel would be shown to people looking for rain, and to nobody looking
  for an editor.
- Trust runs the other way too. Somebody landing on a software company's
  channel and finding eight-hour rain videos reads it as a content farm,
  which is the last thing the trust page was built to prevent.
- A channel that earns on its own is an asset on its own. Sleep channels
  with steady watch time get bought; a company channel does not.

The one bridge worth building: a single line in the channel's About text —
"Pictures made with OmniDx Studio, omnidx.net" — where an editor who is
curious finds it and a sleeper never does. Nothing in a title, description or
picture.

## Setting the channel up

- **Name.** Dim Hours, above. Not OmniDx and nothing like it — this channel
  earns on its own.
- **Made for kids: No.** Set it in channel settings and on every upload.
  "Yes" turns off comments, notifications and most ad formats, and sleep
  content is general-audience, not children's.
- **Category:** Music. It is where the ambient and sleep channels live.
- **Upload defaults** (Settings → Upload defaults): paste the description
  and tags once, so every upload starts with them.
- **Banner and icon:** a frame from a loop. For the banner make a
  2560x1440 still — `ffmpeg -ss 20 -i amb-02-rain-silent-4k.mp4 -frames:v 1 -vf scale=2560:-2 banner.jpg` — and for the icon crop the middle of any thumbnail to a square.
- **Thumbnails:** the `-thumbnail.jpg` from the run is a clean frame. Ambient
  thumbnails do well plain; if you want text on it, make it in OmniDx
  Studio, big and two words at most ("RAIN · 1 HOUR").
- **Playlists:** one per sound (Rain, Fire, Ocean…) and one per length
  (1 hour, 3 hours, 8 hours). Playlists are what YouTube autoplays next,
  and autoplay is where sleep channels get their hours.
- **End screen:** on every video, one element — another video on the
  channel. Somebody who is still awake gets the next one without leaving.

## Schedule

- **Week 1:** the five 1-hour videos, one a day, at the same time each
  evening. Five different searches, five chances.
- **Week 2:** look at YouTube Studio → Analytics → Content. Whichever two
  got the most **watch time** (not views) get a 3-hour and an 8-hour
  version — same title, new length. Long versions are where the hours
  come from.
- **Every week after:** two uploads. One new length of a proven look, one
  new look. Ask for new looks and they get added to the table: snow, fog,
  a candle, a thunderstorm, an underwater scene, a train window at night.
- Reply to every comment for the first month. YouTube reads it as a
  channel that is alive.

## What to expect, honestly

- Views on this kind of channel come from **search and suggested video**,
  not from subscribers, and not on day one. The first month is usually
  small. Channels that keep uploading for three to six months are the ones
  that find their audience, because the videos keep working long after they
  go up — a rain video posted in September is still being found in March.
- Watch **impressions and click-through rate** for the thumbnail and title,
  and **average view duration** for the video itself. Sleep videos have long
  view durations by nature — people fall asleep with them on — and long
  view durations are what YouTube pushes.
- **Getting paid** needs the YouTube Partner Program: 1,000 subscribers and
  4,000 public watch hours in the past year. Sleep content is the fastest
  way anybody has found to 4,000 hours — a hundred people leaving a 1-hour
  video on is a hundred hours. Ads on ambient content pay a low rate per
  thousand views, so it is a volume game: many videos, long lengths,
  playlists. Nobody should promise a number.
- **Originality:** YouTube's reused-content rule is about uploading other
  people's work or the same thing over and over. A picture drawn by our
  own code and a sound generated by our own filters is original content by
  any reading of it. Keep every upload a different look or a different
  length, never the same file twice.

## Where the pieces live

| Piece | Where |
|---|---|
| The looks (picture) | `tools/promo/studio/comp.js`, scene `sleep` |
| The loop specs | `tools/promo/studio/videos.js`, ids `amb-01…05`, each with its `bed` |
| The beds (sound) | `tools/promo/studio/ambient.mjs` |
| The long-form join | `tools/promo/studio/longform.mjs` |
| The build-on-GitHub workflow | `.github/workflows/ambient.yml` |
