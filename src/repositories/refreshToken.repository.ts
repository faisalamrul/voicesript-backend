import { Pool, PoolClient } from 'pg';
import { pool } from '../config/database';

type Queryable = Pool | PoolClient;

interface RefreshTokenRow {
  id: string;
  user_id: string;
  expires_at: Date;
}

export async function createRefreshToken(params: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}, db: Queryable = pool): Promise<void> {
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [params.userId, params.tokenHash, params.expiresAt]
  );
}

export async function findRefreshTokenByHash(hash: string): Promise<RefreshTokenRow | null> {
  const { rows } = await pool.query<RefreshTokenRow>(
    'SELECT id, user_id, expires_at FROM refresh_tokens WHERE token_hash = $1 LIMIT 1',
    [hash]
  );
  return rows[0] ?? null;
}

export async function deleteRefreshTokenByHash(hash: string, db: Queryable = pool): Promise<void> {
  await db.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [hash]);
}

export async function countRefreshTokensByUserId(userId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    'SELECT COUNT(*) as count FROM refresh_tokens WHERE user_id = $1',
    [userId]
  );
  return parseInt(rows[0]?.count ?? '0', 10);
}

export async function deleteOldestRefreshTokenByUserId(userId: string): Promise<void> {
  await pool.query(
    `DELETE FROM refresh_tokens
     WHERE id = (
       SELECT id FROM refresh_tokens
       WHERE user_id = $1
       ORDER BY created_at ASC
       LIMIT 1
     )`,
    [userId]
  );
}
