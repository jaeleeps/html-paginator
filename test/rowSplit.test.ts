import { describe, expect, it, vi } from 'vitest';
import { createRowSplitter } from '../src/index';

/** jsdom has no layout: `layout` just runs the callback. */
const splitter = (layout = vi.fn((_el: HTMLElement, _page: number, fn: () => unknown) => fn())) => ({
  layout,
  split: createRowSplitter({ layout: layout as never }),
});

function row(markup: string): HTMLTableRowElement {
  document.body.innerHTML = `<table><tbody>${markup}</tbody></table>`;
  return document.querySelector('tr')!;
}

describe('createRowSplitter', () => {
  it('ignores anything but rows', () => {
    const { split, layout } = splitter();
    document.body.innerHTML = '<p>text</p>';
    expect(split(document.querySelector('p')!, () => true, { page: 1 })).toBeNull();
    expect(layout).not.toHaveBeenCalled();
  });

  it('never splits rows of a table with row spans', () => {
    const { split, layout } = splitter();
    const tr = row('<tr><td>a</td><td rowspan="2">b</td></tr><tr><td>c</td></tr>');
    expect(split(tr, () => true, { page: 1 })).toBeNull();
    expect(split(document.querySelectorAll('tr')[1]!, () => true, { page: 1 })).toBeNull();
    expect(layout).not.toHaveBeenCalled();
  });

  it('gives up without a layout engine, leaving the row intact', () => {
    const { split, layout } = splitter();
    const tr = row('<tr><td>a<br>b<br>c<br>d</td></tr>');
    expect(split(tr, () => true, { page: 2 })).toBeNull();
    // Attached to the document: the row is laid out as is (only detached wrappers are climbed).
    expect(layout).toHaveBeenCalledWith(tr, 2, expect.any(Function));
    expect(tr.textContent).toBe('abcd');
  });
});
