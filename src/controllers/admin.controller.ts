import { Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { sendSuccess, sendCreated } from '../utils/response';
import { Role } from '../types';
import { AuthenticatedRequest } from '../types';
import * as userRepo from '../repositories/user.repository';
import * as jobRepo from '../repositories/job.repository';
import * as userService from '../services/user.service';

const VALID_ROLES: Role[] = ['admin', 'reporter', 'editor'];

export async function createUser(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name: rawName, email: rawEmail, password, role, city: rawCity } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      role?: string;
      city?: string;
    };

    const name = rawName?.trim();
    const email = rawEmail?.trim();
    const city = rawCity?.trim() || null;

    if (!name || !email || !password || !role) {
      throw new AppError('name, email, password, and role are required', 400);
    }

    if (password.length < 8) {
      throw new AppError('password must be at least 8 characters', 400);
    }

    if (!VALID_ROLES.includes(role as Role)) {
      throw new AppError(`Invalid role. Allowed: ${VALID_ROLES.join(', ')}`, 400);
    }

    const user = await userService.createUser({ name, email, password, role: role as Role, city });

    sendCreated(res, { user }, 'User created successfully');
  } catch (err) {
    next(err);
  }
}

export async function listUsers(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const page = Math.max(1, parseInt(req.query['page'] as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query['limit'] as string) || 10));
    const roleFilter = req.query['role'] as string | undefined;
    const search = req.query['search'] as string | undefined;

    if (roleFilter !== undefined && !VALID_ROLES.includes(roleFilter as Role)) {
      throw new AppError(`Invalid role filter. Allowed: ${VALID_ROLES.join(', ')}`, 400);
    }

    const { users, total } = await userRepo.findAll(
      { role: roleFilter as Role | undefined, search },
      { page, limit }
    );

    sendSuccess(res, {
      users,
      pagination: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const user = await userRepo.findPublicById(id);
    if (!user) {
      throw AppError.notFound('User not found');
    }
    sendSuccess(res, { user });
  } catch (err) {
    next(err);
  }
}

export async function updateUserRole(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const { role } = req.body as { role?: string };

    if (id === req.user!.id) {
      throw new AppError('Cannot change your own role', 400);
    }

    if (!role || !VALID_ROLES.includes(role as Role)) {
      throw new AppError(`Invalid role. Allowed: ${VALID_ROLES.join(', ')}`, 400);
    }

    const existing = await userRepo.findPublicById(id);
    if (!existing) {
      throw AppError.notFound('User not found');
    }

    const user = await userRepo.updateRole(id, role as Role);
    sendSuccess(res, { user }, 'User role updated successfully');
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw AppError.unauthorized('Not authenticated');
    }

    const { id } = req.params as { id: string };

    if (id === req.user.id) {
      throw new AppError('Cannot delete your own account', 400);
    }

    const existing = await userRepo.findPublicById(id);
    if (!existing) {
      throw AppError.notFound('User not found');
    }

    if (existing.role === 'reporter') {
      const activeJobs = await jobRepo.countActiveJobsByReporter(id);
      if (activeJobs > 0) {
        throw new AppError('Cannot delete reporter with an active assigned job', 400);
      }
    } else if (existing.role === 'editor') {
      const activeJobs = await jobRepo.countActiveJobsByEditor(id);
      if (activeJobs > 0) {
        throw new AppError('Cannot delete editor with an active job in review', 400);
      }
    }

    await userRepo.deleteById(id);
    sendSuccess(res, null, 'User deleted successfully');
  } catch (err) {
    next(err);
  }
}
