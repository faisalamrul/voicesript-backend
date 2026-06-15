-- Prevent a reporter from being assigned to more than one ASSIGNED job at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_jobs_reporter_assigned
  ON jobs (reporter_id)
  WHERE status = 'ASSIGNED';

-- Prevent an editor from being assigned to more than one active (TRANSCRIBED or REVIEWED) job at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_jobs_editor_active
  ON jobs (editor_id)
  WHERE status IN ('TRANSCRIBED', 'REVIEWED');
