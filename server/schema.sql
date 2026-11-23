CREATE TABLE members (
  id TEXT PRIMARY KEY,
  email TEXT COLLATE NOCASE NOT NULL UNIQUE,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  instrument TEXT NOT NULL,
  voice TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'musician' CHECK (role IN ('musician','admin','director')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','rejected','inactive')),
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by TEXT REFERENCES members(id)
) STRICT;
CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  expires INTEGER NOT NULL
) STRICT;
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  starts TEXT NOT NULL,
  ends TEXT NOT NULL CHECK (ends > starts),
  location TEXT NOT NULL,
  town TEXT NOT NULL,
  meeting TEXT NOT NULL,
  description TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  cancelled INTEGER NOT NULL DEFAULT 0 CHECK (cancelled IN (0,1)),
  reminder_minutes INTEGER,
  reminder_sent INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE TABLE intentions (
  event_id TEXT NOT NULL REFERENCES events(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  value TEXT NOT NULL CHECK (value IN ('yes','no','unset')),
  reason TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL REFERENCES members(id),
  updated_at TEXT NOT NULL,
  request_key TEXT,
  PRIMARY KEY(event_id, member_id)
) STRICT;
CREATE TABLE presence (
  event_id TEXT NOT NULL REFERENCES events(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  value TEXT NOT NULL CHECK (value IN ('present','absent','unset')),
  updated_by TEXT NOT NULL REFERENCES members(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(event_id, member_id)
) STRICT;
CREATE TABLE notices (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  event_id TEXT REFERENCES events(id),
  author_id TEXT REFERENCES members(id)
) STRICT;
CREATE TABLE inbox (
  notice_id TEXT NOT NULL REFERENCES notices(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  read_at TEXT,
  PRIMARY KEY(notice_id, member_id)
) STRICT;
CREATE INDEX inbox_member ON inbox(member_id);
CREATE TABLE audit (
  id INTEGER PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES members(id),
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE formations (
  event_id TEXT PRIMARY KEY REFERENCES events(id),
  columns INTEGER NOT NULL,
  positions TEXT NOT NULL,
  version INTEGER NOT NULL
) STRICT;
CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  columns INTEGER NOT NULL,
  size INTEGER NOT NULL
) STRICT;
CREATE TABLE works (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  authors TEXT NOT NULL,
  genre TEXT NOT NULL
) STRICT;
CREATE TABLE files (
  id TEXT PRIMARY KEY,
  work_id TEXT REFERENCES works(id),
  event_id TEXT REFERENCES events(id),
  name TEXT NOT NULL,
  instrument TEXT NOT NULL,
  voice TEXT NOT NULL,
  content BLOB NOT NULL,
  digest TEXT NOT NULL,
  approved INTEGER NOT NULL CHECK (approved IN (0,1)),
  CHECK ((work_id IS NULL) <> (event_id IS NULL))
) STRICT;
CREATE UNIQUE INDEX unique_score ON files(work_id, instrument, voice, digest) WHERE work_id IS NOT NULL;
CREATE UNIQUE INDEX unique_attachment ON files(event_id, digest) WHERE event_id IS NOT NULL;
