import fs from 'fs';
import { flattenTranscriptWords, lookupSyncMap, AudioTranscript } from '../../src/services/syncCompute';

jest.mock('fs');
const mockFs = jest.mocked(fs);

// Silence logger output during tests
jest.mock('../../src/lib/logger', () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const makeTranscript = (overrides: Partial<AudioTranscript> = {}): AudioTranscript => ({
  bookPath: '/books/test',
  builtAt: 0,
  totalDuration: 100,
  complete: true,
  files: {},
  ...overrides,
});

beforeEach(() => {
  jest.resetAllMocks();
});

describe('flattenTranscriptWords', () => {
  it('returns empty array when files is empty', () => {
    const t = makeTranscript({ files: {} });
    expect(flattenTranscriptWords(t)).toEqual([]);
  });

  it('returns words from a single file sorted by globalStart', () => {
    const t = makeTranscript({
      files: {
        'a.mp3': [
          { text: 'world', start: 1, end: 2, globalStart: 10 },
          { text: 'hello', start: 0, end: 1, globalStart: 0 },
        ],
      },
    });
    const result = flattenTranscriptWords(t);
    expect(result.map((w) => w.text)).toEqual(['hello', 'world']);
  });

  it('merges and sorts words across multiple files by globalStart', () => {
    const t = makeTranscript({
      files: {
        'b.mp3': [{ text: 'second', start: 0, end: 1, globalStart: 5 }],
        'a.mp3': [{ text: 'first', start: 0, end: 1, globalStart: 0 }],
      },
    });
    const result = flattenTranscriptWords(t);
    expect(result.map((w) => w.text)).toEqual(['first', 'second']);
  });
});

describe('lookupSyncMap', () => {

  describe('when loadTranscript returns null (no transcript file)', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(false);
    });

    it('returns the input value with low confidence (audio-to-ebook)', () => {
      const result = lookupSyncMap('/books/test', 'audio-to-ebook', 0.5);
      expect(result).toEqual({ percentage: 0.5, confidence: 'low' });
    });

    it('returns the input value with low confidence (ebook-to-audio)', () => {
      const result = lookupSyncMap('/books/test', 'ebook-to-audio', 0.3);
      expect(result).toEqual({ percentage: 0.3, confidence: 'low' });
    });
  });

  describe('when transcript exists with empty syncMap', () => {
    beforeEach(() => {
      const t = makeTranscript({ syncMap: [] });
      mockFs.existsSync.mockReturnValue(true);
      (mockFs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(t));
    });

    it('returns the input value with low confidence', () => {
      const result = lookupSyncMap('/books/test', 'audio-to-ebook', 0.4);
      expect(result).toEqual({ percentage: 0.4, confidence: 'low' });
    });
  });

  describe('audio-to-ebook interpolation', () => {
    const syncMap = [
      { audioSeconds: 0, ebookPct: 0, score: 0.9, spineHref: 'ch1.html' },
      { audioSeconds: 50, ebookPct: 0.5, score: 0.9, spineHref: 'ch2.html' },
      { audioSeconds: 100, ebookPct: 1.0, score: 0.8, spineHref: 'ch3.html' },
    ];

    beforeEach(() => {
      const t = makeTranscript({ totalDuration: 100, syncMap });
      mockFs.existsSync.mockReturnValue(true);
      (mockFs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(t));
    });

    it('returns exact entry when value matches an audioSeconds', () => {
      // value=0.5 → targetSeconds=50 → exact match on entry[1]
      const result = lookupSyncMap('/books/test', 'audio-to-ebook', 0.5);
      expect(result.percentage).toBe(0.5);
      expect(result.spineHref).toBe('ch2.html');
      expect(result.confidence).toBe('high');
    });

    it('interpolates between two entries', () => {
      // value=0.25 → targetSeconds=25 → between entry[0] and entry[1]
      const result = lookupSyncMap('/books/test', 'audio-to-ebook', 0.25);
      expect(result.percentage).toBeCloseTo(0.25, 5);
      expect(result.confidence).toBe('high');
    });

    it('returns low confidence when score < 0.7', () => {
      const lowScoreMap = [
        { audioSeconds: 0, ebookPct: 0, score: 0.5 },
        { audioSeconds: 100, ebookPct: 1, score: 0.5 },
      ];
      const t = makeTranscript({ totalDuration: 100, syncMap: lowScoreMap });
      (mockFs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(t));
      const result = lookupSyncMap('/books/test', 'audio-to-ebook', 0.5);
      expect(result.confidence).toBe('low');
    });
  });

  describe('ebook-to-audio interpolation', () => {
    const syncMap = [
      { audioSeconds: 0, ebookPct: 0, score: 0.9 },
      { audioSeconds: 60, ebookPct: 0.6, score: 0.9 },
      { audioSeconds: 100, ebookPct: 1.0, score: 0.9 },
    ];

    beforeEach(() => {
      const t = makeTranscript({
        totalDuration: 100,
        syncMap,
        files: {
          'ch1.mp3': [{ text: 'a', start: 0, end: 1, globalStart: 0 }],
          'ch2.mp3': [{ text: 'b', start: 0, end: 1, globalStart: 60 }],
        },
      });
      mockFs.existsSync.mockReturnValue(true);
      (mockFs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(t));
    });

    it('returns interpolated audioSeconds for ebook position', () => {
      // ebookPct=0.3 → between entry[0] (pct=0) and entry[1] (pct=0.6)
      // t = 0.3/0.6 = 0.5 → audioSeconds = 0 + 0.5 * 60 = 30
      const result = lookupSyncMap('/books/test', 'ebook-to-audio', 0.3);
      expect(result.audioSeconds).toBeCloseTo(30, 1);
      expect(result.fileIndex).toBe(0); // 30s < 60s → file 0
      expect(result.fileSeconds).toBeCloseTo(30, 1);
    });
  });
});
