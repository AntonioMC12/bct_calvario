DO $$
DECLARE current_version integer;
BEGIN
  SELECT version INTO current_version FROM calvario.schema_version WHERE singleton = 1;
  IF current_version = 3 THEN
    RETURN;
  END IF;
  IF current_version IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'La actualización requiere el esquema Calvario 2';
  END IF;

  ALTER TABLE calvario.members DROP CONSTRAINT members_role_check;
  UPDATE calvario.members SET role = 'director' WHERE role = 'admin';
  ALTER TABLE calvario.members ADD CONSTRAINT members_role_check CHECK (role IN ('musician','director'));

  ALTER TABLE calvario.files ADD COLUMN replaces_id TEXT REFERENCES calvario.files(id) DEFERRABLE;
  CREATE UNIQUE INDEX files_replacement ON calvario.files(replaces_id) WHERE replaces_id IS NOT NULL;

  CREATE TABLE calvario.material_items (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    condition TEXT NOT NULL CHECK (condition IN ('usable','repair','unusable')),
    notes TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
    version INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE calvario.material_loans (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES calvario.material_items(id),
    member_id TEXT NOT NULL REFERENCES calvario.members(id),
    lent_at TEXT NOT NULL,
    returned_at TEXT
  );
  CREATE UNIQUE INDEX material_current_loan ON calvario.material_loans(item_id) WHERE returned_at IS NULL;
  CREATE INDEX material_loan_history ON calvario.material_loans(item_id, lent_at);
  CREATE TABLE calvario.catalog_values (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('instrument','voice','genre')),
    label TEXT NOT NULL,
    search_key TEXT NOT NULL,
    UNIQUE (kind, search_key)
  );
  UPDATE calvario.schema_version SET version = 3 WHERE singleton = 1;
END;
$$;
