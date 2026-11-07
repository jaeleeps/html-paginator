import { afterEach, describe, expect, it } from 'vitest';
import { createPaginator, parseDeclarativeConfig } from '../src/index';
import type { MeasureAdapter } from '../src/index';

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

const measurer: MeasureAdapter = { measure: (el) => Number(el.getAttribute('data-h') ?? 0), pageHeight: () => 100 };

describe('watermark', () => {
  it('renders a layer behind each page, with the page context, following page layers', () => {
    document.body.innerHTML = '<div id="src"><p data-h="80">a</p><p data-h="80">b</p><p data-h="80">c</p></div>';
    const { pages } = createPaginator({
      source: '#src',
      measurer,
      page: { watermark: ({ page }) => `<span>DRAFT ${page}</span>`, footer: 'F' },
      firstPage: { watermark: null },
      pageOverrides: { 3: { watermark: 'FINAL' } },
    }).paginate();
    const marks = pages.map((p) => p.querySelector('.hp-watermark')?.textContent ?? null);
    expect(marks).toEqual([null, 'DRAFT 2', 'FINAL']);

    const page = pages[1]!;
    const layer = page.querySelector<HTMLElement>('.hp-watermark')!;
    expect(page.firstElementChild).toBe(layer);
    expect(page.style.position).toBe('relative');
    expect(layer.style.position).toBe('absolute');
    expect(layer.style.pointerEvents).toBe('none');
    // The flow is unchanged: body and footer follow.
    expect(Array.from(page.children, (c) => c.className)).toEqual(['hp-watermark', 'hp-body', 'hp-footer']);
    expect(pages[0]!.style.position).toBe('');
  });

  it('is read from data-hp-watermark slots', () => {
    document.body.innerHTML = `
      <template data-hp-config><div data-hp-watermark>DRAFT {{page}}</div>
        <div data-hp-page="first"><div data-hp-watermark="none"></div></div></template>
      <div data-hp-content><p>a</p></div>`;
    const config = parseDeclarativeConfig(document)!;
    expect(config.firstPage?.watermark).toBeNull();
    const template = config.page!.watermark as (ctx: { page: number; totalPages: number }) => string;
    expect(typeof template).toBe('function');
    expect(String(template({ page: 2, totalPages: 3 }))).toContain('DRAFT 2');
  });
});
