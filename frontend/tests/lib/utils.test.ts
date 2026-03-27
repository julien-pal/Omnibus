import { formatBytes, coverUrl } from '../../src/lib/utils';

describe('formatBytes', () => {
  it('returns empty string for undefined', () => {
    expect(formatBytes(undefined)).toBe('');
  });

  it('returns empty string for 0', () => {
    expect(formatBytes(0)).toBe('');
  });

  it('formats bytes under 1MB as KB', () => {
    expect(formatBytes(512 * 1024)).toBe('512 KB');
  });

  it('formats bytes under 1GB as MB', () => {
    expect(formatBytes(100 * 1024 * 1024)).toBe('100.0 MB');
  });

  it('formats bytes over 1GB as GB', () => {
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.00 GB');
  });
});

describe('coverUrl', () => {
  it('returns null for null', () => {
    expect(coverUrl(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(coverUrl(undefined)).toBeNull();
  });

  it('returns http URLs unchanged', () => {
    const url = 'http://example.com/cover.jpg';
    expect(coverUrl(url)).toBe(url);
  });

  it('returns https URLs unchanged', () => {
    const url = 'https://example.com/cover.jpg';
    expect(coverUrl(url)).toBe(url);
  });

  it('converts relative path to API URL with encoding', () => {
    expect(coverUrl('/books/My Book/cover.jpg')).toBe(
      '/api/library/cover?path=%2Fbooks%2FMy%20Book%2Fcover.jpg',
    );
  });
});
