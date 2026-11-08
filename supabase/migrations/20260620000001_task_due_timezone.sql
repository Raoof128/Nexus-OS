BEGIN;

ALTER TABLE public.nexus_tasks
  ADD COLUMN due_timezone TEXT;

COMMIT;
