# Plan: Reporter Earnings Endpoint

## Context

New feature: `GET /api/v1/reporter/earnings` — earnings summary page for the logged-in reporter. Returns a summary card, work statistics, and a paginated job list. Spec: `_specs/reporter-earnings.md`.

All data is automatically filtered by `req.user.id`. No `:id` param — reporters cannot view another reporter's data.

---

## Response Shape

```
{
  summary: {
    total_earned,     // all-time COMPLETED — unchanged by period filter
    total_minutes,    // all-time COMPLETED minutes — unchanged by period filter
    period_earned,    // COMPLETED in active period (null if all_time)
    pending           // all-time REVIEWED estimate — unchanged by period filter
  },
  work_stats: {
    total_jobs,           // all-time all jobs for this reporter
    jobs_this_month,      // COMPLETED in current calendar month (always current month)
    avg_duration_minutes  // average of COMPLETED jobs only
  },
  jobs: [...],
  pagination: { total, page, limit, total_pages }
}
```

---

## Phase 1 — Repository (new file)

**`src/repositories/reporter.repository.ts`**

Local constant: `const REPORTER_RATE = 2000`

Interfaces: `ReporterEarningsFilters`, `EarningsSummary`, `WorkStats`, `EarningsJob`, `EarningsResult`

Helper `getPeriodRange(period)` — same pattern as `payment.repository.ts`, `new Date(year, month±1, 1)`.

Function `getEarnings(reporterId, filters)` — **2 parallel queries via `Promise.all`**:

**Query A — Aggregate stats** (single query, all all-time except `period_earned`):
```sql
SELECT
  COALESCE(SUM(CASE WHEN status='COMPLETED' THEN reporter_payment END), 0)          AS total_earned,
  COALESCE(SUM(CASE WHEN status='COMPLETED' THEN FLOOR(duration/60.0) END), 0)      AS total_minutes,
  COALESCE(SUM(CASE WHEN status='REVIEWED'  THEN FLOOR(duration/60.0)*2000 END), 0) AS pending,
  -- period_earned: null if no filter, populated from WHERE period if set
  COALESCE(SUM(CASE WHEN status='COMPLETED'
                    AND completed_at >= $2 AND completed_at < $3
               THEN reporter_payment END), 0)                                        AS period_earned,
  -- work_stats
  COUNT(*)                                                                            AS total_jobs,
  COUNT(CASE WHEN status='COMPLETED'
             AND completed_at >= $4 AND completed_at < $5 THEN 1 END)               AS jobs_this_month,
  COALESCE(FLOOR(AVG(CASE WHEN status='COMPLETED' THEN duration END)/60.0), 0)      AS avg_duration_minutes
FROM jobs WHERE reporter_id = $1
```
- `$2`/`$3` = range from period filter (`getPeriodRange`). If period = `undefined`, use `NULL` for both params and the CASE will not match → `period_earned = 0`. Return `period_earned: null` to client when period is not set.
- `$4`/`$5` = always current calendar month (`new Date(year, month, 1)` and `new Date(year, month+1, 1)`).

**Query B — Jobs list** (period-filtered, paginated):

Dynamic WHERE conditions:
1. `j.reporter_id = $1` — always
2. Period (if set): same pattern as `payment.repository.ts` —
   `(j.status='COMPLETED' AND j.completed_at >= $n AND j.completed_at < $m) OR (j.status!='COMPLETED' AND j.created_at >= $n AND j.created_at < $m)`
3. Search: `j.case_name ILIKE $n` with `%`/`_` escaping
4. LIMIT/OFFSET at the end

```sql
SELECT j.id, j.case_name, j.location, j.duration, j.status, j.reporter_payment,
       j.reporter_assigned_at AS assigned_at,
       j.submitted_at, j.reviewed_at, j.completed_at,
       COUNT(*) OVER() AS _total
FROM jobs j WHERE ...
ORDER BY COALESCE(j.completed_at, j.reporter_assigned_at, j.created_at) DESC
LIMIT $n OFFSET $m
```

`reporter_payment` returned as-is (null if not yet COMPLETED) — frontend renders muted estimate.

---

## Phase 2 — Service (new file)

**`src/services/reporter.service.ts`**:
- Validate `period`: only `'month'`|`'last'`|`undefined`, throw `new AppError('...', 400)` if invalid
- Delegate to `reporterRepo.getEarnings(reporterId, filters)`

---

## Phase 3 — Controller (new file)

**`src/controllers/reporter.controller.ts`**:
- Parse `search`, `period`, `page`, `limit` from `req.query`
- `page = Math.max(1, parseInt(...) || 1)`, `limit = Math.min(100, Math.max(1, parseInt(...) || 10))`
- Call `reporterService.getEarnings(req.user!.id, { search, period, page, limit })`
- Return via `sendSuccess(res, result)`

---

## Phase 4 — Routes + Swagger (new file)

**`src/routes/reporter.routes.ts`**:
```
GET /earnings → authenticate, authorize(['reporter']) → reporterController.getEarnings
```
Swagger JSDoc: query params `search`, `period` (enum: month/last), `page`, `limit`.

**`src/routes/index.ts`** — add:
```typescript
import reporterRouter from './reporter.routes';
router.use('/reporter', reporterRouter);
```

**`src/config/swagger.ts`** — add `Reporter` tag.

---

## Verification

1. `npm run type-check` — 0 errors
2. `GET /api/v1/reporter/earnings` without auth → 401
3. With admin token → 403
4. With reporter token → 200 with `{ summary, work_stats, jobs, pagination }`
5. `summary.pending` only counts `REVIEWED` jobs
6. `summary.total_earned` and `total_minutes` unchanged by period filter
7. `?period=month` → `jobs[]` only this month's jobs; `summary.period_earned` = this month's earnings
8. `?period=last` → `period_earned` = last month's earnings; January correctly rolls over to December
9. No period → `summary.period_earned = null`
10. `work_stats.avg_duration_minutes` from COMPLETED jobs only
11. Reporter A cannot see Reporter B's data
