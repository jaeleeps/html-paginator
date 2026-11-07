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

/** What the engine knows about a page when it opens it. */
export interface PageSlot<S = string> {
  /** Section the page belongs to (undefined before the first section start). */
  section?: S;
  /** True on the first page of a section. */
  sectionStart: boolean;
  /** True for a blank page inserted before a section (see `blankPageBefore`). */
  blank: boolean;
}

export interface DistributeOptions<T, S = string> {
  /** Items to distribute, in order. */
  items: readonly T[];
  /**
   * Height of a single item when laid out on the given page (1-based).
   * Pages can differ in width, so the page is the one the item is being
   * considered for.
   */
  measure: (item: T, page: number) => number;
  /**
   * Available body height for a given page (1-based page number).
   * Can vary per page (e.g., different header/footer per page). Called once
   * per page, in order, when the page opens; `slot` tells which section it
   * belongs to.
   */
  pageHeight: (page: number, slot: PageSlot<S>) => number;
  /**
   * Break behavior of an item. Defaults to `'avoid'` (atomic) when omitted —
   * splitting requires `children` and `wrap` as well.
   */
  breakBehavior?: (item: T) => BreakBehavior;
  /** Child items of a container. Empty array = leaf (atomic). */
  children?: (item: T) => T[];
  /** Rebuild a container around a subset of its children (a fragment). */
  wrap?: (item: T, children: T[], info: WrapInfo) => T;
  /**
   * Forced page break before an item (Word's "page break"). Applies at any
   * depth inside splittable containers, which are split at the break. Never
   * produces a blank page: a break at the top of a page is a no-op.
   */
  pageBreakBefore?: (item: T) => boolean;
  /**
   * Keep an item on the same page as the item after it (Word's "keep with
   * next", e.g. headings). When the next item has to start a new page,
   * trailing kept items move along, unless that would empty the page.
   */
  keepWithNext?: (item: T) => boolean;
  /**
   * Section started by an item (Word's section break), or undefined. A
   * section start is also a forced page break. Must return undefined for
   * continuation fragments (`WrapInfo.continuation`), which do not restart
   * their section.
   */
  section?: (item: T) => S | undefined;
  /**
   * Whether to insert a blank page before `page`, which would start
   * `section` (e.g. to start chapters on odd pages). The blank page belongs
   * to the previous section.
   */
  blankPageBefore?: (section: S, page: number) => boolean;
  /**
   * Split an `'auto'` item that has no children (e.g. a paragraph) inside
   * itself, the way Word splits a paragraph between lines. `fits` tells
   * whether a candidate head fits the space left on `page`. Returns the
   * largest valid head and its continuation, or null when no head fits (or
   * widow/orphan rules forbid every split): the item then moves on whole.
   */
  fragment?: (item: T, fits: (head: T) => boolean, info: FragmentInfo) => Fragment<T> | null;
  /**
   * Page `page` is shorter than a fresh page would be (e.g. the rest of a
   * sheet below a continuous section break): an item that does not fit it
   * while it is empty moves on to the next page instead of overflowing it.
   */
  partial?: (page: number) => boolean;
  /**
   * Called with each page as it opens. The object is live: items are added
   * to it until the next page opens.
   */
  opened?: (page: DistributedPage<T, S>) => void;
  /**
   * Footnotes an item brings to its page (Word footnotes): they go to the
   * page where the item lands, and their area takes height from the body.
   * Requires `notesHeight`.
   */
  notes?: (item: T) => readonly T[];
  /** Height of the footnote area holding `notes` on `page` (not called when empty). */
  notesHeight?: (notes: readonly T[], page: number) => number;
  /**
   * Split a note that does not fit (Word continues long footnotes on the
   * next page): like `fragment`, `fits` tells whether a head fits the
   * page's note area. The tail starts the next page's notes. Only the last
   * note of a page is split.
   */
  fragmentNote?: (note: T, fits: (head: T) => boolean, info: FragmentInfo) => Fragment<T> | null;
}

