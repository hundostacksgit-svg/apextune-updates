# Pointing a .com at OmniDx

The site is live on GitHub Pages already. A custom domain replaces the
`github.io` address with your own, and it stays free — you only pay the
registrar for the name.

**Total cost:** about $10–12 a year. Nothing else.

---

## 1. Buy the domain

Any registrar works. Two that don't upsell:

| Registrar | Typical .com | Note |
|---|---|---|
| **Cloudflare Registrar** | ~$10.50/yr | Sells at cost, no first-year bait pricing |
| **Namecheap** | ~$11–14/yr | Cheap first year, renews higher — check the renewal price |

Avoid registrars that bundle "privacy protection" as a paid extra; both above
include it free.

If `omnidx.com` is taken, `omnidx.app`, `getomnidx.com`, `omnidx.io` or
`tryomnidx.com` all read fine.

---

## 2. Add the DNS records

At your registrar's DNS panel, add these **four A records**, all with host `@`:

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

DNS usually takes 10–60 minutes to propagate, occasionally a few hours.

Check it has taken effect:

```
dig +short omnidx.com
```

You should see those four addresses.

---

## 3. Only then, add the CNAME file

**Do this last.** Once this file exists, GitHub serves the site *only* on that
hostname and redirects the `github.io` URL to it. If the DNS is not pointing at
GitHub yet, the site becomes unreachable until it is.

Create a file called `CNAME` in the repository root — no extension, one line,
just the bare domain with no `https://` and no trailing slash:

```
omnidx.com
```

Commit and push it. The deploy workflow mirrors it to `gh-pages` like everything
else, and GitHub picks it up on the next build.

---

## 4. Turn on HTTPS

Go to **Settings → Pages**. Once GitHub has issued the certificate — usually a
few minutes, sometimes up to an hour — tick **Enforce HTTPS**.

The certificate is free and renews itself.

---

## Undoing it

Delete the `CNAME` file, commit and push. The site returns to the `github.io`
address on the next build.

---

## Troubleshooting

**"Domain does not resolve to the GitHub Pages server"**
DNS hasn't propagated yet, or a record is wrong. Confirm with
`dig +short yourdomain.com` that you get exactly the four addresses above.

**Site works on `www` but not the bare domain, or vice versa**
The bare domain needs the four A records; `www` needs the CNAME record. Both are
required for both to work.

**"Enforce HTTPS" is greyed out**
The certificate hasn't been issued yet. It cannot start until the DNS resolves
correctly, so fix the DNS first, then wait.

**The github.io URL stopped working**
That is expected once a `CNAME` file exists — it now redirects to your domain.

---

## A note on the repository name

The repository is still called `apextune-updates`, which is why the current URL
is `hundostacksgit-svg.github.io/apextune-updates/`. Renaming it to `omnidx`
would tidy that up, but it changes the `github.io` URL and breaks any existing
bookmark or installed shortcut. Once a custom domain is in place the repository
name stops being visible at all, so it is easiest to point the domain first and
leave the rename alone.
