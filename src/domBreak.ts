import type { BreakBehavior } from './types';
import type { WrapInfo } from './distribute';

/** Attribute controlling break behavior on content elements. */
export const BREAK_ATTRIBUTE = 'data-break';

/** Marker added to continuation fragments (for styling, e.g. hiding borders). */
export const CONTINUED_ATTRIBUTE = 'data-hp-continued';

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

/**
 * Child items of an element for splitting purposes.
 * - <table> → data rows (tr of its tbody sections); caption/thead/tfoot are
 *   chrome rebuilt by `domWrap`, not splittable content
 * - other elements → element children
 * - leaves (no element children) → [] (atomic)
 */
export function domChildren(el: HTMLElement): HTMLElement[] {
  if (el instanceof HTMLTableElement) {
    return Array.from(el.tBodies).flatMap((tbody) => Array.from(tbody.rows));
  }
  if (el instanceof HTMLTableRowElement) {
    return []; // Never split a row at cell level.
  }
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
 * into a fresh <tbody>.
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
    const tbody = el.ownerDocument.createElement('tbody');
    for (const row of children) tbody.appendChild(row);
    table.appendChild(tbody);
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
} {
  return {
    breakBehavior: getBreakBehavior,
    children: domChildren,
    wrap: (el, children, info) => domWrap(el, children, info, options),
  };
}
