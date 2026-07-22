import type { PageDimensions } from './types';
import { CLASS_NAMES } from './buildPages';

/** Marker attribute on the injected <style> element. */
export const STYLE_ATTRIBUTE = 'data-hp-styles';

/**
 * Stylesheet for generated pages.
 *
 * - Screen: stacked page previews with the page's flex column layout.
 * - Print (`@media print` / Puppeteer PDF): one sheet per page, no gaps or
 *   shadows; `@page` uses the default page size with zero margin so browser
 *   headers/footers are suppressed and the library's own header/footer/margin
 *   configuration is authoritative.
 */
export function buildStylesheet(size: PageDimensions): string {
  const c = CLASS_NAMES;
  return `
.${c.container} {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.${c.page} {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
.${c.header},
.${c.footer} {
  flex: 0 0 auto;
}
.${c.body} {
  flex: 1 1 auto;
  min-height: 0;
}
@page {
  size: ${size.width} ${size.height};
  margin: 0;
}
@media print {
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
  }
  .${c.container} {
    gap: 0;
    display: block;
  }
  .${c.page} {
    box-shadow: none;
    margin: 0 auto;
    break-inside: avoid;
    page-break-after: always;
  }
  .${c.page}:last-child {
    page-break-after: auto;
  }
}
`.trim();
}

/**
 * Insert (or refresh) the stylesheet in the document head.
 * Idempotent: a previously injected sheet is replaced.
 */
export function injectStyles(doc: Document, size: PageDimensions): HTMLStyleElement {
  let style = doc.head.querySelector<HTMLStyleElement>(`style[${STYLE_ATTRIBUTE}]`);
  if (!style) {
    style = doc.createElement('style');
    style.setAttribute(STYLE_ATTRIBUTE, '');
    doc.head.appendChild(style);
  }
  style.textContent = buildStylesheet(size);
  return style;
}
