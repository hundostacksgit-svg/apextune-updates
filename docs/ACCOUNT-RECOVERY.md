# Nobody loses an account

Every way an account can be lost, and the way back in. Each path is
independent of the others, so losing one thing never means losing access;
every path is verified end to end in the recovery suite.

| What happened | The way back |
|---|---|
| Forgot the password | The **recovery code** sets a new one, on any device that holds the account. With the sync server on, the same code resets the server password, and a reset link by email is offered too. |
| Lost the device | The **recovery file** restores the account, with anything bought, on a new device. It opens with the recovery code *or* the password, whichever is remembered. With the server on, the file is also mirrored, sealed, to the server, so a new device signed in with the password gets the purchase without the file. |
| Lost the file as well | The **Square receipt number** unlocks what was bought on the activate page, always. A new account takes a moment and costs nothing. |
| Too many devices | The device seen longest ago makes room. There is no refusal, on the device or on the server, because "remove one first" cannot be done from a device that was lost. |
| None of the above | The support address on every page, and a person sorts it by hand. |

## The kit

Made at sign-up, while the password is in hand, and shown once: a kit made
later is a kit most people never make. The account page can remake it (new
code, new file) or refresh the file after a purchase, with the password.

- **The code** is 160 bits from the device's random source, formatted
  `OMNIDX-RK-XXXX-…` in an alphabet with no I, O, 0 or 1. It is never
  stored; only a verifier of a key derived from it (PBKDF2, 120k rounds,
  fresh salt).
- **The file** is the account record and the purchase, sealed with a random
  file key (AES-GCM). That key is wrapped twice: under the key from the
  recovery code, and under the password key. Either opens the file; nothing
  in it is readable without one of the two. The file carries a few readable
  lines saying what it is and where to use it.
- **On the device**, the recovery slot also holds the vault re-sealed under
  the recovery key, so a password reset re-seals the vault under the new
  password without ever needing the old one.

## The server, when it is on

`server/worker.js` gained: `POST /v1/auth/password` (change, knowing the old
one), `/v1/auth/recovery/set` (store the verifier), `/v1/auth/recovery/salt`
(the salt, with a stable fake for unknown emails so nothing leaks),
`/v1/auth/recovery/reset` (new password against the verifier; every session
ended), `/v1/auth/reset/request` and `/v1/auth/reset/confirm` (a link by
email, an hour to use it, needs `RESEND_API_KEY`), `/v1/vault/put` and
`/v1/vault/get` (the sealed file, one per account, bytes the server cannot
read). Login and reset return `evicted` when a device made room.

Schema: `recovery`, `resets`, `vaults` in `server/schema.sql`. Vars:
`SITE_URL`, `SALT_PEPPER` in `wrangler.toml`.

## What is deliberately not done

The recovery code is not emailed automatically at sign-up, because the
sign-up form does not verify the email and a code sent to a typo is a code
sent to a stranger. The page offers "Email it to myself" through the
person's own mail app instead.
