# Plan: Payments Endpoint

## Context

New feature: `GET /api/v1/payments` — financial summary of all jobs for admin. Returns aggregate summary (total payout, reporter/editor breakdown, pending) and a job list with payment info. Full spec in `_specs/payments.md` (branch `claude/feature/payments`).

The `completed_at` column does not yet exist in the `jobs` table — a new migration is needed.

---

## Phase 1 — Migration

**`src/migrations/017_add_job_completed_at.sql`** (new file)
```sql
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- backfill existing COMPLETED jobs that predate this column
UPDATE jobs
SET completed_at = reviewed_at
WHERE status = 'COMPLETED'
  AND completed_at IS NULL
  AND reviewed_at IS NOT NULL;
```

---

## Phase 2 — Update completeJob repo + model

**`src/repositories/job.repository.ts`** — add `completed_at = NOW()` to the UPDATE in `completeJob`:
```sql
UPDATE jobs SET status='COMPLETED', reporter_payment=$2, editor_payment=$3, completed_at=NOW()
WHERE id=$1 RETURNING *
```

**`src/models/job.model.ts`** — add `completed_at: Date | null` to the `Job` interface.

---

## Phase 3 — Repository (new file)

**`src/repositories/payment.repository.ts`**

Exported interfaces:
- `PaymentFilters { search?, status?: 'paid'|'pending', period?: 'month'|'last' }`
- `PaymentJob { id, case_name, duration, status, reporter_name, reporter_payment, editor_name, editor_payment, completed_at }`
- `PaymentSummary { total_payout, reporter_total, reporter_minutes, editor_total, editor_jobs, pending_total }`
- `PaymentResult { summary: PaymentSummary, jobs: PaymentJob[] }`

Function `getPayments(filters: PaymentFilters): Promise<PaymentResult>`:

**WHERE conditions** built dynamically:
1. Status base visibility:
   - `status=paid` → `j.status = 'COMPLETED'`
   - `status=pending` → `j.status != 'COMPLETED' AND (j.reporter_id IS NOT NULL OR j.editor_id IS NOT NULL)`
   - default → `(j.status = 'COMPLETED' OR j.reporter_id IS NOT NULL OR j.editor_id IS NOT NULL)`
2. Search (if provided): escape `%` and `_` first, then:
   `(j.case_name ILIKE $N OR r.name ILIKE $N OR e.name ILIKE $N)` — `$N` same three times, valid in PostgreSQL
3. Period (if provided): calculate `start`/`end` in TypeScript via `new Date(year, month, 1)` — JavaScript handles January (month-1 = -1) correctly automatically:
   - `status=paid` → filter `j.completed_at >= $N AND j.completed_at < $N+1`
   - `status=pending` → filter `j.created_at >= $N AND j.created_at < $N+1`
   - default → `(j.status='COMPLETED' AND j.completed_at >= $N ...) OR (j.status!='COMPLETED' AND j.created_at >= $N ...)`

**Jobs query** — single SELECT with LEFT JOIN users (reporter + editor), CASE for payment:
```sql
SELECT j.id, j.case_name, j.duration, j.status,
  r.name AS reporter_name,
  CASE WHEN j.status='COMPLETED' THEN j.reporter_payment
       WHEN j.reporter_id IS NOT NULL THEN FLOOR(j.duration/60.0)*2000
       ELSE NULL END AS reporter_payment,
  e.name AS editor_name,
  CASE WHEN j.status='COMPLETED' THEN j.editor_payment
       WHEN j.editor_id IS NOT NULL THEN 50000
       ELSE NULL END AS editor_payment,
  j.completed_at
FROM jobs j
LEFT JOIN users r ON r.id = j.reporter_id
LEFT JOIN users e ON e.id = j.editor_id
${where}
ORDER BY COALESCE(j.completed_at, j.created_at) DESC
```

