-- Apply to a freshly initialized standalone database after creating the roles.
CREATE SCHEMA auth AUTHORIZATION nexus_auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('nexus.user_id', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT CASE WHEN current_user = 'nexus_mail' THEN 'service_role'
                ELSE current_user::text END
$$;
GRANT USAGE ON SCHEMA auth TO authenticated, nexus_mail;
CREATE PUBLICATION supabase_realtime;
