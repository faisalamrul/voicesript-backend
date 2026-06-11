# Plan: Create Court Reporting Job

## Context

Implementasi endpoint `POST /api/v1/jobs` (admin only) dan `GET /api/v1/jobs` (role-based) untuk court reporting job. Job dimulai dengan status `NEW`, mengikuti state machine `NEW → ASSIGNED → TRANSCRIBED → REVIEWED → COMPLETED`. Bayaran reporter dihitung on-the-fly (`duration × REPORTER_PAY_RATE`), tidak disimpan di DB. `city` di-set null untuk job remote, abaikan diam-diam jika dikirim. Spec: `_specs/create-court-reporting-job.md`.

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
- `Job` interface — semua field DB: id, case_name, duration, location, city, status, reporter_id, editor_id, transcript_notes, review_notes, submitted_at, reviewed_at, created_at
- `JobPublic` — sama dengan `Job` (semua field aman dikembalikan ke client)

---

## Phase 3 — State Machine Utility

### `src/utils/jobStateMachine.ts`
- `STATUS_ORDER: JobStatus[]` — urutan status yang valid
- `isValidTransition(from, to): boolean` — cek apakah `to === from+1` dalam urutan
- `getNextStatus(current): JobStatus | null` — kembalikan status berikutnya

Reusable untuk semua future status-transition endpoints.

---

## Phase 4 — Repository

### `src/repositories/job.repository.ts`
- `createJob(params: { caseName, duration, location, city })` → `Job`
  - INSERT, RETURNING semua field
- `findById(id)` → `Job | null`
- `findAll(filters?: { status?: JobStatus; reporter_id?: string; editor_id?: string })` → `Job[]`
  - Bangun WHERE clause secara dinamis dari filter yang diberikan
  - Tanpa filter → kembalikan semua job (untuk admin)

Ikuti pola `user.repository.ts`: `pool.query<Job>(SQL, params)`, return `rows[0]!`.

---

## Phase 5 — Service

### `src/services/job.service.ts`

Constant di atas fungsi (tidak di env, nilai bisnis bukan infrastruktur):
```typescript
const REPORTER_PAY_RATE = 2000; // Rp per menit
```

**`createJob(params)`:**
1. Validasi `case_name` — tidak boleh kosong/whitespace → `AppError(400)`
2. Validasi `duration` — harus integer (Number.isInteger), min 1 → `AppError(400)`
3. Validasi `location` — harus `physical` atau `remote` → `AppError(400)`
4. Jika `physical` dan `city` kosong/tidak ada → `AppError(400)`
5. Jika `remote` → paksa `city = null` (abaikan input diam-diam)
6. Panggil `jobRepo.createJob(...)` dengan `status = 'NEW'` dari DB default
7. Return job

**`getJobs(requestingUser: { id, role })`:**
- `admin` → `jobRepo.findAll()` — semua job
- `reporter` → `jobRepo.findAll({ reporter_id: requestingUser.id })`
- `reviewer` → `jobRepo.findAll({ editor_id: requestingUser.id })`

**`calculateReporterPay(duration: number): number`** → `duration * REPORTER_PAY_RATE`

---

## Phase 6 — Controller

### `src/controllers/job.controller.ts`
- `createJob(req, res, next)` — try/catch, baca body, panggil service, `sendCreated(res, { job })`
  - Abaikan `status`, `reporter_id`, `editor_id` dari body request
- `getJobs(req, res, next)` — panggil `jobService.getJobs(req.user!)`, `sendSuccess(res, { jobs })`

---

## Phase 7 — Routes + Swagger

### `src/routes/job.routes.ts`
```
POST /jobs → authenticate, authorize(['admin']), jobController.createJob
GET  /jobs → authenticate, authorize(['admin', 'reporter', 'reviewer']), jobController.getJobs
```

Swagger JSDoc untuk `POST /jobs`:
- `requestBody`: case_name (required), duration (required, min 1), location (required, enum physical|remote), city (required **hanya** jika location=physical — tambahkan note: "diabaikan jika location=remote")
- Response 201, error 400/401/403

Swagger JSDoc untuk `GET /jobs`:
- Deskripsi: "Admin melihat semua job. Reporter melihat job miliknya. Reviewer melihat job yang di-assign kepadanya."
- Response 200 array of Job, error 401/403

### `src/routes/index.ts` — tambahkan:
```typescript
router.use('/jobs', jobRouter);
```

### `src/config/swagger.ts` — tambahkan schema `Job` ke `components.schemas`:
- id, case_name, duration, location, city (nullable), status, reporter_id (nullable), editor_id (nullable), transcript_notes (nullable), review_notes (nullable), submitted_at (nullable), reviewed_at (nullable), created_at

---

## Phase 8 — Tests

### `__tests__/job.test.ts`
Mock: `jest.mock('../src/repositories/job.repository')`
Admin token: `tokenService.signAccessToken({ id, email, role: 'admin' })`

Test cases (12):
1. `POST /jobs` physical + city valid → 201, shape benar, `status: 'NEW'`, `reporter_id: null`
2. `POST /jobs` remote tanpa city → 201, `city: null`
3. `POST /jobs` remote + `city: 'Jakarta'` dikirim → 201, `city: null` (silently ignored)
4. `duration: 0` → 400
5. `duration: 1.5` (float) → 400
6. `case_name: ''` → 400
7. `location: 'physical'` tanpa `city` → 400
8. `location: 'invalid'` → 400
9. `status` di body diabaikan → response tetap `'NEW'`
10. Non-admin (reporter token) mencoba `POST /jobs` → 403
11. `GET /jobs` dengan admin token → 200, array of jobs
12. `GET /jobs` tanpa token → 401

---

## Verification

1. `npm run migrate` — apply `004_jobs_schema.sql`
2. `npm run type-check` — 0 errors
3. `npm test` — semua test hijau
4. Manual: `POST /api/v1/jobs` dan `GET /api/v1/jobs` via Swagger UI `http://localhost:3000/api/docs`
