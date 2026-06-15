import { Router } from 'express';
import * as reporterController from '../controllers/reporter.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';

const router = Router();

/**
 * @openapi
 * /reporter/earnings:
 *   get:
 *     tags: [Reporter]
 *     summary: Earnings summary for the authenticated reporter
 *     description: >
 *       Returns earnings card summary, work stats, turnaround stats, monthly breakdown, and a
 *       paginated job list for the authenticated reporter. The optional period filter (month/last)
 *       applies to the job list and the `period_earned` field. `total_earned`, `total_minutes`,
 *       and `pending` always reflect all-time data.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema: { type: string, enum: [month, last] }
 *         description: Period filter — month (current month) or last (last month). Empty = all time.
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Filter jobs by case_name (case-insensitive)
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 10 }
 *     responses:
 *       200:
 *         description: Earnings summary retrieved successfully
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
 *                         total_earned: { type: integer, example: 840000 }
 *                         total_minutes: { type: integer, example: 420 }
 *                         period_earned: { type: integer, nullable: true, example: 120000 }
 *                         pending: { type: integer, example: 80000 }
 *                     work_stats:
 *                       type: object
 *                       properties:
 *                         total_jobs: { type: integer, example: 15 }
 *                         jobs_this_month: { type: integer, example: 3 }
 *                         avg_duration_minutes: { type: integer, example: 28 }
 *                     jobs:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: string, format: uuid }
 *                           case_name: { type: string }
 *                           location: { type: string, enum: [physical, remote] }
 *                           duration: { type: integer }
 *                           status: { type: string }
 *                           reporter_payment: { type: integer, nullable: true }
 *                           assigned_at: { type: string, format: date-time, nullable: true }
 *                           submitted_at: { type: string, format: date-time, nullable: true }
 *                           reviewed_at: { type: string, format: date-time, nullable: true }
 *                           completed_at: { type: string, format: date-time, nullable: true }
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total: { type: integer, example: 15 }
 *                         page: { type: integer, example: 1 }
 *                         limit: { type: integer, example: 10 }
 *                         total_pages: { type: integer, example: 2 }
 *       400:
 *         description: Invalid period
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Invalid or missing access token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: Not a reporter
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/earnings', authenticate, authorize(['reporter']), reporterController.getEarnings);

export default router;
