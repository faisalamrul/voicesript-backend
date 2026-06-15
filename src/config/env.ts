import dotenv from 'dotenv';

dotenv.config();

const isProd = process.env['NODE_ENV'] === 'production';

function requireSecret(key: string, fallback: string): string {
  const val = process.env[key];
  if (!val && isProd) {
    throw new Error(`Missing required env var in production: ${key}`);
  }
  return val ?? fallback;
}

export const env = {
  NODE_ENV: process.env['NODE_ENV'] ?? 'development',
  PORT: parseInt(process.env['PORT'] ?? '3000', 10),
  CORS_ORIGIN: process.env['CORS_ORIGIN'] ?? 'http://localhost:3001',
  db: {
    host: process.env['DB_HOST'] ?? 'localhost',
    port: parseInt(process.env['DB_PORT'] ?? '5432', 10),
    name: process.env['DB_NAME'] ?? 'voicescript_db',
    user: process.env['DB_USER'] ?? 'postgres',
    password: process.env['DB_PASSWORD'] ?? 'postgres',
    poolMin: parseInt(process.env['DB_POOL_MIN'] ?? '2', 10),
    poolMax: parseInt(process.env['DB_POOL_MAX'] ?? '10', 10),
  },
  jwt: {
    accessSecret: requireSecret('JWT_ACCESS_SECRET', 'change-me-access-secret'),
    refreshSecret: requireSecret('JWT_REFRESH_SECRET', 'change-me-refresh-secret'),
    accessExpiresIn: '15m',
    refreshExpiresIn: '7d',
    refreshExpiresInMs: 7 * 24 * 60 * 60 * 1000,
    maxActiveDevices: parseInt(process.env['MAX_ACTIVE_DEVICES'] ?? '5', 10),
  },
} as const;
