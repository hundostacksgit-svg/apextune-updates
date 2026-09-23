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
Ask for the support bundle first: `$env:OMNIDX_MODE='support'; irm
omnidx.net/go.ps1 | iex` zips the logs, the machine as read, the numbers and
the change records to their desktop (keys masked, no registry exports, none
of their files) and opens Explorer on it. It answers most questions.

## "The key page says the key desk is not open"

> The licence server is not switched on (or cannot be reached), and keys
> come only from it. Owner: deploy the Worker and set `SQUARE_ACCESS_TOKEN`
> (docs/TUNE.md, "What to switch on"). Buyer: reply with your Square receipt
> and the key is issued by hand from the order.

## "I paid and did not get a key"

> Square sends you back to omnidx.net/studio/activate/ with the key on
> screen; if the tab closed on the way, open that page again and it shows
> the key it saved. If it does not, put in the order number from your Square
> receipt email (near the top) and choose what you bought. Send me the order
> number if that fails and I will send the key back by hand.

By hand: `python3 tools/make-tune-key.py --order <ref>` gives the key the
page would have derived; with the Worker, check `tune_keys` for the order
first.

## "I lost my key"

> If the PC has run the tune before, it still has the key: the app fills it
> in, the console flow uses it without asking, and
> `$env:OMNIDX_MODE='status'; irm omnidx.net/go.ps1 | iex` shows it with the
> middle hidden. To see it in full, open Registry Editor at
> HKEY_LOCAL_MACHINE\SOFTWARE\OmniDx\Tune. For a new PC, the key page at
> omnidx.net/studio/activate/ makes the same key again from your Square
> order number.

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

## "I got a notification from OmniDx Tune"

> That is the keep task, once, after a Windows feature update: it found
> five or more of the tune's settings turned back on and put them back.
> Nothing was sent anywhere; the list is in C:\OmniDx\keep-log.txt, and
> `$env:OMNIDX_MODE='status'; irm omnidx.net/go.ps1 | iex` shows the
> whole picture. Small drifts are fixed without a notification.

## "Status says something has drifted / lists processes I don't know"

> The drifted lines are settings a Windows update turned back on; the
> keep task fixes them three minutes after your next sign-in, or run the
> command again now. The "running now, not running after the tune" line is
> different: it is whatever you opened since (a launcher, an overlay, a
> browser) and is not a setting. Close what you do not need before a game;
> if a launcher put itself back into startup, Task Manager > Startup, or
> run the command again and untick it.

## "I turned a startup app back on and the tune switched it off again"

> Not any more: since 1.21 a startup app you turned back on in Task
> Manager after a run stays on when you run again. The console lists it as
> "stays on"; the app shows it unticked. If you do want it cut, type "all"
> at the console picker or tick it in the app. The keep task never touches
> startup apps at all.

## "After Extreme, Task Manager shows one svchost with lots of services" / "something crashed and took Bluetooth with it"

> That is the service-host grouping Extreme does on purpose: Windows had been
> giving every service its own process, and the grouping is twenty to forty
> processes fewer after a restart. The one cost is that when a service
> crashes it takes the others in its host with it, which a restart fixes. If
> that happens more than once, undo, run the standard command again, and
> Windows goes back to one process per service.

## "Extreme took my notifications / search box / animations"

> That is what Extreme is: the caution on the key page lists every one of
> them. To have the tune without them, `$env:OMNIDX_MODE='undolast'; irm
> omnidx.net/go.ps1 | iex` puts back only the Extreme run and leaves the
> tune and the keep task as they were. Or put back the
> one thing you miss in Settings: Extreme never touches the keep task's
> list, so it stays put.

## "Does it work with VALORANT / Fortnite / CS2"

> Yes. It never touches Vanguard, Easy Anti-Cheat, BattlEye or Ricochet, and
> never any game file. VALORANT on Windows 11 also needs Secure Boot and TPM
> on; the report says whether yours are, and the BIOS checklist says how to
> turn them on. The tune never turns them off.

## "Refund"

> Done. You will see it from Square within a few days. If you would like the
> settings back, undo is in C:\OmniDx\undo. No hard feelings, and if you can
> tell me what it did not do, that is worth more to me than the money.

Then, in Square: refund the order. That is all: Square tells the licence
server, the keys from that order stop working, and the buyer gets a short
email saying so. A partial refund leaves the keys alone on purpose; for that
one, or for a key issued by hand, the command is in docs/TUNE.md > Refunds.

## "Is this a virus / it wants admin"

> It needs administrator rights because stopping a service and changing a
> power plan need them; there is no way around that. The whole script is
> plain text at omnidx.net/tune/omnidx.ps1, every line of it, and the free
> report mode reads your PC without changing anything so you can see what it
> would do first. Nothing is installed and nothing stays running.

## "Can I get it for a friend / a second PC"

> Yes: buy a second key and give them the key, it locks to their PC. For
> three PCs, Squad is three keys for $39.99: one email, three keys, each
> locks to its own PC.

Every reply below that needs a look at an order is done from
omnidx.net/studio/admin/ with the owner token (docs/TUNE.md > Support from a
phone): look the order up, send the keys again, free a key, switch an order
off or on. No terminal needed.

## "I paid but no email came"

> The keys go to the email address typed at Square's checkout the moment the
> payment completes, from keys@omnidx.net; check spam and promotions first.
> They are also on the page Square sent you to after paying, and that page
> shows them again any time: omnidx.net/studio/activate/, with the short
> receipt number from Square's email (#AB12 or so) and the email you paid
> with. If neither has them, send the receipt and
> I will look the order up and send the keys by hand.

## "It says PowerShell 7 / it says not administrator / 'irm' is not recognised"

> Use the blue Windows PowerShell (press the Windows key, type powershell,
> Enter): the command hands itself over to that one and asks for
> administrator rights. `irm` exists in every Windows 10 and 11 PowerShell;
> if it really is missing, the window is not PowerShell — use the one from
> the Start menu.
