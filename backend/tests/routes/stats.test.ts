import express from 'express';
import request from 'supertest';

jest.mock('../../src/config/manager', () => ({
  getConfig: jest.fn(),
}));

jest.mock('../../src/scanner/library', () => ({
  scanLibrary: jest.fn(),
  scanLibraryMixed: jest.fn(),
}));

jest.mock('../../src/services/playerProgress', () => ({
  getAllProgress: jest.fn(() => ({})),
}));

jest.mock('../../src/services/readerProgress', () => ({
  getAllProgress: jest.fn(() => ({})),
}));

import { getConfig } from '../../src/config/manager';
import { scanLibrary, scanLibraryMixed } from '../../src/scanner/library';
import statsRouter, { invalidateStatsCache } from '../../src/routes/stats';

const mockGetConfig = getConfig as jest.Mock;
const mockScanLibrary = scanLibrary as jest.Mock;
const mockScanLibraryMixed = scanLibraryMixed as jest.Mock;

function buildApp() {
  const app = express();
  app.use('/stats', statsRouter);
  return app;
}

describe('GET /stats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidateStatsCache();

    mockGetConfig.mockReturnValue({
      ebook: [{ id: 'ebook-lib', path: '/ebook', name: 'Ebooks', type: 'ebook' }],
      audiobook: [{ id: 'audio-lib', path: '/audio', name: 'Audio', type: 'audiobook' }],
      mixed: [{ id: 'mixed-lib', path: '/mixed', name: 'Mixed', type: 'mixed' }],
    });

    mockScanLibrary.mockImplementation((pathArg: string, typeArg: 'ebook' | 'audiobook') => {
      if (typeArg === 'ebook') {
        return [
          {
            author: 'Author A',
            books: [
              {
                title: 'Ebook Only',
                path: '/ebook/a1/e1',
                files: [{ name: 'ebook.epub', path: '/ebook/a1/e1/ebook.epub', size: 10, sizeFormatted: '10 B', ext: 'epub' }],
                cover: null,
                savedMeta: { series: 'Saga A #1' },
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
              title: 'Audio Only',
              path: '/audio/b1/a1',
              files: [{ name: 'audio.mp3', path: '/audio/b1/a1/audio.mp3', size: 20, sizeFormatted: '20 B', ext: 'mp3' }],
              cover: null,
              savedMeta: { series: 'Saga B #1' },
            },
          ],
        },
      ];
    });

    mockScanLibraryMixed.mockReturnValue([
      {
        author: 'Author C',
        books: [
          {
            title: 'Both Formats',
            path: '/mixed/c1/m1',
            files: [
              { name: 'both.epub', path: '/mixed/c1/m1/both.epub', size: 30, sizeFormatted: '30 B', ext: 'epub' },
              { name: 'both.mp3', path: '/mixed/c1/m1/both.mp3', size: 40, sizeFormatted: '40 B', ext: 'mp3' },
            ],
            ebookFiles: [{ name: 'both.epub', path: '/mixed/c1/m1/both.epub', size: 30, sizeFormatted: '30 B', ext: 'epub' }],
            audiobookFiles: [{ name: 'both.mp3', path: '/mixed/c1/m1/both.mp3', size: 40, sizeFormatted: '40 B', ext: 'mp3' }],
            cover: null,
            savedMeta: { series: 'Saga C #2' },
          },
          {
            title: 'Ebook In Mixed',
            path: '/mixed/c1/m2',
            files: [{ name: 'mixed-only.epub', path: '/mixed/c1/m2/mixed-only.epub', size: 15, sizeFormatted: '15 B', ext: 'epub' }],
            ebookFiles: [{ name: 'mixed-only.epub', path: '/mixed/c1/m2/mixed-only.epub', size: 15, sizeFormatted: '15 B', ext: 'epub' }],
            audiobookFiles: [],
            cover: null,
            savedMeta: { series: 'Saga D #1' },
          },
        ],
      },
    ]);
  });

  it('counts ebooks, audiobooks and mixed series correctly', async () => {
    const app = buildApp();

    const res = await request(app).get('/stats');

    expect(res.status).toBe(200);
    expect(res.body.totalEbooks).toBe(3);
    expect(res.body.totalAudiobooks).toBe(2);
    expect(res.body.totalMixed).toBe(1);
  });
});
