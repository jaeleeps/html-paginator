import type { MeasureAdapter, PaginateResult, Paginator, PaginatorConfig } from './types';
import { buildPages } from './buildPages';
import { distribute } from './distribute';
import type { FragmentInfo, PageSlot } from './distribute';
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
import { createFootnotes, injectFootnoteStyles, renumberFootnotes } from './footnotes';
import { freezeTableColumns } from './tableColumns';
import { createTextSplitter } from './textSplit';
import { buildTableOfContents, resolvePageRefs } from './toc';

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

  return {
    paginate(): PaginateResult {
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

      // Multi-column pages: each column is an engine page. Engine page n
      // (1-based) lies on sheet physicalOf[n - 1], in column columnOf[n - 1].
      const physicalOf: number[] = [];
      const columnOf: number[] = [];
      const physical = (enginePage: number): number =>
        physicalOf[enginePage - 1] ?? physicalOf[physicalOf.length - 1] ?? enginePage;
      const openColumn = (enginePage: number, slot: PageSlot): number => {
        if (enginePage <= physicalOf.length) return physical(enginePage);
        const sheet = physicalOf[physicalOf.length - 1] ?? 0;
        const column = columnOf[columnOf.length - 1] ?? 0;
        // The next column of the sheet, unless a section starts (new sheet).
        if (sheet > 0 && !slot.sectionStart && !slot.blank && column + 1 < layout.config(sheet).columns) {
          physicalOf.push(sheet);
          columnOf.push(column + 1);
        } else {
          layout.open(sheet + 1, slot);
          physicalOf.push(sheet + 1);
          columnOf.push(0);
        }
        return physical(enginePage);
      };
      const info = (i: FragmentInfo): FragmentInfo => ({ ...i, page: physical(i.page) });

      try {
        const distributed = distribute<HTMLElement>({
          items,
          measure: (el, enginePage) => {
            const page = physical(enginePage);
            // First measurement of an item: freeze its tables' columns at
            // the width of the page it is laid out on.
            if (layoutIn && !measured.has(el)) {
              measured.add(el);
              freezeTableColumns(el, (fn) => layoutIn(el, page, fn));
            }
            return measurer.measure(el, page);
          },
          pageHeight: (enginePage, slot) => measurer.pageHeight(openColumn(enginePage, slot)),
          // Sections always start a new sheet, after the current one.
          blankPageBefore: (section) =>
            layout.blankPageBefore(section, (physicalOf[physicalOf.length - 1] ?? 0) + 1),
          ...createDomBreaker({ repeatTableHead: resolved.repeatTableHead }),
          fragment: fragment && ((el, fits, i) => fragment(el, fits, info(i))),
          notes: footnotes ? (el) => footnotes.notesOf(el) : undefined,
          fragmentNote:
            footnotes && splitText
              ? (note, fits, i) => footnotes.inArea(note, () => splitText(note, fits, info(i)))
              : undefined,
          notesHeight: footnotes
            ? (notes, enginePage) => measurer.measure(footnotes.area(notes), physical(enginePage))
            : undefined,
        });
        distributed.forEach((dist, index) => {
          dist.page = physicalOf[index] ?? dist.page;
          if (layout.config(dist.page).columns > 1) dist.column = columnOf[index];
        });

        const built = buildPages(distributed, {
          document: doc,
          layout,
          renderNotes: footnotes ? (notes) => footnotes.area(notes) : undefined,
        });
        const total = built.pages.length;
        resolvePageRefs(built.pages, (index) => layout.context(index + 1, total).pageLabel);
        resolveFields(built.pages, (index) => layout.context(index + 1, total));
        if (footnotes) {
          // A sheet starts a section when its first column does.
          const sectionStarts: boolean[] = [];
          for (const dist of distributed) {
            if (sectionStarts.length < dist.page) sectionStarts.push(dist.sectionStart === true);
          }
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

        return { pages: built.pages, totalPages: built.pages.length };
      } finally {
        if (!resolved.measurer) measurer.dispose?.();
      }
    },

    reset(): void {
      teardown();
    },

    getConfig(): Readonly<PaginatorConfig> {
      return resolved;
    },
  };
}
