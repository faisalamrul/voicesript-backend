import { Response, NextFunction } from 'express';
import * as jobService from '../services/job.service';
import { AuthenticatedRequest } from '../types';
import { sendSuccess, sendCreated } from '../utils/response';
import { AppError } from '../utils/AppError';

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
    }, req.user!.id);

    sendCreated(res, { job }, 'Job created successfully');
  } catch (err) {
    next(err);
  }
}

export async function getJob(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const job = await jobService.getJobById(id, req.user!);
    sendSuccess(res, { job });
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

    const queryFilters = {
      status: req.query['status'] as string | undefined,
      search: req.query['search'] as string | undefined,
      city: req.query['city'] as string | undefined,
      location: req.query['location'] as string | undefined,
    };

    const result = await jobService.getJobs(req.user!, { page, limit }, queryFilters);
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
    const { reporter_id } = req.body as { reporter_id?: string };
    if (!reporter_id) throw new AppError('reporter_id is required', 400);
    const job = await jobService.assignReporter(id, reporter_id, req.user!.id);
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
    const { editor_id } = req.body as { editor_id?: string };
    if (!editor_id) throw new AppError('editor_id is required', 400);
    const job = await jobService.assignEditor(id, editor_id, req.user!.id);
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

export async function getJobHistory(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const history = await jobService.getJobHistory(id);
    sendSuccess(res, { history });
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
    const job = await jobService.completeJob(id, req.user!.id);
    sendSuccess(res, { job }, 'Job completed successfully');
  } catch (err) {
    next(err);
  }
}

export async function getJobSummary(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const summary = await jobService.getJobSummary();
    sendSuccess(res, summary);
  } catch (err) {
    next(err);
  }
}
