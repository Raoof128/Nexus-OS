-- Add 'jobs' to the chat_category enum.
--
-- The backend ChatCategory literal ('books','movies','anime','jobs','general')
-- already allows "jobs" but the database enum was missing the value, causing
-- 502 errors whenever a user tried to create a Job chat session.
--
-- ALTER TYPE … ADD VALUE IF NOT EXISTS is non-transactional in Postgres and
-- therefore must run outside a transaction block.

ALTER TYPE chat_category ADD VALUE IF NOT EXISTS 'jobs' AFTER 'anime';
