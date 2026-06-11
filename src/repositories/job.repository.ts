import { pool } from '../config/database';
import { Job, JobStatus } from '../models/job.model';

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
}): Promise<Job> {
  const { rows } = await pool.query<Job>(
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

  const { rows } = await pool.query<Job & { total_count: string }>(
    `SELECT *, COUNT(*) OVER() AS total_count
     FROM jobs ${where}
     ORDER BY created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );

  const total = rows.length > 0 ? parseInt(rows[0]!.total_count, 10) : 0;
  const jobs = rows.map(({ total_count: _tc, ...job }) => job as Job);

  return { jobs, total };
}
