import express from 'express';
import request from 'supertest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../src/lib/logger', () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../src/config/manager', () => ({
  getConfig: jest.fn(),
  saveConfig: jest.fn(),
}));

// Heavy service mocks — not needed for settings route unit tests
jest.mock('../../src/services/prowlarr', () => ({
  testConnection: jest.fn().mockResolvedValue({ ok: true }),
  getIndexers: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../src/services/torrent', () => ({
  createClient: jest.fn(),
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { getConfig, saveConfig } from '../../src/config/manager';
import settingsRouter from '../../src/routes/settings';

const mockGetConfig = jest.mocked(getConfig);
const mockSaveConfig = jest.mocked(saveConfig);

// ── App fixture ───────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/settings', settingsRouter);
  return app;
}

// ── Default follows config ────────────────────────────────────────────────────

function emptyFollows() {
  return { authors: [] as Array<{ name: string; format: string; libraryId?: string }>, series: [] as Array<{ name: string; author?: string; format: string; libraryId?: string }> };
}

function setupFollows(follows = emptyFollows()) {
  mockGetConfig.mockImplementation((key: string) => {
    if (key === 'follows') return follows as any;
    if (key === 'app') return { port: 8686, auth: { enabled: false } } as any;
    return {} as any;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── GET /settings/follows ─────────────────────────────────────────────────────

describe('GET /settings/follows', () => {
  it('returns the full follows config', async () => {
    const follows = {
      authors: [{ name: 'Brandon Sanderson', format: 'audiobook' }],
      series: [{ name: 'Mistborn', author: 'Brandon Sanderson', format: 'both' }],
    };
    setupFollows(follows);
    const app = buildApp();

    const res = await request(app).get('/settings/follows');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(follows);
  });

  it('returns empty arrays when no follows are configured', async () => {
    setupFollows();
    const app = buildApp();

    const res = await request(app).get('/settings/follows');
    expect(res.status).toBe(200);
    expect(res.body.authors).toEqual([]);
    expect(res.body.series).toEqual([]);
  });
});

// ── POST /settings/follows/author ─────────────────────────────────────────────

describe('POST /settings/follows/author', () => {
  it('adds a new author follow', async () => {
    setupFollows();
    const app = buildApp();

    const res = await request(app)
      .post('/settings/follows/author')
      .send({ name: 'Brandon Sanderson', format: 'audiobook' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.follows.authors).toHaveLength(1);
    expect(res.body.follows.authors[0].name).toBe('Brandon Sanderson');
    expect(res.body.follows.authors[0].format).toBe('audiobook');
  });

  it('returns 400 when name is missing', async () => {
    setupFollows();
    const app = buildApp();

    const res = await request(app)
      .post('/settings/follows/author')
      .send({ format: 'audiobook' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('defaults format to "both" when not provided', async () => {
    setupFollows();
    const app = buildApp();

    const res = await request(app)
      .post('/settings/follows/author')
      .send({ name: 'Terry Pratchett' });

    expect(res.status).toBe(200);
    expect(res.body.follows.authors[0].format).toBe('both');
  });

  it('updates an existing author follow (upsert)', async () => {
    setupFollows({
      authors: [{ name: 'Brandon Sanderson', format: 'ebook' }],
      series: [],
    });
    const app = buildApp();

    const res = await request(app)
      .post('/settings/follows/author')
      .send({ name: 'Brandon Sanderson', format: 'audiobook' });

    expect(res.status).toBe(200);
    // Still only one author — updated in place
    expect(res.body.follows.authors).toHaveLength(1);
    expect(res.body.follows.authors[0].format).toBe('audiobook');
  });

  it('persists the change via saveConfig', async () => {
    setupFollows();
    const app = buildApp();

    await request(app)
      .post('/settings/follows/author')
      .send({ name: 'Ursula K. Le Guin', format: 'ebook' });

    expect(mockSaveConfig).toHaveBeenCalledWith('follows', expect.objectContaining({
      authors: expect.arrayContaining([expect.objectContaining({ name: 'Ursula K. Le Guin' })]),
    }));
  });

  it('can store a libraryId', async () => {
    setupFollows();
    const app = buildApp();

    const res = await request(app)
      .post('/settings/follows/author')
      .send({ name: 'Neil Gaiman', format: 'both', libraryId: 'lib-01' });

    expect(res.body.follows.authors[0].libraryId).toBe('lib-01');
  });
});

// ── DELETE /settings/follows/author ──────────────────────────────────────────

describe('DELETE /settings/follows/author', () => {
  it('removes an existing author follow', async () => {
    setupFollows({
      authors: [
        { name: 'Brandon Sanderson', format: 'audiobook' },
        { name: 'Terry Pratchett', format: 'both' },
      ],
      series: [],
    });
    const app = buildApp();

    const res = await request(app)
      .delete('/settings/follows/author')
      .send({ name: 'Brandon Sanderson' });

    expect(res.status).toBe(200);
    expect(res.body.follows.authors).toHaveLength(1);
    expect(res.body.follows.authors[0].name).toBe('Terry Pratchett');
  });

  it('returns 400 when name is missing', async () => {
    setupFollows();
    const app = buildApp();

    const res = await request(app).delete('/settings/follows/author').send({});
    expect(res.status).toBe(400);
  });

  it('is a no-op when the author is not followed', async () => {
    setupFollows({ authors: [{ name: 'Terry Pratchett', format: 'both' }], series: [] });
    const app = buildApp();

    const res = await request(app)
      .delete('/settings/follows/author')
      .send({ name: 'Unknown Author' });

    expect(res.status).toBe(200);
    expect(res.body.follows.authors).toHaveLength(1);
  });

  it('persists the deletion via saveConfig', async () => {
    setupFollows({ authors: [{ name: 'To Delete', format: 'both' }], series: [] });
    const app = buildApp();

    await request(app).delete('/settings/follows/author').send({ name: 'To Delete' });

    expect(mockSaveConfig).toHaveBeenCalledWith('follows', expect.objectContaining({
      authors: [],
    }));
  });
});

// ── POST /settings/follows/series ─────────────────────────────────────────────

describe('POST /settings/follows/series', () => {
  it('adds a new series follow', async () => {
    setupFollows();
    const app = buildApp();

    const res = await request(app)
      .post('/settings/follows/series')
      .send({ name: 'Mistborn', author: 'Brandon Sanderson', format: 'audiobook' });

    expect(res.status).toBe(200);
    expect(res.body.follows.series).toHaveLength(1);
    expect(res.body.follows.series[0].name).toBe('Mistborn');
    expect(res.body.follows.series[0].author).toBe('Brandon Sanderson');
  });

  it('returns 400 when name is missing', async () => {
    setupFollows();
    const app = buildApp();

    const res = await request(app)
      .post('/settings/follows/series')
      .send({ author: 'Brandon Sanderson' });

    expect(res.status).toBe(400);
  });

  it('defaults format to "both" when not provided', async () => {
    setupFollows();
    const app = buildApp();

    const res = await request(app)
      .post('/settings/follows/series')
      .send({ name: 'Stormlight Archive' });

    expect(res.body.follows.series[0].format).toBe('both');
  });

  it('upserts an existing series follow', async () => {
    setupFollows({
      authors: [],
      series: [{ name: 'Mistborn', format: 'ebook' }],
    });
    const app = buildApp();

    const res = await request(app)
      .post('/settings/follows/series')
      .send({ name: 'Mistborn', format: 'audiobook' });

    expect(res.body.follows.series).toHaveLength(1);
    expect(res.body.follows.series[0].format).toBe('audiobook');
  });

  it('persists via saveConfig', async () => {
    setupFollows();
    const app = buildApp();

    await request(app)
      .post('/settings/follows/series')
      .send({ name: 'Discworld', format: 'ebook' });

    expect(mockSaveConfig).toHaveBeenCalledWith('follows', expect.objectContaining({
      series: expect.arrayContaining([expect.objectContaining({ name: 'Discworld' })]),
    }));
  });

  it('can store a libraryId', async () => {
    setupFollows();
    const app = buildApp();

    const res = await request(app)
      .post('/settings/follows/series')
      .send({ name: 'Expanse', format: 'both', libraryId: 'ebook-lib' });

    expect(res.body.follows.series[0].libraryId).toBe('ebook-lib');
  });
});

// ── DELETE /settings/follows/series ──────────────────────────────────────────

describe('DELETE /settings/follows/series', () => {
  it('removes an existing series follow', async () => {
    setupFollows({
      authors: [],
      series: [
        { name: 'Mistborn', format: 'audiobook' },
        { name: 'Stormlight', format: 'both' },
      ],
    });
    const app = buildApp();

    const res = await request(app)
      .delete('/settings/follows/series')
      .send({ name: 'Mistborn' });

    expect(res.status).toBe(200);
    expect(res.body.follows.series).toHaveLength(1);
    expect(res.body.follows.series[0].name).toBe('Stormlight');
  });

  it('returns 400 when name is missing', async () => {
    setupFollows();
    const app = buildApp();

    const res = await request(app).delete('/settings/follows/series').send({});
    expect(res.status).toBe(400);
  });

  it('is a no-op when the series is not followed', async () => {
    setupFollows({
      authors: [],
      series: [{ name: 'Stormlight', format: 'both' }],
    });
    const app = buildApp();

    const res = await request(app)
      .delete('/settings/follows/series')
      .send({ name: 'Unknown Series' });

    expect(res.status).toBe(200);
    expect(res.body.follows.series).toHaveLength(1);
  });

  it('persists deletion via saveConfig', async () => {
    setupFollows({
      authors: [],
      series: [{ name: 'To Remove', format: 'both' }],
    });
    const app = buildApp();

    await request(app).delete('/settings/follows/series').send({ name: 'To Remove' });

    expect(mockSaveConfig).toHaveBeenCalledWith('follows', expect.objectContaining({
      series: [],
    }));
  });
});

// ── Email settings ────────────────────────────────────────────────────────────

function setupEmailConfig(overrides = {}) {
  const base = {
    smtpHost: 'smtp.example.com',
    smtpPort: 587,
    smtpUser: 'user@example.com',
    smtpPass: 'secret',
    senderEmail: 'user@example.com',
    readerEmail: 'kindle@kindle.com',
  };
  mockGetConfig.mockImplementation((key: string) => {
    if (key === 'app') return { emailConfig: { ...base, ...overrides } } as any;
    return {} as any;
  });
}

describe('GET /settings/email', () => {
  it('returns email config without smtpPass', async () => {
    setupEmailConfig();
    const res = await request(buildApp()).get('/settings/email');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpUser: 'user@example.com',
      senderEmail: 'user@example.com',
      readerEmail: 'kindle@kindle.com',
      smtpPassSet: true,
    });
    expect(res.body.smtpPass).toBeUndefined();
  });

  it('returns smtpPassSet: false when password is empty', async () => {
    setupEmailConfig({ smtpPass: '' });
    const res = await request(buildApp()).get('/settings/email');
    expect(res.body.smtpPassSet).toBe(false);
  });

  it('returns defaults when emailConfig not set', async () => {
    mockGetConfig.mockImplementation(() => ({ port: 8686 }) as any);
    const res = await request(buildApp()).get('/settings/email');
    expect(res.status).toBe(200);
    expect(res.body.smtpHost).toBe('');
    expect(res.body.smtpPort).toBe(587);
  });
});

describe('PUT /settings/email', () => {
  it('saves email config and returns ok', async () => {
    mockGetConfig.mockImplementation(() => ({ port: 8686 }) as any);
    const res = await request(buildApp())
      .put('/settings/email')
      .send({ smtpHost: 'smtp.gmail.com', smtpPort: 465, smtpUser: 'u', smtpPass: 'p', senderEmail: 'a@b.com', readerEmail: 'k@kindle.com' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockSaveConfig).toHaveBeenCalledWith('app', expect.objectContaining({
      emailConfig: expect.objectContaining({ smtpHost: 'smtp.gmail.com' }),
    }));
  });
});

describe('POST /settings/email/test', () => {
  it('returns 503 when email not configured', async () => {
    mockGetConfig.mockImplementation(() => ({ port: 8686 }) as any);
    const res = await request(buildApp()).post('/settings/email/test');
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not configured/i);
  });
});
