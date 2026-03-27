import { chaptersMatch } from '../../src/lib/chapterMatch';

describe('chaptersMatch', () => {
  it('matches identical strings', () => {
    expect(chaptersMatch('Chapter One', 'Chapter One')).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(chaptersMatch('CHAPTER ONE', 'chapter one')).toBe(true);
  });

  it('matches after punctuation normalization', () => {
    expect(chaptersMatch('Chapter: One', 'Chapter One')).toBe(true);
  });

  it('matches when one string is a substring of the other', () => {
    expect(chaptersMatch('Chapter 3: The Journey Begins', 'Chapter 3')).toBe(true);
  });

  it('matches chapter number with zero-padding', () => {
    expect(chaptersMatch('Chapter 3', 'Chapter 03')).toBe(true);
  });

  it('matches chapter number in different title formats', () => {
    expect(chaptersMatch('3. The Journey', 'Chapter 3')).toBe(true);
  });

  it('does not match different chapter numbers', () => {
    expect(chaptersMatch('Chapter 3', 'Chapter 4')).toBe(false);
  });

  it('does not match completely different strings with no numbers', () => {
    expect(chaptersMatch('Prologue', 'Epilogue')).toBe(false);
  });
});
