import type { PageContext, PageNumberFormat, PageNumbering } from './types';

const ROMAN: [number, string][] = [
  [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'],
  [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'],
  [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
];

function toRoman(n: number): string {
  let out = '';
  for (const [value, numeral] of ROMAN) {
    while (n >= value) {
      out += numeral;
      n -= value;
    }
  }
  return out;
}

/** Word-style letters: a..z, then aa, bb, ..., zz, aaa, ... */
function toAlpha(n: number): string {
  const letter = String.fromCharCode(97 + ((n - 1) % 26));
  return letter.repeat(Math.ceil(n / 26));
}

/**
 * Format a page number. Roman and alphabetic formats need n >= 1 (roman up
 * to 3999); other values fall back to decimal.
 */
export function formatPageNumber(n: number, format: PageNumberFormat = 'decimal'): string {
  if (typeof format === 'function') return format(n);
  const integer = Number.isInteger(n) && n >= 1;
  switch (format) {
    case 'lower-roman':
      return integer && n < 4000 ? toRoman(n) : String(n);
    case 'upper-roman':
      return integer && n < 4000 ? toRoman(n).toUpperCase() : String(n);
    case 'lower-alpha':
      return integer ? toAlpha(n) : String(n);
    case 'upper-alpha':
      return integer ? toAlpha(n).toUpperCase() : String(n);
    case 'decimal':
      return String(n);
    default:
      throw new Error(`html-paginator: unknown page number format "${String(format)}"`);
  }
}

/** Header/footer context for one page. */
export function pageContext(
  page: number,
  totalPages: number,
  numbering: PageNumbering = {},
): PageContext {
  const start = numbering.start ?? 1;
  if (!Number.isInteger(start)) {
    throw new Error(`html-paginator: pageNumbers.start must be an integer, got ${start}`);
  }
  const pageNumber = start + page - 1;
  const lastPageNumber = start + totalPages - 1;
  return {
    page,
    totalPages,
    pageNumber,
    pageLabel: formatPageNumber(pageNumber, numbering.format),
    lastPageNumber,
    lastPageLabel: formatPageNumber(lastPageNumber, numbering.format),
    sectionPage: page,
    sectionPages: totalPages,
    running: {},
    runningLast: {},
  };
}
