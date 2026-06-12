# Spec for admin-manage-users

branch: claude/feature/admin-manage-users

## Summary

Fitur manajemen user oleh admin — memungkinkan admin melihat daftar semua user, menambah user baru dengan role `reporter` atau `reviewer`, serta menghapus user yang ada. Fitur ini hanya dapat diakses oleh user dengan role `admin`.

## Functional Requirements

### Endpoints

- `GET /admin/users` — melihat daftar semua user (semua role)
- `POST /admin/users` — membuat user baru dengan role `reporter` atau `reviewer`
- `DELETE /admin/users/:id` — menghapus user berdasarkan ID

### GET /admin/users

- Mengembalikan daftar semua user dengan field: id, name, email, role, created_at
- Mendukung pagination: query param `page` (default 1) dan `limit` (default 10)
- Opsional filter by `role` via query param: `?role=reporter` atau `?role=reviewer`

### POST /admin/users

Request body:
- `name` — string, required
- `email` — string, required, harus unik
- `password` — string, required, minimum 8 karakter
- `role` — enum required, hanya menerima `reporter` atau `reviewer`

System-set fields:
- `id` — auto UUID
- `created_at`, `updated_at` — auto timestamp

Response: 201 Created dengan object user yang baru dibuat (tanpa password).

### DELETE /admin/users/:id

- Menghapus user berdasarkan ID
- Mengembalikan 404 jika user tidak ditemukan
- Admin tidak dapat menghapus dirinya sendiri (kembalikan 400)

## Possible Edge Cases

- `POST` dengan email yang sudah terdaftar → 409 Conflict
- `POST` dengan role selain `reporter` atau `reviewer` → 400
- `POST` dengan password kurang dari 8 karakter → 400
- `DELETE` dengan ID yang tidak ada → 404
- Admin mencoba menghapus akun dirinya sendiri → 400
- `GET` dengan `role` filter nilai tidak valid → 400

## Acceptance Criteria

- `GET /admin/users` mengembalikan daftar user dengan pagination metadata
- `GET /admin/users?role=reporter` hanya mengembalikan user dengan role reporter
- `POST /admin/users` dengan body valid dan role `reporter` → 201, user terbuat
- `POST /admin/users` dengan body valid dan role `reviewer` → 201, user terbuat
- `POST /admin/users` dengan role `admin` → 400
- `POST /admin/users` dengan email duplikat → 409
- `DELETE /admin/users/:id` dengan ID valid → 200, user terhapus
- `DELETE /admin/users/:id` dengan ID sendiri → 400
- `DELETE /admin/users/:id` dengan ID tidak ada → 404
- Semua endpoint hanya bisa diakses oleh admin — non-admin mendapat 403

## Open Questions

- Apakah admin dapat mengubah role user yang sudah ada (misalnya reporter → reviewer)? Atau hanya create dan delete? iya bisa
- Apakah `DELETE` adalah hard delete (hapus dari DB) atau soft delete (flag `deleted_at`)? hard delete saja
- Apakah perlu endpoint `GET /admin/users/:id` untuk detail satu user? perlu

## Testing Guidelines

Create a test file(s) in the `./__tests__` folder for the new features, and creates meaningful tests for the following cases, without going too heavy:

- `GET /admin/users` dengan admin token → 200, array of users + pagination
- `GET /admin/users?role=reporter` → hanya reporter yang dikembalikan
- `GET /admin/users` tanpa token → 401
- `GET /admin/users` dengan reporter token → 403
- `POST /admin/users` role reporter valid → 201
- `POST /admin/users` role reviewer valid → 201
- `POST /admin/users` role admin → 400
- `POST /admin/users` email duplikat → 409
- `POST /admin/users` password kurang dari 8 karakter → 400
- `DELETE /admin/users/:id` valid → 200
- `DELETE /admin/users/:id` ID sendiri → 400
- `DELETE /admin/users/:id` ID tidak ada → 404
