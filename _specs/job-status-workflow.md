# Spec for Job Status Workflow

branch: claude/feature/job-status-workflow

## Summary

Implementasi state machine lifecycle job secara penuh: `NEW → ASSIGNED → TRANSCRIBED → REVIEWED → COMPLETED`. Lima endpoint baru menangani setiap transisi, dengan otorisasi berbasis role yang ketat, penegakan status yang sekuensial, dan kalkulasi pembayaran otomatis saat job selesai.

## Functional Requirements

### State Machine
Transisi status bersifat sekuensial dan dipaksakan di setiap endpoint. Tidak ada transisi yang boleh dilewati. Utility `jobStateMachine` yang sudah ada harus digunakan untuk semua validasi transisi.

```
NEW → ASSIGNED → TRANSCRIBED → REVIEWED → COMPLETED
```

---

### 1. Assign Reporter — `POST /api/v1/jobs/:id/assign-reporter` (Admin only)
- Job harus berstatus `NEW`; status lain → 400
- Request body: `{ "reporter_id": "uuid" }`
- Reporter harus ada, memiliki role `reporter`, dan `availability: true`
- Untuk job dengan `location: "physical"`, reporter yang `city`-nya cocok dengan `city` job diurutkan di posisi teratas (disarankan, tapi reporter dari kota lain tetap bisa di-assign)
- Jika berhasil: set `reporter_id` pada job dan ubah status menjadi `ASSIGNED`

### 2. Submit Transcript — `PATCH /api/v1/jobs/:id/submit-transcript` (Reporter only)
- Hanya reporter yang di-assign ke job tersebut yang bisa memanggil endpoint ini; pengguna lain → 403
- Job harus berstatus `ASSIGNED`; status lain → 400
- Request body: `{ "transcript_notes": "string" }` (opsional)
- Jika berhasil: ubah status menjadi `TRANSCRIBED`, sistem otomatis mengisi `submitted_at` dengan timestamp saat ini

### 3. Assign Editor — `POST /api/v1/jobs/:id/assign-editor` (Admin only)
- Job harus berstatus `TRANSCRIBED`; status lain → 400
- Request body: `{ "editor_id": "uuid" }`
- Editor harus ada, memiliki role `editor`, dan `availability: true`
- Jika berhasil: set `editor_id` pada job; **status tetap `TRANSCRIBED`** (tidak berubah)

### 4. Mark as Reviewed — `PATCH /api/v1/jobs/:id/mark-reviewed` (Editor only)
- Hanya editor yang di-assign ke job tersebut yang bisa memanggil endpoint ini; pengguna lain → 403
- Job harus berstatus `TRANSCRIBED`; status lain → 400
- Request body: `{ "review_notes": "string" }` (opsional)
- Jika berhasil: ubah status menjadi `REVIEWED`, sistem otomatis mengisi `reviewed_at` dengan timestamp saat ini

### 5. Mark as Completed — `PATCH /api/v1/jobs/:id/complete` (Admin only)
- Job harus berstatus `REVIEWED`; status lain → 400
- Tidak membutuhkan request body
- Jika berhasil: ubah status menjadi `COMPLETED`
- Pembayaran dihitung dan difinalkan pada titik ini:
  - Reporter: `ceil(duration / 60) × Rp 2.000`
  - Editor: flat Rp 50.000

---

### Aturan Umum
- Semua endpoint membutuhkan autentikasi (access token valid via HTTPOnly cookie / Bearer header)
- Otorisasi ditegakkan ketat per role — aksi lintas role ditolak dengan 403
- Kembalikan 404 jika job tidak ditemukan
- Kembalikan 403 jika pengguna tidak memiliki izin
- Kembalikan 400 jika transisi status tidak valid

## Possible Edge Cases

- Assign reporter yang tidak tersedia (`availability: false`) → 400
- Assign editor yang tidak tersedia (`availability: false`) → 400
- Reporter mencoba submit transcript untuk job yang bukan miliknya → 403
- Editor mencoba mark-reviewed untuk job yang bukan miliknya → 403
- Admin mencoba assign reporter ke job yang sudah berstatus `ASSIGNED` atau lebih lanjut → 400
- Admin mencoba complete job yang masih berstatus `TRANSCRIBED` (melewati `REVIEWED`) → 400
- Assign user dengan role yang salah sebagai reporter (misalnya editor) → 400
- Assign user dengan role yang salah sebagai editor (misalnya reporter) → 400
- UUID `reporter_id` atau `editor_id` tidak ada di database → 404
- Pemanggilan submit-transcript pada job yang `submitted_at`-nya sudah terisi (re-submit) — diblokir oleh pengecekan status
- City matching untuk job physical: reporter dari kota berbeda tetap bisa di-assign (tidak diblokir, hanya diprioritaskan lebih rendah)

