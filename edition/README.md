# OmniDx Edition (preview, not on omnidx.net yet)

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

The Pages publish leaves this folder out (`.github/workflows/pages.yml`), so
none of it is on omnidx.net until it is linked on purpose.

## What it is

| | |
|---|---|
| **Look** | The site's black-and-violet background with the eagle as the wallpaper and the lock screen, dark theme with the OmniDx violet on Start and the taskbar, the eagle as the account picture, "OmniDx Edition" as the PC maker in Settings > About, no system sounds. |
| **Taskbar** | On the left, next to Start. Pinned: OmniDx Search, OmniDx Browser, File Explorer, OmniDx Hub, Terminal. No search box, no widgets, no Task View, no Copilot. End task on right-click. |
| **OmniDx Search** | Windows + S (setup frees it from Windows' search), or its taskbar button. Apps, games (Steam, Epic, Riot, Battle.net, EA, Ubisoft, Roblox), 55 Settings pages and Windows tools by the words people use, your files (its own list, so it works with Windows Search indexing off), sums (`12*7+3`), web addresses and web search, commands (`>cmd`), and actions: Game Boost, Free up memory, Restart, Sleep, Lock, Flush DNS, Restart Explorer. Stays in memory (about 20 MB) so it opens instantly. |
| **Game Boost** | On by itself when a game fills the screen, off 20 seconds after. Holds a finer system timer (1 ms Competitive, 0.5 ms Insane), switches to the performance power plan, puts the browser's tabs to sleep (the open one too, unless it plays sound), and on Insane empties the standby list. |
| **OmniDx Browser** | The Edge engine already in Windows (WebView2) in its own window: tabs in the title bar, one address bar, nothing else. Trackers blocked at Strict, tabs asleep after five minutes out of sight and at once during Game Boost, last session's tabs come back asleep, a new tab page that is a file on the PC (loads nothing). Ctrl+T/W/L/Tab/Shift+T, F11, Ctrl+1 to 9. |
| **OmniDx Hub** | Live processes, CPU, memory, system timer, ping and uptime; Game Boost and auto Boost; the presets; your games with their Steam art; the tune (run, Extreme, free look, status, undo); the keys; remove the Edition. |
| **Presets** | **Balanced** (Windows' own scheduling and power), **Competitive** (the default: foreground-first CPU slices, network throttling off, games get GPU and I/O priority, the performance plan, 1 ms Boost timer), **Insane** (Competitive, plus the OmniDx Insane power plan with no core parking or USB/PCIe power saving, fixed short CPU slices, network cards' interrupt moderation off, fastest key repeat, no animations or toasts, kernel kept in RAM on 16 GB+, 0.5 ms Boost timer). Each asks for administrator rights, records what it changes; Restore Windows defaults puts it back. |
| **The tune** | With a key, setup runs the OmniDx tune in Extreme as its last step (restore point first, its own undo), and it restarts the PC. Without one, it is a click in the Hub. |

Security stays as Windows ships it: Defender, Windows Update, SmartScreen,
Secure Boot, TPM and memory integrity are not touched, so anti-cheat
(VALORANT, FACEIT) keeps working.

## Try it

**On a PC being reinstalled (the full experience):**

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

## Before it goes on the site

- The taskbar pins use Windows' layout policy; check they stay user-editable
  on Home and Pro, and that the lock screen picture applies on Home.
- The default-browser file is read at sign-in on Pro and Enterprise; Home may
  ask the user in Settings instead.
- Pin the WebView2 SDK version in `build.ps1` to the one the check last built.
- Price and naming: "OmniDx Edition" (never "OmniDx Windows"); Windows is
  Microsoft's trademark and the Hub's About page says so.
