import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { verifyAccessToken } from '../services/token.service';
import { AppError } from '../utils/AppError';

export function authenticate(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const cookieToken = req.cookies?.['access_token'] as string | undefined;

  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : cookieToken;

  if (!token) {
    return next(AppError.unauthorized('Access token missing'));
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.id, email: payload.email, role: payload.role };
    next();
  } catch (err) {
    next(err);
  }
}
