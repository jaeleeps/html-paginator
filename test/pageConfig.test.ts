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
