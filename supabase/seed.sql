-- =============================================================================
-- Nexus Dev Seed
-- Seeds the LOCAL development database with a known test account.
-- Applied by `supabase db reset` (see [db.seed] in config.toml).
--
-- ⚠️  NEVER run against a production database.
--    This file creates an account with a publicly known password.
-- =============================================================================

-- Production guard: abort if the database is not a local/test instance.
DO $$
BEGIN
  IF current_database() NOT ILIKE '%local%'
     AND current_database() NOT ILIKE '%test%'
     AND current_database() NOT ILIKE '%dev%'
     AND current_database() NOT ILIKE '%postgres%'   -- default supabase local db name
  THEN
    RAISE EXCEPTION
      'seed.sql must only run on local or test databases (got: %). '
      'Refusing to create dev credentials in a production environment.',
      current_database();
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
