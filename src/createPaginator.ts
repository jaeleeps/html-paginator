import type { MeasureAdapter, PaginateResult, Paginator, PaginatorConfig } from './types';
import { buildPages, CLASS_NAMES } from './buildPages';
import { distribute } from './distribute';
import { BREAK_ATTRIBUTE, createDomBreaker, warnNestedBreakAttributes } from './domBreak';
import { createDomMeasurer } from './measure';
import { resolveSize } from './pageConfig';
import { injectStyles } from './styles';

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

      // Work on clones so the source stays intact for reset()/re-pagination.
      const items = Array.from(source.children)
        .filter((c): c is HTMLElement => c instanceof HTMLElement)
        .map((c) => c.cloneNode(true) as HTMLElement);

      const measurer: MeasureAdapter =
        resolved.measurer ??
        createDomMeasurer({
          document: doc,
          page: resolved.page,
          pageOverrides: resolved.pageOverrides,
        });

      try {
        const distributed = distribute<HTMLElement>({
          items,
          measure: (el) => measurer.measure(el),
          pageHeight: (page) => measurer.pageHeight(page),
          ...createDomBreaker({ repeatTableHead: resolved.repeatTableHead }),
        });

        const built = buildPages(distributed, {
          document: doc,
          page: resolved.page,
          pageOverrides: resolved.pageOverrides,
        });

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
