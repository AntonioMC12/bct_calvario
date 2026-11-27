CREATE TABLE material_requests (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES material_items(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by TEXT REFERENCES members(id)
);
CREATE UNIQUE INDEX material_pending_request ON material_requests(item_id,member_id) WHERE status = 'pending';
CREATE INDEX material_member_requests ON material_requests(member_id,created_at);
