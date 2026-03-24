-- Update the status constraint to include job application statuses.
ALTER TABLE media DROP CONSTRAINT media_status_check;
ALTER TABLE media
  ADD CONSTRAINT media_status_check
  CHECK (status IN (
    'To Read', 'Reading', 'Finished',
    'To Watch', 'Watching',
    'Not Answered', 'Answered', 'Rejected', 'Got the Job'
  ));
