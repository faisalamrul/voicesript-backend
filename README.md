# VoiceScript Backend

REST API for a court reporting management platform. Manages the workflow from job creation to completion, including user management, reporter/editor assignment, and real-time job status tracking.

## Tech Stack

| Component | Technology |
|---|---|
| Runtime | Node.js + TypeScript (strict mode) |
| Framework | Express 5 |
| Database | PostgreSQL 16 via `node-postgres` (no ORM) |
| Auth | JWT (Access Token 15m + Refresh Token 7d, HTTPOnly cookie) |
| API Docs | Swagger UI (OpenAPI 3.0) |
| Dev server | ts-node-dev (hot-reload) |
| Container | Docker + Docker Compose |

## Architecture

The app uses a strict **4-layer architecture**:

```
routes → controllers → services → repositories
```

- **routes** — wire HTTP method + path; all routes are registered in `src/routes/index.ts` under `/api/v1`
- **controllers** — parse request, call service, return response via helpers (`sendSuccess`, `sendError`, `sendCreated`)
- **services** — business logic only; no `req`/`res` allowed here
- **repositories** — all SQL via `pool` from `src/config/database.ts`; return plain objects

Key conventions:
- Errors: throw `AppError` anywhere in the stack, caught by the `errorHandler` middleware
- Response shape is always `{ success, data?, message?, errors? }` (`ApiResponse<T>`)
- Env vars are centralized and typed in `src/config/env.ts`

## Directory Structure

```
src/
├── config/         # database, env, swagger
├── controllers/    # auth, admin, job
├── middlewares/    # authenticate, authorize, errorHandler, requestLogger
├── migrations/     # numbered SQL files (001-016)
├── models/         # TypeScript interfaces
├── repositories/   # SQL queries
├── routes/         # route definitions + Swagger JSDoc
├── scripts/        # seed.ts
├── services/       # business logic
├── types/          # shared types (Role, ApiResponse, etc.)
└── utils/          # AppError, response helpers, jobStateMachine
```

## Initial Setup (Fresh Clone)

### Prerequisites

- Node.js 18+
- PostgreSQL 16 (local) **or** Docker

---

### Option A — Local PostgreSQL

**1. Install dependencies**
```bash
npm install
```

**2. Create environment file**
```bash
cp .env.example .env
```

Edit `.env` to match your local PostgreSQL config:
```env
NODE_ENV=development
PORT=3000

DB_HOST=localhost
DB_PORT=5432
DB_NAME=voicescript_db
DB_USER=postgres
DB_PASSWORD=your_password_here

CORS_ORIGIN=http://localhost:5174

JWT_ACCESS_SECRET=replace-with-a-strong-secret
JWT_REFRESH_SECRET=replace-with-a-strong-secret
MAX_ACTIVE_DEVICES=5
```

**3. Run seed** (automatically creates the database, runs all migrations, and inserts sample data)
```bash
npm run seed
```

**4. Start the dev server**
```bash
npm run dev
```

API runs at `http://localhost:3000`

---

### Option B — Docker

```bash
cp .env.example .env
npm run docker:dev
```

Docker Compose runs two services: `api` (hot-reload) and `db` (PostgreSQL 16). The `api` service waits for the `db` healthcheck before starting.

> **Note:** If using Docker, `npm run seed` must be run from inside the container or with `DB_HOST` pointed at the Docker port.

---

## Seed Data

`npm run seed` does the following:
1. Creates the database if it doesn't exist
2. Drops and recreates the `public` schema
3. Runs all SQL migrations in order (001–016)
4. Inserts sample data

| Account | Email | Password | Role |
|---|---|---|---|
| Admin | admin@admin.com | 1234 | admin |
| Reporter | reporter@admin.com | 1234 | reporter |
| Editor | editor@admin.com | 1234 | editor |

Sample jobs: **50 jobs** distributed across statuses — NEW (10), ASSIGNED (1), TRANSCRIBED (15), REVIEWED (1), COMPLETED (23).

---

## Commands

