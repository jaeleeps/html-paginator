import type { EndnoteOptions } from './endnotes';
import type { ReadyOptions } from './ready';
import type { FootnoteOptions } from './footnotes';
import type { LineNumberOptions } from './lineNumbers';

/** Preset page sizes. */
export type PageSizePreset = 'letter' | 'legal' | 'a4' | 'a5';

/** Explicit page dimensions, any CSS length (e.g. '8.5in', '210mm'). */
export interface PageDimensions {
  width: string;
  height: string;
}

/** Context passed to header/footer template functions. */
export interface PageContext {
  /** 1-based physical page index. */
  page: number;
  /** Total page count, computed after distribution. */
  totalPages: number;
  /** Displayed page number: `page` shifted by `pageNumbers.start`. */
  pageNumber: number;
  /** `pageNumber` formatted with `pageNumbers.format` (e.g. 'iv'). */
  pageLabel: string;
  /** Displayed number of the last page (for "Page X of Y"). */
  lastPageNumber: number;
  /** `lastPageNumber` formatted with `pageNumbers.format`. */
  lastPageLabel: string;
  /** Name of the page's section (undefined before the first section). */
  section?: string;
  /** 1-based page index within the section (Word's SECTIONPAGES context). */
  sectionPage: number;
  /** Number of pages in the section. */
  sectionPages: number;
  /**
   * Running header values (Word's STYLEREF), by name: "h1"…"h6" for
   * headings, or a `data-hp-running` name. The first value set on the page,
   * else the last one set before it.
   */
  running: Record<string, string>;
  /** The last running value set on the page, else the last one before it (STYLEREF \l). */
  runningLast: Record<string, string>;
}

/** Page number styles (Word's "Format Page Numbers"), or a custom formatter. */
export type PageNumberFormat =
  | 'decimal'
  | 'lower-roman'
  | 'upper-roman'
  | 'lower-alpha'
  | 'upper-alpha'
  | ((n: number) => string);

/**
 * A section's layout (Word's section break). Content starts a section with
 * `data-section="name"`. Layers merge over the top-level ones: `page`,
 * `oddPages` and `evenPages` inherit; `firstPage` applies to the section's
 * own first page.
 */
export interface SectionConfig {
  page?: PageConfig;
  firstPage?: PageConfig;
  oddPages?: PageConfig;
  evenPages?: PageConfig;
  /**
   * `start` restarts numbering at that number; without it numbering
   * continues from the previous page. `format` defaults to the top-level one.
   */
  pageNumbers?: PageNumbering;
  /**
   * Which side the section starts on: 'next' (default) page, or the next
   * 'odd' / 'even' physical page, inserting a blank page when needed (for
   * duplex printing: chapters on right-hand pages). 'continuous' starts it
   * on the same page, below the previous section (Word's continuous section
   * break): a multi-column section can begin or end mid-page, and columns
   * before the break are balanced. Its page settings other than columns
   * apply from the next page.
   */
  start?: 'next' | 'odd' | 'even' | 'continuous';
  /**
   * Balance the columns on the section's last page to equal height (what a
   * continuous section break after the section does in Word), also at the
   * end of the document or before a section starting on a new page.
   */
  balanceColumns?: boolean;
}

/** Page numbering options. */
export interface PageNumbering {
  /** Number displayed on the first page. Default: 1 (0 = unnumbered cover). */
  start?: number;
  /** Number style. Default: 'decimal'. */
  format?: PageNumberFormat;
  /**
   * Put the chapter number in front (Word: "include chapter number"): the
   * heading level that starts chapters (1 = h1), e.g. "2-5"; 0 turns it off
   * (in a section). The chapter is the first such heading on the page, else
   * the last one before it. Default: none.
   */
  chapter?: number;
  /** Between the chapter and page number. Default: '-'. */
  chapterSeparator?: string;
}

/**
 * Header/footer definition:
 * - HTML string
 * - HTMLElement
 * - selector to a <template>
 * - template function receiving the page context
 * - null to explicitly remove (useful in pageOverrides)
 */
