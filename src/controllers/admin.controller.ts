import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { AppError } from '../utils/AppError';
import { sendCreated } from '../utils/response';
import { Role } from '../types';
import * as userRepo from '../repositories/user.repository';
import { preHashPassword } from '../services/token.service';

const BCRYPT_ROUNDS = 12;
const VALID_ROLES: Role[] = ['admin', 'reporter', 'reviewer'];

export async function createUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, email, password, role } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      role?: string;
    };

    if (!name || !email || !password || !role) {
      throw new AppError('name, email, password, and role are required', 400);
    }

    if (!VALID_ROLES.includes(role as Role)) {
      throw new AppError(`Invalid role. Allowed: ${VALID_ROLES.join(', ')}`, 400);
    }

    const existing = await userRepo.findByEmail(email);
    if (existing) {
      throw AppError.conflict('Email already registered');
    }

    const passwordHash = await bcrypt.hash(preHashPassword(password), BCRYPT_ROUNDS);
    const user = await userRepo.createUser({
      name,
      email,
      passwordHash,
      role: role as Role,
    });

    sendCreated(res, { user }, 'User created successfully');
  } catch (err) {
    next(err);
  }
}

export async function registerReviewer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, email, password } = req.body as {
      name?: string;
      email?: string;
      password?: string;
    };

    if (!name || !email || !password) {
      throw new AppError('name, email, and password are required', 400);
    }

    const existing = await userRepo.findByEmail(email);
    if (existing) {
      throw AppError.conflict('Email already registered');
    }

    const passwordHash = await bcrypt.hash(preHashPassword(password), BCRYPT_ROUNDS);
    const user = await userRepo.createUser({ name, email, passwordHash, role: 'reviewer' });

    sendCreated(res, { user }, 'Reviewer registered successfully');
  } catch (err) {
    next(err);
  }
}
