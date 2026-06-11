import bcrypt from 'bcrypt';
import { AppError } from '../utils/AppError';
import { env } from '../config/env';
import { Role } from '../types';
import { UserPublic } from '../models/user.model';
import { MenuItem } from '../models/menu.model';
import * as userRepo from '../repositories/user.repository';
import * as menuRepo from '../repositories/menu.repository';
import * as rtRepo from '../repositories/refreshToken.repository';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  preHashPassword,
} from './token.service';
import { buildMenuTree } from './menu.service';

const BCRYPT_ROUNDS = 12;

export interface RegisterParams {
  name: string;
  email: string;
  password: string;
  role?: Role;
}

export interface LoginResult {
  user: UserPublic;
  tokens: { access_token: string; refresh_token: string };
  allowed_menus: MenuItem[];
}

export async function register(params: RegisterParams): Promise<UserPublic> {
  const { name, email, password, role = 'reporter' } = params;

  if (role !== 'reporter') {
    throw new AppError('Public registration only allows role reporter. Contact an admin to get a reviewer or admin account.', 400);
  }

  const existing = await userRepo.findByEmail(email);
  if (existing) {
    throw AppError.conflict('Email already registered');
  }

  const passwordHash = await bcrypt.hash(preHashPassword(password), BCRYPT_ROUNDS);
  return userRepo.createUser({ name, email, passwordHash, role });
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const user = await userRepo.findByEmail(email);

  const isValid =
    user !== null && (await bcrypt.compare(preHashPassword(password), user.password_hash));

  if (!isValid) {
    throw AppError.unauthorized('Invalid credentials');
  }

  const activeCount = await rtRepo.countRefreshTokensByUserId(user.id);
  if (activeCount >= env.jwt.maxActiveDevices) {
    await rtRepo.deleteOldestRefreshTokenByUserId(user.id);
  }

  const rawRefreshToken = signRefreshToken({ id: user.id });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await rtRepo.createRefreshToken({
    userId: user.id,
    tokenHash: hashToken(rawRefreshToken),
    expiresAt,
  });

  const access_token = signAccessToken({ id: user.id, email: user.email, role: user.role });

  const flatMenus = await menuRepo.findMenusByRole(user.role);
  const allowed_menus = buildMenuTree(flatMenus);

  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    tokens: { access_token, refresh_token: rawRefreshToken },
    allowed_menus,
  };
}

export interface RefreshResult {
  access_token: string;
  refresh_token: string;
}

export async function refreshTokens(rawRefreshToken: string): Promise<RefreshResult> {
  const payload = verifyRefreshToken(rawRefreshToken);
  const tokenHash = hashToken(rawRefreshToken);

  const stored = await rtRepo.findRefreshTokenByHash(tokenHash);
  if (!stored) {
    throw AppError.unauthorized('Refresh token invalid or revoked');
  }

  if (stored.expires_at < new Date()) {
    await rtRepo.deleteRefreshTokenByHash(tokenHash);
    throw AppError.unauthorized('Refresh token expired');
  }

  await rtRepo.deleteRefreshTokenByHash(tokenHash);

  const user = await userRepo.findById(payload.id);
  if (!user) {
    throw AppError.unauthorized('User not found');
  }

  const newRawRefreshToken = signRefreshToken({ id: user.id });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await rtRepo.createRefreshToken({
    userId: user.id,
    tokenHash: hashToken(newRawRefreshToken),
    expiresAt,
  });

  const access_token = signAccessToken({ id: user.id, email: user.email, role: user.role });

  return { access_token, refresh_token: newRawRefreshToken };
}

export async function logout(rawRefreshToken: string): Promise<void> {
  const tokenHash = hashToken(rawRefreshToken);
  await rtRepo.deleteRefreshTokenByHash(tokenHash);
}
