import { Pool, PoolClient } from 'pg';
import { pool } from '../config/database';
import { Job, JobStatus } from '../models/job.model';

type Queryable = Pool | PoolClient;

export interface JobFilters {
  status?: JobStatus;
  reporter_id?: string;
  editor_id?: string;
  search?: string;
  city?: string;
  location?: string;
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

export async function findByIdWithNames(id: string): Promise<Job | null> {
  const { rows } = await pool.query<Job>(
    `SELECT j.*, r.name AS reporter_name, e.name AS editor_name
     FROM jobs j
     LEFT JOIN users r ON r.id = j.reporter_id
     LEFT JOIN users e ON e.id = j.editor_id
     WHERE j.id = $1 LIMIT 1`,
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
    `UPDATE jobs SET reporter_id = $2, status = 'ASSIGNED', reporter_assigned_at = NOW() WHERE id = $1 RETURNING *`,
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
    `UPDATE jobs SET editor_id = $2, editor_assigned_at = NOW() WHERE id = $1 RETURNING *`,
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
    `UPDATE jobs SET status = 'COMPLETED', reporter_payment = $2, editor_payment = $3, completed_at = NOW() WHERE id = $1 RETURNING *`,
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
    conditions.push(`j.status = $${values.length}`);
  }
  if (filters?.reporter_id !== undefined) {
    values.push(filters.reporter_id);
    conditions.push(`j.reporter_id = $${values.length}`);
  }
  if (filters?.editor_id !== undefined) {
    values.push(filters.editor_id);
    conditions.push(`j.editor_id = $${values.length}`);
  }
  if (filters?.search !== undefined && filters.search.trim() !== '') {
    values.push(`%${filters.search.trim()}%`);
    conditions.push(`j.case_name ILIKE $${values.length}`);
  }
  if (filters?.city !== undefined && filters.city.trim() !== '') {
    values.push(`%${filters.city.trim()}%`);
    conditions.push(`j.city ILIKE $${values.length}`);
  }
  if (filters?.location !== undefined) {
    values.push(filters.location);
    conditions.push(`j.location = $${values.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 10;
  const offset = (page - 1) * limit;

  values.push(limit);
  values.push(offset);

  const { rows } = await pool.query<Job & { _row_total: string }>(
    `SELECT j.*, r.name AS reporter_name, e.name AS editor_name,
            COUNT(*) OVER() AS _row_total
     FROM jobs j
     LEFT JOIN users r ON r.id = j.reporter_id
     LEFT JOIN users e ON e.id = j.editor_id
     ${where}
     ORDER BY j.created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );

  const total = rows.length > 0 ? parseInt(rows[0]!._row_total, 10) : 0;
  const jobs = rows.map(({ _row_total: _rt, ...job }) => job as Job);

  return { jobs, total };
}

export interface JobSummary {
  total: number;
  by_status: Record<string, number>;
  in_progress: number;
  total_reporter_payment: number;
  total_editor_payment: number;
  total_payment: number;
}

export async function getSummary(): Promise<JobSummary> {
  const { rows } = await pool.query<{
    status: string;
    count: string;
    reporter_payment: string;
    editor_payment: string;
  }>(
    `SELECT status,
            COUNT(*)                        AS count,
            COALESCE(SUM(reporter_payment), 0) AS reporter_payment,
            COALESCE(SUM(editor_payment),   0) AS editor_payment
     FROM jobs
     GROUP BY status`
  );

  const by_status: Record<string, number> = {};
  let total = 0;
  let total_reporter_payment = 0;
  let total_editor_payment = 0;

  for (const row of rows) {
    const count = parseInt(row.count, 10);
    by_status[row.status] = count;
    total += count;
    total_reporter_payment += parseInt(row.reporter_payment, 10);
    total_editor_payment += parseInt(row.editor_payment, 10);
  }

  const IN_PROGRESS_STATUSES = ['ASSIGNED', 'TRANSCRIBED', 'REVIEWED'];
  const in_progress = IN_PROGRESS_STATUSES.reduce((sum, s) => sum + (by_status[s] ?? 0), 0);

  return {
    total,
    by_status,
    in_progress,
    total_reporter_payment,
    total_editor_payment,
    total_payment: total_reporter_payment + total_editor_payment,
  };
}
