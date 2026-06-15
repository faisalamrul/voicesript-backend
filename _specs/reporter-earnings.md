# Spec for reporter-earnings

branch: claude/feature/reporter-earnings

## Summary

Earnings page in the reporter portal that displays an income summary, job history, and work statistics. Data shown is only for the currently logged-in reporter. Supports period filtering (all time / this month / last month), a bar chart showing 6-month income trends, and export of the summary to PDF/CSV.

## Functional Requirements

### Summary Cards
- **Total Earned** — total `reporter_payment` from all jobs with status `COMPLETED`
- **This Month** — total `reporter_payment` from `COMPLETED` jobs in the current calendar month
- **Pending** — estimated pay from jobs with status `REVIEWED` (not yet completed by admin); calculated as `FLOOR(duration / 60) × Rp 2,000`
- **Total Minutes** — total audio minutes transcribed from all `COMPLETED` jobs; calculated as `FLOOR(duration / 60)`

All cards update when the period filter changes, except **Total Earned** and **Total Minutes** which always display all-time values.

### Period Filter
Dropdown at the top right of the page with options:
- All time (default)
- This month
- Last month

Filter applies to the job list table and the **This Month** card.

### Job List Table
Shows all jobs where `reporter_id = logged-in user id`, with columns:
- **Case Name** + location (physical/remote)
- **Duration** in minutes
- **Job Status** (`ASSIGNED`, `TRANSCRIBED`, `REVIEWED`, `COMPLETED`)
- **Payment** — snapshot `reporter_payment` if `COMPLETED`; estimated `FLOOR(duration/60) × Rp 2,000` in muted style if not yet complete
- **Payment Status** — badge:
  - `Paid` (green) — status `COMPLETED`
  - `Pending` (orange) — status `REVIEWED`
  - `In Progress` (grey) — status `ASSIGNED` or `TRANSCRIBED`

### Monthly Income Chart
A simple bar chart showing total `reporter_payment` per month for the last 6 months. Months without income are shown as an empty bar (value 0). Useful for visualising trends.

### Real-time Pay Estimate
For jobs in `ASSIGNED` status currently being worked on, show an estimated payment based on job duration — e.g. "Estimate: Rp 120,000 for this job" — directly in the table row or as a tooltip/info in the payment column.

### Export Summary
An export button in the header/filter area that generates:
- **CSV** — job list data matching the active period filter
- **PDF** — summary + job table, suitable for personal financial records

### Rate Info
At the bottom of the page, display the current applicable rate: "Current rate: Rp 2,000 / minute" so reporters understand how their pay is calculated.

### Work Statistics
A few small numbers on the page, displayed as a row or separate cards:
- Jobs completed this month (status `COMPLETED` in current calendar month)
- Average job duration (from all jobs ever worked on)
- Total jobs throughout career

## Possible Edge Cases

- Reporter has no jobs at all — all cards show 0, table is empty with a clear empty state. Always return 200 with a consistent structure — do not return 404 or error. Summary all zeros, jobs array empty.
- No `COMPLETED` jobs in the current month — "This Month" = Rp 0. Return 0 — covered as long as the query uses COALESCE so SUM does not return NULL.
- No `REVIEWED` jobs — "Pending" = Rp 0. Same as above, use COALESCE.
- "Last month" filter in January — must handle rollover to December of the previous year. Do not manually compute month - 1 in SQL — use DATE_TRUNC and INTERVAL which handle rollover automatically.
- Job with very short duration (< 60 seconds) — `FLOOR` produces 0 minutes, estimated pay = Rp 0; this should be displayed clearly so it does not confuse the reporter. No need to reject jobs with duration < 60 seconds — that is a business decision already made at job creation (duration >= 1). The backend simply returns the data as-is.
- Export when the table is empty — file is still generated with column headers but no data rows.
- Large number of jobs (pagination) — export must fetch all data, not just the currently displayed page. Use limit=all and skip pagination — return all data at once. Add a guard so this can only be used by the reporter themselves.

## Acceptance Criteria

- [ ] Page is only accessible by users with `reporter` role
- [ ] Summary cards display correct values per the defined formulas
- [ ] Period filter changes the "This Month" card and table data in sync
- [ ] Payment Status badge appears with the correct colour per job status
- [ ] Payment column shows the snapshot value for COMPLETED and muted estimate for non-COMPLETED
- [ ] Bar chart shows the last 6 months; months without data are shown as 0
- [ ] Pay estimate appears on rows with `ASSIGNED` status
- [ ] Export button generates a CSV/PDF file containing data matching the active filter
- [ ] Rate info is shown at the bottom of the page
- [ ] Work statistics shows 3 numbers: jobs this month, average duration, total career jobs
- [ ] Page shows an informative empty state when the reporter has no jobs

## Open Questions

- PDF export format: does it need VoiceScript branding/logo, or is a plain table sufficient? Plain table is sufficient.
- Is average job duration calculated from all jobs (including in-progress) or only from COMPLETED jobs? Only from COMPLETED jobs.
- Is the table paginated, or are all jobs loaded at once (lazy load / infinite scroll)? Paginated.
- Does the real-time pay estimate on ASSIGNED rows need auto-refresh, or is a static value at page load sufficient? Static at page load is sufficient.

## Testing Guidelines

Create a test file(s) in the `./__tests__` folder for the new features, and creates meaningful tests for the following cases, without going too heavy:

- Summary cards return correct values for all-time and filtered by period
- Pending calculation uses FLOOR(duration/60) × 2000, not CEIL
- Period filter "last month" correctly handles January (rolls over to December previous year)
- Job with duration < 60 seconds shows Rp 0 estimation without error
- Payment status badge logic: COMPLETED → Paid, REVIEWED → Pending, ASSIGNED/TRANSCRIBED → In Progress
- Reporter can only see their own jobs (data isolation)
- Export endpoint returns all data matching active filter, not just current page
