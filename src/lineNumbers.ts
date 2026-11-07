import { lineBoxes } from './textSplit';

/**
 * Line numbers (Word: Layout > Line Numbers).
 *
 * Numbered after the pages are rendered, from the rendered lines of text,
 * and placed in the left margin of the body (of each column), out of the
 * flow, so they never change pagination. As in Word, lines in tables,
 * headers, footers and footnotes are not numbered, and an element with
 * `data-hp-suppress-line-numbers` is left out (Word's "suppress line
 * numbers" paragraph setting).
 */

export interface LineNumberOptions {
  /** First number. Default: 1. */
  start?: number;
  /** Show only multiples of this (Word's "count by"). Default: 1. */
  countBy?: number;
  /** Where numbering starts over. Default: 'page' (Word's default). */
  restart?: 'page' | 'section' | 'continuous';
  /** Space between the numbers and the text (CSS length). Default: '0.25in'. */
  distance?: string;
}

export const SUPPRESS_LINE_NUMBERS_ATTRIBUTE = 'data-hp-suppress-line-numbers';
export const LINE_NUMBER_CLASS = 'hp-line-number';

const DEFAULT_DISTANCE = '0.25in';

/** A rendered page: the elements holding its items (one per column). */
export interface LineNumberedPage {
  bodies: HTMLElement[];
  options: LineNumberOptions | null | undefined;
  sectionStart: boolean;
}

function positive(value: number | undefined, what: string): number {
  if (value === undefined) return 1;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`html-paginator: lineNumbers.${what} must be a positive integer, got ${value}`);
  }
  return value;
}

/** Text that gets line numbers: not in a table or a suppressed element. */
function numbered(node: Text): boolean {
  const parent = node.parentElement;
  return !!parent && !parent.closest(`table, [${SUPPRESS_LINE_NUMBERS_ATTRIBUTE}]`);
}

/**
 * Number the lines of rendered pages (attached to the document, so they are
 * laid out). Pages without options are skipped and do not count. Returns
 * the number of lines numbered (0 without a layout engine).
 */
export function numberLines(pages: readonly LineNumberedPage[]): number {
  let counter = 0;
  let total = 0;
  let previous: LineNumberOptions | null | undefined;
  pages.forEach((page, index) => {
    const options = page.options;
    if (!options) {
      previous = options;
      return;
    }
    const start = positive(options.start, 'start');
    const countBy = positive(options.countBy, 'countBy');
    const restart = options.restart ?? 'page';
    if (!['page', 'section', 'continuous'].includes(restart)) {
      throw new Error(`html-paginator: lineNumbers.restart must be page, section or continuous, got ${restart}`);
    }
    // Numbering starts over on each page, at a section start, or where it
    // was off (or set differently) on the page before.
    if (index === 0 || restart === 'page' || (restart === 'section' && page.sectionStart) || previous !== options) {
      counter = start - 1;
    }
    previous = options;

    for (const body of page.bodies) {
      const lines = lineBoxes(body, numbered);
      if (!lines || lines.length === 0) continue;
      const doc = body.ownerDocument;
      // The numbers are placed against the body: make it a containing block.
      const position = doc.defaultView?.getComputedStyle(body).position;
      if (!position || position === 'static') body.style.position = 'relative';
      const origin = body.getBoundingClientRect();
      for (const line of lines) {
        counter++;
        total++;
        if (counter % countBy !== 0) continue;
        const mark = doc.createElement('span');
        mark.className = LINE_NUMBER_CLASS;
        mark.textContent = String(counter);
        mark.setAttribute('aria-hidden', 'true');
        Object.assign(mark.style, {
          position: 'absolute',
          right: `calc(100% + ${options.distance ?? DEFAULT_DISTANCE})`,
          top: `${line.top - origin.top}px`,
          height: `${line.bottom - line.top}px`,
          display: 'flex',
          alignItems: 'center',
          whiteSpace: 'nowrap',
          userSelect: 'none',
        });
        body.appendChild(mark);
      }
    }
  });
  return total;
}
