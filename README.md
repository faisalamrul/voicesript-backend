# VoiceScript Backend

REST API untuk platform manajemen court reporting. Mengelola alur kerja dari pembuatan job hingga penyelesaian, mencakup manajemen user, assignment reporter/editor, dan tracking status job secara real-time.

## Tech Stack

| Komponen | Teknologi |
|---|---|
| Runtime | Node.js + TypeScript (strict mode) |
| Framework | Express 5 |
| Database | PostgreSQL 16 via `node-postgres` (tanpa ORM) |
| Auth | JWT (Access Token 15m + Refresh Token 7d, HTTPOnly cookie) |
| API Docs | Swagger UI (OpenAPI 3.0) |
| Dev server | ts-node-dev (hot-reload) |
| Container | Docker + Docker Compose |

## Arsitektur

Aplikasi menggunakan **4-layer architecture** yang ketat:

```
routes → controllers → services → repositories
```

- **routes** — wire HTTP method + path; semua route didaftarkan di `src/routes/index.ts` di bawah `/api/v1`
- **controllers** — parse request, panggil service, kembalikan response via helper (`sendSuccess`, `sendError`, `sendCreated`)
- **services** — business logic; tidak boleh ada `req`/`res` di sini
- **repositories** — semua SQL via `pool` dari `src/config/database.ts`; return plain object

Konvensi penting:
- Error: throw `AppError` di mana saja, ditangkap oleh `errorHandler` middleware
- Response shape selalu `{ success, data?, message?, errors? }` (`ApiResponse<T>`)
- Env vars terpusat dan typed di `src/config/env.ts`

## Struktur Direktori

```
src/
├── config/         # database, env, swagger
├── controllers/    # auth, admin, job
├── middlewares/    # authenticate, authorize, errorHandler, requestLogger
├── migrations/     # file SQL bernomor urut (001-016)
├── models/         # TypeScript interfaces
├── repositories/   # SQL queries
├── routes/         # route definitions + Swagger JSDoc
├── scripts/        # seed.ts
├── services/       # business logic
├── types/          # shared types (Role, ApiResponse, dll)
└── utils/          # AppError, response helpers, jobStateMachine
```

## Setup Awal (Fresh Clone)

### Prasyarat

- Node.js 18+
- PostgreSQL 16 (local) **atau** Docker

---

### Opsi A — Local PostgreSQL

**1. Install dependencies**
```bash
npm install
```

**2. Buat file environment**
```bash
cp .env.example .env
```

Edit `.env` sesuai konfigurasi PostgreSQL lokal:
```env
NODE_ENV=development
PORT=3000

DB_HOST=localhost
DB_PORT=5432
DB_NAME=voicescript_db
DB_USER=postgres
DB_PASSWORD=postgres

CORS_ORIGIN=http://localhost:5174

JWT_ACCESS_SECRET=ganti-dengan-secret-yang-kuat
JWT_REFRESH_SECRET=ganti-dengan-secret-yang-kuat
MAX_ACTIVE_DEVICES=5
```

**3. Jalankan seed** (otomatis membuat database, jalankan semua migration, dan insert sample data)
```bash
npm run seed
```

**4. Jalankan dev server**
```bash
npm run dev
```

API berjalan di `http://localhost:3000`

---

### Opsi B — Docker

```bash
cp .env.example .env
npm run docker:dev
```

Docker Compose akan menjalankan dua service: `api` (hot-reload) dan `db` (PostgreSQL 16). Service `api` menunggu healthcheck `db` sebelum start.

> **Catatan:** Jika menggunakan Docker, `npm run seed` perlu dijalankan dari dalam container atau dengan `DB_HOST` diarahkan ke port Docker.

---

## Seed Data

`npm run seed` melakukan:
1. Buat database jika belum ada
2. Drop dan recreate schema `public`
3. Jalankan semua migration SQL secara urut (001–016)
4. Insert sample data

| Akun | Email | Password | Role |
|---|---|---|---|
| Admin | admin@admin.com | 1234 | admin |
| Reporter | reporter@admin.com | 1234 | reporter |
| Editor | editor@admin.com | 1234 | editor |

Sample jobs: **50 jobs** dengan distribusi status NEW (10), ASSIGNED (1), TRANSCRIBED (15), REVIEWED (1), COMPLETED (23).

---

## Commands

```bash
npm run dev          # Dev server dengan hot-reload
npm run build        # Compile TypeScript → dist/
npm run start        # Jalankan compiled output
npm run type-check   # Cek TypeScript tanpa output
npm run seed         # Reset DB + jalankan semua migration + insert sample data
npm run migrate      # Jalankan migration baru saja (tanpa reset data)
npm run test         # Jalankan semua test
npm run docker:dev   # Docker Compose up (API + PostgreSQL)
npm run docker:down  # Docker Compose down
```

