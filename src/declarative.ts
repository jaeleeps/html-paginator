import type {
  HeaderFooterTemplate,
  PageBorder,
  PageConfig,
  PageContext,
  PageNumberFormat,
  PageNumbering,
  Paginator,
  PaginatorConfig,
  SectionConfig,
} from './types';
import type { LineNumberOptions } from './lineNumbers';
import type { FootnoteOptions } from './footnotes';
import type { EndnoteOptions } from './endnotes';
import { whenContentReady } from './ready';
import type { ReadyOptions } from './ready';
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
 * - `data-hp-watermark` slots work the same way (a layer behind the page).
 * - `data-hp-orientation="landscape"` turns pages (or a section) sideways.
 * - `data-hp-columns="2"` (with `data-hp-column-gap`, `data-hp-column-rule`)
 *   flows pages (or a section) in newspaper columns.
 * - `data-hp-header-distance` / `data-hp-footer-distance` place the header
 *   and footer at a distance from the sheet edge, inside the margin (Word).
 * - `data-hp-line-numbers="page|section|continuous"` (where numbering
 *   restarts; "none" turns it off) with `-start`, `-count-by`, `-distance`.
 * - `data-hp-size` accepts a preset ('letter', 'a4', ...) or explicit
 *   dimensions as "<width> <height>" (e.g. "8.5in 11in").
 * - `{{page}}`, `{{totalPages}}`, `{{pageNumber}}`, `{{pageLabel}}`,
 *   `{{lastPageNumber}}`, `{{lastPageLabel}}`, `{{section}}`,
 *   `{{sectionPage}}` and `{{sectionPages}}` are interpolated per page, and
 *   `{{running.h1}}` / `{{runningLast.name}}` give running header text.
 *   As with the JS API, header/footer height must not depend on them.
 * - `data-hp-page-start` / `data-hp-page-format` set page numbering
 *   (e.g. `data-hp-page-start="0"`, `data-hp-page-format="lower-roman"`);
 *   `data-hp-page-chapter="1"` (+ `-separator`) prefixes the chapter number.
 * - `data-hp-repeat-table-head` (boolean attribute) enables repeatTableHead.
 * - `data-hp-footnote-restart` / `-format` / `-position` and `data-hp-endnote-location` /
 *   `-restart` / `-format` set the footnote and endnote options.
 * - `<div data-hp-section="name">` groups describe `sections[name]` (started
 *   in content by `data-section="name"`): their own slots, size/margin,
 *   numbering attributes, `data-hp-section-start="odd|even|continuous"`, and nested
 *   first/odd/even page groups.
 */
export const DECLARATIVE_ATTRIBUTES = {
  config: 'data-hp-config',
  content: 'data-hp-content',
  header: 'data-hp-header',
  footer: 'data-hp-footer',
  watermark: 'data-hp-watermark',
  page: 'data-hp-page',
  size: 'data-hp-size',
  margin: 'data-hp-margin',
  orientation: 'data-hp-orientation',
  columns: 'data-hp-columns',
  columnGap: 'data-hp-column-gap',
  columnRule: 'data-hp-column-rule',
  headerDistance: 'data-hp-header-distance',
  footerDistance: 'data-hp-footer-distance',
  verticalAlign: 'data-hp-vertical-align',
  mirrorMargins: 'data-hp-mirror-margins',
  gutter: 'data-hp-gutter',
  gutterPosition: 'data-hp-gutter-position',
  pageBorder: 'data-hp-page-border',
  pageBorderFrom: 'data-hp-page-border-from',
  pageBorderOffset: 'data-hp-page-border-offset',
  lineNumbers: 'data-hp-line-numbers',
  lineNumbersStart: 'data-hp-line-numbers-start',
  lineNumbersCountBy: 'data-hp-line-numbers-count-by',
  lineNumbersDistance: 'data-hp-line-numbers-distance',
  repeatTableHead: 'data-hp-repeat-table-head',
  pageStart: 'data-hp-page-start',
  pageFormat: 'data-hp-page-format',
  pageChapter: 'data-hp-page-chapter',
  pageChapterSeparator: 'data-hp-page-chapter-separator',
  section: 'data-hp-section',
  sectionStart: 'data-hp-section-start',
  balanceColumns: 'data-hp-balance-columns',
  footnoteRestart: 'data-hp-footnote-restart',
  footnoteFormat: 'data-hp-footnote-format',
  footnotePosition: 'data-hp-footnote-position',
  endnoteLocation: 'data-hp-endnote-location',
  endnoteRestart: 'data-hp-endnote-restart',
  endnoteFormat: 'data-hp-endnote-format',
} as const;

