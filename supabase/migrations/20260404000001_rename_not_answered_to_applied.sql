-- Rename "Not Answered" status to "Applied" for job tracking.
-- First update any existing rows.
UPDATE media SET status = 'Applied' WHERE status = 'Not Answered';

-- Then replace the constraint.
ALTER TABLE media DROP CONSTRAINT media_status_check;
ALTER TABLE media
  ADD CONSTRAINT media_status_check
  CHECK (status IN (
    'To Read', 'Reading', 'Finished',
    'To Watch', 'Watching',
    'Applied', 'Answered', 'Rejected', 'Got the Job'
  ));
