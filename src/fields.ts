import type { PageContext } from './types';
import { PAGE_REF_PLACEHOLDER } from './toc';

/**
 * Page fields in content (Word's PAGE, NUMPAGES, SECTIONPAGES fields):
 * `<span data-hp-field="pageLabel"></span>` shows a value of the page
 * context of the page it lands on. Measured as a placeholder and filled in
 * after rendering, so values never change pagination.
 */
export const FIELD_ATTRIBUTE = 'data-hp-field';

const FIELDS: readonly (keyof PageContext)[] = [
  'page',
  'totalPages',
  'pageNumber',
  'pageLabel',
  'lastPageNumber',
  'lastPageLabel',
  'section',
  'sectionPage',
  'sectionPages',
];

function isField(name: string | null): name is keyof PageContext {
  return (FIELDS as readonly (string | null)[]).includes(name);
}

/** Put the placeholder in every valid field; warn once per unknown name. */
export function prepareFields(root: HTMLElement): void {
  const unknown = new Set<string>();
  for (const el of root.querySelectorAll<HTMLElement>(`[${FIELD_ATTRIBUTE}]`)) {
    const name = el.getAttribute(FIELD_ATTRIBUTE);
    if (isField(name)) el.textContent = PAGE_REF_PLACEHOLDER;
    else unknown.add(name ?? '');
  }
  for (const name of unknown) {
    console.warn(
      `html-paginator: unknown ${FIELD_ATTRIBUTE}="${name}" (expected one of ${FIELDS.join(', ')}); left as is`,
    );
  }
}

/** Fill the fields of each page from its context. */
export function resolveFields(pages: HTMLElement[], context: (pageIndex: number) => PageContext): void {
  pages.forEach((page, index) => {
    const fields = page.querySelectorAll<HTMLElement>(`[${FIELD_ATTRIBUTE}]`);
    if (fields.length === 0) return;
    const ctx = context(index);
    for (const el of fields) {
      const name = el.getAttribute(FIELD_ATTRIBUTE);
      if (isField(name)) el.textContent = String(ctx[name] ?? '');
    }
  });
}
