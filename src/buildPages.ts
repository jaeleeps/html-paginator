import type { DistributedPage } from './distribute';
import type { PageConfig } from './types';
import type { PageVariants } from './pageConfig';
import { createPageLayout } from './layout';
import { pageSizeName } from './pageConfig';
import type { PageLayout } from './layout';
import { renderTemplate } from './renderTemplate';

export const CLASS_NAMES = {
  container: 'hp-pages',
  page: 'hp-page',
  header: 'hp-header',
  body: 'hp-body',
  footer: 'hp-footer',
} as const;

export interface BuildPagesOptions extends PageVariants {
  /** Default page definition. */
  page?: PageConfig;
  /** Per-page overrides (1-based). */
  pageOverrides?: Record<number, PageConfig>;
  /** Page layout recorded during distribution (built from the options otherwise). */
  layout?: PageLayout;
  /** Footnote area for a page's notes, placed between body and footer. */
  renderNotes?: (notes: HTMLElement[]) => HTMLElement;
  document: Document;
}

/**
 * Build the page DOM from distributed content.
 *
 * Two-pass by design: distribution has already produced the final page count,
 * so headers/footers render with a complete page context (`totalPages`,
 * `lastPageLabel`, ...).
 *
 * Structure:
 *   .hp-pages
 *     .hp-page        (width/height/margin from resolved page config)
 *       .hp-header    (only when the page has a header)
 *       .hp-body      (distributed items, moved — not cloned)
 *       .hp-footnotes (only when the page has footnotes)
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

  const layout = options.layout ?? createPageLayout(options);

  for (const dist of distributed) {
    const config = layout.config(dist.page);
    const ctx = layout.context(dist.page, totalPages);

    const pageEl = doc.createElement('div');
    pageEl.className = CLASS_NAMES.page;
    pageEl.dataset.page = String(dist.page);
    pageEl.style.width = config.size.width;
    pageEl.style.height = config.size.height;
    pageEl.style.padding = config.margin;
    // Margin lives inside the sheet size; inline so geometry holds even with
    // injectStyles: false.
    pageEl.style.boxSizing = 'border-box';
    // Print on the sheet of this page's size (CSS named page).
    pageEl.style.setProperty('page', pageSizeName(config.size));

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

    if (dist.notes && dist.notes.length > 0 && options.renderNotes) {
      const area = options.renderNotes(dist.notes);
      area.style.flex = '0 0 auto';
      pageEl.appendChild(area);
    }

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
