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

> Square sent you back to omnidx.net/studio/activate/ with the key on
> screen the moment the payment cleared, and that page shows it again any
> time: the receipt number from Square's receipt email (#AB12 or so) plus
> the email you paid with, or the long order id from the address bar. Send
> me the receipt if that fails and I will look the order up.

By hand: the owner page (omnidx.net/studio/admin/): look the order up by
order reference, receipt number or key; the keys are on the answer, and
"Send the keys again" works when emailing is switched on. Nothing else
makes a buyer's key; keys exist only in the server's table.

## "I lost my key"

> If the PC has run the tune before, it still has the key: the app fills it
> in, the console flow uses it without asking, and
> `$env:OMNIDX_MODE='status'; irm omnidx.net/go.ps1 | iex` shows it with the
> middle hidden. To see it in full, open Registry Editor at
> HKEY_LOCAL_MACHINE\SOFTWARE\OmniDx\Tune. For a new PC, the key page at
> omnidx.net/studio/activate/ shows the keys issued for your order: the
> receipt number from Square's email plus the email you paid with, or the
> long order id.

## "It says the key is on another PC"

> One key is one PC, and it locked to the first machine that ran it. If that
> was your old PC or a fresh build with a new board, open
> omnidx.net/studio/activate/, expand "New PC? Move this key", and put in
> your Square order number: it moves once every 30 days by itself. If the
> licence server is not on yet, send me the order number and I will move it.

By hand: the owner page, look the key up, "Free this key from its PC" (it
does not spend the buyer's own monthly move).

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

## "Undo is stuck on 'going back in one go'"

> It is not stuck: that stretch is Windows re-adding the pieces the debloat
> removed (WordPad, the legacy media player, the optional features), and it
> downloads them from Windows Update, which can take a few minutes each on
> a slow line. Leave the window open. If one of them does not come back
> within five minutes, undo stops waiting, lists the rest for Settings >
> Apps > Optional features, and finishes; everything else has already been
> put back by then. Windows Update being out of reach (a metered line, a
> work network, a VPN) is the usual reason.

## "Does it boot faster?"

> Status shows it in Windows' own figures: `$env:OMNIDX_MODE='status'; irm
> omnidx.net/go.ps1 | iex` prints the last measured start next to the one
> from before the tune, and after-restart.txt carries the first start after
> it. If you kept the keep task, status also lists every start since the
> tune, oldest first, from its log. Windows writes that figure a few
> minutes after the desktop appears, so it is a full start, not a resume:
> Fast Startup is off after the tune, which is also why the first start
> afterwards can look no quicker. The second and later ones are the honest
> comparison.

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

## "Is my key still good / it says switched off"

> Run status (`$env:OMNIDX_MODE='status'; irm omnidx.net/go.ps1 | iex`): it
> asks the licence server what it holds on the key bound to that PC and says
> so in plain words: issued and on one PC, or switched off. "Switched off"
> means the order was refunded, or I switched it off by hand; if that is
> wrong, send the receipt and I will switch it back on from the owner page.

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

## One friend's share of a Squad refunded

Refund the share in Square as normal (a third of $39.99, or whatever was
agreed). A partial refund switches nothing off by itself; the Worker
emails you once with the amounts and the order reference. Owner page:
paste the order, "Look up", then type that friend's key and "Switch off
this key only". The other two keys stay on.

## "Refund"

> Done. You will see it from Square within a few days. If you would like the
> settings back, undo is in C:\OmniDx\undo. No hard feelings, and if you can
> tell me what it did not do, that is worth more to me than the money.

Then, in Square: refund the order. That is all: Square tells the licence
server, the keys from that order stop working, and the buyer gets a short
email saying so. A partial refund leaves the keys alone on purpose; for that
one, or for a key issued by hand, the command is in docs/TUNE.md > Refunds.

## "My antivirus / SmartScreen blocked it"

> Nothing is downloaded as a file, so SmartScreen has nothing to judge: the
> command fetches the script into PowerShell's memory and runs it there,
> after checking it against the hash the Windows check published. If a
> third-party antivirus stops PowerShell reaching omnidx.net, allow it for
> that one run, or use the free report mode first to see it read your PC
> and change nothing. The whole script is public at
> omnidx.net/tune/omnidx.ps1, and omnidx.net/studio/what-it-touches/ lists
> every service, task, app and value it touches.

## "The report says Defender / updates / UAC is off, and I never did that"

> The "Left by other tools" section names things another optimiser or
> debloat script switched off before the tune ran: Defender by policy,
> automatic updates, the Windows Update service, SmartScreen, User Account
> Control, or the CPU security mitigations. The tune changes none of them,
> on purpose, and the way back is on the same line. Do those first; a PC
> with Defender or updates off is not one to game on, whatever the frame
> counter says.

## "The log says 'already disabled; left that way' / 'already capped'"

> The tune only ever turns things down. A service it would set to manual
> (search indexing, Superfetch, the diagnostic policy) that something else
> had already disabled stays disabled, because manual would be a step back
> on. The same for Defender's scan cap: if yours was already under 25%,
> it keeps your figure. Both are printed so the report is honest about
> what it did not touch.

## "Is this a virus / it wants admin"

> It needs administrator rights because stopping a service and changing a
> power plan need them; there is no way around that. The whole script is
> plain text at omnidx.net/tune/omnidx.ps1, every line of it, and the free
> report mode reads your PC without changing anything so you can see what it
> would do first. Nothing is installed and nothing stays running.

## "Can I get it for a friend / a second PC"

> Yes: buy a second key and give them the key, it locks to their PC. For
> three PCs, Squad is three keys for $39.99: three keys on the page, each
> locks to its own PC.

Every reply below that needs a look at an order is done from
omnidx.net/studio/admin/ with the owner token (docs/TUNE.md > Support from a
phone): look the order up, send the keys again, free a key, switch an order
off or on. No terminal needed.

## "I paid but no email came"

> The key is not sent by email; it is on the page Square sent you to after
> paying, and that page shows it again any time: omnidx.net/studio/activate/
> with the short receipt number from Square's receipt email (#AB12 or so)
> and the email you paid with. The page has buttons to copy it, email it to
> yourself, save it as a file or print it. If it is not there either, send
> the receipt and I will look the order up.

(When emailing is switched on, the keys also go to the checkout address and
the page's "Send it again" button sends them once more; the reply above
still stands, the page is the copy that never gets lost.)

## "It says too many tries"

> The key page and the licence server allow a handful of tries per
> connection every ten minutes, so nobody can guess receipt numbers or keys.
> Wait ten minutes and try once more with the receipt number and the email
> you paid with, or send me the receipt and I will send the keys.

A shared connection (a dorm, a school, one router for a house) counts as
one. Twenty key-page tries, forty key checks from the script, ten moves;
the owner page shuts the same way after ten wrong tokens, and a right token
is never counted. Nothing to reset: the window passes on its own.

## "It says PowerShell 7 / it says not administrator / 'irm' is not recognised"

> Use the blue Windows PowerShell (press the Windows key, type powershell,
> Enter): the command hands itself over to that one and asks for
> administrator rights. `irm` exists in every Windows 10 and 11 PowerShell;
> if it really is missing, the window is not PowerShell — use the one from
> the Start menu.
