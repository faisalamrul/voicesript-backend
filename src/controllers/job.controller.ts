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

export async function assignReporter(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const { reporter_id } = req.body as { reporter_id: string };
    const job = await jobService.assignReporter(id, reporter_id);
    sendSuccess(res, { job }, 'Reporter assigned successfully');
  } catch (err) {
    next(err);
  }
}

export async function submitTranscript(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const { transcript_notes } = req.body as { transcript_notes?: string };
    const job = await jobService.submitTranscript(id, transcript_notes ?? null, req.user!.id);
    sendSuccess(res, { job }, 'Transcript submitted successfully');
  } catch (err) {
    next(err);
  }
}

export async function assignEditor(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const { editor_id } = req.body as { editor_id: string };
    const job = await jobService.assignEditor(id, editor_id);
    sendSuccess(res, { job }, 'Editor assigned successfully');
  } catch (err) {
    next(err);
  }
}

export async function markReviewed(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const { review_notes } = req.body as { review_notes?: string };
    const job = await jobService.markReviewed(id, review_notes ?? null, req.user!.id);
    sendSuccess(res, { job }, 'Job marked as reviewed');
  } catch (err) {
    next(err);
  }
}

export async function completeJob(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const job = await jobService.completeJob(id);
    sendSuccess(res, { job }, 'Job completed successfully');
  } catch (err) {
    next(err);
  }
}