export type HeaderFooterTemplate =
  | string
  | HTMLElement
  | ((ctx: PageContext) => string | HTMLElement)
  | null;

/** Configuration of a single page (the default, or a per-page override). */
export interface PageConfig {
  size?: PageSizePreset | PageDimensions;
  /**
   * 'landscape' turns the page sideways (width and height of `size` swap;
   * sizes are given upright). A section can set it alone, keeping the size.
   * Default: 'portrait'.
   */
  orientation?: 'portrait' | 'landscape';
  /** Any CSS margin shorthand (e.g. '0.5in', '10mm 20mm'). */
  margin?: string;
  /**
   * Mirror margins for facing pages (Word: Multiple pages > Mirror margins):
   * on even pages the left and right margins swap, so `margin`'s left side
   * is the inside margin throughout. Default: false.
   */
  mirrorMargins?: boolean;
  /**
   * Extra space for binding (Word: Gutter), added to the left margin, or
   * with `mirrorMargins` to the inside one (CSS length). Default: none.
   */
  gutter?: string;
  /**
   * Which margin the gutter goes in (Word: Gutter position): 'left'
   * (default), 'right' (right-to-left documents) or 'top' (top binding).
   * With `mirrorMargins` it is always the inside margin.
   */
  gutterPosition?: 'left' | 'right' | 'top';
  /**
   * Distance from the top edge of the sheet to the header (Word: "Header
   * from top", e.g. '0.5in'). The header then sits inside the top margin and
   * the body starts at the margin, lower only if the header is taller.
   * Default: none (the header sits inside the margin box, above the body).
   */
  headerDistance?: string;
  /** Distance from the bottom edge to the footer (Word: "Footer from bottom"). */
  footerDistance?: string;
  header?: HeaderFooterTemplate;
  footer?: HeaderFooterTemplate;
  /**
   * Watermark or page background (Word: "DRAFT"), rendered behind the page
   * content across the whole sheet; it never affects pagination. Same
   * templates and context as header/footer.
   */
  watermark?: HeaderFooterTemplate;
  /**
   * Newspaper columns (Word: section columns). Content flows down the
   * first column, then the next; set per section to switch columns on and
   * off. A forced page break inside a multi-column page moves to the next
   * column (Word's column break). Default: 1.
   */
  columns?: number;
  /** Space between columns (CSS length). Default: '0.5in' (Word's default). */
  columnGap?: string;
  /** Line between columns (CSS border, e.g. '1px solid #999'). Default: none. */
  columnRule?: string;
  /**
   * Line numbers in the left margin (Word: Layout > Line Numbers); `null`
   * turns them off (e.g. in one section). Default: none.
   */
  lineNumbers?: LineNumberOptions | null;
  /**
   * Where the body's content sits when it does not fill the page (Word:
   * Page Setup > Vertical alignment), e.g. `'center'` for a title page.
   * Pages with several sections on them (continuous breaks) stay at the
   * top, as do overflowing pages. Default: 'top'.
   */
  verticalAlign?: 'top' | 'center' | 'bottom';
  /**
   * Border around the page (Word: Design > Page Borders): a CSS border
   * (e.g. '1px solid #000'), or with where it is measured from. Drawn out
   * of the flow, so it never affects pagination; `null` removes it (e.g.
   * on the first page). Default: none.
   */
  pageBorder?: string | PageBorder | null;
}

export interface PageBorder {
  /** CSS border shorthand, e.g. '3px double #333'. */
  border: string;
  /**
   * 'edge' (Word's default): `offset` from the edge of the sheet to the
   * border. 'text': `offset` from the body (the margins) out to the border.
   */
  from?: 'edge' | 'text';
  /** Default: '24pt' from the edge, '4pt' from the text (Word's defaults). */
  offset?: string;
}

/** Values accepted by the `data-break` attribute on content elements. */
export type BreakBehavior = 'auto' | 'avoid' | 'clip';

