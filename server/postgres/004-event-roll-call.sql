DO $$
DECLARE current_version integer;
BEGIN
  SELECT version INTO current_version FROM calvario.schema_version WHERE singleton = 1;
  IF current_version = 4 THEN
    RETURN;
  END IF;
  IF current_version IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'La actualización requiere el esquema Calvario 3';
  END IF;

  ALTER TABLE calvario.events ADD COLUMN roll_call INTEGER NOT NULL DEFAULT 1 CHECK (roll_call IN (0,1));
  UPDATE calvario.schema_version SET version = 4 WHERE singleton = 1;
END;
$$;
