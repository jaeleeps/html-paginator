import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildIndex, createPaginator } from '../src/index';
import type { MeasureAdapter } from '../src/index';

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

/** Each entry or heading of a list: "level|text", pages as their references' targets. */
const entries = (root: ParentNode) =>
  Array.from(root.querySelectorAll('.hp-index-entry, .hp-index-heading'), (el) => {
    if (el.classList.contains('hp-index-heading')) return `# ${el.textContent}`;
    const level = /hp-index-level-(\d)/.exec(el.className)![1];
    const term = el.querySelector('.hp-index-term')!.textContent;
    const pages = Array.from(el.querySelectorAll('.hp-index-page'), (p) => p.getAttribute('data-hp-page-ref'));
    return `${level}|${term}${pages.length ? ' ' + pages.join(',') : ''}`;
  });

describe('buildIndex', () => {
  it('sorts the terms, with subentries and a page reference per mark', () => {
    document.body.innerHTML = `<div id="r">
      <p>Pears<span data-hp-index="pear"></span> and <b data-hp-index="">Apples</b>.</p>
      <p id="x" data-hp-index="Fruit: citrus">Oranges<span data-hp-index="fruit:apple"></span></p>
      <p><span data-hp-index="Éclair"></span><span data-hp-index="Pear"></span><span data-hp-index="10 rules"></span><span data-hp-index="2 rules"></span></p>
      <div data-hp-index-list><h2>Index</h2></div>
    </div>`;
    const root = document.getElementById('r')!;
    expect(buildIndex(root)).toBe(8);
    expect(entries(root)).toEqual([
      '1|2 rules #hp-index-7',
      '1|10 rules #hp-index-6',
      '1|Apples #hp-index-2',
      '1|Éclair #hp-index-4',
      '1|Fruit',
      '2|apple #hp-index-3',
      '2|citrus #x',
      '1|pear #hp-index-1,#hp-index-5',
    ]);
    // The list keeps its title first; a term with subentries stays with them.
    const list = root.querySelector('[data-hp-index-list]')!;
    expect(list.firstElementChild!.tagName).toBe('H2');
    const fruit = Array.from(list.querySelectorAll('.hp-index-entry')).find((e) => e.textContent === 'Fruit')!;
    expect(fruit.hasAttribute('data-keep-with-next')).toBe(true);
    expect(list.querySelector('.hp-index-entry')!.getAttribute('data-break')).toBe('avoid');
  });

  it('adds letter headings with data-hp-index-headings', () => {
    document.body.innerHTML = `<div id="r">
      <span data-hp-index="beta"></span><span data-hp-index="alpha"></span><span data-hp-index="Bravo"></span>
      <span data-hp-index="Évian"></span><span data-hp-index="42"></span>
      <div data-hp-index-list data-hp-index-headings></div></div>`;
    const root = document.getElementById('r')!;
    buildIndex(root);
    expect(entries(root).map((e) => e.replace(/ #hp-.*/, ''))).toEqual([
      '# #', '1|42', '# A', '1|alpha', '# B', '1|beta', '1|Bravo', '# E', '1|Évian',
    ]);
  });

  it('does nothing without a list, and ignores marks inside one', () => {
    document.body.innerHTML = `<div id="r"><span data-hp-index="a"></span></div>`;
    expect(buildIndex(document.getElementById('r')!)).toBe(0);
    expect(document.querySelector('#r span')!.id).toBe('');
    document.body.innerHTML = `<div id="r"><div data-hp-index-list><span data-hp-index="in"></span></div></div>`;
    expect(buildIndex(document.getElementById('r')!)).toBe(0);
  });
});

describe('createPaginator: index', () => {
  const measurer: MeasureAdapter = { measure: (el) => Number(el.getAttribute('data-h') ?? 10), pageHeight: () => 100 };

  it('fills in the page labels of the marks, once per page', () => {
    document.body.innerHTML = `<div id="src">
      <p data-h="60">a<span data-hp-index="Alpha"></span><span data-hp-index="Alpha"></span></p>
      <p data-h="60">b<span data-hp-index="Alpha"></span><span data-hp-index="Beta:one"></span></p>
      <p data-h="60" data-break-before="page">c<span data-hp-index="Beta:one"></span></p>
      <div data-hp-index-list data-break-before="page"></div></div>`;
    const { pages } = createPaginator({
      source: '#src',
      measurer,
      pageNumbers: { format: 'lower-roman' },
    }).paginate();
    const index = pages.at(-1)!;
    expect(Array.from(index.querySelectorAll('.hp-index-entry'), (e) => e.textContent)).toEqual([
      'Alpha, i, ii',
      'Beta',
      'one, ii, iii',
    ]);
  });
});

describe('createPaginator: index repagination', () => {
  it('paginates again with the real page numbers, as measured placeholders are wider', () => {
    // An entry measures 30 with placeholders (wrapping), 10 with page numbers.
    const height = (el: Element): number => {
      if (el.classList.contains('hp-index-entry')) return el.textContent!.includes('000') ? 30 : 10;
      if (el.hasAttribute('data-hp-index-list')) return Array.from(el.children).reduce((sum, c) => sum + height(c), 0);
      return Number(el.getAttribute('data-h') ?? 0);
    };
    const measure = vi.fn((el: HTMLElement) => height(el));
    document.body.innerHTML = `<div id="src">
      <p data-h="90">${['a', 'b', 'c', 'd', 'e', 'f'].map((t) => `<span data-hp-index="${t}"></span>`).join('')}</p>
      <div data-hp-index-list data-break-before="page"></div></div>`;
    const { pages } = createPaginator({ source: '#src', measurer: { measure, pageHeight: () => 100 } }).paginate();
    // 6 entries: 180 high with placeholders (2 pages), 60 with numbers (1 page).
    expect(pages).toHaveLength(2);
    expect(Array.from(pages[1]!.querySelectorAll('.hp-index-entry'), (e) => e.textContent)).toEqual([
      'a, 1', 'b, 1', 'c, 1', 'd, 1', 'e, 1', 'f, 1',
    ]);
  });

  it('does not paginate twice without an index', () => {
    const measure = vi.fn(() => 10);
    document.body.innerHTML = `<div id="src"><p>a</p><p>b</p></div>`;
    createPaginator({ source: '#src', measurer: { measure, pageHeight: () => 100 } }).paginate();
    expect(measure).toHaveBeenCalledTimes(2);
  });
});
