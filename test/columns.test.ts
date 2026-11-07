import { afterEach, describe, expect, it } from 'vitest';
import { createPaginator, parseDeclarativeConfig } from '../src/index';
import type { MeasureAdapter } from '../src/index';
import { columnWidth, resolvePageConfig } from '../src/pageConfig';

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

const measured: number[] = [];
const heights: number[] = [];
const measurer: MeasureAdapter = {
  measure: (el, page) => {
    if (page !== undefined) measured.push(page);
    return Number(el.getAttribute('data-h') ?? 0);
  },
  pageHeight: (page) => {
    heights.push(page);
    return 100;
  },
};

const texts = (el: Element | null | undefined): string[] =>
  Array.from(el?.querySelectorAll('p') ?? [], (p) => p.textContent ?? '');

describe('columns', () => {
  it('resolves columns, gap and rule (defaults: 1 column, 0.5in gap)', () => {
    expect(resolvePageConfig(1, {}, undefined).columns).toBe(1);
    const config = resolvePageConfig(1, { columns: 3, columnRule: '1px solid' }, undefined);
    expect(config).toMatchObject({ columns: 3, columnGap: '0.5in', columnRule: '1px solid' });
    expect(() => resolvePageConfig(1, { columns: 0 }, undefined)).toThrow(/columns/);
    expect(() => resolvePageConfig(1, { columns: 1.5 }, undefined)).toThrow(/columns/);
    expect(columnWidth(2, '0.5in')).toBe('calc((100% - 1 * 0.5in) / 2)');
  });

  it('flows content down each column of a sheet, then onto the next sheet', () => {
    measured.length = 0;
    document.body.innerHTML = `<div id="src">${[1, 2, 3, 4, 5]
      .map((n) => `<p data-h="60">p${n}</p>`)
      .join('')}</div>`;
    const { pages, totalPages } = createPaginator({
      source: '#src',
      measurer,
      page: { columns: 2, columnGap: '20px', footer: ({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}` },
    }).paginate();

    expect(totalPages).toBe(3);
    const columns = pages.map((page) => Array.from(page.querySelectorAll('.hp-column'), texts));
    expect(columns).toEqual([
      [['p1'], ['p2']],
      [['p3'], ['p4']],
      [['p5'], []], // The last sheet keeps its empty column.
    ]);
    expect(pages.map((p) => p.querySelector('.hp-footer')?.textContent)).toEqual(['1 / 3', '2 / 3', '3 / 3']);
    // Items are measured on sheets, not engine pages.
    expect(Math.max(...measured)).toBe(3);

    const body = pages[0]!.querySelector<HTMLElement>('.hp-body')!;
    expect(body.style.display).toBe('flex');
    expect(body.style.columnGap).toBe('20px');
    const column = body.firstElementChild as HTMLElement;
    expect(column.dataset.column).toBe('1');
    expect(column.style.flex).toBe('1 1 0px');
    expect(column.querySelector('.hp-column-rule')).toBeNull();
  });

  it('switches columns on and off per section; sections start a new sheet', () => {
    document.body.innerHTML = `<div id="src">
      <p data-h="60">intro</p>
      <p data-h="60" data-section="cols">c1</p><p data-h="60">c2</p><p data-h="60">c3</p>
      <p data-h="60" data-section="end">end</p>
    </div>`;
    const { pages } = createPaginator({
      source: '#src',
      measurer,
      sections: { cols: { page: { columns: 2, columnRule: '1px solid red' } }, end: { page: {} } },
    }).paginate();

    expect(pages).toHaveLength(4);
    expect(texts(pages[0])).toEqual(['intro']);
    expect(pages[0]!.querySelector('.hp-column')).toBeNull();
    expect(Array.from(pages[1]!.querySelectorAll('.hp-column-body'), texts)).toEqual([['c1'], ['c2']]);
    expect(Array.from(pages[2]!.querySelectorAll('.hp-column-body'), texts)).toEqual([['c3'], []]);
    expect(texts(pages[3])).toEqual(['end']);
    expect(pages[3]!.querySelector('.hp-column')).toBeNull();

    // The rule sits in the gap, before every column but the first.
    const rules = pages[1]!.querySelectorAll<HTMLElement>('.hp-column-rule');
    expect(rules).toHaveLength(1);
    expect(rules[0]!.parentElement!.dataset.column).toBe('2');
    expect(rules[0]!.style.borderLeft).toBe('1px solid red');
  });

  it('puts footnotes at the bottom of the column holding their reference', () => {
    document.body.innerHTML = `<div id="src">
      <p data-h="60">a<span data-footnote>note A</span></p>
      <p data-h="60">b<span data-footnote>note B</span></p>
    </div>`;
    const { pages } = createPaginator({
      source: '#src',
      measurer,
      page: { columns: 2 },
      injectStyles: false,
    }).paginate();

    expect(pages).toHaveLength(1);
    const columns = Array.from(pages[0]!.querySelectorAll('.hp-column'));
    expect(columns.map((c) => c.querySelector('.hp-footnotes .hp-footnote')?.textContent)).toEqual([
      '1note A',
      '2note B',
    ]);
    expect(columns.map((c) => c.lastElementChild!.className)).toEqual(['hp-footnotes', 'hp-footnotes']);
  });

  it('restarts footnote numbers per sheet, not per column', () => {
    document.body.innerHTML = `<div id="src">${[1, 2, 3]
      .map((n) => `<p data-h="60">${n}<span data-footnote>n${n}</span></p>`)
      .join('')}</div>`;
    const { pages } = createPaginator({
      source: '#src',
      measurer,
      page: { columns: 2 },
      footnotes: { restart: 'page' },
      injectStyles: false,
    }).paginate();
    const marks = pages.map((p) => Array.from(p.querySelectorAll('.hp-footnote-mark'), (m) => m.textContent));
    expect(marks).toEqual([['1', '2'], ['1']]);
  });

  it('treats a page break in a multi-column page as a column break', () => {
    document.body.innerHTML = `<div id="src">
      <p data-h="10">a</p><p data-h="10" data-break-before="page">b</p><p data-h="10" data-break-before="page">c</p>
    </div>`;
    const { pages } = createPaginator({ source: '#src', measurer, page: { columns: 2 } }).paginate();
    expect(pages.map((p) => Array.from(p.querySelectorAll('.hp-column-body'), texts))).toEqual([
      [['a'], ['b']],
      [['c'], []],
    ]);
  });

  it('is read from data-hp-columns attributes', () => {
    document.body.innerHTML = `
      <div data-hp-content data-hp-columns="2" data-hp-column-gap="1cm" data-hp-column-rule="1px solid"><p>a</p></div>`;
    expect(parseDeclarativeConfig(document)!.page).toEqual({ columns: 2, columnGap: '1cm', columnRule: '1px solid' });
  });
});
