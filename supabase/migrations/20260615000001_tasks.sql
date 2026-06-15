BEGIN;

-- Tables are namespaced `nexus_*` (matching nexus_emails) to avoid colliding
-- with any other `tasks` table in the project.
CREATE TABLE public.nexus_task_lists (
  id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name       TEXT NOT NULL,
  position   DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Composite key target so child rows can require a same-owner reference.
  CONSTRAINT nexus_task_lists_id_user_key UNIQUE (user_id, id)
);

CREATE TABLE public.nexus_tasks (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  list_id         UUID NOT NULL,
  parent_id       UUID,
  title           TEXT NOT NULL,
  notes_encrypted TEXT,
  status          TEXT NOT NULL DEFAULT 'needsAction'
                    CHECK (status IN ('needsAction', 'completed')),
  due             DATE,
  due_at          TIMESTAMPTZ,
  all_day         BOOLEAN NOT NULL DEFAULT true,
  starred         BOOLEAN NOT NULL DEFAULT false,
  recurrence      TEXT,
  position        DOUBLE PRECISION NOT NULL DEFAULT 0,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Composite key target so subtasks can require a same-owner parent.
  CONSTRAINT nexus_tasks_id_user_key UNIQUE (user_id, id),

  -- Cross-tenant integrity: a task's list MUST belong to the same user. The
  -- composite FK makes referencing another user's list structurally impossible,
  -- closing the IDOR that a plain `list_id -> nexus_task_lists(id)` FK would
  -- leave open (RLS only guards row ownership, not the owner of referenced rows).
  CONSTRAINT nexus_tasks_list_same_owner_fkey
    FOREIGN KEY (user_id, list_id)
    REFERENCES public.nexus_task_lists (user_id, id) ON DELETE CASCADE,

  -- Same guarantee for subtasks. parent_id is nullable; with MATCH SIMPLE the FK
  -- is skipped when parent_id IS NULL (top-level tasks), and enforced otherwise.
  CONSTRAINT nexus_tasks_parent_same_owner_fkey
    FOREIGN KEY (user_id, parent_id)
    REFERENCES public.nexus_tasks (user_id, id) ON DELETE CASCADE
);

ALTER TABLE public.nexus_task_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_task_lists FORCE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_tasks FORCE ROW LEVEL SECURITY;

-- Row ownership. Cross-tenant references are blocked structurally by the
-- composite FKs above; WITH CHECK mirrors USING so INSERT/UPDATE can't set a
-- foreign user_id either (defense in depth).
CREATE POLICY "Users manage own task lists"
  ON public.nexus_task_lists FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users manage own tasks"
  ON public.nexus_tasks FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX nexus_task_lists_user_position_idx
  ON public.nexus_task_lists (user_id, position);
CREATE INDEX nexus_tasks_user_list_position_idx
  ON public.nexus_tasks (user_id, list_id, position);
CREATE INDEX nexus_tasks_user_parent_idx
  ON public.nexus_tasks (user_id, parent_id);
CREATE INDEX nexus_tasks_user_starred_idx
  ON public.nexus_tasks (user_id, starred) WHERE starred;

COMMIT;
