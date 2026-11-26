CREATE TABLE members_new (
  id TEXT PRIMARY KEY,
  email TEXT COLLATE NOCASE UNIQUE,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  instrument TEXT NOT NULL,
  voice TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'musician' CHECK (role IN ('musician','director')),
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

INSERT INTO members_new
  SELECT id, email, password, name, instrument, voice, CASE WHEN role = 'admin' THEN 'director' ELSE role END,
    status, created_at, reviewed_at, reviewed_by, email_verified_at, requires_email_verification, password_enabled
  FROM members;
DROP TABLE members;
ALTER TABLE members_new RENAME TO members;

ALTER TABLE files ADD COLUMN replaces_id TEXT REFERENCES files(id);
CREATE UNIQUE INDEX files_replacement ON files(replaces_id) WHERE replaces_id IS NOT NULL;

CREATE TABLE material_items (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  condition TEXT NOT NULL CHECK (condition IN ('usable','repair','unusable')),
  notes TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1
) STRICT;

CREATE TABLE material_loans (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES material_items(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  lent_at TEXT NOT NULL,
  returned_at TEXT
) STRICT;
CREATE UNIQUE INDEX material_current_loan ON material_loans(item_id) WHERE returned_at IS NULL;
CREATE INDEX material_loan_history ON material_loans(item_id, lent_at);

CREATE TABLE catalog_values (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('instrument','voice','genre')),
  label TEXT NOT NULL,
  search_key TEXT NOT NULL,
  UNIQUE (kind, search_key)
) STRICT;
