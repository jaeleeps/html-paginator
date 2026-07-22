import { afterEach, describe, expect, it } from 'vitest';
import { buildStylesheet, injectStyles, STYLE_ATTRIBUTE } from '../src/styles';
import { createPaginator } from '../src/createPaginator';
import type { MeasureAdapter } from '../src/types';

const SIZE = { width: '8.5in', height: '11in' };

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('buildStylesheet', () => {
  it('sets @page to the given size with zero margin', () => {
    const css = buildStylesheet(SIZE);
    expect(css).toContain('size: 8.5in 11in');
    expect(css).toMatch(/@page\s*\{[^}]*margin: 0/);
  });

  it('breaks after each page except the last under print', () => {
    const css = buildStylesheet(SIZE);
    expect(css).toContain('page-break-after: always');
    expect(css).toContain('page-break-after: auto');
    expect(css).toContain('@media print');
  });
});

describe('injectStyles', () => {
  it('appends one marked <style> to head', () => {
    injectStyles(document, SIZE);
    const styles = document.head.querySelectorAll(`style[${STYLE_ATTRIBUTE}]`);
    expect(styles).toHaveLength(1);
    expect(styles[0]?.textContent).toContain('@media print');
  });

  it('is idempotent and refreshes content', () => {
    injectStyles(document, SIZE);
    injectStyles(document, { width: '210mm', height: '297mm' });
    const styles = document.head.querySelectorAll(`style[${STYLE_ATTRIBUTE}]`);
    expect(styles).toHaveLength(1);
    expect(styles[0]?.textContent).toContain('210mm 297mm');
  });
});

describe('paginate() style injection', () => {
  const measurer: MeasureAdapter = { measure: () => 10, pageHeight: () => 60 };

  function mountSource(): HTMLElement {
    document.body.innerHTML = '<div id="src"><p>a</p></div>';
    return document.getElementById('src') as HTMLElement;
  }

  it('injects styles by default using the configured page size', () => {
    createPaginator({ source: mountSource(), measurer, page: { size: 'a4' } }).paginate();
    const style = document.head.querySelector(`style[${STYLE_ATTRIBUTE}]`);
    expect(style?.textContent).toContain('210mm 297mm');
  });

  it('skips injection with injectStyles: false', () => {
    createPaginator({ source: mountSource(), measurer, injectStyles: false }).paginate();
    expect(document.head.querySelector(`style[${STYLE_ATTRIBUTE}]`)).toBeNull();
  });
});
