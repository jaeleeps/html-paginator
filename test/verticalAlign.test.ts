import { afterEach, describe, expect, it } from 'vitest';
import { createPaginator, parseDeclarativeConfig } from '../src/index';
import type { MeasureAdapter, PaginatorConfig } from '../src/index';

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

const measurer: MeasureAdapter = { measure: (el) => Number(el.getAttribute('data-h') ?? 0), pageHeight: () => 100 };

function paginate(markup: string, config: Partial<PaginatorConfig>): HTMLElement[] {
  document.body.innerHTML = `<div id="src">${markup}</div>`;
  return createPaginator({ source: '#src', measurer, injectStyles: false, ...config }).paginate().pages;
}

/** How a page's body content is aligned: the wrapper's auto margins, or 'top'. */
const alignment = (page: HTMLElement): string => {
  const content = page.querySelector<HTMLElement>('.hp-body-content');
  if (!content) return 'top';
  return content.style.marginBottom === 'auto' ? 'center' : 'bottom';
};

describe('verticalAlign', () => {
  it('centers or bottom-aligns the body content, per page settings', () => {
    const pages = paginate('<h1 data-h="20">Title</h1><p data-h="20" data-break-before="page">a</p>', {
      page: { verticalAlign: 'bottom' },
      firstPage: { verticalAlign: 'center' },
    });
    expect(pages.map(alignment)).toEqual(['center', 'bottom']);
    const body = pages[0]!.querySelector<HTMLElement>('.hp-body')!;
    expect(body.style.display).toBe('flex');
    expect(body.style.flexDirection).toBe('column');
    // The items are inside the wrapper, in order.
    expect(body.querySelector('.hp-body-content > h1')?.textContent).toBe('Title');
  });

  it('leaves top-aligned pages unwrapped', () => {
    const pages = paginate('<p data-h="20">a</p>', {});
    expect(pages[0]!.querySelector('.hp-body-content')).toBeNull();
    expect(pages[0]!.querySelector('.hp-body > p')).not.toBeNull();
  });

  it('applies to a section and to each of its columns', () => {
    const pages = paginate(
      `<p data-h="20">a</p>
       <p data-h="80" data-section="cover">b</p><p data-h="80">c</p>`,
      { sections: { cover: { page: { verticalAlign: 'center', columns: 2 } } } },
    );
    expect(pages.map(alignment)).toEqual(['top', 'center']);
    const columns = Array.from(pages[1]!.querySelectorAll('.hp-column-body'), (c) =>
      c.querySelector('.hp-body-content')?.textContent?.trim(),
    );
    expect(columns).toEqual(['b', 'c']);
  });

  it('keeps overflowing pages and pages with several sections at the top', () => {
    const pages = paginate(
      `<p data-h="150" data-break="avoid">tall</p>
       <p data-h="20" data-break-before="page">x</p><p data-h="20" data-section="more">y</p>`,
      { page: { verticalAlign: 'center' }, sections: { more: { start: 'continuous' } } },
    );
    expect(pages.map(alignment)).toEqual(['top', 'top']);
  });

  it('rejects unknown values and is read from data-hp-vertical-align', () => {
    expect(() => paginate('<p data-h="20">a</p>', { page: { verticalAlign: 'middle' as never } })).toThrow(
      /verticalAlign must be top, center or bottom/,
    );
    document.body.innerHTML = `
      <template data-hp-config data-hp-vertical-align="bottom">
        <div data-hp-section="cover" data-hp-vertical-align="center"></div>
      </template>
      <div data-hp-content><p>a</p></div>`;
    const config = parseDeclarativeConfig(document)!;
    expect(config.page?.verticalAlign).toBe('bottom');
    expect(config.sections?.cover?.page?.verticalAlign).toBe('center');
  });
});
