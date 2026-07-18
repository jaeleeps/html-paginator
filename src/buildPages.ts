import type { DistributedPage } from './distribute';
import type { PageConfig } from './types';
import { resolvePageConfig } from './pageConfig';
import { renderTemplate } from './renderTemplate';

export const CLASS_NAMES = {
  container: 'hp-pages',
  page: 'hp-page',
  header: 'hp-header',
  body: 'hp-body',
  footer: 'hp-footer',
} as const;

export interface BuildPagesOptions {
  /** Default page definition. */
  page?: PageConfig;
  /** Per-page overrides (1-based). */
  pageOverrides?: Record<number, PageConfig>;
  document: Document;
}

/**
 * Build the page DOM from distributed content.
 *
 * Two-pass by design: distribution has already produced the final page count,
 * so headers/footers render with a complete `{ page, totalPages }` context.
 *
 * Structure:
 *   .hp-pages
 *     .hp-page        (width/height/margin from resolved page config)
 *       .hp-header    (only when the page has a header)
 *       .hp-body      (distributed items, moved — not cloned)
 *       .hp-footer    (only when the page has a footer)
 */
export function buildPages(
  distributed: DistributedPage<HTMLElement>[],
  options: BuildPagesOptions,
): { container: HTMLElement; pages: HTMLElement[] } {
  const doc = options.document;
  const totalPages = distributed.length;

  const container = doc.createElement('div');
  container.className = CLASS_NAMES.container;

  const pages: HTMLElement[] = [];

  for (const dist of distributed) {
    const config = resolvePageConfig(dist.page, options.page, options.pageOverrides);
    const ctx = { page: dist.page, totalPages };

    const pageEl = doc.createElement('div');
    pageEl.className = CLASS_NAMES.page;
    pageEl.dataset.page = String(dist.page);
    pageEl.style.width = config.size.width;
    pageEl.style.height = config.size.height;
    pageEl.style.padding = config.margin;

    const header = renderTemplate(config.header, ctx, doc);
    if (header) {
      header.classList.add(CLASS_NAMES.header);
      pageEl.appendChild(header);
    }

    const body = doc.createElement('div');
    body.className = CLASS_NAMES.body;
    for (const item of dist.items) {
      body.appendChild(item);
    }
    pageEl.appendChild(body);

    const footer = renderTemplate(config.footer, ctx, doc);
    if (footer) {
      footer.classList.add(CLASS_NAMES.footer);
      pageEl.appendChild(footer);
    }

    container.appendChild(pageEl);
    pages.push(pageEl);
  }

  return { container, pages };
}
