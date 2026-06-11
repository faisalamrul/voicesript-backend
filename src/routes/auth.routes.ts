import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { authenticate } from '../middlewares/authenticate';

const router = Router();

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Registrasi user baru
 *     description: >
 *       Membuat akun baru dengan role **reporter** (satu-satunya role yang diizinkan
 *       lewat registrasi publik). Untuk mendapatkan role `editor` atau `admin`,
 *       hubungi admin — hanya admin yang dapat membuat akun dengan role tersebut
 *       melalui endpoint `POST /admin/users`.
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
 *                 example: Budi Santoso
 *               email:
 *                 type: string
 *                 format: email
 *                 example: budi@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 example: rahasia123
 *     responses:
 *       201:
 *         description: Registrasi berhasil
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Registration successful }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user: { $ref: '#/components/schemas/UserPublic' }
 *       400:
 *         description: Input tidak valid atau mencoba mendaftar dengan role selain reporter
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       409:
 *         description: Email sudah terdaftar
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/register', authController.register);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login user
 *     description: >
 *       Melakukan autentikasi user dan mengembalikan access token (15 menit),
 *       refresh token (7 hari), dan daftar menu yang diizinkan berdasarkan role.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: budi@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: rahasia123
 *     responses:
 *       200:
 *         description: Login berhasil
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Login successful }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user: { $ref: '#/components/schemas/UserPublic' }
 *                     tokens:
 *                       type: object
 *                       properties:
 *                         access_token: { type: string, example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... }
 *                     allowed_menus:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/MenuItem' }
 *         headers:
 *           Set-Cookie:
 *             description: >
 *               HTTPOnly cookie berisi refresh token.
 *               `refresh_token=<jwt>; Path=/api/v1/auth; HttpOnly; SameSite=Strict`
 *             schema:
 *               type: string
 *       400:
 *         description: Field email atau password kosong
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       401:
 *         description: Kredensial tidak valid
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/login', authController.login);

/**
 * @openapi
 * /auth/refresh-token:
 *   post:
 *     tags: [Auth]
 *     summary: Perbarui access token
 *     description: >
 *       Menggunakan refresh token dari **HTTPOnly cookie** untuk mendapatkan access token baru.
 *       Menerapkan **Refresh Token Rotation** — cookie lama diinvalidasi dan cookie baru di-set.
 *       Jika cookie tidak ada atau token sudah dicabut, permintaan akan ditolak.
 *       **Tidak membutuhkan request body.**
 *     responses:
 *       200:
 *         description: Token berhasil diperbarui
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Token refreshed }
 *                 data:
 *                   type: object
 *                   properties:
 *                     access_token: { type: string, example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... }
 *         headers:
 *           Set-Cookie:
 *             description: Cookie refresh token baru (rotasi)
 *             schema:
 *               type: string
 *       401:
 *         description: Cookie tidak ada, token tidak valid, expired, atau sudah dicabut
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/refresh-token', authController.refreshToken);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout user
 *     description: >
 *       Mencabut refresh token dari database dan menghapus HTTPOnly cookie.
 *       Membutuhkan access token yang valid di header Authorization.
 *       **Tidak membutuhkan request body.**
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout berhasil, cookie dihapus
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Logged out successfully }
 *                 data: { type: 'null', nullable: true }
 *       401:
 *         description: Access token tidak valid atau tidak ada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post('/logout', authenticate, authController.logout);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Ambil data user yang sedang login
 *     description: Mengembalikan data user dari access token yang aktif.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Data user berhasil diambil
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user: { $ref: '#/components/schemas/UserPublic' }
 *       401:
 *         description: Access token tidak valid atau tidak ada
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.get('/me', authenticate, authController.me);

export default router;
