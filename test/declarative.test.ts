import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  autoPaginate,
  bindPrintPagination,
  parseDeclarativeConfig,
} from '../src/declarative';
import type { MeasureAdapter, PageContext } from '../src/types';

// jsdom has no layout; inject fixed metrics for pagination tests.
const measurer: MeasureAdapter = { measure: () => 10, pageHeight: () => 60 };

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

function render(tpl: unknown, ctx: PageContext): string {
  expect(typeof tpl).toBe('function');
  return (tpl as (ctx: PageContext) => string)(ctx);
}

const FULL_MARKUP = `
  <template data-hp-config data-hp-size="a4" data-hp-margin="0.6in" data-hp-repeat-table-head>
    <div class="hd" data-hp-header>Page {{page}} of {{totalPages}}</div>
    <div class="ft" data-hp-footer>{{ page }} / {{ totalPages }}</div>
    <div data-hp-page="1" data-hp-margin="1in">
      <div class="cover" data-hp-header><h1>Cover</h1></div>
      <div data-hp-footer="none"></div>
    </div>
    <div data-hp-page="2">
      <div class="slim" data-hp-header>Slim</div>
    </div>
  </template>
  <div id="src" data-hp-content><p>a</p></div>
`;

describe('parseDeclarativeConfig', () => {
  it('returns null without a data-hp-content element', () => {
    document.body.innerHTML = '<div><p>a</p></div>';
    expect(parseDeclarativeConfig(document)).toBeNull();
  });

  it('parses page attributes from the config element', () => {
    document.body.innerHTML = FULL_MARKUP;
    const config = parseDeclarativeConfig(document)!;
    expect(config.page?.size).toBe('a4');
    expect(config.page?.margin).toBe('0.6in');
    expect(config.repeatTableHead).toBe(true);
    expect(config.source).toBe(document.getElementById('src'));
  });

  it('parses explicit "<width> <height>" sizes', () => {
    document.body.innerHTML =
      '<div data-hp-content data-hp-size="8.5in 11in"><p>a</p></div>';
    const config = parseDeclarativeConfig(document)!;
    expect(config.page?.size).toEqual({ width: '8.5in', height: '11in' });
  });

  it('reads page attributes from content when there is no config element', () => {
    document.body.innerHTML =
      '<div data-hp-content data-hp-size="legal" data-hp-margin="1cm"><p>a</p></div>';
    const config = parseDeclarativeConfig(document)!;
    expect(config.page).toEqual({ size: 'legal', margin: '1cm' });
    expect(config.pageOverrides).toBeUndefined();
  });

  it('turns shared slots into interpolating templates', () => {
    document.body.innerHTML = FULL_MARKUP;
    const { page } = parseDeclarativeConfig(document)!;
    const ctx = { page: 3, totalPages: 7 };
    expect(render(page?.header, ctx)).toContain('Page 3 of 7');
    expect(render(page?.footer, ctx)).toContain('3 / 7');
  });

  it('collects per-page override groups', () => {
    document.body.innerHTML = FULL_MARKUP;
    const { pageOverrides } = parseDeclarativeConfig(document)!;
    expect(Object.keys(pageOverrides!)).toEqual(['1', '2']);

    const p1 = pageOverrides![1]!;
    expect(p1.margin).toBe('1in');
    expect(render(p1.header, { page: 1, totalPages: 7 })).toContain('Cover');
    expect(p1.footer).toBeNull(); // data-hp-footer="none"

    const p2 = pageOverrides![2]!;
    expect(p2.margin).toBeUndefined();
    expect(render(p2.header, { page: 2, totalPages: 7 })).toContain('Slim');
    expect(p2.footer).toBeUndefined(); // inherits shared
  });

  it('warns on and skips invalid data-hp-page values', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    document.body.innerHTML = `
      <template data-hp-config>
        <div data-hp-page="zero"><div data-hp-header>x</div></div>
      </template>
      <div data-hp-content><p>a</p></div>
    `;
    const config = parseDeclarativeConfig(document)!;
    expect(config.pageOverrides).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('autoPaginate', () => {
  it('returns null without declarative markup', () => {
    document.body.innerHTML = '<div><p>a</p></div>';
    expect(autoPaginate(document)).toBeNull();
  });

  it('paginates and renders interpolated headers', () => {
    document.body.innerHTML = FULL_MARKUP;
    const paginator = autoPaginate(document, { measurer })!;
    const pages = document.querySelectorAll('.hp-page');
    expect(pages).toHaveLength(1);
    // page 1 override: cover header, no footer
    expect(pages[0]?.querySelector('.hp-header')?.textContent).toContain('Cover');
    expect(pages[0]?.querySelector('.hp-footer')).toBeNull();
    expect(document.getElementById('src')?.style.display).toBe('none');
    paginator.reset();
    expect(document.querySelector('.hp-page')).toBeNull();
  });
});

describe('bindPrintPagination', () => {
  it('paginates on beforeprint and restores on afterprint', () => {
    document.body.innerHTML = FULL_MARKUP;
    const handle = bindPrintPagination(document, { measurer });
    expect(document.querySelector('.hp-page')).toBeNull();

    window.dispatchEvent(new Event('beforeprint'));
    expect(document.querySelector('.hp-page')).not.toBeNull();

    window.dispatchEvent(new Event('afterprint'));
    expect(document.querySelector('.hp-page')).toBeNull();
    handle.unbind();
  });

  it('run()/reset() work without events, unbind() detaches listeners', () => {
    document.body.innerHTML = FULL_MARKUP;
    const handle = bindPrintPagination(document, { measurer });
    handle.run();
    expect(document.querySelector('.hp-page')).not.toBeNull();
    handle.reset();
    expect(document.querySelector('.hp-page')).toBeNull();

    handle.unbind();
    window.dispatchEvent(new Event('beforeprint'));
    expect(document.querySelector('.hp-page')).toBeNull();
  });
});
