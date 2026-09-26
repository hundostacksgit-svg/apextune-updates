# OmniDx Edition on TikTok: the full film first, then the series

## The full film (the one to lead with)

What people watch is the whole story, the way the restart video (number 9 of
the command's set) tells it, not one feature at a time. So the Edition leads
with one film of a minute and a bit, `omnidx-full.mp4`: a clean Windows 11
install from Microsoft's own installer (sped up and labelled), OmniDx Edition
setting itself up at the first sign-in, one restart, a look round (the
taskbar, its search, its browser, the presets, Game Boost's 1 ms timer), then
Task Manager, the one line in PowerShell, the run, the restart and Task
Manager again, the number counting down to the new one. Three chapters sit in
the corner (Install, OmniDx Edition, The command); every cut lands on the
music's beat.

It is one take of `.github/workflows/edition-vm.yml` in its full-film mode
(`run.sh --edition --edition-command --extreme`: no key on the stick, so the
tune is run by hand), cut by `tools/promo/film/plan_full.py` and rendered by
`tools/promo/film/edit.py`, with the install from `tools/promo/film/timelapse.py`.

The newest cut (take 11, 1:25) counts 104 processes before the command and
61 after the restart, at rest, with the filming helper (three processes) and
Task Manager among them; memory in use 1,472 MB, processor 11% at rest; the
install plays at 229x, setup at 55x, the run at 60x. The first cut (take 10,
1:23, on the site's showcase) counted 111 and 73.

**Caption:**

> Clean Windows 11 → my own gaming OS → one command. 104 processes to 61,
> start to finish, on a real (test) PC. Would you run it? 👇
> #windows11 #pcgaming #gamingpc #pcsetup #fps

Pinned comment: *Genuine Windows 11 from Microsoft's installer, set up by a
script you can read, with one button to undo it. The command is
irm omnidx.net/go.ps1 | iex.*

Post it first, before anything below; the shorter cuts after it are for the
days between, and only if the full film does well.

## The series

Ten 9:16 videos in the style of the restart test (number 9 of the command's
set): the PC's own screen in the middle, the words above it, the speed on
anything sped up, and a number under the screen only while the screen shows
it. Eight show OmniDx Edition, two the command. They are screen recordings of
real runs on a clean Windows 11 test PC in the cloud, recorded as they
happened: no mock-ups, nothing drawn over the screen.

- The Edition videos come from one recording of the Edition's clean-install
  run (`.github/workflows/edition-vm.yml`), cut by
  `tools/promo/film/plan_edition.py` and rendered by `tools/promo/film/edit.py`.
- The two command cuts come from the restart test's recording, cut by
  `tools/promo/film/plan_command.py`.

The MP4s are promotion material and never go into git.

OmniDx Edition is not on omnidx.net. These videos show what it is and ask
whether people want it: the comments are the answer before anything is put
on sale. Nothing in them gives a price or a date for the Edition.

## What the Edition is, in one line (for every reply)

Genuine Windows 11, installed from Microsoft's own USB stick and activated by
your own licence, then set up for games by a script: its own search, browser
and hub, the taskbar on the left, fewer processes, lower delay, and one
button to put Windows back as it was. Nothing of Windows is copied or
changed; Windows is a trademark of Microsoft.

## The videos

| # | File | Length | The hook | What it asks for |
|---|---|---|---|---|
| E1 | `edition-01-my-own-os.mp4` | ~0:45 | "I set Windows 11 up as my own gaming OS" | Comment: would you run it? |
| E2 | `edition-02-search.mp4` | ~0:27 | "I replaced Windows search. Windows + S is mine now" | Comment what search should do |
| E3 | `edition-03-browser.mp4` | ~0:27 | "A browser that runs nothing in the background" | Save |
| E4 | `edition-04-game-boost.mp4` | ~0:14 | "Game Boost: what a game gets the moment it opens" | Watch again |
| E5 | `edition-05-hub.mp4` | ~0:22 | "One app for everything: OmniDx Hub" | Comment a feature to add |
| E6 | `edition-06-install.mp4` | ~0:30 | "Clean Windows 11 to OmniDx Edition. One restart" | Follow for the release |
| E7 | `edition-07-processes.mp4` | ~0:12 | "How many processes does my gaming OS run?" | Comment your number |
| E8 | `edition-08-the-look.mp4` | ~0:23 | "Genuine Windows. Nothing of it looks stock" | Share |
| C10 | `command-01-30-seconds.mp4` | 0:36 | "A clean Windows 11 PC. Task Manager: 143" | Comment your number |
| C11 | `command-02-one-line.mp4` | 0:28 | "All it takes is one line" | Watch again |

## What to post with each

Copy the caption as it is; pin the pinned comment yourself right after posting.

**E1. I set Windows 11 up as my own gaming OS**

> Genuine Windows 11, set up for games: my own search, my own browser, the
> taskbar on the left, Game Boost, fewer processes. Would you run it? 👇
> #windows11 #pcgaming #gamingpc #pcsetup #desksetup

Pinned comment: *It's real Windows 11 from Microsoft's own installer, set up
by a script with one button to undo it. Not a cracked or modified Windows.
Should I release it?*

**E2. Windows + S is mine now**

> Windows + S opens my search now: apps, games, settings by the words you
> actually use, sums, and "boost". What should it do next?
> #windows11 #pctips #productivity #pcgaming

Pinned comment: *It starts with Windows and stays in memory (about 20 MB), so
it opens instantly. Windows' own search is switched off: it kept seven
processes running all the time. Start still opens every app.*

**E3. A browser that runs nothing in the background**

> The Edge engine that's already in Windows, in a window with nothing else:
> tabs sleep after five minutes and the moment a game starts, trackers
> blocked, and a new tab page that loads nothing.
> #pcgaming #browser #windows11 #fps

Pinned comment: *Background tabs asleep = less running while you play. Your
tabs come back where they were when you open them.*

**E4. Game Boost**

> When a game fills the screen: a 1 ms system timer (Windows' default is
> 15.6), the performance power plan, and every browser tab asleep. Off 20
> seconds after you quit.
> #pcgaming #lowlatency #competitivegaming #windows11

Pinned comment: *It turns on by itself. Insane mode holds 0.5 ms and empties
the standby memory list too.*

**E5. OmniDx Hub**

> Presets (Balanced, Competitive, Insane), your games from every launcher,
> Game Boost, the tune, and "remove OmniDx Edition". One app.
> #pcgaming #gamingsetup #windows11 #pcsetup

Pinned comment: *Every preset writes down what it changes, and "Restore
Windows defaults" puts it all back.*

**E6. Clean install to OmniDx Edition**

> Microsoft's own Windows 11 installer, then it sets itself up at the first
> sign-in, runs the tune, restarts, and this is what you get. Real run, sped
> up where it says so.
> #windows11 #pcbuild #cleaninstall #pcgaming

Pinned comment: *The install stick is Microsoft's Media Creation Tool plus
one folder. Your own licence activates it.*

**E7. How many processes?**

> Task Manager on the Edition at rest, a few minutes after sign-in. A fresh
> Windows 11 install sits around 130 to 150. What's yours? 👇
> #pcgaming #windows11 #pctips #taskmanager

Pinned comment: *This is a test PC in the cloud. A home PC adds its drivers'
own processes; the Edition counts yours at every sign-in and shows it in the
Hub.*

**E8. Nothing of it looks stock**

> Dark theme in OmniDx violet, the eagle on the wallpaper, the lock screen
> and the account picture, taskbar on the left, OmniDx Edition in Settings >
> About. Still genuine Windows underneath.
> #desksetup #windows11 #pcsetup #aesthetic #gamingsetup

Pinned comment: *All of it undoes with one button in the Hub.*

**C10. 143 → 85 in 36 seconds**

> A clean Windows 11 test PC, one line in PowerShell, one restart. Real run;
> the waits are sped up and say so. What's your number? 👇
> #pcgaming #windows11 #pctips #gamingpc

Pinned comment: *The free report on omnidx.net shows what it would change on
your PC and changes nothing.*

**C11. All it takes is one line**

> irm omnidx.net/go.ps1 | iex. It reads your PC before it changes anything,
> asks what you want, and the undo is one file.
> #powershell #windows11 #pctips #pcgaming

Pinned comment: *The whole script is public at omnidx.net/tune/omnidx.ps1.
Read it first; that's the point.*

## Posting

- **Order:** E1, C10, E7, E2, E4, E6, E3, C11, E5, E8. One a day, between the
  command's own videos. E1 and E7 ask for a comment; the answers are the
  test of whether people want the Edition.
- **Count the yeses.** Replies like "drop it", "how do I get it", "would
  pay" on E1, E6 and E7 are the number to decide on.
- Everything in "Posting" and "Replies" in `docs/TUNE-TIKTOK.md` applies:
  upload in the app, answer every comment in the first hour, same files to
  Reels and Shorts.

## Replies to the Edition comments

- **"So it's just Windows"**: "Yes, on purpose. Genuine Windows from
  Microsoft, your own licence, updates and anti-cheat work. It's set up
  differently, and one button puts it back."
- **"Is this like Atlas / ReviOS / Ghost Spectre?"**: "No modified ISO and
  nothing of Windows cut out of the image: Microsoft's installer, then a
  script you can read, with an undo. Defender and Windows Update stay on."
- **"Does VALORANT / FACEIT work?"**: "Yes: Secure Boot, TPM, memory
  integrity and Defender are left on."
- **"Where do I get it?"**: "Not out yet. Tell me what you'd want in it."
- **"FPS?"**: "It lowers what runs in the background and the delay settings
  (timer, power plan, network). What that does for frames depends on your
  PC, so no number from me."
- **"That's a VM"**: "Yes, a clean test PC in the cloud, and the video says
  so."

## Never

No frame-rate number, no "X% faster", no price or release date for the
Edition until it is on the site, no "custom Windows ISO" (it isn't one), and
no Microsoft logo or "Windows" in a product name.
