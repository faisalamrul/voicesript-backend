# Spec for Job Status Workflow

branch: claude/feature/job-status-workflow

## Summary

Full implementation of the job lifecycle state machine: `NEW → ASSIGNED → TRANSCRIBED → REVIEWED → COMPLETED`. Five new endpoints handle each transition, with strict role-based authorization, sequential status enforcement, and automatic payment calculation when a job is completed.

## Functional Requirements

### State Machine
Status transitions are sequential and enforced at every endpoint. No transition may be skipped. The existing `jobStateMachine` utility must be used for all transition validation.

```
NEW → ASSIGNED → TRANSCRIBED → REVIEWED → COMPLETED
```

---

### 1. Assign Reporter — `POST /api/v1/jobs/:id/assign-reporter` (Admin only)
- Job must be in `NEW` status; any other status → 400
- Request body: `{ "reporter_id": "uuid" }`
- Reporter must exist, have the `reporter` role, and `availability: true`
- For jobs with `location: "physical"`, reporters whose `city` matches the job `city` are sorted to the top (recommended, but reporters from other cities can still be assigned)
- On success: set `reporter_id` on the job and change status to `ASSIGNED`

### 2. Submit Transcript — `PATCH /api/v1/jobs/:id/submit-transcript` (Reporter only)
- Only the reporter assigned to the job can call this endpoint; other users → 403
- Job must be in `ASSIGNED` status; any other status → 400
- Request body: `{ "transcript_notes": "string" }` (optional)
- On success: change status to `TRANSCRIBED`, system automatically sets `submitted_at` to current timestamp

### 3. Assign Editor — `POST /api/v1/jobs/:id/assign-editor` (Admin only)
- Job must be in `TRANSCRIBED` status; any other status → 400
- Request body: `{ "editor_id": "uuid" }`
- Editor must exist, have the `editor` role, and `availability: true`
- On success: set `editor_id` on the job; **status remains `TRANSCRIBED`** (does not change)

### 4. Mark as Reviewed — `PATCH /api/v1/jobs/:id/mark-reviewed` (Editor only)
- Only the editor assigned to the job can call this endpoint; other users → 403
- Job must be in `TRANSCRIBED` status; any other status → 400
- Request body: `{ "review_notes": "string" }` (optional)
- On success: change status to `REVIEWED`, system automatically sets `reviewed_at` to current timestamp

### 5. Mark as Completed — `PATCH /api/v1/jobs/:id/complete` (Admin only)
- Job must be in `REVIEWED` status; any other status → 400
- No request body required
- On success: change status to `COMPLETED`
- Payments are calculated and finalized at this point:
  - Reporter: `ceil(duration / 60) × Rp 2,000`
  - Editor: flat Rp 50,000

---

### General Rules
- All endpoints require authentication (valid access token via HttpOnly cookie / Bearer header)
- Authorization is strictly enforced per role — cross-role actions are rejected with 403
- Return 404 if job not found
- Return 403 if user does not have permission
- Return 400 if status transition is invalid

## Possible Edge Cases

- Assign an unavailable reporter (`availability: false`) → 400
- Assign an unavailable editor (`availability: false`) → 400
- Reporter tries to submit transcript for a job not assigned to them → 403
- Editor tries to mark-reviewed for a job not assigned to them → 403
- Admin tries to assign reporter to a job already in `ASSIGNED` or later status → 400
- Admin tries to complete a job still in `TRANSCRIBED` status (skipping `REVIEWED`) → 400
- Assign a user with the wrong role as reporter (e.g. editor) → 400
- Assign a user with the wrong role as editor (e.g. reporter) → 400
- UUID `reporter_id` or `editor_id` does not exist in database → 404
- Calling submit-transcript on a job where `submitted_at` is already set (re-submit) — blocked by status check
- City matching for physical jobs: reporters from a different city can still be assigned (not blocked, just ranked lower)

## Acceptance Criteria

- `POST /jobs/:id/assign-reporter` with available reporter on `NEW` job → 200, status becomes `ASSIGNED`, `reporter_id` saved
- `POST /jobs/:id/assign-reporter` on a non-`NEW` job → 400
- `POST /jobs/:id/assign-reporter` with unavailable reporter → 400
- `PATCH /jobs/:id/submit-transcript` by assigned reporter on `ASSIGNED` job → 200, status becomes `TRANSCRIBED`, `submitted_at` set
- `PATCH /jobs/:id/submit-transcript` by a different reporter → 403
- `PATCH /jobs/:id/submit-transcript` on a non-`ASSIGNED` job → 400
- `POST /jobs/:id/assign-editor` with available editor on `TRANSCRIBED` job → 200, status stays `TRANSCRIBED`, `editor_id` saved
- `POST /jobs/:id/assign-editor` on a non-`TRANSCRIBED` job → 400
- `PATCH /jobs/:id/mark-reviewed` by assigned editor on `TRANSCRIBED` job → 200, status becomes `REVIEWED`, `reviewed_at` set
- `PATCH /jobs/:id/mark-reviewed` by a different editor → 403
- `PATCH /jobs/:id/mark-reviewed` on a non-`TRANSCRIBED` job → 400
- `PATCH /jobs/:id/complete` on `REVIEWED` job → 200, status becomes `COMPLETED`
- `PATCH /jobs/:id/complete` on a non-`REVIEWED` job → 400
- All endpoints return 401 without a valid token
- All endpoints return 404 if job not found

## Open Questions

- Are `transcript_notes` and `review_notes` stored in the `jobs` table, or in a separate table (e.g. audit/notes)? Directly in the jobs table.
- Does the `availability` column already exist in users, or does it need to be added via migration? Does not exist yet — add it.
- Do the `submitted_at` and `reviewed_at` columns already exist in `jobs`? `submitted_at` already exists, `reviewed_at` does not.
- Should the payment amounts (`reporter_payment`, `editor_payment`) be stored in the job record at completion, or calculated on-the-fly?
  Snapshot stored at COMPLETED, but can still be calculated on-the-fly before that.
  Reason: if the rate changes in the future (e.g. from Rp 2,000 to Rp 2,500), already-COMPLETED jobs must still reflect the old rate at the time they were completed. If calculated on-the-fly only, the numbers would change with the new rate — historical data would be wrong.

## Testing Guidelines

Create file `__tests__/job-workflow.test.ts`. Mock `job.repository` and `user.repository`. Use `tokenService.signAccessToken` to create tokens per role.

- `POST /jobs/:id/assign-reporter`
  - Valid reporter + job NEW → 200, status ASSIGNED
  - Job not NEW → 400
  - Reporter not found → 404
  - Wrong reporter role or availability false → 400
  - Without token → 401
  - Reporter token (not admin) → 403
- `PATCH /jobs/:id/submit-transcript`
  - Assigned reporter + job ASSIGNED → 200, status TRANSCRIBED
  - Different reporter → 403
  - Job not ASSIGNED → 400
  - Without token → 401
- `POST /jobs/:id/assign-editor`
  - Valid editor + job TRANSCRIBED → 200, status stays TRANSCRIBED
  - Job not TRANSCRIBED → 400
  - Editor not found or unavailable → 400/404
  - Reporter token → 403
- `PATCH /jobs/:id/mark-reviewed`
  - Assigned editor + job TRANSCRIBED → 200, status REVIEWED
  - Different editor → 403
  - Job not TRANSCRIBED → 400
- `PATCH /jobs/:id/complete`
  - Job REVIEWED → 200, status COMPLETED
  - Job not REVIEWED → 400
  - Reporter token → 403
