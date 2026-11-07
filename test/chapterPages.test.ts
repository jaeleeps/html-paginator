import { afterEach, describe, expect, it } from 'vitest';
import { createPaginator, parseDeclarativeConfig } from '../src/index';
import type { MeasureAdapter, PageContext } from '../src/index';
import { createPageLayout } from '../src/layout';
import { createDomMeasurer } from '../src/measure';

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

const measurer: MeasureAdapter = { measure: (el) => Number(el.getAttribute('data-h') ?? 0), pageHeight: () => 100 };
const footer = ({ pageLabel, lastPageLabel }: PageContext) => `<div>${pageLabel} of ${lastPageLabel}</div>`;
const footers = (pages: HTMLElement[]) => pages.map((p) => p.querySelector('.hp-footer')!.textContent);

describe('chapter page numbers', () => {
  it('prefixes the chapter number, restarting numbers per chapter section', () => {
    document.body.innerHTML = `<div id="src">
      <nav data-hp-toc data-hp-toc-levels="1" data-h="20"></nav>
      <p data-h="90" data-section="front">preface</p>
      <h1 data-h="20" data-section="chapter" id="one">One</h1><p data-h="90">a</p>
      <h1 data-h="20" data-section="chapter" id="two">Two</h1><p data-h="70">b</p><p data-h="70">c</p>
    </div>`;
    const { pages } = createPaginator({
      source: '#src',
      measurer,
      page: { footer },
      pageNumbers: { chapter: 1 },
      sections: {
        front: { pageNumbers: { start: 1, format: 'lower-roman', chapter: 0 } },
        chapter: { pageNumbers: { start: 1 } },
      },
    }).paginate();
    // Before the first chapter the chapter number is 0; the front matter turns it off.
    expect(footers(pages)).toEqual(['0-1 of 0-1', 'i of i', '1-1 of 1-2', '1-2 of 1-2', '2-1 of 2-2', '2-2 of 2-2']);
    // Page references show the chapter-prefixed label.
    expect(Array.from(pages[0]!.querySelectorAll('.hp-toc-page'), (p) => p.textContent)).toEqual(['1-1', '2-1']);
  });

  it('uses outline numbers for deeper levels and a custom separator', () => {
    document.body.innerHTML = `<div id="src">
      <h1 data-h="10">A</h1><h2 data-h="10">A.1</h2><p data-h="75">x</p>
      <h2 data-h="10">A.2</h2><p data-h="75">y</p>
    </div>`;
    const { pages } = createPaginator({
      source: '#src',
      measurer,
      page: { footer: ({ pageLabel }) => `<div>${pageLabel}</div>` },
      pageNumbers: { chapter: 2, chapterSeparator: ' / ' },
    }).paginate();
    // Page 1 has "A" and "A.1": the level-2 heading wins (Word: chapters start with h2).
    expect(footers(pages)).toEqual(['1.1 / 1', '1.2 / 2']);
  });

  it('gives a page with only a higher-level heading that chapter number', () => {
    document.body.innerHTML = `<div id="src">
      <h1 data-h="10">A</h1><h2 data-h="10">A.1</h2><p data-h="75">x</p>
      <h1 data-h="10">B</h1><p data-h="75">y</p>
    </div>`;
    const { pages } = createPaginator({
      source: '#src',
      measurer,
      page: { footer: ({ pageLabel }) => `<div>${pageLabel}</div>` },
      pageNumbers: { chapter: 2 },
    }).paginate();
    expect(footers(pages)).toEqual(['1.1-1', '2.0-2']);
  });

  it('shows 0 before the first chapter, and measures with the longest chapter number', () => {
    const layout = createPageLayout({ page: { footer: ({ pageLabel }) => `<div>${pageLabel}</div>` }, pageNumbers: { chapter: 1 } });
    expect(layout.context(1, 1).pageLabel).toBe('0-1');
    layout.setRunning({ 'outline.h1': '12' });
    const m = createDomMeasurer({ document, layout });
    m.pageHeight(1);
    expect(document.body.lastElementChild!.querySelector('.hp-footer')!.textContent).toBe('12-1');
    m.dispose();
  });

  it('rejects an invalid chapter level', () => {
    expect(() => createPageLayout({ pageNumbers: { chapter: 7 } })).toThrow(/chapter/);
    expect(() => createPageLayout({ sections: { a: { pageNumbers: { chapter: 1.5 } } } })).toThrow(/sections\.a/);
  });

  it('is read from data-hp-page-chapter attributes', () => {
    document.body.innerHTML =
      '<div data-hp-content data-hp-page-chapter="1" data-hp-page-chapter-separator="."><p>a</p></div>';
    expect(parseDeclarativeConfig(document)!.pageNumbers).toEqual({ chapter: 1, chapterSeparator: '.' });
  });
});
