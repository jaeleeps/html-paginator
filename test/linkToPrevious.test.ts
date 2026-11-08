import { afterEach, describe, expect, it } from 'vitest';
import { createPaginator, parseDeclarativeConfig } from '../src/index';
import type { MeasureAdapter, PaginatorConfig } from '../src/index';

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

const measurer: MeasureAdapter = { measure: (el) => Number(el.getAttribute('data-h') ?? 0), pageHeight: () => 100 };

/** One page per section: a, b, c, d. */
function headers(config: Partial<PaginatorConfig>): string[] {
  document.body.innerHTML = `<div id="src">
    <p data-h="50" data-section="a">a</p><p data-h="50" data-section="b">b</p>
    <p data-h="50" data-section="c">c</p><p data-h="50" data-section="d">d</p></div>`;
  const { pages } = createPaginator({ source: '#src', measurer, injectStyles: false, ...config }).paginate();
  return pages.map((p) => p.querySelector('.hp-header')?.textContent ?? '');
}

describe('linkToPrevious', () => {
  it('uses the previous section\'s header instead of the top-level one (Word: Link to Previous)', () => {
    const sections = {
      a: {},
      b: { page: { header: '<div>B</div>' } },
      c: {},
      d: {},
    };
    // Without links, sections fall back to the top level.
    expect(headers({ page: { header: '<div>TOP</div>' }, sections })).toEqual(['TOP', 'B', 'TOP', 'TOP']);
    // Linked: c takes b's header, and d (linked to c) takes it too.
    expect(
      headers({
        page: { header: '<div>TOP</div>' },
        sections: { ...sections, c: { linkToPrevious: true }, d: { linkToPrevious: true } },
      }),
    ).toEqual(['TOP', 'B', 'B', 'B']);
  });

  it('lets a linked section override what it sets, and inherits odd/even layers but not the first page', () => {
    expect(
      headers({
        sections: {
          a: { page: { header: '<div>A</div>', footer: '<div>FA</div>' }, firstPage: { header: '<div>A1</div>' } },
          b: { linkToPrevious: true, page: { footer: '<div>FB</div>' } },
          c: { linkToPrevious: true, evenPages: { header: '<div>C-even</div>' } },
          d: { linkToPrevious: true },
        },
      }),
      // c is on odd page 3; d, on even page 4, inherits c's even-page header.
    ).toEqual(['A1', 'A', 'A', 'C-even']);
  });

  it('links through sections that start partway down a page (continuous breaks)', () => {
    document.body.innerHTML = `<div id="src">
      <p data-h="20">a</p>
      <p data-h="10" data-section="cols">c1</p><p data-h="10">c2</p>
      <p data-h="10" data-section="one">o</p>
      <p data-h="20" data-section="next">n</p></div>`;
    const { pages } = createPaginator({
      source: '#src',
      measurer,
      injectStyles: false,
      page: { header: '<div>TOP</div>' },
      sections: {
        cols: { start: 'continuous', linkToPrevious: true, page: { columns: 2, header: '<div>COLS</div>' } },
        one: { start: 'continuous', linkToPrevious: true, page: { columns: 1, header: '<div>ONE</div>' } },
        next: { linkToPrevious: true },
      },
    }).paginate();
    expect(pages).toHaveLength(2);
    // The columns region on page 1 is in two columns; "next" inherits "one"
    // (which never had a page of its own): its header, in one column.
    expect(pages[0]!.querySelectorAll('.hp-column')).toHaveLength(2);
    expect(pages[1]!.querySelector('.hp-header')!.textContent).toBe('ONE');
    expect(pages[1]!.querySelectorAll('.hp-column')).toHaveLength(0);
  });

  it('is read from data-hp-link-to-previous on a section group', () => {
    document.body.innerHTML = `
      <template data-hp-config><div data-hp-section="next" data-hp-link-to-previous></div></template>
      <div data-hp-content><p>a</p></div>`;
    expect(parseDeclarativeConfig(document)!.sections?.next?.linkToPrevious).toBe(true);
  });
});
