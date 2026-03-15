BEGIN;

-- 1. Create the media type enum
CREATE TYPE media_type AS ENUM ('book', 'movie', 'anime');

-- 2. Rename the table
ALTER TABLE books RENAME TO media;

-- 3. Add discriminator and flexible columns
ALTER TABLE media
  ADD COLUMN type media_type NOT NULL DEFAULT 'book',
  ADD COLUMN creator TEXT,
  ADD COLUMN sub_info TEXT;

-- 4. Migrate existing author data into creator
UPDATE media SET creator = author WHERE author IS NOT NULL;

-- 5. Drop the old author column
ALTER TABLE media DROP COLUMN author;

-- 6. Update status constraint for movie/anime statuses
ALTER TABLE media DROP CONSTRAINT books_status_check;
ALTER TABLE media
  ADD CONSTRAINT media_status_check
  CHECK (status IN ('To Read', 'Reading', 'Finished', 'To Watch', 'Watching'));

-- 7. Drop old RLS policy and recreate with correct name
DROP POLICY IF EXISTS "Users can manage their own books" ON media;
CREATE POLICY "Users can manage their own media"
  ON media
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 8. Drop old index and create composite index for type-filtered queries
DROP INDEX IF EXISTS books_user_id_created_at_idx;
CREATE INDEX idx_media_user_type_created ON media (user_id, type, created_at DESC);

COMMIT;
