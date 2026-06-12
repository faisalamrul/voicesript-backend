import request from 'supertest';
import app from '../src/app';
import * as jobRepo from '../src/repositories/job.repository';
import * as userRepo from '../src/repositories/user.repository';
import * as tokenService from '../src/services/token.service';
import { Job } from '../src/models/job.model';
import { User } from '../src/models/user.model';

jest.mock('../src/repositories/job.repository');
jest.mock('../src/repositories/user.repository');
jest.mock('../src/repositories/jobStatusHistory.repository');

const mockedJobRepo = jobRepo as jest.Mocked<typeof jobRepo>;
const mockedUserRepo = userRepo as jest.Mocked<typeof userRepo>;

const BASE = '/api/v1/jobs';

const adminToken = () =>
  tokenService.signAccessToken({ id: 'admin-uuid', email: 'admin@test.com', role: 'admin' });

const reporterToken = (id = 'reporter-uuid') =>
  tokenService.signAccessToken({ id, email: 'reporter@test.com', role: 'reporter' });

const editorToken = (id = 'editor-uuid') =>
  tokenService.signAccessToken({ id, email: 'editor@test.com', role: 'editor' });

const mockJob = (overrides: Partial<Job> = {}): Job => ({
  id: 'job-uuid',
  case_name: 'State v. Wijaya',
  duration: 1800,
  location: 'physical',
  city: 'Jakarta',
  status: 'NEW',
  reporter_id: null,
  editor_id: null,
  transcript_notes: null,
  review_notes: null,
  submitted_at: null,
  reviewed_at: null,
  reporter_payment: null,
  editor_payment: null,
  created_at: new Date(),
  ...overrides,
});

