# Plan: Payments Endpoint

## Context

Fitur baru: `GET /api/v1/payments` — rekap finansial semua job untuk admin. Mengembalikan summary agregat (total payout, breakdown reporter/editor, pending) dan daftar job dengan payment info. Spec lengkap di `_specs/payments.md` (branch `claude/feature/payments`).

Kolom `completed_at` belum ada di tabel `jobs` — perlu migration baru.

---

## Phase 1 — Migration

**`src/migrations/017_add_job_completed_at.sql`** (file baru)
```sql
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- backfill job COMPLETED yang sudah ada sebelum kolom ini ditambah
UPDATE jobs
SET completed_at = reviewed_at
WHERE status = 'COMPLETED'
  AND completed_at IS NULL
  AND reviewed_at IS NOT NULL;
```

---

## Phase 2 — Update completeJob repo + model

**`src/repositories/job.repository.ts`** — tambah `completed_at = NOW()` ke UPDATE di `completeJob`:
```sql
UPDATE jobs SET status='COMPLETED', reporter_payment=$2, editor_payment=$3, completed_at=NOW()
WHERE id=$1 RETURNING *
```

**`src/models/job.model.ts`** — tambah `completed_at: Date | null` ke interface `Job`.

---

## Phase 3 — Repository (file baru)

**`src/repositories/payment.repository.ts`**

Ekspor interfaces:
- `PaymentFilters { search?, status?: 'paid'|'pending', period?: 'month'|'last' }`
- `PaymentJob { id, case_name, duration, status, reporter_name, reporter_payment, editor_name, editor_payment, completed_at }`
- `PaymentSummary { total_payout, reporter_total, reporter_minutes, editor_total, editor_jobs, pending_total }`
- `PaymentResult { summary: PaymentSummary, jobs: PaymentJob[] }`

Fungsi `getPayments(filters: PaymentFilters): Promise<PaymentResult>`:

**WHERE conditions** dibangun secara dinamis:
1. Status base visibility:
   - `status=paid` → `j.status = 'COMPLETED'`
   - `status=pending` → `j.status != 'COMPLETED' AND (j.reporter_id IS NOT NULL OR j.editor_id IS NOT NULL)`
   - default → `(j.status = 'COMPLETED' OR j.reporter_id IS NOT NULL OR j.editor_id IS NOT NULL)`
2. Search (jika ada): escape `%` dan `_` terlebih dahulu, lalu:
   `(j.case_name ILIKE $N OR r.name ILIKE $N OR e.name ILIKE $N)` — `$N` sama tiga kali, valid di PostgreSQL
3. Period (jika ada): hitung `start`/`end` di TypeScript via `new Date(year, month, 1)` — JavaScript handle bulan Januari (month-1 = -1) dengan benar otomatis:
   - `status=paid` → filter `j.completed_at >= $N AND j.completed_at < $N+1`
   - `status=pending` → filter `j.created_at >= $N AND j.created_at < $N+1`
   - default → `(j.status='COMPLETED' AND j.completed_at >= $N ...) OR (j.status!='COMPLETED' AND j.created_at >= $N ...)`

**Jobs query** — satu SELECT dengan LEFT JOIN users (reporter + editor), CASE untuk payment:
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

**Summary query** — conditional aggregation pada WHERE yang sama:
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

Parse semua angka dari `string` ke `number` dengan `parseInt`/`parseFloat` (pg mengembalikan numerics sebagai string).

---

## Phase 4 — Service (file baru)

**`src/services/payment.service.ts`** — validasi + delegate ke repo:
- Validasi `status`: hanya `'paid'` | `'pending'` | `undefined`, lainnya → `AppError(400)`
- Validasi `period`: hanya `'month'` | `'last'` | `undefined`, lainnya → `AppError(400)`
- Panggil `paymentRepo.getPayments({ search, status, period })`
- Return hasil langsung

---

## Phase 5 — Controller (file baru)

**`src/controllers/payment.controller.ts`**:
- Ambil `search`, `status`, `period` dari `req.query`
- Panggil `paymentService.getPayments({ search, status, period })`
- Return via `sendSuccess(res, result)`

---

## Phase 6 — Routes + Swagger (file baru)

**`src/routes/payment.routes.ts`**:
```
GET / → authenticate, authorize(['admin']) → paymentController.getPayments
```
Swagger JSDoc: query params `search`, `status` (enum: paid/pending), `period` (enum: month/last). Response schema mencakup `summary` object dan `jobs` array.

**`src/routes/index.ts`** — tambah:
```typescript
import paymentRouter from './payment.routes';
router.use('/payments', paymentRouter);
```

**`src/config/swagger.ts`** — tambah tag `Payments`.

---

## Phase 7 — Tests

**`__tests__/payments.test.ts`** (file baru):

- `GET /api/v1/payments` tanpa auth → 401
- `GET /api/v1/payments` dengan reporter/editor token → 403
- `GET /api/v1/payments` dengan admin token → 200, struktur `{ summary, jobs }` benar
- `?status=paid` → hanya COMPLETED di `jobs[]`
- `?status=pending` → hanya non-COMPLETED dengan reporter/editor
- `?status=bogus` → 400
- `?period=month` → filter berdasarkan `completed_at` (paid) / `created_at` (pending)
- `?period=bogus` → 400
- `?search=rina` → filter `case_name`, `reporter_name`, `editor_name`
- `summary.reporter_minutes` pakai FLOOR bukan CEIL
- `pending_total` tidak memasukkan job NEW tanpa reporter/editor
- Job tanpa reporter → `reporter_name: null`, `reporter_payment: null`
- Job tanpa editor → `editor_name: null`, `editor_payment: null`
- `period=last` di Januari → filter ke Desember tahun lalu

---

## Verification

1. `npm run type-check` — 0 errors
2. `GET /api/v1/payments` tanpa auth → 401
3. `GET /api/v1/payments` dengan admin token → 200 dengan `{ summary, jobs }`
4. `?status=paid` → hanya job COMPLETED di `jobs[]`
5. `?status=pending` → hanya non-COMPLETED dengan reporter/editor
6. `?period=month` → filter berdasarkan `completed_at`/`created_at`
7. `?search=rina` → filter case_name, reporter_name, editor_name
