/** Preset page sizes. */
export type PageSizePreset = 'letter' | 'legal' | 'a4' | 'a5';

/** Explicit page dimensions, any CSS length (e.g. '8.5in', '210mm'). */
export interface PageDimensions {
  width: string;
  height: string;
}

/** Context passed to header/footer template functions. */
export interface PageContext {
  /** 1-based page number. */
  page: number;
  /** Total page count, computed after distribution. */
  totalPages: number;
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
  /** Repeat <thead> on table continuation pages. Default: false. */
  repeatTableHead?: boolean;
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
