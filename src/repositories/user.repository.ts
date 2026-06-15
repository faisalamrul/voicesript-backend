import { pool } from '../config/database';
import { User, UserPublic } from '../models/user.model';
import { Role } from '../types';

const REPORTER_RATE = 2000;
const EDITOR_FLAT_FEE = 50000;

export async function findByEmail(email: string): Promise<User | null> {
  const { rows } = await pool.query<User>(
    'SELECT * FROM users WHERE email = $1 LIMIT 1',
    [email]
  );
  return rows[0] ?? null;
}

export async function findById(id: string): Promise<User | null> {
  const { rows } = await pool.query<User>(
    'SELECT * FROM users WHERE id = $1 LIMIT 1',
    [id]
  );
  return rows[0] ?? null;
}

export async function findPublicById(id: string): Promise<UserPublic | null> {
  const { rows } = await pool.query<UserPublic>(
    `SELECT id, name, email, role, city, created_at,
       EXISTS (
         SELECT 1 FROM jobs
         WHERE (reporter_id = u.id AND status = 'ASSIGNED')
            OR (editor_id = u.id AND status IN ('TRANSCRIBED', 'REVIEWED'))
       ) AS has_active_job
     FROM users u WHERE u.id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function findAll(
  filters?: { role?: Role; search?: string },
  pagination?: { page: number; limit: number }
): Promise<{ users: UserPublic[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters?.role !== undefined) {
    values.push(filters.role);
    conditions.push(`role = $${values.length}`);
  }

  if (filters?.search !== undefined && filters.search.trim() !== '') {
    const escaped = filters.search.trim().replace(/%/g, '\\%').replace(/_/g, '\\_');
    values.push(`%${escaped}%`);
    conditions.push(`(name ILIKE $${values.length} OR email ILIKE $${values.length})`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 10;
  const offset = (page - 1) * limit;

  values.push(limit);
  values.push(offset);

  const { rows } = await pool.query<UserPublic & { total_count: string }>(
    `SELECT u.id, u.name, u.email, u.role, u.city, u.created_at,
       COUNT(*) OVER() AS total_count,
       EXISTS (
         SELECT 1 FROM jobs
         WHERE (reporter_id = u.id AND status = 'ASSIGNED')
            OR (editor_id = u.id AND status IN ('TRANSCRIBED', 'REVIEWED'))
       ) AS has_active_job
     FROM users u ${where}
     ORDER BY u.created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );

  const total = rows.length > 0 ? parseInt(rows[0]!.total_count, 10) : 0;
  const users = rows.map(({ total_count: _tc, ...user }) => user as UserPublic);

  return { users, total };
}

export async function createUser(params: {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  city?: string | null;
}): Promise<UserPublic> {
  const { rows } = await pool.query<UserPublic>(
    `INSERT INTO users (name, email, password_hash, role, city)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, email, role, city, created_at`,
    [params.name, params.email, params.passwordHash, params.role, params.city ?? null]
  );
  const user = rows[0];
  if (!user) throw new Error('createUser: INSERT returned no row');
  return user;
}

export async function updateRole(id: string, role: Role): Promise<UserPublic> {
  const { rows } = await pool.query<UserPublic>(
    `UPDATE users SET role = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, name, email, role, city, created_at`,
    [role, id]
  );
  const user = rows[0];
  if (!user) throw new Error(`updateRole: no row returned for user id=${id}`);
  return user;
}

export async function deleteById(id: string): Promise<void> {
  await pool.query('DELETE FROM users WHERE id = $1', [id]);
}

export interface ReporterStats {
  total_jobs: number;
  jobs_completed: number;
  total_earned: number;
  pending_earnings: number;
}

export interface ReporterJob {
  id: string;
  case_name: string;
  status: string;
  duration: number;
  reporter_payment: number | null;
  assigned_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  completed_at: string | null;
}

export async function getReporterStats(id: string): Promise<ReporterStats> {
  const { rows } = await pool.query<{
    total_jobs: string;
    jobs_completed: string;
    total_earned: string;
    pending_earnings: string;
  }>(
    `SELECT
      COUNT(*)                                                              AS total_jobs,
      COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END)                     AS jobs_completed,
      COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN reporter_payment END), 0) AS total_earned,
      COALESCE(SUM(CASE WHEN status != 'COMPLETED' AND reporter_id IS NOT NULL THEN FLOOR(duration / 60.0) * ${REPORTER_RATE} END), 0) AS pending_earnings
     FROM jobs
     WHERE reporter_id = $1`,
    [id]
  );
  const raw = rows[0]!;
  return {
    total_jobs: parseInt(raw.total_jobs, 10),
    jobs_completed: parseInt(raw.jobs_completed, 10),
    total_earned: parseInt(raw.total_earned, 10),
    pending_earnings: parseInt(raw.pending_earnings, 10),
  };
}

