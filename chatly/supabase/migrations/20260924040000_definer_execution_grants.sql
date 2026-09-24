-- Existing SECURITY DEFINER functions inherited PostgreSQL's default PUBLIC EXECUTE.
-- They act on authenticated users or are invoked by triggers; none is an anonymous API.
DO $$
DECLARE
  function_name TEXT;
BEGIN
  FOR function_name IN
    SELECT p.oid::REGPROCEDURE::TEXT
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE FORMAT('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', function_name);
    EXECUTE FORMAT(
      'GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role, supabase_auth_admin',
      function_name
    );
  END LOOP;
END;
$$;
