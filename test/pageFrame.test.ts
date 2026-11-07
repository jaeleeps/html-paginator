import { afterEach, describe, expect, it } from 'vitest';
import { createPaginator, marginSides, parseDeclarativeConfig } from '../src/index';
import type { MeasureAdapter } from '../src/index';
import { createDomMeasurer } from '../src/measure';

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

const measurer: MeasureAdapter = { measure: (el) => Number(el.getAttribute('data-h') ?? 0), pageHeight: () => 100 };

describe('header / footer distance', () => {
  it('reads the sides of a margin shorthand', () => {
    expect(marginSides('1in')).toEqual(['1in', '1in', '1in', '1in']);
    expect(marginSides('1in 2in')).toEqual(['1in', '2in', '1in', '2in']);
    expect(marginSides('1in 2in 3in')).toEqual(['1in', '2in', '3in', '2in']);
    expect(marginSides(' calc(1in + 2px)  2in 3in 4in ')).toEqual(['calc(1in + 2px)', '2in', '3in', '4in']);
    expect(() => marginSides('')).toThrow(/margin/);
    expect(() => marginSides('1 2 3 4 5')).toThrow(/margin/);
  });

  it('puts header and footer in areas reaching to the margin, padding by distance', () => {
    document.body.innerHTML = '<div id="src"><p data-h="10">a</p></div>';
    const { pages } = createPaginator({
      source: '#src',
      measurer,
      page: {
        margin: '1in 0.75in 1.25in',
        header: '<div>H</div>',
        footer: '<div>F</div>',
        headerDistance: '0.5in',
        footerDistance: '0.4in',
      },
    }).paginate();
    const page = pages[0]!;
    expect(page.style.padding).toBe('0.5in 0.75in 0.4in');
    expect(Array.from(page.children, (c) => c.className)).toEqual(['hp-header-area', 'hp-body', 'hp-footer-area']);
    const header = page.querySelector<HTMLElement>('.hp-header-area')!;
    const footer = page.querySelector<HTMLElement>('.hp-footer-area')!;
    expect(header.firstElementChild!.className).toBe('hp-header');
    expect(header.style.minHeight).toBe('calc(1in - 0.5in)');
    expect(footer.firstElementChild!.className).toBe('hp-footer');
    expect(footer.style.minHeight).toBe('calc(1.25in - 0.4in)');
    expect(footer.style.justifyContent).toBe('flex-end');
  });

  it('keeps the margin on a side without that slot, and the plain layout without distances', () => {
    document.body.innerHTML = '<div id="src"><p data-h="10">a</p></div>';
    const run = (page: object) =>
      createPaginator({ source: '#src', measurer, page: { margin: '1in', ...page } }).paginate().pages[0]!;
    const noFooter = run({ header: 'H', headerDistance: '0.5in', footerDistance: '0.5in' });
    expect(noFooter.style.padding).toBe('0.5in 1in 1in');
    const plain = run({ header: '<div>H</div>' });
    expect(plain.style.padding).toBe('1in');
    expect(plain.firstElementChild!.className).toBe('hp-header');
  });

  it('measures probes with the same frame', () => {
    const m = createDomMeasurer({
      document,
      page: { margin: '1in', header: '<div>H</div>', headerDistance: '0.5in' },
    });
    m.pageHeight(1);
    const probe = document.body.lastElementChild as HTMLElement;
    expect(probe.style.padding).toBe('0.5in 1in 1in');
    expect(probe.firstElementChild!.className).toBe('hp-header-area');
    m.dispose();
  });

  it('is read from data-hp-header-distance / data-hp-footer-distance', () => {
    document.body.innerHTML =
      '<div data-hp-content data-hp-header-distance="0.5in" data-hp-footer-distance="0.3in"><p>a</p></div>';
    expect(parseDeclarativeConfig(document)!.page).toEqual({ headerDistance: '0.5in', footerDistance: '0.3in' });
  });
});
