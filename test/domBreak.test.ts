import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BREAK_ATTRIBUTE,
  CONTINUED_ATTRIBUTE,
  createDomBreaker,
  domChildren,
  domWrap,
  getBreakBehavior,
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
  it('returns element children, skipping text nodes', () => {
    const el = html('<div>text<p>a</p><p>b</p></div>');
    expect(domChildren(el).map((c) => c.textContent)).toEqual(['a', 'b']);
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
