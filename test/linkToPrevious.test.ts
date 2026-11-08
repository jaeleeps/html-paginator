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

  it('is read from data-hp-link-to-previous on a section group', () => {
    document.body.innerHTML = `
      <template data-hp-config><div data-hp-section="next" data-hp-link-to-previous></div></template>
      <div data-hp-content><p>a</p></div>`;
    expect(parseDeclarativeConfig(document)!.sections?.next?.linkToPrevious).toBe(true);
  });
});