export async function getReporterJobs(
  id: string,
  options: { search?: string; page?: number; limit?: number } = {}
): Promise<{ jobs: ReporterJob[]; total: number }> {
  const values: unknown[] = [id];
  const conditions: string[] = ['j.reporter_id = $1'];

  if (options.search?.trim()) {
    const escaped = options.search.trim().replace(/%/g, '\\%').replace(/_/g, '\\_');
    values.push(`%${escaped}%`);
    conditions.push(`j.case_name ILIKE $${values.length}`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const page = options.page ?? 1;
  const limit = options.limit ?? 10;
  const offset = (page - 1) * limit;
  values.push(limit);
  const limitIdx = values.length;
  values.push(offset);
  const offsetIdx = values.length;

  const { rows } = await pool.query<{
    id: string;
    case_name: string;
    status: string;
    duration: string;
    reporter_payment: string | null;
    assigned_at: string | null;
    submitted_at: string | null;
    reviewed_at: string | null;
    completed_at: string | null;
    _total: string;
  }>(
    `SELECT
      j.id, j.case_name, j.status, j.duration, j.reporter_payment,
      j.reporter_assigned_at AS assigned_at,
      j.submitted_at, j.reviewed_at, j.completed_at,
      COUNT(*) OVER() AS _total
     FROM jobs j
     ${where}
     ORDER BY j.reporter_assigned_at DESC NULLS LAST
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    values
  );

  const total = rows.length > 0 ? parseInt(rows[0]!._total, 10) : 0;
  const jobs = rows.map(({ _total: _t, ...row }) => ({
    id: row.id,
    case_name: row.case_name,
    status: row.status,
    duration: parseInt(row.duration, 10),
    reporter_payment: row.reporter_payment !== null ? parseInt(row.reporter_payment, 10) : null,
    assigned_at: row.assigned_at,
    submitted_at: row.submitted_at,
    reviewed_at: row.reviewed_at,
    completed_at: row.completed_at,
  }));

  return { jobs, total };
}

export interface EditorStats {
  total_jobs: number;
  jobs_completed: number;
  total_earned: number;
  pending_earnings: number;
}

export interface EditorJob {
  id: string;
  case_name: string;
  status: string;
  duration: number;
  editor_payment: number | null;
  assigned_at: string | null;
  reviewed_at: string | null;
  completed_at: string | null;
}

export async function getEditorStats(id: string): Promise<EditorStats> {
  const { rows } = await pool.query<{
    total_jobs: string;
    jobs_completed: string;
    total_earned: string;
    pending_earnings: string;
  }>(
    `SELECT
      COUNT(*)                                                                 AS total_jobs,
      COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END)                        AS jobs_completed,
      COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN editor_payment END), 0) AS total_earned,
      COUNT(CASE WHEN status != 'COMPLETED' THEN 1 END) * ${EDITOR_FLAT_FEE}  AS pending_earnings
     FROM jobs
     WHERE editor_id = $1`,
    [id]
  );
  const raw = rows[0]!;
  return {
    total_jobs: parseInt(raw.total_jobs, 10),
    jobs_completed: parseInt(raw.jobs_completed, 10),
    total_earned: parseInt(raw.total_earned, 10),
    pending_earnings: parseInt(raw.pending_earnings, 10),
  };
}

export async function getEditorJobs(
  id: string,
  options: { search?: string; page?: number; limit?: number } = {}
): Promise<{ jobs: EditorJob[]; total: number }> {
  const values: unknown[] = [id];
  const conditions: string[] = ['j.editor_id = $1'];

  if (options.search?.trim()) {
    const escaped = options.search.trim().replace(/%/g, '\\%').replace(/_/g, '\\_');
    values.push(`%${escaped}%`);
    conditions.push(`j.case_name ILIKE $${values.length}`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const page = options.page ?? 1;
  const limit = options.limit ?? 10;
  const offset = (page - 1) * limit;
  values.push(limit);
  const limitIdx = values.length;
  values.push(offset);
  const offsetIdx = values.length;

  const { rows } = await pool.query<{
    id: string;
    case_name: string;
    status: string;
    duration: string;
    editor_payment: string | null;
    assigned_at: string | null;
    reviewed_at: string | null;
    completed_at: string | null;
    _total: string;
  }>(
    `SELECT
      j.id, j.case_name, j.status, j.duration, j.editor_payment,
      j.editor_assigned_at AS assigned_at,
      j.reviewed_at, j.completed_at,
      COUNT(*) OVER() AS _total
     FROM jobs j
     ${where}
     ORDER BY j.editor_assigned_at DESC NULLS LAST
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    values
  );

  const total = rows.length > 0 ? parseInt(rows[0]!._total, 10) : 0;
  const jobs = rows.map(({ _total: _t, ...row }) => ({
    id: row.id,
    case_name: row.case_name,
    status: row.status,
    duration: parseInt(row.duration, 10),
    editor_payment: row.editor_payment !== null ? parseInt(row.editor_payment, 10) : null,
    assigned_at: row.assigned_at,
    reviewed_at: row.reviewed_at,
    completed_at: row.completed_at,
  }));

  return { jobs, total };
}
