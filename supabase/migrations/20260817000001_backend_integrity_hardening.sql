BEGIN;

-- Fail instead of waiting indefinitely behind live traffic. This migration
-- adds unique constraints and validates foreign keys, so schedule a maintenance
-- window and retry if either timeout is reached.
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '15min';

-- ---------------------------------------------------------------------------
-- Notes: make a label link structurally belong to one user.
-- ---------------------------------------------------------------------------

ALTER TABLE public.nexus_note_label_links
  ADD COLUMN user_id UUID;

-- The note is the authoritative owner for existing links. Any historical link
-- whose label has a different owner is an invalid cross-tenant association; it
-- is removed without deleting either the note or the label.
UPDATE public.nexus_note_label_links AS link
SET user_id = note.user_id
FROM public.nexus_notes AS note
WHERE note.id = link.note_id;

DELETE FROM public.nexus_note_label_links AS link
WHERE NOT EXISTS (
  SELECT 1
  FROM public.nexus_note_labels AS label
  WHERE label.id = link.label_id
    AND label.user_id = link.user_id
);

ALTER TABLE public.nexus_note_label_links
  ALTER COLUMN user_id SET DEFAULT auth.uid(),
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.nexus_note_labels
  ADD CONSTRAINT nexus_note_labels_user_id_id_key UNIQUE (user_id, id);

ALTER TABLE public.nexus_note_label_links
  ADD CONSTRAINT nexus_note_label_links_note_same_owner_fkey
    FOREIGN KEY (user_id, note_id)
    REFERENCES public.nexus_notes (user_id, id)
    ON DELETE CASCADE
    NOT VALID,
  ADD CONSTRAINT nexus_note_label_links_label_same_owner_fkey
    FOREIGN KEY (user_id, label_id)
    REFERENCES public.nexus_note_labels (user_id, id)
    ON DELETE CASCADE
    NOT VALID;

ALTER TABLE public.nexus_note_label_links
  VALIDATE CONSTRAINT nexus_note_label_links_note_same_owner_fkey;
ALTER TABLE public.nexus_note_label_links
  VALIDATE CONSTRAINT nexus_note_label_links_label_same_owner_fkey;

ALTER TABLE public.nexus_note_label_links
  DROP CONSTRAINT nexus_note_label_links_note_id_fkey,
  DROP CONSTRAINT nexus_note_label_links_label_id_fkey;

DROP POLICY "Users manage own note label links"
  ON public.nexus_note_label_links;
CREATE POLICY "Users manage own note label links"
  ON public.nexus_note_label_links
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Task/note hierarchies: the parent must live in the same logical container.
-- Invalid historical relationships are safely outdented instead of deleting
-- user content.
-- ---------------------------------------------------------------------------

UPDATE public.nexus_tasks AS child
SET parent_id = NULL
WHERE child.parent_id IS NOT NULL
  AND (
    child.parent_id = child.id
    OR NOT EXISTS (
      SELECT 1
      FROM public.nexus_tasks AS parent
      WHERE parent.id = child.parent_id
        AND parent.user_id = child.user_id
        AND parent.list_id = child.list_id
    )
  );

ALTER TABLE public.nexus_tasks
  ADD CONSTRAINT nexus_tasks_user_list_id_key UNIQUE (user_id, list_id, id),
  ADD CONSTRAINT nexus_tasks_parent_same_list_fkey
    FOREIGN KEY (user_id, list_id, parent_id)
    REFERENCES public.nexus_tasks (user_id, list_id, id)
    ON DELETE CASCADE
    NOT VALID,
  ADD CONSTRAINT nexus_tasks_not_self_parent_check
    CHECK (parent_id IS NULL OR parent_id <> id)
    NOT VALID;

ALTER TABLE public.nexus_tasks
  VALIDATE CONSTRAINT nexus_tasks_parent_same_list_fkey;
ALTER TABLE public.nexus_tasks
  VALIDATE CONSTRAINT nexus_tasks_not_self_parent_check;

ALTER TABLE public.nexus_tasks
  DROP CONSTRAINT nexus_tasks_parent_same_owner_fkey;

