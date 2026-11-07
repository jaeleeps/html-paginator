import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPaginator, numberSequences, resolveCrossRefs } from '../src/index';
import type { MeasureAdapter } from '../src/index';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function mount(markup: string): HTMLElement {
  document.body.innerHTML = `<div id="r">${markup}</div>`;
  return document.getElementById('r')!;
}

describe('numberSequences / resolveCrossRefs', () => {
  it('numbers each sequence separately, in its format', () => {
    const root = mount(`
      <figure id="f1"><figcaption>Figure <span data-hp-seq="Figure">?</span>: A</figcaption></figure>
      <table id="t1"><caption>Table <span data-hp-seq="Table" data-hp-seq-format="upper-alpha"></span></caption></table>
      <figure><figcaption>Figure <span data-hp-seq="Figure" id="f2"></span>: B</figcaption></figure>`);
    expect(numberSequences(root)).toHaveLength(3);
    expect(Array.from(root.querySelectorAll('[data-hp-seq]'), (s) => s.textContent)).toEqual(['1', 'A', '2']);
  });

  it('prefixes the chapter number and restarts in each chapter', () => {
    const root = mount(`
      <nav data-hp-toc><h1>Contents</h1></nav>
      <h1 data-hp-toc-skip>Preface</h1>
      <p><span data-hp-seq="Figure" data-hp-seq-chapter="1"></span></p>
      <div data-hp-seq-chapter="1">
        <h1>One</h1>
        <p><span data-hp-seq="Figure"></span><span data-hp-seq="Table"></span></p>
        <p id="f2"><span data-hp-seq="Figure"></span></p>
        <h1>Two</h1>
        <h2>Two.One</h2>
        <p><span data-hp-seq="Figure"></span></p>
        <p><span data-hp-seq="Table" data-hp-seq-separator="." data-hp-seq-format="upper-alpha"></span></p>
        <p><span data-hp-seq="Eq" data-hp-seq-chapter="2"></span></p>
        <h2>Two.Two</h2>
        <p><span data-hp-seq="Eq" data-hp-seq-chapter="2"></span><span data-hp-seq="Eq" data-hp-seq-chapter="2"></span></p>
      </div>
      <p><span data-hp-seq="Figure"></span></p>
      <p><a href="#f2" data-hp-ref></a></p>`);
    const seqs = numberSequences(root);
    expect(seqs.map((s) => s.textContent)).toEqual([
      '0-1', // before the first chapter (the TOC title and skipped headings do not count)
      '1-1', '1-1', '1-2',
      '2-1', '2.A',
      '2.1-1', '2.2-1', '2.2-2',
      '2', // outside the chapter-numbered container: the count continues (Word's SEQ without \s)
    ]);
    resolveCrossRefs(root);
    expect(root.querySelector('a')!.textContent).toBe('Figure 1-2');
  });

  it('leaves out unused leading levels (h2 chapters without h1)', () => {
    const root = mount(`<div data-hp-seq-chapter="2">
      <h2>A</h2><span data-hp-seq="Figure"></span>
      <h2>B</h2><span data-hp-seq="Figure"></span><span data-hp-seq="Figure"></span>
      <h1>Part</h1><span data-hp-seq="Figure"></span><h2>C</h2><span data-hp-seq="Figure"></span></div>`);
    expect(numberSequences(root).map((s) => s.textContent)).toEqual(['1-1', '2-1', '2-2', '1.0-1', '1.1-1']);
  });

  it('ignores an invalid chapter level with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const root = mount('<h1>A</h1><span data-hp-seq="Figure" data-hp-seq-chapter="7"></span>');
    expect(numberSequences(root)[0]!.textContent).toBe('1');
    expect(warn).toHaveBeenCalled();
  });

  it('resolves references by href or value, as label or number', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const root = mount(`
      <p><a href="#f2" data-hp-ref></a>, <span data-hp-ref="#t1"></span>, <a href="#f1" data-hp-ref="number"></a>,
        <a href="#nope" data-hp-ref></a>, <a href="#plain" data-hp-ref></a></p>
      <figure id="f1"><figcaption><span data-hp-seq="Figure"></span></figcaption></figure>
      <table id="t1"><caption><span data-hp-seq="Table"></span></caption></table>
      <p id="plain">no number</p>
      <span data-hp-seq="Figure" id="f2"></span>`);
    numberSequences(root);
    resolveCrossRefs(root);
    expect(root.querySelector('p')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Figure 2, Table 1, 1, ??, ??');
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe('createPaginator: captions', () => {
  const measurer = (): MeasureAdapter => ({
    measure: (el) => Number(el.getAttribute('data-h') ?? 10),
    pageHeight: () => 100,
  });

  it('lists a sequence in data-hp-toc="Figure" with pages', () => {
    document.body.innerHTML = `<div id="src">
      <nav data-hp-toc="Figure" data-h="20"></nav>
      <p data-h="80">See <a href="#sales" data-hp-ref></a>.</p>
      <figure id="sales" data-h="30"><figcaption>Figure <span data-hp-seq="Figure"></span>. Sales</figcaption></figure>
      <figure data-h="80"><figcaption>Figure <span data-hp-seq="Figure"></span>. Costs</figcaption></figure>
      <h1 data-h="10">Not listed</h1></div>`;
    const { pages } = createPaginator({ source: '#src', measurer: measurer() }).paginate();
    const entries = Array.from(pages[0]!.querySelectorAll('.hp-toc-entry'), (e) => e.textContent);
    expect(entries).toEqual(['Figure 1. Sales2', 'Figure 2. Costs3']);
    expect(pages[0]!.querySelector('p')!.textContent).toBe('See Figure 1.');
    // Source untouched.
    expect(document.querySelector('#src [data-hp-seq]')!.textContent).toBe('');
  });
});
