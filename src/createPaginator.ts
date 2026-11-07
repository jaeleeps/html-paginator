import type { MeasureAdapter, PaginateResult, Paginator, PaginatorConfig } from './types';
import { buildPages, CLASS_NAMES } from './buildPages';
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
      buildTableOfContents(copy);

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

      try {
        const distributed = distribute<HTMLElement>({
          items,
          measure: (el, page) => {
            // First measurement of an item: freeze its tables' columns at
            // the width of the page it is laid out on.
            if (layoutIn && !measured.has(el)) {
              measured.add(el);
              freezeTableColumns(el, (fn) => layoutIn(el, page, fn));
            }
            return measurer.measure(el, page);
          },
          pageHeight: (page, slot) => {
            layout.open(page, slot);
            return measurer.pageHeight(page);
          },
          blankPageBefore: (section, page) => layout.blankPageBefore(section, page),
          ...createDomBreaker({ repeatTableHead: resolved.repeatTableHead }),
          fragment,
        });

        const built = buildPages(distributed, { document: doc, layout });
        const total = built.pages.length;
        resolvePageRefs(built.pages, (index) => layout.context(index + 1, total).pageLabel);

        // data-break="clip": hide the overflow of pages whose single item
        // could not fit any page ('avoid' overflow stays visible).
        distributed.forEach((dist, index) => {
          if (!dist.overflows) return;
          const body = built.pages[index]?.querySelector<HTMLElement>(`.${CLASS_NAMES.body}`);
          const item = body?.firstElementChild;
          if (!body || !(item instanceof HTMLElement)) return;
          const clip =
            item.matches(`[${BREAK_ATTRIBUTE}="clip"]`) ||
            item.querySelector(`[${BREAK_ATTRIBUTE}="clip"]`) !== null;
          if (clip) body.style.overflow = 'hidden';
        });

        if (resolved.injectStyles !== false) {
          injectStyles(doc, resolveSize(resolved.page?.size));
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
