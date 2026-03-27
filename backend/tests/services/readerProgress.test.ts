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

// ── Imports after mocks ───────────────────────────────────────────────────────

import { getConfig } from '../../src/config/manager';
import {
  getProgress,
  saveProgress,
  getAllProgress,
  ReaderProgressEntry,
} from '../../src/services/readerProgress';

const mockGetConfig = jest.mocked(getConfig);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FILENAME = 'reader-progress.json';

function makeEntry(overrides: Partial<ReaderProgressEntry> = {}): ReaderProgressEntry {
  return {
    percentage: 0.35,
    updatedAt: 1700000000000,
    ...overrides,
  };
}

function fakeLibrariesConfig(roots: string[]) {
  return roots.reduce<Record<string, Array<{ path: string }>>>(
    (acc, root) => ({ ...acc, ebook: [...(acc.ebook || []), { path: root }] }),
    { ebook: [], audiobook: [], mixed: [] },
  );
}

beforeEach(() => {
  jest.resetAllMocks();
  mockFs.existsSync = jest.fn().mockReturnValue(false);
  mockFs.mkdirSync = jest.fn();
  mockFs.writeFileSync = jest.fn();
  mockFs.readFileSync = jest.fn();
  mockFs.readdirSync = jest.fn().mockReturnValue([]);
  mockGetConfig.mockReturnValue({ ebook: [], audiobook: [], mixed: [] } as any);
});

// ── getProgress ───────────────────────────────────────────────────────────────

describe('getProgress', () => {
  const bookPath = '/ebooks/Terry Pratchett/Guards Guards';

  it('reads progress from the book directory file', () => {
    const entry = makeEntry({ cfi: 'epubcfi(/6/4[chap01ref]!/4/2/1:0)', percentage: 0.12 });
    (mockFs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(entry));

    const result = getProgress(bookPath);
    expect(result).toEqual(entry);
    expect(mockFs.readFileSync).toHaveBeenCalledWith(
      path.join(bookPath, FILENAME),
      'utf-8',
    );
  });

  it('returns null when neither the book file nor the legacy store contain an entry', () => {
    (mockFs.readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const result = getProgress(bookPath);
    expect(result).toBeNull();
  });

  it('falls back to the legacy centralized store when book-level file is missing', () => {
    const entry = makeEntry({ page: 42, percentage: 0.22 });
    const bookFile = path.join(bookPath, FILENAME);
    (mockFs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
      if (filePath === bookFile) {
        throw new Error('ENOENT');
      }
      return JSON.stringify({ [bookPath]: entry });
    });

    const result = getProgress(bookPath);
    expect(result).toEqual(entry);
  });

  it('returns null when the book is absent from the legacy store', () => {
    const bookFile = path.join(bookPath, FILENAME);
    (mockFs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
      if (filePath === bookFile) {
        throw new Error('ENOENT');
      }
      return JSON.stringify({}); // empty legacy store
    });

    const result = getProgress(bookPath);
    expect(result).toBeNull();
  });

  it('reads CFI-based epub progress', () => {
    const entry = makeEntry({
      cfi: 'epubcfi(/6/4[chap01ref]!/4/2/1:0)',
      chapterTitle: 'Chapter 1',
      snippet: 'It was a dark and stormy night',
      percentage: 0.05,
      completed: false,
    });
    (mockFs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(entry));

    const result = getProgress(bookPath);
    expect(result?.cfi).toBe('epubcfi(/6/4[chap01ref]!/4/2/1:0)');
    expect(result?.percentage).toBe(0.05);
  });

  it('reads PDF page-based progress', () => {
    const entry = makeEntry({ page: 77, percentage: 0.5 });
    (mockFs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(entry));

    const result = getProgress(bookPath);
    expect(result?.page).toBe(77);
  });
});

// ── saveProgress ──────────────────────────────────────────────────────────────

describe('saveProgress', () => {
  const bookPath = '/ebooks/Terry Pratchett/Guards Guards';

  it('writes the entry as pretty JSON to the book directory', () => {
    const entry = makeEntry();
    saveProgress(bookPath, entry);

    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      path.join(bookPath, FILENAME),
      JSON.stringify(entry, null, 2),
    );
  });

  it('writes completed progress with percentage=1', () => {
    const entry = makeEntry({ percentage: 1, completed: true });
    saveProgress(bookPath, entry);

    const written = JSON.parse(
      (mockFs.writeFileSync as jest.Mock).mock.calls[0][1],
    ) as ReaderProgressEntry;
    expect(written.completed).toBe(true);
    expect(written.percentage).toBe(1);
  });

  it('writes an entry with snippet for sync popup', () => {
    const entry = makeEntry({ snippet: 'Some paragraph text', percentage: 0.6 });
    saveProgress(bookPath, entry);

    const written = JSON.parse(
      (mockFs.writeFileSync as jest.Mock).mock.calls[0][1],
    ) as ReaderProgressEntry;
    expect(written.snippet).toBe('Some paragraph text');
  });
});

