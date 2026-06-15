# Plan: JWT Auth + Dynamic Menu Sidebar

## Context

Implementation of JWT-based authentication and authorization for the VoiceScript backend. This feature covers registration, login, refresh token (with rotation), logout, dynamic role-based menus, auth middleware, and an admin endpoint to create users. Data from spec `_specs/jwt-auth-dynamic-menu.md`.

Open Questions already answered in spec:
- RTR (Refresh Token Rotation) — **Yes, required**
- Admin endpoint — **Yes, `POST /api/v1/admin/users`**
- Nested menu — **Yes, structure must support nesting from the start**
- Max active devices — **3–5 devices**
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
- `CREATE TABLE menus` — id uuid PK, title, path, icon, parent_id (self-ref FK nullable, for nested), sort_order int
- `CREATE TABLE role_menus` — (role user_role, menu_id uuid FK) composite PK
- `CREATE TABLE refresh_tokens` — id uuid PK, user_id FK, token_hash text unique, expires_at timestamptz, created_at
- Indexes: `idx_refresh_tokens_user_id`, `idx_refresh_tokens_token_hash`

### `src/migrations/002_seed_menus.sql`
Seed menus and role_menus with fixed UUIDs:
- **admin** → Jobs, Payments
- **reporter** → My Jobs, Payments
- **reviewer** → Jobs, Payments

### `src/migrations/migrate.ts`
Script runner: reads SQL files in order from the folder, runs them via `pool.query()`. Run with `npx ts-node src/migrations/migrate.ts`.

---

## Phase 3 — Config & Types

### `src/config/env.ts` — add `jwt` section:
```
jwt: {
  accessSecret, refreshSecret,
  accessExpiresIn: '15m',
  refreshExpiresIn: '7d',
  maxActiveDevices: 5,
}
```

### `.env` & `.env.example` — add:
```
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
MAX_ACTIVE_DEVICES=5
```

### `src/types/index.ts` — update/add:
- `Role = 'admin' | 'reporter' | 'reviewer'`
- `AuthenticatedRequest.user` → add `role: Role`
- `MenuItem` interface: `{ id, title, path, icon, sort_order, parent_id, children? }`

---

## Phase 4 — Models

### `src/models/user.model.ts`
- `User` — all DB fields
- `UserPublic` — `{ id, name, email, role }` (returned to the client)

### `src/models/menu.model.ts`
- `MenuRow` — flat DB row
- `MenuItem` — with `children?: MenuItem[]` for nested menus

---

## Phase 5 — Repositories

### `src/repositories/user.repository.ts`
- `findByEmail(email)` → `User | null`
- `findById(id)` → `User | null`
- `create({ name, email, passwordHash, role })` → `User`

### `src/repositories/menu.repository.ts`
- `findByRole(role)` → `MenuRow[]` (flat, includes parent_id)

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
- `verifyAccessToken(token)` → decoded payload or throw `AppError.unauthorized()`
- `verifyRefreshToken(token)` → decoded payload or throw `AppError.unauthorized()`
- `hashToken(rawToken)` → `string` — SHA-256 hex digest (using `crypto.createHash`)

**Note on bcrypt 72-byte limit**: pre-hash password with SHA-256 before bcrypt to handle very long passwords.

### `src/services/menu.service.ts`
- `buildMenuTree(flatMenus: MenuRow[])` → `MenuItem[]`
  Recursive: root items (parent_id null) → attach children → sort by sort_order

### `src/services/auth.service.ts`
- `register({ name, email, password, role? })`:
  1. Reject role `admin` → throw `new AppError('...', 400)`
  2. Check duplicate email → throw `AppError.conflict(...)`
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
  1. `hashToken` → `deleteByHash` (silent fail if not found)

---

## Phase 7 — Controllers

### `src/controllers/auth.controller.ts`
4 handlers: `register`, `login`, `refreshToken`, `logout`
- All use `sendSuccess` / `sendCreated` / throw `AppError`
- `login` response: `sendSuccess(res, { user, tokens, allowed_menus }, 'Login successful')`

### `src/controllers/admin.controller.ts`
- `createUser`: admin can create users with any role (including admin)
  - Full field validation
  - Hash password same as auth.service
  - Return `sendCreated`

---

## Phase 8 — Middlewares

### `src/middlewares/authenticate.ts`
- Extract `Authorization: Bearer <token>` header
- `verifyAccessToken(token)` → set `req.user = { id, email, role }`
- Missing/invalid → `AppError.unauthorized()`

### `src/middlewares/authorize.ts`
- Factory: `authorize(roles: Role[]) → RequestHandler`
- Check `req.user.role` is in `roles` → continue
- Not in list → `AppError.forbidden()`

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

### `src/routes/index.ts` — add:
```typescript
router.use('/auth', authRouter);
router.use('/admin', adminRouter);
```

---

## Phase 10 — Tests

### Setup: `jest.config.js` + ts-jest preset

### `__tests__/auth.test.ts`
Use `supertest` + app directly (no server start). Mock `pool` with `jest.mock`.

Test cases:
1. `POST /register` → success, default role `reporter`
2. `POST /register` → reject role `admin` (400)
3. `POST /register` → duplicate email (409)
4. `POST /login` → success, response shape correct including `allowed_menus`
5. `POST /login` → wrong credentials (401)
6. `POST /refresh-token` → success, new access_token returned
7. `POST /refresh-token` → invalid token (401)
8. Protected route without token → 401
9. Route with wrong role → 403

---

## Phase 11 — npm Scripts Update

Add to `package.json`:
```json
"migrate": "ts-node src/migrations/migrate.ts",
"test": "jest --runInBand",
"test:watch": "jest --watch"
```

---

## Verification

1. `npm run migrate` → run migrations (requires active DB via `docker compose up db`)
2. `npm run dev` → server starts, logs "Database connected"
3. Manual test via curl/Postman:
   - `POST /api/v1/auth/register` with valid body
   - `POST /api/v1/auth/login` → verify `allowed_menus` matches role
   - `POST /api/v1/auth/refresh-token` → verify old token cannot be reused (RTR)
4. `npm run type-check` → 0 errors
5. `npm test` → all tests green
