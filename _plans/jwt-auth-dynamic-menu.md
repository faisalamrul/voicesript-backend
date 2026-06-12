# Plan: JWT Auth + Dynamic Menu Sidebar

## Context

Implementasi sistem autentikasi dan otorisasi berbasis JWT untuk VoiceScript backend. Fitur ini mencakup register, login, refresh token (dengan rotasi), logout, dynamic menu per role, middleware auth, dan endpoint admin untuk membuat user. Data dari spec `_specs/jwt-auth-dynamic-menu.md`.

Open Questions yang sudah dijawab di spec:
- RTR (Refresh Token Rotation) — **Ya, wajib**
- Admin endpoint — **Ya, `POST /api/v1/admin/users`**
- Nested menu — **Ya, struktur harus support dari awal**
- Max active devices — **3–5 perangkat**
- Menu data — **Seed via migration**

---

## Phase 1 — Install Dependencies

```
npm install jsonwebtoken bcrypt
npm install -D @types/jsonwebtoken @types/bcrypt jest ts-jest @types/jest supertest @types/supertest
```

---

## Phase 2 — Database Migrations

### `src/migrations/001_auth_schema.sql`
- `CREATE TYPE user_role AS ENUM ('admin', 'reporter', 'reviewer')`
- `CREATE TABLE users` — id uuid PK, name, email unique, password_hash, role user_role DEFAULT 'reporter', created_at, updated_at
- `CREATE TABLE menus` — id uuid PK, title, path, icon, parent_id (FK self-ref nullable, untuk nested), sort_order int
- `CREATE TABLE role_menus` — (role user_role, menu_id uuid FK) composite PK
- `CREATE TABLE refresh_tokens` — id uuid PK, user_id FK, token_hash text unique, expires_at timestamptz, created_at
- Index: `idx_refresh_tokens_user_id`, `idx_refresh_tokens_token_hash`

### `src/migrations/002_seed_menus.sql`
Seed menu dan role_menus dengan UUIDs tetap:
- **admin** → Jobs, Payments
- **reporter** → My Jobs, Payments
- **reviewer** → Jobs, Payments

### `src/migrations/migrate.ts`
Script runner: baca file SQL secara urut dari folder, jalankan via `pool.query()`. Dijalankan dengan `npx ts-node src/migrations/migrate.ts`.

---

## Phase 3 — Config & Types

### `src/config/env.ts` — tambahkan section `jwt`:
```
jwt: {
  accessSecret, refreshSecret,
  accessExpiresIn: '15m',
  refreshExpiresIn: '7d',
  maxActiveDevices: 5,
}
```

### `.env` & `.env.example` — tambahkan:
```
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
MAX_ACTIVE_DEVICES=5
```

### `src/types/index.ts` — update/tambah:
- `Role = 'admin' | 'reporter' | 'reviewer'`
- `AuthenticatedRequest.user` → tambahkan `role: Role`
- `MenuItem` interface: `{ id, title, path, icon, sort_order, parent_id, children? }`

---

## Phase 4 — Models

### `src/models/user.model.ts`
- `User` — semua field DB
- `UserPublic` — `{ id, name, email, role }` (yang dikembalikan ke client)

### `src/models/menu.model.ts`
- `MenuRow` — flat DB row
- `MenuItem` — dengan `children?: MenuItem[]` untuk nested

---

## Phase 5 — Repositories

### `src/repositories/user.repository.ts`
- `findByEmail(email)` → `User | null`
- `findById(id)` → `User | null`
- `create({ name, email, passwordHash, role })` → `User`

### `src/repositories/menu.repository.ts`
- `findByRole(role)` → `MenuRow[]` (flat, include parent_id)

### `src/repositories/refreshToken.repository.ts`
- `create({ userId, tokenHash, expiresAt })` → `void`
- `findByHash(hash)` → `{ id, userId, expiresAt } | null`
- `deleteByHash(hash)` → `void`
- `countByUserId(userId)` → `number`
- `deleteOldestByUserId(userId)` → `void` (delete by MIN created_at)

---

## Phase 6 — Services

### `src/services/token.service.ts`
- `signAccessToken(payload: { id, email, role })` → `string`
- `signRefreshToken(payload: { id })` → `string`
- `verifyAccessToken(token)` → decoded payload atau throw `AppError.unauthorized()`
- `verifyRefreshToken(token)` → decoded payload atau throw `AppError.unauthorized()`
- `hashToken(rawToken)` → `string` — SHA-256 hex digest (pakai `crypto.createHash`)

**Catatan bcrypt 72-byte**: pre-hash password dengan SHA-256 sebelum bcrypt untuk handle password panjang.

