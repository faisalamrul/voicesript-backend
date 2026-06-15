import * as editorRepo from '../repositories/editor.repository';
import { AppError } from '../utils/AppError';

export async function getEarnings(
  editorId: string,
  filters: {
    search?: string;
    period?: string;
    page?: number;
    limit?: number;
  }
): Promise<editorRepo.EditorEarningsResult> {
  if (filters.period !== undefined && filters.period !== 'month' && filters.period !== 'last') {
    throw new AppError("Invalid period. Allowed: 'month', 'last'", 400);
  }

  return editorRepo.getEarnings(editorId, {
    search: filters.search,
    period: filters.period as editorRepo.EditorEarningsFilters['period'],
    page: filters.page,
    limit: filters.limit,
  });
}
