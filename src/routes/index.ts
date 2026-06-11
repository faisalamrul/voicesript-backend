import { Router } from 'express';
import healthRouter from './health.routes';
import authRouter from './auth.routes';
import adminRouter from './admin.routes';

const router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/admin', adminRouter);

export default router;
