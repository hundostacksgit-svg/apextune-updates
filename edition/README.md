# OmniDx Edition

A gaming setup of Windows 10 and 11 that looks and works like its own system,
without being a copy of Windows. Windows is the one the user installs from
Microsoft's own USB stick, unmodified and activated by their own licence.
OmniDx Edition adds its own apps, pictures and settings on top, the way anyone
could by hand, and writes down every value it changes first, so one command
puts it all back.

That is what keeps it clear of Microsoft's copyright: nothing of Windows is
copied, changed or handed out. The stick holds Microsoft's files as they come,
plus an answer file and this folder. Custom "gaming OS" downloads (a Windows
image with parts cut out, often pre-activated) are a copy of Windows handed out
without a licence to do so; this is not that.

It comes with every OmniDx Tune key. Buyers run one line from their key page
(`$env:OMNIDX_KEY='TUNE-...'; irm omnidx.net/edition.ps1 | iex`, the script is
`edition.ps1` at the top of the repository): it checks the key with the key
server, then makes the install stick (1) or sets up the PC as it is (2), and
takes it off again (3). The guide is `studio/edition/`, the films are on
`studio/showcase/`. The Pages publish (`.github/workflows/pages.yml`) puts this
folder on omnidx.net only as its download: `edition/omnidx-edition.zip`
(everything here but `ci/`) and `edition/edition.json` with the zip's SHA-256,
made by `tools/edition-pack.py`; `edition.ps1` refuses a zip that does not
match. The Windows check runs `edition.ps1` end to end against a copy served
from the build machine.

## What it is

