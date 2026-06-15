# Spec for jwt-auth-dynamic-menu

branch: claude/feature/jwt-auth-dynamic-menu

## Summary

JWT-based authentication and authorization system for the VoiceScript application. Covers registration, login, token refresh, and delivery of a dynamic sidebar menu list based on user role. Three roles exist: `admin`, `reporter`, and `reviewer`, each with a different set of menus stored in the database.

## Functional Requirements

### Roles & Menu
- Three roles available: `admin`, `reporter`, `reviewer`.
- Each role has a different menu list, stored in `menus` and `role_menus` tables (many-to-many relationship).
- Menus have properties: `title`, `path`, `icon`, `order`.

### Endpoints

#### `POST /api/v1/auth/register`
- Input: `name`, `email`, `password`, `role` (optional).
- Default role is `reporter` if `role` is not provided.
- The `role` field may only be set to `reporter` or `reviewer` — registering as `admin` through this endpoint is not allowed.
- Password is hashed using bcrypt (min 10 salt rounds).
- Returns 409 if email is already registered.

#### `POST /api/v1/auth/login`
- Input: `email`, `password`.
- Validate credentials; return 401 if incorrect.
- On success, return:
  - User data (`id`, `name`, `email`, `role`).
  - `access_token` (JWT, expires in 15 minutes).
  - `refresh_token` (JWT, expires in 7 days).
  - `allowed_menus`: array of menus allowed for the user's role, fetched from the database.
- Store refresh token in the database (`refresh_tokens` table) for validation and revocation.

#### `POST /api/v1/auth/refresh-token`
- Input: `refresh_token` in request body.
- Validate: token exists in database, not expired, and signature is valid.
- On success, issue a new `access_token`.
- Returns 401 if token is invalid or expired.

#### `POST /api/v1/auth/logout` _(optional but recommended)_
- Delete refresh token from database so it cannot be reused.
- Requires `Authorization: Bearer <access_token>`.

### Middleware: `authenticate`
- Verify `Authorization: Bearer <access_token>` header.
- Inject `req.user` (`id`, `email`, `role`) for subsequent controllers.
- Returns 401 if token is missing or invalid.

### Middleware: `authorize(roles: Role[])`
- Built on top of `authenticate`.
- Returns 403 if user role is not in the allowed list.

## Possible Edge Cases

- User tries to register with role `admin` — must be rejected with 400.
- An already-logged-out refresh token is used again — must be rejected with 401.
- Login with an unregistered email — return 401 (do not reveal that the email doesn't exist, to prevent user enumeration).
- Access token is still valid but used at `/refresh-token` — still issue a new access token (no error needed).
- Two simultaneous login requests with the same account — both produce valid refresh tokens (multi-device support).
- Password with special or unicode characters — bcrypt must handle them without issues.
- Reject registration if user manually attempts to set role 'admin' (return 400).
- If email is not registered or password is wrong, return a generic 401 error to prevent user enumeration.
- Handle "Refresh Token Rotation & Reuse Detection" (if a used/logged-out refresh token is reused, reject with 401).
- Ensure the system supports multi-device login (one user can have multiple active refresh tokens simultaneously).
- Account for the 72-byte limit in Bcrypt if users have very long passwords with special characters.

## Acceptance Criteria

- `POST /auth/register` creates a new user with a hashed password and default role `reporter`.
- `POST /auth/register` rejects registration with role `admin` with status 400.
- `POST /auth/login` returns a JSON response with structure `{ status, data: { user, tokens, allowed_menus } }`.
- `allowed_menus` in login response matches the user's role and is fetched from the database, not hardcoded.
- `access_token` expires after 15 minutes; `refresh_token` expires after 7 days.
- `POST /auth/refresh-token` issues a valid new `access_token` from an active refresh token.
- `POST /auth/refresh-token` rejects refresh tokens not in the database or already expired with 401.
- `authenticate` middleware protects routes that require authentication.
- `authorize` middleware rejects users with a non-permitted role with 403.

## Open Questions

- Should the refresh token be rotated on every use (refresh token rotation), or is one refresh token per session sufficient? Refresh Token Rotation (RTR) is strongly recommended.
- Is an admin endpoint needed to create users with `admin` role (e.g. `POST /admin/users`)? Yes, absolutely required.
- Does `allowed_menus` need to support nested menus (menus with sub-menus)? Yes, build the structure to support nested menus from the start.
- What is the maximum number of active devices per user (number of active refresh tokens)? 3 to 5 active devices.
- Does menu data need to be seeded via migration, or is there an admin panel to manage it? Start with seed via migration; prepare an admin panel for a later phase.

## Testing Guidelines

Create a test file(s) in the `./__tests__` folder for the new features, and creates meaningful tests for the following cases, without going too heavy:

- `POST /auth/register` successfully creates a new user with default role `reporter`.
- `POST /auth/register` rejects registration with role `admin`.
- `POST /auth/register` rejects duplicate email with 409.
- `POST /auth/login` succeeds and returns the correct response structure including `allowed_menus`.
- `POST /auth/login` fails with wrong credentials and returns 401.
- `POST /auth/refresh-token` successfully issues a new access token.
- `POST /auth/refresh-token` rejects an invalid token.
- `authenticate` middleware rejects requests without a token with 401.
- `authorize` middleware rejects users with the wrong role with 403.
