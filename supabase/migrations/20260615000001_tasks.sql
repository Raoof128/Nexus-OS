BEGIN;

CREATE TABLE public.task_lists (
  id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name       TEXT NOT NULL,
  position   DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.tasks (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  list_id         UUID NOT NULL REFERENCES public.task_lists ON DELETE CASCADE,
  parent_id       UUID REFERENCES public.tasks ON DELETE CASCADE,
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
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_lists FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own task lists"
  ON public.task_lists FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users manage own tasks"
  ON public.tasks FOR ALL USING (user_id = auth.uid());

CREATE INDEX task_lists_user_position_idx ON public.task_lists (user_id, position);
CREATE INDEX tasks_user_list_position_idx ON public.tasks (user_id, list_id, position);
CREATE INDEX tasks_user_parent_idx ON public.tasks (user_id, parent_id);
CREATE INDEX tasks_user_starred_idx ON public.tasks (user_id, starred) WHERE starred;

COMMIT;
