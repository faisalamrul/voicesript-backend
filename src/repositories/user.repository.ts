import { pool } from '../config/database';
import { User, UserPublic } from '../models/user.model';
import { Role } from '../types';

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
    'SELECT id, name, email, role, city, created_at FROM users WHERE id = $1 LIMIT 1',
    [id]
  );
  return rows[0] ?? null;
}

export async function findAll(
  filters?: { role?: Role },
  pagination?: { page: number; limit: number }
): Promise<{ users: UserPublic[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters?.role !== undefined) {
    values.push(filters.role);
    conditions.push(`role = $${values.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 10;
  const offset = (page - 1) * limit;

  values.push(limit);
  values.push(offset);

  const { rows } = await pool.query<UserPublic & { total_count: string }>(
    `SELECT id, name, email, role, city, created_at, COUNT(*) OVER() AS total_count
     FROM users ${where}
     ORDER BY created_at DESC
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
