---
name: project-patterns
description: Recurring code patterns, anti-patterns, and conventions observed across VoiceScript backend reviews
metadata:
  type: project
---

## Established conventions confirmed in code

- All SQL queries use parameterized `$N` placeholders — no string interpolation seen. Correct.
- Repository functions return typed results directly (`rows[0]!` or `rows[0] ?? null`).
- Controllers always wrap in try/catch and pass errors to `next(err)`.
- `sendSuccess` / `sendCreated` used consistently; no raw `res.json()` calls observed.
- `AppError.notFound()`, `AppError.conflict()`, `AppError.unauthorized()`, `AppError.forbidden()` are the static helpers in use.
- `AuthenticatedRequest` is used on authenticated controller functions.
- Env vars accessed only via `src/config/env.ts` — confirmed `jwt` block added there.

## Patterns to watch in future reviews

- **Layer bypass risk**: `admin.controller.ts` directly calls `bcrypt` and `userRepo` — password hashing business logic lives in the controller rather than the service layer. This is an architectural deviation: auth logic (hashing) belongs in a service. Flag if it recurs or if the controller grows.
- **Duplicate user-creation logic**: `createUser` and `registerReviewer` in `admin.controller.ts` share nearly identical bodies (validation, email check, hash, create). This pattern has appeared once — worth flagging if a third variant appears.
- **Insecure fallback secrets**: `env.jwt.accessSecret` and `env.jwt.refreshSecret` fall back to hardcoded strings (`'change-me-access-secret'`) when env vars are absent. This is a recurring risk pattern to watch — the server will start with weak secrets in misconfigured deployments.
- **`UserPublic` schema drift**: `findPublicById` and `findAll` return `created_at` in the SQL but `UserPublic` interface only defines `{ id, name, email, role }`. The extra column is returned to clients silently. Monitor for similar schema/interface mismatches.
- **`SELECT *` on sensitive tables**: `findByEmail` and `findById` in `user.repository.ts` use `SELECT *` which returns `password_hash` — only acceptable because the callers (auth service) need it. Future callers must not leak this to clients.
- **Magic number duplication**: `7 * 24 * 60 * 60 * 1000` (refresh token TTL) appears in both `auth.service.ts` and `auth.controller.ts` independently. Should be a single constant derived from `env.jwt.refreshExpiresIn`.

**Why:** These patterns have caused or could cause data leaks, architectural drift, or security issues. Track them across sessions to detect escalation.
**How to apply:** Flag each instance when reviewing new diffs that touch auth, user management, or token handling.
