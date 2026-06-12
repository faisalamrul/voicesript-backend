import request from 'supertest';
import app from '../src/app';
import * as jobRepo from '../src/repositories/job.repository';
import * as tokenService from '../src/services/token.service';
import { Job } from '../src/models/job.model';

jest.mock('../src/repositories/job.repository');

const mockedJobRepo = jobRepo as jest.Mocked<typeof jobRepo>;

const BASE = '/api/v1/jobs';

const adminToken = () =>
  tokenService.signAccessToken({ id: 'admin-uuid', email: 'admin@test.com', role: 'admin' });

const reporterToken = () =>
  tokenService.signAccessToken({ id: 'reporter-uuid', email: 'reporter@test.com', role: 'reporter' });

const mockJob: Job = {
  id: 'job-uuid-1',
  case_name: 'State v. Wijaya',
  duration: 1800,
  location: 'physical',
  city: 'Bandung',
  status: 'NEW',
  reporter_id: null,
  editor_id: null,
  transcript_notes: null,
  review_notes: null,
  submitted_at: null,
  reviewed_at: null,
  reporter_payment: null,
  editor_payment: null,
  created_at: new Date('2026-06-11T10:00:00Z'),
};

describe('POST /jobs', () => {
  it('physical + city valid → 201, status NEW, reporter_id null', async () => {
    mockedJobRepo.createJob.mockResolvedValue(mockJob);

    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ case_name: 'State v. Wijaya', duration: 30, location: 'physical', city: 'Bandung' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.job.status).toBe('NEW');
    expect(res.body.data.job.reporter_id).toBeNull();
    expect(res.body.data.job.city).toBe('Bandung');
  });

  it('remote + city → 201, city tersimpan', async () => {
    mockedJobRepo.createJob.mockResolvedValue({ ...mockJob, location: 'remote', city: 'Jakarta' });

    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ case_name: 'Remote Case', duration: 1800, location: 'remote', city: 'Jakarta' });

    expect(res.status).toBe(201);
    expect(res.body.data.job.city).toBe('Jakarta');
  });

  it('remote tanpa city → 400', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ case_name: 'Remote Case', duration: 1800, location: 'remote' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('duration: 0 → 400', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ case_name: 'Test', duration: 0, location: 'remote' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('duration: 1.5 (float) → 400', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ case_name: 'Test', duration: 1.5, location: 'remote' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('case_name kosong → 400', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ case_name: '', duration: 30, location: 'remote' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('tanpa city → 400', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ case_name: 'Test', duration: 1800, location: 'physical' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('location tidak valid → 400', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ case_name: 'Test', duration: 30, location: 'invalid' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('status di body diabaikan → response tetap NEW', async () => {
    mockedJobRepo.createJob.mockResolvedValue(mockJob);

    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ case_name: 'State v. Wijaya', duration: 30, location: 'physical', city: 'Bandung', status: 'COMPLETED' });

    expect(res.status).toBe(201);
    expect(res.body.data.job.status).toBe('NEW');
  });

  it('non-admin (reporter) → 403', async () => {
    const res = await request(app)
      .post(BASE)
      .set('Authorization', `Bearer ${reporterToken()}`)
      .send({ case_name: 'Test', duration: 30, location: 'remote' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /jobs', () => {
  it('admin token → 200, jobs array + pagination metadata', async () => {
    mockedJobRepo.findAll.mockResolvedValue({ jobs: [mockJob], total: 1 });

    const res = await request(app)
      .get(BASE)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.jobs)).toBe(true);
    expect(res.body.data.pagination).toMatchObject({
      total: 1,
      page: 1,
      limit: 10,
      total_pages: 1,
    });
  });

  it('page + limit query params diteruskan ke repository', async () => {
    mockedJobRepo.findAll.mockResolvedValue({ jobs: [], total: 0 });

    await request(app)
      .get(`${BASE}?page=2&limit=5`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(mockedJobRepo.findAll).toHaveBeenCalledWith(
      undefined,
      { page: 2, limit: 5 }
    );
  });

  it('tanpa token → 401', async () => {
    const res = await request(app).get(BASE);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
