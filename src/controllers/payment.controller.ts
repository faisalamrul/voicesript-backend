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
    const result = await paymentService.getPayments({ search, status, period });
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
