import fs from 'fs';
import path from 'path';
import axios from 'axios';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('axios');
const mockAxios = jest.mocked(axios);

jest.mock('fs');
const mockFs = jest.mocked(fs);

jest.mock('../../src/lib/logger', () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import {
  fetchSeriesBooks,
  search,
  writeBookMeta,
  readBookMeta,
  enrich,
} from '../../src/services/metadata';

// ── Helpers ───────────────────────────────────────────────────────────────────

function axiosGet(data: unknown) {
  return mockAxios.get.mockResolvedValueOnce({ data });
}

function axiosGetFail(err: Error = new Error('Network error')) {
  return mockAxios.get.mockRejectedValueOnce(err);
}

function makeAudibleProduct(overrides: Record<string, unknown> = {}) {
  return {
    asin: 'B001',
    title: 'The Final Empire',
    authors: [{ name: 'Brandon Sanderson' }],
    narrators: [{ name: 'Michael Kramer' }],
    series: [{ title: 'Mistborn', sequence: '1' }],
    release_date: '2006-07-17',
    product_images: { '500': 'https://m.media-amazon.com/images/I/img.jpg' },
    merchandising_summary: '<p>An epic fantasy.</p>',
    runtime_length_min: 600,
    ...overrides,
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  mockFs.existsSync = jest.fn().mockReturnValue(false);
  mockFs.readFileSync = jest.fn();
  mockFs.writeFileSync = jest.fn();
  mockFs.mkdirSync = jest.fn();
});

// ── fetchSeriesBooks (audiobook) ──────────────────────────────────────────────

describe('fetchSeriesBooks — audiobook', () => {
  it('returns books filtered to the exact series title', async () => {
    axiosGet({
      products: [
        makeAudibleProduct({ asin: 'B001', series: [{ title: 'Mistborn', sequence: '1' }] }),
        makeAudibleProduct({
          asin: 'B002',
          title: 'The Well of Ascension',
          series: [{ title: 'Mistborn', sequence: '2' }],
        }),
        makeAudibleProduct({
          asin: 'B003',
          title: 'Other Book',
          series: [{ title: 'Other Series', sequence: '1' }],
        }),
      ],
    });

    const results = await fetchSeriesBooks('Mistborn', 'Brandon Sanderson', 'audiobook');
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.asin)).toEqual(['B001', 'B002']);
  });

  it('sorts books by series sequence', async () => {
    axiosGet({
      products: [
        makeAudibleProduct({ asin: 'B003', series: [{ title: 'Mistborn', sequence: '3' }] }),
        makeAudibleProduct({ asin: 'B001', series: [{ title: 'Mistborn', sequence: '1' }] }),
        makeAudibleProduct({ asin: 'B002', series: [{ title: 'Mistborn', sequence: '2' }] }),
      ],
    });

    const results = await fetchSeriesBooks('Mistborn', undefined, 'audiobook');
    expect(results.map((r) => r.asin)).toEqual(['B001', 'B002', 'B003']);
  });

  it('filters out books without a sequence number', async () => {
    axiosGet({
      products: [
        makeAudibleProduct({ asin: 'B001', series: [{ title: 'Mistborn', sequence: '1' }] }),
        makeAudibleProduct({ asin: 'B999', series: [{ title: 'Mistborn', sequence: '' }] }),
      ],
    });

    const results = await fetchSeriesBooks('Mistborn', undefined, 'audiobook');
    expect(results.map((r) => r.asin)).toEqual(['B001']);
  });

  it('returns [] on network failure', async () => {
    axiosGetFail();
    const results = await fetchSeriesBooks('Mistborn', undefined, 'audiobook');
    expect(results).toEqual([]);
  });

  it('returns [] when the response has no products', async () => {
    axiosGet({ products: [] });
    const results = await fetchSeriesBooks('Mistborn', undefined, 'audiobook');
    expect(results).toEqual([]);
  });

  it('sets source to "audible"', async () => {
    axiosGet({ products: [makeAudibleProduct()] });
    const results = await fetchSeriesBooks('Mistborn', undefined, 'audiobook');
    expect(results[0].source).toBe('audible');
  });

  it('maps runtime_length_min to formatted string', async () => {
    axiosGet({ products: [makeAudibleProduct({ runtime_length_min: 125 })] });
    const results = await fetchSeriesBooks('Mistborn', undefined, 'audiobook');
    expect(results[0].runtime).toBe('2h5m');
  });

  it('strips HTML from the description', async () => {
    axiosGet({
      products: [
        makeAudibleProduct({ merchandising_summary: '<p>Great <b>book</b>!</p>' }),
      ],
    });
    const results = await fetchSeriesBooks('Mistborn', undefined, 'audiobook');
    expect(results[0].description).toBe('Great book!');
  });

  it('builds series string as "Title #Sequence"', async () => {
    axiosGet({ products: [makeAudibleProduct()] });
    const results = await fetchSeriesBooks('Mistborn', undefined, 'audiobook');
    expect(results[0].series).toBe('Mistborn #1');
  });
});

