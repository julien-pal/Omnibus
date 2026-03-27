import request from 'supertest';
import express from 'express';

jest.mock('../../src/config/manager', () => ({
  initializeConfigs: jest.fn(),
  getConfig: jest.fn(),
  saveConfig: jest.fn(),
}));
jest.mock('../../src/scanner/library', () => ({
  scanLibrary: jest.fn(),
  scanLibraryMixed: jest.fn(),
  getLibraryStats: jest.fn().mockReturnValue({ authors: 0, books: 0, files: 0, size: 0 }),
}));
jest.mock('../../src/services/metadata', () => ({
  enrich: jest.fn(),
  search: jest.fn(),
  fetchByAsin: jest.fn(),
  fetchSeriesBooks: jest.fn(),
  writeBookMeta: jest.fn(),
}));
// Silence logger
jest.mock('../../src/lib/logger', () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
// Silence stats invalidation side effects
jest.mock('../../src/routes/stats', () => ({
  invalidateStatsCache: jest.fn(),
}));
jest.mock('../../src/services/email', () => ({
  sendEbookToReader: jest.fn(),
}));

import { getConfig } from '../../src/config/manager';
import { sendEbookToReader } from '../../src/services/email';
import authMiddleware from '../../src/middleware/auth';
import libraryRouter from '../../src/routes/library';

const mockGetConfig = getConfig as jest.Mock;
const mockSendEbookToReader = sendEbookToReader as jest.Mock;

const app = express();
app.use(express.json());
app.use('/api', authMiddleware);
app.use('/api/library', libraryRouter);

const emptyLibraries = { ebook: [], audiobook: [], mixed: [] };

describe('GET /api/library', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns 200 with empty library lists when auth is disabled', async () => {
    mockGetConfig.mockImplementation((key: string) => {
      if (key === 'app') return { auth: { enabled: false } };
      if (key === 'libraries') return emptyLibraries;
      return {};
    });

    const res = await request(app).get('/api/library');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ebook: [], audiobook: [], mixed: [] });
  });

  it('returns 401 when auth is enabled and no token provided', async () => {
    mockGetConfig.mockImplementation((key: string) => {
      if (key === 'app') return { auth: { enabled: true, username: 'admin' } };
      return {};
    });

    const res = await request(app).get('/api/library');

    expect(res.status).toBe(401);
  });

  it('returns library entries for configured libraries', async () => {
    mockGetConfig.mockImplementation((key: string) => {
      if (key === 'app') return { auth: { enabled: false } };
      if (key === 'libraries') return {
        ebook: [{ id: 'lib1', path: '/books', name: 'My Books' }],
        audiobook: [],
        mixed: [],
      };
      return {};
    });

    const res = await request(app).get('/api/library');

    expect(res.status).toBe(200);
    expect(res.body.ebook).toHaveLength(1);
    expect(res.body.ebook[0].id).toBe('lib1');
  });
});

// ── send-to-reader ────────────────────────────────────────────────────────────

describe('POST /api/library/send-to-reader', () => {
  const libraryPath = '/my-library';
  const ebookPath = '/my-library/Author/Book/book.epub';

  function setupSend(emailConfig: object | false = {
    smtpHost: 'smtp.example.com', smtpPort: 587, smtpUser: 'u',
    smtpPass: 'p', senderEmail: 'a@b.com', readerEmail: 'k@kindle.com',
  }) {
    const resolvedEmailConfig = emailConfig === false ? undefined : emailConfig;
    mockGetConfig.mockImplementation((key: string) => {
      if (key === 'app') return { auth: { enabled: false }, emailConfig: resolvedEmailConfig };
      if (key === 'libraries') return { ebook: [{ id: '1', path: libraryPath, type: 'ebook' }], audiobook: [], mixed: [] };
      return {};
    });
  }

  beforeEach(() => {
    jest.resetAllMocks();
    mockSendEbookToReader.mockResolvedValue(undefined);
  });

  it('returns 400 when bookPath is missing', async () => {
    setupSend();
    const res = await request(app).post('/api/library/send-to-reader').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 for unsupported file type', async () => {
    setupSend();
    const res = await request(app).post('/api/library/send-to-reader').send({ bookPath: '/my-library/Author/Book/book.mp3' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unsupported/i);
  });

  it('returns 403 when path is outside library', async () => {
    setupSend();
    const res = await request(app).post('/api/library/send-to-reader').send({ bookPath: '/etc/passwd.epub' });
    expect(res.status).toBe(403);
  });

  it('returns 503 when email is not configured', async () => {
    setupSend(false);
    const res = await request(app).post('/api/library/send-to-reader').send({ bookPath: ebookPath });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not configured/i);
  });

  it('returns 200 and calls sendEbookToReader on valid request', async () => {
    setupSend();
    jest.spyOn(require('fs'), 'existsSync').mockImplementation((p: unknown) => p === ebookPath || p === libraryPath);
    const res = await request(app).post('/api/library/send-to-reader').send({ bookPath: ebookPath });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mockSendEbookToReader).toHaveBeenCalledWith(
      expect.objectContaining({ readerEmail: 'k@kindle.com' }),
      ebookPath,
    );
  });

  it('returns 502 when sendEbookToReader throws', async () => {
    setupSend();
    jest.spyOn(require('fs'), 'existsSync').mockImplementation(() => true);
    mockSendEbookToReader.mockRejectedValueOnce(new Error('SMTP error'));
    const res = await request(app).post('/api/library/send-to-reader').send({ bookPath: ebookPath });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('SMTP error');
  });
});
