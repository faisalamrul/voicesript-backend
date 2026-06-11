import { Router, Request, Response } from 'express';
import { pool } from '../config/database';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    res.json({ success: true, status: 'ok', db: 'connected' });
  } catch {
    res.status(503).json({ success: false, status: 'degraded', db: 'disconnected' });
  }
});

export default router;
