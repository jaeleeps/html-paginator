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
  watermark: 'hp-watermark',
  column: 'hp-column',
  columnBody: 'hp-column-body',
  columnRule: 'hp-column-rule',
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
 *       .hp-watermark (only when the page has a watermark; absolute, behind)
 *       .hp-header    (only when the page has a header)
 *       .hp-body      (distributed items, moved — not cloned)
 *       .hp-footnotes (only when the page has footnotes)
 *       .hp-footer    (only when the page has a footer)
 *
 * On a multi-column page (`columns` > 1), consecutive distributed entries
 * with the same `page` are its columns, side by side in the body, each with
 * its own footnote area at its bottom (as Word places them):
 *       .hp-body
 *         .hp-column
 *           .hp-column-rule (columns after the first, with `columnRule`)
 *           .hp-column-body (the column's items)
 *           .hp-footnotes
 */
export function buildPages(
  distributed: DistributedPage<HTMLElement>[],
  options: BuildPagesOptions,
): {
  container: HTMLElement;
  pages: HTMLElement[];
  /** Element holding the items of each distributed entry (same order). */
  bodies: HTMLElement[];
} {
  const doc = options.document;

  // Physical pages: runs of entries sharing a page number.
  const groups: DistributedPage<HTMLElement>[][] = [];
  for (const dist of distributed) {
    const group = groups[groups.length - 1];
    if (group && group[0]!.page === dist.page) group.push(dist);
    else groups.push([dist]);
  }
  const totalPages = groups.length;

  const container = doc.createElement('div');
  container.className = CLASS_NAMES.container;

  const pages: HTMLElement[] = [];
  const bodies: HTMLElement[] = [];

  const layout = options.layout ?? createPageLayout(options);

  const notesArea = (dist: DistributedPage<HTMLElement>): HTMLElement | null => {
    if (!dist.notes || dist.notes.length === 0 || !options.renderNotes) return null;
    const area = options.renderNotes(dist.notes);
    area.style.flex = '0 0 auto';
    return area;
  };

  for (const group of groups) {
    const dist = group[0]!;
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

    // Behind everything, over the whole sheet (margins included); out of
    // flow, so it never affects layout.
    const watermark = renderTemplate(config.watermark, ctx, doc);
    if (watermark) {
      const layer = doc.createElement('div');
      layer.className = CLASS_NAMES.watermark;
      Object.assign(layer.style, {
        position: 'absolute',
        inset: '0',
        zIndex: '0',
        pointerEvents: 'none',
        overflow: 'hidden',
      });
      layer.appendChild(watermark);
      pageEl.style.position = 'relative';
      pageEl.appendChild(layer);
    }

    const header = renderTemplate(config.header, ctx, doc);
    if (header) {
      header.classList.add(CLASS_NAMES.header);
      pageEl.appendChild(header);
    }

    const body = doc.createElement('div');
    body.className = CLASS_NAMES.body;
    pageEl.appendChild(body);

    if (config.columns > 1) {
      // Inline geometry (holds with injectStyles: false): equal columns
      // filling the body, separated by the gap.
      Object.assign(body.style, {
        display: 'flex',
        flex: '1 1 auto',
        minHeight: '0',
        columnGap: config.columnGap,
      });
      for (let i = 0; i < config.columns; i++) {
        const column = doc.createElement('div');
        column.className = CLASS_NAMES.column;
        column.dataset.column = String(i + 1);
        Object.assign(column.style, {
          display: 'flex',
          flexDirection: 'column',
          flex: '1 1 0',
          minWidth: '0',
          position: 'relative',
        });
        if (i > 0 && config.columnRule) {
          const rule = doc.createElement('div');
          rule.className = CLASS_NAMES.columnRule;
          Object.assign(rule.style, {
            position: 'absolute',
            top: '0',
            bottom: '0',
            left: `calc(${config.columnGap} / -2)`,
            borderLeft: config.columnRule,
          });
          column.appendChild(rule);
        }
        const content = doc.createElement('div');
        content.className = CLASS_NAMES.columnBody;
        Object.assign(content.style, { display: 'flow-root', flex: '1 1 auto', minHeight: '0' });
        column.appendChild(content);
        // Empty columns (the end of a section) still take their width.
        const entry = group[i];
        if (entry) {
          for (const item of entry.items) content.appendChild(item);
          const area = notesArea(entry);
          if (area) column.appendChild(area);
          bodies.push(content);
        }
        body.appendChild(column);
      }
    } else {
      for (const item of dist.items) body.appendChild(item);
      bodies.push(body);
      const area = notesArea(dist);
      if (area) pageEl.appendChild(area);
    }

    const footer = renderTemplate(config.footer, ctx, doc);
    if (footer) {
      footer.classList.add(CLASS_NAMES.footer);
      pageEl.appendChild(footer);
    }

    container.appendChild(pageEl);
    pages.push(pageEl);
  }

  return { container, pages, bodies };
}
