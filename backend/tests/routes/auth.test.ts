import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';

// Mock config manager before any route imports
jest.mock('../../src/config/manager', () => ({
  initializeConfigs: jest.fn(),
  getConfig: jest.fn(),
  saveConfig: jest.fn(),
}));
jest.mock('bcryptjs');

import { getConfig } from '../../src/config/manager';
import authRouter from '../../src/routes/auth';

const mockGetConfig = getConfig as jest.Mock;
const mockBcryptCompare = bcrypt.compare as jest.Mock;

// Build minimal test app
const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns 200 + token when auth is disabled', async () => {
    mockGetConfig.mockReturnValue({ auth: { enabled: false }, jwtSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'anyone', password: 'anything' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.username).toBe('admin');
  });

  it('returns 401 when username does not match', async () => {
    mockGetConfig.mockReturnValue({
      auth: { enabled: true, username: 'admin', passwordHash: 'hash' },
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'wrong', password: 'pass' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid credentials/);
  });

  it('returns 401 with specific message when password hash is not set', async () => {
    mockGetConfig.mockReturnValue({
      auth: { enabled: true, username: 'admin', passwordHash: null },
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'anything' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Password not set/);
  });

  it('returns 401 when password is wrong', async () => {
    mockGetConfig.mockReturnValue({
      auth: { enabled: true, username: 'admin', passwordHash: '$2b$10$hash' },
    });
    mockBcryptCompare.mockResolvedValue(false);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrongpass' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid credentials/);
  });

  it('returns 200 + token for valid credentials', async () => {
    mockGetConfig.mockReturnValue({
      auth: { enabled: true, username: 'admin', passwordHash: '$2b$10$hash' },
      jwtSecret: 'test-secret',
    });
    mockBcryptCompare.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'correctpass' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.username).toBe('admin');
  });
});