CREATE INDEX nexus_tasks_user_list_parent_idx
  ON public.nexus_tasks (user_id, list_id, parent_id);

UPDATE public.nexus_note_items AS child
SET parent_id = NULL
WHERE child.parent_id IS NOT NULL
  AND (
    child.parent_id = child.id
    OR NOT EXISTS (
      SELECT 1
      FROM public.nexus_note_items AS parent
      WHERE parent.id = child.parent_id
        AND parent.user_id = child.user_id
        AND parent.note_id = child.note_id
    )
  );

ALTER TABLE public.nexus_note_items
  ADD CONSTRAINT nexus_note_items_user_note_id_key UNIQUE (user_id, note_id, id),
  ADD CONSTRAINT nexus_note_items_parent_same_note_fkey
    FOREIGN KEY (user_id, note_id, parent_id)
    REFERENCES public.nexus_note_items (user_id, note_id, id)
    ON DELETE CASCADE
    NOT VALID,
  ADD CONSTRAINT nexus_note_items_not_self_parent_check
    CHECK (parent_id IS NULL OR parent_id <> id)
    NOT VALID;

ALTER TABLE public.nexus_note_items
  VALIDATE CONSTRAINT nexus_note_items_parent_same_note_fkey;
ALTER TABLE public.nexus_note_items
  VALIDATE CONSTRAINT nexus_note_items_not_self_parent_check;

ALTER TABLE public.nexus_note_items
  DROP CONSTRAINT nexus_note_items_parent_same_owner_fkey;

CREATE INDEX nexus_note_items_user_note_parent_idx
  ON public.nexus_note_items (user_id, note_id, parent_id);

-- ---------------------------------------------------------------------------
-- Email: reconcile the April schema with the names and states used by the
-- OAuth callback, poller, and controller.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_accounts'
      AND column_name = 'encrypted_access_token'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_accounts'
      AND column_name = 'access_token_enc'
  ) THEN
    RAISE EXCEPTION
      'email_accounts has both old and new access-token columns; manual merge required';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_accounts'
      AND column_name = 'encrypted_access_token'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_accounts'
      AND column_name = 'access_token_enc'
  ) THEN
    ALTER TABLE public.email_accounts
      RENAME COLUMN encrypted_access_token TO access_token_enc;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_accounts'
      AND column_name = 'access_token_enc'
  ) THEN
    RAISE EXCEPTION 'email_accounts access-token column is missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_accounts'
      AND column_name = 'encrypted_refresh_token'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_accounts'
      AND column_name = 'refresh_token_enc'
  ) THEN
    RAISE EXCEPTION
      'email_accounts has both old and new refresh-token columns; manual merge required';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_accounts'
      AND column_name = 'encrypted_refresh_token'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_accounts'
      AND column_name = 'refresh_token_enc'
  ) THEN
    ALTER TABLE public.email_accounts
      RENAME COLUMN encrypted_refresh_token TO refresh_token_enc;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_accounts'
      AND column_name = 'refresh_token_enc'
  ) THEN
    RAISE EXCEPTION 'email_accounts refresh-token column is missing';
  END IF;
END
$$;

ALTER TABLE public.email_accounts
  DROP CONSTRAINT IF EXISTS email_accounts_status_check;
UPDATE public.email_accounts
SET status = 'active'
WHERE status = 'connected';
ALTER TABLE public.email_accounts
  ALTER COLUMN status SET DEFAULT 'active',
  ADD CONSTRAINT email_accounts_status_check
    CHECK (status IN ('active', 'disconnected'));

ALTER TABLE public.email_accounts
  ADD CONSTRAINT email_accounts_user_id_id_key UNIQUE (user_id, id);

-- The connected account is authoritative for cached-email ownership. Repairing
-- the denormalized user_id preserves the message under the account that owns it.
UPDATE public.nexus_emails AS message
SET user_id = account.user_id
FROM public.email_accounts AS account
WHERE account.id = message.account_id
  AND message.user_id <> account.user_id;

ALTER TABLE public.nexus_emails
  ADD CONSTRAINT nexus_emails_account_same_owner_fkey
    FOREIGN KEY (user_id, account_id)
    REFERENCES public.email_accounts (user_id, id)
    ON DELETE CASCADE
    NOT VALID;
