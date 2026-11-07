/**
 * html-paginator
 * Auto page-break pagination for HTML content, targeting @media print.
 */

export { createPaginator, DEFAULT_PAGE_SIZE } from './createPaginator';
export { distribute } from './distribute';
export type { DistributeOptions, DistributedPage, WrapInfo } from './distribute';
export {
  BREAK_ATTRIBUTE,
  CONTINUED_ATTRIBUTE,
  createDomBreaker,
  domChildren,
  domWrap,
  getBreakBehavior,
  hasKeepWithNext,
  hasPageBreakBefore,
  KEEP_WITH_NEXT_ATTRIBUTE,
  markBreakHints,
  PAGE_BREAK_AFTER_ATTRIBUTE,
  PAGE_BREAK_BEFORE_ATTRIBUTE,
  warnNestedBreakAttributes,
} from './domBreak';
export type { BreakHintOptions, DomWrapOptions } from './domBreak';
export { PAGE_SIZE_PRESETS, resolvePageConfig, resolveSize } from './pageConfig';
export type { PageVariants, ResolvedPageConfig } from './pageConfig';
export {
  autoPaginate,
  bindPrintPagination,
  DECLARATIVE_ATTRIBUTES,
  parseDeclarativeConfig,
} from './declarative';
export type { PrintPaginationHandle } from './declarative';
export { formatPageNumber, pageContext } from './pageNumbers';
export { renderTemplate } from './renderTemplate';
export { buildPages, CLASS_NAMES } from './buildPages';
export type { BuildPagesOptions } from './buildPages';
export { createDomMeasurer, measureOuterHeight } from './measure';
export { buildStylesheet, injectStyles, STYLE_ATTRIBUTE } from './styles';
export type { DomMeasurer, DomMeasurerOptions } from './measure';
export type {
  BreakBehavior,
  HeaderFooterTemplate,
  MeasureAdapter,
  PageConfig,
  PageContext,
  PageDimensions,
  PageNumberFormat,
  PageNumbering,
  PageSizePreset,
  PaginateResult,
  Paginator,
  PaginatorConfig,
} from './types';

export const VERSION = '0.0.1';
