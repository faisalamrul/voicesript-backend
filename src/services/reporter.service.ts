import * as reporterRepo from '../repositories/reporter.repository';
import { AppError } from '../utils/AppError';

export async function getEarnings(
  reporterId: string,
  filters: {
    search?: string;
    period?: string;
    page?: number;
    limit?: number;
  }
): Promise<reporterRepo.EarningsResult> {
  if (filters.period !== undefined && filters.period !== 'month' && filters.period !== 'last') {
    throw new AppError("Invalid period. Allowed: 'month', 'last'", 400);
  }

  return reporterRepo.getEarnings(reporterId, {
    search: filters.search,
    period: filters.period as reporterRepo.ReporterEarningsFilters['period'],
    page: filters.page,
    limit: filters.limit,
  });
}
