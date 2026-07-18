import type { HeaderFooterTemplate, PageContext } from './types';

/**
 * Render a header/footer template into an element for one page.
 *
 * Accepted forms:
 * - `null` / `undefined`     → no element (returns null)
 * - function                 → called with the page context; result is
 *                              rendered recursively (string or element)
 * - HTMLElement              → deep-cloned (each page needs its own node)
 * - string starting with '<' → parsed as an HTML fragment
 * - other string             → treated as a selector; if it matches a
 *                              <template>, its content is cloned; if it
 *                              matches another element, that element is
 *                              cloned; otherwise treated as plain text
 */
export function renderTemplate(
  template: HeaderFooterTemplate | undefined,
  ctx: PageContext,
  doc: Document,
): HTMLElement | null {
  if (template === null || template === undefined) return null;

  if (typeof template === 'function') {
    const result = template(ctx);
    return renderTemplate(result, ctx, doc);
  }

  if (template instanceof HTMLElement) {
    return template.cloneNode(true) as HTMLElement;
  }

  const trimmed = template.trim();
  if (trimmed === '') return null;

  if (trimmed.startsWith('<')) {
    return parseHtmlFragment(trimmed, doc);
  }

  // Try as a selector first.
  let matched: Element | null = null;
  try {
    matched = doc.querySelector(trimmed);
  } catch {
    // Not a valid selector — fall through to plain text.
  }

  if (matched instanceof HTMLTemplateElement) {
    const wrapper = doc.createElement('div');
    wrapper.appendChild(matched.content.cloneNode(true));
    return unwrapSingleElement(wrapper);
  }
  if (matched instanceof HTMLElement) {
    return matched.cloneNode(true) as HTMLElement;
  }

  // Plain text.
  const el = doc.createElement('div');
  el.textContent = template;
  return el;
}

function parseHtmlFragment(html: string, doc: Document): HTMLElement | null {
  const wrapper = doc.createElement('div');
  wrapper.innerHTML = html;
  return unwrapSingleElement(wrapper);
}

/** Return the sole child element, or the wrapper itself for multi-root fragments. */
function unwrapSingleElement(wrapper: HTMLElement): HTMLElement | null {
  if (wrapper.childNodes.length === 0) return null;
  if (wrapper.children.length === 1 && wrapper.childNodes.length === 1) {
    return wrapper.children[0] as HTMLElement;
  }
  return wrapper;
}