**`npm run seed` vs `npm run migrate`:**
- `seed` — reset total, cocok untuk setup awal atau mau mulai dari nol
- `migrate` — apply migration baru ke DB yang sudah ada tanpa hapus data

---

## API Endpoints

Base URL: `http://localhost:3000/api/v1`

Dokumentasi interaktif tersedia di: `http://localhost:3000/api/docs`

### Auth

| Method | Endpoint | Akses | Deskripsi |
|---|---|---|---|
| POST | `/auth/register` | Public | Registrasi user baru (role reporter saja) |
| POST | `/auth/login` | Public | Login, kembalikan access token + set cookie refresh token |
| POST | `/auth/refresh-token` | Cookie | Perbarui access token via refresh token rotation |
| POST | `/auth/logout` | Bearer | Cabut refresh token + hapus cookie |
| GET | `/auth/me` | Bearer | Data user yang sedang login |

### Admin — User Management

| Method | Endpoint | Akses | Deskripsi |
|---|---|---|---|
| GET | `/admin/users` | Admin | Daftar semua user (paginated, filter by role) |
| POST | `/admin/users` | Admin | Buat user baru (semua role) |
| GET | `/admin/users/:id` | Admin | Detail user by ID |
| PATCH | `/admin/users/:id/role` | Admin | Ubah role user |
| DELETE | `/admin/users/:id` | Admin | Hapus user |

### Jobs

| Method | Endpoint | Akses | Deskripsi |
|---|---|---|---|
| POST | `/jobs` | Admin | Buat job baru (status awal: NEW) |
| GET | `/jobs` | Semua | Daftar job (admin: semua; reporter/editor: job miliknya) |
| POST | `/jobs/:id/assign-reporter` | Admin | Assign reporter → status: ASSIGNED |
| PATCH | `/jobs/:id/submit-transcript` | Reporter | Submit transkripsi → status: TRANSCRIBED |
| POST | `/jobs/:id/assign-editor` | Admin | Assign editor (status tetap TRANSCRIBED) |
| PATCH | `/jobs/:id/mark-reviewed` | Editor | Tandai sudah direview → status: REVIEWED |
| PATCH | `/jobs/:id/complete` | Admin | Selesaikan job → status: COMPLETED |
| GET | `/jobs/:id/history` | Semua | Riwayat perubahan status job |

### Health

| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/health` | Status server dan koneksi database |

---

## Alur Kerja Job

```
NEW → ASSIGNED → TRANSCRIBED → REVIEWED → COMPLETED
```

| Transisi | Siapa | Ketentuan |
|---|---|---|
| NEW → ASSIGNED | Admin | Reporter harus ada, role reporter, tidak punya job aktif |
| ASSIGNED → TRANSCRIBED | Reporter | Hanya reporter yang di-assign |
| TRANSCRIBED → TRANSCRIBED | Admin | Assign editor (status tidak berubah) |
| TRANSCRIBED → REVIEWED | Editor | Hanya editor yang di-assign |
| REVIEWED → COMPLETED | Admin | Job harus punya reporter dan editor |

**Kalkulasi pembayaran saat COMPLETED:**
- Reporter: `ceil(duration_detik / 60) × Rp 2.000`
- Editor: flat Rp 50.000

---

## Autentikasi

Sistem menggunakan dua token:

- **Access Token** — JWT, valid 15 menit, dikirim via `Authorization: Bearer <token>`
- **Refresh Token** — JWT, valid 7 hari, disimpan di HTTPOnly cookie `refresh_token`

Refresh token menggunakan **Rotation** — setiap kali dipakai, token lama diinvalidasi dan token baru di-set. Maksimal 5 device aktif per user (configurable via `MAX_ACTIVE_DEVICES`).

Password di-hash dengan bcrypt (cost 12) dengan pre-hash SHA-256.

---

## Database

Raw SQL via `node-postgres` — tidak ada ORM. Semua query ada di layer `repositories/`.

Helper `withTransaction<T>` tersedia di `src/config/database.ts` untuk operasi yang butuh atomicity.

**Tabel utama:**

| Tabel | Deskripsi |
|---|---|
| `users` | Data user dengan role dan kota domisili |
| `refresh_tokens` | Token aktif per device |
| `menus` | Konfigurasi menu per role (tree structure) |
| `jobs` | Data job court reporting |
| `job_status_history` | Audit trail setiap perubahan status job |

Migration disimpan di `src/migrations/` dengan format `NNN_nama.sql`. File baru akan di-pick up otomatis oleh `npm run migrate` dan `npm run seed`.
