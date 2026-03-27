import { sanitize, applyPattern } from '../../src/services/organizer';

describe('sanitize', () => {
  it('returns Unknown for empty string', () => {
    expect(sanitize('')).toBe('Unknown');
  });

  it('returns Unknown for null', () => {
    expect(sanitize(null)).toBe('Unknown');
  });

  it('returns Unknown for undefined', () => {
    expect(sanitize(undefined)).toBe('Unknown');
  });

  it('removes illegal filesystem characters', () => {
    expect(sanitize('file<>:"/\\|?*name')).toBe('filename');
  });

  it('removes control characters', () => {
    expect(sanitize('file\x00name')).toBe('filename');
  });

  it('strips trailing dots and spaces', () => {
    expect(sanitize('filename...')).toBe('filename');
    expect(sanitize('filename   ')).toBe('filename');
  });

  it('returns Unknown if string becomes empty after sanitization', () => {
    expect(sanitize('...')).toBe('Unknown');
  });

  it('leaves normal strings unchanged', () => {
    expect(sanitize('My Book Title')).toBe('My Book Title');
  });
});

describe('applyPattern', () => {
  it('substitutes all tokens', () => {
    const result = applyPattern('{author}/{title} ({year})', {
      author: 'Tolkien',
      title: 'The Hobbit',
      year: '1937',
    });
    expect(result).toBe('Tolkien/The Hobbit (1937)');
  });

  it('substitutes {series} token', () => {
    const result = applyPattern('{series}/{title}', {
      series: 'LOTR',
      title: 'The Hobbit',
    });
    expect(result).toBe('LOTR/The Hobbit');
  });

  it('replaces {series} with Unknown when series is missing', () => {
    const result = applyPattern('{series}/{title}', {
      title: 'The Hobbit',
    });
    expect(result).toBe('Unknown/The Hobbit');
  });

  it('replaces {year} with empty string when year is undefined', () => {
    const result = applyPattern('{author} ({year})', {
      author: 'Tolkien',
    });
    expect(result).toBe('Tolkien ()');
  });

  it('works with partial pattern (only {title})', () => {
    const result = applyPattern('{title}', { title: 'Dune' });
    expect(result).toBe('Dune');
  });
});
