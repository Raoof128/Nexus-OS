-- Add 'job' to the media_type ENUM for job application tracking.
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
ALTER TYPE media_type ADD VALUE IF NOT EXISTS 'job';
