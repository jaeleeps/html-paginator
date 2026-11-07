import type { BreakBehavior } from './types';
import type { WrapInfo } from './distribute';

/** Attribute controlling break behavior on content elements. */
export const BREAK_ATTRIBUTE = 'data-break';

/** Marker added to continuation fragments (for styling, e.g. hiding borders). */
export const CONTINUED_ATTRIBUTE = 'data-hp-continued';

/** `data-break-before="page"`: start this element on a new page. */
export const PAGE_BREAK_BEFORE_ATTRIBUTE = 'data-break-before';

/** `data-break-after="page"`: start the content after this element on a new page. */
export const PAGE_BREAK_AFTER_ATTRIBUTE = 'data-break-after';

/**
 * `data-keep-with-next`: keep this element on the same page as the next one
 * (Word's "keep with next"). `="false"` opts a heading out of the default.
 */
export const KEEP_WITH_NEXT_ATTRIBUTE = 'data-keep-with-next';

/**
 * `data-section="name"`: start a new section (Word's section break) using
 * `sections[name]`. Implies a page break.
 */
export const SECTION_ATTRIBUTE = 'data-section';

/** Section started by an element; continuation fragments never restart it. */
export function getSection(el: HTMLElement): string | undefined {
  if (el.hasAttribute(CONTINUED_ATTRIBUTE)) return undefined;
  return el.getAttribute(SECTION_ATTRIBUTE) ?? undefined;
}

/** CSS break values that force a page break (`break-*` and legacy `page-break-*`). */
const FORCED_BREAK_VALUES = new Set(['page', 'always', 'left', 'right', 'recto', 'verso']);

/** CSS `break-after: avoid` is keep-with-next; `break-inside: avoid` keeps together. */
const AVOID_BREAK_VALUES = new Set(['avoid', 'avoid-page']);

function cssAvoidsBreak(style: CSSStyleDeclaration | undefined, side: 'after' | 'inside'): boolean {
  if (!style) return false;
  return (
    AVOID_BREAK_VALUES.has(style.getPropertyValue(`break-${side}`)) ||
    AVOID_BREAK_VALUES.has(style.getPropertyValue(`page-break-${side}`))
  );
}

const HEADING = /^H[1-6]$/;

function cssForcesBreak(style: CSSStyleDeclaration | undefined, side: 'before' | 'after'): boolean {
  if (!style) return false;
  return (
    FORCED_BREAK_VALUES.has(style.getPropertyValue(`break-${side}`)) ||
    FORCED_BREAK_VALUES.has(style.getPropertyValue(`page-break-${side}`))
  );
}

/** Next element after `el` in document order that is not inside it, within `root`. */
function nextElementAfter(el: Element, root: Element): Element | null {
  for (let node: Element | null = el; node && node !== root; node = node.parentElement) {
    if (node.nextElementSibling) return node.nextElementSibling;
  }
  return null;
}

/** True when the element starts on a new page (normalized marker). */
export function hasPageBreakBefore(el: HTMLElement): boolean {
  return el.getAttribute(PAGE_BREAK_BEFORE_ATTRIBUTE) === 'page';
}

/** True when the element keeps with the next one (normalized marker). */
export function hasKeepWithNext(el: HTMLElement): boolean {
  return el.hasAttribute(KEEP_WITH_NEXT_ATTRIBUTE) && el.getAttribute(KEEP_WITH_NEXT_ATTRIBUTE) !== 'false';
}

export interface BreakHintOptions {
  /** Headings (h1–h6) keep with next, as in Word. Default: true. */
  keepHeadingsWithNext?: boolean;
}

/**
 * Normalize break hints of `source` onto its deep clone `copy`, as markers
 * that survive fragment wrapping (attributes are copied by `domWrap`):
 *
 * - Forced page breaks → `data-break-before="page"`. Sources:
 *   `data-break-before/after="page"` and CSS `break-before/after` (`page`,
 *   `left`, `right`, ...) or legacy `page-break-before/after: always`. A break
 *   after an element becomes a break before the next element in document
 *   order.
 * - Keep together → `data-break="avoid"` (unless the element sets
 *   `data-break`). Source: CSS `break-inside: avoid` (or legacy
 *   `page-break-inside: avoid`).
 * - Keep with next → `data-keep-with-next`. Sources: the attribute, CSS
 *   `break-after: avoid` (or legacy `page-break-after: avoid`), and headings
 *   unless `keepHeadingsWithNext` is false or the heading says `="false"`.
 *
 * Styles are read from the live source so stylesheets apply.
 */
