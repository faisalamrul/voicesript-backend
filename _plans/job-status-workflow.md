# Plan: Job Status Workflow

## Context

Implementasi state machine lifecycle job secara penuh: `NEW → ASSIGNED → TRANSCRIBED → REVIEWED → COMPLETED`. Lima endpoint baru menangani setiap transisi dengan otorisasi per role yang ketat. Fitur ini mengaktifkan `jobStateMachine` utility (`src/utils/jobStateMachine.ts`) yang sudah ada tapi belum dipakai di manapun.

Spec lengkap ada di `_specs/job-status-workflow.md` (branch `claude/feature/job-status-workflow`).

---

## Phase 1 — Migrations

**`src/migrations/011_add_user_availability.sql`**
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS availability BOOLEAN NOT NULL DEFAULT TRUE;
```
> Kolom ini ada untuk keperluan profile display / self-reporting oleh user. Assignment logic (reporter & editor) tidak mengecek kolom ini — keduanya pakai Opsi B (derived dari active jobs di DB).

**`src/migrations/012_add_job_payments.sql`**
```sql
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS reporter_payment INTEGER,
  ADD COLUMN IF NOT EXISTS editor_payment   INTEGER;
```

---

## Phase 2 — Model Updates

**`src/models/user.model.ts`** — tambah `availability: boolean` ke interface `User`.

**`src/models/job.model.ts`** — tambah ke interface `Job`:
- `reporter_payment: number | null`
- `editor_payment: number | null`

---

## Phase 3 — Repository

### `src/repositories/job.repository.ts` — tambah 7 fungsi baru

Semua UPDATE pakai `pool.query<Job>` + `RETURNING *` + explicit null check pada `rows[0]`. Tidak ada perubahan pada `user.repository.ts` — `findById` sudah pakai `SELECT *`, sehingga kolom `availability` otomatis ikut setelah migration.

| Fungsi | Keterangan |
|---|---|
| `countActiveJobsByReporter(reporterId)` | `SELECT COUNT(*) FROM jobs WHERE reporter_id = $1 AND status = 'ASSIGNED'` — return `number` |
| `countActiveJobsByEditor(editorId)` | `SELECT COUNT(*) FROM jobs WHERE editor_id = $1 AND status IN ('TRANSCRIBED', 'REVIEWED')` — return `number` |
| `assignReporter(id, reporterId)` | UPDATE: `reporter_id = $2, status = 'ASSIGNED'` |
| `submitTranscript(id, notes)` | UPDATE: `status = 'TRANSCRIBED', transcript_notes = $2, submitted_at = NOW()` |
| `assignEditor(id, editorId)` | UPDATE: `editor_id = $2` (status tidak berubah) |
| `markReviewed(id, notes)` | UPDATE: `status = 'REVIEWED', review_notes = $2, reviewed_at = NOW()` |
| `completeJob(id, reporterPay, editorPay)` | UPDATE: `status = 'COMPLETED', reporter_payment = $2, editor_payment = $3` |

---

## Phase 4 — Service

### `src/services/job.service.ts` — 5 fungsi baru + fix pay calculation

**Fix `calculateReporterPay`**: ganti ke `Math.ceil(durationSeconds / 60) * REPORTER_PAY_RATE` (spec: "rounded up").

**Tambah konstanta**: `const EDITOR_PAY = 50_000`

**5 fungsi baru** — pola: fetch job → validasi status → cek ownership/role → panggil repo:

1. **`assignReporter(jobId, reporterId)`**
   - Fetch job → null → `AppError.notFound` | status ≠ `'NEW'` → `AppError(400)`
   - Fetch user via `userRepo.findById` → null → `AppError.notFound`
   - `user.role !== 'reporter'` → `AppError(400)` *(cek role dulu, murah)*
   - `jobRepo.countActiveJobsByReporter(reporterId) > 0` → `AppError(400, 'Reporter already has an active job')` *(baru query DB)*
   - Panggil `jobRepo.assignReporter`

2. **`submitTranscript(jobId, notes, requestingUserId)`**
   - Fetch job → null → `AppError.notFound` | status ≠ `'ASSIGNED'` → `AppError(400)`
   - `job.reporter_id !== requestingUserId` → `AppError(403)`
   - Panggil `jobRepo.submitTranscript(jobId, notes ?? null)`

3. **`assignEditor(jobId, editorId)`**
   - Fetch job → null → `AppError.notFound` | status ≠ `'TRANSCRIBED'` → `AppError(400)`
   - Fetch user → null → `AppError.notFound`
   - `user.role !== 'editor'` → `AppError(400)` *(cek role dulu, murah)*
   - `jobRepo.countActiveJobsByEditor(editorId) > 0` → `AppError(400, 'Editor already has an active job')` *(baru query DB)*
   - Panggil `jobRepo.assignEditor`

4. **`markReviewed(jobId, notes, requestingUserId)`**
   - Fetch job → null → `AppError.notFound` | status ≠ `'TRANSCRIBED'` → `AppError(400)`
   - `!job.editor_id` → `AppError(400, 'No editor assigned to this job')`
   - `job.editor_id !== requestingUserId` → `AppError(403)`
   - Panggil `jobRepo.markReviewed(jobId, notes ?? null)`

5. **`completeJob(jobId)`**
   - Fetch job → null → `AppError.notFound` | status ≠ `'REVIEWED'` → `AppError(400)`
   - `!job.reporter_id` → `AppError(400, 'Job has no assigned reporter')`
   - `!job.editor_id` → `AppError(400, 'Job has no assigned editor')`
   - Hitung `reporterPay = calculateReporterPay(job.duration)`, `editorPay = EDITOR_PAY`
   - Panggil `jobRepo.completeJob(jobId, reporterPay, editorPay)`

---

## Phase 5 — Controller

### `src/controllers/job.controller.ts` — tambah 5 handler

Semua pakai `req: AuthenticatedRequest`, try/catch → `next(err)`, response via `sendSuccess`.

| Handler | Ambil dari request | Panggil service |
|---|---|---|
| `assignReporter` | `params.id`, `body.reporter_id` | `jobService.assignReporter` |
| `submitTranscript` | `params.id`, `body.transcript_notes`, `req.user!.id` | `jobService.submitTranscript` |
| `assignEditor` | `params.id`, `body.editor_id` | `jobService.assignEditor` |
| `markReviewed` | `params.id`, `body.review_notes`, `req.user!.id` | `jobService.markReviewed` |
| `completeJob` | `params.id` | `jobService.completeJob` |

---

## Phase 6 — Routes + Swagger

### `src/routes/job.routes.ts` — tambah 5 route

```
POST  /jobs/:id/assign-reporter    authenticate, authorize(['admin'])    → assignReporter
PATCH /jobs/:id/submit-transcript  authenticate, authorize(['reporter']) → submitTranscript
POST  /jobs/:id/assign-editor      authenticate, authorize(['admin'])    → assignEditor
PATCH /jobs/:id/mark-reviewed      authenticate, authorize(['editor'])   → markReviewed
PATCH /jobs/:id/complete           authenticate, authorize(['admin'])    → completeJob
```

`GET /jobs/:id` tidak ada di codebase saat ini — tidak ditambahkan di sini karena di luar scope fitur ini.

Tambah Swagger JSDoc untuk masing-masing route: path param `id`, request body, response 200/400/401/403/404.

---

## Phase 7 — Tests

### `__tests__/job-workflow.test.ts` (file baru)

Mock: `jest.mock('../src/repositories/job.repository')` dan `jest.mock('../src/repositories/user.repository')`

Token helpers: `adminToken()`, `reporterToken(id?)`, `editorToken(id?)`

Test cases:
- `POST /jobs/:id/assign-reporter`:
  - reporter valid + job NEW → 200, status ASSIGNED
  - status bukan NEW → 400
  - reporter tidak ada → 404
  - user yang di-assign bukan role reporter (misalnya editor) → 400
  - reporter punya job ASSIGNED aktif → 400
  - tanpa token → 401 | token reporter → 403
- `PATCH /jobs/:id/submit-transcript`:
  - assigned reporter + job ASSIGNED → 200, status TRANSCRIBED
  - reporter berbeda → 403
  - status bukan ASSIGNED (misal: NEW atau TRANSCRIBED) → 400
  - tanpa token → 401
- `POST /jobs/:id/assign-editor`:
  - editor valid + job TRANSCRIBED → 200, status tetap TRANSCRIBED
  - status bukan TRANSCRIBED → 400
  - editor tidak ada → 404
  - user yang di-assign bukan role editor (misalnya reporter) → 400
  - editor punya job aktif (TRANSCRIBED/REVIEWED) → 400
  - token reporter → 403
- `PATCH /jobs/:id/mark-reviewed`:
  - assigned editor + job TRANSCRIBED → 200, status REVIEWED
  - editor berbeda → 403
  - job belum ada editor_id → 400
  - status bukan TRANSCRIBED → 400
- `PATCH /jobs/:id/complete`:
  - job REVIEWED (dengan reporter_id dan editor_id) → 200, status COMPLETED
  - status bukan REVIEWED → 400
  - job tanpa reporter_id → 400
  - token reporter → 403

---

## Verification

1. `npm run type-check` — 0 errors
2. `npm test` — semua test hijau (termasuk `auth.test.ts` dan `admin.test.ts`)
3. Manual via Swagger UI `http://localhost:3000/api/docs`: jalankan workflow end-to-end dari create job sampai complete
