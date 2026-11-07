import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPaginator, PAGE_REF_PLACEHOLDER, prepareFields } from '../src/index';
import type { MeasureAdapter } from '../src/index';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const measurer = (): MeasureAdapter => ({
  measure: (el) => Number(el.getAttribute('data-h') ?? 0),
  pageHeight: () => 100,
});

describe('page fields', () => {
  it('measures fields as a placeholder and warns once per unknown name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    document.body.innerHTML = `<div id="r"><span data-hp-field="page">x</span>
      <span data-hp-field="nope">keep</span><span data-hp-field="nope"></span></div>`;
    prepareFields(document.getElementById('r')!);
    const spans = document.querySelectorAll('span');
    expect(spans[0]!.textContent).toBe(PAGE_REF_PLACEHOLDER);
    expect(spans[1]!.textContent).toBe('keep');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('fills each field from the context of its own page', () => {
    document.body.innerHTML = `<div id="src">
      <p data-h="60">Cover</p>
      <p data-h="60" data-section="body">Page <span data-hp-field="pageLabel"></span> of <span data-hp-field="lastPageLabel"></span>
        (sheet <span data-hp-field="page"></span>/<span data-hp-field="totalPages"></span>, <span data-hp-field="section"></span> <span data-hp-field="sectionPage"></span>/<span data-hp-field="sectionPages"></span>)</p>
      <p data-h="60">Page <span data-hp-field="pageNumber"></span> of <span data-hp-field="lastPageNumber"></span></p></div>`;
    const { pages } = createPaginator({
      source: '#src',
      measurer: measurer(),
      sections: { body: { pageNumbers: { start: 1, format: 'upper-roman' } } },
    }).paginate();
    const text = (i: number) => pages[i]!.textContent!.replace(/\s+/g, ' ').trim();
    expect(text(1)).toBe('Page I of II (sheet 2/3, body 1/2)');
    expect(text(2)).toBe('Page 2 of 2');
    // Source untouched.
    expect(document.querySelector('#src [data-hp-field="page"]')!.textContent).toBe('');
  });
});
