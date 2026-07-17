-- Enable Row Level Security on every table in the public schema.
-- This removes Supabase's "Unrestricted" label.
--
-- NexusDesk connects as the `postgres` role (via the Supabase pooler), which has
-- the BYPASSRLS attribute, so the API/Prisma keep full access. Any other role
-- (anon/authenticated via Supabase's auto REST API) gets zero access because no
-- policies are defined — which is exactly what we want, since we never expose the
-- database directly through Supabase.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE '\_prisma%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
  END LOOP;
END $$;
