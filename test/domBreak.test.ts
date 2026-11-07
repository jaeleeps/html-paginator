import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BREAK_ATTRIBUTE,
  CONTINUED_ATTRIBUTE,
  createDomBreaker,
  domChildren,
  domWrap,
  getBreakBehavior,
  hasPageBreakBefore,
  markForcedBreaks,
  warnNestedBreakAttributes,
} from '../src/domBreak';
import { distribute } from '../src/distribute';

function html(markup: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = markup.trim();
  return div.firstElementChild as HTMLElement;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('getBreakBehavior', () => {
  it('defaults to auto without the attribute', () => {
    expect(getBreakBehavior(html('<div></div>'))).toBe('auto');
  });

  it('reads valid values', () => {
    expect(getBreakBehavior(html('<div data-break="avoid"></div>'))).toBe('avoid');
    expect(getBreakBehavior(html('<div data-break="clip"></div>'))).toBe('clip');
    expect(getBreakBehavior(html('<div data-break="auto"></div>'))).toBe('auto');
  });

  it('warns and falls back to auto on invalid values', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getBreakBehavior(html('<div data-break="nope"></div>'))).toBe('auto');
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain('invalid data-break="nope"');
  });
});

describe('warnNestedBreakAttributes', () => {
  it('warns for avoid/clip nested inside avoid/clip', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const root = html(`
      <div>
        <section data-break="avoid">
          <div data-break="clip">inner</div>
        </section>
      </div>`);
    warnNestedBreakAttributes(root);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain('nested data-break="clip" is ignored');
  });

  it('does not warn for siblings or avoid inside auto', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const root = html(`
      <div>
        <div data-break="avoid">a</div>
        <div data-break="avoid">b</div>
        <div data-break="auto"><div data-break="avoid">ok</div></div>
      </div>`);
    warnNestedBreakAttributes(root);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('domChildren', () => {
  it('returns element children, ignoring whitespace-only text', () => {
    const el = html('<div>\n  <p>a</p>\n  <p>b</p>\n</div>');
    expect(domChildren(el).map((c) => c.textContent)).toEqual(['a', 'b']);
  });

  it('treats elements with direct text as atomic (mixed inline content)', () => {
    expect(domChildren(html('<div>text<p>a</p><p>b</p></div>'))).toEqual([]);
    expect(domChildren(html('<p>Hello <b>world</b>!</p>'))).toEqual([]);
  });

  it('ignores text nested deeper than direct children', () => {
    const el = html('<div><p>a <b>b</b></p><p>c</p></div>');
    expect(domChildren(el)).toHaveLength(2);
  });

  it('returns [] for leaves', () => {
    expect(domChildren(html('<p>only text</p>'))).toEqual([]);
  });

  it('returns tbody rows for tables (not thead/tfoot rows)', () => {
    const table = html(`
      <table>
        <thead><tr><th>h</th></tr></thead>
        <tbody><tr><td>1</td></tr><tr><td>2</td></tr></tbody>
        <tfoot><tr><td>f</td></tr></tfoot>
      </table>`);
    const rows = domChildren(table);
    expect(rows.map((r) => r.textContent)).toEqual(['1', '2']);
  });

  it('never splits rows at cell level', () => {
    // <tr> needs a table context to parse
    const table = html('<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>');
    const row = table.querySelector('tr') as HTMLElement;
    expect(domChildren(row)).toEqual([]);
  });
});

describe('domWrap', () => {
  it('shallow-clones the wrapper with attributes and appends children', () => {
    const el = html('<section class="box" data-break="auto"><p>a</p><p>b</p></section>');
    const [a] = domChildren(el);
    const frag = domWrap(el, [a!], { continuation: false });
    expect(frag.tagName).toBe('SECTION');
    expect(frag.className).toBe('box');
    expect(frag.children).toHaveLength(1);
    expect(frag.hasAttribute(CONTINUED_ATTRIBUTE)).toBe(false);
  });

  it('marks continuation fragments', () => {
    const el = html('<div><p>a</p></div>');
    const frag = domWrap(el, domChildren(el), { continuation: true });
    expect(frag.hasAttribute(CONTINUED_ATTRIBUTE)).toBe(true);
  });

  const tableMarkup = `
    <table>
      <caption>Cap</caption>
      <thead><tr><th>h</th></tr></thead>
      <tbody><tr><td>1</td></tr><tr><td>2</td></tr></tbody>
    </table>`;

  it('rebuilds tables: first fragment gets caption + thead + tbody rows', () => {
    const table = html(tableMarkup);
    const rows = domChildren(table);
    const frag = domWrap(table, [rows[0]!], { continuation: false }) as HTMLTableElement;
    expect(frag.caption?.textContent).toBe('Cap');
    expect(frag.tHead).not.toBeNull();
    expect(frag.tBodies[0]?.rows).toHaveLength(1);
  });

  it('table continuations omit thead by default', () => {
    const table = html(tableMarkup);
    const rows = domChildren(table);
    const frag = domWrap(table, [rows[1]!], { continuation: true }) as HTMLTableElement;
    expect(frag.caption).toBeNull();
    expect(frag.tHead).toBeNull();
    expect(frag.tBodies[0]?.rows).toHaveLength(1);
  });

  const footMarkup = `
    <table>
      <thead><tr><th>h</th></tr></thead>
      <tbody><tr><td>1</td></tr><tr><td>2</td></tr><tr><td>3</td></tr></tbody>
      <tfoot><tr><td>total</td></tr></tfoot>
    </table>`;

  it('puts tfoot only on the fragment holding the last row', () => {
    const table = html(footMarkup);
    const [r1, r2, r3] = domChildren(table);
    const head = domWrap(table, [r1!, r2!], { continuation: false }) as HTMLTableElement;
    const tail = domWrap(table, [r3!], { continuation: true }) as HTMLTableElement;
    expect(head.tFoot).toBeNull();
    expect(tail.tFoot?.textContent).toBe('total');
  });

  it('keeps tfoot when a fragment is split again', () => {
    const table = html(footMarkup);
    const [, r2, r3] = domChildren(table);
    const tail = domWrap(table, [r2!, r3!], { continuation: true }) as HTMLTableElement;
    const [t2, t3] = domChildren(tail);
    expect(t2).toBe(r2);
    const mid = domWrap(tail, [t2!], { continuation: true }) as HTMLTableElement;
    const end = domWrap(tail, [t3!], { continuation: true }) as HTMLTableElement;
    expect(mid.tFoot).toBeNull();
    expect(end.tFoot?.textContent).toBe('total');
  });

  it('orders table sections caption, thead, tbody, tfoot', () => {
    const table = html(footMarkup.replace('<thead>', '<caption>c</caption><thead>'));
    const frag = domWrap(table, domChildren(table), { continuation: false });
    expect(Array.from(frag.children, (c) => c.tagName)).toEqual([
      'CAPTION',
      'THEAD',
      'TBODY',
      'TFOOT',
    ]);
  });

  it('table continuations repeat thead with repeatTableHead (but never caption)', () => {
    const table = html(tableMarkup);
    const rows = domChildren(table);
    const frag = domWrap(table, [rows[1]!], { continuation: true }, { repeatTableHead: true }) as HTMLTableElement;
    expect(frag.tHead).not.toBeNull();
    expect(frag.caption).toBeNull();
  });
});

describe('integration: distribute + createDomBreaker', () => {
  it('splits DOM content across pages honoring data-break', () => {
    const source = html(`
      <div>
        <section>
          <p data-h="30">one</p>
          <p data-h="30">two</p>
          <div data-break="avoid">
            <p data-h="20">keep-a</p>
            <p data-h="20">keep-b</p>
          </div>
        </section>
      </div>`);

    // Height model: leaves report data-h; containers sum their children.
    const measure = (el: HTMLElement): number => {
      const own = el.getAttribute('data-h');
      if (own) return parseInt(own, 10);
      return domChildren(el).reduce((sum, c) => sum + measure(c), 0);
    };

    const pages = distribute<HTMLElement>({
      items: domChildren(source),
      measure,
      pageHeight: () => 60,
      ...createDomBreaker(),
    });

    // Fragments contain only element children (whitespace text nodes are not
    // carried over), so collect leaf <p> texts per page.
    const texts = pages.map((p) =>
      p.items.flatMap((i) => Array.from(i.querySelectorAll('p'), (n) => n.textContent)),
    );
    expect(texts).toEqual([
      ['one', 'two'],
      ['keep-a', 'keep-b'],
    ]);
    // Continuation fragment marked
    expect(pages[1]?.items[0]?.hasAttribute(CONTINUED_ATTRIBUTE)).toBe(true);
    // avoid block intact inside the continuation
    expect(pages[1]?.items[0]?.querySelector(`[${BREAK_ATTRIBUTE}="avoid"]`)).not.toBeNull();
  });
});

describe('markForcedBreaks', () => {
  /** Mount `markup` as a live source, clone it, mark breaks on the clone. */
  function marked(markup: string, css = ''): HTMLElement {
    document.head.innerHTML = css ? `<style>${css}</style>` : '';
    document.body.innerHTML = `<div id="src">${markup}</div>`;
    const source = document.getElementById('src') as HTMLElement;
    const copy = source.cloneNode(true) as HTMLElement;
    markForcedBreaks(source, copy);
    return copy;
  }

  const breaking = (copy: HTMLElement) =>
    Array.from(copy.querySelectorAll<HTMLElement>('*'))
      .filter(hasPageBreakBefore)
      .map((el) => el.id);

  afterEach(() => {
    document.head.innerHTML = '';
  });

  it('keeps data-break-before="page"', () => {
    expect(breaking(marked('<p id="a"></p><p id="b" data-break-before="page"></p>'))).toEqual(['b']);
  });

  it('moves data-break-after="page" onto the next element', () => {
    expect(breaking(marked('<p id="a" data-break-after="page"></p><p id="b"></p>'))).toEqual(['b']);
  });

  it('climbs out of containers to find the element after a break', () => {
    const copy = marked('<div id="a"><p id="a1"></p><p id="a2" data-break-after="page"></p></div><p id="b"></p>');
    expect(breaking(copy)).toEqual(['b']);
  });

  it('ignores a break after the very last element', () => {
    expect(breaking(marked('<p id="a"></p><p id="b" data-break-after="page"></p>'))).toEqual([]);
  });

  it('reads CSS break-before/after and legacy page-break-* from stylesheets', () => {
    const copy = marked(
      '<h2 id="a" class="chapter"></h2><p id="b" class="end"></p><p id="c"></p><p id="d" style="break-before: page"></p>',
      '.chapter { page-break-before: always } .end { break-after: page }',
    );
    expect(breaking(copy)).toEqual(['a', 'c', 'd']);
  });

  it('ignores non-forcing values', () => {
    const copy = marked('<p id="a" style="break-before: auto"></p><p id="b" style="break-after: avoid"></p><p id="c"></p>');
    expect(breaking(copy)).toEqual([]);
  });

  it('does not touch the source', () => {
    marked('<p id="a" data-break-after="page"></p><p id="b"></p>');
    expect(document.querySelectorAll('[data-break-before]')).toHaveLength(0);
  });
});
