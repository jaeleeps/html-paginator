import type { PageConfig } from './types';
import { CLASS_NAMES } from './buildPages';
import { columnWidth } from './pageConfig';
import { pagePadding, slotArea } from './pageFrame';
import type { PageVariants } from './pageConfig';
import { createPageLayout } from './layout';
import type { PageLayout } from './layout';
import { renderTemplate } from './renderTemplate';

/**
 * DOM measurement adapter.
 *
 * Bridges real browser layout to the pure `distribute()` engine by providing
 * its two injectables: `measure(item)` and `pageHeight(page)`.
 *
 * Measurement strategy (addresses v1's measurement drift):
 * - A hidden **probe page** is mounted in the live document for each page
 *   config — a real page skeleton (same classes/inline styles that
 *   `buildPages` produces), so page CSS applies during measurement.
 * - Available body height is derived from the probe: page inner height minus
 *   header and footer outer heights.
 * - Items are measured **in place inside the probe body** (temporarily moved,
 *   then restored), so they are laid out at the real page width.
 *
 * Requires a layout engine (browser / headless Chromium). jsdom reports zero
 * dimensions — unit tests stub element metrics.
 */

export interface DomMeasurerOptions extends PageVariants {
  document: Document;
  /** Default page definition. */
  page?: PageConfig;
  /** Per-page overrides (1-based). */
  pageOverrides?: Record<number, PageConfig>;
  /** Page layout being recorded by distribution (built from the options otherwise). */
  layout?: PageLayout;
}

export interface DomMeasurer {
  /**
   * Outer height (incl. margins) of an item, laid out at the body width of
   * `page` (default: the page last passed to pageHeight/measure, else 1).
   */
  measure(item: HTMLElement, page?: number): number;
  /** Available body height of the given page (1-based). */
  pageHeight(page: number): number;
  /**
   * Run `fn` while `item` is laid out in the body of `page`'s probe, then put
   * it back where it was.
   */
  layout<R>(item: HTMLElement, page: number, fn: () => R): R;
  /** Measure on `page` at the width of one of `columns` columns. */
  columns(page: number, columns: number, gap: string): void;
  /** Remove all probe elements from the document. */
  dispose(): void;
}

/** Outer height of an element including vertical margins. */
export function measureOuterHeight(el: HTMLElement): number {
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  const marginTop = parseFloat(style?.marginTop ?? '0') || 0;
  const marginBottom = parseFloat(style?.marginBottom ?? '0') || 0;
  return el.offsetHeight + marginTop + marginBottom;
}

interface Probe {
  pageEl: HTMLElement;
  header: HTMLElement | null;
  body: HTMLElement;
  footer: HTMLElement | null;
}

/**
 * Placeholder context for probe headers/footers: totalPages is unknown while
 * measuring. Documented constraint: header/footer HEIGHT must not depend on
 * the context values.
 */
const PROBE_CTX_TOTAL_PAGES = 999;

export function createDomMeasurer(options: DomMeasurerOptions): DomMeasurer {
  const doc = options.document;
  const layout = options.layout ?? createPageLayout(options);
  const probes = new Map<number, Probe>();
  let currentProbe: Probe | null = null;

  const getProbe = (page: number): Probe => {
    let probe = probes.get(page);
    if (!probe) {
      probe = mountProbe(page);
      probes.set(page, probe);
    }
    currentProbe = probe;
    return probe;
  };

  const mountProbe = (page: number): Probe => {
    const config = layout.config(page);
    const ctx = layout.probeContext(page, PROBE_CTX_TOTAL_PAGES);

    const pageEl = doc.createElement('div');
    pageEl.className = CLASS_NAMES.page;
    pageEl.style.width = config.size.width;
    pageEl.style.height = config.size.height;
    const header = renderTemplate(config.header, ctx, doc);
    const footer = renderTemplate(config.footer, ctx, doc);
    pageEl.style.padding = pagePadding(config, header !== null, footer !== null);
    // Must match the real page geometry (buildPages + stylesheet): padding
    // inside the sheet size, not added to it.
    pageEl.style.boxSizing = 'border-box';
    // Hidden but rendered, so layout happens without being visible.
    pageEl.style.position = 'absolute';
    pageEl.style.visibility = 'hidden';
    pageEl.style.left = '-9999px';
    pageEl.style.top = '0';

    // Header/footer areas (with distances) are what takes the height.
    const headerArea = header && slotArea(header, 'header', config);
    if (header) {
      header.classList.add(CLASS_NAMES.header);
      pageEl.appendChild(headerArea!);
    }

    const body = doc.createElement('div');
    body.className = CLASS_NAMES.body;
    // Like the rendered body (a flex item), contain child margins (a block
    // formatting context), so margins collapsing through an item — e.g. a
    // heading's top margin through its section — are measured. Sized by
    // its content alone, even if page styles from an earlier run apply.
    body.style.display = 'flow-root';
    body.style.flex = 'none';
    body.style.height = 'auto';
    body.style.minHeight = '0';
    // Multi-column pages: items are laid out at the width of a column.
    if (config.columns > 1) body.style.width = columnWidth(config.columns, config.columnGap);
    pageEl.appendChild(body);

    const footerArea = footer && slotArea(footer, 'footer', config);
    if (footer) {
      footer.classList.add(CLASS_NAMES.footer);
      pageEl.appendChild(footerArea!);
    }

    doc.body.appendChild(pageEl);
    return { pageEl, header: headerArea, body, footer: footerArea };
  };

  // Temporarily move the item into the probe body so it is laid out at the
  // real page-body width, then restore its original position.
  const layoutIn = <R>(item: HTMLElement, page: number | undefined, fn: () => R): R => {
    // Without a page, reuse the last probe (page 1 before any is opened).
    const probe = page !== undefined ? getProbe(page) : (currentProbe ?? getProbe(1));
    const parent = item.parentNode;
    const nextSibling = item.nextSibling;

    probe.body.appendChild(item);
    try {
      return fn();
    } finally {
      probe.body.removeChild(item);
      if (parent) parent.insertBefore(item, nextSibling);
    }
  };

  return {
    pageHeight(page: number): number {
      const probe = getProbe(page);
      const style = doc.defaultView?.getComputedStyle(probe.pageEl);
      const paddingTop = parseFloat(style?.paddingTop ?? '0') || 0;
      const paddingBottom = parseFloat(style?.paddingBottom ?? '0') || 0;
      const innerHeight = probe.pageEl.clientHeight - paddingTop - paddingBottom;
      const headerHeight = probe.header ? measureOuterHeight(probe.header) : 0;
      const footerHeight = probe.footer ? measureOuterHeight(probe.footer) : 0;
      return innerHeight - headerHeight - footerHeight;
    },

    measure(item: HTMLElement, page?: number): number {
      // The body holds only `item`: its height is the item's margin box,
      // including margins of descendants that collapse through it. Never
      // less than the item's own box (without layout, e.g. jsdom, the body
      // reports 0).
      return layoutIn(item, page, () =>
        Math.max(currentProbe!.body.getBoundingClientRect().height, measureOuterHeight(item)),
      );
    },

    layout(item, page, fn) {
      return layoutIn(item, page, fn);
    },

    columns(page, columns, gap) {
      getProbe(page).body.style.width = columns > 1 ? columnWidth(columns, gap) : '';
    },

    dispose(): void {
      for (const probe of probes.values()) {
        probe.pageEl.remove();
      }
      probes.clear();
      currentProbe = null;
    },
  };
}
