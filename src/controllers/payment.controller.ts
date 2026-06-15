import { Response, NextFunction } from 'express';
import * as paymentService from '../services/payment.service';
import { AuthenticatedRequest } from '../types';
import { sendSuccess } from '../utils/response';

export async function getPayments(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { search, status, period } = req.query as Record<string, string | undefined>;
    const page = Math.max(1, parseInt(req.query['page'] as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query['limit'] as string) || 10));
    const result = await paymentService.getPayments({ search, status, period, page, limit });
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
