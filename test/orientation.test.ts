import { afterEach, describe, expect, it } from 'vitest';
import { buildStylesheet, createPageLayout, createPaginator, resolveSize } from '../src/index';
import type { MeasureAdapter } from '../src/index';
import { pageSizeName } from '../src/pageConfig';

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('orientation', () => {
  it('swaps the size for landscape', () => {
    expect(resolveSize('a4', 'landscape')).toEqual({ width: '297mm', height: '210mm' });
    expect(resolveSize({ width: '8.5in', height: '11in' }, 'landscape')).toEqual({ width: '11in', height: '8.5in' });
    expect(resolveSize(undefined, 'portrait')).toEqual({ width: '8.5in', height: '11in' });
    expect(() => resolveSize('a4', 'sideways' as never)).toThrow(/unknown orientation "sideways"/);
  });

  it('lets a section turn sideways while keeping the size', () => {
    const layout = createPageLayout({
      page: { size: 'a4' },
      sections: { wide: { page: { orientation: 'landscape' } } },
    });
    layout.open(1, { sectionStart: true, blank: false });
    layout.open(2, { section: 'wide', sectionStart: true, blank: false });
    expect(layout.config(1).size).toEqual({ width: '210mm', height: '297mm' });
    expect(layout.config(2).size).toEqual({ width: '297mm', height: '210mm' });
  });

  it('declares a named @page per size', () => {
    const css = buildStylesheet({ width: '8.5in', height: '11in' }, [
      { width: '8.5in', height: '11in' },
      { width: '11in', height: '8.5in' },
      { width: '8.5in', height: '11in' },
    ]);
    expect(css.match(/@page hp-[\w-]+ \{/g)).toEqual(['@page hp-8_5in-11in {', '@page hp-11in-8_5in {']);
    expect(css).toContain('@page hp-11in-8_5in {\n  size: 11in 8.5in;\n  margin: 0;\n}');
    expect(pageSizeName({ width: '297mm', height: '210mm' })).toBe('hp-297mm-210mm');
  });

  it('renders landscape section pages with their own size and named page', () => {
    document.body.innerHTML = `<div id="src"><p data-h="50">a</p>
      <div data-section="wide" data-h="50">wide table</div><p data-section="body" data-h="50">b</p></div>`;
    const measurer: MeasureAdapter = { measure: (el) => Number(el.getAttribute('data-h') ?? 0), pageHeight: () => 100 };
    const { pages } = createPaginator({
      source: '#src',
      measurer,
      page: { size: 'letter' },
      sections: { wide: { page: { orientation: 'landscape' } } },
    }).paginate();
    expect(pages.map((p) => `${p.style.width}x${p.style.height}`)).toEqual(['8.5inx11in', '11inx8.5in', '8.5inx11in']);
    const css = document.head.querySelector('style[data-hp-styles]')!.textContent!;
    expect(css).toContain('@page hp-11in-8_5in');
  });
});
