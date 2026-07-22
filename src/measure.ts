import type { PageConfig } from './types';
import { CLASS_NAMES } from './buildPages';
import { resolvePageConfig } from './pageConfig';
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

export interface DomMeasurerOptions {
  document: Document;
  /** Default page definition. */
  page?: PageConfig;
  /** Per-page overrides (1-based). */
  pageOverrides?: Record<number, PageConfig>;
}

export interface DomMeasurer {
  /** Outer height (incl. margins) of an item, laid out at page-body width. */
  measure(item: HTMLElement): number;
  /** Available body height of the given page (1-based). */
  pageHeight(page: number): number;
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
    const config = resolvePageConfig(page, options.page, options.pageOverrides);
    const ctx = { page, totalPages: PROBE_CTX_TOTAL_PAGES };

    const pageEl = doc.createElement('div');
    pageEl.className = CLASS_NAMES.page;
    pageEl.style.width = config.size.width;
    pageEl.style.height = config.size.height;
    pageEl.style.padding = config.margin;
    // Must match the real page geometry (buildPages + stylesheet): padding
    // inside the sheet size, not added to it.
    pageEl.style.boxSizing = 'border-box';
    // Hidden but rendered, so layout happens without being visible.
    pageEl.style.position = 'absolute';
    pageEl.style.visibility = 'hidden';
    pageEl.style.left = '-9999px';
    pageEl.style.top = '0';

    const header = renderTemplate(config.header, ctx, doc);
    if (header) {
      header.classList.add(CLASS_NAMES.header);
      pageEl.appendChild(header);
    }

    const body = doc.createElement('div');
    body.className = CLASS_NAMES.body;
    pageEl.appendChild(body);

    const footer = renderTemplate(config.footer, ctx, doc);
    if (footer) {
      footer.classList.add(CLASS_NAMES.footer);
      pageEl.appendChild(footer);
    }

    doc.body.appendChild(pageEl);
    return { pageEl, header, body, footer };
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

    measure(item: HTMLElement): number {
      // Default to page 1's probe when measuring before any page is opened.
      const probe = currentProbe ?? getProbe(1);

      // Temporarily move the item into the probe body so it is laid out at
      // the real page-body width, then restore its original position.
      const parent = item.parentNode;
      const nextSibling = item.nextSibling;

      probe.body.appendChild(item);
      const height = measureOuterHeight(item);
      probe.body.removeChild(item);

      if (parent) parent.insertBefore(item, nextSibling);
      return height;
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