/**
 * Measurement adapter used during distribution. The default is a DOM
 * measurer based on real layout (`createDomMeasurer`); inject a custom one
 * for tests or non-standard measurement.
 */
export interface MeasureAdapter {
  /** Outer height of an item, laid out on the given page (1-based). */
  measure(item: HTMLElement, page?: number): number;
  /** Available body height of the given page (1-based). */
  pageHeight(page: number): number;
  /**
   * Run `fn` while `item` is laid out on the given page, then restore it.
   * Needed to split paragraphs between lines (see `splitParagraphs`);
   * without it, paragraphs move to the next page whole.
   */
  layout?<R>(item: HTMLElement, page: number, fn: () => R): R;
  /**
   * Lay items out on `page` at the width of one of `columns` columns (for a
   * region whose columns differ from the page's). Without it, items are
   * measured at the page's own column width.
   */
  columns?(page: number, columns: number, gap: string): void;
  /** Clean up any probe state. */
  dispose?(): void;
}

export interface PaginatorConfig {
  /** The content wrapper to paginate: selector or element. */
  source: string | HTMLElement;
  /**
   * Where paginated pages are rendered: selector or element.
   * When omitted, pages are inserted right after the (hidden) source.
   */
  target?: string | HTMLElement;
  /** Default page definition, applied to every page. */
  page?: PageConfig;
  /** Per-page overrides (1-based page number), merged over the default. */
  pageOverrides?: Record<number, PageConfig>;
  /** Word's "Different First Page": merged over the default on page 1. */
  firstPage?: PageConfig;
  /**
   * Word's "Different Odd & Even Pages": merged over the default by the
   * parity of the displayed page number (`pageNumbers.start` shifts it).
   * Precedence: page < oddPages/evenPages < firstPage < pageOverrides[n].
   */
  oddPages?: PageConfig;
  evenPages?: PageConfig;
  /** Displayed page numbering (start number and style). */
  pageNumbers?: PageNumbering;
  /** Section layouts by name, started by `data-section="name"` in content. */
  sections?: Record<string, SectionConfig>;
  /**
   * Headings (h1–h6) keep with the next element, as in Word, so they are
   * never stranded at the bottom of a page. Default: true.
   */
  keepHeadingsWithNext?: boolean;
  /**
   * Split paragraphs (elements holding text) between lines when they do not
   * fit, like Word, keeping at least CSS `orphans` lines at the bottom of a
   * page and `widows` lines at the top of the next (both default to 2).
   * `data-break="avoid"` or `break-inside: avoid` keeps one whole.
   * Default: true.
   */
  splitParagraphs?: boolean;
  /** Footnote numbering (see `data-footnote`). */
  footnotes?: FootnoteOptions;
  /** Endnote numbering (see `data-endnote`). */
  endnotes?: EndnoteOptions;
  /**
   * Let table rows break across pages, like Word ("Allow row to break across
   * pages"): cells split between lines at a common cut, with CSS
   * `orphans`/`widows` per cell. `data-break="avoid"` or
   * `break-inside: avoid` on a row keeps it whole. Default: true.
   */
  splitTableRows?: boolean;
  /** Repeat <thead> on table continuation pages. Default: false. */
  repeatTableHead?: boolean;
  /**
   * Inject the built-in page/print stylesheet into the document.
   * Default: true. Disable to ship your own CSS.
   */
  injectStyles?: boolean;
  /** Custom measurement adapter (default: DOM layout measurement). */
  measurer?: MeasureAdapter;
}

export interface PaginateResult {
  pages: HTMLElement[];
  totalPages: number;
}

export interface Paginator {
  /** Distribute content across pages and render the result. */
  paginate(): PaginateResult;
  /**
   * Wait until the source's images and the document's web fonts have
   * loaded (see `whenContentReady`), then paginate.
   */
  paginateWhenReady(options?: ReadyOptions): Promise<PaginateResult>;
  /** Undo pagination and show the original source content. */
  reset(): void;
  /** Current resolved configuration. */
  getConfig(): Readonly<PaginatorConfig>;
}
