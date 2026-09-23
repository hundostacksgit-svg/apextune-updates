-- OmniDx Studio backend schema (Cloudflare D1 / SQLite).
--
-- Apply with:
--   npx wrangler d1 execute omnidx-studio --file=schema.sql --remote
--
-- Deliberately small. Everything that can live on the buyer's device does live
-- on the buyer's device; what is here is only what genuinely needs a server:
-- who someone is, what they bought, and which machines they use it on.

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT,
  pw_hash     TEXT NOT NULL,   -- PBKDF2-SHA-256, hex
  pw_salt     TEXT NOT NULL,   -- 16 random bytes, hex
  pw_rounds   INTEGER NOT NULL,-- stored per user so it can be raised later
  created_at  INTEGER NOT NULL
);

-- Sessions store a hash of the token, never the token. A stolen database
-- therefore cannot be used to impersonate anyone.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);

-- One row per machine someone signs in on. The id is random and generated on
-- the device; the rest is only enough to tell a laptop from a phone in a list.
CREATE TABLE IF NOT EXISTS devices (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id   TEXT NOT NULL,
  label       TEXT,
  os          TEXT,
  screen      TEXT,
  last_seen   INTEGER NOT NULL,
  PRIMARY KEY (user_id, device_id)
);

-- A licence exists from the moment payment clears, whether or not anyone has
-- signed in yet. user_id fills in when it is redeemed, so a purchase is never
-- stranded by a typo'd email or an account made later.
CREATE TABLE IF NOT EXISTS licences (
  key           TEXT PRIMARY KEY,
  edition       TEXT NOT NULL,           -- 'creator' | 'studio'
  email         TEXT,
  user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  amount_cents  INTEGER,
  provider      TEXT,                    -- 'stripe' | 'square' | 'manual'
  provider_ref  TEXT,                    -- checkout session id, for refunds
  created_at    INTEGER NOT NULL,
  redeemed_at   INTEGER,
  revoked_at    INTEGER                  -- set on refund; never delete the row
);
CREATE INDEX IF NOT EXISTS licences_user ON licences(user_id);
CREATE INDEX IF NOT EXISTS licences_email ON licences(email);

CREATE TABLE IF NOT EXISTS ai_usage (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month    TEXT NOT NULL,                -- 'YYYY-MM'
  used     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, month)
);

-- Team seats.
--
-- A Team licence is three people. The limit is enforced in the Worker inside
-- the same request that writes the row, so a fourth invite fails no matter
-- what the app in front of it believes.
--
-- Rows are released, never deleted: taking a seat back and giving it to
-- someone else has to leave a trail, or "who had access in March" becomes
-- unanswerable.
CREATE TABLE IF NOT EXISTS seats (
  licence_key  TEXT NOT NULL REFERENCES licences(key) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  invite_code  TEXT UNIQUE,
  claimed_at   INTEGER,
  created_at   INTEGER NOT NULL,
  released_at  INTEGER
);
CREATE INDEX IF NOT EXISTS seats_licence ON seats(licence_key);
CREATE INDEX IF NOT EXISTS seats_user ON seats(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS seats_active ON seats(licence_key, email) WHERE released_at IS NULL;

-- Star ratings from the app and the site. One row per device per day; a
-- change of mind updates the row. No email, no project, no footage.
CREATE TABLE IF NOT EXISTS ratings (
  id          TEXT PRIMARY KEY,
  device_id   TEXT NOT NULL,
  day         TEXT NOT NULL,      -- YYYY-MM-DD, for the one-per-day rule
  stars       INTEGER NOT NULL,   -- 1..5
  note        TEXT,
  place       TEXT NOT NULL,      -- 'app', 'web' or 'desktop'
  edition     TEXT,
  version     TEXT,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE (device_id, day)
);

-- The recovery code, as a verifier. The app derives a key from the code and
-- a salt and sends a verifier of it; the code itself never reaches the
-- server, so a stolen database cannot reset anybody's password.
CREATE TABLE IF NOT EXISTS recovery (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  salt        TEXT NOT NULL,
  verifier    TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

-- Password reset links by email: a hash of the token, an hour to use it.
CREATE TABLE IF NOT EXISTS resets (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS resets_user ON resets(user_id);

-- The recovery file, sealed on the device, one per account. Bytes the
-- server cannot read; a new device signed in with the password opens it.
CREATE TABLE IF NOT EXISTS vaults (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  blob        TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------
-- OmniDx Tune.
--
-- A key is TUNE-XXXX-XXXX-XXXX-CCCC, one PC. A Squad order is three of them:
-- three rows sharing the order reference (plain, #2, #3). The checksum block
-- catches typos on the buyer's machine; this table is what makes a key real.
-- The keys for an order are minted once, so reloading the activation page or
-- a repeated Square webhook hands back the same keys rather than minting more.
-- emailed_at is set once the keys went to the checkout email, so Square's
-- retries never send the mail twice.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tune_keys (
  key           TEXT PRIMARY KEY,        -- compact, no dashes: TUNEXXXXXXXXXXXXCCCC
  product       TEXT NOT NULL,           -- 'tune' | 'squad'
  seats         INTEGER NOT NULL,        -- PCs this key may bind to
  email         TEXT,
  order_ref     TEXT UNIQUE,             -- Square order / payment id from the redirect
  provider      TEXT,                    -- 'square' | 'manual'
  amount_cents  INTEGER,
  verified      INTEGER NOT NULL DEFAULT 0, -- 1 when the order was confirmed with Square's API
  created_at    INTEGER NOT NULL,
  revoked_at    INTEGER,                 -- set on refund; the row is never deleted
  moved_at      INTEGER                  -- last self-service move to a new PC
);
CREATE INDEX IF NOT EXISTS tune_keys_email ON tune_keys(email);

-- Which PCs a key is bound to. The hwid is a hash the script makes from the
-- board serial, the system UUID and the CPU id; it identifies a PC without
-- describing it. `label` is only so the owner can tell their machines apart.
CREATE TABLE IF NOT EXISTS tune_machines (
  key         TEXT NOT NULL REFERENCES tune_keys(key) ON DELETE CASCADE,
  hwid        TEXT NOT NULL,
  label       TEXT,
  version     TEXT,                    -- script version at the last run
  os          TEXT,                    -- Windows build at the last run
  first_seen  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL,
  PRIMARY KEY (key, hwid)
);
-- Columns added after the first deploy. Each fails harmlessly when it exists.
ALTER TABLE tune_keys ADD COLUMN moved_at INTEGER;
ALTER TABLE tune_keys ADD COLUMN emailed_at INTEGER;
ALTER TABLE tune_machines ADD COLUMN version TEXT;
ALTER TABLE tune_machines ADD COLUMN os TEXT;
