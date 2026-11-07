import type { DistributedPage, PageSlot } from './distribute';
import type { PageLayout, PageLayoutConfig } from './layout';
import { mergePageLayers } from './pageConfig';

/**
 * Sheets, regions and columns (Word: section columns and continuous
 * section breaks).
 *
 * The engine fills "pages"; here they are laid out on sheets. A sheet holds
 * one or more regions stacked down its body; a region has one or more
 * columns, and each column is one engine page. A new region starts on the
 * same sheet where a section with `start: 'continuous'` begins, in the space
 * left below the previous region — whose columns are first balanced to
 * equal height, as Word balances columns before a continuous break.
 */

export interface RegionColumns {
  columns: number;
  columnGap: string;
  columnRule?: string;
}

export interface SheetRegion<T> extends RegionColumns {
  /** Sheet (physical page, 1-based). */
  sheet: number;
  /** Position on its sheet (0 = top). */
  index: number;
  /** Distance from the top of the body. */
  top: number;
  /** Available height of each column. */
  height: number;
  /** Shorter than a fresh sheet's body (a continuous section's start). */
  partial: boolean;
  section?: string;
  /** Engine pages filling its columns, in order. */
  pages: DistributedPage<T>[];
  /** Columns after balancing (replacing `pages` when set). */
  balanced?: DistributedPage<T>[];
}

export interface SheetPlannerOptions<T> {
  layout: PageLayout;
  config: PageLayoutConfig;
  /** Available body height of a sheet. */
  bodyHeight(sheet: number): number;
  /**
   * Lay `items` out in columns of `height` (without changing them): the
   * columns, or null when they need more than the region's columns.
   */
  balance?(items: T[], height: number, region: SheetRegion<T>): DistributedPage<T>[] | null;
  /** Whether a region may be balanced at all (default: yes). */
  canBalance?(region: SheetRegion<T>): boolean;
  /** Least height worth starting a region in (else: a new sheet). Default 36. */
  minRegionHeight?: number;
}

export interface SheetPlanner<T> {
  /** The engine's `pageHeight` hook: places engine page `page` and returns its height. */
  pageHeight(page: number, slot: PageSlot): number;
  /** The engine's `opened` hook. */
  opened(page: DistributedPage<T>): void;
  /** The engine's `partial` hook. */
  partial(page: number): boolean;
  /** Region of an engine page (the last one opened for a page not yet placed). */
  region(page: number): SheetRegion<T>;
  /**
   * Balance the last region of each section with `balanceColumns` (call
   * once distribution is done; continuous breaks balance on their own).
   */
  finish(): void;
  /** Sheets opened so far. */
  readonly sheets: number;
  /** All regions, in order. */
  readonly regions: readonly SheetRegion<T>[];
}

/** Height a column's content takes, notes included. */
const columnUsed = <T>(page: DistributedPage<T>): number => page.usedHeight + (page.notesHeight ?? 0);

/** Height a region's content takes: its tallest column, notes included. */
export function regionUsed<T>(region: SheetRegion<T>): number {
  return Math.max(0, ...(region.balanced ?? region.pages).map(columnUsed));
}

