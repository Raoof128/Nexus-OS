BEGIN;

-- Tables are namespaced `nexus_*` (matching nexus_tasks/nexus_emails) to avoid
-- colliding with any other tables in the project.
CREATE TABLE public.nexus_notes (
  id                UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title_encrypted   TEXT,
  content_encrypted TEXT,
  type              TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'list')),
  color             TEXT NOT NULL DEFAULT 'default',
  background        TEXT,
  pinned            BOOLEAN NOT NULL DEFAULT false,
  archived          BOOLEAN NOT NULL DEFAULT false,
  position          DOUBLE PRECISION NOT NULL DEFAULT 0,
  reminder_at       TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Composite key target so note_items can require a same-owner reference.
  CONSTRAINT nexus_notes_id_user_key UNIQUE (user_id, id)
);

CREATE TABLE public.nexus_note_labels (
  id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT nexus_note_labels_user_name_key UNIQUE (user_id, name)
);

CREATE TABLE public.nexus_note_label_links (
  note_id  UUID NOT NULL REFERENCES public.nexus_notes (id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES public.nexus_note_labels (id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, label_id)
);

CREATE TABLE public.nexus_note_items (
  id             UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  note_id        UUID NOT NULL,
  parent_id      UUID,
  text_encrypted TEXT,
  checked        BOOLEAN NOT NULL DEFAULT false,
  position       DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT nexus_note_items_id_user_key UNIQUE (user_id, id),

  -- Cross-tenant integrity: an item's note MUST belong to the same user. The
  -- composite FK makes referencing another user's note structurally impossible
  -- (RLS only guards row ownership, not the owner of referenced rows).
  CONSTRAINT nexus_note_items_note_same_owner_fkey
    FOREIGN KEY (user_id, note_id)
    REFERENCES public.nexus_notes (user_id, id) ON DELETE CASCADE,

  -- Same guarantee for sub-items. parent_id is nullable; with MATCH SIMPLE the
  -- FK is skipped when parent_id IS NULL and enforced otherwise.
  CONSTRAINT nexus_note_items_parent_same_owner_fkey
    FOREIGN KEY (user_id, parent_id)
    REFERENCES public.nexus_note_items (user_id, id) ON DELETE CASCADE
);

ALTER TABLE public.nexus_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_notes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_note_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_note_labels FORCE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_note_label_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_note_label_links FORCE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_note_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexus_note_items FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own notes"
  ON public.nexus_notes FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users manage own note labels"
  ON public.nexus_note_labels FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users manage own note items"
  ON public.nexus_note_items FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
-- Join table has no user_id: scope via parent-note ownership.
CREATE POLICY "Users manage own note label links"
  ON public.nexus_note_label_links FOR ALL
  USING (EXISTS (SELECT 1 FROM public.nexus_notes n
                 WHERE n.id = note_id AND n.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.nexus_notes n
                 WHERE n.id = note_id AND n.user_id = auth.uid()));

CREATE INDEX nexus_notes_user_state_idx
  ON public.nexus_notes (user_id, archived, deleted_at, position);
CREATE INDEX nexus_notes_user_pinned_idx
  ON public.nexus_notes (user_id, pinned) WHERE pinned;
CREATE INDEX nexus_note_label_links_label_idx
  ON public.nexus_note_label_links (label_id);
CREATE INDEX nexus_note_items_user_note_position_idx
  ON public.nexus_note_items (user_id, note_id, position);

COMMIT;
