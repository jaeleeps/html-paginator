/**
 * Core distribution engine: sequential first-fit (greedy, order-preserving)
 * with optional splitting at child boundaries.
 *
 * Pure and DOM-free — measurement, per-page available height, and splitting
 * primitives are injected, so the engine works with any item type and is
 * testable without real layout.
 */

import type { BreakBehavior } from './types';

export interface WrapInfo {
  /** True when the fragment continues an item started on a previous page. */
  continuation: boolean;
}

export interface DistributeOptions<T> {
  /** Items to distribute, in order. */
  items: readonly T[];
  /** Height of a single item. */
  measure: (item: T) => number;
  /**
   * Available body height for a given page (1-based page number).
   * Can vary per page (e.g., different header/footer per page).
   */
  pageHeight: (page: number) => number;
  /**
   * Break behavior of an item. Defaults to `'avoid'` (atomic) when omitted —
   * splitting requires `children` and `wrap` as well.
   */
  breakBehavior?: (item: T) => BreakBehavior;
  /** Child items of a container. Empty array = leaf (atomic). */
  children?: (item: T) => T[];
  /** Rebuild a container around a subset of its children (a fragment). */
  wrap?: (item: T, children: T[], info: WrapInfo) => T;
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

interface Pending<T> {
  item: T;
  continuation: boolean;
}

interface Split<T> {
  head: T | null;
  tail: T | null;
}

/**
 * Distribute items across pages using sequential first-fit:
 * fill the current page until the next item no longer fits, then open a new
 * page. Order is always preserved; items are never reordered to fill gaps.
 *
 * When `breakBehavior`/`children`/`wrap` are provided, `'auto'` containers
 * that do not fit are split at child boundaries (recursively); the remainder
 * continues on the next page as a `wrap`-ed continuation fragment.
 *
 * An unsplittable item taller than an empty page is placed alone and the page
 * is marked `overflows` (hiding overflow for `'clip'` is handled by the
 * caller). If such an item is nested inside `'auto'` containers, the
 * containers are force-split around it so the following content paginates
 * normally.
 */
export function distribute<T>(options: DistributeOptions<T>): DistributedPage<T>[] {
  const { items, pageHeight } = options;
  const getBehavior = options.breakBehavior ?? ((): BreakBehavior => 'avoid');
  const getChildren = options.children ?? ((): T[] => []);
  const wrap = options.wrap;

  const measure = (item: T): number => {
    const height = options.measure(item);
    if (!Number.isFinite(height) || height < 0) {
      throw new Error(
        `html-paginator: measure() must return a non-negative finite number, got ${height}`,
      );
    }
    return height;
  };

  const canSplit = (item: T): boolean =>
    wrap !== undefined && getBehavior(item) === 'auto' && getChildren(item).length > 0;

  /**
   * Split `item` into a head fragment satisfying `fits` and a tail fragment
   * for the next page. Children are taken in order; the boundary child is
   * itself split recursively when possible. Returns `head: null` when not
   * even the first (possibly split) child fits.
   */
  const splitToFit = (item: T, continuation: boolean, fits: (candidate: T) => boolean): Split<T> => {
    const kids = getChildren(item);
    const headKids: T[] = [];
    let index = 0;

    while (index < kids.length) {
      const kid = kids[index] as T;
      if (fits(wrap!(item, [...headKids, kid], { continuation }))) {
        headKids.push(kid);
        index++;
      } else {
        break;
      }
    }

    let tailKids = kids.slice(index);

    if (index < kids.length) {
      const boundary = kids[index] as T;
      if (canSplit(boundary)) {
        const sub = splitToFit(boundary, false, (candidate) =>
          fits(wrap!(item, [...headKids, candidate], { continuation })),
        );
        if (sub.head) {
          headKids.push(sub.head);
          tailKids = sub.tail ? [sub.tail, ...kids.slice(index + 1)] : kids.slice(index + 1);
        }
      }
    }

    if (headKids.length === 0) {
      // Nothing fits — leave the item untouched for the caller.
      return { head: null, tail: item };
    }
    return {
      head: wrap!(item, headKids, { continuation }),
      tail: tailKids.length > 0 ? wrap!(item, tailKids, { continuation: true }) : null,
    };
  };

  /**
   * Last resort on an empty page: take the first (deepest splittable) child
   * even though it does not fit, so pagination can continue after it.
   */
  const forceSplit = (item: T, continuation: boolean): Split<T> => {
    const kids = getChildren(item);
    const first = kids[0] as T;
    let headKid = first;
    let tailKids = kids.slice(1);

    if (canSplit(first)) {
      const sub = forceSplit(first, false);
      headKid = sub.head as T;
      tailKids = sub.tail ? [sub.tail, ...kids.slice(1)] : kids.slice(1);
    }

    return {
      head: wrap!(item, [headKid], { continuation }),
      tail: tailKids.length > 0 ? wrap!(item, tailKids, { continuation: true }) : null,
    };
  };

  const pages: DistributedPage<T>[] = [];
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

  const pending: Pending<T>[] = items.map((item) => ({ item, continuation: false }));

  while (pending.length > 0) {
    const entry = pending.shift() as Pending<T>;
    const height = measure(entry.item);

    if (current === null) current = openPage();

    // Fits in the remaining space — place and continue.
    if (current.usedHeight + height <= current.availableHeight) {
      current.items.push(entry.item);
      current.usedHeight += height;
      continue;
    }

    // Try splitting an 'auto' container at child boundaries.
    if (canSplit(entry.item)) {
      const page = current;
      const { head, tail } = splitToFit(entry.item, entry.continuation, (candidate) => {
        return page.usedHeight + measure(candidate) <= page.availableHeight;
      });

      if (head) {
        current.items.push(head);
        current.usedHeight += measure(head);
        if (tail) pending.unshift({ item: tail, continuation: true });
        current = null; // Tail cannot fit here; continue on a fresh page.
        continue;
      }

      if (current.items.length > 0) {
        // Nothing fits the remaining space — retry on a fresh page, where
        // splitting gets the full page height to work with.
        current = openPage();
        pending.unshift(entry);
        continue;
      }

      // Empty page and not even the first child fits: force-split so the
      // oversized descendant overflows alone and the rest paginates.
      const forced = forceSplit(entry.item, entry.continuation);
      current.items.push(forced.head as T);
      current.usedHeight += measure(forced.head as T);
      current.overflows = true;
      if (forced.tail) pending.unshift({ item: forced.tail, continuation: true });
      current = null;
      continue;
    }

    // Atomic path ('avoid'/'clip'/leaf, or unsplittable remainder):
    // move to a new page unless the current one is still empty.
    if (current.items.length > 0) current = openPage();

    current.items.push(entry.item);
    current.usedHeight += height;

    if (height > current.availableHeight) {
      // Taller than an empty page: placed alone, mark overflow.
      current.overflows = true;
      current = null; // Force the next item onto a fresh page.
    }
  }

  return pages;
}
