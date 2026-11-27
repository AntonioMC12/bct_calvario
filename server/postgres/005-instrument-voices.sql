DO $$
DECLARE current_version integer;
BEGIN
 SELECT version INTO current_version FROM calvario.schema_version WHERE singleton = 1;
 IF current_version = 5 THEN RETURN; END IF;
 IF current_version IS DISTINCT FROM 4 THEN RAISE EXCEPTION 'La actualización requiere el esquema Calvario 4'; END IF;
 ALTER TABLE calvario.catalog_values ADD COLUMN instrument TEXT NOT NULL DEFAULT '';
 UPDATE calvario.schema_version SET version = 5 WHERE singleton = 1;
END;
$$;
