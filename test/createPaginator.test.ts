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

  it('paginates loose top-level text instead of dropping it', () => {
    const source = mountSource('intro text<p data-h="10">a</p>\n  <p data-h="10">b</p>');
    const { pages } = createPaginator({ source, measurer: stubMeasurer() }).paginate();
    const body = pages[0]?.querySelector(`.${CLASS_NAMES.body}`);
    expect(Array.from(body?.children ?? [], (c) => c.outerHTML)).toEqual([
      '<div>intro text</div>',
      '<p data-h="10">a</p>',
      '<p data-h="10">b</p>',
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

describe('content preservation when splitting', () => {
  /** Text of every leaf <p>/<td>, page by page. */
  function leafTexts(pages: HTMLElement[]): string[][] {
    return pages.map((p) => Array.from(p.querySelectorAll('p, td'), (n) => n.textContent ?? ''));
  }

  function paginate(markup: string, pageHeight = 60): string[][] {
    const source = mountSource(markup);
    const { pages } = createPaginator({ source, measurer: stubMeasurer(pageHeight) }).paginate();
    return leafTexts(pages);
  }

  it('keeps every child when a container retries on a fresh page', () => {
    // 50 leaves 10px; [A 40] cannot start there → whole container moves on.
    expect(
      paginate('<p data-h="50">lead</p><div><p data-h="40">A</p><p data-h="40">B</p></div>'),
    ).toEqual([['lead'], ['A'], ['B']]);
  });

  it('keeps nested content when the boundary child is a container', () => {
    expect(
      paginate(
        '<p data-h="50">lead</p><div><section><p data-h="40">A</p><p data-h="40">B</p></section></div>',
      ),
    ).toEqual([['lead'], ['A'], ['B']]);
  });

  it('keeps table rows when a table retries on a fresh page', () => {
    expect(
      paginate(
        '<p data-h="50">lead</p><table><tbody><tr data-h="40"><td>1</td></tr><tr data-h="40"><td>2</td></tr></tbody></table>',
      ),
    ).toEqual([['lead'], ['1'], ['2']]);
  });

  it('keeps content when a retry ends in a forced split', () => {
    // [big 100] never fits: lead | big (overflow) | small
    expect(
      paginate('<p data-h="50">lead</p><div><p data-h="100">big</p><p data-h="20">small</p></div>'),
    ).toEqual([['lead'], ['big'], ['small']]);
  });

  it('never splits mixed text content (keeps loose text)', () => {
    const source = mountSource(
      '<p data-h="30">lead</p><div data-h="50">loose <b>bold</b> tail</div>',
    );
    const { pages } = createPaginator({ source, measurer: stubMeasurer(60) }).paginate();
    expect(pages.map((p) => p.querySelector(`.${CLASS_NAMES.body}`)?.textContent)).toEqual([
      'lead',
      'loose bold tail',
    ]);
  });

  it('places a split table\'s tfoot on its last page only', () => {
    const source = mountSource(
      '<table><tbody><tr data-h="40"><td>1</td></tr><tr data-h="40"><td>2</td></tr></tbody>' +
        '<tfoot data-h="10"><tr><td>sum</td></tr></tfoot></table>',
    );
    const { pages } = createPaginator({ source, measurer: stubMeasurer(60) }).paginate();
    expect(leafTexts(pages)).toEqual([['1'], ['2', 'sum']]);
  });

  it('measures tfoot into the final fragment', () => {
    // Both rows fit a 60px page (40), but not with the 30px tfoot (70), so the
    // last row moves and takes the footer with it: 1 | 2 + sum
    const source = mountSource(
      '<table><tbody><tr data-h="20"><td>1</td></tr><tr data-h="20"><td>2</td></tr></tbody>' +
        '<tfoot data-h="30"><tr><td>sum</td></tr></tfoot></table>',
    );
    const { pages } = createPaginator({ source, measurer: stubMeasurer(60) }).paginate();
    expect(leafTexts(pages)).toEqual([['1'], ['2', 'sum']]);
  });

  it('marks every fragment after the first of a 3-page container as continued', () => {
    const source = mountSource(
      '<div><p data-h="40">A</p><p data-h="40">B</p><p data-h="40">C</p></div>',
    );
    const { pages } = createPaginator({ source, measurer: stubMeasurer(50) }).paginate();
    expect(leafTexts(pages)).toEqual([['A'], ['B'], ['C']]);
    expect(
      pages.map((p) =>
        p.querySelector(`.${CLASS_NAMES.body} > div`)?.hasAttribute('data-hp-continued'),
      ),
    ).toEqual([false, true, true]);
  });
});

describe('paginate() edge cases', () => {
  it('handles an empty source (no pages)', () => {
    mountSource('');
    const { pages, totalPages } = createPaginator({
      source: '#src',
      measurer: stubMeasurer(),
    }).paginate();
    expect(totalPages).toBe(0);
    expect(pages).toEqual([]);
  });

  it('cleans up when paginate() throws: probes removed, source visible', () => {
    // jsdom has no layout, so the default DOM measurer reports 0 height.
    mountSource('<p>a</p>');
    expect(() => createPaginator({ source: '#src', injectStyles: false }).paginate()).toThrow(
      /pageHeight\(1\)/,
    );
    expect(document.querySelectorAll(`.${CLASS_NAMES.page}`)).toHaveLength(0);
    expect((document.getElementById('src') as HTMLElement).style.display).toBe('');
  });

  it('drops the previous result when a re-paginate throws', () => {
    const source = mountSource('<p data-h="10">a</p>');
    let broken = false;
    const paginator = createPaginator({
      source,
      measurer: { measure: () => (broken ? NaN : 10), pageHeight: () => 60 },
    });
    paginator.paginate();
    broken = true;
    expect(() => paginator.paginate()).toThrow(/measure/);
    expect(document.querySelectorAll(`.${CLASS_NAMES.container}`)).toHaveLength(0);
    expect(source.style.display).toBe('');
  });

  it('does not dispose a caller-provided measurer', () => {
    mountSource('<p data-h="10">a</p>');
    const dispose = vi.fn();
    createPaginator({ source: '#src', measurer: { ...stubMeasurer(), dispose } }).paginate();
    expect(dispose).not.toHaveBeenCalled();
  });

  it('picks up source changes on re-paginate', () => {
    const source = mountSource('<p data-h="10">a</p>');
    const paginator = createPaginator({ source, measurer: stubMeasurer(60) });
    expect(paginator.paginate().totalPages).toBe(1);
    source.insertAdjacentHTML('beforeend', '<p data-h="55">b</p>');
    expect(paginator.paginate().totalPages).toBe(2);
  });

  it('restores the original inline display on reset()', () => {
    const source = mountSource('<p data-h="10">a</p>');
    source.style.display = 'flex';
    const paginator = createPaginator({ source, measurer: stubMeasurer() });
    paginator.paginate();
    paginator.paginate();
    paginator.reset();
    expect(source.style.display).toBe('flex');
  });

  it('applies clip overflow to a force-split fragment holding the clip element', () => {
    const source = mountSource(
      '<div><div data-break="clip" data-h="100">big</div><p data-h="10">after</p></div>',
    );
    const { pages } = createPaginator({ source, measurer: stubMeasurer(60) }).paginate();
    const bodies = pages.map((p) => p.querySelector<HTMLElement>(`.${CLASS_NAMES.body}`));
    expect(bodies.map((b) => b?.textContent)).toEqual(['big', 'after']);
    expect(bodies.map((b) => b?.style.overflow)).toEqual(['hidden', '']);
  });

  it('warns on an invalid data-break value and treats it as auto', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const source = mountSource(
      '<div data-break="nope"><p data-h="40">A</p><p data-h="40">B</p></div>',
    );
    const { totalPages } = createPaginator({ source, measurer: stubMeasurer(60) }).paginate();
    expect(totalPages).toBe(2); // split like auto
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[0])).toContain('invalid data-break="nope"');
  });

  it('passes the target page number to the measurer', () => {
    // Page 1 is narrow (content twice as tall), later pages are wide.
    const source = mountSource('<p data-h="40">a</p><p data-h="60">b</p>');
    const base = stubMeasurer(100);
    const { pages } = createPaginator({
      source,
      measurer: {
        measure: (el, page) => base.measure(el) * (page === 1 ? 2 : 1),
        pageHeight: base.pageHeight,
      },
    }).paginate();
    expect(pages).toHaveLength(2);
    const body = pages[1]?.querySelector<HTMLElement>(`.${CLASS_NAMES.body}`);
    expect(body?.style.overflow).toBe('');
  });

  it('applies per-page overrides by final page number', () => {
    const source = mountSource('<p data-h="50">a</p><p data-h="50">b</p><p data-h="50">c</p>');
    const { pages } = createPaginator({
      source,
      measurer: stubMeasurer(60),
      page: { footer: '<footer>default</footer>' },
      pageOverrides: { 1: { footer: null }, 3: { footer: '<footer>last</footer>' } },
    }).paginate();
    expect(pages.map((p) => p.querySelector(`.${CLASS_NAMES.footer}`)?.textContent ?? null)).toEqual(
      [null, 'default', 'last'],
    );
  });
});

describe('forced page breaks', () => {
  function pageTexts(markup: string, pageHeight = 100): string[] {
    const source = mountSource(markup);
    const { pages } = createPaginator({ source, measurer: stubMeasurer(pageHeight) }).paginate();
    return pages.map((p) => p.querySelector(`.${CLASS_NAMES.body}`)?.textContent ?? '');
  }

  it('starts top-level elements with data-break-before on a new page', () => {
    expect(pageTexts('<p data-h="10">a</p><p data-h="10" data-break-before="page">b</p>')).toEqual([
      'a',
      'b',
    ]);
  });

  it('breaks after the last child of one item before the next item', () => {
    expect(
      pageTexts(
        '<div><p data-h="10">a</p><p data-h="10" data-break-after="page">b</p></div><p data-h="10">c</p>',
      ),
    ).toEqual(['ab', 'c']);
  });

  it('splits a container at a nested break', () => {
    expect(
      pageTexts('<div><p data-h="10">a</p><h2 data-h="10" style="break-before: page">b</h2><p data-h="10">c</p></div>'),
    ).toEqual(['a', 'bc']);
  });

  it('splits a table at a breaking row and keeps rows in order', () => {
    expect(
      pageTexts(
        '<table><tbody><tr data-h="10"><td>1</td></tr><tr data-h="10" data-break-before="page"><td>2</td></tr></tbody></table>',
      ),
    ).toEqual(['1', '2']);
  });

  it('leaves the source without break markers', () => {
    const source = mountSource('<p data-h="10" data-break-after="page">a</p><p data-h="10">b</p>');
    createPaginator({ source, measurer: stubMeasurer() }).paginate();
    expect(source.querySelectorAll('[data-break-before]')).toHaveLength(0);
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
