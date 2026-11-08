import type { MeasureAdapter, PaginateResult, Paginator, PaginatorConfig } from './types';
import { buildPages } from './buildPages';
import { distribute } from './distribute';
import type { FragmentInfo } from './distribute';
import {
  BREAK_ATTRIBUTE,
  createDomBreaker,
  markBreakHints,
  SECTION_ATTRIBUTE,
  warnNestedBreakAttributes,
} from './domBreak';
import { createPageLayout } from './layout';
import { createDomMeasurer } from './measure';
import { resolveSize } from './pageConfig';
import { injectStyles } from './styles';
import { createRowSplitter } from './rowSplit';
import { numberSequences, resolveCrossRefs } from './captions';
import { collectEndnotes } from './endnotes';
import { prepareFields, resolveFields } from './fields';
import { createFootnotes, injectFootnoteStyles, notesBeneathText, renumberFootnotes, withContinuationNotice } from './footnotes';
import { numberLines } from './lineNumbers';
import { longestRunning, runningValues } from './running';
import { createSheetPlanner } from './sheets';
import type { SheetRegion } from './sheets';
import { freezeTableColumns } from './tableColumns';
import { createTextSplitter } from './textSplit';
import { buildTableOfContents, resolvePageRefs } from './toc';
import { buildIndex, dedupeIndexPages, indexPageLabels } from './indexEntries';
import { whenContentReady } from './ready';
import type { ReadyOptions } from './ready';

export const DEFAULT_PAGE_SIZE = 'letter' as const;

function resolveElement(
  ref: string | HTMLElement,
  doc: Document,
  what: string,
): HTMLElement {
  if (typeof ref !== 'string') return ref;
  const el = doc.querySelector(ref);
  if (!(el instanceof HTMLElement)) {
    throw new Error(`html-paginator: ${what} not found for selector "${ref}"`);
  }
  return el;
}

/** Warn once per `data-section` name that has no `sections` entry. */
function warnUnknownSections(
  root: HTMLElement,
  sections: PaginatorConfig['sections'],
): void {
  const unknown = new Set<string>();
  for (const el of root.querySelectorAll(`[${SECTION_ATTRIBUTE}]`)) {
    const name = el.getAttribute(SECTION_ATTRIBUTE) ?? '';
    if (!sections?.[name]) unknown.add(name);
  }
  for (const name of unknown) {
    console.warn(
      `html-paginator: ${SECTION_ATTRIBUTE}="${name}" has no matching sections entry; it starts a section with the default layout`,
    );
  }
}

const sameLabels = (a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string> | undefined): boolean =>
  b !== undefined && a.size === b.size && Array.from(a).every(([id, label]) => b.get(id) === label);

