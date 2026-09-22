# OmniDx Tune — support replies

One person answers these, so they are written once. Paste, fill the blanks,
send. Every reply says what to do, not why they should not have asked.

Where things are on the buyer's PC: `C:\OmniDx\` holds `report-<date>.txt`
(everything found and done), `report-preview-<date>.txt` (free mode),
`log-<date>.txt` (a transcript of the run), `machine-<date>.json`,
`summary-<date>.json`, `processes-before/after-<date>.txt`,
`after-restart.txt`, `keep-log.txt` (one line per sign-in from the keep
task), `undo\undo.ps1`, `undo\keep.ps1`, `undo\changes-<date>.json` (one
per run; undo moves them to `undo\done\`), `backup\<date>\` (registry
exports, service list, app settings files). `$env:OMNIDX_MODE='status'`
prints the lot in one screen: runs in place, what drifted, the keep task,
the after-restart count, the key.
Ask for `summary-<date>.json` and `log-<date>.txt` first; they answer most
questions.

## "I paid and did not get a key"

> Square sends you back to omnidx.net/studio/activate/ with the key on
> screen; if the tab closed on the way, open that page again and it shows
> the key it saved. If it does not, put in the order number from your Square
> receipt email (near the top) and choose what you bought. Send me the order
> number if that fails and I will send the key back by hand.

By hand: `python3 tools/make-tune-key.py --order <ref>` gives the key the
page would have derived; with the Worker, check `tune_keys` for the order
first.

## "It says the key is on another PC"

> One key is one PC, and it locked to the first machine that ran it. If that
> was your old PC or a fresh build with a new board, open
> omnidx.net/studio/activate/, expand "New PC? Move this key", and put in
> your Square order number: it moves once every 30 days by itself. If the
> licence server is not on yet, send me the order number and I will move it.

By hand (Worker): `DELETE FROM tune_machines WHERE key = '<compact key>';`

## "My process count is still 150"

> The count right after the run is not the real one: services told to stop
> are still unwinding. Restart, sign in, wait two minutes, then open
> C:\OmniDx\after-restart.txt for the honest number. The report also prints
> a target for your PC; a laptop with Wi-Fi, Bluetooth, a fingerprint reader
> and an NVIDIA card sits higher than a bare desktop, and every launcher or
> overlay you open adds to it. Send me summary-<date>.json and
> processes-after-<date>.txt and I will tell you what the rest is.

Common leftovers: NVIDIA container (kept on purpose), anti-cheat services,
launchers set to start again by their own updater, OEM utilities the report
lists under "OEM extras".

## "Something broke" (printer, Bluetooth, Wi-Fi, Xbox controller, a game)

> Undo puts everything back: open PowerShell and paste
> `$env:OMNIDX_MODE='undo'; irm omnidx.net/go.ps1 | iex`, or double-click
> C:\OmniDx\undo\undo.ps1 as administrator. Then tell me what stopped
> working and I will fix the detection so it keeps that on your kind of PC.
> If you would rather keep the tune and turn one thing back on: Services >
> find it > Startup type Automatic > Start.

Log it: every "kept because" rule lives in `Get-KeepList` in the script.

## "OneDrive is gone" / "Where did WordPad go"

> The debloat removes OneDrive only when nobody is signed in to it, and your
> files were not touched; they are still in your OneDrive folder. To have it
> back: run undo, or install it from Microsoft (the undo does exactly that).
> WordPad, Internet Explorer, Steps Recorder and the old Media Player are
> pieces Microsoft has retired; undo re-enables the optional features, and
> Settings > Apps > Optional features adds any of them back by hand.

## "Windows Update turned things back on"

> That happens after a feature update. If you said yes to "keep it cut" at
> the end of the run, the sign-in task has already put it back; run
> `$env:OMNIDX_MODE='status'; irm omnidx.net/go.ps1 | iex` to see what it
> found (C:\OmniDx\keep-log.txt has one line per sign-in). If you said no,
> run the same command with the same key; the same PC can run it as often
> as it likes.

## "Does it work with VALORANT / Fortnite / CS2"

> Yes. It never touches Vanguard, Easy Anti-Cheat, BattlEye or Ricochet, and
> never any game file. VALORANT on Windows 11 also needs Secure Boot and TPM
> on; the report says whether yours are, and the BIOS checklist says how to
> turn them on. The tune never turns them off.

## "Refund"

> Done. You will see it from Square within a few days. If you would like the
> settings back, undo is in C:\OmniDx\undo. No hard feelings, and if you can
> tell me what it did not do, that is worth more to me than the money.

Then, in Square: refund the order. With the Worker:
`UPDATE tune_keys SET revoked_at = strftime('%s','now')*1000 WHERE order_ref = '<order>';`

## "Is this a virus / it wants admin"

> It needs administrator rights because stopping a service and changing a
> power plan need them; there is no way around that. The whole script is
> plain text at omnidx.net/tune/omnidx.ps1, every line of it, and the free
> report mode reads your PC without changing anything so you can see what it
> would do first. Nothing is installed and nothing stays running.

## "Can I get it for a friend / a second PC"

> Yes: buy a second key and give them the key, it locks to their PC. For five
> PCs, Squad is one key for $69.99.

## "It says PowerShell 7 / it says not administrator / 'irm' is not recognised"

> Use the blue Windows PowerShell (press the Windows key, type powershell,
> Enter): the command hands itself over to that one and asks for
> administrator rights. `irm` exists in every Windows 10 and 11 PowerShell;
> if it really is missing, the window is not PowerShell — use the one from
> the Start menu.
