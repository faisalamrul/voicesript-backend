import * as jobRepo from '../repositories/job.repository';
import * as userRepo from '../repositories/user.repository';
import * as historyRepo from '../repositories/jobStatusHistory.repository';
import { withTransaction } from '../config/database';
import { Job } from '../models/job.model';
import { JobStatusHistory } from '../models/jobStatusHistory.model';
import { AppError } from '../utils/AppError';
import { Role } from '../types';
import { STATUS_ORDER } from '../utils/jobStateMachine';

const PG_UNIQUE_VIOLATION = '23505';

const REPORTER_PAY_RATE = 2000; // Rp per minute (duration stored in seconds)

export async function createJob(
  params: { caseName: unknown; duration: unknown; location: unknown; city: unknown },
  createdBy: string
): Promise<Job> {
  if (
    typeof params.caseName !== 'string' ||
    params.caseName.trim().length === 0
  ) {
    throw new AppError('case_name is required and cannot be empty', 400);
  }

  if (!Number.isInteger(params.duration) || (params.duration as number) < 1) {
    throw new AppError('duration must be an integer (seconds) with a minimum value of 1', 400);
  }

  if (params.location !== 'physical' && params.location !== 'remote') {
    throw new AppError("location must be 'physical' or 'remote'", 400);
  }

  if (typeof params.city !== 'string' || params.city.trim().length === 0) {
    throw new AppError('city is required', 400);
  }

  const caseName = params.caseName.trim();
  const duration = params.duration as number;
  const location = params.location;
  const city = params.city.trim();

  return withTransaction(async (client) => {
    const job = await jobRepo.createJob({ caseName, duration, location, city }, client);
    await historyRepo.insert({ jobId: job.id, fromStatus: null, toStatus: 'NEW', changedBy: createdBy }, client);
    return job;
  });
}

export interface JobsResult {
  jobs: Job[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

export interface JobQueryFilters {
  status?: string;
  search?: string;
  city?: string;
  location?: string;
}

export async function getJobs(
  requestingUser: { id: string; role: Role },
  pagination: { page: number; limit: number },
  queryFilters: JobQueryFilters = {}
): Promise<JobsResult> {
  const filters: jobRepo.JobFilters = {};

  if (requestingUser.role === 'reporter') {
    filters.reporter_id = requestingUser.id;
  } else if (requestingUser.role === 'editor') {
    filters.editor_id = requestingUser.id;
  }

  if (queryFilters.status) {
    const s = queryFilters.status as jobRepo.JobFilters['status'];
    if (!STATUS_ORDER.includes(s!)) {
      throw new AppError(`Invalid status. Allowed: ${STATUS_ORDER.join(', ')}`, 400);
    }
    filters.status = s;
  }
  if (queryFilters.search) filters.search = queryFilters.search;
  if (queryFilters.city) filters.city = queryFilters.city;
  if (queryFilters.location) filters.location = queryFilters.location;

  const { jobs, total } = await jobRepo.findAll(filters, pagination);

  return {
    jobs,
    pagination: {
      total,
      page: pagination.page,
      limit: pagination.limit,
      total_pages: Math.ceil(total / pagination.limit),
    },
  };
}

const EDITOR_PAY = 50_000;

export function calculateReporterPay(durationSeconds: number): number {
  return Math.ceil(durationSeconds / 60) * REPORTER_PAY_RATE;
}

export async function assignReporter(jobId: string, reporterId: string, changedBy: string): Promise<Job> {
  const job = await jobRepo.findById(jobId);
  if (!job) throw AppError.notFound('Job not found');
  if (job.status !== 'NEW') throw new AppError('Job must be in NEW status to assign a reporter', 400);

  const user = await userRepo.findById(reporterId);
  if (!user) throw AppError.notFound('Reporter not found');
  if (user.role !== 'reporter') throw new AppError('User is not a reporter', 400);

  const activeJobs = await jobRepo.countActiveJobsByReporter(reporterId);
  if (activeJobs > 0) throw new AppError('Reporter already has an active job', 400);

  try {
    return await withTransaction(async (client) => {
      const updated = await jobRepo.assignReporter(jobId, reporterId, client);
      await historyRepo.insert({ jobId, fromStatus: 'NEW', toStatus: 'ASSIGNED', changedBy }, client);
      return updated;
    });
  } catch (err) {
    if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
      throw new AppError('Reporter already has an active job', 400);
    }
    throw err;
  }
}

export async function submitTranscript(
  jobId: string,
  notes: string | null,
  requestingUserId: string
): Promise<Job> {
  const job = await jobRepo.findById(jobId);
  if (!job) throw AppError.notFound('Job not found');
  if (job.status !== 'ASSIGNED') throw new AppError('Job must be in ASSIGNED status to submit transcript', 400);
  if (job.reporter_id !== requestingUserId) throw new AppError('Only the assigned reporter can submit the transcript', 403);

  return withTransaction(async (client) => {
    const updated = await jobRepo.submitTranscript(jobId, notes, client);
    await historyRepo.insert({ jobId, fromStatus: 'ASSIGNED', toStatus: 'TRANSCRIBED', changedBy: requestingUserId }, client);
    return updated;
  });
}

export async function assignEditor(jobId: string, editorId: string, changedBy: string): Promise<Job> {
  const job = await jobRepo.findById(jobId);
  if (!job) throw AppError.notFound('Job not found');
  if (job.status !== 'TRANSCRIBED') throw new AppError('Job must be in TRANSCRIBED status to assign an editor', 400);

  const user = await userRepo.findById(editorId);
  if (!user) throw AppError.notFound('Editor not found');
  if (user.role !== 'editor') throw new AppError('User is not an editor', 400);

  const activeJobs = await jobRepo.countActiveJobsByEditor(editorId);
  if (activeJobs > 0) throw new AppError('Editor already has an active job', 400);

  try {
    return await withTransaction(async (client) => {
      const updated = await jobRepo.assignEditor(jobId, editorId, client);
      return updated;
    });
  } catch (err) {
    if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
      throw new AppError('Editor already has an active job', 400);
    }
    throw err;
  }
}

