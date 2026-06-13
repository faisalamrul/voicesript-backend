import * as paymentRepo from '../repositories/payment.repository';
import { AppError } from '../utils/AppError';

export async function getPayments(filters: {
  search?: string;
  status?: string;
  period?: string;
}): Promise<paymentRepo.PaymentResult> {
  if (filters.status !== undefined && filters.status !== 'paid' && filters.status !== 'pending') {
    throw new AppError("Invalid status. Allowed: 'paid', 'pending'", 400);
  }
  if (filters.period !== undefined && filters.period !== 'month' && filters.period !== 'last') {
    throw new AppError("Invalid period. Allowed: 'month', 'last'", 400);
  }

  return paymentRepo.getPayments({
    search: filters.search,
    status: filters.status as paymentRepo.PaymentFilters['status'],
    period: filters.period as paymentRepo.PaymentFilters['period'],
  });
}
