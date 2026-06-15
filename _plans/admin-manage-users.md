# Plan: Admin Manage Users

## Context

Implementation of admin user management endpoints: `GET /admin/users` (paginated list with role filter), `POST /admin/users` (restricted to reporter/reviewer, with password validation), and `DELETE /admin/users/:id` (hard delete, cannot delete own account). Spec: `_specs/admin-manage-users.md`.

---

## Phase 1 — Repository

### Update `src/repositories/user.repository.ts`

Add 3 new functions:

**`findAll(filters?, pagination?)`** → `{ users: UserPublic[], total: number }`
- Optional filter: `{ role?: Role }`
- Optional pagination: `{ page: number, limit: number }` — default page 1, limit 10, max 100
- Use `COUNT(*) OVER()` window function (same pattern as `job.repository.ts`)
- SELECT: id, name, email, role, created_at — no password_hash

**`deleteById(id: string)`** → `void`
- `DELETE FROM users WHERE id = $1`

**`updateRole(id: string, role: Role)`** → `UserPublic`
- `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, email, role, created_at`

Update `UserPublic` in `src/models/user.model.ts` — add `created_at: Date` field.

---

## Phase 2 — Controller

### Update `src/controllers/admin.controller.ts`

**Update `createUser`:**
- `VALID_ROLES` remains `['admin', 'reporter', 'reviewer']` — admin can create any role
- Add validation: `password.length < 8` → `AppError(400)`

**Add `listUsers(req, res, next)`:**
- Parse `page`, `limit` from `req.query` (same pattern as `job.controller.ts`)
- Parse `role` from `req.query` — validate it is only `reporter` or `reviewer` if provided, otherwise 400
- Call `userRepo.findAll(filters, pagination)`
- Return `sendSuccess(res, { users, pagination: { total, page, limit, total_pages } })`

**Add `deleteUser(req, res, next)`:**
- Read `id` from `req.params.id`
- If `id === req.user!.id` → `AppError(400, 'Cannot delete your own account')`
- Call `userRepo.findById(id)` — if null → `AppError.notFound('User not found')`
- Call `userRepo.deleteById(id)`
- Return `sendSuccess(res, null, 'User deleted successfully')`

**Add `updateUserRole(req, res, next)`:**
- Read `id` from `req.params.id`, `role` from `req.body`
- Validate `role` must be one of `['admin', 'reporter', 'reviewer']` → `AppError(400)`
- Call `userRepo.findById(id)` — if null → `AppError.notFound('User not found')`
- Call `userRepo.updateRole(id, role)`
- Return `sendSuccess(res, { user }, 'User role updated successfully')`

---

## Phase 3 — Routes + Swagger

### Update `src/routes/admin.routes.ts`

```
GET    /users          → authenticate, authorize(['admin']), adminController.listUsers
POST   /users          → authenticate, authorize(['admin']), adminController.createUser  (already exists, update Swagger)
DELETE /users/:id      → authenticate, authorize(['admin']), adminController.deleteUser
PATCH  /users/:id/role → authenticate, authorize(['admin']), adminController.updateUserRole
```

Swagger JSDoc:
- `GET /admin/users`: query params `page`, `limit`, `role` (optional enum admin|reporter|reviewer). Response 200 array UserPublic + pagination.
- `POST /admin/users`: update description — role can be `admin`, `reporter`, or `reviewer`. Add password min 8 chars.
- `DELETE /admin/users/:id`: path param `id`. Response 200, error 400 (self-delete) / 404.
- `PATCH /admin/users/:id/role`: body `{ role }` enum admin|reporter|reviewer. Response 200 updated user, error 400 / 404.

Update `src/config/swagger.ts` — update `UserPublic` schema to add `created_at`.

---

## Phase 4 — Tests

### `__tests__/admin.test.ts` (new file)

Mock: `jest.mock('../src/repositories/user.repository')`
Admin token: `tokenService.signAccessToken({ id: 'admin-uuid', email: 'admin@test.com', role: 'admin' })`

Test cases (16):
1. `GET /admin/users` with admin token → 200, array + pagination metadata
2. `GET /admin/users?role=reporter` → `findAll` called with role filter
3. `GET /admin/users?role=invalid` → 400
4. `GET /admin/users` without token → 401
5. `GET /admin/users` with reporter token → 403
6. `POST /admin/users` role reporter → 201
7. `POST /admin/users` role reviewer → 201
8. `POST /admin/users` role admin → 201
9. `POST /admin/users` password < 8 characters → 400
10. `POST /admin/users` duplicate email → 409
11. `DELETE /admin/users/:id` valid → 200
12. `DELETE /admin/users/:id` own ID → 400
13. `DELETE /admin/users/:id` non-existent ID → 404
14. `PATCH /admin/users/:id/role` valid → 200, role updated
15. `PATCH /admin/users/:id/role` invalid role → 400
16. `PATCH /admin/users/:id/role` non-existent ID → 404

---

## Verification

1. `npm run type-check` — 0 errors
2. `npm test` — all tests green
3. Manual: `GET /admin/users`, `POST /admin/users`, `DELETE /admin/users/:id` via Swagger UI `http://localhost:3000/api/docs`
