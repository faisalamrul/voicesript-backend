CREATE TABLE IF NOT EXISTS job_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  from_status VARCHAR(20),
  to_status   VARCHAR(20) NOT NULL,
  changed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_status_history_job_id ON job_status_history(job_id);
