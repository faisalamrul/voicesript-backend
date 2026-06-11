import request from 'supertest';
import app from '../src/app';
import * as userRepo from '../src/repositories/user.repository';
import * as menuRepo from '../src/repositories/menu.repository';
import * as rtRepo from '../src/repositories/refreshToken.repository';
import * as tokenService from '../src/services/token.service';
import bcrypt from 'bcrypt';

jest.mock('../src/repositories/user.repository');
jest.mock('../src/repositories/menu.repository');
jest.mock('../src/repositories/refreshToken.repository');

const mockedUserRepo = userRepo as jest.Mocked<typeof userRepo>;
const mockedMenuRepo = menuRepo as jest.Mocked<typeof menuRepo>;
const mockedRtRepo = rtRepo as jest.Mocked<typeof rtRepo>;

const BASE = '/api/v1/auth';

const mockUser = {
  id: 'user-uuid-1',
  name: 'Test Reporter',
  email: 'reporter@test.com',
  password_hash: '',
  role: 'reporter' as const,
  created_at: new Date(),
  updated_at: new Date(),
};

const mockMenuRows = [
  { id: 'menu-1', title: 'Jobs', path: '/jobs', icon: 'briefcase-icon', label: 'core', parent_id: null, sort_order: 1 },
  { id: 'menu-2', title: 'Earnings', path: '/earnings', icon: 'chart-icon', label: 'finance', parent_id: null, sort_order: 2 },
];

beforeAll(async () => {
  mockUser.password_hash = await bcrypt.hash(
    tokenService.preHashPassword('password123'),
    12
  );
});

describe('POST /auth/register', () => {
  it('creates a new user with default role reporter', async () => {
    mockedUserRepo.findByEmail.mockResolvedValue(null);
    mockedUserRepo.createUser.mockResolvedValue({
      id: 'new-uuid',
      name: 'New User',
      email: 'new@test.com',
      role: 'reporter',
      created_at: new Date(),
    });

    const res = await request(app).post(`${BASE}/register`).send({
      name: 'New User',
      email: 'new@test.com',
      password: 'password123',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.role).toBe('reporter');
  });

  it('rejects registration with role admin (400)', async () => {
    const res = await request(app).post(`${BASE}/register`).send({
      name: 'Admin Attempt',
      email: 'admin@test.com',
      password: 'password123',
      role: 'admin',
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects registration with role editor (400) — only admin can assign editor', async () => {
    const res = await request(app).post(`${BASE}/register`).send({
      name: 'Reviewer Attempt',
      email: 'editor@test.com',
      password: 'password123',
      role: 'editor',
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/reporter/i);
  });

  it('rejects duplicate email (409)', async () => {
    mockedUserRepo.findByEmail.mockResolvedValue(mockUser);

    const res = await request(app).post(`${BASE}/register`).send({
      name: 'Duplicate',
      email: 'reporter@test.com',
      password: 'password123',
    });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /auth/login', () => {
  it('returns user, access_token, allowed_menus and sets HTTPOnly cookie on success', async () => {
    mockedUserRepo.findByEmail.mockResolvedValue(mockUser);
    mockedRtRepo.countRefreshTokensByUserId.mockResolvedValue(0);
    mockedRtRepo.createRefreshToken.mockResolvedValue(undefined);
    mockedMenuRepo.findMenusByRole.mockResolvedValue(mockMenuRows);

    const res = await request(app).post(`${BASE}/login`).send({
      email: 'reporter@test.com',
      password: 'password123',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('user');
    expect(res.body.data).toHaveProperty('tokens.access_token');
    expect(res.body.data.tokens).not.toHaveProperty('refresh_token');
    expect(res.body.data).toHaveProperty('allowed_menus');
    expect(Array.isArray(res.body.data.allowed_menus)).toBe(true);

    const setCookie = res.headers['set-cookie'] as string[] | string;
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    expect(cookies.some((c) => c.startsWith('refresh_token='))).toBe(true);
    expect(cookies.some((c) => c.toLowerCase().includes('httponly'))).toBe(true);
  });

  it('returns 401 for wrong password', async () => {
    mockedUserRepo.findByEmail.mockResolvedValue(mockUser);

    const res = await request(app).post(`${BASE}/login`).send({
      email: 'reporter@test.com',
      password: 'wrongpassword',
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 for non-existent email', async () => {
    mockedUserRepo.findByEmail.mockResolvedValue(null);

    const res = await request(app).post(`${BASE}/login`).send({
      email: 'ghost@test.com',
      password: 'password123',
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /auth/refresh-token', () => {
  it('issues a new access_token via cookie and sets new cookie (RTR)', async () => {
    const rawRefreshToken = tokenService.signRefreshToken({ id: mockUser.id });

    mockedRtRepo.findRefreshTokenByHash.mockResolvedValue({
      id: 'rt-uuid',
      user_id: mockUser.id,
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
    });
    mockedRtRepo.deleteRefreshTokenByHash.mockResolvedValue(undefined);
    mockedRtRepo.createRefreshToken.mockResolvedValue(undefined);
    mockedUserRepo.findById.mockResolvedValue(mockUser);

    const res = await request(app)
      .post(`${BASE}/refresh-token`)
      .set('Cookie', `refresh_token=${rawRefreshToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('access_token');
    expect(res.body.data).not.toHaveProperty('refresh_token');

    const setCookie = res.headers['set-cookie'] as string[] | string;
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    expect(cookies.some((c) => c.startsWith('refresh_token='))).toBe(true);
  });

  it('returns 401 when cookie is missing', async () => {
    const res = await request(app).post(`${BASE}/refresh-token`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 for invalid token in cookie', async () => {
    const res = await request(app)
      .post(`${BASE}/refresh-token`)
      .set('Cookie', 'refresh_token=invalid.token.here');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 for a valid JWT not found in DB (reuse detection)', async () => {
    const rawRefreshToken = tokenService.signRefreshToken({ id: mockUser.id });
    mockedRtRepo.findRefreshTokenByHash.mockResolvedValue(null);

    const res = await request(app)
      .post(`${BASE}/refresh-token`)
      .set('Cookie', `refresh_token=${rawRefreshToken}`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

describe('Protected route — authenticate middleware', () => {
  it('returns 401 when no Authorization header is sent', async () => {
    const res = await request(app).get(`${BASE}/me`);
    expect(res.status).toBe(401);
  });

  it('returns 401 for a malformed token', async () => {
    const res = await request(app)
      .get(`${BASE}/me`)
      .set('Authorization', 'Bearer notavalidtoken');
    expect(res.status).toBe(401);
  });

  it('returns 200 with a valid access token', async () => {
    const token = tokenService.signAccessToken({
      id: mockUser.id,
      email: mockUser.email,
      role: mockUser.role,
    });

    const res = await request(app)
      .get(`${BASE}/me`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(mockUser.id);
  });
});

describe('authorize middleware', () => {
  it('returns 403 when a reporter tries to access admin-only route', async () => {
    const token = tokenService.signAccessToken({
      id: mockUser.id,
      email: mockUser.email,
      role: 'reporter',
    });

    const res = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', email: 'x@x.com', password: 'pass', role: 'reporter' });

    expect(res.status).toBe(403);
  });
});
