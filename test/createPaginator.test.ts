import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { CLASS_NAMES, createPaginator } from '../src/index';
import type {
  BreakBehavior,
  HeaderFooterTemplate,
  MeasureAdapter,
  PageContext,
  PaginateResult,
  Paginator,
  PaginatorConfig,
} from '../src/index';

/**
 * Stub measurer for jsdom (no layout): leaf height comes from data-h,
 * containers sum their element children.
 */
function stubMeasurer(pageHeight = 60): MeasureAdapter {
  const measure = (el: HTMLElement): number => {
    const own = el.getAttribute('data-h');
    if (own !== null) return parseInt(own, 10);
    return Array.from(el.children)
      .filter((c): c is HTMLElement => c instanceof HTMLElement)
      .reduce((sum, c) => sum + measure(c), 0);
  };
  return { measure, pageHeight: () => pageHeight };
}

function mountSource(markup: string): HTMLElement {
  document.body.innerHTML = `<div id="src">${markup}</div>`;
  return document.getElementById('src') as HTMLElement;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

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

  it('throws for a missing source selector', () => {
    const paginator = createPaginator({ source: '#nope', measurer: stubMeasurer() });
    expect(() => paginator.paginate()).toThrow(/source not found/);
  });
});

describe('paginate()', () => {
  it('distributes source children across pages (spec example)', () => {
    const source = mountSource(
      [50, 20, 40, 10, 50, 40, 60].map((h) => `<p data-h="${h}">${h}</p>`).join(''),
    );
    const { pages, totalPages } = createPaginator({
      source,
      measurer: stubMeasurer(60),
    }).paginate();

    expect(totalPages).toBe(5);
    const heights = pages.map((p) =>
      Array.from(p.querySelectorAll('p'), (n) => n.getAttribute('data-h')),
    );
    expect(heights).toEqual([['50'], ['20', '40'], ['10', '50'], ['40'], ['60']]);
  });

  it('hides the source, inserts the container after it, keeps source intact', () => {
    const source = mountSource('<p data-h="10">a</p>');
    createPaginator({ source, measurer: stubMeasurer() }).paginate();

    expect(source.style.display).toBe('none');
    expect(source.nextElementSibling?.className).toBe(CLASS_NAMES.container);
    // Source content untouched (clones were paginated)
    expect(source.children).toHaveLength(1);
  });

  it('renders into target when provided (source still hidden)', () => {
    const source = mountSource('<p data-h="10">a</p>');
    document.body.insertAdjacentHTML('beforeend', '<div id="out"><span>old</span></div>');
    createPaginator({ source, target: '#out', measurer: stubMeasurer() }).paginate();

    const out = document.getElementById('out') as HTMLElement;
    expect(out.children).toHaveLength(1);
    expect(out.children[0]?.className).toBe(CLASS_NAMES.container);
    expect(source.style.display).toBe('none');
  });

  it('renders headers with the final totalPages', () => {
    const source = mountSource('<p data-h="50">a</p><p data-h="50">b</p>');
    const { pages } = createPaginator({
      source,
      measurer: stubMeasurer(60),
      page: { header: ({ page, totalPages }) => `<header>${page}/${totalPages}</header>` },
    }).paginate();

    expect(pages.map((p) => p.querySelector(`.${CLASS_NAMES.header}`)?.textContent)).toEqual([
      '1/2',
      '2/2',
    ]);
  });

  it('re-paginating replaces the previous container (one final copy)', () => {
    const source = mountSource('<p data-h="10">a</p>');
    const paginator = createPaginator({ source, measurer: stubMeasurer() });
    paginator.paginate();
    paginator.paginate();
    expect(document.querySelectorAll(`.${CLASS_NAMES.container}`)).toHaveLength(1);
  });

  it('warns about nested avoid/clip', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const source = mountSource(
      '<div data-break="avoid"><div data-break="avoid" data-h="10">x</div></div>',
    );
    createPaginator({ source, measurer: stubMeasurer() }).paginate();
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[0])).toContain('nested');
  });

  describe('data-break="clip"', () => {
    it('hides overflow for oversized clip elements', () => {
      const source = mountSource('<div data-break="clip" data-h="100">big</div>');
      const { pages } = createPaginator({ source, measurer: stubMeasurer(60) }).paginate();
      const body = pages[0]?.querySelector<HTMLElement>(`.${CLASS_NAMES.body}`);
      expect(body?.style.overflow).toBe('hidden');
    });

    it('leaves avoid overflow visible', () => {
      const source = mountSource('<div data-break="avoid" data-h="100">big</div>');
      const { pages } = createPaginator({ source, measurer: stubMeasurer(60) }).paginate();
      const body = pages[0]?.querySelector<HTMLElement>(`.${CLASS_NAMES.body}`);
      expect(body?.style.overflow).not.toBe('hidden');
    });
  });
});

describe('reset()', () => {
  it('removes pages and restores the source', () => {
    const source = mountSource('<p data-h="10">a</p>');
    source.style.display = 'block';
    const paginator = createPaginator({ source, measurer: stubMeasurer() });
    paginator.paginate();
    paginator.reset();

    expect(document.querySelector(`.${CLASS_NAMES.container}`)).toBeNull();
    expect(source.style.display).toBe('block');
  });

  it('is idempotent without a prior paginate()', () => {
    const paginator = createPaginator({ source: '#whatever' });
    expect(() => paginator.reset()).not.toThrow();
  });
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
      measurer: stubMeasurer(),
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
