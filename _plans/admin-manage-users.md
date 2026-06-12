# Plan: Admin Manage Users

## Context

Implementasi endpoint manajemen user oleh admin: `GET /admin/users` (list paginated + filter role), update `POST /admin/users` (batasi ke reporter/reviewer, tambah validasi password), dan `DELETE /admin/users/:id` (hard delete, tidak bisa hapus diri sendiri). Spec: `_specs/admin-manage-users.md`.

---

## Phase 1 — Repository

### Update `src/repositories/user.repository.ts`

Tambah 3 fungsi baru:

**`findAll(filters?, pagination?)`** → `{ users: UserPublic[], total: number }`
- Filter opsional: `{ role?: Role }`
- Pagination opsional: `{ page: number, limit: number }` — default page 1, limit 10, maks 100
- Gunakan `COUNT(*) OVER()` window function (pola sama dengan `job.repository.ts`)
- SELECT: id, name, email, role, created_at — tanpa password_hash

**`deleteById(id: string)`** → `void`
- `DELETE FROM users WHERE id = $1`

**`updateRole(id: string, role: Role)`** → `UserPublic`
- `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, email, role, created_at`

Update `UserPublic` di `src/models/user.model.ts` — tambah field `created_at: Date`.

---

## Phase 2 — Controller

### Update `src/controllers/admin.controller.ts`

**Update `createUser`:**
- `VALID_ROLES` tetap `['admin', 'reporter', 'reviewer']` — admin boleh buat semua role
- Tambah validasi: `password.length < 8` → `AppError(400)`

**Tambah `listUsers(req, res, next)`:**
- Parse `page`, `limit` dari `req.query` (sama dengan `job.controller.ts`)
- Parse `role` dari `req.query` — validasi hanya `reporter` atau `reviewer` jika dikirim, selain itu 400
- Panggil `userRepo.findAll(filters, pagination)`
- Return `sendSuccess(res, { users, pagination: { total, page, limit, total_pages } })`

**Tambah `deleteUser(req, res, next)`:**
- Baca `id` dari `req.params.id`
- Jika `id === req.user!.id` → `AppError(400, 'Cannot delete your own account')`
- Panggil `userRepo.findById(id)` — jika null → `AppError.notFound('User not found')`
- Panggil `userRepo.deleteById(id)`
- Return `sendSuccess(res, null, 'User deleted successfully')`

**Tambah `updateUserRole(req, res, next)`:**
- Baca `id` dari `req.params.id`, `role` dari `req.body`
- Validasi `role` harus salah satu dari `['admin', 'reporter', 'reviewer']` → `AppError(400)`
- Panggil `userRepo.findById(id)` — jika null → `AppError.notFound('User not found')`
- Panggil `userRepo.updateRole(id, role)`
- Return `sendSuccess(res, { user }, 'User role updated successfully')`

---

## Phase 3 — Routes + Swagger

### Update `src/routes/admin.routes.ts`

```
GET    /users          → authenticate, authorize(['admin']), adminController.listUsers
POST   /users          → authenticate, authorize(['admin']), adminController.createUser  (sudah ada, update Swagger)
DELETE /users/:id      → authenticate, authorize(['admin']), adminController.deleteUser
PATCH  /users/:id/role → authenticate, authorize(['admin']), adminController.updateUserRole
```

Swagger JSDoc:
- `GET /admin/users`: query params `page`, `limit`, `role` (optional enum admin|reporter|reviewer). Response 200 array UserPublic + pagination.
- `POST /admin/users`: update description — role bisa `admin`, `reporter`, atau `reviewer`. Tambah password min 8 chars.
- `DELETE /admin/users/:id`: path param `id`. Response 200, error 400 (self-delete) / 404.
- `PATCH /admin/users/:id/role`: body `{ role }` enum admin|reporter|reviewer. Response 200 updated user, error 400 / 404.

Update `src/config/swagger.ts` — update schema `UserPublic` tambah `created_at`.

---

## Phase 4 — Tests

### `__tests__/admin.test.ts` (file baru)

Mock: `jest.mock('../src/repositories/user.repository')`
Admin token: `tokenService.signAccessToken({ id: 'admin-uuid', email: 'admin@test.com', role: 'admin' })`

Test cases (16):
1. `GET /admin/users` admin token → 200, array + pagination metadata
2. `GET /admin/users?role=reporter` → `findAll` dipanggil dengan filter role
3. `GET /admin/users?role=invalid` → 400
4. `GET /admin/users` tanpa token → 401
5. `GET /admin/users` reporter token → 403
6. `POST /admin/users` role reporter → 201
7. `POST /admin/users` role reviewer → 201
8. `POST /admin/users` role admin → 201
9. `POST /admin/users` password < 8 karakter → 400
10. `POST /admin/users` email duplikat → 409
11. `DELETE /admin/users/:id` valid → 200
12. `DELETE /admin/users/:id` ID sendiri → 400
13. `DELETE /admin/users/:id` ID tidak ada → 404
14. `PATCH /admin/users/:id/role` valid → 200, role terupdate
15. `PATCH /admin/users/:id/role` role tidak valid → 400
16. `PATCH /admin/users/:id/role` ID tidak ada → 404

---

## Verification

1. `npm run type-check` — 0 errors
2. `npm test` — semua test hijau
3. Manual: `GET /admin/users`, `POST /admin/users`, `DELETE /admin/users/:id` via Swagger UI `http://localhost:3000/api/docs`
