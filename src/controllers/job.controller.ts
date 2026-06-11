import { Response, NextFunction } from 'express';
import * as jobService from '../services/job.service';
import { AuthenticatedRequest } from '../types';
import { sendSuccess, sendCreated } from '../utils/response';

export async function createJob(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { case_name, duration, location, city } = req.body as Record<string, unknown>;

    const job = await jobService.createJob({
      caseName: case_name,
      duration,
      location,
      city,
    });

    sendCreated(res, { job }, 'Job created successfully');
  } catch (err) {
    next(err);
  }
}

export async function getJobs(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const page = Math.max(1, parseInt(req.query['page'] as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query['limit'] as string) || 10));

    const result = await jobService.getJobs(req.user!, { page, limit });
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