export function createSheetPlanner<T>(options: SheetPlannerOptions<T>): SheetPlanner<T> {
  const { layout, config } = options;
  const minHeight = options.minRegionHeight ?? 36;
  const regions: SheetRegion<T>[] = [];
  const regionOf: SheetRegion<T>[] = [];
  const columnOf: number[] = [];
  /** Section in effect at the top of each sheet (by sheet number). */
  const sheetSection: (string | undefined)[] = [];
  let sheets = 0;

  const continuous = (section: string | undefined): boolean =>
    section !== undefined && config.sections?.[section]?.start === 'continuous';

  const add = (region: SheetRegion<T>): SheetRegion<T> => {
    regions.push(region);
    return region;
  };

  const newSheet = (slot: PageSlot): SheetRegion<T> => {
    const last = regions[regions.length - 1];
    // A section that started mid-sheet is in effect from the next sheet on.
    const opened =
      !slot.sectionStart && !slot.blank && last && last.section !== sheetSection[last.sheet]
        ? { section: last.section, sectionStart: true, blank: false }
        : slot;
    sheets++;
    layout.open(sheets, opened);
    sheetSection[sheets] = opened.section;
    const page = layout.config(sheets);
    return add({
      sheet: sheets,
      index: 0,
      top: 0,
      height: options.bodyHeight(sheets),
      partial: false,
      section: opened.section,
      columns: page.columns,
      columnGap: page.columnGap,
      columnRule: page.columnRule,
      pages: [],
    });
  };

  const balance = (region: SheetRegion<T>): void => {
    const pages = region.pages;
    if (!options.balance || region.columns < 2 || pages.length === 0) return;
    // Overflow stays where the engine put it.
    if (pages.some((page) => page.overflows) || options.canBalance?.(region) === false) return;
    const items = pages.flatMap((page) => page.items);
    if (items.length === 0) return;
    const total = pages.reduce((sum, page) => sum + page.usedHeight, 0);
    // Smallest column height that holds everything in the columns.
    let low = Math.max(1, Math.floor(total / region.columns));
    // The engine's own columns already fit in their tallest one.
    let high = Math.min(Math.ceil(region.height), Math.ceil(Math.max(...pages.map(columnUsed))));
    let best: DistributedPage<T>[] | null = null;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const columns = options.balance(items, mid, region);
      if (columns) {
        best = columns;
        // Nothing between the tallest column it made and `mid` does better.
        high = Math.min(mid, Math.ceil(Math.max(...columns.map(columnUsed))));
      } else {
        low = mid + 1;
      }
    }
    best ??= options.balance(items, high, region);
    if (best) region.balanced = best;
  };

  /** A region below `above` on its sheet, or null when too little room is left. */
  const below = (above: SheetRegion<T>, slot: PageSlot): SheetRegion<T> | null => {
    balance(above);
    const top = above.top + regionUsed(above);
    const height = options.bodyHeight(above.sheet) - top;
    if (height < minHeight) return null;
    const page = mergePageLayers(config.page, slot.section ? config.sections?.[slot.section]?.page : undefined);
    return add({
      sheet: above.sheet,
      index: above.index + 1,
      top,
      height,
      partial: true,
      section: slot.section,
      columns: page.columns,
      columnGap: page.columnGap,
      columnRule: page.columnRule,
      pages: [],
    });
  };

  return {
    pageHeight(page, slot) {
      if (page > regionOf.length) {
        const current = regions[regions.length - 1];
        const column = columnOf[columnOf.length - 1] ?? 0;
        let region: SheetRegion<T>;
        let next = 0;
        if (!current || slot.blank) region = newSheet(slot);
        else if (slot.sectionStart) {
          region = (continuous(slot.section) ? below(current, slot) : null) ?? newSheet(slot);
        } else if (column + 1 < current.columns) {
          region = current;
          next = column + 1;
        } else region = newSheet(slot);
        regionOf.push(region);
        columnOf.push(next);
      }
      return regionOf[page - 1]!.height;
    },

    opened(page) {
      regionOf[page.page - 1]?.pages.push(page);
    },

    partial(page) {
      return regionOf[page - 1]?.partial === true;
    },

    region(page) {
      return regionOf[page - 1] ?? regions[regions.length - 1]!;
    },

    finish() {
      regions.forEach((region, i) => {
        const next = regions[i + 1];
        // The section's last region: nothing after it, or another section.
        const last = !next || next.section !== region.section;
        if (!region.balanced && last && region.section && config.sections?.[region.section]?.balanceColumns) {
          balance(region);
        }
      });
    },

    get sheets() {
      return sheets;
    },

    regions,
  };
}
