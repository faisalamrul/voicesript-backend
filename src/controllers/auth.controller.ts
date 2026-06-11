import { Request, Response, NextFunction, CookieOptions } from 'express';
import * as authService from '../services/auth.service';
import { AuthenticatedRequest } from '../types';
import { sendSuccess, sendCreated } from '../utils/response';
import { AppError } from '../utils/AppError';
import { env } from '../config/env';

const REFRESH_TOKEN_COOKIE = 'refresh_token';
const ACCESS_TOKEN_COOKIE = 'access_token';

function cookieOptions(path: string, maxAge: number): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path,
    maxAge,
  };
}

function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, cookieOptions('/api/v1', 15 * 60 * 1000));
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, cookieOptions('/api/v1/auth', 7 * 24 * 60 * 60 * 1000));
}

function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, cookieOptions('/api/v1', 0));
  res.clearCookie(REFRESH_TOKEN_COOKIE, cookieOptions('/api/v1/auth', 0));
}

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, email, password, role } = req.body as {
      name?: string;
      email?: string;
      password?: string;
      role?: string;
    };

    if (!name || !email || !password) {
      throw new AppError('name, email, and password are required', 400);
    }

    if (role !== undefined && role !== 'reporter') {
      throw new AppError('Public registration only allows role reporter. Contact an admin to get a reviewer or admin account.', 400);
    }

    const user = await authService.register({ name, email, password, role: 'reporter' });
    sendCreated(res, { user }, 'Registration successful');
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      throw new AppError('email and password are required', 400);
    }

    const result = await authService.login(email, password);

    setAuthCookies(res, result.tokens.access_token, result.tokens.refresh_token);

    sendSuccess(res, {
      user: result.user,
      tokens: { access_token: result.tokens.access_token },
      allowed_menus: result.allowed_menus,
    }, 'Login successful');
  } catch (err) {
    next(err);
  }
}

export async function refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawRefreshToken = req.cookies[REFRESH_TOKEN_COOKIE] as string | undefined;

    if (!rawRefreshToken) {
      throw AppError.unauthorized('Refresh token cookie missing');
    }

    const tokens = await authService.refreshTokens(rawRefreshToken);

    setAuthCookies(res, tokens.access_token, tokens.refresh_token);

    sendSuccess(res, { access_token: tokens.access_token }, 'Token refreshed');
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawRefreshToken = req.cookies[REFRESH_TOKEN_COOKIE] as string | undefined;

    if (rawRefreshToken) {
      await authService.logout(rawRefreshToken);
    }

    clearAuthCookies(res);
    sendSuccess(res, null, 'Logged out successfully');
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    sendSuccess(res, { user: authReq.user });
  } catch (err) {
    next(err);
  }
}