## Acceptance Criteria

- `POST /jobs/:id/assign-reporter` dengan reporter tersedia pada job `NEW` → 200, status menjadi `ASSIGNED`, `reporter_id` tersimpan
- `POST /jobs/:id/assign-reporter` pada job bukan `NEW` → 400
- `POST /jobs/:id/assign-reporter` dengan reporter tidak tersedia → 400
- `PATCH /jobs/:id/submit-transcript` oleh reporter yang di-assign pada job `ASSIGNED` → 200, status menjadi `TRANSCRIBED`, `submitted_at` terisi
- `PATCH /jobs/:id/submit-transcript` oleh reporter berbeda → 403
- `PATCH /jobs/:id/submit-transcript` pada job bukan `ASSIGNED` → 400
- `POST /jobs/:id/assign-editor` dengan editor tersedia pada job `TRANSCRIBED` → 200, status tetap `TRANSCRIBED`, `editor_id` tersimpan
- `POST /jobs/:id/assign-editor` pada job bukan `TRANSCRIBED` → 400
- `PATCH /jobs/:id/mark-reviewed` oleh editor yang di-assign pada job `TRANSCRIBED` → 200, status menjadi `REVIEWED`, `reviewed_at` terisi
- `PATCH /jobs/:id/mark-reviewed` oleh editor berbeda → 403
- `PATCH /jobs/:id/mark-reviewed` pada job bukan `TRANSCRIBED` → 400
- `PATCH /jobs/:id/complete` pada job `REVIEWED` → 200, status menjadi `COMPLETED`
- `PATCH /jobs/:id/complete` pada job bukan `REVIEWED` → 400
- Semua endpoint mengembalikan 401 tanpa token yang valid
- Semua endpoint mengembalikan 404 jika job tidak ditemukan

## Open Questions

- Apakah `transcript_notes` dan `review_notes` disimpan di tabel `jobs`, atau di tabel terpisah (misalnya audit/notes)? Di tabel jobs langsung.
- Apakah kolom `availability` sudah ada di tabel users, atau perlu ditambahkan lewat migrasi? belum ada , ya tambahkan
- Apakah kolom `submitted_at` dan `reviewed_at` sudah ada di tabel `jobs`, atau perlu ditambahkan? submitted_at sudah ada tapi reviewed_at belum
- Apakah jumlah pembayaran (`reporter_payment`, `editor_payment`) perlu disimpan di record job saat completion, atau dihitung on-the-fly?
  Snapshot disimpan saat COMPLETED, tapi tetap bisa dihitung on-the-fly sebelumnya.
Alasannya: kalau rate berubah di kemudian hari (naik dari Rp 2.000 ke Rp 2.500), job yang sudah COMPLETED harus tetap mencerminkan rate lama saat job itu diselesaikan. Kalau hanya on-the-fly, angkanya akan berubah mengikuti rate baru — data historis jadi salah.
sql-- tambahkan di tabel jobs
reporter_payment  integer  NULL,  -- diisi saat COMPLETED
editor_payment    integer  NULL,  -- diisi saat COMPLETED
Sebelum COMPLETED, tampilkan estimasi on-the-fly di UI. Saat admin klik Complete, backend hitung dan simpan angka finalnya.
- Apakah ada mekanisme notifikasi (email/webhook) yang dibutuhkan saat status berubah, atau itu di luar scope fitur ini? tidak ada

## Testing Guidelines

Buat file `__tests__/job-workflow.test.ts`. Mock `job.repository` dan `user.repository`. Gunakan `tokenService.signAccessToken` untuk membuat token per role.

- `POST /jobs/:id/assign-reporter`
  - reporter valid + job NEW → 200, status ASSIGNED
  - job bukan NEW → 400
  - reporter tidak ditemukan → 404
  - reporter role salah atau availability false → 400
  - tanpa token → 401
  - token reporter (bukan admin) → 403
- `PATCH /jobs/:id/submit-transcript`
  - reporter yang di-assign + job ASSIGNED → 200, status TRANSCRIBED
  - reporter berbeda → 403
  - job bukan ASSIGNED → 400
  - tanpa token → 401
- `POST /jobs/:id/assign-editor`
  - editor valid + job TRANSCRIBED → 200, status tetap TRANSCRIBED
  - job bukan TRANSCRIBED → 400
  - editor tidak ditemukan atau tidak tersedia → 400/404
  - token reporter → 403
- `PATCH /jobs/:id/mark-reviewed`
  - editor yang di-assign + job TRANSCRIBED → 200, status REVIEWED
  - editor berbeda → 403
  - job bukan TRANSCRIBED → 400
- `PATCH /jobs/:id/complete`
  - job REVIEWED → 200, status COMPLETED
  - job bukan REVIEWED → 400
  - token reporter → 403
