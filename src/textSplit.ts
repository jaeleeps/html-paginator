import type { Fragment, FragmentInfo } from './distribute';
import { CONTINUED_ATTRIBUTE } from './domBreak';

/**
 * Line-level paragraph splitting (Word: a paragraph breaks between lines,
 * with widow/orphan control).
 *
 * The paragraph is laid out where it will be rendered — inside the fragment
 * wrappers of its containers, on the page's probe — and its line boxes are
 * found from the positions of its words. A head fragment holds the first N
 * lines and the tail the rest; the engine's `fits` picks the largest N, kept
 * within CSS `orphans` (lines left at the bottom) and `widows` (lines carried
 * to the top of the next page).
 */

export interface TextSplitterOptions {
  /** Run `fn` while `el` is laid out on `page` (see `DomMeasurer.layout`). */
  layout: <R>(el: HTMLElement, page: number, fn: () => R) => R;
  /** Container of the top-level items; never laid out itself. */
  root?: Node;
}

/** Where a line starts: before character `offset` of a text node. */
export interface LineStart {
  node: Text;
  offset: number;
}

interface TextLayout {
  /** Starts of lines 2..n (line 1 starts at the element start). */
  starts: LineStart[];
  orphans: number;
  widows: number;
  justify: boolean;
}

const NEVER_SPLIT = /^(TABLE|THEAD|TBODY|TFOOT|TR|TD|TH|CAPTION|IMG|SVG|VIDEO|CANVAS|IFRAME|OBJECT|SELECT|TEXTAREA)$/;

/** Inline content only: blocks or inline-blocks inside would break line detection. */
function inlineOnly(el: HTMLElement, view: Window): boolean {
  for (const child of el.querySelectorAll('*')) {
    const display = view.getComputedStyle(child).display;
    if (display !== 'inline' && display !== 'none' && display !== 'contents') return false;
  }
  return true;
}

export function positiveInt(value: string | undefined, fallback: number): number {
  const n = parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** A line of text: where it starts in the DOM and its vertical extent. */
export interface LineBox {
  start: LineStart;
  top: number;
  bottom: number;
}

/**
 * Lines of `el`'s text in document order, found from the boxes of each
 * word's first character (the element must be laid out), skipping text
 * nodes `accept` rejects. Null without a layout engine (jsdom).
 */
export function lineBoxes(el: HTMLElement, accept?: (node: Text) => boolean): LineBox[] | null {
  const doc = el.ownerDocument;
  const range = doc.createRange();
  if (typeof range.getBoundingClientRect !== 'function') return null;

  const lines: LineBox[] = [];
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (accept && !accept(node)) continue;
    const words = /\S+/g;
    for (let match = words.exec(node.data); match; match = words.exec(node.data)) {
      range.setStart(node, match.index);
      range.setEnd(node, match.index + 1);
      const box = range.getBoundingClientRect();
      if (box.height === 0) continue;
      const line = lines[lines.length - 1];
      if (!line || (box.top + box.bottom) / 2 > line.bottom) {
        // Below the current line: this word starts the next one.
        lines.push({ start: { node, offset: match.index }, top: box.top, bottom: box.bottom });
      } else {
        line.top = Math.min(line.top, box.top);
        line.bottom = Math.max(line.bottom, box.bottom);
      }
    }
  }
  return lines;
}

/**
 * Outermost detached ancestor of `el` below `root`: the fragment wrappers of
 * its containers, laid out so `el` gets the width it really has.
 */
export function layoutRoot(el: HTMLElement, root: Node | undefined): HTMLElement {
  let top = el;
  while (top.parentElement && top.parentElement !== root && !top.parentElement.isConnected) {
    top = top.parentElement;
  }
  return top;
}

/** Copy of `el` holding the content between two points (null = element edge). */
export function slice(el: HTMLElement, from: LineStart | null, to: LineStart | null): HTMLElement {
  const range = el.ownerDocument.createRange();
  range.selectNodeContents(el);
  if (from) range.setStart(from.node, from.offset);
  if (to) range.setEnd(to.node, to.offset);
  const copy = el.cloneNode(false) as HTMLElement;
  copy.appendChild(range.cloneContents());
  return copy;
}

/**
 * The `fragment` hook for `distribute()`: splits elements holding inline
 * text between lines. Returns null for anything else.
 */
export function createTextSplitter(
  options: TextSplitterOptions,
): (el: HTMLElement, fits: (head: HTMLElement) => boolean, info: FragmentInfo) => Fragment<HTMLElement> | null {
  const { layout, root } = options;

  const measureLines = (el: HTMLElement, page: number): TextLayout | null => {
    const view = el.ownerDocument.defaultView;
    if (!view) return null;
    return layout(layoutRoot(el, root), page, () => {
      if (!inlineOnly(el, view)) return null;
      const lines = lineBoxes(el);
      if (!lines) return null;
      const starts = lines.slice(1).map((line) => line.start);
      const style = view.getComputedStyle(el);
      return {
        starts,
        orphans: positiveInt(style.orphans, 2),
        widows: positiveInt(style.widows, 2),
        justify: style.textAlign === 'justify',
      };
    });
  };

  return (el, fits, info) => {
    if (NEVER_SPLIT.test(el.tagName.toUpperCase()) || (el.textContent ?? '').trim() === '') {
      return null;
    }
    const lines = measureLines(el, info.page);
    if (!lines) return null;

    const { starts } = lines;
    const lineCount = starts.length + 1;
    // A head of n lines ends where line n + 1 starts (starts[n - 1]).
    const head = (n: number): HTMLElement => {
      const copy = slice(el, null, starts[n - 1] as LineStart);
      copy.style.marginBottom = '0';
      // Its last line is not the paragraph's last: justify it too.
      if (lines.justify) copy.style.textAlignLast = 'justify';
      return copy;
    };

    // Largest head within orphans/widows that fits (fits is monotonic in n).
    let low = lines.orphans;
    let high = lineCount - lines.widows;
    if (low > high || !fits(head(low))) return null;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (fits(head(mid))) low = mid;
      else high = mid - 1;
    }

    const tail = slice(el, starts[low - 1] as LineStart, null);
    tail.setAttribute(CONTINUED_ATTRIBUTE, '');
    // Continuation lines: no first-line indent, no space before.
    tail.style.textIndent = '0';
    tail.style.marginTop = '0';
    return { head: head(low), tail };
  };
}
