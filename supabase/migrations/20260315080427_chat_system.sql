BEGIN;

-- 1. Create the category enum
CREATE TYPE chat_category AS ENUM ('books', 'movies', 'anime', 'general');

-- 2. Chat sessions (categorized folders)
CREATE TABLE chat_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
    title TEXT NOT NULL,
    category chat_category DEFAULT 'general',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Chat messages (the dialogue)
CREATE TABLE chat_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES chat_sessions ON DELETE CASCADE NOT NULL,
    role VARCHAR(10) CHECK (role IN ('user', 'model')) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Indexes
CREATE INDEX idx_chat_sessions_user ON chat_sessions (user_id, created_at DESC);
CREATE INDEX idx_chat_messages_session ON chat_messages (session_id, created_at);

-- 5. Enable RLS
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages FORCE ROW LEVEL SECURITY;

-- 6. Policies
CREATE POLICY "Users manage own sessions"
  ON chat_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own messages via session"
  ON chat_messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM chat_sessions
      WHERE id = chat_messages.session_id AND user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_sessions
      WHERE id = chat_messages.session_id AND user_id = auth.uid()
    )
  );

COMMIT;
