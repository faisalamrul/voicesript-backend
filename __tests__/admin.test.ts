import request from 'supertest';
import app from '../src/app';
import * as userRepo from '../src/repositories/user.repository';
import * as tokenService from '../src/services/token.service';
import { UserPublic } from '../src/models/user.model';

jest.mock('../src/repositories/user.repository');

const mockedUserRepo = userRepo as jest.Mocked<typeof userRepo>;

const BASE = '/api/v1/admin';

const adminToken = () =>
  tokenService.signAccessToken({ id: 'admin-uuid', email: 'admin@test.com', role: 'admin' });

const reporterToken = () =>
  tokenService.signAccessToken({ id: 'reporter-uuid', email: 'reporter@test.com', role: 'reporter' });

const mockUser: UserPublic = {
  id: 'user-uuid-1',
  name: 'Budi Santoso',
  email: 'budi@example.com',
  role: 'reporter',
  created_at: new Date('2026-06-11T10:00:00Z'),
};

describe('GET /admin/users', () => {
  it('admin token → 200, users array + pagination metadata', async () => {
    mockedUserRepo.findAll.mockResolvedValue({ users: [mockUser], total: 1 });

    const res = await request(app)
      .get(`${BASE}/users`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.users)).toBe(true);
    expect(res.body.data.pagination).toMatchObject({ total: 1, page: 1, limit: 10, total_pages: 1 });
  });

  it('?role=reporter → findAll dipanggil dengan filter role', async () => {
    mockedUserRepo.findAll.mockResolvedValue({ users: [mockUser], total: 1 });

    await request(app)
      .get(`${BASE}/users?role=reporter`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(mockedUserRepo.findAll).toHaveBeenCalledWith(
      { role: 'reporter' },
      expect.any(Object)
    );
  });

  it('?role=invalid → 400', async () => {
    const res = await request(app)
      .get(`${BASE}/users?role=invalid`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(400);
  });

  it('tanpa token → 401', async () => {
    const res = await request(app).get(`${BASE}/users`);
    expect(res.status).toBe(401);
  });

  it('reporter token → 403', async () => {
    const res = await request(app)
      .get(`${BASE}/users`)
      .set('Authorization', `Bearer ${reporterToken()}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /admin/users/:id', () => {
  it('user ditemukan → 200', async () => {
    mockedUserRepo.findPublicById.mockResolvedValue(mockUser);

    const res = await request(app)
      .get(`${BASE}/users/${mockUser.id}`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(mockUser.id);
  });

  it('user tidak ditemukan → 404', async () => {
    mockedUserRepo.findPublicById.mockResolvedValue(null);

    const res = await request(app)
      .get(`${BASE}/users/nonexistent-uuid`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /admin/users', () => {
  beforeEach(() => {
    mockedUserRepo.findByEmail.mockResolvedValue(null);
    mockedUserRepo.createUser.mockResolvedValue(mockUser);
  });

  it('role reporter → 201', async () => {
    const res = await request(app)
      .post(`${BASE}/users`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'Budi', email: 'budi@test.com', password: 'password123', role: 'reporter' });

    expect(res.status).toBe(201);
    expect(res.body.data.user).toBeDefined();
  });

  it('role editor → 201', async () => {
    const res = await request(app)
      .post(`${BASE}/users`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'Siti', email: 'siti@test.com', password: 'password123', role: 'editor' });

    expect(res.status).toBe(201);
  });

  it('role admin → 201', async () => {
    const res = await request(app)
      .post(`${BASE}/users`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'Admin', email: 'admin2@test.com', password: 'password123', role: 'admin' });

    expect(res.status).toBe(201);
  });

  it('password < 8 karakter → 400', async () => {
    const res = await request(app)
      .post(`${BASE}/users`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'Budi', email: 'budi@test.com', password: 'short', role: 'reporter' });

    expect(res.status).toBe(400);
  });

  it('role tidak valid → 400', async () => {
    const res = await request(app)
      .post(`${BASE}/users`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'Budi', email: 'budi@test.com', password: 'password123', role: 'superadmin' });

    expect(res.status).toBe(400);
  });

  it('email duplikat → 409', async () => {
    mockedUserRepo.findByEmail.mockResolvedValue({ ...mockUser, password_hash: 'hash', updated_at: new Date() });

    const res = await request(app)
      .post(`${BASE}/users`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'Budi', email: 'budi@test.com', password: 'password123', role: 'reporter' });

    expect(res.status).toBe(409);
  });
});

describe('PATCH /admin/users/:id/role', () => {
  it('role valid → 200, role terupdate', async () => {
    mockedUserRepo.findPublicById.mockResolvedValue(mockUser);
    mockedUserRepo.updateRole.mockResolvedValue({ ...mockUser, role: 'editor' });

    const res = await request(app)
      .patch(`${BASE}/users/${mockUser.id}/role`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ role: 'editor' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('editor');
  });

  it('role tidak valid → 400', async () => {
    const res = await request(app)
      .patch(`${BASE}/users/${mockUser.id}/role`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ role: 'superadmin' });

    expect(res.status).toBe(400);
  });

  it('user tidak ditemukan → 404', async () => {
    mockedUserRepo.findPublicById.mockResolvedValue(null);

    const res = await request(app)
      .patch(`${BASE}/users/nonexistent-uuid/role`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ role: 'editor' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /admin/users/:id', () => {
  it('valid → 200', async () => {
    mockedUserRepo.findPublicById.mockResolvedValue(mockUser);
    mockedUserRepo.deleteById.mockResolvedValue(undefined);

    const res = await request(app)
      .delete(`${BASE}/users/${mockUser.id}`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('User deleted successfully');
  });

  it('hapus diri sendiri → 400', async () => {
    const res = await request(app)
      .delete(`${BASE}/users/admin-uuid`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(400);
  });

  it('user tidak ditemukan → 404', async () => {
    mockedUserRepo.findPublicById.mockResolvedValue(null);

    const res = await request(app)
      .delete(`${BASE}/users/nonexistent-uuid`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(404);
  });
});
