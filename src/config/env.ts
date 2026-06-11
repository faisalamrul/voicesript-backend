import dotenv from 'dotenv';

dotenv.config();

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
    accessSecret: process.env['JWT_ACCESS_SECRET'] ?? 'change-me-access-secret',
    refreshSecret: process.env['JWT_REFRESH_SECRET'] ?? 'change-me-refresh-secret',
    accessExpiresIn: '15m',
    refreshExpiresIn: '7d',
    maxActiveDevices: parseInt(process.env['MAX_ACTIVE_DEVICES'] ?? '5', 10),
  },
} as const;