**Summary query** — conditional aggregation on the same WHERE:
```sql
SELECT
  COALESCE(SUM(CASE WHEN j.status='COMPLETED' THEN COALESCE(j.reporter_payment,0)+COALESCE(j.editor_payment,0) END),0) AS total_payout,
  COALESCE(SUM(CASE WHEN j.status='COMPLETED' THEN j.reporter_payment END),0) AS reporter_total,
  COALESCE(SUM(CASE WHEN j.status='COMPLETED' AND j.reporter_id IS NOT NULL THEN FLOOR(j.duration/60.0) END),0) AS reporter_minutes,
  COALESCE(SUM(CASE WHEN j.status='COMPLETED' AND j.editor_id IS NOT NULL THEN j.editor_payment END),0) AS editor_total,
  COUNT(CASE WHEN j.status='COMPLETED' AND j.editor_id IS NOT NULL THEN 1 END) AS editor_jobs,
  COALESCE(SUM(CASE WHEN j.status!='COMPLETED' AND (j.reporter_id IS NOT NULL OR j.editor_id IS NOT NULL)
    THEN (CASE WHEN j.reporter_id IS NOT NULL THEN FLOOR(j.duration/60.0)*2000 ELSE 0 END)
             + (CASE WHEN j.editor_id IS NOT NULL THEN 50000 ELSE 0 END)
  END),0) AS pending_total
FROM jobs j
LEFT JOIN users r ON r.id=j.reporter_id
LEFT JOIN users e ON e.id=j.editor_id
${where}
```

Parse all numbers from `string` to `number` with `parseInt`/`parseFloat` (pg returns numerics as strings).

---

## Phase 4 — Service (new file)

**`src/services/payment.service.ts`** — validate + delegate to repo:
- Validate `status`: only `'paid'` | `'pending'` | `undefined`, otherwise → `AppError(400)`
- Validate `period`: only `'month'` | `'last'` | `undefined`, otherwise → `AppError(400)`
- Call `paymentRepo.getPayments({ search, status, period })`
- Return result directly

---

## Phase 5 — Controller (new file)

**`src/controllers/payment.controller.ts`**:
- Read `search`, `status`, `period` from `req.query`
- Call `paymentService.getPayments({ search, status, period })`
- Return via `sendSuccess(res, result)`

---

## Phase 6 — Routes + Swagger (new file)

**`src/routes/payment.routes.ts`**:
```
GET / → authenticate, authorize(['admin']) → paymentController.getPayments
```
Swagger JSDoc: query params `search`, `status` (enum: paid/pending), `period` (enum: month/last). Response schema includes `summary` object and `jobs` array.

**`src/routes/index.ts`** — add:
```typescript
import paymentRouter from './payment.routes';
router.use('/payments', paymentRouter);
```

**`src/config/swagger.ts`** — add `Payments` tag.

---

## Phase 7 — Tests

**`__tests__/payments.test.ts`** (new file):

- `GET /api/v1/payments` without auth → 401
- `GET /api/v1/payments` with reporter/editor token → 403
- `GET /api/v1/payments` with admin token → 200, correct `{ summary, jobs }` structure
- `?status=paid` → only COMPLETED in `jobs[]`
- `?status=pending` → only non-COMPLETED with reporter/editor
- `?status=bogus` → 400
- `?period=month` → filter by `completed_at` (paid) / `created_at` (pending)
- `?period=bogus` → 400
- `?search=rina` → filter `case_name`, `reporter_name`, `editor_name`
- `summary.reporter_minutes` uses FLOOR not CEIL
- `pending_total` does not include NEW jobs without reporter/editor
- Job without reporter → `reporter_name: null`, `reporter_payment: null`
- Job without editor → `editor_name: null`, `editor_payment: null`
- `period=last` in January → filter to December of the previous year

---

## Verification

1. `npm run type-check` — 0 errors
2. `GET /api/v1/payments` without auth → 401
3. `GET /api/v1/payments` with admin token → 200 with `{ summary, jobs }`
4. `?status=paid` → only COMPLETED jobs in `jobs[]`
5. `?status=pending` → only non-COMPLETED with reporter/editor
6. `?period=month` → filter by `completed_at`/`created_at`
7. `?search=rina` → filter case_name, reporter_name, editor_name
