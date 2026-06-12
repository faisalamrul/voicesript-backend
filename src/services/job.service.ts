import * as jobRepo from '../repositories/job.repository';
import * as userRepo from '../repositories/user.repository';
import { Job } from '../models/job.model';
import { AppError } from '../utils/AppError';
import { Role } from '../types';

const REPORTER_PAY_RATE = 2000; // Rp per minute (duration stored in seconds)

export async function createJob(params: {
  caseName: unknown;
  duration: unknown;
  location: unknown;
  city: unknown;
}): Promise<Job> {
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

  const city = params.city.trim();

  return jobRepo.createJob({
    caseName: params.caseName.trim(),
    duration: params.duration as number,
    location: params.location,
    city,
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

export async function getJobs(
  requestingUser: { id: string; role: Role },
  pagination: { page: number; limit: number }
): Promise<JobsResult> {
  let filters: jobRepo.JobFilters | undefined;

  if (requestingUser.role === 'reporter') {
    filters = { reporter_id: requestingUser.id };
  } else if (requestingUser.role === 'editor') {
    filters = { editor_id: requestingUser.id };
  }

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

export async function assignReporter(jobId: string, reporterId: string): Promise<Job> {
  const job = await jobRepo.findById(jobId);
  if (!job) throw AppError.notFound('Job not found');
  if (job.status !== 'NEW') throw new AppError('Job must be in NEW status to assign a reporter', 400);

  const user = await userRepo.findById(reporterId);
  if (!user) throw AppError.notFound('Reporter not found');
  if (user.role !== 'reporter') throw new AppError('User is not a reporter', 400);

  const activeJobs = await jobRepo.countActiveJobsByReporter(reporterId);
  if (activeJobs > 0) throw new AppError('Reporter already has an active job', 400);

  return jobRepo.assignReporter(jobId, reporterId);
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

  return jobRepo.submitTranscript(jobId, notes);
}

export async function assignEditor(jobId: string, editorId: string): Promise<Job> {
  const job = await jobRepo.findById(jobId);
  if (!job) throw AppError.notFound('Job not found');
  if (job.status !== 'TRANSCRIBED') throw new AppError('Job must be in TRANSCRIBED status to assign an editor', 400);

  const user = await userRepo.findById(editorId);
  if (!user) throw AppError.notFound('Editor not found');
  if (user.role !== 'editor') throw new AppError('User is not an editor', 400);

  const activeJobs = await jobRepo.countActiveJobsByEditor(editorId);
  if (activeJobs > 0) throw new AppError('Editor already has an active job', 400);

  return jobRepo.assignEditor(jobId, editorId);
}

export async function markReviewed(
  jobId: string,
  notes: string | null,
  requestingUserId: string
): Promise<Job> {
  const job = await jobRepo.findById(jobId);
  if (!job) throw AppError.notFound('Job not found');
  if (job.status !== 'TRANSCRIBED') throw new AppError('Job must be in TRANSCRIBED status to mark as reviewed', 400);
  if (!job.editor_id) throw new AppError('No editor assigned to this job', 400);
  if (job.editor_id !== requestingUserId) throw new AppError('Only the assigned editor can mark the job as reviewed', 403);

  return jobRepo.markReviewed(jobId, notes);
}

export async function completeJob(jobId: string): Promise<Job> {
  const job = await jobRepo.findById(jobId);
  if (!job) throw AppError.notFound('Job not found');
  if (job.status !== 'REVIEWED') throw new AppError('Job must be in REVIEWED status to complete', 400);
  if (!job.reporter_id) throw new AppError('Job has no assigned reporter', 400);
  if (!job.editor_id) throw new AppError('Job has no assigned editor', 400);

  const reporterPayment = calculateReporterPay(job.duration);
  const editorPayment = EDITOR_PAY;

  return jobRepo.completeJob(jobId, reporterPayment, editorPayment);
}
