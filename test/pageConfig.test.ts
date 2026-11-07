import { describe, expect, it } from 'vitest';
import { PAGE_SIZE_PRESETS, resolvePageConfig, resolveSize } from '../src/pageConfig';

describe('resolveSize', () => {
  it('defaults to letter', () => {
    expect(resolveSize(undefined)).toEqual({ width: '8.5in', height: '11in' });
  });

  it('resolves presets', () => {
    expect(resolveSize('a4')).toEqual({ width: '210mm', height: '297mm' });
    expect(resolveSize('legal')).toEqual(PAGE_SIZE_PRESETS.legal);
  });

  it('passes explicit dimensions through', () => {
    expect(resolveSize({ width: '5in', height: '7in' })).toEqual({ width: '5in', height: '7in' });
  });

  it('rejects unknown presets at runtime', () => {
    expect(() => resolveSize('tabloid' as never)).toThrow(/unknown page size preset/);
  });
});

describe('resolvePageConfig', () => {
  const defaults = { size: 'a4' as const, margin: '10mm', header: 'H', footer: 'F' };

  it('uses defaults when no override exists', () => {
    const config = resolvePageConfig(2, defaults, { 1: { margin: '30mm' } });
    expect(config.size).toEqual(PAGE_SIZE_PRESETS.a4);
    expect(config.margin).toBe('10mm');
    expect(config.header).toBe('H');
  });

  it('merges override over defaults', () => {
    const config = resolvePageConfig(1, defaults, { 1: { margin: '30mm' } });
    expect(config.margin).toBe('30mm');
    expect(config.header).toBe('H'); // inherited
  });

  it('override header/footer: null removes; absent inherits', () => {
    const config = resolvePageConfig(3, defaults, { 3: { footer: null } });
    expect(config.footer).toBeNull();
    expect(config.header).toBe('H');
  });

  it('works with no defaults and no overrides', () => {
    const config = resolvePageConfig(1, undefined, undefined);
    expect(config.size).toEqual(PAGE_SIZE_PRESETS.letter);
    expect(config.margin).toBe('0');
    expect(config.header).toBeUndefined();
  });
});

describe('resolvePageConfig with page variants', () => {
  const defaults = { margin: '1in', header: 'default', footer: 'footer' };
  const variants = {
    firstPage: { header: 'first', footer: null },
    oddPages: { header: 'odd' },
    evenPages: { header: 'even', margin: '1in 0.75in 1in 1.25in' },
  };
  const header = (page: number, extra = {}) =>
    resolvePageConfig(page, defaults, undefined, { ...variants, ...extra }).header;

  it('applies odd/even by page number and first page on page 1', () => {
    expect([1, 2, 3, 4].map((p) => header(p))).toEqual(['first', 'even', 'odd', 'even']);
  });

  it('lets the first page remove inherited slots', () => {
    expect(resolvePageConfig(1, defaults, undefined, variants).footer).toBeNull();
    expect(resolvePageConfig(2, defaults, undefined, variants).footer).toBe('footer');
  });

  it('merges only declared properties (even margins, inherited footer)', () => {
    const even = resolvePageConfig(2, defaults, undefined, variants);
    expect(even.margin).toBe('1in 0.75in 1in 1.25in');
    expect(resolvePageConfig(3, defaults, undefined, variants).margin).toBe('1in');
  });

  it('follows the displayed number: start 0 makes page 2 odd', () => {
    const pageNumbers = { start: 0 };
    expect([2, 3].map((p) => header(p, { pageNumbers }))).toEqual(['odd', 'even']);
    // Page 1 is still the first page.
    expect(header(1, { pageNumbers })).toBe('first');
  });

  it('gives explicit page overrides the last word', () => {
    const config = resolvePageConfig(1, defaults, { 1: { header: 'override' } }, variants);
    expect(config.header).toBe('override');
    expect(config.footer).toBeNull(); // first-page removal still applies
  });

  it('falls back to the default without variants', () => {
    expect(resolvePageConfig(2, defaults, undefined).header).toBe('default');
  });
});

