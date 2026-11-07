import type { DistributedPage } from './distribute';
import type { PageConfig } from './types';
import type { PageVariants, ResolvedPageConfig } from './pageConfig';
import { createPageLayout } from './layout';
import { pageSizeName } from './pageConfig';
import { pagePadding, slotArea } from './pageFrame';
import type { PageLayout } from './layout';
import type { RegionColumns } from './sheets';
import { renderTemplate } from './renderTemplate';

export const CLASS_NAMES = {
  container: 'hp-pages',
  page: 'hp-page',
  header: 'hp-header',
  body: 'hp-body',
  bodyContent: 'hp-body-content',
  footer: 'hp-footer',
  watermark: 'hp-watermark',
  column: 'hp-column',
  columnBody: 'hp-column-body',
  columnRule: 'hp-column-rule',
  region: 'hp-region',
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
  /**
   * Columns of region `region` (0-based, see `DistributedPage.region`) of
   * page `page`. Default: the page's config.
   */
  regionColumns?: (page: number, region: number) => RegionColumns | undefined;
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
 *       .hp-body      (distributed items, moved — not cloned; inside a
 *                      .hp-body-content with `verticalAlign` center/bottom)
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
 *
 * Entries with different `region`s on one page (a continuous section
 * break) are stacked in the body as `.hp-region`s, each with its own
 * columns (or a single `.hp-column-body`). Footnotes of columns stay at
 * the column bottom; the others share one area at the page bottom.
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

  /**
   * Put `items` in `box`, at the top, or (vertical alignment) in a block
   * pushed down by auto margins: margins between the items still collapse
   * as they did when measured.
   */
  const fill = (box: HTMLElement, items: HTMLElement[], align: ResolvedPageConfig['verticalAlign']): void => {
    if (align === 'top') {
      for (const item of items) box.appendChild(item);
      return;
    }
    const content = doc.createElement('div');
    content.className = CLASS_NAMES.bodyContent;
    content.style.marginTop = 'auto';
    if (align === 'center') content.style.marginBottom = 'auto';
    for (const item of items) content.appendChild(item);
    Object.assign(box.style, { display: 'flex', flexDirection: 'column' });
    box.appendChild(content);
  };

  /**
   * Equal columns filling `box` (inline geometry, so it holds with
   * injectStyles: false), each holding one entry and its footnotes.
   */
  const fillColumns = (
    box: HTMLElement,
    entries: DistributedPage<HTMLElement>[],
    layout: RegionColumns,
    align: ResolvedPageConfig['verticalAlign'] = 'top',
  ): void => {
    box.style.columnGap = layout.columnGap;
    // No line between columns that hold nothing (content moved on).
    const empty = entries.every((entry) => entry.items.length === 0 && (entry.notes?.length ?? 0) === 0);
    for (let i = 0; i < layout.columns; i++) {
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
      if (i > 0 && layout.columnRule && !empty) {
        const rule = doc.createElement('div');
        rule.className = CLASS_NAMES.columnRule;
        Object.assign(rule.style, {
          position: 'absolute',
          top: '0',
          bottom: '0',
          left: `calc(${layout.columnGap} / -2)`,
          borderLeft: layout.columnRule,
        });
        column.appendChild(rule);
      }
      const content = doc.createElement('div');
      content.className = CLASS_NAMES.columnBody;
      Object.assign(content.style, { display: 'flow-root', flex: '1 1 auto', minHeight: '0' });
      column.appendChild(content);
      // Empty columns (the end of a section) still take their width.
      const entry = entries[i];
      if (entry) {
        fill(content, entry.items, align);
        const area = notesArea(entry);
        if (area) column.appendChild(area);
        bodies.push(content);
      }
      box.appendChild(column);
    }
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
    const header = renderTemplate(config.header, ctx, doc);
    const footer = renderTemplate(config.footer, ctx, doc);
    pageEl.style.padding = pagePadding(config, header !== null, footer !== null);
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

    if (header) {
      header.classList.add(CLASS_NAMES.header);
      pageEl.appendChild(slotArea(header, 'header', config));
    }

    const body = doc.createElement('div');
    body.className = CLASS_NAMES.body;
    pageEl.appendChild(body);

    // Regions stacked down the body (continuous section breaks), each
    // with its own columns.
    const regions: DistributedPage<HTMLElement>[][] = [];
    for (const entry of group) {
      const last = regions[regions.length - 1];
      if (last && (last[0]!.region ?? 0) === (entry.region ?? 0)) last.push(entry);
      else regions.push([entry]);
    }
    const columnsOf = (entries: DistributedPage<HTMLElement>[]): RegionColumns =>
      options.regionColumns?.(dist.page, entries[0]!.region ?? 0) ?? config;

    if (regions.length === 1) {
      const columns = columnsOf(group);
      // An overflowing page stays at the top.
      const align = group.some((entry) => entry.overflows) ? 'top' : config.verticalAlign;
      if (columns.columns > 1) {
        Object.assign(body.style, { display: 'flex', flex: '1 1 auto', minHeight: '0' });
        fillColumns(body, group, columns, align);
      } else {
        fill(body, dist.items, align);
        bodies.push(body);
        const area = notesArea(dist);
        if (area) pageEl.appendChild(area);
      }
    } else {
      Object.assign(body.style, { display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: '0' });
      // Footnotes of single-column regions go to the bottom of the page, as
      // in Word (columns keep theirs at the column bottom).
      const pageNotes: HTMLElement[] = [];
      regions.forEach((entries, index) => {
        const region = doc.createElement('div');
        region.className = CLASS_NAMES.region;
        // Earlier regions take their content's height; the last the rest.
        Object.assign(region.style, {
          display: 'flex',
          flex: index === regions.length - 1 ? '1 1 auto' : '0 0 auto',
          minHeight: '0',
        });
        body.appendChild(region);
        const columns = columnsOf(entries);
        if (columns.columns > 1) {
          fillColumns(region, entries, columns);
        } else {
          region.style.flexDirection = 'column';
          const entry = entries[0]!;
          const content = doc.createElement('div');
          content.className = CLASS_NAMES.columnBody;
          Object.assign(content.style, { display: 'flow-root', flex: '1 1 auto', minHeight: '0' });
          for (const item of entry.items) content.appendChild(item);
          region.appendChild(content);
          bodies.push(content);
          pageNotes.push(...(entry.notes ?? []));
        }
      });
      const area = notesArea({ ...dist, notes: pageNotes });
      if (area) pageEl.appendChild(area);
    }

    if (footer) {
      footer.classList.add(CLASS_NAMES.footer);
      pageEl.appendChild(slotArea(footer, 'footer', config));
    }

    container.appendChild(pageEl);
    pages.push(pageEl);
  }

  return { container, pages, bodies };
}
