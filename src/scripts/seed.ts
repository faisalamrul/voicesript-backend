import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env['DB_HOST'] || 'localhost',
  port: parseInt(process.env['DB_PORT'] || '5432'),
  user: process.env['DB_USER'] || 'postgres',
  password: process.env['DB_PASSWORD'] || 'postgres',
};
const dbName = process.env['DB_NAME'] || 'voicescript_db';

async function ensureDatabase() {
  const adminPool = new Pool({ ...dbConfig, database: 'postgres' });
  try {
    const { rows } = await adminPool.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );
    if (rows.length === 0) {
      await adminPool.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Database "${dbName}" created`);
    } else {
      console.log(`Database "${dbName}" already exists`);
    }
  } finally {
    await adminPool.end();
  }
}

async function seed() {
  await ensureDatabase();

  const pool = new Pool({ ...dbConfig, database: dbName });
  try {
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
    await pool.query('CREATE SCHEMA public');
    console.log('Schema reset\n');

    const migrationsDir = path.resolve(__dirname, '../migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      await pool.query(sql);
      console.log(`  ✓ ${file}`);
    }

    console.log('\nSeed complete!');
  } finally {
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
