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
 *     summary: Create a new job
 *     description: >
 *       Creates a new court reporting job with initial status `NEW`. Admin only.
 *       `status`, `reporter_id`, and `editor_id` are always set by the system — any values in the
 *       request body are ignored. `city` is **required** when `location` is `physical`.
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
 *                 description: Audio duration in **seconds**. Used to calculate reporter pay ((duration / 60) × Rp 2,000).
 *                 example: 1800
 *               location:
 *                 type: string
 *                 enum: [physical, remote]
 *                 example: physical
 *               city:
 *                 type: string
 *                 description: Required for all locations.
 *                 example: Bandung
 *     responses:
 *       201:
 *         description: Job created successfully
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
 *         description: Validation failed (empty field, duration < 1, missing city, etc.)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Invalid or missing access token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: Not an admin
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/', authenticate, authorize(['admin']), jobController.createJob);

/**
 * @openapi
 * /jobs/summary:
 *   get:
 *     tags: [Jobs]
 *     summary: Job statistics summary (admin only)
 *     description: >
 *       Returns aggregated job counts: total, per-status breakdown, in-progress count
 *       (ASSIGNED+TRANSCRIBED+REVIEWED), and total reporter & editor payments from COMPLETED jobs.
 *     security:
 *       - bearerAuth: []
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
 *                     total: { type: integer, example: 50 }
 *                     by_status:
 *                       type: object
 *                       example: { NEW: 10, ASSIGNED: 1, TRANSCRIBED: 15, REVIEWED: 1, COMPLETED: 23 }
 *                     in_progress: { type: integer, example: 17, description: 'ASSIGNED + TRANSCRIBED + REVIEWED' }
 *                     total_reporter_payment: { type: integer, example: 4200000 }
 *                     total_editor_payment: { type: integer, example: 1150000 }
 *                     total_payment: { type: integer, example: 5350000 }
 *       401:
 *         $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/summary', authenticate, authorize(['admin']), jobController.getJobSummary);

/**
 * @openapi
 * /jobs:
 *   get:
 *     tags: [Jobs]
 *     summary: List jobs by role (paginated)
 *     description: >
 *       Returns jobs filtered by the authenticated user's role:
 *       **Admin** — all jobs.
 *       **Reporter** — only jobs assigned to them.
 *       **Editor** — only jobs assigned to them as editor.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 10 }
 *         description: Items per page (max 100)
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by case name (case-insensitive)
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [NEW, ASSIGNED, TRANSCRIBED, REVIEWED, COMPLETED] }
 *         description: Filter by job status
 *       - in: query
 *         name: city
 *         schema: { type: string }
 *         description: Filter by city (case-insensitive)
 *       - in: query
 *         name: location
 *         schema: { type: string, enum: [physical, remote] }
 *         description: Filter by location type
 *     responses:
 *       200:
 *         description: Job list retrieved successfully
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
 *         description: Invalid or missing access token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: Role not allowed
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/', authenticate, authorize(['admin', 'reporter', 'editor']), jobController.getJobs);

/**
 * @openapi
 * /jobs/{id}:
 *   get:
 *     tags: [Jobs]
 *     summary: Get job by ID (admin or assigned reporter)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Job detail retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     job: { $ref: '#/components/schemas/Job' }
 *       401:
 *         description: Invalid or missing access token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: Role not allowed (requires admin or the assigned reporter)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Job not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/:id', authenticate, authorize(['admin', 'reporter']), jobController.getJob);

/**
 * @openapi
 * /jobs/{id}/assign-reporter:
 *   post:
 *     tags: [Jobs]
 *     summary: Assign reporter to job (admin only)
 *     description: >
 *       Assigns a reporter to a job in `NEW` status. The job status automatically changes to
 *       `ASSIGNED`. The reporter must have the `reporter` role and must not have an active job
 *       (status `ASSIGNED`).
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
 *         description: Reporter assigned successfully, job status changed to ASSIGNED
 *       400:
 *         description: Status is not NEW, user is not a reporter, or reporter already has an active job
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Invalid or missing access token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: Not an admin
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Job or reporter not found
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
 *     summary: Submit transcript (reporter only)
 *     description: >
 *       The assigned reporter marks the job as transcribed. Only the reporter assigned to this job
 *       can perform this action. The job status automatically changes to `TRANSCRIBED` and
 *       `submitted_at` is set automatically.
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
 *                 example: Transcription done, unclear section at minute 12.
 *     responses:
 *       200:
 *         description: Transcript submitted successfully, job status changed to TRANSCRIBED
 *       400:
 *         description: Job status is not ASSIGNED
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Invalid or missing access token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: Not the reporter assigned to this job
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Job not found
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
 *     summary: Assign editor to job (admin only)
 *     description: >
 *       Assigns an editor to review the transcript. The job must be in `TRANSCRIBED` status.
 *       The editor must have the `editor` role and must not have an active job (status `TRANSCRIBED`
 *       or `REVIEWED`). The job status **does not change** after the editor is assigned — it
 *       remains `TRANSCRIBED`.
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
 *         description: Editor assigned successfully, job status remains TRANSCRIBED
 *       400:
 *         description: Status is not TRANSCRIBED, user is not an editor, or editor already has an active job
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Invalid or missing access token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: Not an admin
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Job or editor not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/:id/assign-editor', authenticate, authorize(['admin']), jobController.assignEditor);

/**
 * @openapi
 * /jobs/{id}/submit-review:
 *   patch:
 *     tags: [Jobs]
 *     summary: Submit review (editor only)
 *     description: >
 *       The assigned editor completes the transcript review. Only the editor assigned to this job
 *       can perform this action. The job status automatically changes to `REVIEWED` and
 *       `reviewed_at` is set automatically.
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
 *                 example: Review done, minor corrections on paragraph 3.
 *     responses:
 *       200:
 *         description: Review submitted successfully, job status changed to REVIEWED
 *       400:
 *         description: Job status is not TRANSCRIBED or no editor has been assigned
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Invalid or missing access token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: Not the editor assigned to this job
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Job not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.patch('/:id/submit-review', authenticate, authorize(['editor']), jobController.markReviewed);

/**
 * @openapi
 * /jobs/{id}/complete:
 *   patch:
 *     tags: [Jobs]
 *     summary: Mark job as complete (admin only)
 *     description: >
 *       Admin finalises a job after all stages are complete. The job must be in `REVIEWED` status
 *       and must have both a reporter and an editor assigned. The job status changes to `COMPLETED`
 *       and payment is finalised: Reporter: `floor(duration / 60) × Rp 2,000`, Editor: flat
 *       Rp 50,000. **No request body required.**
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Job completed successfully, status changed to COMPLETED, payment saved
 *       400:
 *         description: Status is not REVIEWED, or job has no reporter/editor assigned
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Invalid or missing access token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: Not an admin
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Job not found
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
 *     summary: Job status history (timeline)
 *     description: >
 *       Returns the full chronological history of job status changes. Each entry records the
 *       previous status, the new status, who made the change, and when (with second-level
 *       precision).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Status history retrieved successfully
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
 *         description: Invalid or missing access token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: Role not allowed
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404:
 *         description: Job not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/:id/history', authenticate, authorize(['admin', 'reporter', 'editor']), jobController.getJobHistory);

export default router;
