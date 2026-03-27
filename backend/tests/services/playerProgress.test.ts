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
import { getProgress, saveProgress, getAllProgress, ProgressEntry } from '../../src/services/playerProgress';

const mockGetConfig = jest.mocked(getConfig);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FILENAME = 'player-progress.json';

function makeEntry(overrides: Partial<ProgressEntry> = {}): ProgressEntry {
  return {
    position: 120,
    fileIndex: 0,
    percentage: 0.42,
    updatedAt: 1700000000000,
    ...overrides,
  };
}

function fakeLibrariesConfig(roots: string[]) {
  return roots.reduce<Record<string, Array<{ path: string }>>>(
    (acc, root) => ({ ...acc, audiobook: [...(acc.audiobook || []), { path: root }] }),
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
  const bookPath = '/library/Brandon Sanderson/Mistborn';

  it('reads progress from the book directory file', () => {
    const entry = makeEntry({ position: 60, percentage: 0.1 });
    (mockFs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(entry));

    const result = getProgress(bookPath);
    expect(result).toEqual(entry);
    expect(mockFs.readFileSync).toHaveBeenCalledWith(
      path.join(bookPath, FILENAME),
      'utf-8',
    );
  });

  it('returns null when neither the book file nor the legacy store exist', () => {
    (mockFs.readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const result = getProgress(bookPath);
    expect(result).toBeNull();
  });

  it('falls back to the legacy centralized store', () => {
    const entry = makeEntry({ position: 999 });
    const bookFile = path.join(bookPath, FILENAME);
    (mockFs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
      if (filePath === bookFile) {
        throw new Error('ENOENT'); // book-level file missing
      }
      // legacy store
      return JSON.stringify({ [bookPath]: entry });
    });

    const result = getProgress(bookPath);
    expect(result).toEqual(entry);
  });

  it('returns null when the book is not in the legacy store', () => {
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
});

// ── saveProgress ──────────────────────────────────────────────────────────────

describe('saveProgress', () => {
  const bookPath = '/library/Brandon Sanderson/Mistborn';

  it('writes the entry as pretty JSON to the book directory', () => {
    const entry = makeEntry();
    saveProgress(bookPath, entry);

    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      path.join(bookPath, FILENAME),
      JSON.stringify(entry, null, 2),
    );
  });

  it('accepts an entry with optional fields', () => {
    const entry = makeEntry({
      chapterTitle: 'Chapter 1',
      snippet: 'Some text here',
      completed: false,
    });
    saveProgress(bookPath, entry);

    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      path.join(bookPath, FILENAME),
      JSON.stringify(entry, null, 2),
    );
  });
});

// ── getAllProgress ────────────────────────────────────────────────────────────

describe('getAllProgress', () => {
  // Use fake timers so we can advance time past the 5-minute module-level TTL
  // cache between tests (the cache variable lives in the module, not in the test).
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());
  beforeEach(() => {
    // Advance past TTL (5 min) so each test starts with a stale cache.
    jest.advanceTimersByTime(6 * 60 * 1000);
  });

  it('returns an empty object when no libraries are configured', () => {
    mockGetConfig.mockReturnValue({ ebook: [], audiobook: [], mixed: [] } as any);
    const result = getAllProgress();
    expect(result).toEqual({});
  });

  it('collects progress files from library roots', () => {
    // Use path.join so paths match the OS-native separators used by the module.
    const root = path.join(path.sep, 'library');
    const bookPath = path.join(root, 'Author', 'Book');
    const entry = makeEntry({ position: 42 });

    mockGetConfig.mockReturnValue(fakeLibrariesConfig([root]) as any);

    (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string, _opts: unknown) => {
      if (dir === root)
        return [{ name: 'Author', isFile: () => false, isDirectory: () => true }] as any;
      if (dir === path.join(root, 'Author'))
        return [{ name: 'Book', isFile: () => false, isDirectory: () => true }] as any;
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

    getAllProgress(); // populates the cache
    getAllProgress(); // cache hit
    getAllProgress(); // cache hit

    // getConfig should only be called once (the first call, subsequent ones use cache)
    expect(mockGetConfig).toHaveBeenCalledTimes(1);
  });

  it('skips files it cannot parse', () => {
    const root = path.join(path.sep, 'library');
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
});
