DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'address_change') THEN
    RAISE EXCEPTION 'No application tables restored';
  END IF;
END
$$;
