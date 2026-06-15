# Spec for create-court-reporting-job

branch: claude/feature/create-court-reporting-job

## Summary

REST API endpoint for creating a court reporting job. An admin creates a job with case information, audio duration, and location. Jobs start with status `NEW` and follow a strict status lifecycle. The system calculates reporter pay based on audio duration. Physical jobs require city information for reporter matching purposes.

## Functional Requirements

### Endpoint
- `POST /api/v1/jobs` — create a new job, accessible by admin only (requires authentication + admin role)

### Request Body
- `case_name` — string, required
- `duration` — integer, required, minimum 1 (seconds), used to calculate reporter pay: `floor(duration / 60) × Rp 2,000`
- `location` — enum required, accepted values: `physical` or `remote`
- `city` — string, required only when `location` is `physical`; must be omitted or null when `remote`

### System-set Fields (not from request body)
- `status` — always set to `NEW` on creation, never accepted from client
- `reporter_id` — null on creation, filled later on assignment
- `editor_id` — null on creation, filled later on assignment
- `created_at` — auto timestamp

### Status Lifecycle (State Machine)
Status can only move forward sequentially, no skipping:
```
NEW → ASSIGNED → TRANSCRIBED → REVIEWED → COMPLETED
```
- Every transition must be validated by the state machine in the backend
- Invalid transitions (e.g. NEW → TRANSCRIBED) must be rejected

### Business Logic
- Jobs with status `NEW` appear in the admin job list
- Only jobs with status `NEW` can be assigned to a reporter — jobs that are already `ASSIGNED` or further cannot be reassigned
- When `location` is `physical`, assignment logic prefers reporters whose city matches the job city
- When `location` is `remote`, any reporter can be assigned regardless of city

### Response (201 Created)
Returns the newly created job object with all fields including system-set fields.

## Possible Edge Cases

- `duration` less than 1 — reject with 400
- `location` is `physical` but `city` not sent — reject with 400
- `location` is `remote` but `city` sent — silently ignore the `city` value
- `status` sent in request body — ignore, always force to `NEW`
- `reporter_id` or `editor_id` sent in request body — ignore, always null
- `duration` sent as float (e.g. 30.5) — reject with 400, must be integer
- `case_name` is empty string or whitespace only — reject with 400
- `location` contains a value other than `physical` or `remote` — reject with 400
- Invalid status transition (e.g. jump directly to `COMPLETED`) — reject with 400

## Acceptance Criteria

- `POST /api/v1/jobs` with valid body returns 201 and job object with `status: "NEW"`, `reporter_id: null`, `editor_id: null`
- `duration` less than 1 returns 400 with a clear message
- `location: "physical"` without `city` returns 400 with a clear message
- `location: "remote"` succeeds without `city` field
- `status`, `reporter_id`, `editor_id` fields in request body are ignored — values always set by the system
- State machine rejects non-sequential status transitions
- New job with status `NEW` appears in the admin job list
- Endpoint is only accessible by admin (non-admin gets 403)

## Open Questions

- Should `city` sent when `location: "remote"` be rejected (400) or silently ignored? Silently ignored.
- Is the reporter pay calculation (`floor(duration / 60) × Rp 2,000`) stored as a field in the jobs table, or always calculated on-the-fly when needed? Calculate on-the-fly, do not store in the table.
- Is there a maximum limit for the `duration` value? The assessment does not mention one — but logically the longest court sessions rarely exceed 8 hours (480 minutes). Recommendation: set a max of 600 minutes as a safeguard, or confirm with PM. For the assessment, min: 1 with no max is also acceptable.
- Does `case_name` need to be unique, or can multiple jobs share the same case name? Not required to be unique.
- Who can access `GET /jobs` — admin only, or can reporters also see jobs assigned to them? Depends on role:
  - Admin: `GET /jobs` — all jobs without filter
  - Reporter: `GET /jobs` — only jobs assigned to them
  - Editor: `GET /jobs` — only jobs assigned to them

## Testing Guidelines

Create a test file(s) in the `./__tests__` folder for the new features, and creates meaningful tests for the following cases, without going too heavy:

- `POST /jobs` with valid body and `location: "physical"` returns 201 with correct response structure
- `POST /jobs` with valid body and `location: "remote"` (without `city`) returns 201
- `duration` less than 1 returns 400
- `duration` not an integer returns 400
- `case_name` empty or missing returns 400
- `location: "physical"` without `city` returns 400
- `location` with invalid value returns 400
- `status` field in request body is ignored — response always `NEW`
- Non-admin trying to create a job gets 403
