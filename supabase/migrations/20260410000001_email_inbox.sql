BEGIN;

-- 1. email_accounts: stores connected OAuth accounts per user
CREATE TABLE public.email_accounts (
  id                     UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                UUID        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  provider               TEXT        NOT NULL CHECK (provider IN ('google', 'microsoft')),
  email_address          TEXT        NOT NULL,
  encrypted_access_token  TEXT        NOT NULL,
  encrypted_refresh_token TEXT        NOT NULL,
  token_expires_at       TIMESTAMPTZ NOT NULL,
  status                 TEXT        NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT email_accounts_user_provider_email_key UNIQUE (user_id, provider, email_address)
);

-- 2. RLS on email_accounts
ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_accounts FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users see own accounts"
  ON public.email_accounts
  FOR ALL
  USING (user_id = auth.uid());

-- 3. Safe view that hides encrypted token columns from the frontend
CREATE VIEW public.email_accounts_safe
  WITH (security_invoker = true)
AS
  SELECT id, user_id, provider, email_address, status, created_at
  FROM public.email_accounts;

-- 4. nexus_emails: cached email data synced from providers
CREATE TABLE public.nexus_emails (
  id                UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  account_id        UUID        NOT NULL REFERENCES public.email_accounts ON DELETE CASCADE,
  provider_id       TEXT        NOT NULL,
  thread_id         TEXT,
  folder            TEXT        NOT NULL DEFAULT 'inbox',
  labels            TEXT[]      NOT NULL DEFAULT '{}',
  from_address      TEXT        NOT NULL,
  from_name         TEXT        NOT NULL DEFAULT '',
  to_addresses      JSONB       NOT NULL DEFAULT '[]',
  cc_addresses      JSONB       NOT NULL DEFAULT '[]',
  subject           TEXT        NOT NULL DEFAULT '(no subject)',
  body_text         TEXT        NOT NULL DEFAULT '',
  snippet           TEXT        NOT NULL DEFAULT '',
  is_read           BOOLEAN     NOT NULL DEFAULT false,
  is_starred        BOOLEAN     NOT NULL DEFAULT false,
  has_attachments   BOOLEAN     NOT NULL DEFAULT false,
  attachments_meta  JSONB       NOT NULL DEFAULT '[]',
  provider_date     TIMESTAMPTZ NOT NULL,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. RLS on nexus_emails
ALTER TABLE public.nexus_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_emails FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users read own emails"
  ON public.nexus_emails
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Service role writes emails"
  ON public.nexus_emails
  FOR ALL
  USING (auth.role() = 'service_role');

-- 6. Indexes
-- Dedup: one provider message per account
CREATE UNIQUE INDEX nexus_emails_account_provider_id_idx
  ON public.nexus_emails (account_id, provider_id);

-- List queries: user's emails in a folder, newest first
CREATE INDEX nexus_emails_user_folder_date_idx
  ON public.nexus_emails (user_id, folder, provider_date DESC);

-- Full-text search across subject, body, and snippet
CREATE INDEX nexus_emails_fts_idx
  ON public.nexus_emails
  USING GIN (
    to_tsvector(
      'english',
      coalesce(subject, '') || ' ' || coalesce(body_text, '') || ' ' || coalesce(snippet, '')
    )
  );

-- 7. Enable Realtime for nexus_emails
ALTER PUBLICATION supabase_realtime ADD TABLE public.nexus_emails;

COMMIT;
