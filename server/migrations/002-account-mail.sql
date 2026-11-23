ALTER TABLE members ADD COLUMN email_verified_at TEXT;
ALTER TABLE members ADD COLUMN requires_email_verification INTEGER NOT NULL DEFAULT 0
  CHECK (requires_email_verification IN (0, 1));

CREATE TABLE account_tokens (
  digest TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify','reset')),
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL
) STRICT;
CREATE INDEX account_tokens_member ON account_tokens(member_id, purpose, created);
CREATE INDEX account_tokens_expiry ON account_tokens(expires);
