import {
  extractSeries,
  detectBookType,
  mergeBooksByTitle,
  buildSeriesGroups,
} from '../../src/lib/libraryUtils';
import { ScannerBook, ScannerFile } from '../../src/types';

const file = (ext: string, name: string): ScannerFile => ({
  ext,
  name,
  path: `/${name}`,
  size: 0,
  sizeFormatted: '0 B',
});

const book = (overrides: Partial<ScannerBook> = {}): ScannerBook => ({
  title: 'Test Book',
  path: '/books/b1',
  files: [],
  cover: null,
  ...overrides,
} as ScannerBook);

describe('extractSeries', () => {
  it('returns book.series when set', () => {
    expect(extractSeries(book({ series: 'Dune Chronicles' }))).toBe('Dune Chronicles');
  });

  it('returns book.series as-is when it includes a numeric suffix', () => {
    expect(extractSeries(book({ series: 'Alpha #1' }))).toBe('Alpha #1');
  });

  it('extracts series from title pattern "(Series, #1)"', () => {
    expect(extractSeries(book({ title: 'The Hobbit (Middle-earth, #1)' }))).toBe('Middle-earth');
  });

  it('extracts series from "Series #1 — Subtitle" pattern', () => {
    expect(extractSeries(book({ title: 'Foundation #1 — The Beginning' }))).toBe('Foundation');
  });

  it('returns null when no series is found', () => {
    expect(extractSeries(book({ title: 'A standalone book' }))).toBeNull();
  });
});

describe('detectBookType', () => {
  describe('via ebookFiles / audiobookFiles fields', () => {
    it('returns ebook when only ebookFiles are present', () => {
      expect(detectBookType(book({ ebookFiles: [file('epub', 'a.epub')], audiobookFiles: [] }))).toBe('ebook');
    });

    it('returns audiobook when only audiobookFiles are present', () => {
      expect(detectBookType(book({ ebookFiles: [], audiobookFiles: [file('mp3', 'a.mp3')] }))).toBe('audiobook');
    });

    it('returns mixed when both are present', () => {
      expect(detectBookType(book({ ebookFiles: [file('epub', 'a.epub')], audiobookFiles: [file('mp3', 'a.mp3')] }))).toBe('mixed');
    });
  });

  describe('via files extension fallback', () => {
    it('returns ebook for epub file', () => {
      expect(detectBookType(book({ files: [file('epub', 'a.epub')] }))).toBe('ebook');
    });

    it('returns audiobook for mp3 file', () => {
      expect(detectBookType(book({ files: [file('mp3', 'a.mp3')] }))).toBe('audiobook');
    });

    it('returns mixed when both epub and mp3 present', () => {
      expect(
        detectBookType(
          book({
            files: [file('epub', 'a.epub'), file('mp3', 'a.mp3')],
          }),
        ),
      ).toBe('mixed');
    });

    it('returns null when no relevant extensions', () => {
      expect(detectBookType(book({ files: [file('txt', 'a.txt')] }))).toBeNull();
    });
  });
});

describe('mergeBooksByTitle', () => {
  it('returns a single book as-is with correct flags', () => {
    const b = book({ title: 'Dune', files: [file('epub', 'dune.epub')] });
    const result = mergeBooksByTitle([b]);
    expect(result).toHaveLength(1);
    expect(result[0]._ebookPresent).toBe(true);
    expect(result[0]._audioPresent).toBe(false);
  });

  it('deduplicates books with the same title (case-insensitive)', () => {
    const b1 = book({ title: 'Dune', files: [file('epub', 'a.epub')] });
    const b2 = book({ title: 'dune', files: [file('mp3', 'a.mp3')] });
    const result = mergeBooksByTitle([b1, b2]);
    expect(result).toHaveLength(1);
    expect(result[0]._ebookPresent).toBe(true);
    expect(result[0]._audioPresent).toBe(true);
  });

  it('keeps same title with different series as separate entries', () => {
    const b1 = book({ title: 'The Will of the Many', series: 'Hiérarchie #1', files: [file('mp3', 'a.mp3')] });
    const b2 = book({ title: 'The Will of the Many', series: 'Hierarchy #1', files: [file('mp3', 'b.mp3')] });
    const result = mergeBooksByTitle([b1, b2]);
    expect(result).toHaveLength(2);
  });

  it('merges wishlist flags with real book', () => {
    const wishlist = book({
      title: 'Dune',
      wishlist: true,
      savedMeta: { wishlistFormat: 'ebook' },
    });
    const real = book({
      title: 'Dune',
      files: [file('mp3', 'a.mp3')],
    });
    const result = mergeBooksByTitle([wishlist, real]);
    expect(result).toHaveLength(1);
    expect(result[0]._audioPresent).toBe(true);
    expect(result[0]._ebookWish).toBe(true);
  });

  it('merges real book flags into wishlist-only base when real book comes second', () => {
    const wishlist = book({ title: 'Dune', wishlist: true, savedMeta: { wishlistFormat: 'audiobook' } });
    const real = book({ title: 'Dune', files: [file('epub', 'a.epub')] });
    const result = mergeBooksByTitle([wishlist, real]);
    expect(result).toHaveLength(1);
    expect(result[0]._ebookPresent).toBe(true);
    expect(result[0]._audioWish).toBe(true);
  });
});

describe('buildSeriesGroups', () => {
  it('groups books by series', () => {
    const b1 = book({ title: 'Book A', series: 'Alpha #1' });
    const b2 = book({ title: 'Book B', series: 'Alpha #2' });
    const b3 = book({ title: 'Standalone' });

    const { series, ungrouped } = buildSeriesGroups([b1, b2, b3] as any);
    expect(series).toHaveLength(1);
    expect(series[0].name).toBe('Alpha');
    expect(series[0].books).toHaveLength(2);
    expect(ungrouped).toHaveLength(1);
  });

  it('sorts books within a group by numeric series index', () => {
    const b1 = book({ title: 'Third', series: 'Alpha #3' });
    const b2 = book({ title: 'First', series: 'Alpha #1' });
    const b3 = book({ title: 'Second', series: 'Alpha #2' });
    const { series } = buildSeriesGroups([b1, b2, b3] as any);
    expect(series[0].books.map((b) => b.title)).toEqual(['First', 'Second', 'Third']);
  });

  it('sorts series groups alphabetically (ASCII names)', () => {
    const bA = book({ title: 'A', series: 'Beta #1' });
    const bB = book({ title: 'B', series: 'Alpha #1' });
    const { series } = buildSeriesGroups([bA, bB] as any);
    expect(series.map((s) => s.name)).toEqual(['Alpha', 'Beta']);
  });

  it('places books without series in ungrouped', () => {
    const b = book({ title: 'Solo', series: undefined });
    const { series, ungrouped } = buildSeriesGroups([b] as any);
    expect(series).toHaveLength(0);
    expect(ungrouped).toHaveLength(1);
  });
});
