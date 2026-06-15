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
 *     summary: Financial summary for all jobs (admin only)
 *     description: >
 *       Returns an aggregate summary (total payout, reporter/editor breakdown, pending) and a
 *       paginated job list with payment details. For COMPLETED jobs, payment is taken from the
 *       stored snapshot. For pending jobs, payment is estimated based on duration.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Filter by case_name, reporter name, or editor name (case-insensitive)
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [paid, pending] }
 *         description: "'paid' = COMPLETED only | 'pending' = non-COMPLETED with assigned reporter/editor"
 *       - in: query
 *         name: period
 *         schema: { type: string, enum: [month, last] }
 *         description: "'month' = current month | 'last' = last month | empty = all time"
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 10 }
 *         description: Items per page (max 100)
 *     responses:
 *       200:
 *         description: Summary retrieved successfully
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
