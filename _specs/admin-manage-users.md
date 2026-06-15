# Spec for admin-manage-users

branch: claude/feature/admin-manage-users

## Summary

Admin user management feature — allows admins to view a list of all users, create new users with role `reporter` or `reviewer`, and delete existing users. This feature is only accessible by users with the `admin` role.

## Functional Requirements

### Endpoints

- `GET /admin/users` — list all users (all roles)
- `POST /admin/users` — create a new user with role `reporter` or `reviewer`
- `DELETE /admin/users/:id` — delete a user by ID

### GET /admin/users

- Returns a list of all users with fields: id, name, email, role, created_at
- Supports pagination: query params `page` (default 1) and `limit` (default 10)
- Optional filter by `role` via query param: `?role=reporter` or `?role=reviewer`

### POST /admin/users

Request body:
- `name` — string, required
- `email` — string, required, must be unique
- `password` — string, required, minimum 8 characters
- `role` — enum required, only accepts `reporter` or `reviewer`

System-set fields:
- `id` — auto UUID
- `created_at`, `updated_at` — auto timestamp

Response: 201 Created with the newly created user object (without password).

### DELETE /admin/users/:id

- Deletes a user by ID
- Returns 404 if user not found
- Admin cannot delete their own account (return 400)

## Possible Edge Cases

- `POST` with an already registered email → 409 Conflict
- `POST` with a role other than `reporter` or `reviewer` → 400
- `POST` with a password shorter than 8 characters → 400
- `DELETE` with a non-existent ID → 404
- Admin tries to delete their own account → 400
- `GET` with an invalid `role` filter value → 400

## Acceptance Criteria

- `GET /admin/users` returns a list of users with pagination metadata
- `GET /admin/users?role=reporter` returns only users with reporter role
- `POST /admin/users` with valid body and role `reporter` → 201, user created
- `POST /admin/users` with valid body and role `reviewer` → 201, user created
- `POST /admin/users` with role `admin` → 400
- `POST /admin/users` with duplicate email → 409
- `DELETE /admin/users/:id` with valid ID → 200, user deleted
- `DELETE /admin/users/:id` with own ID → 400
- `DELETE /admin/users/:id` with non-existent ID → 404
- All endpoints are only accessible by admin — non-admin gets 403

## Open Questions

- Can an admin change the role of an existing user (e.g. reporter → reviewer)? Or only create and delete? Yes, allowed.
- Is `DELETE` a hard delete (remove from DB) or soft delete (flag `deleted_at`)? Hard delete only.
- Is a `GET /admin/users/:id` endpoint needed for single user detail? Yes, needed.

## Testing Guidelines

Create a test file(s) in the `./__tests__` folder for the new features, and creates meaningful tests for the following cases, without going too heavy:

- `GET /admin/users` with admin token → 200, array of users + pagination
- `GET /admin/users?role=reporter` → only reporters returned
- `GET /admin/users` without token → 401
- `GET /admin/users` with reporter token → 403
- `POST /admin/users` valid reporter role → 201
- `POST /admin/users` valid reviewer role → 201
- `POST /admin/users` role admin → 400
- `POST /admin/users` duplicate email → 409
- `POST /admin/users` password shorter than 8 characters → 400
- `DELETE /admin/users/:id` valid → 200
- `DELETE /admin/users/:id` own ID → 400
- `DELETE /admin/users/:id` non-existent ID → 404
