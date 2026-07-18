import type { PageConfig, PageDimensions, PageSizePreset } from './types';

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
export function resolveSize(size: PageConfig['size']): PageDimensions {
  if (size === undefined) return PAGE_SIZE_PRESETS.letter;
  if (typeof size === 'string') {
    const preset = PAGE_SIZE_PRESETS[size];
    if (!preset) {
      throw new Error(`html-paginator: unknown page size preset "${size}"`);
    }
    return preset;
  }
  return size;
}

/**
 * Resolve the effective config for one page: the per-page override (if any)
 * merged over the default page config.
 *
 * `header: null` / `footer: null` in an override explicitly removes the
 * default header/footer for that page; an absent key inherits the default.
 */
export function resolvePageConfig(
  page: number,
  defaults: PageConfig | undefined,
  overrides: Record<number, PageConfig> | undefined,
): ResolvedPageConfig {
  const override = overrides?.[page];
  const merged: PageConfig = { ...defaults, ...override };
  return {
    size: resolveSize(merged.size),
    margin: merged.margin ?? DEFAULT_MARGIN,
    header: merged.header,
    footer: merged.footer,
  };
}
