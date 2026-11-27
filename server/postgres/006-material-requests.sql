DO $$
DECLARE current_version integer;
BEGIN
  SELECT version INTO current_version FROM calvario.schema_version WHERE singleton = 1;
  IF current_version = 6 THEN RETURN; END IF;
  IF current_version IS DISTINCT FROM 5 THEN RAISE EXCEPTION 'La actualización requiere el esquema Calvario 5'; END IF;
  CREATE TABLE calvario.material_requests (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES calvario.material_items(id),
    member_id TEXT NOT NULL REFERENCES calvario.members(id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
    created_at TEXT NOT NULL,
    reviewed_at TEXT,
    reviewed_by TEXT REFERENCES calvario.members(id)
  );
  CREATE UNIQUE INDEX material_pending_request ON calvario.material_requests(item_id,member_id) WHERE status = 'pending';
  CREATE INDEX material_member_requests ON calvario.material_requests(member_id,created_at);
  UPDATE calvario.schema_version SET version = 6 WHERE singleton = 1;
END;
$$;