// ── fetchSeriesBooks (ebook / OpenLibrary) ────────────────────────────────────

describe('fetchSeriesBooks — ebook', () => {
  it('returns ebook results from OpenLibrary matching the series name', async () => {
    axiosGet({
      docs: [
        {
          title: 'The Final Empire',
          author_name: ['Brandon Sanderson'],
          series: ['Mistborn'],
          cover_i: 123,
          first_publish_year: 2006,
          isbn: ['9780765311788'],
        },
      ],
    });

    const results = await fetchSeriesBooks('Mistborn', 'Brandon Sanderson', 'ebook');
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('openlibrary');
  });

  it('returns [] on OpenLibrary failure', async () => {
    axiosGetFail();
    const results = await fetchSeriesBooks('Mistborn', undefined, 'ebook');
    expect(results).toEqual([]);
  });
});

// ── writeBookMeta ─────────────────────────────────────────────────────────────

describe('writeBookMeta', () => {
  const bookPath = '/library/Brandon Sanderson/Mistborn';

  it('writes metadata.json to the book directory', () => {
    writeBookMeta(bookPath, { title: 'The Final Empire', author: 'Brandon Sanderson' });
    expect(mockFs.writeFileSync).toHaveBeenCalledWith(
      path.join(bookPath, 'metadata.json'),
      expect.any(String),
      'utf8',
    );
  });

  it('splits "Series #N" into series + seriesSequence fields', () => {
    writeBookMeta(bookPath, { series: 'Mistborn #1' });
    const written = JSON.parse((mockFs.writeFileSync as jest.Mock).mock.calls[0][1] as string);
    expect(written.series).toBe('Mistborn');
    expect(written.seriesSequence).toBe('1');
  });

  it('handles decimal sequence numbers', () => {
    writeBookMeta(bookPath, { series: 'Stormlight #2.5' });
    const written = JSON.parse((mockFs.writeFileSync as jest.Mock).mock.calls[0][1] as string);
    expect(written.series).toBe('Stormlight');
    expect(written.seriesSequence).toBe('2.5');
  });

  it('keeps series without a sequence number intact', () => {
    writeBookMeta(bookPath, { series: 'Standalone Series' });
    const written = JSON.parse((mockFs.writeFileSync as jest.Mock).mock.calls[0][1] as string);
    expect(written.series).toBe('Standalone Series');
    expect(written.seriesSequence).toBe('');
  });

  it('includes wishlist flag when provided', () => {
    writeBookMeta(bookPath, { wishlist: true, wishlistFormat: 'audiobook' as any });
    const written = JSON.parse((mockFs.writeFileSync as jest.Mock).mock.calls[0][1] as string);
    expect(written.wishlist).toBe(true);
    expect(written.wishlistFormat).toBe('audiobook');
  });

  it('includes readLater flag when provided', () => {
    writeBookMeta(bookPath, { readLater: true });
    const written = JSON.parse((mockFs.writeFileSync as jest.Mock).mock.calls[0][1] as string);
    expect(written.readLater).toBe(true);
  });

  it('returns the input data with a savedAt timestamp', () => {
    const result = writeBookMeta(bookPath, { title: 'Test' });
    expect(result.savedAt).toBeDefined();
    expect(typeof result.savedAt).toBe('string');
  });

  it('normalises empty strings for optional fields', () => {
    writeBookMeta(bookPath, {});
    const written = JSON.parse((mockFs.writeFileSync as jest.Mock).mock.calls[0][1] as string);
    expect(written.title).toBe('');
    expect(written.author).toBe('');
    expect(written.narrator).toBe('');
    expect(written.description).toBe('');
  });
});

