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
