import { afterEach, describe, expect, it } from 'vitest';
import { createPaginator, parseDeclarativeConfig, resolvePageConfig } from '../src/index';
import type { MeasureAdapter, PaginatorConfig } from '../src/index';

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

const measurer: MeasureAdapter = { measure: (el) => Number(el.getAttribute('data-h') ?? 0), pageHeight: () => 100 };

function paginate(config: Partial<PaginatorConfig>, markup = '<p data-h="80">a</p><p data-h="80">b</p><p data-h="80">c</p>'): HTMLElement[] {
  document.body.innerHTML = `<div id="src">${markup}</div>`;
  return createPaginator({ source: '#src', measurer, injectStyles: false, ...config }).paginate().pages;
}

const margin = (page: number, config: Parameters<typeof resolvePageConfig>[1], variants = {}) =>
  resolvePageConfig(page, config, undefined, variants).margin;

describe('mirror margins and gutter', () => {
  it('swaps left and right margins on even pages', () => {
    const config = { margin: '1in 0.75in 1in 1.25in', mirrorMargins: true };
    expect(margin(1, config)).toBe('1in 0.75in 1in 1.25in');
    expect(margin(2, config)).toBe('1in 1.25in 1in 0.75in');
  });

  it('adds the gutter to the left margin, or the inside one when mirrored', () => {
    expect(margin(2, { margin: '1in', gutter: '0.5in' })).toBe('1in 1in 1in calc(1in + 0.5in)');
    const mirrored = { margin: '1in 0.5in', gutter: '0.25in', mirrorMargins: true };
    expect(margin(1, mirrored)).toBe('1in 0.5in 1in calc(0.5in + 0.25in)');
    expect(margin(2, mirrored)).toBe('1in calc(0.5in + 0.25in) 1in 0.5in');
  });

  it('leaves the margin untouched without them', () => {
    expect(margin(2, { margin: '10mm 20mm' })).toBe('10mm 20mm');
  });

  it('goes by the page number, so a start of 0 shifts the sides', () => {
    expect(margin(1, { margin: '0 1in 0 2in', mirrorMargins: true }, { pageNumbers: { start: 0 } })).toBe('0 2in 0 1in');
  });

  it('applies to rendered pages, per section and page number', () => {
    const pages = paginate(
      {
        page: { margin: '0 10px 0 30px', mirrorMargins: true, gutter: '5px' },
        sections: { plain: { page: { mirrorMargins: false, gutter: undefined } } },
      },
      '<p data-h="80">a</p><p data-h="80">b</p><p data-h="80" data-section="plain">c</p><p data-h="80">d</p>',
    );
    expect(pages.map((page) => page.style.padding)).toEqual([
      '0px 10px 0px calc(35px)',
      '0px calc(35px) 0px 10px',
      '0px 10px 0px 30px',
      '0px 10px 0px 30px',
    ]);
  });

  it('is read from data-hp-mirror-margins and data-hp-gutter', () => {
    document.body.innerHTML = `
      <template data-hp-config data-hp-margin="1in" data-hp-mirror-margins data-hp-gutter="0.5in">
        <div data-hp-section="loose" data-hp-mirror-margins="false"></div>
      </template>
      <div data-hp-content><p>a</p></div>`;
    const config = parseDeclarativeConfig(document)!;
    expect(config.page).toMatchObject({ mirrorMargins: true, gutter: '0.5in' });
    expect(config.sections?.loose?.page?.mirrorMargins).toBe(false);
  });
});