export function markBreakHints(
  source: HTMLElement,
  copy: HTMLElement,
  options: BreakHintOptions = {},
): void {
  const keepHeadings = options.keepHeadingsWithNext !== false;
  const view = source.ownerDocument.defaultView;
  const sources = source.querySelectorAll('*');
  const copies = copy.querySelectorAll('*');
  sources.forEach((src, i) => {
    const el = copies[i];
    if (!el) return;
    const style = view?.getComputedStyle(src);
    if (src.getAttribute(PAGE_BREAK_BEFORE_ATTRIBUTE) === 'page' || cssForcesBreak(style, 'before')) {
      el.setAttribute(PAGE_BREAK_BEFORE_ATTRIBUTE, 'page');
    }
    if (src.getAttribute(PAGE_BREAK_AFTER_ATTRIBUTE) === 'page' || cssForcesBreak(style, 'after')) {
      nextElementAfter(el, copy)?.setAttribute(PAGE_BREAK_BEFORE_ATTRIBUTE, 'page');
    }

    if (!src.hasAttribute(BREAK_ATTRIBUTE) && cssAvoidsBreak(style, 'inside')) {
      el.setAttribute(BREAK_ATTRIBUTE, 'avoid');
    }

    const keepAttr = src.getAttribute(KEEP_WITH_NEXT_ATTRIBUTE);
    const keep =
      keepAttr === 'false'
        ? false
        : keepAttr !== null || cssAvoidsBreak(style, 'after') || (keepHeadings && HEADING.test(src.tagName));
    if (keep) el.setAttribute(KEEP_WITH_NEXT_ATTRIBUTE, '');
    else el.removeAttribute(KEEP_WITH_NEXT_ATTRIBUTE);
  });
}

const VALID_BEHAVIORS: readonly BreakBehavior[] = ['auto', 'avoid', 'clip'];

function isBreakBehavior(value: string): value is BreakBehavior {
  return (VALID_BEHAVIORS as readonly string[]).includes(value);
}

/**
 * Read the break behavior of an element.
 * - no attribute → 'auto' (leaves are inherently atomic in the engine)
 * - invalid value → console.warn, treated as 'auto'
 */
export function getBreakBehavior(el: HTMLElement): BreakBehavior {
  const raw = el.getAttribute(BREAK_ATTRIBUTE);
  if (raw === null) return 'auto';
  if (isBreakBehavior(raw)) return raw;
  console.warn(
    `html-paginator: invalid ${BREAK_ATTRIBUTE}="${raw}" (expected auto | avoid | clip), treating as "auto"`,
    el,
  );
  return 'auto';
}

/**
 * Warn about nested avoid/clip: descendants of an avoid/clip element must not
 * declare avoid/clip themselves — the outer one wins and the inner attribute
 * is ignored (the outer element is atomic, so the inner is never consulted).
 */
export function warnNestedBreakAttributes(root: HTMLElement): void {
  const selector = `[${BREAK_ATTRIBUTE}="avoid"], [${BREAK_ATTRIBUTE}="clip"]`;
  for (const outer of root.querySelectorAll(selector)) {
    for (const inner of outer.querySelectorAll(selector)) {
      console.warn(
        `html-paginator: nested ${BREAK_ATTRIBUTE}="${inner.getAttribute(BREAK_ATTRIBUTE)}" is ignored — the enclosing ${BREAK_ATTRIBUTE}="${outer.getAttribute(BREAK_ATTRIBUTE)}" element already keeps this content together`,
        inner,
      );
    }
  }
}

