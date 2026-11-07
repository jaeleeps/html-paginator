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
}

/** Page number styles (Word's "Format Page Numbers"), or a custom formatter. */
export type PageNumberFormat =
  | 'decimal'
  | 'lower-roman'
  | 'upper-roman'
  | 'lower-alpha'
  | 'upper-alpha'
  | ((n: number) => string);

/** Page numbering options. */
export interface PageNumbering {
  /** Number displayed on the first page. Default: 1 (0 = unnumbered cover). */
  start?: number;
  /** Number style. Default: 'decimal'. */
  format?: PageNumberFormat;
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
  /** Any CSS margin shorthand (e.g. '0.5in', '10mm 20mm'). */
  margin?: string;
  header?: HeaderFooterTemplate;
  footer?: HeaderFooterTemplate;
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
  /** Undo pagination and show the original source content. */
  reset(): void;
  /** Current resolved configuration. */
  getConfig(): Readonly<PaginatorConfig>;
}