// ── readBookMeta ──────────────────────────────────────────────────────────────

describe('readBookMeta', () => {
  const bookPath = '/library/Author/Book';

  it('returns null when metadata.json does not exist', () => {
    mockFs.existsSync = jest.fn().mockReturnValue(false);
    expect(readBookMeta(bookPath)).toBeNull();
  });

  it('reads and returns metadata when the file exists', () => {
    mockFs.existsSync = jest.fn().mockReturnValue(true);
    const raw = {
      title: 'The Final Empire',
      author: 'Brandon Sanderson',
      series: 'Mistborn',
      seriesSequence: '1',
      publishedYear: '2006',
    };
    (mockFs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(raw));

    const result = readBookMeta(bookPath);
    expect(result?.title).toBe('The Final Empire');
    expect(result?.author).toBe('Brandon Sanderson');
  });

  it('normalises series string with sequence', () => {
    mockFs.existsSync = jest.fn().mockReturnValue(true);
    (mockFs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({ series: 'Mistborn', seriesSequence: '1' }),
    );
    const result = readBookMeta(bookPath);
    expect(result?.series).toBe('Mistborn');
    expect(result?.seriesSequence).toBe('1');
  });

  it('reads series from an array of objects', () => {
    mockFs.existsSync = jest.fn().mockReturnValue(true);
    (mockFs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({ series: [{ name: 'Wheel of Time', sequence: '1' }] }),
    );
    const result = readBookMeta(bookPath);
    expect(result?.series).toBe('Wheel of Time');
    expect(result?.seriesSequence).toBe('1');
  });

  it('reads first author from an authors array', () => {
    mockFs.existsSync = jest.fn().mockReturnValue(true);
    (mockFs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({ authors: ['Brandon Sanderson', 'Robert Jordan'] }),
    );
    const result = readBookMeta(bookPath);
    expect(result?.author).toBe('Brandon Sanderson');
  });

  it('joins narrators array with comma', () => {
    mockFs.existsSync = jest.fn().mockReturnValue(true);
    (mockFs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({ narrators: ['Alice', 'Bob'] }),
    );
    const result = readBookMeta(bookPath);
    expect(result?.narrator).toBe('Alice, Bob');
  });

  it('returns null on malformed JSON', () => {
    mockFs.existsSync = jest.fn().mockReturnValue(true);
    (mockFs.readFileSync as jest.Mock).mockReturnValue('{ bad json !!');
    expect(readBookMeta(bookPath)).toBeNull();
  });

  it('uses publishedYear as fallback for year field', () => {
    mockFs.existsSync = jest.fn().mockReturnValue(true);
    (mockFs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({ publishedYear: '2001' }),
    );
    const result = readBookMeta(bookPath);
    // readBookMeta uses parseInt(publishedYear, 10) which returns a number
    expect(result?.year).toBe(2001);
  });
});

// ── search ────────────────────────────────────────────────────────────────────

