import { Router } from 'express';
import healthRouter from './health.routes';

const router = Router();

router.use('/health', healthRouter);

// Register feature routes here:
// router.use('/users', usersRouter);

export default router;