// ── getAllProgress ────────────────────────────────────────────────────────────

describe('getAllProgress', () => {
  // Use fake timers so we can advance time past the 5-minute module-level TTL
  // cache between tests.
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());
  beforeEach(() => {
    jest.advanceTimersByTime(6 * 60 * 1000);
  });

  it('returns an empty object when no libraries are configured', () => {
    mockGetConfig.mockReturnValue({ ebook: [], audiobook: [], mixed: [] } as any);
    const result = getAllProgress();
    expect(result).toEqual({});
  });

  it('collects progress files from ebook library roots', () => {
    const root = path.join(path.sep, 'ebooks');
    const bookPath = path.join(root, 'Author', 'Novel');
    const entry = makeEntry({ cfi: 'epubcfi(/6/2)', percentage: 0.3 });

    mockGetConfig.mockReturnValue(fakeLibrariesConfig([root]) as any);

    (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string, _opts: unknown) => {
      if (dir === root)
        return [{ name: 'Author', isFile: () => false, isDirectory: () => true }] as any;
      if (dir === path.join(root, 'Author'))
        return [{ name: 'Novel', isFile: () => false, isDirectory: () => true }] as any;
      if (dir === bookPath)
        return [{ name: FILENAME, isFile: () => true, isDirectory: () => false }] as any;
      return [] as any;
    });

    (mockFs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
      if (filePath === path.join(bookPath, FILENAME)) return JSON.stringify(entry);
      throw new Error('ENOENT');
    });

    const result = getAllProgress();
    expect(result[bookPath]).toEqual(entry);
  });

  it('uses the TTL cache on repeated calls', () => {
    mockGetConfig.mockReturnValue({ ebook: [], audiobook: [], mixed: [] } as any);

    getAllProgress(); // populates cache
    getAllProgress(); // cache hit
    getAllProgress(); // cache hit

    // getConfig should only be called once (first call populates cache)
    expect(mockGetConfig).toHaveBeenCalledTimes(1);
  });

  it('skips entries it cannot parse', () => {
    const root = path.join(path.sep, 'ebooks');
    const bookPath = path.join(root, 'Author', 'Broken');

    mockGetConfig.mockReturnValue(fakeLibrariesConfig([root]) as any);

    (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string, _opts: unknown) => {
      if (dir === root)
        return [{ name: 'Author', isFile: () => false, isDirectory: () => true }] as any;
      if (dir === path.join(root, 'Author'))
        return [{ name: 'Broken', isFile: () => false, isDirectory: () => true }] as any;
      if (dir === bookPath)
        return [{ name: FILENAME, isFile: () => true, isDirectory: () => false }] as any;
      return [] as any;
    });

    (mockFs.readFileSync as jest.Mock).mockImplementation(() => '{ invalid json }');

    const result = getAllProgress();
    expect(result[bookPath]).toBeUndefined();
  });

  it('merges results from multiple library roots', () => {
    const root1 = path.join(path.sep, 'ebooks1');
    const root2 = path.join(path.sep, 'ebooks2');
    const bookPath1 = path.join(root1, 'Author', 'Book1');
    const bookPath2 = path.join(root2, 'Author', 'Book2');
    const entry1 = makeEntry({ percentage: 0.1 });
    const entry2 = makeEntry({ percentage: 0.9 });

    mockGetConfig.mockReturnValue({
      ebook: [{ path: root1 }, { path: root2 }],
      audiobook: [],
      mixed: [],
    } as any);

    (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string, _opts: unknown) => {
      if (dir === root1)
        return [{ name: 'Author', isFile: () => false, isDirectory: () => true }] as any;
      if (dir === path.join(root1, 'Author'))
        return [{ name: 'Book1', isFile: () => false, isDirectory: () => true }] as any;
      if (dir === bookPath1)
        return [{ name: FILENAME, isFile: () => true, isDirectory: () => false }] as any;

      if (dir === root2)
        return [{ name: 'Author', isFile: () => false, isDirectory: () => true }] as any;
      if (dir === path.join(root2, 'Author'))
        return [{ name: 'Book2', isFile: () => false, isDirectory: () => true }] as any;
      if (dir === bookPath2)
        return [{ name: FILENAME, isFile: () => true, isDirectory: () => false }] as any;

      return [] as any;
    });

    (mockFs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
      if (filePath === path.join(bookPath1, FILENAME)) return JSON.stringify(entry1);
      if (filePath === path.join(bookPath2, FILENAME)) return JSON.stringify(entry2);
      throw new Error('ENOENT');
    });

    const result = getAllProgress();
    expect(result[bookPath1]).toEqual(entry1);
    expect(result[bookPath2]).toEqual(entry2);
  });
});
