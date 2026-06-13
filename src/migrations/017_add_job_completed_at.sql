ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

UPDATE jobs
SET completed_at = reviewed_at
WHERE status = 'COMPLETED'
  AND completed_at IS NULL
  AND reviewed_at IS NOT NULL;
