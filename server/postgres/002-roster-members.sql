DO $$
DECLARE current_version integer;
BEGIN
  SELECT version INTO current_version FROM calvario.schema_version WHERE singleton = 1;
  IF current_version = 2 THEN
    RETURN;
  END IF;
  IF current_version IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'La actualización requiere el esquema Calvario 1';
  END IF;

  ALTER TABLE calvario.members
    ALTER COLUMN email DROP NOT NULL,
    ADD CONSTRAINT member_account_required_for_login CHECK (email IS NOT NULL OR (
      password = '' AND password_enabled = 0 AND role = 'musician' AND status IN ('active','inactive')
      AND email_verified_at IS NULL AND requires_email_verification = 0
    ));
  UPDATE calvario.schema_version SET version = 2 WHERE singleton = 1;
END;
$$;