const A = DECLARATIVE_ATTRIBUTES;

function slotToTemplate(el: Element, attr: string): HeaderFooterTemplate {
  if (el.getAttribute(attr) === 'none') return null;
  const html = el.outerHTML;
  return (ctx) =>
    html.replace(PLACEHOLDER, (match, key: string) => {
      // {{running.h1}} / {{runningLast.chapter}}: text from the content.
      const running = /^(running|runningLast)\.(.+)$/.exec(key);
      if (running) return escapeHtml(ctx[running[1] as 'running' | 'runningLast']?.[running[2]!] ?? '');
      return PLACEHOLDER_KEYS.has(key) ? String(ctx[key as keyof PageContext] ?? '') : match;
    });
}

const PLACEHOLDER = /\{\{\s*([\w.:-]+)\s*\}\}/g;
const PLACEHOLDER_KEYS = new Set<string>([
  'page',
  'totalPages',
  'pageNumber',
  'pageLabel',
  'lastPageNumber',
  'lastPageLabel',
  'section',
  'sectionPage',
  'sectionPages',
]);

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

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
    const chapter = el?.getAttribute(A.pageChapter);
    if (chapter != null && numbering.chapter === undefined) {
      const n = Number(chapter.trim());
      if (Number.isInteger(n) && n >= 0 && n <= 6) numbering.chapter = n;
      else console.warn(`html-paginator: invalid ${A.pageChapter}="${chapter}" (expected 0-6), ignored`, el);
    }
    const separator = el?.getAttribute(A.pageChapterSeparator);
    if (separator != null && numbering.chapterSeparator === undefined) numbering.chapterSeparator = separator;
  }
  return Object.keys(numbering).length > 0 ? numbering : undefined;
}

function parseSize(value: string): PageConfig['size'] {
  const parts = value.trim().split(/\s+/);
  if (parts.length === 2) return { width: parts[0]!, height: parts[1]! };
  return value.trim() as PageConfig['size'];
}

