import bcrypt from 'bcrypt';
import { AppError } from '../utils/AppError';
import { env } from '../config/env';
import { Role } from '../types';
import { UserPublic } from '../models/user.model';
import { MenuItem } from '../models/menu.model';
import * as userRepo from '../repositories/user.repository';
import * as menuRepo from '../repositories/menu.repository';
import * as rtRepo from '../repositories/refreshToken.repository';
import * as userService from './user.service';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  preHashPassword,
} from './token.service';
import { buildMenuTree } from './menu.service';

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
    throw new AppError('Public registration only allows role reporter. Contact an admin to get a editor or admin account.', 400);
  }

  return userService.createUser({ name, email, password, role });
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
  const expiresAt = new Date(Date.now() + env.jwt.refreshExpiresInMs);
  await rtRepo.createRefreshToken({
    userId: user.id,
    tokenHash: hashToken(rawRefreshToken),
    expiresAt,
  });

  const access_token = signAccessToken({ id: user.id, email: user.email, role: user.role });

  const flatMenus = await menuRepo.findMenusByRole(user.role);
  const allowed_menus = buildMenuTree(flatMenus);

  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role, city: user.city ?? null, created_at: user.created_at },
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
  const expiresAt = new Date(Date.now() + env.jwt.refreshExpiresInMs);
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