### `src/services/menu.service.ts`
- `buildMenuTree(flatMenus: MenuRow[])` → `MenuItem[]`  
  Rekursif: root items (parent_id null) → attach children → sort by sort_order

### `src/services/auth.service.ts`
- `register({ name, email, password, role? })`:
  1. Tolak role `admin` → throw `new AppError('...', 400)`
  2. Check duplikat email → throw `AppError.conflict(...)`
  3. Pre-hash password (SHA-256) → bcrypt hash (12 rounds)
  4. Insert user → return `UserPublic`

- `login({ email, password })`:
  1. `findByEmail` → not found → `AppError.unauthorized('Invalid credentials')`
  2. Compare password (pre-hash + bcrypt) → mismatch → `AppError.unauthorized('Invalid credentials')`
  3. Enforce max active devices: if `countByUserId >= MAX_ACTIVE_DEVICES` → `deleteOldestByUserId`
  4. Sign refresh token → `hashToken` → insert `refresh_tokens`
  5. Sign access token
  6. `findByRole(user.role)` → `buildMenuTree`
  7. Return `{ user: UserPublic, tokens: { access_token, refresh_token }, allowed_menus }`

- `refreshToken({ rawRefreshToken })`:
  1. `verifyRefreshToken` → decode → get userId
  2. `hashToken` → `findByHash` → not found → `AppError.unauthorized('Token invalid or revoked')`
  3. Check `expires_at > NOW` → expired → `AppError.unauthorized('Token expired')`
  4. **RTR**: `deleteByHash(oldHash)` → sign new refresh token → `hashToken` → insert
  5. Sign new access token
  6. Return `{ access_token, refresh_token }`

- `logout({ rawRefreshToken })`:
  1. `hashToken` → `deleteByHash` (silent fail jika tidak ada)

---

## Phase 7 — Controllers

### `src/controllers/auth.controller.ts`
4 handlers: `register`, `login`, `refreshToken`, `logout`  
- Semua pakai `sendSuccess` / `sendCreated` / throw `AppError`
- `login` response: `sendSuccess(res, { user, tokens, allowed_menus }, 'Login successful')`

### `src/controllers/admin.controller.ts`
- `createUser`: admin bisa buat user dengan role apapun (termasuk admin)
  - Validasi field lengkap
  - Hash password seperti di auth.service
  - Return `sendCreated`

---

## Phase 8 — Middlewares

### `src/middlewares/authenticate.ts`
- Extract `Authorization: Bearer <token>` header
- `verifyAccessToken(token)` → set `req.user = { id, email, role }`
- Missing/invalid → `AppError.unauthorized()`

### `src/middlewares/authorize.ts`
- Factory: `authorize(roles: Role[]) → RequestHandler`
- Cek `req.user.role` ada di `roles` → lanjut
- Tidak ada → `AppError.forbidden()`

---

## Phase 9 — Routes

### `src/routes/auth.routes.ts`
```
POST /register        → authController.register
POST /login           → authController.login
POST /refresh-token   → authController.refreshToken
POST /logout          → authenticate, authController.logout
```

### `src/routes/admin.routes.ts`
```
POST /users → authenticate, authorize(['admin']), adminController.createUser
```

### `src/routes/index.ts` — tambahkan:
```typescript
router.use('/auth', authRouter);
router.use('/admin', adminRouter);
```

---

## Phase 10 — Tests

### Setup: `jest.config.js` + ts-jest preset

### `__tests__/auth.test.ts`
Gunakan `supertest` + app langsung (tanpa start server). Mock `pool` dengan `jest.mock`.

Test cases:
1. `POST /register` → sukses, role default `reporter`
2. `POST /register` → tolak role `admin` (400)
3. `POST /register` → duplikat email (409)
4. `POST /login` → sukses, response shape benar termasuk `allowed_menus`
5. `POST /login` → kredensial salah (401)
6. `POST /refresh-token` → sukses, dapat access_token baru
7. `POST /refresh-token` → token invalid (401)
8. Route terproteksi tanpa token → 401
9. Route dengan role salah → 403

---

## Phase 11 — npm Scripts Update

Tambahkan ke `package.json`:
```json
"migrate": "ts-node src/migrations/migrate.ts",
"test": "jest --runInBand",
"test:watch": "jest --watch"
```

---

## Verification

1. `npm run migrate` → jalankan migrasi (butuh DB aktif via `docker compose up db`)
2. `npm run dev` → server start, log "Database connected"
3. Manual test via curl/Postman:
   - `POST /api/v1/auth/register` dengan body valid
   - `POST /api/v1/auth/login` → pastikan `allowed_menus` sesuai role
   - `POST /api/v1/auth/refresh-token` → pastikan token lama tidak bisa dipakai ulang (RTR)
4. `npm run type-check` → 0 errors
5. `npm test` → semua test hijau
