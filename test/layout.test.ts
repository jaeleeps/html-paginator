import { describe, expect, it } from 'vitest';
import { createPageLayout } from '../src/layout';
import type { PageLayoutConfig } from '../src/layout';

const plain = { sectionStart: false, blank: false };

/** Open pages in order: `undefined` continues, a name starts that section. */
function opened(config: PageLayoutConfig, starts: (string | null)[]) {
  const layout = createPageLayout(config);
  let section: string | undefined;
  starts.forEach((start, i) => {
    if (start !== null) section = start;
    layout.open(i + 1, start !== null ? { section, sectionStart: true, blank: false } : { ...plain, section });
  });
  return layout;
}

describe('createPageLayout: numbering', () => {
  it('numbers pages from pageNumbers.start without sections', () => {
    const layout = opened({ pageNumbers: { start: 0 } }, [null, null, null]);
    expect([1, 2, 3].map((p) => layout.context(p, 3).pageLabel)).toEqual(['0', '1', '2']);
    expect(layout.context(1, 3)).toMatchObject({ lastPageLabel: '2', sectionPage: 1, sectionPages: 3 });
  });

  it('restarts numbering and format per section (front matter, body)', () => {
    const layout = opened(
      {
        sections: {
          front: { pageNumbers: { start: 1, format: 'lower-roman' } },
          body: { pageNumbers: { start: 1 } },
        },
      },
      ['front', null, 'body', null, null],
    );
    const ctx = [1, 2, 3, 4, 5].map((p) => layout.context(p, 5));
    expect(ctx.map((c) => c.pageLabel)).toEqual(['i', 'ii', '1', '2', '3']);
    expect(ctx.map((c) => c.lastPageLabel)).toEqual(['ii', 'ii', '3', '3', '3']);
    expect(ctx.map((c) => c.section)).toEqual(['front', 'front', 'body', 'body', 'body']);
    expect(ctx.map((c) => `${c.sectionPage}/${c.sectionPages}`)).toEqual(['1/2', '2/2', '1/3', '2/3', '3/3']);
  });

  it('continues numbering into a section without a start', () => {
    const layout = opened({ sections: { ch: {} } }, [null, 'ch', null, 'ch']);
    const ctx = [1, 2, 3, 4].map((p) => layout.context(p, 4));
    expect(ctx.map((c) => c.pageNumber)).toEqual([1, 2, 3, 4]);
    expect(ctx.map((c) => c.lastPageNumber)).toEqual([4, 4, 4, 4]);
    // Each "ch" start is its own section instance.
    expect(ctx.map((c) => c.sectionPages)).toEqual([1, 2, 2, 1]);
  });

  it('lets a section inherit the top-level format', () => {
    const layout = opened(
      { pageNumbers: { format: 'upper-roman' }, sections: { b: { pageNumbers: { start: 10 } } } },
      [null, 'b'],
    );
    expect([1, 2].map((p) => layout.context(p, 2).pageLabel)).toEqual(['I', 'X']);
  });

  it('numbers pages that were never opened (standalone rendering)', () => {
    const layout = createPageLayout({ pageNumbers: { start: 5 } });
    expect(layout.context(2, 3)).toMatchObject({ pageNumber: 6, lastPageNumber: 7 });
  });

  it('uses a placeholder total while measuring', () => {
    const layout = opened({}, [null, null]);
    expect(layout.probeContext(2, 999)).toMatchObject({ totalPages: 999, pageNumber: 2, lastPageNumber: 999 });
  });

  it('rejects non-integer section starts', () => {
    expect(() => createPageLayout({ sections: { a: { pageNumbers: { start: 0.5 } } } })).toThrow(
      /sections\.a\.pageNumbers\.start must be an integer/,
    );
  });
});

describe('createPageLayout: page config', () => {
  const config: PageLayoutConfig = {
    page: { margin: '1in', header: 'root', footer: 'root-footer' },
    firstPage: { header: 'cover' },
    oddPages: { footer: 'odd' },
    sections: {
      body: {
        page: { header: 'body' },
        firstPage: { header: 'body-first' },
        evenPages: { margin: '2in' },
        pageNumbers: { start: 1 },
      },
    },
    pageOverrides: { 4: { header: 'override' } },
  };
  const layout = opened(config, [null, 'body', null, null]);
  const at = (p: number) => layout.config(p);

  it('applies the top-level first page only to page 1', () => {
    expect(at(1).header).toBe('cover');
  });

  it('applies a section first page to its own first page', () => {
    expect(at(2).header).toBe('body-first');
    expect(at(3).header).toBe('body');
  });

  it('inherits top-level page and odd/even layers into sections', () => {
    expect(at(2)).toMatchObject({ margin: '1in', footer: 'odd' }); // body page "1" is odd
    expect(at(3)).toMatchObject({ margin: '2in', footer: 'root-footer' }); // "2" is even
  });

  it('gives page overrides the last word', () => {
    expect(at(4).header).toBe('override');
  });
});

describe('createPageLayout: blank pages', () => {
  const layout = createPageLayout({
    sections: { odd: { start: 'odd' }, even: { start: 'even' }, next: {} },
  });

  it('asks for a blank page so a section starts on the requested side', () => {
    expect([2, 3].map((p) => layout.blankPageBefore('odd', p))).toEqual([true, false]);
    expect([2, 3].map((p) => layout.blankPageBefore('even', p))).toEqual([false, true]);
    expect(layout.blankPageBefore('next', 2)).toBe(false);
  });

  it('never asks before the first page', () => {
    expect(layout.blankPageBefore('even', 1)).toBe(false);
  });
});
