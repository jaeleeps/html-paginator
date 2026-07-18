/**
 * html-paginator
 * Auto page-break pagination for HTML content, targeting @media print.
 */

export { createPaginator, DEFAULT_PAGE_SIZE } from './createPaginator';
export { distribute } from './distribute';
export type { DistributeOptions, DistributedPage } from './distribute';
export { PAGE_SIZE_PRESETS, resolvePageConfig, resolveSize } from './pageConfig';
export type { ResolvedPageConfig } from './pageConfig';
export { renderTemplate } from './renderTemplate';
export { buildPages, CLASS_NAMES } from './buildPages';
export type { BuildPagesOptions } from './buildPages';
export type {
  BreakBehavior,
  HeaderFooterTemplate,
  PageConfig,
  PageContext,
  PageDimensions,
  PageSizePreset,
  PaginateResult,
  Paginator,
  PaginatorConfig,
} from './types';

export const VERSION = '0.0.1';