/** True when the element has non-whitespace text directly inside it. */
function hasDirectText(el: Element): boolean {
  return Array.from(el.childNodes).some(
    (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '',
  );
}

/**
 * <tfoot> of the table a row is the last data row of. Recorded when the
 * table's rows are first read — before trial wraps move them — so `domWrap`
 * can put the footer on whichever fragment ends the table.
 */
const footByLastRow = new WeakMap<HTMLElement, HTMLTableSectionElement>();
const seenTables = new WeakSet<HTMLTableElement>();

function tableRows(table: HTMLTableElement): HTMLElement[] {
  const rows = Array.from(table.tBodies).flatMap((tbody) => Array.from(tbody.rows));
  if (!seenTables.has(table)) {
    seenTables.add(table);
    const last = rows[rows.length - 1];
    if (last && table.tFoot) footByLastRow.set(last, table.tFoot);
  }
  return rows;
}

/** A split row's tail ends the table if the row did: it takes over the footer. */
export function transferTableFoot(row: HTMLElement, tail: HTMLElement): void {
  const foot = footByLastRow.get(row);
  if (foot) footByLastRow.set(tail, foot);
}

/**
 * Child items of an element for splitting purposes.
 * - <table> → data rows (tr of its tbody sections); caption/thead/tfoot are
 *   chrome rebuilt by `domWrap`, not splittable content
 * - elements with direct text (e.g. `<p>Hello <b>world</b></p>`) → [] (atomic):
 *   splitting between inline children would drop the text
 * - other elements → element children
 * - leaves (no element children) → [] (atomic)
 */
export function domChildren(el: HTMLElement): HTMLElement[] {
  if (el instanceof HTMLTableElement) {
    return tableRows(el);
  }
  if (el instanceof HTMLTableRowElement) {
    return []; // Never split a row at cell level.
  }
  if (hasDirectText(el)) return [];
  return Array.from(el.children).filter((c): c is HTMLElement => c instanceof HTMLElement);
}

export interface DomWrapOptions {
  /** Repeat <thead> on table continuation fragments. Default: false. */
  repeatTableHead?: boolean;
}

/**
 * Rebuild an element around a subset of its children (a page fragment).
 *
 * The wrapper is a shallow clone (same tag + attributes, so CSS still
 * applies). Continuation fragments get `data-hp-continued`.
 *
 * Tables are reassembled properly: caption and <thead> appear on the first
 * fragment (and on continuations when `repeatTableHead` is set); rows go
 * into a fresh <tbody>; <tfoot> goes on the fragment holding the last row.
 */
export function domWrap(
  el: HTMLElement,
  children: HTMLElement[],
  info: WrapInfo,
  options: DomWrapOptions = {},
): HTMLElement {
  const clone = el.cloneNode(false) as HTMLElement;
  if (info.continuation) {
    clone.setAttribute(CONTINUED_ATTRIBUTE, '');
  }

  if (el instanceof HTMLTableElement) {
    const table = clone as HTMLTableElement;
    const includeChrome = !info.continuation || options.repeatTableHead === true;
    if (includeChrome) {
      if (el.caption && !info.continuation) {
        table.appendChild(el.caption.cloneNode(true));
      }
      if (el.tHead) {
        table.appendChild(el.tHead.cloneNode(true));
      }
    }
    tableRows(el as HTMLTableElement); // Record the footer before rows move.
    const tbody = el.ownerDocument.createElement('tbody');
    for (const row of children) tbody.appendChild(row);
    table.appendChild(tbody);
    const foot = footByLastRow.get(children[children.length - 1] as HTMLElement);
    if (foot) table.appendChild(foot.cloneNode(true));
    return table;
  }

  for (const child of children) clone.appendChild(child);
  return clone;
}

/** Split hooks for `distribute()` operating on live DOM elements. */
export function createDomBreaker(options: DomWrapOptions = {}): {
  breakBehavior: (el: HTMLElement) => BreakBehavior;
  children: (el: HTMLElement) => HTMLElement[];
  wrap: (el: HTMLElement, children: HTMLElement[], info: WrapInfo) => HTMLElement;
  pageBreakBefore: (el: HTMLElement) => boolean;
  keepWithNext: (el: HTMLElement) => boolean;
  section: (el: HTMLElement) => string | undefined;
} {
  return {
    breakBehavior: getBreakBehavior,
    children: domChildren,
    wrap: (el, children, info) => domWrap(el, children, info, options),
    pageBreakBefore: hasPageBreakBefore,
    keepWithNext: hasKeepWithNext,
    section: getSection,
  };
}