| | |
|---|---|
| **Look** | The site's black-and-violet background with the eagle as the wallpaper and the lock screen, dark theme with the OmniDx violet on Start and the taskbar, the eagle as the account picture, "OmniDx Edition" as the PC maker in Settings > About, no system sounds. |
| **Taskbar** | On the left, next to Start. Pinned: OmniDx Search, OmniDx Browser, File Explorer, OmniDx Hub, Terminal. No search box, no widgets, no Task View, no Copilot. End task on right-click. |
| **OmniDx Search** | Windows + S (setup frees it from Windows' search), or its taskbar button. Starts at every sign-in from its own task. Apps, games (Steam, Epic, Riot, Battle.net, EA, Ubisoft, Roblox), 55 Settings pages and Windows tools by the words people use, your files (its own list, so it works with Windows Search indexing off), sums (`12*7+3`), web addresses and web search, commands (`>cmd`), and actions: Game Boost, Free up memory, Restart, Sleep, Lock, Flush DNS, Restart Explorer. Stays in memory (about 20 MB) so it opens instantly. |
| **Game Boost** | On by itself when a game fills the screen, off 20 seconds after. Holds a finer system timer (1 ms Competitive, 0.5 ms Insane), switches to the performance power plan, puts the browser's tabs to sleep (the open one too, unless it plays sound), and on Insane empties the standby list. |
| **OmniDx Browser** | The Edge engine already in Windows (WebView2) in its own window: tabs in the title bar, one address bar, nothing else. Trackers blocked at Strict, tabs asleep after five minutes out of sight and at once during Game Boost, last session's tabs come back asleep, a new tab page that is a file on the PC (loads nothing). Ctrl+T/W/L/Tab/Shift+T, F11, Ctrl+1 to 9. |
| **OmniDx Hub** | Live processes, CPU, memory, system timer, ping and uptime; Game Boost and auto Boost; the presets; your games with their Steam art; the tune (run, Extreme, free look, status, undo); the keys; remove the Edition. |
| **Lean** | 60 processes or fewer at rest after the tune, the target (take 11 of the clean-install run measured 60 three minutes after signing in and 61 at rest, with the filming helper's three processes and Task Manager among them, so about 57 without them; memory in use 1,472 MB, processor 11%; a clean Windows 11 starts at about 130; the Hub shows the number at each sign-in, and OmniDx Search writes the names to `%LOCALAPPDATA%\OmniDx\signin-processes.txt`). Setup turns off what runs in the background for things a gaming PC does without: telemetry, search indexing (OmniDx Search keeps its own list), Windows' own search (seven processes; OmniDx Search is Windows + S, and Start still opens every app), Windows' AI runtime, the health-and-experiences helper and the compatibility inventory, Resume, Recall, Click to Do, Copilot, Edge and Store apps in the background, suggested-app installs, background game recording, update sharing with other PCs, the Windows Security tray icon (Defender keeps running), OneDrive at sign-in when no one uses it, the print spooler until a printer is added (OmniDx Search: "Turn printing on"), and motherboard helpers (Nahimic, Intel ME and DAL, Intel Graphics Command Center, AMD's experience program, Killer analytics). Graphics drivers' services are left alone. |
| **Presets** | **Balanced** (Windows' own scheduling and power), **Competitive** (the default: foreground-first CPU slices, network throttling off, games get GPU and I/O priority, windowed and borderless games presented like fullscreen, the performance plan, 1 ms Boost timer that reaches every app, the game included), **Insane** (Competitive, plus the OmniDx Insane power plan with no core parking or USB/PCIe power saving, fixed short CPU slices, network cards' interrupt moderation off, fastest key repeat, no animations or toasts, kernel kept in RAM on 16 GB+, 0.5 ms Boost timer). Each asks for administrator rights, records what it changes; Restore Windows defaults puts it back. |
| **The tune** | With a key, setup runs the OmniDx tune in Extreme as its last step (restore point first, its own undo), and it restarts the PC. If Windows Update is waiting for a restart (a fresh install usually is), setup restarts first and the tune runs by itself at the next sign-in; the welcome waits for it. Without a key, it is a click in the Hub. |

Security stays as Windows ships it: Defender, Windows Update, SmartScreen,
Secure Boot, TPM and memory integrity are not touched, so anti-cheat
(VALORANT, FACEIT) keeps working.

## Try it

**The one line (what buyers use):**
`$env:OMNIDX_KEY='TUNE-XXXX-XXXX-XXXX-XXXX'; irm omnidx.net/edition.ps1 | iex`,
then 1 (the stick), 2 (this PC as it is) or 3 (take it off).

**On a PC being reinstalled (the full experience), by hand:**

1. Make a Windows USB stick with Microsoft's Media Creation Tool.
2. On any Windows PC: `.\make-usb.ps1 -Drive E: -Account Player -Key TUNE-XXXX-XXXX-XXXX-XXXX`
   (the key is optional).
3. Boot from the stick. Setup asks which disk (pick it yourself); the rest
   answers itself. At the first sign-in the Edition sets itself up in a window
   you can watch (about three minutes, plus the tune), then restarts into it.

**On a PC as it is:** in an administrator PowerShell, in this folder:
`.\setup.ps1` (or `.\setup.ps1 -Key TUNE-...`). It restarts at the end.

**Take it off:** OmniDx Hub > About > Remove OmniDx Edition, or
`& "C:\Program Files\OmniDx\Edition\setup.ps1" -Undo`. The tune's own changes
stay until its undo is run.

## Files

| | |
|---|---|
| `setup.ps1` | The setup, and `-Undo`. Log and records in `C:\ProgramData\OmniDx\Edition`. |
| `build.ps1` | Compiles the apps on the PC with .NET Framework 4.8's `csc.exe` (every Windows 10 and 11 has it). The WebView2 SDK comes from nuget.org and is used only if each file is signed by Microsoft. |
| `apps/` | The source: `Common.cs` (look, window frame, Windows calls, games), `Search.cs`, `Hub.cs`, `Browser.cs`. C# 5, WinForms. |
| `assets/` | Wallpaper, lock screen, icons, account picture, OEM logo; `make-assets.cjs` makes them from the site's design. |
| `make-usb.ps1`, `usb/autounattend.xml`, `first-logon.cmd` | The install stick. |
| `ci/shots.ps1` | The Windows check (`.github/workflows/edition.yml`): builds, opens and pictures each app, applies and restores the presets, runs setup and undo. |

## What a clean install taught it

The VM run (`.github/workflows/edition-vm.yml`) installs Windows 11 from
Microsoft's image, lets the Edition set itself up at the first sign-in with the
tune in Extreme, and looks round after the restart. The first run found:

- The tune tidies the Run list, so OmniDx Search is started by a sign-in task
  of its own (`\OmniDx\Edition Search`, at normal priority; a task's default
  is below normal), and setup tells the tune to keep it.
- A RunOnce entry fired while the tune was still running. The welcome is now
  shown by Search, once, on the first sign-in after setup's restart.
- Windows 11 draws its own silhouette for an account without a picture;
  setup sets the policy that uses the account pictures it installs.
- Windows applies a taskbar layout file only when it is set as locked; on
  Windows 11 that locks the pins only (Start keeps its own), so it is set
  there and left out on Windows 10, where it would lock Start's tiles.
- The tune's sign-in tasks flashed an empty PowerShell window that took the
  focus; tune 1.77.1 starts them with no window on Windows 11.

The third run found:

- Windows had installed updates by the first sign-in and wanted a restart, and
  the tune does not change services under a pending update, so it restarted
  and never ran. Setup now checks first: with an update waiting, it keeps the
  key in a file only administrators can read, restarts, and a one-time sign-in
  task (`\OmniDx\Edition Tune`) runs the tune after it (up to three restarts if
  the update asks again), then deletes the key and the task.
- Ctrl+T, Ctrl+W and Ctrl+L did nothing while a web page had the keys (WebView2
  keeps them from the window). A small script in each page passes those keys
  up, only real presses, tagged with a secret made at each start; and a new tab
  now takes the typing at once, before its engine has started. Only the new tab
  page may ask the browser to open an address.

Take 11 (Windows' own search, the AI runtime, the health helper and the compatibility inventory off, OneDrive
and reserved storage handled) measured, after the tune and a restart: 60 processes three minutes after signing
in, 61 at rest (take 10: 73), memory in use 1,472 MB (take 10: 1,769 MB), 14.7 GB of disk, processor 11%. Still
running that could go: CrossDeviceResume (it starts despite Resume being off) and, in the VM only, the
evaluation licence service and the WMI hosts the filming helper's own queries start.

The seventh run (the first with the lean stage end to end) found:

- After setup's restart and the tune's, the Edition signed in with 71
  processes (OmniDx Search's count; 73 three minutes on), on a test PC with no
  drivers of its own. The target is 60.
- Windows installs OneDrive for the account in the background at the first
  sign-in, which is when setup runs: the lean stage found no OneDrive
  start-up entry to switch off, and the tune found no OneDrive to remove, so it
  finished installing after both and started at every sign-in. Both now wait
  for that installer (up to two minutes) first; tune 1.78.2.

## Still to check

- Check the pins and the lock screen picture on Home and Pro (the VM is
  Enterprise), and whether users want the pins locked at all.
- The default-browser file is read at sign-in on Pro and Enterprise; Home may
  ask the user in Settings instead.
- The WebView2 SDK is pinned to 1.0.2903.40, the version the check builds, and
  used only when Windows confirms each file is signed by Microsoft.
- Price and naming: "OmniDx Edition" (never "OmniDx Windows"); Windows is
  Microsoft's trademark and the Hub's About page says so.