ALTER TABLE public.nexus_emails
  VALIDATE CONSTRAINT nexus_emails_account_same_owner_fkey;
ALTER TABLE public.nexus_emails
  DROP CONSTRAINT nexus_emails_account_id_fkey;

CREATE TABLE public.email_drafts (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  account_id  UUID        NOT NULL,
  "to"        TEXT[]      NOT NULL DEFAULT '{}',
  cc          TEXT[]      NOT NULL DEFAULT '{}',
  bcc         TEXT[]      NOT NULL DEFAULT '{}',
  subject     TEXT        NOT NULL DEFAULT '',
  body_html   TEXT        NOT NULL DEFAULT '',
  in_reply_to TEXT,
  thread_id   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT email_drafts_account_same_owner_fkey
    FOREIGN KEY (user_id, account_id)
    REFERENCES public.email_accounts (user_id, id)
    ON DELETE CASCADE
);

ALTER TABLE public.email_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_drafts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_drafts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.email_drafts TO authenticated;
CREATE POLICY "Users manage own email drafts"
  ON public.email_drafts
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE INDEX email_drafts_user_updated_idx
  ON public.email_drafts (user_id, updated_at DESC);

-- User-facing handlers update only these provider-cache state fields. Revoke
-- broad UPDATE first so the policy cannot become a mass-assignment path.
REVOKE UPDATE ON public.nexus_emails FROM anon, authenticated;
GRANT UPDATE (folder, labels, is_read, is_starred)
  ON public.nexus_emails TO authenticated;
CREATE POLICY "Users update own email cache state"
  ON public.nexus_emails
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Tasks recurrence: one row-locked transaction performs the completion and
-- successor insert. The source marker makes retries idempotent.
-- ---------------------------------------------------------------------------

ALTER TABLE public.nexus_tasks
  ADD COLUMN generated_from_task_id UUID,
  ADD CONSTRAINT nexus_tasks_generated_source_key
    UNIQUE (user_id, generated_from_task_id),
  ADD CONSTRAINT nexus_tasks_generated_source_same_owner_fkey
    FOREIGN KEY (user_id, generated_from_task_id)
    REFERENCES public.nexus_tasks (user_id, id)
    ON DELETE SET NULL (generated_from_task_id)
    NOT VALID,
  ADD CONSTRAINT nexus_tasks_not_self_generated_check
    CHECK (generated_from_task_id IS NULL OR generated_from_task_id <> id)
    NOT VALID;

ALTER TABLE public.nexus_tasks
  VALIDATE CONSTRAINT nexus_tasks_generated_source_same_owner_fkey;
ALTER TABLE public.nexus_tasks
  VALIDATE CONSTRAINT nexus_tasks_not_self_generated_check;

