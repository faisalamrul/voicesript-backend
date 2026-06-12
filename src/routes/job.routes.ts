import { Router } from 'express';
import * as jobController from '../controllers/job.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';

const router = Router();

/**
 * @openapi
 * /jobs:
 *   post:
 *     tags: [Jobs]
 *     summary: Buat job baru
 *     description: >
 *       Membuat court reporting job baru dengan status awal `NEW`.
 *       Hanya dapat diakses oleh admin.
 *       Field `status`, `reporter_id`, dan `editor_id` selalu ditentukan oleh sistem — nilai dari request body diabaikan.
 *       Field `city` **wajib** jika `location` adalah `physical`, dan **diabaikan diam-diam** jika `location` adalah `remote`.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [case_name, duration, location, city]
 *             properties:
 *               case_name:
 *                 type: string
 *                 example: State v. Wijaya
 *               duration:
 *                 type: integer
 *                 minimum: 1
 *                 description: Durasi audio dalam **detik**. Digunakan untuk menghitung bayaran reporter ((duration / 60) × Rp 2.000).
 *                 example: 1800
 *               location:
 *                 type: string
 *                 enum: [physical, remote]
 *                 example: physical
 *               city:
 *                 type: string
 *                 description: Wajib untuk semua location.
 *                 example: Bandung
 *     responses:
 *       201:
 *         description: Job berhasil dibuat
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Job created successfully }
 *                 data:
 *                   type: object
 *                   properties:
 *                     job: { $ref: '#/components/schemas/Job' }
 *       400:
 *         description: Validasi gagal (field kosong, duration < 1, city tidak ada untuk physical, dst.)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Access token tidak valid atau tidak ada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: Role bukan admin
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/', authenticate, authorize(['admin']), jobController.createJob);

/**
 * @openapi
 * /jobs:
 *   get:
 *     tags: [Jobs]
 *     summary: Daftar job berdasarkan role (paginated)
 *     description: >
 *       Mengembalikan daftar job sesuai role pengguna yang sedang login:
 *       **Admin** — semua job tanpa filter.
 *       **Reporter** — hanya job yang di-assign kepadanya.
 *       **Reviewer** — hanya job yang di-assign kepadanya sebagai editor.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *         description: Nomor halaman
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 10 }
 *         description: Jumlah item per halaman (maks 100)
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Cari berdasarkan nama kasus (case-insensitive)
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [NEW, ASSIGNED, TRANSCRIBED, REVIEWED, COMPLETED] }
 *         description: Filter berdasarkan status job
 *       - in: query
 *         name: city
 *         schema: { type: string }
 *         description: Filter berdasarkan kota (case-insensitive)
 *       - in: query
 *         name: location
 *         schema: { type: string, enum: [physical, remote] }
 *         description: Filter berdasarkan tipe lokasi
 *     responses:
 *       200:
 *         description: Daftar job berhasil diambil
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     jobs:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Job' }
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total: { type: integer, example: 42 }
 *                         page: { type: integer, example: 1 }
 *                         limit: { type: integer, example: 10 }
 *                         total_pages: { type: integer, example: 5 }
 *       401:
 *         description: Access token tidak valid atau tidak ada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: Role tidak diizinkan
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/', authenticate, authorize(['admin', 'reporter', 'editor']), jobController.getJobs);

/**
 * @openapi
 * /jobs/{id}/assign-reporter:
 *   post:
 *     tags: [Jobs]
 *     summary: Assign reporter ke job (Admin only)
 *     description: >
 *       Assign reporter ke job dengan status `NEW`. Status job otomatis berubah menjadi `ASSIGNED`.
 *       Reporter harus memiliki role `reporter` dan tidak sedang memiliki job aktif (status `ASSIGNED`).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reporter_id]
 *             properties:
 *               reporter_id:
 *                 type: string
 *                 format: uuid
 *                 example: a1b2c3d4-e5f6-7890-abcd-ef1234567890
 *     responses:
 *       200:
 *         description: Reporter berhasil di-assign, status job menjadi ASSIGNED
 *       400:
 *         description: Status bukan NEW, user bukan reporter, atau reporter sudah punya job aktif
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Access token tidak valid atau tidak ada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: Bukan admin
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Job atau reporter tidak ditemukan
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/:id/assign-reporter', authenticate, authorize(['admin']), jobController.assignReporter);

/**
 * @openapi
 * /jobs/{id}/submit-transcript:
 *   patch:
 *     tags: [Jobs]
 *     summary: Submit transkripsi (Reporter only)
 *     description: >
 *       Reporter yang di-assign menandai job sebagai sudah ditranskrip.
 *       Hanya reporter yang di-assign ke job ini yang dapat melakukan aksi ini.
 *       Status job otomatis berubah menjadi `TRANSCRIBED` dan `submitted_at` diisi otomatis.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               transcript_notes:
 *                 type: string
 *                 example: Transkripsi selesai, ada bagian yang tidak jelas di menit ke-12.
 *     responses:
 *       200:
 *         description: Transkripsi berhasil disubmit, status job menjadi TRANSCRIBED
 *       400:
 *         description: Status job bukan ASSIGNED
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Access token tidak valid atau tidak ada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: Bukan reporter yang di-assign ke job ini
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Job tidak ditemukan
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.patch('/:id/submit-transcript', authenticate, authorize(['reporter']), jobController.submitTranscript);

/**
 * @openapi
 * /jobs/{id}/assign-editor:
 *   post:
 *     tags: [Jobs]
 *     summary: Assign editor ke job (Admin only)
 *     description: >
 *       Assign editor untuk mereview transkripsi. Job harus berstatus `TRANSCRIBED`.
 *       Editor harus memiliki role `editor` dan tidak sedang memiliki job aktif (status `TRANSCRIBED` atau `REVIEWED`).
 *       Status job **tidak berubah** setelah editor di-assign — tetap `TRANSCRIBED`.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [editor_id]
 *             properties:
 *               editor_id:
 *                 type: string
 *                 format: uuid
 *                 example: b2c3d4e5-f6a7-8901-bcde-f12345678901
 *     responses:
 *       200:
 *         description: Editor berhasil di-assign, status job tetap TRANSCRIBED
 *       400:
 *         description: Status bukan TRANSCRIBED, user bukan editor, atau editor sudah punya job aktif
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Access token tidak valid atau tidak ada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: Bukan admin
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Job atau editor tidak ditemukan
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/:id/assign-editor', authenticate, authorize(['admin']), jobController.assignEditor);

/**
 * @openapi
 * /jobs/{id}/mark-reviewed:
 *   patch:
 *     tags: [Jobs]
 *     summary: Tandai job sebagai sudah direview (Editor only)
 *     description: >
 *       Editor yang di-assign menandai job sebagai sudah direview.
 *       Hanya editor yang di-assign ke job ini yang dapat melakukan aksi ini.
 *       Status job otomatis berubah menjadi `REVIEWED` dan `reviewed_at` diisi otomatis.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               review_notes:
 *                 type: string
 *                 example: Review selesai, ada beberapa koreksi minor pada paragraf 3.
 *     responses:
 *       200:
 *         description: Review berhasil ditandai, status job menjadi REVIEWED
 *       400:
 *         description: Status job bukan TRANSCRIBED atau belum ada editor yang di-assign
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Access token tidak valid atau tidak ada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: Bukan editor yang di-assign ke job ini
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Job tidak ditemukan
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.patch('/:id/mark-reviewed', authenticate, authorize(['editor']), jobController.markReviewed);

/**
 * @openapi
 * /jobs/{id}/complete:
 *   patch:
 *     tags: [Jobs]
 *     summary: Tandai job sebagai selesai (Admin only)
 *     description: >
 *       Admin menyelesaikan job setelah semua proses selesai.
 *       Job harus berstatus `REVIEWED` dan harus sudah memiliki reporter dan editor yang di-assign.
 *       Status job berubah menjadi `COMPLETED` dan pembayaran difinalkan:
 *       Reporter: `ceil(duration / 60) × Rp 2.000`, Editor: flat Rp 50.000.
 *       **Tidak membutuhkan request body.**
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Job berhasil diselesaikan, status menjadi COMPLETED, pembayaran tersimpan
 *       400:
 *         description: Status bukan REVIEWED, atau job tidak memiliki reporter/editor
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Access token tidak valid atau tidak ada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: Bukan admin
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Job tidak ditemukan
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.patch('/:id/complete', authenticate, authorize(['admin']), jobController.completeJob);

/**
 * @openapi
 * /jobs/{id}/history:
 *   get:
 *     tags: [Jobs]
 *     summary: Riwayat status job (timeline)
 *     description: >
 *       Mengembalikan seluruh riwayat perubahan status job secara kronologis.
 *       Setiap entry mencatat status sebelumnya, status baru, siapa yang melakukan perubahan, dan kapan (dengan presisi detik).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Riwayat status berhasil diambil
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     history:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: string, format: uuid }
 *                           job_id: { type: string, format: uuid }
 *                           from_status: { type: string, nullable: true, example: NEW }
 *                           to_status: { type: string, example: ASSIGNED }
 *                           changed_by: { type: string, format: uuid, nullable: true }
 *                           changed_at: { type: string, format: date-time, example: '2026-01-02T10:30:45.123Z' }
 *       401:
 *         description: Access token tidak valid atau tidak ada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: Role tidak diizinkan
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Job tidak ditemukan
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/:id/history', authenticate, authorize(['admin', 'reporter', 'editor']), jobController.getJobHistory);

export default router;
