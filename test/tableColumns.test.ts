import { afterEach, describe, expect, it, vi } from 'vitest';
import { domWrap, FROZEN_COLUMNS_ATTRIBUTE, freezeTableColumns } from '../src/index';

/** Stub widths: cells by data-w, tables by the sum of their first row. */
function stubLayout(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const w = this instanceof HTMLTableElement
      ? Array.from(this.rows[0]?.cells ?? []).reduce((n, c) => n + Number(c.dataset.w ?? 0), 0)
      : Number(this.dataset.w ?? 0);
    return { width: w, height: 0, top: 0, left: 0, right: w, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
}

const run = (fn: () => void) => fn();

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('freezeTableColumns', () => {
  it('freezes auto-layout widths as percentages with a fixed layout', () => {
    stubLayout();
    document.body.innerHTML = `<div id="item"><table><caption>c</caption><tbody>
      <tr><td colspan="2" data-w="300">wide</td></tr>
      <tr><td data-w="100">a</td><td data-w="200">b</td></tr></tbody></table></div>`;
    const item = document.getElementById('item')!;
    const layout = vi.fn(run);
    freezeTableColumns(item, layout);
    expect(layout).toHaveBeenCalledOnce();

    const table = item.querySelector('table')!;
    expect(table.hasAttribute(FROZEN_COLUMNS_ATTRIBUTE)).toBe(true);
    expect(table.style.tableLayout).toBe('fixed');
    expect(table.style.width).toBe('75%'); // 300 of 400
    // After the caption, from the first row without spans.
    expect(table.children[1]!.tagName).toBe('COLGROUP');
    const cols = Array.from(table.querySelectorAll('col'), (c) => parseFloat(c.style.width).toFixed(2));
    expect(cols).toEqual(['33.33', '66.67']);
  });

  it('keeps author widths and columns, and freezes once', () => {
    stubLayout();
    document.body.innerHTML = `<table id="a" style="width: 50%"><tr><td data-w="100">a</td></tr></table>
      <table id="b"><colgroup><col></colgroup><tr><td data-w="100">b</td></tr></table>`;
    const a = document.getElementById('a') as HTMLTableElement;
    freezeTableColumns(a, run);
    freezeTableColumns(a, run);
    expect(a.style.width).toBe('50%');
    expect(a.querySelectorAll('colgroup')).toHaveLength(1);

    const b = document.getElementById('b') as HTMLTableElement;
    freezeTableColumns(b, run);
    expect(b.hasAttribute(FROZEN_COLUMNS_ATTRIBUTE)).toBe(false);
  });

  it('skips tables that are not laid out, or without a plain row', () => {
    document.body.innerHTML = '<table id="a"><tr><td>a</td></tr></table><table id="b"><tr><td colspan="2">x</td></tr></table>';
    freezeTableColumns(document.getElementById('a')!, run);
    stubLayout();
    freezeTableColumns(document.getElementById('b')!, run);
    expect(document.querySelectorAll('colgroup')).toHaveLength(0);
  });

  it('does not lay out elements without tables', () => {
    document.body.innerHTML = '<p>text</p>';
    const layout = vi.fn(run);
    freezeTableColumns(document.querySelector('p')!, layout);
    expect(layout).not.toHaveBeenCalled();
  });
});

describe('domWrap with column groups', () => {
  it('copies colgroups to every fragment, after the caption', () => {
    document.body.innerHTML = `<table><caption>c</caption><colgroup><col style="width: 30%"><col></colgroup>
      <thead><tr><th>h</th></tr></thead><tbody><tr><td>1</td></tr><tr><td>2</td></tr></tbody></table>`;
    const table = document.querySelector('table')!;
    const [r1, r2] = Array.from(table.tBodies[0]!.rows);
    const head = domWrap(table, [r1!], { continuation: false });
    const tail = domWrap(table, [r2!], { continuation: true });
    expect(Array.from(head.children, (c) => c.tagName)).toEqual(['CAPTION', 'COLGROUP', 'THEAD', 'TBODY']);
    expect(Array.from(tail.children, (c) => c.tagName)).toEqual(['COLGROUP', 'TBODY']);
  });
});
