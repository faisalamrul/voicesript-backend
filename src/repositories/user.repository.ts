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

export async function createUser(params: {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
}): Promise<UserPublic> {
  const { rows } = await pool.query<UserPublic>(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, role`,
    [params.name, params.email, params.passwordHash, params.role]
  );
  return rows[0]!;
}
