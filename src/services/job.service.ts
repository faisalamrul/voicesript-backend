import * as jobRepo from '../repositories/job.repository';
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

export function calculateReporterPay(durationSeconds: number): number {
  return (durationSeconds / 60) * REPORTER_PAY_RATE;
}
