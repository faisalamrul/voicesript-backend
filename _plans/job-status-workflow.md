# Plan: Job Status Workflow

## Context

Full implementation of the job lifecycle state machine: `NEW → ASSIGNED → TRANSCRIBED → REVIEWED → COMPLETED`. Five new endpoints handle each transition with strict per-role authorization. This feature activates the `jobStateMachine` utility (`src/utils/jobStateMachine.ts`) that already exists but is not yet used anywhere.

Full spec in `_specs/job-status-workflow.md` (branch `claude/feature/job-status-workflow`).

---

## Phase 1 — Migrations

**`src/migrations/011_add_user_availability.sql`**
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS availability BOOLEAN NOT NULL DEFAULT TRUE;
```
> This column exists for profile display / self-reporting by the user. Assignment logic (reporter & editor) does NOT check this column — both use Option B (derived from active jobs in the DB).

**`src/migrations/012_add_job_payments.sql`**
```sql
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS reporter_payment INTEGER,
  ADD COLUMN IF NOT EXISTS editor_payment   INTEGER;
```

---

## Phase 2 — Model Updates

**`src/models/user.model.ts`** — add `availability: boolean` to the `User` interface.

**`src/models/job.model.ts`** — add to the `Job` interface:
- `reporter_payment: number | null`
- `editor_payment: number | null`

---

## Phase 3 — Repository

### `src/repositories/job.repository.ts` — add 7 new functions

All UPDATEs use `pool.query<Job>` + `RETURNING *` + explicit null check on `rows[0]`. No changes to `user.repository.ts` — `findById` already uses `SELECT *`, so the `availability` column is automatically included after migration.

| Function | Description |
|---|---|
| `countActiveJobsByReporter(reporterId)` | `SELECT COUNT(*) FROM jobs WHERE reporter_id = $1 AND status = 'ASSIGNED'` — return `number` |
| `countActiveJobsByEditor(editorId)` | `SELECT COUNT(*) FROM jobs WHERE editor_id = $1 AND status IN ('TRANSCRIBED', 'REVIEWED')` — return `number` |
| `assignReporter(id, reporterId)` | UPDATE: `reporter_id = $2, status = 'ASSIGNED'` |
| `submitTranscript(id, notes)` | UPDATE: `status = 'TRANSCRIBED', transcript_notes = $2, submitted_at = NOW()` |
| `assignEditor(id, editorId)` | UPDATE: `editor_id = $2` (status unchanged) |
| `markReviewed(id, notes)` | UPDATE: `status = 'REVIEWED', review_notes = $2, reviewed_at = NOW()` |
| `completeJob(id, reporterPay, editorPay)` | UPDATE: `status = 'COMPLETED', reporter_payment = $2, editor_payment = $3` |

---

## Phase 4 — Service

### `src/services/job.service.ts` — 5 new functions + fix pay calculation

**Fix `calculateReporterPay`**: change to `Math.ceil(durationSeconds / 60) * REPORTER_PAY_RATE` (spec: "rounded up").

**Add constant**: `const EDITOR_PAY = 50_000`

**5 new functions** — pattern: fetch job → validate status → check ownership/role → call repo:

1. **`assignReporter(jobId, reporterId)`**
   - Fetch job → null → `AppError.notFound` | status ≠ `'NEW'` → `AppError(400)`
   - Fetch user via `userRepo.findById` → null → `AppError.notFound`
   - `user.role !== 'reporter'` → `AppError(400)` *(check role first, cheap)*
   - `jobRepo.countActiveJobsByReporter(reporterId) > 0` → `AppError(400, 'Reporter already has an active job')` *(then query DB)*
   - Call `jobRepo.assignReporter`

2. **`submitTranscript(jobId, notes, requestingUserId)`**
   - Fetch job → null → `AppError.notFound` | status ≠ `'ASSIGNED'` → `AppError(400)`
   - `job.reporter_id !== requestingUserId` → `AppError(403)`
   - Call `jobRepo.submitTranscript(jobId, notes ?? null)`

3. **`assignEditor(jobId, editorId)`**
   - Fetch job → null → `AppError.notFound` | status ≠ `'TRANSCRIBED'` → `AppError(400)`
   - Fetch user → null → `AppError.notFound`
   - `user.role !== 'editor'` → `AppError(400)` *(check role first, cheap)*
   - `jobRepo.countActiveJobsByEditor(editorId) > 0` → `AppError(400, 'Editor already has an active job')` *(then query DB)*
   - Call `jobRepo.assignEditor`

4. **`markReviewed(jobId, notes, requestingUserId)`**
   - Fetch job → null → `AppError.notFound` | status ≠ `'TRANSCRIBED'` → `AppError(400)`
   - `!job.editor_id` → `AppError(400, 'No editor assigned to this job')`
   - `job.editor_id !== requestingUserId` → `AppError(403)`
   - Call `jobRepo.markReviewed(jobId, notes ?? null)`

5. **`completeJob(jobId)`**
   - Fetch job → null → `AppError.notFound` | status ≠ `'REVIEWED'` → `AppError(400)`
   - `!job.reporter_id` → `AppError(400, 'Job has no assigned reporter')`
   - `!job.editor_id` → `AppError(400, 'Job has no assigned editor')`
   - Calculate `reporterPay = calculateReporterPay(job.duration)`, `editorPay = EDITOR_PAY`
   - Call `jobRepo.completeJob(jobId, reporterPay, editorPay)`

---

## Phase 5 — Controller

### `src/controllers/job.controller.ts` — add 5 handlers

All use `req: AuthenticatedRequest`, try/catch → `next(err)`, response via `sendSuccess`.

| Handler | Read from request | Call service |
|---|---|---|
| `assignReporter` | `params.id`, `body.reporter_id` | `jobService.assignReporter` |
| `submitTranscript` | `params.id`, `body.transcript_notes`, `req.user!.id` | `jobService.submitTranscript` |
| `assignEditor` | `params.id`, `body.editor_id` | `jobService.assignEditor` |
| `markReviewed` | `params.id`, `body.review_notes`, `req.user!.id` | `jobService.markReviewed` |
| `completeJob` | `params.id` | `jobService.completeJob` |

---

## Phase 6 — Routes + Swagger

### `src/routes/job.routes.ts` — add 5 routes

```
POST  /jobs/:id/assign-reporter    authenticate, authorize(['admin'])    → assignReporter
PATCH /jobs/:id/submit-transcript  authenticate, authorize(['reporter']) → submitTranscript
POST  /jobs/:id/assign-editor      authenticate, authorize(['admin'])    → assignEditor
PATCH /jobs/:id/mark-reviewed      authenticate, authorize(['editor'])   → markReviewed
PATCH /jobs/:id/complete           authenticate, authorize(['admin'])    → completeJob
```

`GET /jobs/:id` does not exist yet — not added here as it is out of scope for this feature.

Add Swagger JSDoc for each route: path param `id`, request body, response 200/400/401/403/404.

---

## Phase 7 — Tests

### `__tests__/job-workflow.test.ts` (new file)

Mock: `jest.mock('../src/repositories/job.repository')` and `jest.mock('../src/repositories/user.repository')`

Token helpers: `adminToken()`, `reporterToken(id?)`, `editorToken(id?)`

Test cases:
- `POST /jobs/:id/assign-reporter`:
  - Valid reporter + job NEW → 200, status ASSIGNED
  - Status not NEW → 400
  - Reporter not found → 404
  - Assigned user is not a reporter (e.g. editor) → 400
  - Reporter has an active ASSIGNED job → 400
  - Without token → 401 | reporter token → 403
- `PATCH /jobs/:id/submit-transcript`:
  - Assigned reporter + job ASSIGNED → 200, status TRANSCRIBED
  - Different reporter → 403
  - Status not ASSIGNED (e.g. NEW or TRANSCRIBED) → 400
  - Without token → 401
- `POST /jobs/:id/assign-editor`:
  - Valid editor + job TRANSCRIBED → 200, status stays TRANSCRIBED
  - Status not TRANSCRIBED → 400
  - Editor not found → 404
  - Assigned user is not an editor (e.g. reporter) → 400
  - Editor has an active job (TRANSCRIBED/REVIEWED) → 400
  - Reporter token → 403
- `PATCH /jobs/:id/mark-reviewed`:
  - Assigned editor + job TRANSCRIBED → 200, status REVIEWED
  - Different editor → 403
  - Job has no editor_id → 400
  - Status not TRANSCRIBED → 400
- `PATCH /jobs/:id/complete`:
  - Job REVIEWED (with reporter_id and editor_id) → 200, status COMPLETED
  - Status not REVIEWED → 400
  - Job without reporter_id → 400
  - Reporter token → 403

---

## Verification

1. `npm run type-check` — 0 errors
2. `npm test` — all tests green (including `auth.test.ts` and `admin.test.ts`)
3. Manual via Swagger UI `http://localhost:3000/api/docs`: run the end-to-end workflow from create job to complete