export async function markReviewed(
  jobId: string,
  notes: string | null,
  requestingUserId: string
): Promise<Job> {
  const job = await jobRepo.findById(jobId);
  if (!job) throw AppError.notFound('Job not found');
  if (job.status !== 'TRANSCRIBED') throw new AppError('Job must be in TRANSCRIBED status to submit review', 400);
  if (!job.editor_id) throw new AppError('No editor assigned to this job', 400);
  if (job.editor_id !== requestingUserId) throw new AppError('Only the assigned editor can submit the review', 403);
  if (!job.reporter_id) throw new AppError('Job has no assigned reporter', 400);

  const reporterPayment = calculateReporterPay(job.duration);

  return withTransaction(async (client) => {
    await jobRepo.markReviewed(jobId, notes, client);
    const updated = await jobRepo.completeJob(jobId, reporterPayment, EDITOR_PAY, client);
    await historyRepo.insert({ jobId, fromStatus: 'TRANSCRIBED', toStatus: 'COMPLETED', changedBy: requestingUserId }, client);
    return updated;
  });
}

export async function completeJob(jobId: string, changedBy: string): Promise<Job> {
  const job = await jobRepo.findById(jobId);
  if (!job) throw AppError.notFound('Job not found');
  if (job.status !== 'REVIEWED') throw new AppError('Job must be in REVIEWED status to complete', 400);
  if (!job.reporter_id) throw new AppError('Job has no assigned reporter', 400);
  if (!job.editor_id) throw new AppError('Job has no assigned editor', 400);

  const reporterPayment = calculateReporterPay(job.duration);
  const editorPayment = EDITOR_PAY;

  return withTransaction(async (client) => {
    const updated = await jobRepo.completeJob(jobId, reporterPayment, editorPayment, client);
    await historyRepo.insert({ jobId, fromStatus: 'REVIEWED', toStatus: 'COMPLETED', changedBy }, client);
    return updated;
  });
}

export async function getJobHistory(jobId: string): Promise<JobStatusHistory[]> {
  const job = await jobRepo.findById(jobId);
  if (!job) throw AppError.notFound('Job not found');
  return historyRepo.findByJobId(jobId);
}

export async function getJobSummary(): Promise<jobRepo.JobSummary> {
  return jobRepo.getSummary();
}
