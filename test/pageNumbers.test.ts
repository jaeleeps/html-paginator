import { describe, expect, it } from 'vitest';
import { formatPageNumber, pageContext } from '../src/pageNumbers';

describe('formatPageNumber', () => {
  it('formats decimal by default', () => {
    expect(formatPageNumber(7)).toBe('7');
    expect(formatPageNumber(0)).toBe('0');
  });

  it('formats roman numerals', () => {
    const lower = [1, 2, 3, 4, 5, 9, 14, 40, 90, 400, 1994, 3999].map((n) =>
      formatPageNumber(n, 'lower-roman'),
    );
    expect(lower).toEqual(['i', 'ii', 'iii', 'iv', 'v', 'ix', 'xiv', 'xl', 'xc', 'cd', 'mcmxciv', 'mmmcmxcix']);
    expect(formatPageNumber(12, 'upper-roman')).toBe('XII');
  });

  it('formats letters Word-style (aa, bb after z)', () => {
    const labels = [1, 2, 26, 27, 28, 52, 53].map((n) => formatPageNumber(n, 'lower-alpha'));
    expect(labels).toEqual(['a', 'b', 'z', 'aa', 'bb', 'zz', 'aaa']);
    expect(formatPageNumber(3, 'upper-alpha')).toBe('C');
  });

  it('falls back to decimal outside a format\'s range', () => {
    expect(formatPageNumber(0, 'lower-roman')).toBe('0');
    expect(formatPageNumber(-2, 'upper-alpha')).toBe('-2');
    expect(formatPageNumber(4000, 'upper-roman')).toBe('4000');
  });

  it('accepts a custom formatter', () => {
    expect(formatPageNumber(3, (n) => `#${n * 10}`)).toBe('#30');
  });

  it('rejects unknown formats', () => {
    expect(() => formatPageNumber(1, 'greek' as never)).toThrow(/unknown page number format "greek"/);
  });
});

describe('pageContext', () => {
  it('defaults to numbering from 1 in decimal', () => {
    expect(pageContext(2, 5)).toEqual({
      page: 2,
      totalPages: 5,
      pageNumber: 2,
      pageLabel: '2',
      lastPageNumber: 5,
      lastPageLabel: '5',
      sectionPage: 2,
      sectionPages: 5,
    });
  });

  it('shifts numbers by start (0 = unnumbered cover)', () => {
    expect(pageContext(1, 4, { start: 0 })).toMatchObject({ pageNumber: 0, lastPageNumber: 3 });
    expect(pageContext(2, 4, { start: 0 })).toMatchObject({ pageNumber: 1, pageLabel: '1', lastPageLabel: '3' });
  });

  it('formats both the page and the last page', () => {
    expect(pageContext(3, 9, { start: 1, format: 'lower-roman' })).toMatchObject({
      pageLabel: 'iii',
      lastPageLabel: 'ix',
    });
  });

  it('rejects non-integer starts', () => {
    expect(() => pageContext(1, 1, { start: 1.5 })).toThrow(/start must be an integer/);
  });
});
