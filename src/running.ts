import { CONTINUED_ATTRIBUTE } from './domBreak';
import { headingText } from './toc';

/**
 * Running headers and footers (Word's STYLEREF field; CSS GCPM
 * `string-set`).
 *
 * Every heading sets a running value named after its level ("h1" ... "h6"),
 * and any element can set one with `data-hp-running="name"`. A page's
 * header/footer context gets, per name, `running[name]`: the first value set
 * on the page, else the last one set before it (Word's STYLEREF), and
 * `runningLast[name]`: the last value set on the page, else the same carried
 * value (STYLEREF \l — dictionary-style headers).
 */

export const RUNNING_ATTRIBUTE = 'data-hp-running';

const MARKS = `h1, h2, h3, h4, h5, h6, [${RUNNING_ATTRIBUTE}]`;

export interface RunningValues {
  /** First value set on the page, else the last set before it. */
  running: Record<string, string>;
  /** Last value set on the page, else the last set before it. */
  runningLast: Record<string, string>;
}

interface Mark {
  name: string;
  text: string;
}

/** Running values an element sets (its heading level and/or data-hp-running name). */
function marksOf(el: HTMLElement): Mark[] {
  const marks: Mark[] = [];
  const text = headingText(el);
  const heading = /^H([1-6])$/.exec(el.tagName.toUpperCase());
  if (heading) marks.push({ name: `h${heading[1]}`, text });
  const name = el.getAttribute(RUNNING_ATTRIBUTE)?.trim();
  if (name) marks.push({ name, text });
  return marks;
}

/** Marks set by `items`, in document order (continued fragments set none). */
function marksIn(items: readonly HTMLElement[]): Mark[] {
  const marks: Mark[] = [];
  for (const item of items) {
    const els = item.matches(MARKS) ? [item] : [];
    els.push(...Array.from(item.querySelectorAll<HTMLElement>(MARKS)));
    for (const el of els) {
      if (!el.hasAttribute(CONTINUED_ATTRIBUTE)) marks.push(...marksOf(el));
    }
  }
  return marks;
}

/**
 * Running values of each page, from the items on it (`pages[i]` holds page
 * i + 1's items in reading order).
 */
export function runningValues(pages: readonly (readonly HTMLElement[])[]): RunningValues[] {
  const carried: Record<string, string> = {};
  return pages.map((items) => {
    const running: Record<string, string> = { ...carried };
    const runningLast: Record<string, string> = { ...carried };
    const seen = new Set<string>();
    for (const { name, text } of marksIn(items)) {
      if (!seen.has(name)) running[name] = text;
      seen.add(name);
      runningLast[name] = text;
      carried[name] = text;
    }
    return { running, runningLast };
  });
}

/**
 * The longest value of each name under `root`: headers are measured with
 * these, so a page's real header is never taller than the measured one.
 */
export function longestRunning(root: HTMLElement): Record<string, string> {
  const longest: Record<string, string> = {};
  for (const { name, text } of marksIn([root])) {
    if (text.length > (longest[name]?.length ?? -1)) longest[name] = text;
  }
  return longest;
}
