ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS reporter_assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS editor_assigned_at   TIMESTAMPTZ;

-- backfill reporter_assigned_at dari job_status_history
UPDATE jobs j
SET reporter_assigned_at = h.changed_at
FROM job_status_history h
WHERE h.job_id = j.id
  AND h.to_status = 'ASSIGNED'
  AND j.reporter_assigned_at IS NULL;
