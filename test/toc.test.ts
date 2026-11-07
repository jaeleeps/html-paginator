import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildTableOfContents,
  createPaginator,
  PAGE_REF_PLACEHOLDER,
  resolvePageRefs,
} from '../src/index';
import type { MeasureAdapter } from '../src/index';

function mount(markup: string): HTMLElement {
  document.body.innerHTML = `<div id="src">${markup}</div>`;
  return document.getElementById('src') as HTMLElement;
}

const entries = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>('.hp-toc-entry'), (e) => ({
    text: e.querySelector('.hp-toc-text')!.textContent,
    href: e.querySelector('a')!.getAttribute('href'),
    level: /hp-toc-level-(\d)/.exec(e.className)![1],
    page: e.querySelector('.hp-toc-page')!.textContent,
  }));

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('buildTableOfContents', () => {
  it('lists h1–h3 by default, with ids, indentation and placeholders', () => {
    const root = mount(`
      <nav data-hp-toc><h2 class="title">Contents</h2></nav>
      <h1 id="intro">Intro  duction</h1><h2>Scope</h2><h4>Deep</h4><h3>Detail</h3>`);
    buildTableOfContents(root);
    expect(entries(root)).toEqual([
      { text: 'Intro duction', href: '#intro', level: '1', page: PAGE_REF_PLACEHOLDER },
      { text: 'Scope', href: '#hp-toc-1', level: '2', page: PAGE_REF_PLACEHOLDER },
      { text: 'Detail', href: '#hp-toc-2', level: '3', page: PAGE_REF_PLACEHOLDER },
    ]);
    // The TOC's own title is kept first and not listed.
    expect(root.querySelector('nav')!.firstElementChild!.className).toBe('title');
    expect(root.querySelector('h2:not(.title)')!.id).toBe('hp-toc-1');
    const indents = Array.from(root.querySelectorAll<HTMLElement>('.hp-toc-entry'), (e) => e.style.paddingLeft);
    expect(indents).toEqual(['0em', '1.5em', '3em']);
  });

  it('honors levels, explicit outline levels and skips', () => {
    const root = mount(`
      <div data-hp-toc data-hp-toc-levels="2-4"></div>
      <h1>Top</h1><h2>A</h2><h2 data-hp-toc-skip>Hidden</h2>
      <p data-hp-toc-level="3">Para entry</p><h4>Four</h4><h5>Five</h5>`);
    buildTableOfContents(root);
    expect(entries(root).map((e) => `${e.level}:${e.text}`)).toEqual(['2:A', '3:Para entry', '4:Four']);
  });

  it('warns on invalid levels and falls back to 1-3', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const root = mount('<div data-hp-toc data-hp-toc-levels="x"></div><h1>A</h1><h4>B</h4>');
    buildTableOfContents(root);
    expect(entries(root).map((e) => e.text)).toEqual(['A']);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('does not reuse ids already in the document', () => {
    document.body.innerHTML = '<p id="hp-toc-1"></p><div id="src"><div data-hp-toc></div><h1>A</h1></div>';
    const root = document.getElementById('src')!;
    buildTableOfContents(root);
    expect(root.querySelector('h1')!.id).toBe('hp-toc-2');
  });

  it('sets placeholders on author page references', () => {
    const root = mount('<p>See page <a href="#x" data-hp-page-ref>7</a></p><h2 id="x">X</h2>');
    buildTableOfContents(root);
    expect(root.querySelector('a')!.textContent).toBe(PAGE_REF_PLACEHOLDER);
  });
});

describe('resolvePageRefs', () => {
  it('uses the page the target starts on, from the value or href', () => {
    document.body.innerHTML = `
      <div class="p"><span data-hp-page-ref="#b"></span><a href="#a" data-hp-page-ref></a><h2 id="a"></h2></div>
      <div class="p"><p id="b"></p></div>
      <div class="p"><p id="b">continued</p></div>`;
    const pages = Array.from(document.querySelectorAll<HTMLElement>('.p'));
    resolvePageRefs(pages, (i) => `p${i + 1}`);
    expect(document.querySelector('span')!.textContent).toBe('p2');
    expect(document.querySelector('a')!.textContent).toBe('p1');
  });

  it('shows ?? and warns for missing targets', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    document.body.innerHTML = '<div class="p"><span data-hp-page-ref="#nope"></span><span data-hp-page-ref="x"></span></div>';
    resolvePageRefs(Array.from(document.querySelectorAll<HTMLElement>('.p')), () => '1');
    expect(Array.from(document.querySelectorAll('span'), (s) => s.textContent)).toEqual(['??', '??']);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe('createPaginator: table of contents', () => {
  const measurer = (): MeasureAdapter => ({
    measure: (el) => Number(el.getAttribute('data-h') ?? (el.querySelector('[data-h]') ? 50 : 10)),
    pageHeight: () => 60,
  });

  it('fills the TOC with page labels of the rendered pages', () => {
    const source = mount(`
      <nav data-hp-toc data-break="avoid" data-h="20"></nav>
      <h1 data-h="10">One</h1><div data-h="50"></div>
      <h1 data-h="10">Two</h1><p data-h="10">see page <a href="#hp-toc-1" data-hp-page-ref></a></p>`);
    const { pages } = createPaginator({
      source,
      measurer: measurer(),
      pageNumbers: { format: 'upper-roman' },
    }).paginate();
    expect(pages).toHaveLength(3);
    expect(entries(pages[0]!).map((e) => `${e.text} ${e.page}`)).toEqual(['One II', 'Two III']) // One keeps with its block;
    expect(pages[2]!.querySelector('[data-hp-page-ref]:not(.hp-toc-page)')!.textContent).toBe('II');
    // The source is left untouched.
    expect(source.querySelector('.hp-toc-entry')).toBeNull();
    expect(source.querySelector('h1')!.id).toBe('');
  });
});
