# Spec for payments

branch: claude/feature/payments

## Summary

The Payments feature displays a financial summary of all jobs for admin. It includes one new backend endpoint (`GET /api/v1/payments`) and one new frontend page. Data is split into two categories: **paid** (COMPLETED jobs, using stored snapshot values) and **pending** (non-COMPLETED jobs that already have a reporter or editor, calculated as estimates). Summary cards at the top show aggregated total payout, reporter vs editor breakdown, and total pending.

Payment calculation rules:
- Reporter: `Math.floor(duration_seconds / 60) * rate_per_minute` — round **down**
- Editor: flat fee from the `settings` table (`editor_flat_fee`)
- Snapshot values are stored to `reporter_payment` and `editor_payment` columns in the `jobs` table when admin marks COMPLETED
- For COMPLETED jobs, always use the snapshot value — never recalculate

---

## Functional Requirements

### Backend

- Endpoint: `GET /api/v1/payments`
- Auth: admin only (`authenticate` + `authorize(['admin'])`)
- Query params (all optional):
  - `search` — filter by `case_name`, reporter name, or editor name (ILIKE, case-insensitive)
  - `status` — `paid` (COMPLETED only) | `pending` (non-COMPLETED with reporter/editor assigned)
  - `period` — `month` (current month) | `last` (last month) | empty = all time
- Response shape:
  ```
  {
    summary: {
      total_payout, reporter_total, reporter_minutes,
      editor_total, editor_jobs, pending_total
    },
    jobs: [{ id, case_name, duration, status, reporter_name, reporter_payment,
             editor_name, editor_payment, completed_at }]
  }
  ```
- `summary` calculations:
  - `total_payout` = SUM(reporter_payment + editor_payment) WHERE COMPLETED
  - `reporter_total` = SUM(reporter_payment) WHERE COMPLETED
  - `reporter_minutes` = SUM(FLOOR(duration / 60)) WHERE COMPLETED AND reporter_id IS NOT NULL
  - `editor_total` = SUM(editor_payment) WHERE COMPLETED AND editor_id IS NOT NULL
  - `editor_jobs` = COUNT(*) WHERE COMPLETED AND editor_id IS NOT NULL
  - `pending_total` = SUM(estimate) WHERE non-COMPLETED AND (reporter_id IS NOT NULL OR editor_id IS NOT NULL)
    - reporter estimate = FLOOR(duration / 60) × rate_per_minute from settings
    - editor estimate = flat_fee from settings, only if editor_id IS NOT NULL
- Job without reporter → `reporter_name: null`, `reporter_payment: null`
- Job without editor → `editor_name: null`, `editor_payment: null`
- Rate and flat fee are read from the `settings` table (not hardcoded)

### Frontend

- `/payments` page accessible by admin role only
- Summary cards at the top: Total Payout, Reporter Total, Reporter Minutes, Editor Total, Editor Jobs, Pending Total
- Job list table: case_name, status (paid/pending badge), reporter_name + payment, editor_name + payment, completed_at
- Filter bar: search (text input), status dropdown (All / Paid / Pending), period dropdown (All Time / This Month / Last Month)
- Table updates in real time as filters change

---

## Possible Edge Cases

- COMPLETED job without reporter (reporter was deleted after completion) → show `reporter_name: null`, use snapshot payment. This is exactly why we snapshot — payment data must not be lost even if the user is deleted.
- COMPLETED job without editor → `editor_name: null`, `editor_payment: null`. Both null — no editor worked on it, no fee was generated.
- `settings` table missing `reporter_rate` or `editor_flat_fee` rows → endpoint must still work, use defaults:
  ```typescript
  const rate = settings.reporter_rate ?? 2000      // default 2000
  const flatFee = settings.editor_flat_fee ?? 50000 // default 50000
  ```
  Do not throw an error — the Payments page must remain accessible even if settings are not configured. Log a warning on the server but still return 200.
- `period=last` in January → filter to December of the previous year. This must be handled explicitly in the backend using `new Date(year, month - 1, 1)` — JavaScript handles month=-1 correctly automatically.
- `search` contains `%` or `_` characters → must be escaped before ILIKE to prevent them acting as SQL wildcards.
- All jobs have no reporter/editor → `pending_total: 0`, empty jobs array for `status=pending`. Do not return null or error — empty array and 0 is a valid response.
- Summary is always calculated from the entire dataset (without period/search/status filter) OR follows the filter — decision: summary follows the filter (period + search + status).

---

## Acceptance Criteria

- `GET /api/v1/payments` without query params returns all jobs (paid + pending) and correct summary
- `?status=paid` returns only COMPLETED jobs
- `?status=pending` returns only non-COMPLETED jobs with reporter or editor assigned
- `?period=month` returns only jobs in the current month (by `completed_at` for paid, `created_at` for pending)
- `?search=rina` returns jobs where case_name, reporter_name, or editor_name contains "rina" (case-insensitive)
- COMPLETED jobs: `reporter_payment` and `editor_payment` are snapshot values, not recalculated
- Pending jobs: `reporter_payment` and `editor_payment` are estimated values calculated from settings
- `summary.pending_total` does not change when `?status=paid` (and vice versa) — summary reflects the active filter
- Endpoint returns 401 without token, 403 for non-admin

---

## Open Questions

- Does `summary` follow filters (`search`, `status`, `period`) or always compute from the full dataset?
- Does the `completed_at` column already exist in `jobs`, or does it need a migration?
- Does the `settings` table already have data for rate and flat fee, or does it need a seed/migration?
- Is the job list paginated, or loaded all at once?

---

## Testing Guidelines

Create test file `__tests__/payments.test.ts` for the following cases:

- `GET /api/v1/payments` without auth → 401
- `GET /api/v1/payments` with reporter/editor token → 403
- `GET /api/v1/payments` with admin token → 200 with correct summary + jobs structure
- `?status=paid` → COMPLETED jobs only
- `?status=pending` → non-COMPLETED with reporter/editor only
- `?period=month` → current month jobs only
- `?search=<term>` → filter case_name, reporter_name, editor_name
- Summary calculations: `total_payout`, `reporter_minutes`, `pending_total` computed correctly
- Job without reporter → `reporter_name: null`, `reporter_payment: null`
- Job without editor → `editor_name: null`, `editor_payment: null`
