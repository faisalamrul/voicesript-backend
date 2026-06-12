CREATE TYPE job_status AS ENUM ('NEW', 'ASSIGNED', 'TRANSCRIBED', 'REVIEWED', 'COMPLETED');
CREATE TYPE job_location AS ENUM ('physical', 'remote');

CREATE TABLE IF NOT EXISTS jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_name         VARCHAR(255) NOT NULL,
  duration          INTEGER NOT NULL CHECK (duration >= 1),
  location          job_location NOT NULL,
  city              VARCHAR(255),
  status            job_status NOT NULL DEFAULT 'NEW',
  reporter_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  editor_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  transcript_notes  TEXT,
  review_notes      TEXT,
  submitted_at      TIMESTAMPTZ,
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status      ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_reporter_id ON jobs(reporter_id);
CREATE INDEX IF NOT EXISTS idx_jobs_editor_id   ON jobs(editor_id);
