/**
 * Core distribution engine: sequential first-fit (greedy, order-preserving).
 *
 * Pure and DOM-free — measurement and per-page available height are injected,
 * so the engine works with any item type and is testable without real layout.
 */

export interface DistributeOptions<T> {
  /** Items to distribute, in order. Each item is treated as atomic. */
  items: readonly T[];
  /** Height of a single item. */
  measure: (item: T) => number;
  /**
   * Available body height for a given page (1-based page number).
   * Can vary per page (e.g., different header/footer per page).
   */
  pageHeight: (page: number) => number;
}

export interface DistributedPage<T> {
  /** 1-based page number. */
  page: number;
  items: T[];
  /** Sum of item heights placed on this page. */
  usedHeight: number;
  /** Available body height of this page. */
  availableHeight: number;
  /** True when a single item was taller than the page and overflows it. */
  overflows: boolean;
}

/**
 * Distribute items across pages using sequential first-fit:
 * fill the current page until the next item no longer fits, then open a new
 * page. Order is always preserved; items are never reordered to fill gaps.
 *
 * An item taller than an empty page is placed alone on its own page and the
 * page is marked `overflows` (break behaviors like `clip` are handled by the
 * caller).
 */
export function distribute<T>(options: DistributeOptions<T>): DistributedPage<T>[] {
  const { items, measure, pageHeight } = options;
  const pages: DistributedPage<T>[] = [];

  if (items.length === 0) return pages;

  let current: DistributedPage<T> | null = null;

  const openPage = (): DistributedPage<T> => {
    const page = pages.length + 1;
    const availableHeight = pageHeight(page);
    if (!Number.isFinite(availableHeight) || availableHeight <= 0) {
      throw new Error(
        `html-paginator: pageHeight(${page}) must be a positive finite number, got ${availableHeight}`,
      );
    }
    const opened: DistributedPage<T> = {
      page,
      items: [],
      usedHeight: 0,
      availableHeight,
      overflows: false,
    };
    pages.push(opened);
    return opened;
  };

  for (const item of items) {
    const height = measure(item);
    if (!Number.isFinite(height) || height < 0) {
      throw new Error(
        `html-paginator: measure() must return a non-negative finite number, got ${height}`,
      );
    }

    if (current === null) current = openPage();

    // Open a new page when the item does not fit the remaining space —
    // unless the current page is still empty (nothing to gain from a new page).
    if (current.usedHeight + height > current.availableHeight && current.items.length > 0) {
      current = openPage();
    }

    current.items.push(item);
    current.usedHeight += height;

    if (height > current.availableHeight) {
      // Taller than an empty page: placed alone, mark overflow.
      current.overflows = true;
      current = null; // Force the next item onto a fresh page.
    }
  }

  return pages;
}