```bash
npm run dev          # Dev server with hot-reload
npm run build        # Compile TypeScript → dist/
npm run start        # Run compiled output
npm run type-check   # Type-check without emitting output
npm run seed         # Reset DB + run all migrations + insert sample data
npm run migrate      # Run new migrations only (without resetting data)
npm run test         # Run all tests
npm run docker:dev   # Docker Compose up (API + PostgreSQL)
npm run docker:down  # Docker Compose down
```

**`npm run seed` vs `npm run migrate`:**
- `seed` — full reset; use for initial setup or starting from scratch
- `migrate` — apply new migrations to an existing database without dropping data

---

## API Endpoints

Base URL: `http://localhost:3000/api/v1`

Interactive docs available at: `http://localhost:3000/api/docs`

### Auth

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Register a new user (reporter role only) |
| POST | `/auth/login` | Public | Login; returns access token + sets refresh token cookie |
| POST | `/auth/refresh-token` | Cookie | Rotate refresh token and get a new access token |
| POST | `/auth/logout` | Bearer | Revoke refresh token + clear cookie |
| GET | `/auth/me` | Bearer | Currently authenticated user data |

### Admin — User Management

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/admin/users` | Admin | List all users (paginated, filterable by role) |
| POST | `/admin/users` | Admin | Create a new user (any role) |
| GET | `/admin/users/:id` | Admin | Get user by ID |
| PATCH | `/admin/users/:id/role` | Admin | Update user role |
| DELETE | `/admin/users/:id` | Admin | Delete user |

### Jobs

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/jobs` | Admin | Create a new job (initial status: NEW) |
| GET | `/jobs` | All | List jobs (admin: all; reporter/editor: own jobs only) |
| POST | `/jobs/:id/assign-reporter` | Admin | Assign reporter → status: ASSIGNED |
| PATCH | `/jobs/:id/submit-transcript` | Reporter | Submit transcript → status: TRANSCRIBED |
| POST | `/jobs/:id/assign-editor` | Admin | Assign editor (status stays TRANSCRIBED) |
| PATCH | `/jobs/:id/mark-reviewed` | Editor | Mark as reviewed → status: REVIEWED |
| PATCH | `/jobs/:id/complete` | Admin | Complete job → status: COMPLETED |
| GET | `/jobs/:id/history` | All | Job status change history |

### Health

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Server and database connection status |

---

## Job Workflow

```
NEW → ASSIGNED → TRANSCRIBED → REVIEWED → COMPLETED
```

| Transition | Who | Conditions |
|---|---|---|
| NEW → ASSIGNED | Admin | Reporter must exist, have reporter role, and have no active job |
| ASSIGNED → TRANSCRIBED | Reporter | Only the assigned reporter |
| TRANSCRIBED → TRANSCRIBED | Admin | Assign editor (status unchanged) |
| TRANSCRIBED → REVIEWED | Editor | Only the assigned editor |
| REVIEWED → COMPLETED | Admin | Job must have both a reporter and an editor |

**Payment calculation at COMPLETED:**
- Reporter: `ceil(duration_seconds / 60) × Rp 2,000`
- Editor: flat Rp 50,000

---

## Authentication

The system uses two tokens:

- **Access Token** — JWT, valid 15 minutes, sent via `Authorization: Bearer <token>`
- **Refresh Token** — JWT, valid 7 days, stored in HTTPOnly cookie `refresh_token`

Refresh tokens use **Rotation** — each use invalidates the old token and issues a new one. Maximum 5 active devices per user (configurable via `MAX_ACTIVE_DEVICES`).

Passwords are hashed with bcrypt (cost 12) after a SHA-256 pre-hash.

---

## Database

Raw SQL via `node-postgres` — no ORM. All queries live in the `repositories/` layer.

The `withTransaction<T>` helper in `src/config/database.ts` is available for operations requiring atomicity.

**Main tables:**

| Table | Description |
|---|---|
| `users` | User records with role and home city |
| `refresh_tokens` | Active tokens per device |
| `menus` | Menu configuration per role (tree structure) |
| `jobs` | Court reporting job records |
| `job_status_history` | Audit trail for every job status change |

Migrations are stored in `src/migrations/` with the format `NNN_name.sql`. New files are automatically picked up by `npm run migrate` and `npm run seed`.
