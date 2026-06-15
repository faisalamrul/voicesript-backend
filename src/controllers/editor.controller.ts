import { Response, NextFunction } from 'express';
import * as editorService from '../services/editor.service';
import { AuthenticatedRequest } from '../types';
import { sendSuccess } from '../utils/response';

export async function getEarnings(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { search, period } = req.query as Record<string, string | undefined>;
    const page = Math.max(1, parseInt(req.query['page'] as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query['limit'] as string) || 10));

    const result = await editorService.getEarnings(req.user!.id, {
      search,
      period,
      page,
      limit,
    });

    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