const mockReporter = (overrides: Partial<User> = {}): User => ({
  id: 'reporter-uuid',
  name: 'Budi Reporter',
  email: 'budi@test.com',
  password_hash: 'hash',
  role: 'reporter',
  city: null,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

const mockEditor = (overrides: Partial<User> = {}): User => ({
  id: 'editor-uuid',
  name: 'Siti Editor',
  email: 'siti@test.com',
  password_hash: 'hash',
  role: 'editor',
  city: null,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

// ---------------------------------------------------------------------------
// POST /jobs/:id/assign-reporter
// ---------------------------------------------------------------------------
describe('POST /jobs/:id/assign-reporter', () => {
  it('reporter valid + job NEW → 200, status ASSIGNED', async () => {
    mockedJobRepo.findById.mockResolvedValue(mockJob({ status: 'NEW' }));
    mockedUserRepo.findById.mockResolvedValue(mockReporter());
    mockedJobRepo.countActiveJobsByReporter.mockResolvedValue(0);
    mockedJobRepo.assignReporter.mockResolvedValue(mockJob({ status: 'ASSIGNED', reporter_id: 'reporter-uuid' }));

    const res = await request(app)
      .post(`${BASE}/job-uuid/assign-reporter`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ reporter_id: 'reporter-uuid' });

    expect(res.status).toBe(200);
    expect(res.body.data.job.status).toBe('ASSIGNED');
    expect(res.body.data.job.reporter_id).toBe('reporter-uuid');
  });

  it('status job bukan NEW → 400', async () => {
    mockedJobRepo.findById.mockResolvedValue(mockJob({ status: 'ASSIGNED' }));

    const res = await request(app)
      .post(`${BASE}/job-uuid/assign-reporter`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ reporter_id: 'reporter-uuid' });

    expect(res.status).toBe(400);
  });

  it('reporter tidak ditemukan → 404', async () => {
    mockedJobRepo.findById.mockResolvedValue(mockJob({ status: 'NEW' }));
    mockedUserRepo.findById.mockResolvedValue(null);

    const res = await request(app)
      .post(`${BASE}/job-uuid/assign-reporter`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ reporter_id: 'nonexistent-uuid' });

    expect(res.status).toBe(404);
  });

  it('user yang di-assign bukan role reporter (editor) → 400', async () => {
    mockedJobRepo.findById.mockResolvedValue(mockJob({ status: 'NEW' }));
    mockedUserRepo.findById.mockResolvedValue(mockEditor());

    const res = await request(app)
      .post(`${BASE}/job-uuid/assign-reporter`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ reporter_id: 'editor-uuid' });

    expect(res.status).toBe(400);
  });

  it('reporter sudah punya job ASSIGNED aktif → 400', async () => {
    mockedJobRepo.findById.mockResolvedValue(mockJob({ status: 'NEW' }));
    mockedUserRepo.findById.mockResolvedValue(mockReporter());
    mockedJobRepo.countActiveJobsByReporter.mockResolvedValue(1);

    const res = await request(app)
      .post(`${BASE}/job-uuid/assign-reporter`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ reporter_id: 'reporter-uuid' });

    expect(res.status).toBe(400);
  });

  it('tanpa token → 401', async () => {
    const res = await request(app)
      .post(`${BASE}/job-uuid/assign-reporter`)
      .send({ reporter_id: 'reporter-uuid' });

    expect(res.status).toBe(401);
  });

  it('token reporter (bukan admin) → 403', async () => {
    const res = await request(app)
      .post(`${BASE}/job-uuid/assign-reporter`)
      .set('Authorization', `Bearer ${reporterToken()}`)
      .send({ reporter_id: 'reporter-uuid' });

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// PATCH /jobs/:id/submit-transcript
// ---------------------------------------------------------------------------
describe('PATCH /jobs/:id/submit-transcript', () => {
  it('assigned reporter + job ASSIGNED → 200, status TRANSCRIBED', async () => {
    mockedJobRepo.findById.mockResolvedValue(
      mockJob({ status: 'ASSIGNED', reporter_id: 'reporter-uuid' })
    );
    mockedJobRepo.submitTranscript.mockResolvedValue(
      mockJob({ status: 'TRANSCRIBED', reporter_id: 'reporter-uuid', submitted_at: new Date() })
    );

    const res = await request(app)
      .patch(`${BASE}/job-uuid/submit-transcript`)
      .set('Authorization', `Bearer ${reporterToken('reporter-uuid')}`)
      .send({ transcript_notes: 'Selesai' });

    expect(res.status).toBe(200);
    expect(res.body.data.job.status).toBe('TRANSCRIBED');
  });

  it('reporter berbeda (bukan yang di-assign) → 403', async () => {
    mockedJobRepo.findById.mockResolvedValue(
      mockJob({ status: 'ASSIGNED', reporter_id: 'reporter-uuid' })
    );

    const res = await request(app)
      .patch(`${BASE}/job-uuid/submit-transcript`)
      .set('Authorization', `Bearer ${reporterToken('other-reporter-uuid')}`)
      .send({});

    expect(res.status).toBe(403);
  });

  it('status bukan ASSIGNED (misal: NEW) → 400', async () => {
    mockedJobRepo.findById.mockResolvedValue(mockJob({ status: 'NEW', reporter_id: 'reporter-uuid' }));

    const res = await request(app)
      .patch(`${BASE}/job-uuid/submit-transcript`)
      .set('Authorization', `Bearer ${reporterToken('reporter-uuid')}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('status bukan ASSIGNED (misal: TRANSCRIBED) → 400', async () => {
    mockedJobRepo.findById.mockResolvedValue(
      mockJob({ status: 'TRANSCRIBED', reporter_id: 'reporter-uuid' })
    );

    const res = await request(app)
      .patch(`${BASE}/job-uuid/submit-transcript`)
      .set('Authorization', `Bearer ${reporterToken('reporter-uuid')}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('tanpa token → 401', async () => {
    const res = await request(app).patch(`${BASE}/job-uuid/submit-transcript`).send({});
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /jobs/:id/assign-editor
// ---------------------------------------------------------------------------
describe('POST /jobs/:id/assign-editor', () => {
  it('editor valid + job TRANSCRIBED → 200, status tetap TRANSCRIBED', async () => {
    mockedJobRepo.findById.mockResolvedValue(
      mockJob({ status: 'TRANSCRIBED', reporter_id: 'reporter-uuid' })
    );
    mockedUserRepo.findById.mockResolvedValue(mockEditor());
    mockedJobRepo.countActiveJobsByEditor.mockResolvedValue(0);
    mockedJobRepo.assignEditor.mockResolvedValue(
      mockJob({ status: 'TRANSCRIBED', reporter_id: 'reporter-uuid', editor_id: 'editor-uuid' })
    );

    const res = await request(app)
      .post(`${BASE}/job-uuid/assign-editor`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ editor_id: 'editor-uuid' });

    expect(res.status).toBe(200);
    expect(res.body.data.job.status).toBe('TRANSCRIBED');
    expect(res.body.data.job.editor_id).toBe('editor-uuid');
  });

  it('status bukan TRANSCRIBED → 400', async () => {
    mockedJobRepo.findById.mockResolvedValue(mockJob({ status: 'NEW' }));

    const res = await request(app)
      .post(`${BASE}/job-uuid/assign-editor`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ editor_id: 'editor-uuid' });

    expect(res.status).toBe(400);
  });

  it('editor tidak ditemukan → 404', async () => {
    mockedJobRepo.findById.mockResolvedValue(mockJob({ status: 'TRANSCRIBED' }));
    mockedUserRepo.findById.mockResolvedValue(null);

    const res = await request(app)
      .post(`${BASE}/job-uuid/assign-editor`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ editor_id: 'nonexistent-uuid' });

    expect(res.status).toBe(404);
  });

  it('user yang di-assign bukan role editor (reporter) → 400', async () => {
    mockedJobRepo.findById.mockResolvedValue(mockJob({ status: 'TRANSCRIBED' }));
    mockedUserRepo.findById.mockResolvedValue(mockReporter());

    const res = await request(app)
      .post(`${BASE}/job-uuid/assign-editor`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ editor_id: 'reporter-uuid' });

    expect(res.status).toBe(400);
  });

  it('editor sudah punya job aktif (TRANSCRIBED/REVIEWED) → 400', async () => {
    mockedJobRepo.findById.mockResolvedValue(mockJob({ status: 'TRANSCRIBED' }));
    mockedUserRepo.findById.mockResolvedValue(mockEditor());
    mockedJobRepo.countActiveJobsByEditor.mockResolvedValue(1);

    const res = await request(app)
      .post(`${BASE}/job-uuid/assign-editor`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ editor_id: 'editor-uuid' });

    expect(res.status).toBe(400);
  });

  it('token reporter → 403', async () => {
    const res = await request(app)
      .post(`${BASE}/job-uuid/assign-editor`)
      .set('Authorization', `Bearer ${reporterToken()}`)
      .send({ editor_id: 'editor-uuid' });

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// PATCH /jobs/:id/mark-reviewed
// ---------------------------------------------------------------------------
describe('PATCH /jobs/:id/mark-reviewed', () => {
  it('assigned editor + job TRANSCRIBED → 200, status REVIEWED', async () => {
    mockedJobRepo.findById.mockResolvedValue(
      mockJob({ status: 'TRANSCRIBED', reporter_id: 'reporter-uuid', editor_id: 'editor-uuid' })
    );
    mockedJobRepo.markReviewed.mockResolvedValue(
      mockJob({ status: 'REVIEWED', reporter_id: 'reporter-uuid', editor_id: 'editor-uuid', reviewed_at: new Date() })
    );

    const res = await request(app)
      .patch(`${BASE}/job-uuid/mark-reviewed`)
      .set('Authorization', `Bearer ${editorToken('editor-uuid')}`)
      .send({ review_notes: 'LGTM' });

    expect(res.status).toBe(200);
    expect(res.body.data.job.status).toBe('REVIEWED');
  });

  it('editor berbeda (bukan yang di-assign) → 403', async () => {
    mockedJobRepo.findById.mockResolvedValue(
      mockJob({ status: 'TRANSCRIBED', editor_id: 'editor-uuid' })
    );

    const res = await request(app)
      .patch(`${BASE}/job-uuid/mark-reviewed`)
      .set('Authorization', `Bearer ${editorToken('other-editor-uuid')}`)
      .send({});

    expect(res.status).toBe(403);
  });

  it('job belum ada editor_id → 400', async () => {
    mockedJobRepo.findById.mockResolvedValue(
      mockJob({ status: 'TRANSCRIBED', editor_id: null })
    );

    const res = await request(app)
      .patch(`${BASE}/job-uuid/mark-reviewed`)
      .set('Authorization', `Bearer ${editorToken('editor-uuid')}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('status bukan TRANSCRIBED → 400', async () => {
    mockedJobRepo.findById.mockResolvedValue(
      mockJob({ status: 'REVIEWED', editor_id: 'editor-uuid' })
    );

    const res = await request(app)
      .patch(`${BASE}/job-uuid/mark-reviewed`)
      .set('Authorization', `Bearer ${editorToken('editor-uuid')}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PATCH /jobs/:id/complete
// ---------------------------------------------------------------------------
describe('PATCH /jobs/:id/complete', () => {
  it('job REVIEWED dengan reporter dan editor → 200, status COMPLETED', async () => {
    mockedJobRepo.findById.mockResolvedValue(
      mockJob({ status: 'REVIEWED', reporter_id: 'reporter-uuid', editor_id: 'editor-uuid' })
    );
    mockedJobRepo.completeJob.mockResolvedValue(
      mockJob({
        status: 'COMPLETED',
        reporter_id: 'reporter-uuid',
        editor_id: 'editor-uuid',
        reporter_payment: 60000,
        editor_payment: 50000,
      })
    );

    const res = await request(app)
      .patch(`${BASE}/job-uuid/complete`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.job.status).toBe('COMPLETED');
    expect(res.body.data.job.reporter_payment).toBe(60000);
    expect(res.body.data.job.editor_payment).toBe(50000);
  });

  it('status bukan REVIEWED → 400', async () => {
    mockedJobRepo.findById.mockResolvedValue(
      mockJob({ status: 'TRANSCRIBED', reporter_id: 'reporter-uuid', editor_id: 'editor-uuid' })
    );

    const res = await request(app)
      .patch(`${BASE}/job-uuid/complete`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(400);
  });

  it('job tanpa reporter_id → 400', async () => {
    mockedJobRepo.findById.mockResolvedValue(
      mockJob({ status: 'REVIEWED', reporter_id: null, editor_id: 'editor-uuid' })
    );

    const res = await request(app)
      .patch(`${BASE}/job-uuid/complete`)
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(400);
  });

  it('token reporter (bukan admin) → 403', async () => {
    const res = await request(app)
      .patch(`${BASE}/job-uuid/complete`)
      .set('Authorization', `Bearer ${reporterToken()}`);

    expect(res.status).toBe(403);
  });

  it('tanpa token → 401', async () => {
    const res = await request(app).patch(`${BASE}/job-uuid/complete`);
    expect(res.status).toBe(401);
  });
});
