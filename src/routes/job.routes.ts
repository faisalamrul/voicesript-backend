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
router.get('/', authenticate, authorize(['admin', 'reporter', 'reviewer']), jobController.getJobs);

export default router;
