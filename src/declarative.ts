import type {
  HeaderFooterTemplate,
  PageConfig,
  Paginator,
  PaginatorConfig,
} from './types';
import { createPaginator } from './createPaginator';

/**
 * Declarative (markup-driven) configuration.
 *
 * Instead of calling `createPaginator` with a JS config, the page is described
 * in HTML:
 *
 *   <template data-hp-config data-hp-size="letter" data-hp-margin="0.6in">
 *     <!-- shared defaults -->
 *     <div data-hp-header>Report — Page {{page}} of {{totalPages}}</div>
 *     <div data-hp-footer>{{page}} / {{totalPages}}</div>
 *
 *     <!-- per-page override group (1-based) -->
 *     <div data-hp-page="1" data-hp-margin="1in">
 *       <div data-hp-header><h1>Cover</h1></div>
 *       <div data-hp-footer="none"></div>  <!-- remove the shared footer -->
 *     </div>
 *   </template>
 *
 *   <div data-hp-content>...</div>
 *
 * Semantics:
 * - The config lives in a <template>, so it is inert and never rendered.
 *   (A plain hidden element with data-hp-config also works.)
 * - A page group inherits shared header/footer for slots it omits;
 *   `data-hp-header="none"` / `data-hp-footer="none"` removes them.
 * - `data-hp-size` accepts a preset ('letter', 'a4', ...) or explicit
 *   dimensions as "<width> <height>" (e.g. "8.5in 11in").
 * - `{{page}}` / `{{totalPages}}` are interpolated per page. As with the JS
 *   API, header/footer height must not depend on these values.
 * - `data-hp-repeat-table-head` (boolean attribute) enables repeatTableHead.
 */
export const DECLARATIVE_ATTRIBUTES = {
  config: 'data-hp-config',
  content: 'data-hp-content',
  header: 'data-hp-header',
  footer: 'data-hp-footer',
  page: 'data-hp-page',
  size: 'data-hp-size',
  margin: 'data-hp-margin',
  repeatTableHead: 'data-hp-repeat-table-head',
} as const;

const A = DECLARATIVE_ATTRIBUTES;

function slotToTemplate(el: Element, attr: string): HeaderFooterTemplate {
  if (el.getAttribute(attr) === 'none') return null;
  const html = el.outerHTML;
  return ({ page, totalPages }) =>
    html
      .replace(/\{\{\s*page\s*\}\}/g, String(page))
      .replace(/\{\{\s*totalPages\s*\}\}/g, String(totalPages));
}

function parseSize(value: string): PageConfig['size'] {
  const parts = value.trim().split(/\s+/);
  if (parts.length === 2) return { width: parts[0]!, height: parts[1]! };
  return value.trim() as PageConfig['size'];
}

/** Read data-hp-size / data-hp-margin from an element. */
function parsePageAttrs(el: Element): PageConfig {
  const config: PageConfig = {};
  const size = el.getAttribute(A.size);
  if (size) config.size = parseSize(size);
  const margin = el.getAttribute(A.margin);
  if (margin) config.margin = margin;
  return config;
}

/** First element with `attr` that is not inside a page override group. */
function findSharedSlot(root: ParentNode, attr: string): Element | null {
  for (const el of root.querySelectorAll(`[${attr}]`)) {
    if (!el.closest(`[${A.page}]`)) return el;
  }
  return null;
}

/**
 * Parse declarative markup into a `PaginatorConfig`.
 * Returns null when the document has no `data-hp-content` element.
 */
export function parseDeclarativeConfig(doc: Document): PaginatorConfig | null {
  const content = doc.querySelector(`[${A.content}]`);
  if (!(content instanceof HTMLElement)) return null;

  const configEl = doc.querySelector(`[${A.config}]`);
  // Templates keep their children in an inert fragment.
  const root: ParentNode | null =
    configEl instanceof HTMLTemplateElement ? configEl.content : configEl;

  // Page attributes may sit on the config element or on the content itself.
  const page: PageConfig = parsePageAttrs(configEl ?? content);
  const config: PaginatorConfig = { source: content, page };

  if (configEl?.hasAttribute(A.repeatTableHead) || content.hasAttribute(A.repeatTableHead)) {
    config.repeatTableHead = true;
  }

  if (root) {
    const header = findSharedSlot(root, A.header);
    if (header) page.header = slotToTemplate(header, A.header);
    const footer = findSharedSlot(root, A.footer);
    if (footer) page.footer = slotToTemplate(footer, A.footer);

    const overrides: Record<number, PageConfig> = {};
    for (const group of root.querySelectorAll(`[${A.page}]`)) {
      const n = Number.parseInt(group.getAttribute(A.page) ?? '', 10);
      if (!Number.isInteger(n) || n < 1) {
        console.warn(`html-paginator: invalid ${A.page} value, group ignored`, group);
        continue;
      }
      const override = parsePageAttrs(group);
      const h = group.querySelector(`[${A.header}]`);
      if (h) override.header = slotToTemplate(h, A.header);
      const f = group.querySelector(`[${A.footer}]`);
      if (f) override.footer = slotToTemplate(f, A.footer);
      overrides[n] = override;
    }
    if (Object.keys(overrides).length > 0) config.pageOverrides = overrides;
  }

  return config;
}

/**
 * Parse declarative markup and paginate immediately.
 * Returns the paginator, or null when no `data-hp-content` exists.
 * `overrides` are merged over the parsed config (e.g. `target`, `measurer`).
 */
export function autoPaginate(
  doc: Document = document,
  overrides?: Partial<PaginatorConfig>,
): Paginator | null {
  const config = parseDeclarativeConfig(doc);
  if (!config) return null;
  const paginator = createPaginator({ ...config, ...overrides });
  paginator.paginate();
  return paginator;
}

export interface PrintPaginationHandle {
  /** Paginate now (what `beforeprint` triggers). */
  run(): void;
  /** Restore the original content (what `afterprint` triggers). */
  reset(): void;
  /** Remove the print event listeners. */
  unbind(): void;
}

/**
 * Bind pagination to the print lifecycle: paginate on `beforeprint`, restore
 * the original content on `afterprint`. The screen view stays untouched.
 *
 * Note: headless Chrome's `page.pdf()` does not fire `beforeprint`; call
 * `handle.run()` (exposed as `window.htmlPaginator.run()` by the auto entry)
 * before generating the PDF.
 */
export function bindPrintPagination(
  doc: Document = document,
  overrides?: Partial<PaginatorConfig>,
): PrintPaginationHandle {
  let paginator: Paginator | null = null;

  const run = (): void => {
    if (!paginator) {
      const config = parseDeclarativeConfig(doc);
      if (!config) return;
      paginator = createPaginator({ ...config, ...overrides });
    }
    paginator.paginate();
  };
  const reset = (): void => paginator?.reset();

  const win = doc.defaultView;
  win?.addEventListener('beforeprint', run);
  win?.addEventListener('afterprint', reset);

  return {
    run,
    reset,
    unbind(): void {
      win?.removeEventListener('beforeprint', run);
      win?.removeEventListener('afterprint', reset);
    },
  };
}
