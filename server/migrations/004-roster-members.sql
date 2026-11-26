CREATE TABLE members_new (
  id TEXT PRIMARY KEY,
  email TEXT COLLATE NOCASE UNIQUE,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  instrument TEXT NOT NULL,
  voice TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'musician' CHECK (role IN ('musician','admin','director')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','rejected','inactive')),
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by TEXT REFERENCES members(id),
  email_verified_at TEXT,
  requires_email_verification INTEGER NOT NULL DEFAULT 0 CHECK (requires_email_verification IN (0, 1)),
  password_enabled INTEGER NOT NULL DEFAULT 1 CHECK (password_enabled IN (0, 1)),
  CHECK (email IS NOT NULL OR (
    password = '' AND password_enabled = 0 AND role = 'musician' AND status IN ('active','inactive')
    AND email_verified_at IS NULL AND requires_email_verification = 0
  ))
) STRICT;

INSERT INTO members_new SELECT * FROM members;
DROP TABLE members;
ALTER TABLE members_new RENAME TO members;
