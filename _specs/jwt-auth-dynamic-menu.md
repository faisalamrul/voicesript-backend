# Spec for jwt-auth-dynamic-menu

branch: claude/feature/jwt-auth-dynamic-menu

## Summary

Sistem autentikasi dan otorisasi berbasis JWT untuk aplikasi VoiceScript. Mencakup registrasi, login, refresh token, dan pengiriman daftar menu sidebar yang dinamis berdasarkan role user. Ada tiga role: `admin`, `reporter`, dan `reviewer`, masing-masing dengan set menu yang berbeda yang disimpan di database.

## Functional Requirements

### Roles & Menu
- Tiga role tersedia: `admin`, `reporter`, `reviewer`.
- Setiap role memiliki daftar menu yang berbeda, disimpan di tabel `menus` dan `role_menus` (relasi many-to-many).
- Menu memiliki properti: `title`, `path`, `icon`, `order`.

### Endpoints

#### `POST /api/v1/auth/register`
- Input: `name`, `email`, `password`, `role` (opsional).
- Default role adalah `reporter` jika `role` tidak dikirim.
- Field `role` hanya boleh diisi dengan nilai `reporter` atau `reviewer` — mendaftar sebagai `admin` tidak diperbolehkan lewat endpoint ini.
- Password di-hash menggunakan bcrypt (min 10 salt rounds).
- Return 409 jika email sudah terdaftar.

#### `POST /api/v1/auth/login`
- Input: `email`, `password`.
- Validasi kredensial; return 401 jika salah.
- Saat berhasil, kembalikan:
  - Data user (`id`, `name`, `email`, `role`).
  - `access_token` (JWT, expire 15 menit).
  - `refresh_token` (JWT, expire 7 hari).
  - `allowed_menus`: array menu yang diizinkan untuk role user tersebut, diambil dari database.
- Simpan refresh token di database (tabel `refresh_tokens`) untuk validasi dan revokasi.

#### `POST /api/v1/auth/refresh-token`
- Input: `refresh_token` di body.
- Validasi: token ada di database, belum expired, dan signature valid.
- Saat berhasil, terbitkan `access_token` baru.
- Return 401 jika token tidak valid atau sudah kedaluwarsa.

#### `POST /api/v1/auth/logout` _(opsional tapi direkomendasikan)_
- Hapus refresh token dari database sehingga tidak bisa dipakai ulang.
- Membutuhkan `Authorization: Bearer <access_token>`.

### Middleware: `authenticate`
- Verifikasi `Authorization: Bearer <access_token>` pada header.
- Inject `req.user` (`id`, `email`, `role`) untuk dipakai controller berikutnya.
- Return 401 jika token absen atau tidak valid.

### Middleware: `authorize(roles: Role[])`
- Dibuat di atas `authenticate`.
- Return 403 jika role user tidak termasuk dalam daftar yang diizinkan.

## Possible Edge Cases

- User mencoba mendaftar dengan role `admin` — harus ditolak dengan 400.
- Refresh token yang sudah di-logout masih dicoba dipakai — harus ditolak dengan 401.
- Login dengan email yang tidak terdaftar — return 401 (jangan beri tahu bahwa email tidak ada, untuk mencegah user enumeration).
- Access token masih valid tapi dipakai di `/refresh-token` — tetap terbitkan access token baru (tidak perlu error).
- Dua request login serentak dengan akun yang sama — keduanya menghasilkan refresh token yang valid (multi-device support).
- Password dengan karakter spesial atau unicode — bcrypt harus menanganinya tanpa masalah.
- Tolak registrasi jika user mencoba menembak role 'admin' secara manual (Return 400).
- Jika email tidak terdaftar atau password salah, berikan respon error 401 yang generik untuk mencegah user enumeration.
- Tangani mekanisme "Refresh Token Rotation & Reuse Detection" (jika refresh token yang sudah terpakai/logout digunakan lagi, tolak dengan 401).
- Pastikan sistem mendukung multi-device login (satu user bisa memiliki beberapa refresh token aktif secara bersamaan).
- Perhatikan batasan 72-byte pada Bcrypt jika user menggunakan password yang sangat panjang dengan karakter spesial.

## Acceptance Criteria

- `POST /auth/register` membuat user baru dengan password ter-hash dan role default `reporter`.
- `POST /auth/register` menolak role `admin` dengan status 400.
- `POST /auth/login` mengembalikan response JSON dengan struktur `{ status, data: { user, tokens, allowed_menus } }`.
- `allowed_menus` pada response login sesuai dengan role user dan diambil dari database, bukan hardcode.
- `access_token` expire setelah 15 menit; `refresh_token` expire setelah 7 hari.
- `POST /auth/refresh-token` menerbitkan `access_token` baru yang valid dari refresh token yang masih aktif.
- `POST /auth/refresh-token` menolak refresh token yang tidak ada di database atau sudah expired dengan 401.
- Middleware `authenticate` melindungi route yang membutuhkan autentikasi.
- Middleware `authorize` menolak user dengan role yang tidak diizinkan dengan 403.

## Open Questions

- Apakah refresh token harus di-rotate setiap kali dipakai (refresh token rotation), atau cukup satu refresh token per sesi? Refresh Token Rotation (RTR) sangat disarankan.
- Apakah perlu endpoint admin untuk membuat user dengan role `admin` (misalnya `POST /admin/users`)? Ya, mutlak perlu.
- Apakah `allowed_menus` perlu mendukung nested menu (menu dengan sub-menu)? Ya, buat strukturnya mendukung nested menu sejak awal.
- Berapa batas maksimum perangkat aktif per user (jumlah refresh token aktif)? 3 hingga 5 perangkat aktif.
- Apakah data menu perlu di-seed via migration, atau ada panel admin untuk mengelolanya? Mulai dengan Seed via Migration, siapkan Panel Admin untuk fase berikutnya.

## Testing Guidelines

Create a test file(s) in the `./__tests__` folder for the new features, and creates meaningful tests for the following cases, without going too heavy:

- `POST /auth/register` berhasil membuat user baru dengan role default `reporter`.
- `POST /auth/register` menolak pendaftaran dengan role `admin`.
- `POST /auth/register` menolak email duplikat dengan 409.
- `POST /auth/login` berhasil dan mengembalikan struktur response yang benar termasuk `allowed_menus`.
- `POST /auth/login` gagal dengan kredensial salah dan mengembalikan 401.
- `POST /auth/refresh-token` berhasil menerbitkan access token baru.
- `POST /auth/refresh-token` menolak token yang tidak valid.
- Middleware `authenticate` menolak request tanpa token dengan 401.
- Middleware `authorize` menolak user dengan role tidak sesuai dengan 403.
