/**
 * html-paginator
 * Auto page-break pagination for HTML content, targeting @media print.
 */

export { createPaginator, DEFAULT_PAGE_SIZE } from './createPaginator';
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