export interface FragmentInfo {
  /** Page (1-based) the head is for. */
  page: number;
}

export interface Fragment<T> {
  head: T;
  tail: T;
}

export interface DistributedPage<T, S = string> {
  /** 1-based page number. */
  page: number;
  items: T[];
  /** Sum of item heights placed on this page. */
  usedHeight: number;
  /** Available body height of this page. */
  availableHeight: number;
  /** True when a single item was taller than the page and overflows it. */
  overflows: boolean;
  /** Section of the page (only with the `section` hook). */
  section?: S;
  /** First page of a section (only with the `section` hook). */
  sectionStart?: boolean;
  /** Blank page inserted by `blankPageBefore`. */
  blank?: boolean;
  /** Footnotes of the page's items, in order (only with the `notes` hook). */
  notes?: T[];
  /** Height of the page's footnote area (0 without notes). */
  notesHeight?: number;
  /**
   * Column of the page this entry fills (0-based), when the caller lays
   * several engine pages side by side on one sheet (multi-column pages).
   */
  column?: number;
  /** Region of the sheet this entry is in (0-based, stacked top to bottom). */
  region?: number;
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
export function distribute<T, S = string>(
  options: DistributeOptions<T, S>,
): DistributedPage<T, S>[] {
  const { items, pageHeight } = options;
  const getBehavior = options.breakBehavior ?? ((): BreakBehavior => 'avoid');
  const getChildren = options.children ?? ((): T[] => []);
  const wrap = options.wrap;

  const measure = (item: T, page: number): number => {
    const height = options.measure(item, page);
    if (!Number.isFinite(height) || height < 0) {
      throw new Error(
        `html-paginator: measure() must return a non-negative finite number, got ${height}`,
      );
    }
    return height;
  };

  const canSplit = (item: T): boolean =>
    wrap !== undefined && getBehavior(item) === 'auto' && getChildren(item).length > 0;
  const canFragment = (item: T): boolean =>
    options.fragment !== undefined && getBehavior(item) === 'auto' && !canSplit(item);

  const hasBreakHook = options.pageBreakBefore !== undefined || options.section !== undefined;
  const startsSection = (item: T): boolean => options.section?.(item) !== undefined;

  /** Section started at the very beginning of `item` (itself or first descendant). */
  const sectionAt = (item: T): S | undefined => {
    const own = options.section?.(item);
    if (own !== undefined) return own;
    return canSplit(item) ? sectionAt(getChildren(item)[0] as T) : undefined;
  };
  const keeps = (item: T): boolean => options.keepWithNext?.(item) === true;

  /** Forced break before `item`, including one on its first descendant. */
  const breaksBefore = (item: T): boolean => {
    if (!hasBreakHook) return false;
    if (options.pageBreakBefore?.(item) === true || startsSection(item)) return true;
    return canSplit(item) && breaksBefore(getChildren(item)[0] as T);
  };

  /** Forced break somewhere inside `item` (not at its start). */
  const breaksInside = (item: T): boolean => {
    if (!hasBreakHook || !canSplit(item)) return false;
    return getChildren(item).some((kid, i) => (i > 0 && breaksBefore(kid)) || breaksInside(kid));
  };

  /**
   * Split `item` into a head fragment satisfying `fits` and a tail fragment
   * for the next page. Children are taken in order; the boundary child is
   * itself split recursively when possible. Returns `head: null` when not
   * even the first (possibly split) child fits; `tail` is then the whole item
   * rebuilt via `wrap`.
   *
   * A child with a forced break ends the head (it starts the tail), and a
   * child containing one never counts as fitting whole.
   *
   * `wrap` may be destructive (DOM wrapping moves child nodes into the
   * fragment), so after trial wraps `item` itself may be missing children —
   * always continue with the returned fragments, never with `item`.
   */
  const splitToFit = (
    item: T,
    continuation: boolean,
    page: number,
    fits: (candidate: T) => boolean,
  ): Split<T> => {
    const kids = getChildren(item);
    const headKids: T[] = [];
    let index = 0;
    let forced = false;

    while (index < kids.length) {
      const kid = kids[index] as T;
      if (index > 0 && breaksBefore(kid)) {
        forced = true;
        break;
      }
      if (!breaksInside(kid) && fits(wrap!(item, [...headKids, kid], { continuation }))) {
        headKids.push(kid);
        index++;
      } else {
        break;
      }
    }

    let tailKids = kids.slice(index);
    let headEndsWithFragment = false;

    if (index < kids.length && !forced) {
      const boundary = kids[index] as T;
      if (canSplit(boundary)) {
        const sub = splitToFit(boundary, false, page, (candidate) =>
          fits(wrap!(item, [...headKids, candidate], { continuation })),
        );
        if (sub.head) {
          headKids.push(sub.head);
          headEndsWithFragment = true;
          tailKids = sub.tail ? [sub.tail, ...kids.slice(index + 1)] : kids.slice(index + 1);
        } else {
          // Trial wraps may have emptied `boundary`; use its rebuilt copy.
          tailKids = [sub.tail as T, ...kids.slice(index + 1)];
        }
      } else if (canFragment(boundary)) {
        const fragment = options.fragment!(
          boundary,
          (candidate) => fits(wrap!(item, [...headKids, candidate], { continuation })),
          { page },
        );
        if (fragment) {
          headKids.push(fragment.head);
          headEndsWithFragment = true;
          tailKids = [fragment.tail, ...kids.slice(index + 1)];
        }
      }
    }

    // Keep with next: whole kept children at the end of the head move to the
    // tail with what follows them (a forced break ends the head on purpose).
    if (!forced && !headEndsWithFragment && tailKids.length > 0) {
      while (headKids.length > 1 && keeps(headKids[headKids.length - 1] as T)) {
        tailKids.unshift(headKids.pop() as T);
      }
    }

    if (headKids.length === 0) {
      // Nothing fits — hand back the whole item, rebuilt from its children.
      return { head: null, tail: wrap!(item, tailKids, { continuation }) };
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

  const pages: DistributedPage<T, S>[] = [];
  let current: DistributedPage<T, S> | null = null;
  /** What each placed item was queued as, measured at, and the notes it brought. */
  interface Placed {
    entry: Pending<T>;
    height: number;
    /** Notes as placed on the page (the last may be a split head). */
    notes: T[];
    /** The notes they come from. */
    sources: T[];
    /** Continuation of a split note, for the next page. */
    carry: T | null;
  }
  const placed = new Map<DistributedPage<T, S>, Placed[]>();
  /** Notes already placed (by source), so each appears once. */
  const placedNotes = new Set<T>();
  /** Per page, the continuation of its split note (for the next page). */
  const carries = new Map<DistributedPage<T, S>, T>();

  /** Notes of `item` not placed yet, in order. */
  const newNotes = (item: T): T[] => {
    if (!options.notes) return [];
    return options.notes(item).filter((note, i, all) => !placedNotes.has(note) && all.indexOf(note) === i);
  };

  const notesArea = (notes: readonly T[], page: number): number => {
    if (notes.length === 0) return 0;
    const height = options.notesHeight?.(notes, page) ?? 0;
    if (!Number.isFinite(height) || height < 0) {
      throw new Error(
        `html-paginator: notesHeight() must return a non-negative finite number, got ${height}`,
      );
    }
    return height;
  };

  interface NotesPlan {
    notes: T[];
    sources: T[];
    carry: T | null;
  }

  /**
   * How `item` (of flow height `height`) and its notes fit what is left of
   * `page`, or null when they do not. The page's last note may be split
   * (`fragmentNote`), its continuation carried to the next page, like Word.
   */
  const planOn = (page: DistributedPage<T, S>, item: T, height: number): NotesPlan | null => {
    const sources = newNotes(item);
    const room = page.availableHeight - page.usedHeight - height;
    const onPage = page.notes ?? [];
    if (sources.length === 0) {
      return (page.notesHeight ?? 0) <= room ? { notes: [], sources, carry: null } : null;
    }
    if (notesArea([...onPage, ...sources], page.page) <= room) {
      return { notes: sources, sources, carry: null };
    }
    if (!options.fragmentNote || carries.has(page)) return null;
    const whole = sources.slice(0, -1);
    const split = options.fragmentNote(
      sources[sources.length - 1] as T,
      (head) => notesArea([...onPage, ...whole, head], page.page) <= room,
      { page: page.page },
    );
    return split ? { notes: [...whole, split.head], sources, carry: split.tail } : null;
  };

  const fitsOn = (page: DistributedPage<T, S>, item: T, height: number): boolean =>
    planOn(page, item, height) !== null;

  const place = (page: DistributedPage<T, S>, entry: Pending<T>, height: number): void => {
    // An item placed although it does not fit (alone on a page) brings its
    // notes whole.
    const sources = newNotes(entry.item);
    const plan = planOn(page, entry.item, height) ?? { notes: sources, sources, carry: null };
    page.items.push(entry.item);
    page.usedHeight += height;
    if (plan.notes.length > 0) {
      page.notes!.push(...plan.notes);
      page.notesHeight = notesArea(page.notes!, page.page);
    }
    plan.sources.forEach((note) => placedNotes.add(note));
    if (plan.carry) carries.set(page, plan.carry);
    placed.get(page)!.push({ entry, height, ...plan });
  };

  /**
   * Take kept (keep-with-next) items off the end of `page` so they move on
   * with the item that no longer fits. Never empties the page.
   */
  const takeKept = (page: DistributedPage<T, S>): Pending<T>[] => {
    const log = placed.get(page)!;
    const kept: Pending<T>[] = [];
    while (page.items.length > 1 && keeps(page.items[page.items.length - 1] as T)) {
      page.items.pop();
      const last = log.pop()!;
      page.usedHeight -= last.height;
      if (last.notes.length > 0) {
        page.notes = page.notes!.filter((note) => !last.notes.includes(note));
        page.notesHeight = notesArea(page.notes, page.page);
      }
      last.sources.forEach((note) => placedNotes.delete(note));
      if (last.carry) carries.delete(page);
      kept.unshift(last.entry);
    }
    return kept;
  };

  let currentSection: S | undefined;

  const newPage = (slot: PageSlot<S>): DistributedPage<T, S> => {
    const page = pages.length + 1;
    const availableHeight = pageHeight(page, slot);
    if (!Number.isFinite(availableHeight) || availableHeight <= 0) {
      throw new Error(
        `html-paginator: pageHeight(${page}) must be a positive finite number, got ${availableHeight}`,
      );
    }
    const opened: DistributedPage<T, S> = {
      page,
      items: [],
      usedHeight: 0,
      availableHeight,
      overflows: false,
    };
    if (options.section) {
      opened.section = slot.section;
      opened.sectionStart = slot.sectionStart;
    }
    if (slot.blank) opened.blank = true;
    if (options.notes) {
      // A note split on the previous page continues first.
      const previous = pages[pages.length - 1];
      const carry = previous ? carries.get(previous) : undefined;
      opened.notes = carry ? [carry] : [];
      opened.notesHeight = notesArea(opened.notes, page);
    }
    pages.push(opened);
    placed.set(opened, []);
    options.opened?.(opened);
    return opened;
  };

  /** Open the page that `first` will start (it may start a new section). */
  const openPage = (first: T): DistributedPage<T, S> => {
    const section = sectionAt(first);
    if (section === undefined) {
      return newPage({ section: currentSection, sectionStart: false, blank: false });
    }
    if (options.blankPageBefore?.(section, pages.length + 1) === true) {
      newPage({ section: currentSection, sectionStart: false, blank: true });
    }
    currentSection = section;
    return newPage({ section, sectionStart: true, blank: false });
  };

  /** Holds something already (items, or notes continued from the page before). */
  const occupied = (page: DistributedPage<T, S>): boolean =>
    page.items.length > 0 || (page.notes?.length ?? 0) > 0;

  /** An item that does not fit `page` should move on rather than overflow it. */
  const movesOn = (page: DistributedPage<T, S>): boolean =>
    occupied(page) || options.partial?.(page.page) === true;

  /**
   * The page after `page` for `first`: an empty (partial) page is left in
   * the current section, so a section start is not started again.
   */
  const nextPage = (page: DistributedPage<T, S>, first: T): DistributedPage<T, S> =>
    occupied(page) ? openPage(first) : newPage({ section: currentSection, sectionStart: false, blank: false });

  const pending: Pending<T>[] = items.map((item) => ({ item, continuation: false }));

  while (pending.length > 0) {
    const entry = pending.shift() as Pending<T>;

    // Open the page first so the item is measured for the page it lands on.
    if (current === null) current = openPage(entry.item);

    // Forced page break (continuations already start a fresh page).
    if (!entry.continuation && current.items.length > 0 && breaksBefore(entry.item)) {
      current = openPage(entry.item);
    }

    const height = measure(entry.item, current.page);

    // Fits in the remaining space — place and continue.
    if (fitsOn(current, entry.item, height) && !breaksInside(entry.item)) {
      place(current, entry, height);
      continue;
    }

    // Try splitting an 'auto' container at child boundaries.
    if (canSplit(entry.item)) {
      const page = current;
      const { head, tail } = splitToFit(entry.item, entry.continuation, page.page, (candidate) => {
        return fitsOn(page, candidate, measure(candidate, page.page));
      });

      if (head) {
        place(current, { item: head, continuation: entry.continuation }, measure(head, current.page));
        if (tail) pending.unshift({ item: tail, continuation: true });
        current = null; // Tail cannot fit here; continue on a fresh page.
        continue;
      }

      if (movesOn(current)) {
        // Nothing fits the remaining space — retry on a fresh page, where
        // splitting gets the full page height to work with.
        const kept = takeKept(current);
        current = nextPage(current, kept[0]?.item ?? (tail as T));
        pending.unshift(...kept, { item: tail as T, continuation: entry.continuation });
        continue;
      }

      // Empty page and not even the first child fits: force-split so the
      // oversized descendant overflows alone and the rest paginates.
      const forced = forceSplit(tail as T, entry.continuation);
      place(
        current,
        { item: forced.head as T, continuation: entry.continuation },
        measure(forced.head as T, current.page),
      );
      current.overflows = true;
      if (forced.tail) pending.unshift({ item: forced.tail, continuation: true });
      current = null;
      continue;
    }

    // Split a leaf inside itself (paragraph lines) to fill the page.
    if (canFragment(entry.item)) {
      const page = current;
      const fragment = options.fragment!(
        entry.item,
        (candidate) => fitsOn(page, candidate, measure(candidate, page.page)),
        { page: page.page },
      );
      if (fragment) {
        const head = { item: fragment.head, continuation: entry.continuation };
        place(current, head, measure(fragment.head, current.page));
        pending.unshift({ item: fragment.tail, continuation: true });
        current = null;
        continue;
      }
    }

    // Atomic path ('avoid'/'clip'/leaf, or unsplittable remainder):
    // retry on a new page (re-measured there) unless this one is still empty.
    if (movesOn(current)) {
      const kept = takeKept(current);
      current = nextPage(current, kept[0]?.item ?? entry.item);
      pending.unshift(...kept, entry);
      continue;
    }

    place(current, entry, height);

    if (height + (current.notesHeight ?? 0) > current.availableHeight) {
      // Taller than an empty page (with its notes): placed alone, mark overflow.
      current.overflows = true;
      current = null; // Force the next item onto a fresh page.
    }
  }

  return pages;
}
