import fs from 'fs';
import path from 'path';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('fs');
const mockFs = jest.mocked(fs);

jest.mock('../../src/lib/logger', () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../src/config/manager', () => ({
  getConfig: jest.fn(),
}));

jest.mock('../../src/scanner/library', () => ({
  scanLibrary: jest.fn(),
  scanLibraryMixed: jest.fn(),
}));

jest.mock('../../src/services/metadata', () => ({
  search: jest.fn(),
  fetchSeriesBooks: jest.fn(),
  writeBookMeta: jest.fn(),
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { getConfig } from '../../src/config/manager';
import { scanLibrary, scanLibraryMixed } from '../../src/scanner/library';
import { search as searchMetadata, fetchSeriesBooks, writeBookMeta } from '../../src/services/metadata';
import { normalize, runFollowCron, getLogs, restartFollowCron, stopFollowCron } from '../../src/services/followCron';

const mockGetConfig = jest.mocked(getConfig);
const mockScanLibrary = jest.mocked(scanLibrary);
const mockScanLibraryMixed = jest.mocked(scanLibraryMixed);
const mockSearchMetadata = jest.mocked(searchMetadata);
const mockFetchSeriesBooks = jest.mocked(fetchSeriesBooks);
const mockWriteBookMeta = jest.mocked(writeBookMeta);

// ── Fixtures ──────────────────────────────────────────────────────────────────

function lib(id: string, libPath: string, type = 'audiobook') {
  return { id, path: libPath, name: id, type };
}
function emptyLibrariesConfig() { return { ebook: [], audiobook: [], mixed: [] }; }
function emptyFollowsConfig() { return { authors: [], series: [] }; }
function setupConfig(libraries: object, follows: object, app: object = {}) {
  mockGetConfig.mockImplementation((key: string) => {
    if (key === 'libraries') return libraries as any;
    if (key === 'follows') return follows as any;
    if (key === 'app') return app as any;
    return {} as any;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFs.existsSync = jest.fn().mockReturnValue(false);
  mockFs.mkdirSync = jest.fn();
  mockScanLibrary.mockReturnValue([]);
  mockScanLibraryMixed.mockReturnValue([]);
});

// ── normalize ─────────────────────────────────────────────────────────────────

describe('normalize', () => {
  it('lowercases the string', () => { expect(normalize('Hello World')).toBe('helloworld'); });
  it('removes accents (NFD)', () => {
    expect(normalize('eaü')).toBe('eau');
    expect(normalize('Ca va')).toBe('cava');
  });
  it('removes non-alphanumeric characters', () => {
    expect(normalize('The Hobbit: An Unexpected Journey')).toBe('thehobbitanunexpectedjourney');
  });
  it('handles empty string', () => { expect(normalize('')).toBe(''); });
  it('handles numbers', () => { expect(normalize('Book 1')).toBe('book1'); });
  it('strips # and —', () => { expect(normalize('Series #1 — Subtitle')).toBe('series1subtitle'); });
  it('normalizes same title regardless of accent variant', () => {
    expect(normalize('Le Seigneur des Anneaux')).toBe(normalize('le seigneur des anneaux'));
  });
});

// ── getLogs ───────────────────────────────────────────────────────────────────

describe('getLogs', () => {
  it('returns an array after a run', async () => {
    setupConfig(emptyLibrariesConfig(), emptyFollowsConfig());
    await runFollowCron();
    expect(Array.isArray(getLogs())).toBe(true);
  });
  it('returns a copy (mutations do not affect internal buffer)', async () => {
    setupConfig(emptyLibrariesConfig(), emptyFollowsConfig());
    await runFollowCron();
    const logs = getLogs();
    const len = logs.length;
    logs.push({ ts: '2026-01-01', level: 'info', msg: 'injected' });
    expect(getLogs().length).toBe(len);
  });
});

// ── no follows ────────────────────────────────────────────────────────────────

describe('runFollowCron — no follows configured', () => {
  beforeEach(() => setupConfig(emptyLibrariesConfig(), emptyFollowsConfig()));
  it('does not call searchMetadata or fetchSeriesBooks', async () => {
    await runFollowCron();
    expect(mockSearchMetadata).not.toHaveBeenCalled();
    expect(mockFetchSeriesBooks).not.toHaveBeenCalled();
  });
  it('does not call writeBookMeta', async () => {
    await runFollowCron();
    expect(mockWriteBookMeta).not.toHaveBeenCalled();
  });
});

// ── author follow ─────────────────────────────────────────────────────────────

describe('runFollowCron — author follow', () => {
  const libPath = '/books/audiobooks';

  function setupAuthorFollow(format: 'audiobook' | 'ebook' | 'both' = 'audiobook') {
    setupConfig(
      { ebook: [], audiobook: [lib('lib1', libPath)], mixed: [] },
      { authors: [{ name: 'Brandon Sanderson', format }], series: [] },
    );
  }

  it('calls searchMetadata with author name and type', async () => {
    setupAuthorFollow();
    mockSearchMetadata.mockResolvedValue([]);
    await runFollowCron();
    expect(mockSearchMetadata).toHaveBeenCalledWith('Brandon Sanderson', 'Brandon Sanderson', 'audiobook');
  });

  it('adds new books to wishlist', async () => {
    setupAuthorFollow();
    mockSearchMetadata.mockResolvedValue([{ title: 'The Way of Kings', author: 'Brandon Sanderson', asin: 'B001' }]);
    await runFollowCron();
    expect(mockWriteBookMeta).toHaveBeenCalledTimes(1);
    expect(mockWriteBookMeta).toHaveBeenCalledWith(
      expect.stringContaining('The Way of Kings'),
      expect.objectContaining({ wishlist: true, wishlistFormat: 'audiobook' }),
    );
  });

  it('creates the book directory if it does not exist', async () => {
    setupAuthorFollow();
    mockSearchMetadata.mockResolvedValue([{ title: 'New Book', author: 'Brandon Sanderson' }]);
    await runFollowCron();
    expect(mockFs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
  });

  it('does not call mkdirSync if directory already exists', async () => {
    setupAuthorFollow();
    (mockFs.existsSync as jest.Mock).mockReturnValue(true);
    mockSearchMetadata.mockResolvedValue([{ title: 'Existing Book', author: 'Brandon Sanderson' }]);
    await runFollowCron();
    expect(mockFs.mkdirSync).not.toHaveBeenCalled();
    expect(mockWriteBookMeta).toHaveBeenCalledTimes(1);
  });

  it('skips books already in library (deduplication)', async () => {
    setupConfig(
      { ebook: [], audiobook: [lib('lib1', libPath)], mixed: [] },
      { authors: [{ name: 'Brandon Sanderson', format: 'audiobook' }], series: [] },
    );
    mockScanLibrary.mockReturnValue([{
      author: 'Brandon Sanderson',
      books: [{ title: 'The Way of Kings', author: 'Brandon Sanderson', path: '/books/wok', files: [], cover: null, savedMeta: null }],
    }]);
    mockSearchMetadata.mockResolvedValue([{ title: 'The Way of Kings', author: 'Brandon Sanderson' }]);
    await runFollowCron();
    expect(mockWriteBookMeta).not.toHaveBeenCalled();
  });

  it('deduplicates by normalized title (accents, case)', async () => {
    setupConfig(
      { ebook: [], audiobook: [lib('lib1', libPath)], mixed: [] },
      { authors: [{ name: 'Tolkien', format: 'audiobook' }], series: [] },
    );
    mockScanLibrary.mockReturnValue([{
      author: 'Tolkien',
      books: [{ title: 'Le Seigneur des Anneaux', author: 'Tolkien', path: '/books/lotr', files: [], cover: null, savedMeta: null }],
    }]);
    mockSearchMetadata.mockResolvedValue([{ title: 'le seigneur des anneaux', author: 'Tolkien' }]);
    await runFollowCron();
    expect(mockWriteBookMeta).not.toHaveBeenCalled();
  });

  it('skips books without title', async () => {
    setupAuthorFollow();
    mockSearchMetadata.mockResolvedValue([{ author: 'Brandon Sanderson' }]);
    await runFollowCron();
    expect(mockWriteBookMeta).not.toHaveBeenCalled();
  });

  it('dry run: does not write to disk', async () => {
    setupAuthorFollow();
    mockSearchMetadata.mockResolvedValue([{ title: 'Mistborn', author: 'Brandon Sanderson' }]);
    await runFollowCron({ dryRun: true });
    expect(mockWriteBookMeta).not.toHaveBeenCalled();
    expect(mockFs.mkdirSync).not.toHaveBeenCalled();
  });

  it('format "both" queries audiobook and ebook', async () => {
    setupAuthorFollow('both');
    mockSearchMetadata.mockResolvedValue([]);
    await runFollowCron();
    expect(mockSearchMetadata).toHaveBeenCalledWith('Brandon Sanderson', 'Brandon Sanderson', 'audiobook');
    expect(mockSearchMetadata).toHaveBeenCalledWith('Brandon Sanderson', 'Brandon Sanderson', 'ebook');
  });

  it('warns and skips if no library found', async () => {
    setupConfig(emptyLibrariesConfig(), { authors: [{ name: 'Author X', format: 'audiobook' }], series: [] });
    mockSearchMetadata.mockResolvedValue([{ title: 'Book A', author: 'Author X' }]);
    await runFollowCron();
    expect(mockWriteBookMeta).not.toHaveBeenCalled();
  });

  it('continues to next author on searchMetadata error', async () => {
    setupConfig(
      { ebook: [], audiobook: [lib('lib1', libPath)], mixed: [] },
      { authors: [{ name: 'Bad Author', format: 'audiobook' }, { name: 'Good Author', format: 'audiobook' }], series: [] },
    );
    mockSearchMetadata
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce([{ title: 'Good Book', author: 'Good Author' }]);
    await runFollowCron();
    expect(mockSearchMetadata).toHaveBeenCalledTimes(2);
    expect(mockWriteBookMeta).toHaveBeenCalledTimes(1);
  });
});

// ── series follow ─────────────────────────────────────────────────────────────

describe('runFollowCron — series follow', () => {
  const libPath = '/books/audiobooks';

  function setupSeriesFollow(format: 'audiobook' | 'ebook' | 'both' = 'audiobook') {
    setupConfig(
      { ebook: [], audiobook: [lib('lib1', libPath)], mixed: [] },
      { authors: [], series: [{ name: 'Stormlight Archive', author: 'Brandon Sanderson', format }] },
    );
  }

  it('calls fetchSeriesBooks with name, author and type', async () => {
    setupSeriesFollow();
    mockFetchSeriesBooks.mockResolvedValue([]);
    await runFollowCron();
    expect(mockFetchSeriesBooks).toHaveBeenCalledWith('Stormlight Archive', 'Brandon Sanderson', 'audiobook');
  });

  it('adds new series books to wishlist', async () => {
    setupSeriesFollow();
    mockFetchSeriesBooks.mockResolvedValue([
      { title: 'The Way of Kings', author: 'Brandon Sanderson', series: 'Stormlight Archive #1' },
    ]);
    await runFollowCron();
    expect(mockWriteBookMeta).toHaveBeenCalledTimes(1);
    expect(mockWriteBookMeta).toHaveBeenCalledWith(
      expect.stringContaining('The Way of Kings'),
      expect.objectContaining({ wishlist: true }),
    );
  });

  it('skips series books already in library', async () => {
    setupConfig(
      { ebook: [], audiobook: [lib('lib1', libPath)], mixed: [] },
      { authors: [], series: [{ name: 'Dune', author: 'Frank Herbert', format: 'audiobook' }] },
    );
    mockScanLibrary.mockReturnValue([{
      author: 'Frank Herbert',
      books: [{ title: 'Dune', author: 'Frank Herbert', path: '/books/dune', files: [], cover: null, savedMeta: null }],
    }]);
    mockFetchSeriesBooks.mockResolvedValue([{ title: 'Dune', author: 'Frank Herbert' }]);
    await runFollowCron();
    expect(mockWriteBookMeta).not.toHaveBeenCalled();
  });

  it('dry run: does not write series books', async () => {
    setupSeriesFollow();
    mockFetchSeriesBooks.mockResolvedValue([{ title: 'Words of Radiance', author: 'Brandon Sanderson' }]);
    await runFollowCron({ dryRun: true });
    expect(mockWriteBookMeta).not.toHaveBeenCalled();
  });

  it('format "both" queries audiobook and ebook', async () => {
    setupSeriesFollow('both');
    mockFetchSeriesBooks.mockResolvedValue([]);
    await runFollowCron();
    expect(mockFetchSeriesBooks).toHaveBeenCalledWith('Stormlight Archive', 'Brandon Sanderson', 'audiobook');
    expect(mockFetchSeriesBooks).toHaveBeenCalledWith('Stormlight Archive', 'Brandon Sanderson', 'ebook');
  });

  it('continues to next series on fetchSeriesBooks error', async () => {
    setupConfig(
      { ebook: [], audiobook: [lib('lib1', libPath)], mixed: [] },
      { authors: [], series: [{ name: 'Failing', format: 'audiobook' }, { name: 'Good Series', format: 'audiobook' }] },
    );
    mockFetchSeriesBooks
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce([{ title: 'Good Book', author: 'Author' }]);
    await runFollowCron();
    expect(mockFetchSeriesBooks).toHaveBeenCalledTimes(2);
    expect(mockWriteBookMeta).toHaveBeenCalledTimes(1);
  });
});

// ── findLibraryPath ───────────────────────────────────────────────────────────

describe('findLibraryPath (via runFollowCron)', () => {
  beforeEach(() => {
    mockSearchMetadata.mockResolvedValue([{ title: 'New Book', author: 'Author' }]);
  });

  it('uses libraryId when provided', async () => {
    setupConfig(
      { ebook: [], audiobook: [lib('lib-specific', '/specific/path')], mixed: [] },
      { authors: [{ name: 'Author', format: 'audiobook', libraryId: 'lib-specific' }], series: [] },
    );
    await runFollowCron();
    expect(mockWriteBookMeta).toHaveBeenCalledWith(
      expect.stringContaining(path.join('/specific/path')), expect.anything(),
    );
  });

  it('falls back to first audiobook lib for format audiobook', async () => {
    setupConfig(
      { ebook: [], audiobook: [lib('a1', '/audiobooks')], mixed: [] },
      { authors: [{ name: 'Author', format: 'audiobook' }], series: [] },
    );
    await runFollowCron();
    expect(mockWriteBookMeta).toHaveBeenCalledWith(
      expect.stringContaining(path.join('/audiobooks')), expect.anything(),
    );
  });

  it('falls back to mixed lib when no audiobook lib exists', async () => {
    setupConfig(
      { ebook: [], audiobook: [], mixed: [lib('m1', '/mixed', 'mixed')] },
      { authors: [{ name: 'Author', format: 'audiobook' }], series: [] },
    );
    await runFollowCron();
    expect(mockWriteBookMeta).toHaveBeenCalledWith(
      expect.stringContaining(path.join('/mixed')), expect.anything(),
    );
  });

  it('returns null and skips when no matching library found', async () => {
    setupConfig(emptyLibrariesConfig(), { authors: [{ name: 'Author', format: 'audiobook' }], series: [] });
    await runFollowCron();
    expect(mockWriteBookMeta).not.toHaveBeenCalled();
  });
});

// ── addToWishlist path construction ──────────────────────────────────────────

describe('addToWishlist path construction (via runFollowCron)', () => {
  beforeEach(() => {
    setupConfig(
      { ebook: [], audiobook: [lib('lib1', '/books')], mixed: [] },
      { authors: [{ name: 'Author', format: 'audiobook' }], series: [] },
    );
  });

  it('builds path: libPath/author/title', async () => {
    mockSearchMetadata.mockResolvedValue([{ title: 'My Book', author: 'My Author' }]);
    await runFollowCron();
    expect(mockWriteBookMeta).toHaveBeenCalledWith(
      path.join('/books', 'My Author', 'My Book'), expect.anything(),
    );
  });

  it('includes series dir when series is present', async () => {
    mockSearchMetadata.mockResolvedValue([{ title: 'Book One', author: 'My Author', series: 'Great Series #1' }]);
    await runFollowCron();
    expect(mockWriteBookMeta).toHaveBeenCalledWith(
      path.join('/books', 'My Author', 'Great Series', 'Book One'), expect.anything(),
    );
  });

  it('strips illegal filesystem chars from title', async () => {
    mockSearchMetadata.mockResolvedValue([{ title: 'Book: The <Story>', author: 'Author' }]);
    await runFollowCron();
    expect(mockWriteBookMeta).toHaveBeenCalledWith(
      path.join('/books', 'Author', 'Book The Story'), expect.anything(),
    );
  });

  it('skips book if title is empty after sanitization', async () => {
    mockSearchMetadata.mockResolvedValue([{ title: ':::/\\', author: 'Author' }]);
    await runFollowCron();
    expect(mockWriteBookMeta).not.toHaveBeenCalled();
  });
});

// ── restartFollowCron ─────────────────────────────────────────────────────────

describe('restartFollowCron', () => {
  afterEach(() => stopFollowCron());

  it('does not start cron when disabled in config', () => {
    setupConfig(
      emptyLibrariesConfig(),
      emptyFollowsConfig(),
      { followCron: { enabled: false, intervalMinutes: 60 } },
    );
    restartFollowCron();
    expect(mockGetConfig).toHaveBeenCalledWith('app');
    expect(mockGetConfig).not.toHaveBeenCalledWith('follows');
  });
});
