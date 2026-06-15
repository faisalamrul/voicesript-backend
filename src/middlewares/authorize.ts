import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, Role } from '../types';
import { AppError } from '../utils/AppError';

export function authorize(roles: Role[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    const userRole = req.user?.role;
    if (!userRole || !roles.includes(userRole)) {
      return next(AppError.forbidden('You do not have permission to access this resource'));
    }
    next();
  };
}
