import { Pool, PoolClient } from 'pg';
import { pool } from '../config/database';
import { Job, JobStatus } from '../models/job.model';

type Queryable = Pool | PoolClient;

export interface JobFilters {
  status?: JobStatus;
  reporter_id?: string;
  editor_id?: string;
}

export interface JobPage {
  jobs: Job[];
  total: number;
}

export async function createJob(params: {
  caseName: string;
  duration: number;
  location: string;
  city: string;
}, db: Queryable = pool): Promise<Job> {
  const { rows } = await db.query<Job>(
    `INSERT INTO jobs (case_name, duration, location, city)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [params.caseName, params.duration, params.location, params.city]
  );
  return rows[0]!;
}

export async function findById(id: string): Promise<Job | null> {
  const { rows } = await pool.query<Job>(
    'SELECT * FROM jobs WHERE id = $1 LIMIT 1',
    [id]
  );
  return rows[0] ?? null;
}

export async function countActiveJobsByReporter(reporterId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM jobs WHERE reporter_id = $1 AND status = 'ASSIGNED'`,
    [reporterId]
  );
  return parseInt(rows[0]!.count, 10);
}

export async function countActiveJobsByEditor(editorId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM jobs WHERE editor_id = $1 AND status IN ('TRANSCRIBED', 'REVIEWED')`,
    [editorId]
  );
  return parseInt(rows[0]!.count, 10);
}

export async function assignReporter(id: string, reporterId: string, db: Queryable = pool): Promise<Job> {
  const { rows } = await db.query<Job>(
    `UPDATE jobs SET reporter_id = $2, status = 'ASSIGNED' WHERE id = $1 RETURNING *`,
    [id, reporterId]
  );
  const job = rows[0];
  if (!job) throw new Error(`assignReporter: no row returned for job id=${id}`);
  return job;
}

export async function submitTranscript(id: string, notes: string | null, db: Queryable = pool): Promise<Job> {
  const { rows } = await db.query<Job>(
    `UPDATE jobs SET status = 'TRANSCRIBED', transcript_notes = $2, submitted_at = NOW() WHERE id = $1 RETURNING *`,
    [id, notes]
  );
  const job = rows[0];
  if (!job) throw new Error(`submitTranscript: no row returned for job id=${id}`);
  return job;
}

export async function assignEditor(id: string, editorId: string, db: Queryable = pool): Promise<Job> {
  const { rows } = await db.query<Job>(
    `UPDATE jobs SET editor_id = $2 WHERE id = $1 RETURNING *`,
    [id, editorId]
  );
  const job = rows[0];
  if (!job) throw new Error(`assignEditor: no row returned for job id=${id}`);
  return job;
}

export async function markReviewed(id: string, notes: string | null, db: Queryable = pool): Promise<Job> {
  const { rows } = await db.query<Job>(
    `UPDATE jobs SET status = 'REVIEWED', review_notes = $2, reviewed_at = NOW() WHERE id = $1 RETURNING *`,
    [id, notes]
  );
  const job = rows[0];
  if (!job) throw new Error(`markReviewed: no row returned for job id=${id}`);
  return job;
}

export async function completeJob(
  id: string,
  reporterPayment: number,
  editorPayment: number,
  db: Queryable = pool
): Promise<Job> {
  const { rows } = await db.query<Job>(
    `UPDATE jobs SET status = 'COMPLETED', reporter_payment = $2, editor_payment = $3 WHERE id = $1 RETURNING *`,
    [id, reporterPayment, editorPayment]
  );
  const job = rows[0];
  if (!job) throw new Error(`completeJob: no row returned for job id=${id}`);
  return job;
}

export async function findAll(
  filters?: JobFilters,
  pagination?: { page: number; limit: number }
): Promise<JobPage> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters?.status !== undefined) {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  }
  if (filters?.reporter_id !== undefined) {
    values.push(filters.reporter_id);
    conditions.push(`reporter_id = $${values.length}`);
  }
  if (filters?.editor_id !== undefined) {
    values.push(filters.editor_id);
    conditions.push(`editor_id = $${values.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 10;
  const offset = (page - 1) * limit;

  values.push(limit);
  values.push(offset);

  const { rows } = await pool.query<Job & { _row_total: string }>(
    `SELECT *, COUNT(*) OVER() AS _row_total
     FROM jobs ${where}
     ORDER BY created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );

  const total = rows.length > 0 ? parseInt(rows[0]!._row_total, 10) : 0;
  const jobs = rows.map(({ _row_total: _rt, ...job }) => job as Job);

  return { jobs, total };
}
