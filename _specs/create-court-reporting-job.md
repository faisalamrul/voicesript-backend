# Spec for create-court-reporting-job

branch: claude/feature/create-court-reporting-job

## Summary

REST API endpoint untuk membuat job pelaporan pengadilan (court reporting job). Admin membuat job dengan informasi kasus, durasi audio, dan lokasi. Job dimulai dengan status `NEW` dan mengikuti lifecycle status yang ketat. Sistem menghitung bayaran reporter berdasarkan durasi audio. Job fisik membutuhkan informasi kota untuk keperluan pencocokan reporter.

## Functional Requirements

### Endpoint
- `POST /api/v1/jobs` — membuat job baru, hanya dapat diakses oleh admin (butuh autentikasi + role admin)

### Request Body
- `case_name` — string, required
- `duration` — integer, required, minimum 1 (menit), digunakan untuk menghitung bayaran reporter: `duration × Rp 2.000`
- `location` — enum required, nilai yang diterima: `physical` atau `remote`
- `city` — string, required hanya ketika `location` adalah `physical`, harus dihilangkan atau null ketika `remote`

### System-set Fields (tidak dari request body)
- `status` — selalu di-set ke `NEW` saat pembuatan, tidak pernah diterima dari client
- `reporter_id` — null saat pembuatan, diisi nanti saat assignment
- `editor_id` — null saat pembuatan, diisi nanti saat assignment
- `created_at` — auto timestamp

### Status Lifecycle (State Machine)
Status hanya boleh bergerak maju secara sekuensial, tidak boleh melompat:
```
NEW → ASSIGNED → TRANSCRIBED → REVIEWED → COMPLETED
```
- Setiap transisi harus divalidasi oleh state machine di backend
- Transisi yang tidak valid (misal NEW → TRANSCRIBED) harus ditolak

### Business Logic
- Job dengan status `NEW` muncul di daftar job admin
- Hanya job dengan status `NEW` yang dapat di-assign ke reporter — job yang sudah `ASSIGNED` atau lebih lanjut tidak bisa di-assign ulang
- Ketika `location` adalah `physical`, logika assignment lebih mengutamakan (prefer) reporter yang kota-nya cocok dengan kota job
- Ketika `location` adalah `remote`, reporter mana pun dapat di-assign terlepas dari kota

### Response (201 Created)
Mengembalikan object job yang baru dibuat dengan semua field termasuk system-set fields.

## Possible Edge Cases

- `duration` kurang dari 1 — tolak dengan 400
- `location` adalah `physical` tapi `city` tidak dikirim — tolak dengan 400
- `location` adalah `remote` tapi `city` dikirim — abaikan nilai `city` atau tolak dengan 400
- `status` dikirim dalam request body — abaikan, selalu paksa ke `NEW`
- `reporter_id` atau `editor_id` dikirim dalam request body — abaikan, selalu null
- `duration` dikirim sebagai float (misal 30.5) — tolak dengan 400, harus integer
- `case_name` berupa string kosong atau hanya whitespace — tolak dengan 400
- `location` berisi nilai selain `physical` atau `remote` — tolak dengan 400
- Transisi status yang tidak valid (misal langsung ke `COMPLETED`) — tolak dengan 400

## Acceptance Criteria

- `POST /api/v1/jobs` dengan body valid mengembalikan 201 dan object job dengan `status: "NEW"`, `reporter_id: null`, `editor_id: null`
- `duration` kurang dari 1 mengembalikan 400 dengan pesan yang jelas
- `location: "physical"` tanpa `city` mengembalikan 400 dengan pesan yang jelas
- `location: "remote"` berhasil dibuat tanpa field `city`
- Field `status`, `reporter_id`, `editor_id` di request body diabaikan — nilai selalu dari sistem
- State machine menolak transisi status yang tidak sekuensial
- Job baru dengan status `NEW` muncul di daftar job admin
- Endpoint hanya bisa diakses oleh admin (non-admin mendapat 403)

## Open Questions

- Apakah `city` yang dikirim saat `location: "remote"` harus ditolak (400) atau cukup diabaikan secara diam-diam? diabaikan diam-diam (silently ignored).
- Apakah kalkulasi bayaran reporter (`duration × Rp 2.000`) disimpan sebagai field di tabel jobs, atau selalu dihitung on-the-fly saat dibutuhkan?  hitung on-the-fly, jangan simpan di tabel.
- Apakah ada batasan maksimum untuk nilai `duration`? Assessment tidak menyebut — tapi secara logika bisnis, sidang terpanjang jarang lebih dari 8 jam (480 menit). Rekomendasi: set batas max: 600 menit sebagai safeguard, atau tanyakan ke PM. Untuk assessment, cukup min: 1 tanpa max juga oke.
- Apakah `case_name` harus unik, atau boleh ada job dengan nama kasus yang sama? tidak perlu unik.
- Siapa yang dapat mengakses `GET /jobs` — hanya admin, atau reporter juga bisa melihat job yang di-assign kepadanya? Ini bergantung role:
RoleAksesAdminGET /jobs — semua job tanpa filterReporterGET /jobs?reporter_id=me — hanya job yang di-assign ke diaEditorGET /jobs?editor_id=me — hanya job yang di-assign ke dia

## Testing Guidelines

Create a test file(s) in the `./__tests__` folder for the new features, and creates meaningful tests for the following cases, without going too heavy:

- `POST /jobs` dengan body valid dan `location: "physical"` mengembalikan 201 dengan struktur response yang benar
- `POST /jobs` dengan body valid dan `location: "remote"` (tanpa `city`) mengembalikan 201
- `duration` kurang dari 1 mengembalikan 400
- `duration` bukan integer mengembalikan 400
- `case_name` kosong atau tidak ada mengembalikan 400
- `location: "physical"` tanpa `city` mengembalikan 400
- `location` dengan nilai tidak valid mengembalikan 400
- Field `status` dalam request body diabaikan — response selalu `NEW`
- Non-admin mencoba membuat job mendapat 403