/** Create a paginator instance. */
export function createPaginator(config: PaginatorConfig): Paginator {
  const resolved: PaginatorConfig = {
    repeatTableHead: false,
    injectStyles: true,
    ...config,
    page: {
      size: DEFAULT_PAGE_SIZE,
      ...config.page,
    },
  };

  let container: HTMLElement | null = null;
  let sourceEl: HTMLElement | null = null;
  let sourceDisplay = '';

  const teardown = (): void => {
    container?.remove();
    container = null;
    if (sourceEl) {
      sourceEl.style.display = sourceDisplay;
      sourceEl = null;
    }
  };

  /**
   * One pagination: rendered, replacing the previous one. `indexLabels`
   * holds the page labels of index marks from a previous pass, so the index
   * is laid out with its real page numbers.
   */
  const run = (indexLabels?: ReadonlyMap<string, string>): PaginateResult & { indexLabels?: Map<string, string> } => {
    // Re-pagination replaces the previous result (one final copy).
    teardown();

    const doc =
      typeof resolved.source !== 'string' ? resolved.source.ownerDocument : document;
    const source = resolveElement(resolved.source, doc, 'source');

    warnNestedBreakAttributes(source);

    // Work on a clone so the source stays intact for reset()/re-pagination.
    const copy = source.cloneNode(true) as HTMLElement;
    markBreakHints(source, copy, { keepHeadingsWithNext: resolved.keepHeadingsWithNext });
    // Footnotes first: TOC entries leave their reference numbers out.
    const footnotes = createFootnotes(copy);
    if (footnotes && resolved.injectStyles !== false) injectFootnoteStyles(doc);
    collectEndnotes(copy, resolved.endnotes);
    numberSequences(copy);
    resolveCrossRefs(copy);
    buildTableOfContents(copy);
    const indexed = buildIndex(copy, indexLabels) > 0;
    prepareFields(copy);

    // Loose top-level text gets a <div> so it is paginated, not dropped.
    const items: HTMLElement[] = [];
    for (const node of Array.from(copy.childNodes)) {
      if (node instanceof HTMLElement) {
        items.push(node);
      } else if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '') {
        const div = doc.createElement('div');
        div.textContent = node.textContent;
        items.push(div);
      }
    }

    warnUnknownSections(copy, resolved.sections);

    // Pages (and their sections) are recorded as distribution opens them;
    // measurement and rendering both read page config from this layout.
    const layout = createPageLayout(resolved);
    // Headers are measured with the longest running values.
    layout.setRunning(longestRunning(copy));
    const measurer: MeasureAdapter =
      resolved.measurer ?? createDomMeasurer({ document: doc, layout });

    // Paragraphs split between lines and rows across pages when the
    // measurer can lay them out.
    const layoutIn = measurer.layout?.bind(measurer);
    const splitText =
      resolved.splitParagraphs !== false && layoutIn
        ? createTextSplitter({ layout: layoutIn, root: copy })
        : undefined;
    const splitRow =
      resolved.splitTableRows !== false && layoutIn
        ? createRowSplitter({ layout: layoutIn, root: copy })
        : undefined;
    const fragment =
      splitText || splitRow
        ? (el: HTMLElement, fits: (head: HTMLElement) => boolean, info: FragmentInfo) =>
            el instanceof HTMLTableRowElement
              ? (splitRow?.(el, fits, info) ?? null)
              : (splitText?.(el, fits, info) ?? null)
        : undefined;

    const measured = new WeakSet<HTMLElement>();

    // Engine pages are the columns of regions on sheets (see sheets.ts).
    const breaker = createDomBreaker({ repeatTableHead: resolved.repeatTableHead });
    const setColumns = measurer.columns?.bind(measurer);
    /** Measure for `region` from now on: its sheet, at its column width. */
    const useRegion = (region: SheetRegion<HTMLElement>): number => {
      setColumns?.(region.sheet, region.columns, region.columnGap);
      return region.sheet;
    };
    const balanceHeights = new WeakMap<SheetRegion<HTMLElement>, Map<HTMLElement, number>>();
    const planner = createSheetPlanner<HTMLElement>({
      layout,
      config: resolved,
      bodyHeight: (sheet) => measurer.pageHeight(sheet),
      // Trial layouts of copies of the items, in columns of `height`.
      balance: (items, height, region) => {
        const sheet = useRegion(region);
        // A copy's first measurement is its original's, measured once per
        // region (the trials re-measure only the fragments they make).
        let heights = balanceHeights.get(region);
        if (!heights) balanceHeights.set(region, (heights = new Map()));
        const originals = new Map<HTMLElement, HTMLElement>();
        const copies = items.map((el) => {
          const copy = el.cloneNode(true) as HTMLElement;
          originals.set(copy, el);
          return copy;
        });
        const columns = distribute<HTMLElement>({
          items: copies,
          measure: (el) => {
            const original = originals.get(el);
            if (!original) return measurer.measure(el, sheet);
            originals.delete(el);
            let h = heights!.get(original);
            if (h === undefined) heights!.set(original, (h = measurer.measure(el, sheet)));
            return h;
          },
          pageHeight: () => height,
          ...breaker,
          fragment: fragment && ((el, fits) => fragment(el, fits, { page: sheet })),
          // Footnotes stay whole (splitting would change the originals).
          notes: footnotes ? (el) => footnotes.notesOf(el) : undefined,
          notesHeight: footnotes ? (notes) => measurer.measure(footnotes.area(notes), sheet) : undefined,
        });
        return columns.length <= region.columns && !columns.some((column) => column.overflows)
          ? columns
          : null;
      },
      // Only a region holding exactly its own footnotes, whole: none
      // continued from before it or split off to after it.
      canBalance: (region) => {
        if (!footnotes) return true;
        const own = region.pages.flatMap((page) => page.items.flatMap((el) => footnotes.notesOf(el)));
        const placed = region.pages.flatMap((page) => page.notes ?? []);
        return placed.length === new Set(own).size && placed.every((note) => own.includes(note));
      },
    });
    const sheetOf = (enginePage: number): number => useRegion(planner.region(enginePage));
    const info = (i: FragmentInfo): FragmentInfo => ({ ...i, page: sheetOf(i.page) });

    try {
      distribute<HTMLElement>({
        items,
        measure: (el, enginePage) => {
          const page = sheetOf(enginePage);
          // First measurement of an item: freeze its tables' columns at
          // the width of the page it is laid out on.
          if (layoutIn && !measured.has(el)) {
            measured.add(el);
            freezeTableColumns(el, (fn) => layoutIn(el, page, fn));
          }
          return measurer.measure(el, page);
        },
        pageHeight: (enginePage, slot) => planner.pageHeight(enginePage, slot),
        opened: (page) => planner.opened(page),
        partial: (page) => planner.partial(page),
        // Sections start a new sheet (except continuous ones, never blank).
        blankPageBefore: (section) => layout.blankPageBefore(section, planner.sheets + 1),
        ...breaker,
        fragment: fragment && ((el, fits, i) => fragment(el, fits, info(i))),
        notes: footnotes ? (el) => footnotes.notesOf(el) : undefined,
        fragmentNote:
          footnotes && splitText
            ? (note, fits, i) =>
                footnotes.inArea(note, () => {
                  const notice = resolved.footnotes?.continuationNotice;
                  if (!notice) return splitText(note, fits, info(i));
                  // The part on this page ends with the notice: it must fit too.
                  const split = splitText(
                    note,
                    (head) => fits(withContinuationNotice(head.cloneNode(true) as HTMLElement, notice)),
                    info(i),
                  );
                  return split && { ...split, head: withContinuationNotice(split.head, notice) };
                })
            : undefined,
        notesHeight: footnotes
          ? (notes, enginePage) => measurer.measure(footnotes.area(notes), sheetOf(enginePage))
          : undefined,
      });
      planner.finish();
      // What is rendered: each region's columns (balanced ones replacing
      // the engine's), placed on their sheets.
      const distributed = planner.regions.flatMap((region) =>
        (region.balanced ?? region.pages).map((page, column) =>
          Object.assign(page, {
            page: region.sheet,
            column: region.columns > 1 ? column : undefined,
            region: region.index,
          }),
        ),
      );

      // Running header values from the items on each sheet.
      const sheetItems: HTMLElement[][] = [];
      for (const dist of distributed) (sheetItems[dist.page - 1] ??= []).push(...dist.items);
      layout.setRunning(longestRunning(copy), runningValues(Array.from(sheetItems, (items) => items ?? [])));

      const built = buildPages(distributed, {
        document: doc,
        layout,
        renderNotes: footnotes ? (notes) => footnotes.area(notes) : undefined,
        notesBeneathText: notesBeneathText(resolved.footnotes),
        regionColumns: (page, index) =>
          planner.regions.find((region) => region.sheet === page && region.index === index),
      });
      const total = built.pages.length;
      resolvePageRefs(built.pages, (index) => layout.context(index + 1, total).pageLabel);
      const marks = indexed ? indexPageLabels(built.pages, (index) => layout.context(index + 1, total).pageLabel) : undefined;
      dedupeIndexPages(built.pages);
      resolveFields(built.pages, (index) => layout.context(index + 1, total));
      // A sheet starts a section when its first column does.
      const sectionStarts: boolean[] = [];
      for (const dist of distributed) {
        if (sectionStarts.length < dist.page) sectionStarts.push(dist.sectionStart === true);
      }
      if (footnotes) {
        renumberFootnotes(built.pages, sectionStarts, resolved.footnotes);
      }

      // data-break="clip": hide the overflow of pages whose single item
      // could not fit any page ('avoid' overflow stays visible).
      distributed.forEach((dist, index) => {
        if (!dist.overflows) return;
        const body = built.bodies[index];
        const item = body?.firstElementChild;
        if (!body || !(item instanceof HTMLElement)) return;
        const clip =
          item.matches(`[${BREAK_ATTRIBUTE}="clip"]`) ||
          item.querySelector(`[${BREAK_ATTRIBUTE}="clip"]`) !== null;
        if (clip) body.style.overflow = 'hidden';
      });

      if (resolved.injectStyles !== false) {
        injectStyles(
          doc,
          resolveSize(resolved.page?.size, resolved.page?.orientation),
          built.pages.map((_, index) => layout.config(index + 1).size),
        );
      }

      // Render: user always sees exactly one final copy.
      if (resolved.target !== undefined) {
        const target = resolveElement(resolved.target, doc, 'target');
        target.replaceChildren(built.container);
      } else {
        source.insertAdjacentElement('afterend', built.container);
      }
      container = built.container;
      sourceEl = source;
      sourceDisplay = source.style.display;
      source.style.display = 'none';

      // Line numbers come from the rendered lines, so they go in last.
      const sheets = built.pages.map((_, index) => ({
        bodies: [] as HTMLElement[],
        options: layout.config(index + 1).lineNumbers,
        sectionStart: sectionStarts[index] === true,
      }));
      distributed.forEach((dist, index) => sheets[dist.page - 1]?.bodies.push(built.bodies[index]!));
      if (sheets.some((sheet) => sheet.options)) numberLines(sheets);

      return { pages: built.pages, totalPages: built.pages.length, indexLabels: marks };
    } finally {
      if (!resolved.measurer) measurer.dispose?.();
    }
  };

  return {
    paginate(): PaginateResult {
      // An index's page numbers are known only after pagination: paginate
      // again with them until they hold (as Word updates and repaginates).
      let labels: Map<string, string> | undefined;
      for (let pass = 1; ; pass++) {
        const { indexLabels, ...result } = run(labels);
        if (!indexLabels || pass === 3 || sameLabels(indexLabels, labels)) return result;
        labels = indexLabels;
      }
    },

    async paginateWhenReady(options?: ReadyOptions): Promise<PaginateResult> {
      const doc = typeof resolved.source !== 'string' ? resolved.source.ownerDocument : document;
      await whenContentReady(resolveElement(resolved.source, doc, 'source'), options);
      return this.paginate();
    },

    reset(): void {
      teardown();
    },

    getConfig(): Readonly<PaginatorConfig> {
      return resolved;
    },
  };
}
