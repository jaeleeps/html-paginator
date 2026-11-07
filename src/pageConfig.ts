import type { PageConfig, PageDimensions, PageNumbering, PageSizePreset } from './types';

export const PAGE_SIZE_PRESETS: Record<PageSizePreset, PageDimensions> = {
  letter: { width: '8.5in', height: '11in' },
  legal: { width: '8.5in', height: '14in' },
  a4: { width: '210mm', height: '297mm' },
  a5: { width: '148mm', height: '210mm' },
};

export interface ResolvedPageConfig {
  size: PageDimensions;
  margin: string;
  header: PageConfig['header'];
  footer: PageConfig['footer'];
}

export const DEFAULT_MARGIN = '0';

/** Convert a size preset or explicit dimensions into dimensions. */
export function resolveSize(
  size: PageConfig['size'],
  orientation: PageConfig['orientation'] = 'portrait',
): PageDimensions {
  let dims: PageDimensions;
  if (size === undefined) {
    dims = PAGE_SIZE_PRESETS.letter;
  } else if (typeof size === 'string') {
    const preset = PAGE_SIZE_PRESETS[size];
    if (!preset) {
      throw new Error(`html-paginator: unknown page size preset "${size}"`);
    }
    dims = preset;
  } else {
    dims = size;
  }
  if (orientation === 'landscape') return { width: dims.height, height: dims.width };
  if (orientation !== 'portrait') {
    throw new Error(`html-paginator: unknown orientation "${orientation}" (expected portrait | landscape)`);
  }
  return dims;
}

/**
 * Name of the CSS named page (`@page <name>`) for a sheet size, so pages
 * of different sizes or orientations print on matching sheets.
 */
export function pageSizeName(size: PageDimensions): string {
  const part = (v: string) => v.trim().replace(/[^a-zA-Z0-9]+/g, '_');
  return `hp-${part(size.width)}-${part(size.height)}`;
}

/**
 * Word-style page variants ("Different First Page", "Different Odd & Even
 * Pages"). Odd/even follows the displayed page number, so it depends on
 * `pageNumbers.start`.
 */
export interface PageVariants {
  firstPage?: PageConfig;
  oddPages?: PageConfig;
  evenPages?: PageConfig;
  pageNumbers?: PageNumbering;
}

/**
 * Resolve the effective config for one page. Later layers win:
 * default page → odd/even variant → first-page variant → `overrides[page]`.
 *
 * `header: null` / `footer: null` in a layer explicitly removes the
 * header/footer for that page; an absent key inherits from earlier layers.
 */
export function resolvePageConfig(
  page: number,
  defaults: PageConfig | undefined,
  overrides: Record<number, PageConfig> | undefined,
  variants: PageVariants = {},
): ResolvedPageConfig {
  const pageNumber = (variants.pageNumbers?.start ?? 1) + page - 1;
  const parity = pageNumber % 2 === 0 ? variants.evenPages : variants.oddPages;
  return mergePageLayers(
    defaults,
    parity,
    page === 1 ? variants.firstPage : undefined,
    overrides?.[page],
  );
}

/**
 * Merge page config layers, later ones winning per property, and resolve
 * size and margin defaults.
 */
export function mergePageLayers(...layers: (PageConfig | undefined)[]): ResolvedPageConfig {
  const merged: PageConfig = Object.assign({}, ...layers);
  return {
    size: resolveSize(merged.size, merged.orientation),
    margin: merged.margin ?? DEFAULT_MARGIN,
    header: merged.header,
    footer: merged.footer,
  };
}
