ALTER TABLE members ADD COLUMN password_enabled INTEGER NOT NULL DEFAULT 1 CHECK (password_enabled IN (0, 1));

CREATE TABLE google_identities (
  google_subject TEXT PRIMARY KEY,
  firebase_uid TEXT NOT NULL UNIQUE,
  member_id TEXT NOT NULL UNIQUE REFERENCES members(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  session_token TEXT NOT NULL REFERENCES sessions(token) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE
) STRICT;
CREATE INDEX push_member ON push_subscriptions(member_id);
CREATE INDEX push_session ON push_subscriptions(session_token);
CREATE TABLE push_jobs (
  notice_id TEXT NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  due INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  lease TEXT,
  PRIMARY KEY(notice_id, subscription_id)
) STRICT;
CREATE INDEX push_due ON push_jobs(due);
CREATE TRIGGER inbox_push AFTER INSERT ON inbox
BEGIN
  INSERT INTO push_jobs(notice_id, subscription_id, due)
    SELECT NEW.notice_id, p.id, unixepoch() * 1000
    FROM push_subscriptions p JOIN sessions s ON s.token = p.session_token
    WHERE p.member_id = NEW.member_id AND s.expires > unixepoch() * 1000;
END;
