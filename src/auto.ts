/**
 * Zero-config entry point for declarative pagination.
 *
 *   <script type="module" src=".../html-paginator/auto"></script>
 *
 * Importing this module binds pagination to the print lifecycle
 * (`beforeprint` paginates, `afterprint` restores) and exposes the handle as
 * `window.htmlPaginator` for environments where `beforeprint` does not fire
 * (e.g. call `window.htmlPaginator.run()` before headless `page.pdf()`).
 */
import { bindPrintPagination } from './declarative';
import type { PrintPaginationHandle } from './declarative';

declare global {
  interface Window {
    htmlPaginator?: PrintPaginationHandle;
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.htmlPaginator = bindPrintPagination(document);
}
