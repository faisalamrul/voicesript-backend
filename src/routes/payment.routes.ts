import { Router } from 'express';
import * as paymentController from '../controllers/payment.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';

const router = Router();

/**
 * @openapi
 * /payments:
 *   get:
 *     tags: [Payments]
 *     summary: Rekap finansial semua job (Admin only)
 *     description: >
 *       Mengembalikan summary agregat (total payout, breakdown reporter/editor, pending)
 *       dan daftar job dengan info pembayaran. Untuk job COMPLETED, payment diambil dari
 *       snapshot. Untuk job pending, payment adalah estimasi berdasarkan durasi.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Filter by case_name, nama reporter, atau nama editor (case-insensitive)
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [paid, pending] }
 *         description: "'paid' = hanya COMPLETED | 'pending' = non-COMPLETED dengan reporter/editor"
 *       - in: query
 *         name: period
 *         schema: { type: string, enum: [month, last] }
 *         description: "'month' = bulan berjalan | 'last' = bulan lalu | kosong = semua waktu"
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
 *         description: Rekap berhasil diambil
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total_payout: { type: integer, example: 730000 }
 *                         reporter_total: { type: integer, example: 630000 }
 *                         reporter_minutes: { type: integer, example: 315 }
 *                         editor_total: { type: integer, example: 100000 }
 *                         editor_jobs: { type: integer, example: 2 }
 *                         pending_total: { type: integer, example: 290000 }
 *                     jobs:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: string, format: uuid }
 *                           case_name: { type: string, example: 'Arbitration #88' }
 *                           duration: { type: integer, example: 5400 }
 *                           status: { type: string, example: COMPLETED }
 *                           reporter_name: { type: string, nullable: true, example: 'Rina K.' }
 *                           reporter_payment: { type: integer, nullable: true, example: 180000 }
 *                           editor_name: { type: string, nullable: true, example: 'Tono' }
 *                           editor_payment: { type: integer, nullable: true, example: 50000 }
 *                           completed_at: { type: string, format: date-time, nullable: true }
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total: { type: integer, example: 42 }
 *                         page: { type: integer, example: 1 }
 *                         limit: { type: integer, example: 10 }
 *                         total_pages: { type: integer, example: 5 }
 *       400:
 *         $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/', authenticate, authorize(['admin']), paymentController.getPayments);

export default router;
