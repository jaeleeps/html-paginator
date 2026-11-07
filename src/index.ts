/**
 * html-paginator
 * Auto page-break pagination for HTML content, targeting @media print.
 */

export { createPaginator, DEFAULT_PAGE_SIZE } from './createPaginator';
export { distribute } from './distribute';
export type {
  DistributeOptions,
  DistributedPage,
  Fragment,
  FragmentInfo,
  PageSlot,
  WrapInfo,
} from './distribute';
export { FIELD_ATTRIBUTE, prepareFields, resolveFields } from './fields';
export {
  createFootnotes,
  FOOTNOTE_ATTRIBUTE,
  FOOTNOTE_CLASS_NAMES,
  injectFootnoteStyles,
  NOTE_ATTRIBUTE,
} from './footnotes';
export type { Footnotes } from './footnotes';
export { createRowSplitter } from './rowSplit';
export { FROZEN_COLUMNS_ATTRIBUTE, freezeTableColumns } from './tableColumns';
export { createTextSplitter } from './textSplit';
export {
  buildTableOfContents,
  PAGE_REF_ATTRIBUTE,
  PAGE_REF_PLACEHOLDER,
  resolvePageRefs,
  TOC_ATTRIBUTE,
  TOC_CLASS_NAMES,
  TOC_LEVEL_ATTRIBUTE,
  TOC_LEVELS_ATTRIBUTE,
  TOC_SKIP_ATTRIBUTE,
} from './toc';
export type { TextSplitterOptions } from './textSplit';
export { createPageLayout } from './layout';
export type { PageLayout, PageLayoutConfig } from './layout';
export {
  BREAK_ATTRIBUTE,
  CONTINUED_ATTRIBUTE,
  createDomBreaker,
  domChildren,
  domWrap,
  getBreakBehavior,
  hasKeepWithNext,
  hasPageBreakBefore,
  getSection,
  KEEP_WITH_NEXT_ATTRIBUTE,
  SECTION_ATTRIBUTE,
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
  SectionConfig,
  PaginateResult,
  Paginator,
  PaginatorConfig,
} from './types';

export const VERSION = '0.0.1';
