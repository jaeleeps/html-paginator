import type {
  HeaderFooterTemplate,
  PageConfig,
  PageContext,
  PageNumberFormat,
  PageNumbering,
  Paginator,
  PaginatorConfig,
  SectionConfig,
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
 *     <!-- per-page override group: 1-based number, or first | odd | even -->
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
 * - `data-hp-page="first"`, `"odd"`, `"even"` map to firstPage / oddPages /
 *   evenPages (Word's different first page and odd & even pages).
 * - A page group inherits shared header/footer for slots it omits;
 *   `data-hp-header="none"` / `data-hp-footer="none"` removes them.
 * - `data-hp-size` accepts a preset ('letter', 'a4', ...) or explicit
 *   dimensions as "<width> <height>" (e.g. "8.5in 11in").
 * - `{{page}}`, `{{totalPages}}`, `{{pageNumber}}`, `{{pageLabel}}`,
 *   `{{lastPageNumber}}` and `{{lastPageLabel}}` are interpolated per page.
 *   As with the JS API, header/footer height must not depend on them.
 * - `data-hp-page-start` / `data-hp-page-format` set page numbering
 *   (e.g. `data-hp-page-start="0"`, `data-hp-page-format="lower-roman"`).
 * - `data-hp-repeat-table-head` (boolean attribute) enables repeatTableHead.
 * - `<div data-hp-section="name">` groups describe `sections[name]` (started
 *   in content by `data-section="name"`): their own slots, size/margin,
 *   numbering attributes, `data-hp-section-start="odd|even"`, and nested
 *   first/odd/even page groups.
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
  pageStart: 'data-hp-page-start',
  pageFormat: 'data-hp-page-format',
  section: 'data-hp-section',
  sectionStart: 'data-hp-section-start',
} as const;

const A = DECLARATIVE_ATTRIBUTES;

function slotToTemplate(el: Element, attr: string): HeaderFooterTemplate {
  if (el.getAttribute(attr) === 'none') return null;
  const html = el.outerHTML;
  return (ctx) =>
    html.replace(PLACEHOLDER, (match, key: string) =>
      PLACEHOLDER_KEYS.has(key) ? String(ctx[key as keyof PageContext]) : match,
    );
}

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;
const PLACEHOLDER_KEYS = new Set<string>([
  'page',
  'totalPages',
  'pageNumber',
  'pageLabel',
  'lastPageNumber',
  'lastPageLabel',
]);

const PAGE_FORMATS = new Set(['decimal', 'lower-roman', 'upper-roman', 'lower-alpha', 'upper-alpha']);

/** Read data-hp-page-start / data-hp-page-format (first element that has them). */
function parseNumbering(...els: (Element | null)[]): PageNumbering | undefined {
  const numbering: PageNumbering = {};
  for (const el of els) {
    const start = el?.getAttribute(A.pageStart);
    if (start != null && numbering.start === undefined) {
      const n = Number(start.trim());
      if (start.trim() !== '' && Number.isInteger(n)) numbering.start = n;
      else console.warn(`html-paginator: invalid ${A.pageStart}="${start}", ignored`, el);
    }
    const format = el?.getAttribute(A.pageFormat);
    if (format != null && numbering.format === undefined) {
      if (PAGE_FORMATS.has(format.trim())) numbering.format = format.trim() as PageNumberFormat;
      else console.warn(`html-paginator: invalid ${A.pageFormat}="${format}", ignored`, el);
    }
  }
  return Object.keys(numbering).length > 0 ? numbering : undefined;
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

/** Section group an element belongs to (null at the top level). */
const sectionOf = (el: Element): Element | null => el.parentElement?.closest(`[${A.section}]`) ?? null;

/**
 * First element with `attr` directly in a scope (the top level, or one
 * section group): not inside a page group or another section group.
 */
function findSharedSlot(root: ParentNode, attr: string, owner: Element | null): Element | null {
  for (const el of root.querySelectorAll(`[${attr}]`)) {
    if (!el.closest(`[${A.page}]`) && sectionOf(el) === owner) return el;
  }
  return null;
}

/** Page config of a group: size/margin attributes plus its header/footer slots. */
function parseGroup(group: Element): PageConfig {
  const config = parsePageAttrs(group);
  const h = group.querySelector(`[${A.header}]`);
  if (h) config.header = slotToTemplate(h, A.header);
  const f = group.querySelector(`[${A.footer}]`);
  if (f) config.footer = slotToTemplate(f, A.footer);
  return config;
}

/** Shared slots of a scope, applied onto its page config. */
function applySharedSlots(root: ParentNode, page: PageConfig, owner: Element | null): void {
  const header = findSharedSlot(root, A.header, owner);
  if (header) page.header = slotToTemplate(header, A.header);
  const footer = findSharedSlot(root, A.footer, owner);
  if (footer) page.footer = slotToTemplate(footer, A.footer);
}

const SECTION_STARTS = new Set(['next', 'odd', 'even']);

function parseSection(root: ParentNode, group: Element): SectionConfig {
  const section: SectionConfig = { page: parsePageAttrs(group) };
  applySharedSlots(root, section.page!, group);

  for (const pageGroup of root.querySelectorAll(`[${A.page}]`)) {
    if (sectionOf(pageGroup) !== group) continue;
    const value = (pageGroup.getAttribute(A.page) ?? '').trim();
    if (value === 'first') section.firstPage = parseGroup(pageGroup);
    else if (value === 'odd') section.oddPages = parseGroup(pageGroup);
    else if (value === 'even') section.evenPages = parseGroup(pageGroup);
    else console.warn(`html-paginator: ${A.page}="${value}" is not supported inside a section, group ignored`, pageGroup);
  }

  const numbering = parseNumbering(group);
  if (numbering) section.pageNumbers = numbering;

  const start = group.getAttribute(A.sectionStart)?.trim();
  if (start !== undefined) {
    if (SECTION_STARTS.has(start)) section.start = start as SectionConfig['start'];
    else console.warn(`html-paginator: invalid ${A.sectionStart}="${start}", ignored`, group);
  }
  return section;
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

  const numbering = parseNumbering(configEl, content);
  if (numbering) config.pageNumbers = numbering;

  if (root) {
    applySharedSlots(root, page, null);

    const overrides: Record<number, PageConfig> = {};
    for (const group of root.querySelectorAll(`[${A.page}]`)) {
      if (sectionOf(group) !== null) continue; // parsed with its section
      const value = (group.getAttribute(A.page) ?? '').trim();
      const override = parseGroup(group);

      if (value === 'first') config.firstPage = override;
      else if (value === 'odd') config.oddPages = override;
      else if (value === 'even') config.evenPages = override;
      else {
        const n = Number.parseInt(value, 10);
        if (!Number.isInteger(n) || n < 1) {
          console.warn(`html-paginator: invalid ${A.page} value, group ignored`, group);
          continue;
        }
        overrides[n] = override;
      }
    }
    if (Object.keys(overrides).length > 0) config.pageOverrides = overrides;

    const sections: Record<string, SectionConfig> = {};
    for (const group of root.querySelectorAll(`[${A.section}]`)) {
      sections[group.getAttribute(A.section) ?? ''] = parseSection(root, group);
    }
    if (Object.keys(sections).length > 0) config.sections = sections;
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
