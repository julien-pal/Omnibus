import { execFile } from 'child_process';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('child_process');
const mockExecFile = jest.mocked(execFile);

// ── Imports after mocks ───────────────────────────────────────────────────────

import { extractChapters, Chapter } from '../../src/services/chapters';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds a minimal ffprobe JSON response string.
 */
function ffprobeOutput(chapters: Array<{ title?: string; start_time: string; end_time: string }>) {
  return JSON.stringify({
    chapters: chapters.map((c, i) => ({
      id: i,
      time_base: '1/1000',
      start: parseFloat(c.start_time) * 1000,
      end: parseFloat(c.end_time) * 1000,
      start_time: c.start_time,
      end_time: c.end_time,
      tags: c.title ? { title: c.title } : {},
    })),
  });
}

/**
 * Makes the execFile mock resolve successfully with the given stdout.
 */
function resolveWith(stdout: string) {
  mockExecFile.mockImplementation((_cmd: unknown, _args: unknown, callback: unknown) => {
    (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, {
      stdout,
      stderr: '',
    });
    return {} as ReturnType<typeof execFile>;
  });
}

/**
 * Makes the execFile mock reject with an error.
 */
function rejectWith(message: string) {
  mockExecFile.mockImplementation((_cmd: unknown, _args: unknown, callback: unknown) => {
    (callback as (err: Error) => void)(new Error(message));
    return {} as ReturnType<typeof execFile>;
  });
}

// The chapter module caches results per filePath; we need unique paths per test
// to avoid cross-test cache pollution.
let counter = 0;
function uniquePath() {
  return `/audiobooks/test-${++counter}/book.mp3`;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── extractChapters ───────────────────────────────────────────────────────────

describe('extractChapters', () => {
  describe('successful ffprobe output', () => {
    it('returns chapters parsed from ffprobe stdout', async () => {
      resolveWith(
        ffprobeOutput([
          { title: 'Prologue', start_time: '0.000', end_time: '180.500' },
          { title: 'Chapter 1', start_time: '180.500', end_time: '600.000' },
        ]),
      );

      const chapters = await extractChapters(uniquePath());
      expect(chapters).toHaveLength(2);
      expect(chapters[0]).toMatchObject<Chapter>({
        index: 0,
        title: 'Prologue',
        startTime: 0,
        endTime: 180.5,
      });
      expect(chapters[1]).toMatchObject<Chapter>({
        index: 1,
        title: 'Chapter 1',
        startTime: 180.5,
        endTime: 600.0,
      });
    });

    it('uses "Chapter N" as fallback when title tag is absent', async () => {
      resolveWith(
        ffprobeOutput([
          { start_time: '0.000', end_time: '300.000' }, // no title
          { start_time: '300.000', end_time: '700.000' }, // no title
        ]),
      );

      const chapters = await extractChapters(uniquePath());
      expect(chapters[0].title).toBe('Chapter 1');
      expect(chapters[1].title).toBe('Chapter 2');
    });

    it('sets index from array position (0-based)', async () => {
      resolveWith(
        ffprobeOutput([
          { title: 'A', start_time: '0.0', end_time: '60.0' },
          { title: 'B', start_time: '60.0', end_time: '120.0' },
          { title: 'C', start_time: '120.0', end_time: '180.0' },
        ]),
      );

      const chapters = await extractChapters(uniquePath());
      expect(chapters.map((c) => c.index)).toEqual([0, 1, 2]);
    });

    it('parses float start/end times correctly', async () => {
      resolveWith(
        ffprobeOutput([{ title: 'Intro', start_time: '3.14159', end_time: '99.99' }]),
      );

      const chapters = await extractChapters(uniquePath());
      expect(chapters[0].startTime).toBeCloseTo(3.14159);
      expect(chapters[0].endTime).toBeCloseTo(99.99);
    });

    it('returns an empty array when the file has no chapters', async () => {
      resolveWith(JSON.stringify({ chapters: [] }));

      const chapters = await extractChapters(uniquePath());
      expect(chapters).toEqual([]);
    });

    it('calls ffprobe with the correct arguments', async () => {
      resolveWith(JSON.stringify({ chapters: [] }));
      const filePath = uniquePath();

      await extractChapters(filePath);

      expect(mockExecFile).toHaveBeenCalledWith(
        'ffprobe',
        ['-v', 'quiet', '-print_format', 'json', '-show_chapters', filePath],
        expect.any(Function),
      );
    });
  });

  describe('when ffprobe fails', () => {
    it('returns an empty array on execFile error', async () => {
      rejectWith('ffprobe not found');
      const chapters = await extractChapters(uniquePath());
      expect(chapters).toEqual([]);
    });

    it('returns an empty array on malformed JSON output', async () => {
      resolveWith('{ not valid json !!');
      const chapters = await extractChapters(uniquePath());
      expect(chapters).toEqual([]);
    });
  });

  describe('caching', () => {
    it('returns the cached result without calling ffprobe again for the same path', async () => {
      resolveWith(
        ffprobeOutput([{ title: 'Chapter 1', start_time: '0.0', end_time: '300.0' }]),
      );
      const filePath = uniquePath(); // same path for both calls

      const first = await extractChapters(filePath);
      const second = await extractChapters(filePath);

      expect(mockExecFile).toHaveBeenCalledTimes(1);
      expect(second).toBe(first); // same array reference from cache
    });

    it('calls ffprobe for each distinct file path', async () => {
      resolveWith(JSON.stringify({ chapters: [] }));

      await extractChapters(uniquePath());
      await extractChapters(uniquePath());
      await extractChapters(uniquePath());

      expect(mockExecFile).toHaveBeenCalledTimes(3);
    });

    it('caches the empty array result after an error', async () => {
      rejectWith('error');
      const filePath = uniquePath();

      await extractChapters(filePath);
      await extractChapters(filePath);

      expect(mockExecFile).toHaveBeenCalledTimes(1);
    });
  });
});
