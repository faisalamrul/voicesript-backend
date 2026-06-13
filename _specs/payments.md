# Spec for payments

branch: claude/feature/payments

## Summary

Fitur Payments menampilkan rekap finansial seluruh job untuk admin. Mencakup satu endpoint backend baru (`GET /api/v1/payments`) dan satu halaman frontend baru. Data dibagi dua: **paid** (job COMPLETED, pakai nilai snapshot yang tersimpan) dan **pending** (job non-COMPLETED yang sudah ada reporter atau editor, dihitung estimasi). Summary card di bagian atas menampilkan agregasi total payout, breakdown reporter vs editor, dan total pending.

Aturan kalkulasi pembayaran:
- Reporter: `Math.floor(duration_seconds / 60) * rate_per_minute` — bulatkan ke **bawah**
- Editor: flat fee dari tabel `settings` (`editor_flat_fee`)
- Snapshot disimpan ke kolom `reporter_payment` dan `editor_payment` di tabel `jobs` saat admin menandai COMPLETED
- Untuk job COMPLETED, selalu pakai nilai snapshot — jangan hitung ulang

---

## Functional Requirements

### Backend

- Endpoint: `GET /api/v1/payments`
- Auth: admin only (`authenticate` + `authorize(['admin'])`)
- Query params (semua opsional):
  - `search` — filter by `case_name`, nama reporter, atau nama editor (ILIKE, case-insensitive)
  - `status` — `paid` (hanya COMPLETED) | `pending` (non-COMPLETED yang sudah ada reporter/editor)
  - `period` — `month` (bulan berjalan) | `last` (bulan lalu) | kosong = semua waktu
- Response shape:
  ```
  {
    summary: {
      total_payout, reporter_total, reporter_minutes,
      editor_total, editor_jobs, pending_total
    },
    jobs: [{ id, case_name, duration, status, reporter_name, reporter_payment,
             editor_name, editor_payment, completed_at }]
  }
  ```
- Kalkulasi `summary`:
  - `total_payout` = SUM(reporter_payment + editor_payment) WHERE COMPLETED
  - `reporter_total` = SUM(reporter_payment) WHERE COMPLETED
  - `reporter_minutes` = SUM(FLOOR(duration / 60)) WHERE COMPLETED AND reporter_id IS NOT NULL
  - `editor_total` = SUM(editor_payment) WHERE COMPLETED AND editor_id IS NOT NULL
  - `editor_jobs` = COUNT(*) WHERE COMPLETED AND editor_id IS NOT NULL
  - `pending_total` = SUM(estimasi) WHERE non-COMPLETED AND (reporter_id IS NOT NULL OR editor_id IS NOT NULL)
    - estimasi reporter = FLOOR(duration / 60) × rate_per_minute dari settings
    - estimasi editor = flat_fee dari settings, hanya jika editor_id IS NOT NULL
- Job tanpa reporter → `reporter_name: null`, `reporter_payment: null`
- Job tanpa editor → `editor_name: null`, `editor_payment: null`
- Rate dan flat fee dibaca dari tabel `settings` (bukan hardcode)

### Frontend

- Halaman `/payments` hanya accessible oleh role admin
- Summary cards di atas: Total Payout, Reporter Total, Reporter Minutes, Editor Total, Editor Jobs, Pending Total
- Tabel job list: case_name, status (paid/pending badge), reporter_name + payment, editor_name + payment, completed_at
- Filter bar: search (text input), status dropdown (All / Paid / Pending), period dropdown (All Time / This Month / Last Month)
- Tabel update realtime saat filter berubah

---

## Possible Edge Cases

- Job COMPLETED tanpa reporter (reporter dihapus setelah complete) → tampilkan `reporter_name: null`, pakai snapshot payment
- Job COMPLETED tanpa editor → `editor_name: null`, `editor_payment: null`
- `settings` tidak punya row `reporter_rate` atau `editor_flat_fee` → endpoint harus tetap jalan, pending_total pakai 0 atau default
- `period=last` di bulan Januari → filter ke Desember tahun lalu
- `search` mengandung karakter `%` atau `_` → harus di-escape sebelum ILIKE
- Semua job belum ada reporter/editor → `pending_total: 0`, jobs array kosong untuk status=pending
- Summary selalu dihitung dari seluruh dataset (tanpa filter `period`/`search`/`status`) ATAU ikut filter — perlu keputusan, rekomendasinya: summary ikut filter

---

## Acceptance Criteria

- `GET /api/v1/payments` tanpa query params mengembalikan semua job (paid + pending) dan summary yang benar
- `?status=paid` hanya mengembalikan job COMPLETED
- `?status=pending` hanya mengembalikan job non-COMPLETED yang sudah ada reporter atau editor
- `?period=month` hanya mengembalikan job di bulan berjalan (berdasarkan `completed_at` untuk paid, `created_at` untuk pending)
- `?search=rina` mengembalikan job yang case_name, reporter_name, atau editor_name mengandung "rina" (case-insensitive)
- Job COMPLETED: `reporter_payment` dan `editor_payment` adalah nilai snapshot, bukan hasil kalkulasi ulang
- Job pending: `reporter_payment` dan `editor_payment` adalah estimasi hasil kalkulasi dari settings
- `summary.pending_total` tidak berubah jika `?status=paid` (atau sebaliknya) — summary mencerminkan filter yang aktif
- Endpoint mengembalikan 401 tanpa token, 403 untuk non-admin
- Halaman frontend tidak bisa diakses oleh reporter atau editor

---

## Open Questions

- Apakah `summary` ikut filter (`search`, `status`, `period`) atau selalu menghitung keseluruhan data?
- Apakah kolom `completed_at` sudah ada di tabel `jobs`, atau perlu ditambah migrasi?
- Apakah rate dan flat fee di tabel `settings` sudah ada datanya, atau perlu seed/migration baru?
- Pagination untuk tabel job list, atau load semua sekaligus?

---

## Testing Guidelines

Buat test file `__tests__/payments.test.ts` untuk kasus berikut:

- `GET /api/v1/payments` tanpa auth → 401
- `GET /api/v1/payments` dengan reporter/editor token → 403
- `GET /api/v1/payments` dengan admin token → 200 dengan struktur summary + jobs yang benar
- `?status=paid` → hanya COMPLETED jobs
- `?status=pending` → hanya non-COMPLETED dengan reporter/editor
- `?period=month` → hanya job bulan berjalan
- `?search=<term>` → filter case_name, reporter_name, editor_name
- Summary kalkulasi: nilai `total_payout`, `reporter_minutes`, `pending_total` dihitung benar
- Job tanpa reporter → `reporter_name: null`, `reporter_payment: null`
- Job tanpa editor → `editor_name: null`, `editor_payment: null`