describe('search', () => {
  it('returns results from both Audible locales and deduplicates by asin', async () => {
    const product = makeAudibleProduct({ asin: 'B001' });
    // Both FR and EN return the same ASIN — dedup should keep only one
    mockAxios.get.mockResolvedValue({ data: { products: [product] } });

    const results = await search('The Final Empire', 'Brandon Sanderson', 'audiobook');
    const asins = results.map((r) => r.asin);
    const uniqueAsins = [...new Set(asins)];
    expect(asins.length).toBe(uniqueAsins.length);
  });

  it('returns ebook results when type is "ebook"', async () => {
    const openLibraryResponse = {
      docs: [
        {
          title: 'The Final Empire',
          author_name: ['Brandon Sanderson'],
          cover_i: 999,
          first_publish_year: 2006,
          isbn: [],
          series: ['Mistborn'],
        },
      ],
    };
    mockAxios.get.mockResolvedValue({ data: openLibraryResponse });

    const results = await search('The Final Empire', 'Brandon Sanderson', 'ebook');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].source).toMatch(/openlibrary|audible/);
  });

  it('returns [] gracefully when all providers fail', async () => {
    mockAxios.get.mockRejectedValue(new Error('all down'));

    const results = await search('Some Book', undefined, 'audiobook');
    expect(results).toEqual([]);
  }, 30000);

  it('routes to OpenLibrary when provider="openlibrary"', async () => {
    axiosGet({ docs: [] });
    await search('Test', undefined, 'ebook', 'openlibrary');
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('openlibrary.org'),
      expect.anything(),
    );
  });

  it('routes to Google Books when provider="googlebooks"', async () => {
    axiosGet({ items: [] });
    await search('Test', undefined, 'ebook', 'googlebooks');
    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('googleapis.com'),
      expect.anything(),
    );
  });

  it('merges Audible FR and EN results when provider="audible"', async () => {
    const frProduct = makeAudibleProduct({ asin: 'FR01' });
    const enProduct = makeAudibleProduct({ asin: 'EN01' });
    mockAxios.get
      .mockResolvedValueOnce({ data: { products: [frProduct] } })
      .mockResolvedValueOnce({ data: { products: [enProduct] } });

    const results = await search('Test', undefined, 'audiobook', 'audible');
    const asins = results.map((r) => r.asin);
    expect(asins).toContain('FR01');
    expect(asins).toContain('EN01');
  });
});

// ── enrich (cache behaviour) ──────────────────────────────────────────────────

describe('enrich', () => {
  it('returns cached result on the second call without hitting axios', async () => {
    const product = makeAudibleProduct({ asin: 'CACHE01' });
    mockAxios.get.mockResolvedValue({ data: { products: [product] } });

    // Use a unique title to avoid collision with other tests
    await enrich('CacheTestBook999', 'TestAuthor', 'audiobook');
    const callCount = mockAxios.get.mock.calls.length;

    await enrich('CacheTestBook999', 'TestAuthor', 'audiobook');
    // No new axios calls after first enrich
    expect(mockAxios.get).toHaveBeenCalledTimes(callCount);
  });

  it('cache key is case-insensitive', async () => {
    const product = makeAudibleProduct({ asin: 'CASE01' });
    mockAxios.get.mockResolvedValue({ data: { products: [product] } });

    await enrich('CaseBook888', 'SomeAuthor', 'audiobook');
    const callCount = mockAxios.get.mock.calls.length;

    await enrich('casebook888', 'someauthor', 'audiobook');
    expect(mockAxios.get).toHaveBeenCalledTimes(callCount);
  });

  it('returns a result with expected metadata fields', async () => {
    const product = makeAudibleProduct({
      asin: 'META01',
      title: 'MetaBook777',
      authors: [{ name: 'Meta Author' }],
    });
    mockAxios.get.mockResolvedValue({ data: { products: [product] } });

    const result = await enrich('MetaBook777', 'Meta Author', 'audiobook');
    expect(result).toMatchObject({
      title: 'MetaBook777',
      author: 'Meta Author',
      source: 'audible',
    });
  });
});

// ── retryRequest (via fetchSeriesBooks) ───────────────────────────────────────

describe('retryRequest behaviour', () => {
  it('retries after transient failures and succeeds on a later attempt', async () => {
    const product = makeAudibleProduct();
    mockAxios.get
      .mockRejectedValueOnce(new Error('transient'))
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce({ data: { products: [product] } });

    const results = await fetchSeriesBooks('Mistborn', undefined, 'audiobook');
    expect(results).toHaveLength(1);
    expect(mockAxios.get).toHaveBeenCalledTimes(3);
  }, 10000); // allow time for backoff delays (500ms * 1 + 500ms * 2 = 1500ms)

  it('returns [] after exhausting all retries', async () => {
    mockAxios.get.mockRejectedValue(new Error('always fails'));

    const results = await fetchSeriesBooks('Mistborn', undefined, 'audiobook');
    expect(results).toEqual([]);
    expect(mockAxios.get).toHaveBeenCalledTimes(5); // 5 retries
  }, 20000);
});
