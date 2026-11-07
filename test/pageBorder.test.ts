import { afterEach, describe, expect, it } from 'vitest';
import { createPaginator, parseDeclarativeConfig } from '../src/index';
import type { MeasureAdapter, PaginatorConfig } from '../src/index';

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

const measurer: MeasureAdapter = { measure: (el) => Number(el.getAttribute('data-h') ?? 0), pageHeight: () => 100 };

function paginate(config: Partial<PaginatorConfig>): HTMLElement[] {
  document.body.innerHTML = `<div id="src">
    <p data-h="60">a</p><p data-h="60">b</p><p data-h="60" data-section="plain">c</p></div>`;
  return createPaginator({ source: '#src', measurer, injectStyles: false, ...config }).paginate().pages;
}

const frame = (page: HTMLElement) => page.querySelector<HTMLElement>('.hp-page-border');

describe('pageBorder', () => {
  it('draws the border in from the sheet edge (Word default: 24pt)', () => {
    const pages = paginate({ page: { pageBorder: '2px solid red' } });
    const f = frame(pages[0]!)!;
    expect(f.style.position).toBe('absolute');
    expect(f.style.boxSizing).toBe('border-box');
    expect(f.style.inset).toBe('24pt');
    expect(f.style.border).toBe('2px solid red');
    expect(f.style.pointerEvents).toBe('none');
    expect(pages[0]!.style.position).toBe('relative');
  });

  it('draws it around the margins, measured from the text', () => {
    const pages = paginate({
      page: { margin: '1in 0.5in', pageBorder: { border: '1px dashed', from: 'text', offset: '6px' } },
    });
    const f = frame(pages[0]!)!;
    expect([f.style.top, f.style.right, f.style.bottom, f.style.left]).toEqual(['1in', '0.5in', '1in', '0.5in']);
    expect(f.style.outline).toBe('1px dashed');
    expect(f.style.outlineOffset).toBe('6px');
    expect(f.style.border).toBe('');
  });

  it('follows page layers: off on the first page, per section', () => {
    const pages = paginate({
      page: { pageBorder: '1px solid' },
      firstPage: { pageBorder: null },
      sections: { plain: { page: { pageBorder: { border: '3px double', offset: '12pt' } } } },
    });
    expect(pages.map((page) => frame(page)?.style.inset ?? null)).toEqual([null, '24pt', '12pt']);
  });

  it('rejects an unknown origin and is read from data-hp-page-border attributes', () => {
    expect(() => paginate({ page: { pageBorder: { border: '1px solid', from: 'margin' as never } } })).toThrow(
      /pageBorder.from must be edge or text/,
    );
    document.body.innerHTML = `
      <template data-hp-config data-hp-page-border="1px solid #000" data-hp-page-border-from="text"
        data-hp-page-border-offset="4pt">
        <div data-hp-page="first" data-hp-page-border="none"></div>
      </template>
      <div data-hp-content><p>a</p></div>`;
    const config = parseDeclarativeConfig(document)!;
    expect(config.page?.pageBorder).toEqual({ border: '1px solid #000', from: 'text', offset: '4pt' });
    expect(config.firstPage?.pageBorder).toBeNull();
  });
});
