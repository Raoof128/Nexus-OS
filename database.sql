CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Create the media type enum
CREATE TYPE media_type AS ENUM ('book', 'movie', 'anime');

-- 2. Create the unified media table
CREATE TABLE media (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
  type media_type NOT NULL DEFAULT 'book',
  title TEXT NOT NULL,
  creator TEXT,
  genre TEXT,
  status VARCHAR(20) DEFAULT 'To Read',
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  takeaway TEXT,
  sub_info TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE media
  ADD CONSTRAINT media_status_check
  CHECK (status IN ('To Read', 'Reading', 'Finished', 'To Watch', 'Watching'));

CREATE INDEX idx_media_user_type_created ON media (user_id, type, created_at DESC);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE media ENABLE ROW LEVEL SECURITY;
ALTER TABLE media FORCE ROW LEVEL SECURITY;

-- 4. Create absolute CRUD policies
CREATE POLICY "Users can manage their own media"
  ON media
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
