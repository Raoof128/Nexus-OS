-- Apply after replaying the Nexus migrations on the standalone database.
DROP PUBLICATION supabase_realtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON
    public.media, public.chat_sessions, public.chat_messages,
    public.nexus_task_lists, public.nexus_tasks,
    public.nexus_notes, public.nexus_note_items, public.nexus_note_labels,
    public.nexus_note_label_links, public.email_accounts TO authenticated;
GRANT SELECT ON public.email_accounts_safe, public.nexus_emails TO authenticated;
GRANT SELECT, UPDATE ON public.email_accounts TO nexus_mail;
GRANT SELECT, INSERT, UPDATE ON public.nexus_emails TO nexus_mail;
CREATE POLICY "Mail poller reads accounts" ON public.email_accounts
    FOR SELECT TO nexus_mail USING (true);
CREATE POLICY "Mail poller updates accounts" ON public.email_accounts
    FOR UPDATE TO nexus_mail USING (true) WITH CHECK (true);