CREATE OR REPLACE FUNCTION public.complete_recurring_task(
  p_task_id UUID,
  p_patch JSONB,
  p_next_due DATE,
  p_next_due_at TIMESTAMPTZ,
  p_next_due_timezone TEXT,
  p_next_recurrence TEXT,
  p_expected_due DATE,
  p_expected_due_at TIMESTAMPTZ,
  p_expected_due_timezone TEXT,
  p_expected_recurrence TEXT
)
RETURNS SETOF public.nexus_tasks
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  current_task public.nexus_tasks%ROWTYPE;
  updated_task public.nexus_tasks%ROWTYPE;
  unknown_patch_keys TEXT[];
  successor_position DOUBLE PRECISION;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT task.*
  INTO current_task
  FROM public.nexus_tasks AS task
  WHERE task.id = p_task_id
    AND task.user_id = current_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found' USING ERRCODE = 'P0002';
  END IF;

  -- A racing retry observes the winner's committed row after the lock wait and
  -- returns it without inserting another occurrence.
  IF current_task.status = 'completed' THEN
    RETURN NEXT current_task;
    RETURN;
  END IF;

  IF current_task.recurrence IS NULL
     OR COALESCE(p_patch ->> 'status', '') <> 'completed' THEN
    RAISE EXCEPTION 'Task is not an active recurring completion'
      USING ERRCODE = '22023';
  END IF;

  -- Recurrence math stays in Python, but the transaction rejects a stale
  -- calculation if another request rescheduled the task before this row lock.
  IF current_task.due IS DISTINCT FROM p_expected_due
     OR current_task.due_at IS DISTINCT FROM p_expected_due_at
     OR current_task.due_timezone IS DISTINCT FROM p_expected_due_timezone
     OR current_task.recurrence IS DISTINCT FROM p_expected_recurrence THEN
    RAISE EXCEPTION 'Task schedule changed during completion; retry required'
      USING ERRCODE = '40001';
  END IF;

  SELECT array_agg(key_name)
  INTO unknown_patch_keys
  FROM jsonb_object_keys(COALESCE(p_patch, '{}'::JSONB)) AS keys(key_name)
  WHERE key_name <> ALL (ARRAY[
    'title', 'notes_encrypted', 'due', 'due_at', 'due_timezone',
    'all_day', 'starred', 'recurrence', 'status', 'completed_at'
  ]);

  IF unknown_patch_keys IS NOT NULL THEN
    RAISE EXCEPTION 'Unsupported task patch keys: %', unknown_patch_keys
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.nexus_tasks AS task
  SET title = CASE
        WHEN p_patch ? 'title' THEN p_patch ->> 'title' ELSE task.title END,
      notes_encrypted = CASE
        WHEN p_patch ? 'notes_encrypted' THEN p_patch ->> 'notes_encrypted'
        ELSE task.notes_encrypted END,
      due = CASE
        WHEN p_patch ? 'due' THEN (p_patch ->> 'due')::DATE ELSE task.due END,
      due_at = CASE
        WHEN p_patch ? 'due_at' THEN (p_patch ->> 'due_at')::TIMESTAMPTZ
        ELSE task.due_at END,
      due_timezone = CASE
        WHEN p_patch ? 'due_timezone' THEN p_patch ->> 'due_timezone'
        ELSE task.due_timezone END,
      all_day = CASE
        WHEN p_patch ? 'all_day' THEN (p_patch ->> 'all_day')::BOOLEAN
        ELSE task.all_day END,
      starred = CASE
        WHEN p_patch ? 'starred' THEN (p_patch ->> 'starred')::BOOLEAN
        ELSE task.starred END,
      recurrence = CASE
        WHEN p_patch ? 'recurrence' THEN p_patch ->> 'recurrence'
        ELSE task.recurrence END,
      status = 'completed',
      completed_at = COALESCE(
        (p_patch ->> 'completed_at')::TIMESTAMPTZ,
        now()
      ),
      updated_at = now()
  WHERE task.id = p_task_id
    AND task.user_id = current_user_id
  RETURNING task.* INTO updated_task;

  SELECT COALESCE(max(task.position), 0) + 1
  INTO successor_position
  FROM public.nexus_tasks AS task
  WHERE task.user_id = current_user_id
    AND task.list_id = updated_task.list_id;

  INSERT INTO public.nexus_tasks (
    user_id,
    list_id,
    parent_id,
    title,
    notes_encrypted,
    status,
    due,
    due_at,
    due_timezone,
    all_day,
    starred,
    recurrence,
    position,
    generated_from_task_id
  ) VALUES (
    current_user_id,
    updated_task.list_id,
    updated_task.parent_id,
    updated_task.title,
    updated_task.notes_encrypted,
    'needsAction',
    p_next_due,
    p_next_due_at,
    p_next_due_timezone,
    updated_task.all_day,
    updated_task.starred,
    p_next_recurrence,
    successor_position,
    updated_task.id
  )
  ON CONFLICT (user_id, generated_from_task_id) DO NOTHING;

  RETURN NEXT updated_task;
END
$$;

REVOKE ALL ON FUNCTION public.complete_recurring_task(
  UUID, JSONB, DATE, TIMESTAMPTZ, TEXT, TEXT, DATE, TIMESTAMPTZ, TEXT, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_recurring_task(
  UUID, JSONB, DATE, TIMESTAMPTZ, TEXT, TEXT, DATE, TIMESTAMPTZ, TEXT, TEXT
) TO authenticated;

COMMIT;
