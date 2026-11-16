BEGIN;

-- A recurring task can have one generated successor. This marker survives
-- deleting the predecessor, so it is intentionally not a foreign key.
ALTER TABLE public.nexus_tasks
  ADD COLUMN previous_occurrence_id UUID,
  ADD CONSTRAINT nexus_tasks_one_successor_per_occurrence
    UNIQUE (user_id, previous_occurrence_id);

COMMIT;
