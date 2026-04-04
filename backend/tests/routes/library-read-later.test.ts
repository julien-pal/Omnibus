import express from 'express';
import request from 'supertest';

jest.mock('../../src/config/manager', () => ({
  getConfig: jest.fn(),
}));

jest.mock('../../src/scanner/library', () => ({
  scanLibrary: jest.fn(),
  scanLibraryMixed: jest.fn(),
}));

import { getConfig } from '../../src/config/manager';
import { scanLibrary, scanLibraryMixed } from '../../src/scanner/library';
import libraryRouter from '../../src/routes/library';

const mockGetConfig = getConfig as jest.Mock;
const mockScanLibrary = scanLibrary as jest.Mock;
const mockScanLibraryMixed = scanLibraryMixed as jest.Mock;

function buildApp() {
  const app = express();
  app.use('/library', libraryRouter);
  return app;
}

describe('GET /library/read-later', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockGetConfig.mockReturnValue({
      ebook: [{ id: 'ebook-lib', path: '/ebook', name: 'Ebooks', type: 'ebook' }],
      audiobook: [{ id: 'audio-lib', path: '/audio', name: 'Audio', type: 'audiobook' }],
      mixed: [],
    });

    mockScanLibrary.mockImplementation((_pathArg: string, typeArg: 'ebook' | 'audiobook') => {
      if (typeArg === 'ebook') {
        return [
          {
            author: 'Author A',
            books: [
              {
                title: 'Book To Read',
                path: '/ebook/a1/b1',
                files: [],
                cover: null,
                savedMeta: { title: 'Book To Read', readLater: true, series: 'Saga', seriesSequence: '1' },
              },
              {
                title: 'Normal Book',
                path: '/ebook/a1/b2',
                files: [],
                cover: null,
                savedMeta: { title: 'Normal Book' },
              },
            ],
          },
        ];
      }
      return [
        {
          author: 'Author B',
          books: [
            {
              title: 'Audio Read Later',
              path: '/audio/b1/a1',
              files: [],
              cover: null,
              savedMeta: { title: 'Audio Read Later', readLater: true },
            },
          ],
        },
      ];
    });

    mockScanLibraryMixed.mockReturnValue([]);
  });

  it('returns only books with readLater: true across all libraries', async () => {
    const app = buildApp();
    const res = await request(app).get('/library/read-later');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.every((b: { savedMeta?: { readLater?: boolean } }) => b.savedMeta?.readLater === true)).toBe(true);
  });

  it('includes path, title, cover and savedMeta in response', async () => {
    const app = buildApp();
    const res = await request(app).get('/library/read-later');

    const book = res.body.find((b: { title: string }) => b.title === 'Book To Read');
    expect(book).toBeDefined();
    expect(book.path).toBe('/ebook/a1/b1');
    expect(book.savedMeta.series).toBe('Saga');
    expect(book.savedMeta.seriesSequence).toBe('1');
  });

  it('returns empty array when no books have readLater', async () => {
    mockScanLibrary.mockReturnValue([
      {
        author: 'Author A',
        books: [
          { title: 'Normal', path: '/ebook/a1/b1', files: [], cover: null, savedMeta: {} },
        ],
      },
    ]);

    const app = buildApp();
    const res = await request(app).get('/library/read-later');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});
