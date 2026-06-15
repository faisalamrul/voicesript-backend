import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { pool } from '../config/database';
import { env } from '../config/env';

async function ensureDatabaseExists(): Promise<void> {
  const adminPool = new Pool({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: 'postgres',
    connectionTimeoutMillis: 5000,
  });

  try {
    const { rows } = await adminPool.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [env.db.name]
    );

    if (rows.length === 0) {
      await adminPool.query(`CREATE DATABASE "${env.db.name}"`);
      console.log(`  created database "${env.db.name}"`);
    } else {
      console.log(`  database "${env.db.name}" already exists`);
    }
  } finally {
    await adminPool.end();
  }
}

async function migrate(): Promise<void> {
  await ensureDatabaseExists();

  const migrationsDir = path.resolve(__dirname);
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const file of files) {
    const { rows } = await pool.query('SELECT 1 FROM migrations WHERE filename = $1', [file]);
    if (rows.length > 0) {
      console.log(`  skip  ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    await pool.query(sql);
    await pool.query('INSERT INTO migrations (filename) VALUES ($1)', [file]);
    console.log(`  apply ${file}`);
  }

  console.log('Migrations complete.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
