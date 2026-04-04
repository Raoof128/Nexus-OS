-- Remove "Answered" status from job tracking.
-- Move any existing "Answered" rows to "Applied".
UPDATE media SET status = 'Applied' WHERE status = 'Answered' AND type = 'job';

-- Replace the constraint without "Answered".
ALTER TABLE media DROP CONSTRAINT media_status_check;
ALTER TABLE media
  ADD CONSTRAINT media_status_check
  CHECK (status IN (
    'To Read', 'Reading', 'Finished',
    'To Watch', 'Watching',
    'Applied', 'Rejected', 'Got the Job'
  ));
