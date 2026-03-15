CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Create the books table
CREATE TABLE books (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  genre TEXT,
  status VARCHAR(20) DEFAULT 'To Read',
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  takeaway TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE books
  ADD CONSTRAINT books_status_check
  CHECK (status IN ('To Read', 'Reading', 'Finished'));

CREATE INDEX books_user_id_created_at_idx ON books (user_id, created_at DESC);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE books FORCE ROW LEVEL SECURITY;

-- 3. Create absolute CRUD policies
CREATE POLICY "Users can manage their own books"
  ON books
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
