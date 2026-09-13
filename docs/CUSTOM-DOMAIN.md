# Putting OmniDx on omnidx.net

Once the domain is live the two apps sit at clean paths under it:

| | URL |
|---|---|
| Diagnostics site | `omnidx.net` |
| Diagnostics app | `omnidx.net/app/` |
| **Studio site** | `omnidx.net/studio/` |
| **Studio editor** | `omnidx.net/studio/app/` |
| Pricing | `omnidx.net/studio/pricing/` |
| Download | `omnidx.net/studio/download/` |
| Account | `omnidx.net/studio/account/` |

`tools/set-domain.py --site-url` rewrites the link-preview tags on every one of
those pages in a single run, so a move never leaves half the site pointing at
the old address.


`omnidx.net` is the chosen domain. As of the last check it was **not registered**
— a DNS lookup returns NXDOMAIN — so it should be available to buy.

`omnidx.com` is taken; it resolves to a live host.

**Cost:** about $11–15 a year for the `.net`. Nothing else — GitHub Pages hosting
and the HTTPS certificate are free.

---

## 1. Buy it

| Registrar | Typical .net | Note |
|---|---|---|
| **Cloudflare Registrar** | ~$11/yr | Sells at cost, no first-year bait pricing, free WHOIS privacy |
| Namecheap | ~$13–15/yr | Cheap first year, renews higher — check the renewal price |
| Porkbun | ~$12/yr | Free privacy, decent DNS panel |

Any of them work. Cloudflare is the cheapest over time because it never marks up
renewals.

---

## 2. Add the DNS records

In the registrar's DNS panel, add **four A records**, all with host `@`:

```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

Then one **CNAME record** so `www` works too:

```
Host:  www
Value: hundostacksgit-svg.github.io
```

DNS usually takes 10–60 minutes, occasionally a few hours.

### If your domain is on Cloudflare, turn the proxy off

Cloudflare switches its **proxy** on by default for new records — the little
cloud icon next to each one glows **orange**. A proxied record does not answer
with the address you typed; it answers with Cloudflare's own, so the world sees
`104.21.x.x` and `172.67.x.x` instead of GitHub's four addresses.

That breaks this setup twice over. The check below refuses to run, because it
looks for GitHub's addresses and cannot see them. And GitHub can never issue
the HTTPS certificate, because the challenge it uses to prove you own the
domain never reaches GitHub — so **Enforce HTTPS** stays greyed out forever
with no explanation.

The fix is one click per record. In **Cloudflare → your domain → DNS →
Records**, click the orange cloud on each of the five records until it turns
**grey** and reads **DNS only**. Nothing else changes; the records keep the
values you typed.

The symptom is easy to mistake for "DNS hasn't propagated yet", because the
domain *does* resolve — just to the wrong place. If a lookup returns exactly
two addresses starting `104.21.` and `172.67.`, it is this, and waiting longer
will not fix it.

You can switch the proxy back on after GitHub has issued the certificate if you
want Cloudflare's caching. If you do, set **SSL/TLS → Overview** to **Full**;
**Flexible** puts GitHub's own HTTPS redirect into an infinite loop.

---

## 3. Let the script do the rest

Don't hand-write the `CNAME` file. Once it exists, GitHub serves the site *only*
on that hostname — add it before DNS is ready and the site goes dark until it
catches up. This script checks first and refuses if it isn't safe:

```
python3 tools/set-domain.py omnidx.net
```

While DNS is still propagating it tells you exactly what's missing and changes
nothing. To poll without touching anything:

```
python3 tools/set-domain.py --check-only omnidx.net
```

When it's ready it writes the file and prints the commit command. Push it and
the deploy workflow carries it to `gh-pages` like everything else.

---

## 4. Turn on HTTPS

**Settings → Pages.** Once GitHub has issued the certificate — a few minutes,
sometimes up to an hour — tick **Enforce HTTPS**. Free, and it renews itself.

---

## Undoing it

```
python3 tools/set-domain.py --remove
git add -A && git commit -m "Return to the github.io address" && git push
```

The site goes back to `hundostacksgit-svg.github.io/apextune-updates/`.

---

## Troubleshooting

**"not registered — returns NXDOMAIN"**
You haven't bought it yet, or the registration hasn't propagated. New
registrations are usually live within minutes.

**"registered but has no A records yet"**
Bought, but the DNS records aren't added. Go back to step 2.

**"Missing GitHub Pages addresses"**
Some records are wrong or still propagating. The script lists exactly which
addresses it found and which it expected. Wait, then re-run.

**Works on `www` but not the bare domain, or vice versa**
The bare domain needs the four A records; `www` needs the CNAME record. Both are
required for both to work.

**"Enforce HTTPS" is greyed out**
The certificate can't be issued until DNS resolves correctly. Fix DNS, then wait.

---

## After it's live

Two things worth updating once `omnidx.net` is serving:

- `index.html` — the `og:image` meta tag is a relative path and will work either
  way, but you may want to add an explicit `og:url`.
- `README.md` and `desktop/README.md` still name the `github.io` URL in a few
  places. Cosmetic, but tidy.

If you rename the repository instead of buying a domain, the address changes
without any DNS involved — and the link-preview tags in `index.html` carry
absolute URLs that have to move with it:

```
python3 tools/set-domain.py --site-url https://hundostacksgit-svg.github.io/omnidx/
```

GitHub keeps redirecting the old address after a rename, so nothing you have
already posted breaks.

The repository name (`apextune-updates`) stops being visible entirely once a
custom domain is in front of it, so there's no need to rename it.
