import { pool } from '../config/database';
import { JobStatusHistory } from '../models/jobStatusHistory.model';

export async function insert(params: {
  jobId: string;
  fromStatus: string | null;
  toStatus: string;
  changedBy: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO job_status_history (job_id, from_status, to_status, changed_by)
     VALUES ($1, $2, $3, $4)`,
    [params.jobId, params.fromStatus, params.toStatus, params.changedBy]
  );
}

export async function findByJobId(jobId: string): Promise<JobStatusHistory[]> {
  const result = await pool.query<JobStatusHistory>(
    `SELECT id, job_id, from_status, to_status, changed_by, changed_at
     FROM job_status_history
     WHERE job_id = $1
     ORDER BY changed_at ASC`,
    [jobId]
  );
  return result.rows;
}
