import bcrypt from 'bcrypt';
import { AppError } from '../utils/AppError';
import { Role } from '../types';
import { UserPublic } from '../models/user.model';
import * as userRepo from '../repositories/user.repository';
import { preHashPassword } from './token.service';

const BCRYPT_ROUNDS = 12;

export async function createUser(params: {
  name: string;
  email: string;
  password: string;
  role: Role;
  city?: string | null;
}): Promise<UserPublic> {
  const { name, email, password, role, city } = params;

  const existing = await userRepo.findByEmail(email);
  if (existing) {
    throw AppError.conflict('Email already registered');
  }

  const passwordHash = await bcrypt.hash(preHashPassword(password), BCRYPT_ROUNDS);
  return userRepo.createUser({ name, email, passwordHash, role, city });
}
