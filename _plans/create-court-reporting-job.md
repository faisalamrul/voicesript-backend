# Plan: Create Court Reporting Job

## Context

Implementation of `POST /api/v1/jobs` (admin only) and `GET /api/v1/jobs` (role-based) for court reporting jobs. Jobs start with status `NEW` and follow the state machine `NEW → ASSIGNED → TRANSCRIBED → REVIEWED → COMPLETED`. Reporter pay is calculated on-the-fly (`duration × REPORTER_PAY_RATE`) and not stored in the DB. `city` is set to null for remote jobs; silently ignored if sent. Spec: `_specs/create-court-reporting-job.md`.

---

## Phase 1 — Migration

### `src/migrations/004_jobs_schema.sql`
```sql
CREATE TYPE job_status AS ENUM ('NEW', 'ASSIGNED', 'TRANSCRIBED', 'REVIEWED', 'COMPLETED');
CREATE TYPE job_location AS ENUM ('physical', 'remote');

CREATE TABLE IF NOT EXISTS jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_name         VARCHAR(255) NOT NULL,
  duration          INTEGER NOT NULL CHECK (duration >= 1),
  location          job_location NOT NULL,
  city              VARCHAR(255),
  status            job_status NOT NULL DEFAULT 'NEW',
  reporter_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  editor_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  transcript_notes  TEXT,
  review_notes      TEXT,
  submitted_at      TIMESTAMPTZ,
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status       ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_reporter_id  ON jobs(reporter_id);
CREATE INDEX IF NOT EXISTS idx_jobs_editor_id    ON jobs(editor_id);
```

---

## Phase 2 — Model & Types

### `src/models/job.model.ts`
- `JobStatus = 'NEW' | 'ASSIGNED' | 'TRANSCRIBED' | 'REVIEWED' | 'COMPLETED'`
- `JobLocation = 'physical' | 'remote'`
- `Job` interface — all DB fields: id, case_name, duration, location, city, status, reporter_id, editor_id, transcript_notes, review_notes, submitted_at, reviewed_at, created_at
- `JobPublic` — same as `Job` (all fields safe to return to client)

---

## Phase 3 — State Machine Utility

### `src/utils/jobStateMachine.ts`
- `STATUS_ORDER: JobStatus[]` — valid ordered status sequence
- `isValidTransition(from, to): boolean` — checks whether `to === from+1` in the sequence
- `getNextStatus(current): JobStatus | null` — returns the next status

Reusable for all future status-transition endpoints.

---

## Phase 4 — Repository

### `src/repositories/job.repository.ts`
- `createJob(params: { caseName, duration, location, city })` → `Job`
  - INSERT, RETURNING all fields
- `findById(id)` → `Job | null`
- `findAll(filters?: { status?: JobStatus; reporter_id?: string; editor_id?: string })` → `Job[]`
  - Build WHERE clause dynamically from provided filters
  - No filters → return all jobs (for admin)

Follow the `user.repository.ts` pattern: `pool.query<Job>(SQL, params)`, return `rows[0]!`.

---

## Phase 5 — Service

### `src/services/job.service.ts`

Constant above functions (not in env — business value, not infrastructure):
```typescript
const REPORTER_PAY_RATE = 2000; // Rp per minute
```

**`createJob(params)`:**
1. Validate `case_name` — must not be empty/whitespace → `AppError(400)`
2. Validate `duration` — must be integer (Number.isInteger), min 1 → `AppError(400)`
3. Validate `location` — must be `physical` or `remote` → `AppError(400)`
4. If `physical` and `city` is empty/missing → `AppError(400)`
5. If `remote` → force `city = null` (silently ignore input)
6. Call `jobRepo.createJob(...)` with `status = 'NEW'` from DB default
7. Return job

**`getJobs(requestingUser: { id, role })`:**
- `admin` → `jobRepo.findAll()` — all jobs
- `reporter` → `jobRepo.findAll({ reporter_id: requestingUser.id })`
- `reviewer` → `jobRepo.findAll({ editor_id: requestingUser.id })`

**`calculateReporterPay(duration: number): number`** → `duration * REPORTER_PAY_RATE`

---

## Phase 6 — Controller

### `src/controllers/job.controller.ts`
- `createJob(req, res, next)` — try/catch, read body, call service, `sendCreated(res, { job })`
  - Ignore `status`, `reporter_id`, `editor_id` from request body
- `getJobs(req, res, next)` — call `jobService.getJobs(req.user!)`, `sendSuccess(res, { jobs })`

---

## Phase 7 — Routes + Swagger

### `src/routes/job.routes.ts`
```
POST /jobs → authenticate, authorize(['admin']), jobController.createJob
GET  /jobs → authenticate, authorize(['admin', 'reporter', 'reviewer']), jobController.getJobs
```

Swagger JSDoc for `POST /jobs`:
- `requestBody`: case_name (required), duration (required, min 1), location (required, enum physical|remote), city (required **only** if location=physical — add note: "ignored if location=remote")
- Response 201, error 400/401/403

Swagger JSDoc for `GET /jobs`:
- Description: "Admin sees all jobs. Reporter sees their own assigned jobs. Editor sees jobs assigned to them."
- Response 200 array of Job, error 401/403

### `src/routes/index.ts` — add:
```typescript
router.use('/jobs', jobRouter);
```

### `src/config/swagger.ts` — add `Job` schema to `components.schemas`:
- id, case_name, duration, location, city (nullable), status, reporter_id (nullable), editor_id (nullable), transcript_notes (nullable), review_notes (nullable), submitted_at (nullable), reviewed_at (nullable), created_at

---

## Phase 8 — Tests

### `__tests__/job.test.ts`
Mock: `jest.mock('../src/repositories/job.repository')`
Admin token: `tokenService.signAccessToken({ id, email, role: 'admin' })`

Test cases (12):
1. `POST /jobs` physical + valid city → 201, correct shape, `status: 'NEW'`, `reporter_id: null`
2. `POST /jobs` remote without city → 201, `city: null`
3. `POST /jobs` remote + `city: 'Jakarta'` sent → 201, `city: null` (silently ignored)
4. `duration: 0` → 400
5. `duration: 1.5` (float) → 400
6. `case_name: ''` → 400
7. `location: 'physical'` without `city` → 400
8. `location: 'invalid'` → 400
9. `status` in body ignored → response still `'NEW'`
10. Non-admin (reporter token) tries `POST /jobs` → 403
11. `GET /jobs` with admin token → 200, array of jobs
12. `GET /jobs` without token → 401

---

## Verification

1. `npm run migrate` — apply `004_jobs_schema.sql`
2. `npm run type-check` — 0 errors
3. `npm test` — all tests green
4. Manual: `POST /api/v1/jobs` and `GET /api/v1/jobs` via Swagger UI `http://localhost:3000/api/docs`
