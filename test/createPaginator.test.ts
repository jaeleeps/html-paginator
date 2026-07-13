import { describe, expect, expectTypeOf, it } from 'vitest';
import { createPaginator } from '../src/index';
import type {
  BreakBehavior,
  HeaderFooterTemplate,
  PageContext,
  PaginateResult,
  Paginator,
  PaginatorConfig,
} from '../src/index';

describe('createPaginator', () => {
  it('returns a Paginator', () => {
    const paginator = createPaginator({ source: '#content' });
    expectTypeOf(paginator).toEqualTypeOf<Paginator>();
    expect(paginator.paginate).toBeInstanceOf(Function);
    expect(paginator.reset).toBeInstanceOf(Function);
    expect(paginator.getConfig).toBeInstanceOf(Function);
  });

  it('applies defaults over minimal config', () => {
    const config = createPaginator({ source: '#content' }).getConfig();
    expect(config.page?.size).toBe('letter');
    expect(config.repeatTableHead).toBe(false);
  });

  it('preserves user config over defaults', () => {
    const config = createPaginator({
      source: '#content',
      page: { size: 'a4', margin: '10mm' },
      repeatTableHead: true,
    }).getConfig();
    expect(config.page?.size).toBe('a4');
    expect(config.page?.margin).toBe('10mm');
    expect(config.repeatTableHead).toBe(true);
  });

  it('paginate() and reset() are not implemented yet', () => {
    const paginator = createPaginator({ source: '#content' });
    expect(() => paginator.paginate()).toThrow(/not implemented/);
    expect(() => paginator.reset()).toThrow(/not implemented/);
  });

  describe('typing', () => {
    it('accepts the full config shape', () => {
      const config: PaginatorConfig = {
        source: document.createElement('div'),
        target: '#output',
        page: {
          size: { width: '8.5in', height: '11in' },
          margin: '0.5in',
          header: ({ page, totalPages }) => `Page ${page} of ${totalPages}`,
          footer: '#footer-template',
        },
        pageOverrides: {
          1: { header: '#cover-header', margin: '1in' },
          3: { footer: null },
        },
        repeatTableHead: false,
      };
      expect(createPaginator(config)).toBeDefined();
    });

    it('requires source', () => {
      // @ts-expect-error source is required
      const invalid: PaginatorConfig = {};
      void invalid;
    });

    it('rejects unknown size presets', () => {
      // @ts-expect-error 'tabloid' is not a preset
      const invalid: PaginatorConfig = { source: '#c', page: { size: 'tabloid' } };
      void invalid;
    });

    it('header/footer template forms', () => {
      expectTypeOf<HeaderFooterTemplate>().toMatchTypeOf<
        string | HTMLElement | ((ctx: PageContext) => string | HTMLElement) | null
      >();
      const fn: HeaderFooterTemplate = (ctx) => {
        expectTypeOf(ctx.page).toBeNumber();
        expectTypeOf(ctx.totalPages).toBeNumber();
        return document.createElement('header');
      };
      void fn;
    });

    it('break behavior values', () => {
      expectTypeOf<BreakBehavior>().toEqualTypeOf<'auto' | 'avoid' | 'clip'>();
    });

    it('paginate() result shape', () => {
      expectTypeOf<PaginateResult>().toEqualTypeOf<{
        pages: HTMLElement[];
        totalPages: number;
      }>();
    });
  });
});
