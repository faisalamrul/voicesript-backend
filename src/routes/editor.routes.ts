import { Router } from 'express';
import * as editorController from '../controllers/editor.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';

const router = Router();

/**
 * @openapi
 * /editor/earnings:
 *   get:
 *     tags: [Editor]
 *     summary: Earnings summary for the authenticated editor
 *     description: >
 *       Returns earnings card summary, work stats, turnaround stats (editor_assigned_at →
 *       reviewed_at), monthly breakdown, and a paginated job list for the authenticated editor.
 *       The optional period filter (month/last) applies to the job list and `period_earned`.
 *       `total_earned`, `total_minutes`, and `pending` always reflect all-time data.
 *       `pending` counts REVIEWED jobs at the flat editor fee (Rp 50,000/job).
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
 *                         total_earned: { type: integer, example: 600000 }
 *                         total_minutes: { type: integer, example: 720 }
 *                         period_earned: { type: integer, nullable: true, example: 100000 }
 *                         pending: { type: integer, example: 50000 }
 *                     work_stats:
 *                       type: object
 *                       properties:
 *                         total_jobs: { type: integer, example: 12 }
 *                         jobs_this_month: { type: integer, example: 2 }
 *                         avg_duration_minutes: { type: integer, example: 35 }
 *                     turnaround_stats:
 *                       type: object
 *                       properties:
 *                         avg_hours: { type: number, example: 4.2 }
 *                         trend: { type: string, enum: [improving, stable, declining] }
 *                         recent_avg_hours: { type: number, example: 3.8 }
 *                         baseline_avg_hours: { type: number, example: 4.5 }
 *                         reviewed_jobs_count: { type: integer, example: 10 }
 *                     monthly_breakdown:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           month: { type: string, example: '2026-06' }
 *                           month_label: { type: string, example: 'Jun 2026' }
 *                           earned: { type: integer, example: 100000 }
 *                           minutes: { type: integer, example: 120 }
 *                           jobs: { type: integer, example: 2 }
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
 *                           editor_payment: { type: integer, nullable: true }
 *                           assigned_at: { type: string, format: date-time, nullable: true }
 *                           reviewed_at: { type: string, format: date-time, nullable: true }
 *                           completed_at: { type: string, format: date-time, nullable: true }
 *                     rate_info:
 *                       type: object
 *                       properties:
 *                         type: { type: string, example: flat_per_job }
 *                         amount: { type: integer, example: 50000 }
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total: { type: integer, example: 12 }
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
 *         description: Not an editor
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/earnings', authenticate, authorize(['editor']), editorController.getEarnings);

export default router;