/** Read data-hp-size / -orientation / -margin / -columns... from an element. */
function parsePageAttrs(el: Element): PageConfig {
  const config: PageConfig = {};
  const size = el.getAttribute(A.size);
  if (size) config.size = parseSize(size);
  const margin = el.getAttribute(A.margin);
  if (margin) config.margin = margin;
  const orientation = el.getAttribute(A.orientation);
  if (orientation) config.orientation = orientation.trim() as PageConfig['orientation'];
  const headerDistance = el.getAttribute(A.headerDistance);
  if (headerDistance) config.headerDistance = headerDistance;
  const footerDistance = el.getAttribute(A.footerDistance);
  if (footerDistance) config.footerDistance = footerDistance;
  const mirror = el.getAttribute(A.mirrorMargins);
  if (mirror !== null) config.mirrorMargins = mirror.trim() !== 'false';
  const gutter = el.getAttribute(A.gutter);
  if (gutter) config.gutter = gutter;
  const gutterPosition = el.getAttribute(A.gutterPosition);
  if (gutterPosition) config.gutterPosition = gutterPosition.trim() as PageConfig['gutterPosition'];
  const verticalAlign = el.getAttribute(A.verticalAlign);
  if (verticalAlign) config.verticalAlign = verticalAlign.trim() as PageConfig['verticalAlign'];
  const pageBorder = el.getAttribute(A.pageBorder)?.trim();
  if (pageBorder === 'none') config.pageBorder = null;
  else if (pageBorder) {
    const border: PageBorder = { border: pageBorder };
    const from = el.getAttribute(A.pageBorderFrom);
    if (from) border.from = from.trim() as PageBorder['from'];
    const offset = el.getAttribute(A.pageBorderOffset);
    if (offset) border.offset = offset;
    config.pageBorder = border;
  }
  const columns = el.getAttribute(A.columns);
  if (columns) config.columns = Number(columns.trim());
  const columnGap = el.getAttribute(A.columnGap);
  if (columnGap) config.columnGap = columnGap;
  const columnRule = el.getAttribute(A.columnRule);
  if (columnRule) config.columnRule = columnRule;
  const lineNumbers = el.getAttribute(A.lineNumbers)?.trim();
  if (lineNumbers === 'none') config.lineNumbers = null;
  else if (lineNumbers !== undefined) {
    const options: LineNumberOptions = {};
    if (lineNumbers) options.restart = lineNumbers as LineNumberOptions['restart'];
    const start = el.getAttribute(A.lineNumbersStart);
    if (start) options.start = Number(start);
    const countBy = el.getAttribute(A.lineNumbersCountBy);
    if (countBy) options.countBy = Number(countBy);
    const distance = el.getAttribute(A.lineNumbersDistance);
    if (distance) options.distance = distance;
    config.lineNumbers = options;
  }
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

const SLOTS = ['header', 'footer', 'watermark'] as const;

/** Page config of a group: size/margin attributes plus its header/footer/watermark slots. */
function parseGroup(group: Element): PageConfig {
  const config = parsePageAttrs(group);
  for (const slot of SLOTS) {
    const el = group.querySelector(`[${A[slot]}]`);
    if (el) config[slot] = slotToTemplate(el, A[slot]);
  }
  return config;
}

/** Shared slots of a scope, applied onto its page config. */
function applySharedSlots(root: ParentNode, page: PageConfig, owner: Element | null): void {
  for (const slot of SLOTS) {
    const el = findSharedSlot(root, A[slot], owner);
    if (el) page[slot] = slotToTemplate(el, A[slot]);
  }
}

const SECTION_STARTS = new Set(['next', 'odd', 'even', 'continuous']);

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

  if (group.hasAttribute(A.balanceColumns)) section.balanceColumns = true;
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

  // Footnote and endnote options, from the config element or the content.
  const option = (attr: string): string | undefined =>
    (configEl?.getAttribute(attr) ?? content.getAttribute(attr))?.trim() || undefined;
  const footnotes: FootnoteOptions = {};
  const footnoteRestart = option(A.footnoteRestart);
  if (footnoteRestart) footnotes.restart = footnoteRestart as FootnoteOptions['restart'];
  const footnoteFormat = option(A.footnoteFormat);
  if (footnoteFormat) footnotes.format = footnoteFormat as PageNumberFormat;
  const footnotePosition = option(A.footnotePosition);
  if (footnotePosition) footnotes.position = footnotePosition as FootnoteOptions['position'];
  if (Object.keys(footnotes).length > 0) config.footnotes = footnotes;
  const endnotes: EndnoteOptions = {};
  const endnoteLocation = option(A.endnoteLocation);
  if (endnoteLocation) endnotes.location = endnoteLocation as EndnoteOptions['location'];
  const endnoteRestart = option(A.endnoteRestart);
  if (endnoteRestart) endnotes.restart = endnoteRestart as EndnoteOptions['restart'];
  const endnoteFormat = option(A.endnoteFormat);
  if (endnoteFormat) endnotes.format = endnoteFormat as PageNumberFormat;
  if (Object.keys(endnotes).length > 0) config.endnotes = endnotes;

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
  /**
   * Wait for the content's images and web fonts (see `whenContentReady`),
   * then paginate. Use before headless `page.pdf()`.
   */
  runWhenReady(options?: ReadyOptions): Promise<void>;
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
    async runWhenReady(options) {
      const content = doc.querySelector(`[${A.content}]`);
      if (content) await whenContentReady(content, options);
      run();
    },
    reset,
    unbind(): void {
      win?.removeEventListener('beforeprint', run);
      win?.removeEventListener('afterprint', reset);
    },
  };
}
