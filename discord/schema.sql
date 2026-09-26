-- The OmniDx Discord bot's database. Every statement is IF NOT EXISTS, so running the file again is always safe.

-- What setup.mjs found or made on the server: role and channel ids by name (guild_id, bot_id, team_role, ...).
CREATE TABLE IF NOT EXISTS config (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

-- One row per ticket; the id is the ticket's number.
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT,
  user_id TEXT NOT NULL,
  user_name TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'opening',   -- opening, open, closed
  buyer INTEGER NOT NULL DEFAULT 0,
  answers TEXT,                            -- the form, as JSON
  claimed_by TEXT,
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  closed_by TEXT,
  reason TEXT,
  warned_at INTEGER,                       -- when the "closes in 24 hours" note went up
  reminded_at INTEGER,                     -- when the team was told it has waited 12 hours
  rating INTEGER,
  messages INTEGER
);
CREATE INDEX IF NOT EXISTS tickets_user ON tickets (user_id, status);
CREATE INDEX IF NOT EXISTS tickets_channel ON tickets (channel_id);

-- A key verified with /verify belongs to one Discord account.
CREATE TABLE IF NOT EXISTS links (
  key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product TEXT,
  linked_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS links_user ON links (user_id);

-- Guess limiter for /verify: a bucket per user, counted per hour.
CREATE TABLE IF NOT EXISTS hits (
  bucket TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  until INTEGER NOT NULL
);

-- /review from Verified Buyers: one per Discord account (a new /review replaces it and waits for the team again).
-- Only 'shown' ones leave the server, on GET /reviews, which omnidx.net reads.
CREATE TABLE IF NOT EXISTS reviews (
  user_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                      -- the name shown with it
  stars INTEGER NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, shown, hidden
  created_at INTEGER NOT NULL,
  decided_at INTEGER,
  decided_by TEXT,
  log_message TEXT                         -- the card in #ticket-logs with Show and Hide
);
CREATE INDEX IF NOT EXISTS reviews_status ON reviews (status, decided_at);
