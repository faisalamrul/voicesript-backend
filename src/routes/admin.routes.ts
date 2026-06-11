import { Router } from 'express';
import * as adminController from '../controllers/admin.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';

const router = Router();

/**
 * @openapi
 * /admin/users:
 *   post:
 *     tags: [Admin]
 *     summary: Buat user baru (admin only)
 *     description: >
 *       Endpoint khusus admin untuk membuat user baru dengan role apapun,
 *       termasuk `admin`. Membutuhkan access token dengan role `admin`.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, role]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Admin Baru
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin.baru@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: supersecret123
 *               role:
 *                 type: string
 *                 enum: [admin, reporter, reviewer]
 *                 example: admin
 *     responses:
 *       201:
 *         description: User berhasil dibuat
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: User created successfully }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user: { $ref: '#/components/schemas/UserPublic' }
 *       400:
 *         description: Input tidak valid atau role tidak dikenali
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Access token tidak valid atau tidak ada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: User bukan admin
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409:
 *         description: Email sudah terdaftar
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/users', authenticate, authorize(['admin']), adminController.createUser);

/**
 * @openapi
 * /admin/reviewers:
 *   post:
 *     tags: [Admin]
 *     summary: Daftarkan user baru sebagai reviewer (admin only)
 *     description: >
 *       Endpoint khusus admin untuk mendaftarkan user baru dengan role `reviewer`.
 *       Role reviewer tidak bisa didaftarkan lewat registrasi publik — hanya admin
 *       yang berwenang membuat akun reviewer.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Siti Reviewer
 *               email:
 *                 type: string
 *                 format: email
 *                 example: siti.reviewer@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: reviewer123
 *     responses:
 *       201:
 *         description: Reviewer berhasil didaftarkan
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Reviewer registered successfully }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user: { $ref: '#/components/schemas/UserPublic' }
 *       400:
 *         description: Input tidak valid
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Access token tidak valid atau tidak ada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403:
 *         description: User bukan admin
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409:
 *         description: Email sudah terdaftar
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/reviewers', authenticate, authorize(['admin']), adminController.registerReviewer);

export default router;
