-- =============================================================================
-- Nexus Dev Seed
-- Seeds the LOCAL development database with a known test account.
-- Applied by `supabase db reset` (see [db.seed] in config.toml).
--
-- ⚠️  NEVER run against a production database.
--    This file creates an account with a publicly known password.
-- =============================================================================

-- Production guard. The seed runs only when BOTH checks pass:
--
--   1. The server is local. inet_server_addr() is NULL for a Unix-socket
--      connection. For TCP it must be loopback, or in a Docker bridge range,
--      which is where `supabase start` runs Postgres. A hosted project reports
--      its own internal address. The database name is NOT checked: the hosted
--      default is also 'postgres', so a name cannot tell local from hosted.
--   2. auth.users holds no account except the dev seed user. A local
--      `supabase db reset` starts from an empty database, so it passes. A
--      populated database is refused.
--
-- Known residual risk: a hosted project that is EMPTY and whose server address
-- falls in 172.16.0.0/12 (AWS default VPCs use 172.31.x.x) would pass both
-- checks. Do not run this file against any hosted project.
DO $$
DECLARE
  _addr   inet := inet_server_addr();
  _dev_id uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;
  _others bigint;
BEGIN
  IF NOT (
       _addr IS NULL
    OR _addr <<= '127.0.0.0/8'::inet
    OR _addr  = '::1'::inet
    OR _addr <<= '172.16.0.0/12'::inet
    OR _addr <<= '192.168.0.0/16'::inet
  ) THEN
    RAISE EXCEPTION
      'seed.sql refused: server address % is not local. Dev credentials are only seeded into a local Supabase stack.',
      _addr;
  END IF;

  SELECT count(*) INTO _others FROM auth.users WHERE id <> _dev_id;
  IF _others > 0 THEN
    RAISE EXCEPTION
      'seed.sql refused: % non-seed account(s) exist in auth.users. Dev credentials are only seeded into an empty local database.',
      _others;
  END IF;
END $$;

-- pgcrypto is required for crypt() / gen_salt().
-- It is already enabled in database.sql, but guard here for safety.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- Dev user: dev@example.com  /  password: Dev@Nexus2026
-- Fixed UUID for reproducible references across resets.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  _user_id uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;
  _email   text := 'dev@example.com';
BEGIN

  -- Insert into auth.users (idempotent via ON CONFLICT)
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    _user_id,
    'authenticated',
    'authenticated',
    _email,
    crypt('Dev@Nexus2026', gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    NOW(),
    NOW(),
    '', '', '', ''
  )
  ON CONFLICT (id) DO NOTHING;

  -- Insert the email identity (required for Supabase email auth flow)
  INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    _user_id,
    _email,
    jsonb_build_object(
      'sub',            _user_id::text,
      'email',          _email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    NOW(),
    NOW(),
    NOW()
  )
  ON CONFLICT (provider, provider_id) DO NOTHING;

END $$;
