import { Router, Request, Response } from 'express';
import { pool } from '../config/database';

const router = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Cek status server dan koneksi database
 *     responses:
 *       200:
 *         description: Server dan database berjalan normal
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 status: { type: string, example: ok }
 *                 db: { type: string, example: connected }
 *       503:
 *         description: Database tidak dapat dijangkau
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 status: { type: string, example: degraded }
 *                 db: { type: string, example: disconnected }
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    res.json({ success: true, status: 'ok', db: 'connected' });
  } catch {
    res.status(503).json({ success: false, status: 'degraded', db: 'disconnected' });
  }
});

export default router;
