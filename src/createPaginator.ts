import type { PaginateResult, Paginator, PaginatorConfig } from './types';

export const DEFAULT_PAGE_SIZE = 'letter' as const;

/**
 * Create a paginator instance.
 *
 * Core pagination logic is not implemented yet — this defines the public
 * API surface and configuration handling.
 */
export function createPaginator(config: PaginatorConfig): Paginator {
  const resolved: PaginatorConfig = {
    repeatTableHead: false,
    ...config,
    page: {
      size: DEFAULT_PAGE_SIZE,
      ...config.page,
    },
  };

  return {
    paginate(): PaginateResult {
      throw new Error('html-paginator: paginate() is not implemented yet');
    },

    reset(): void {
      throw new Error('html-paginator: reset() is not implemented yet');
    },

    getConfig(): Readonly<PaginatorConfig> {
      return resolved;
    },
  };
}
