import { formatPageNumber } from './pageNumbers';
import type { PageNumberFormat } from './types';

/**
 * Numbered captions and cross-references (Word's SEQ and REF fields).
 *
 * `<span data-hp-seq="Figure"></span>` is numbered in document order within
 * its sequence ("Figure", "Table", ...); `data-hp-seq-format` picks a number
 * style. `<a href="#id" data-hp-ref></a>` shows "Figure 3" for the sequence
 * number at `#id` (the numbered element or an element containing it), or
 * just "3" with `data-hp-ref="number"`. Numbers do not depend on
 * pagination, so they are resolved before measuring.
 *
 * Word's "include chapter number": `data-hp-seq-chapter="1"` (on the number
 * or an ancestor, e.g. the content root) prefixes the number of the
 * enclosing level-1 heading and restarts the count in each chapter —
 * "Figure 2-1". Level 2 gives "2.3-1" (outline numbering; unused leading
 * levels are left out, so h2 chapters without h1 give "3-1"). The separator is
 * `data-hp-seq-separator` (default "-"). Headings count in document order;
 * those with `data-hp-toc-skip` or inside a TOC container do not.
 */

export const SEQ_ATTRIBUTE = 'data-hp-seq';
export const SEQ_FORMAT_ATTRIBUTE = 'data-hp-seq-format';
export const REF_ATTRIBUTE = 'data-hp-ref';
/** Heading level whose number prefixes the sequence number (1-6). */
export const SEQ_CHAPTER_ATTRIBUTE = 'data-hp-seq-chapter';
/** Between chapter and sequence number. Default "-". */
export const SEQ_SEPARATOR_ATTRIBUTE = 'data-hp-seq-separator';

const HEADING = /^H([1-6])$/;

/** Chapter level of a sequence element (0 = none). */
function chapterLevel(seq: HTMLElement): number {
  const raw = seq.closest(`[${SEQ_CHAPTER_ATTRIBUTE}]`)?.getAttribute(SEQ_CHAPTER_ATTRIBUTE);
  if (raw === undefined || raw === null) return 0;
  const level = Number(raw);
  if (!Number.isInteger(level) || level < 1 || level > 6) {
    console.warn(`html-paginator: invalid ${SEQ_CHAPTER_ATTRIBUTE}="${raw}" (expected 1-6), ignored`, seq);
    return 0;
  }
  return level;
}

/** Number every sequence element under `root`; returns the elements in order. */
export function numberSequences(root: HTMLElement): HTMLElement[] {
  const counters = new Map<string, { n: number; chapter: string }>();
  // Outline numbers of the headings so far: headings[k - 1] for level k.
  const headings = [0, 0, 0, 0, 0, 0];
  const seqs: HTMLElement[] = [];
  const nodes = root.querySelectorAll<HTMLElement>(`h1, h2, h3, h4, h5, h6, [${SEQ_ATTRIBUTE}]`);
  for (const el of nodes) {
    if (!el.hasAttribute(SEQ_ATTRIBUTE)) {
      if (el.hasAttribute('data-hp-toc-skip') || el.closest('[data-hp-toc]')) continue;
      const level = Number(HEADING.exec(el.tagName.toUpperCase())![1]);
      headings[level - 1]! += 1;
      headings.fill(0, level);
      continue;
    }
    const seq = el;
    seqs.push(seq);
    const name = seq.getAttribute(SEQ_ATTRIBUTE) ?? '';
    const level = chapterLevel(seq);
    // Leading levels never used (e.g. no h1 above an h2) are left out.
    const parts = headings.slice(0, level);
    while (parts.length > 1 && parts[0] === 0) parts.shift();
    const chapter = parts.join('.');
    // A new chapter restarts the count (only for chapter-numbered elements,
    // as with Word's SEQ \s: a plain one continues it).
    const last = counters.get(name);
    const n = last && (level === 0 || last.chapter === chapter) ? last.n + 1 : 1;
    counters.set(name, { n, chapter });
    const format = (seq.getAttribute(SEQ_FORMAT_ATTRIBUTE) ?? undefined) as PageNumberFormat | undefined;
    const number = formatPageNumber(n, format);
    const separator = seq.closest(`[${SEQ_SEPARATOR_ATTRIBUTE}]`)?.getAttribute(SEQ_SEPARATOR_ATTRIBUTE) ?? '-';
    seq.textContent = chapter ? `${chapter}${separator}${number}` : number;
  }
  return seqs;
}

/** The caption a sequence number belongs to (for lists of figures). */
export function captionOf(seq: HTMLElement): HTMLElement {
  return seq.closest<HTMLElement>('figcaption, caption') ?? seq.parentElement ?? seq;
}

/** Fill every cross-reference under `root` (after `numberSequences`). */
export function resolveCrossRefs(root: HTMLElement): void {
  for (const ref of root.querySelectorAll<HTMLElement>(`[${REF_ATTRIBUTE}]`)) {
    const mode = ref.getAttribute(REF_ATTRIBUTE) ?? '';
    const target = (mode.startsWith('#') ? mode : (ref.getAttribute('href') ?? '')).slice(1);
    const el = target
      ? root.querySelector<HTMLElement>(`[id="${target.replace(/["\\]/g, '\\$&')}"]`)
      : null;
    const seq = el?.matches(`[${SEQ_ATTRIBUTE}]`) ? el : el?.querySelector<HTMLElement>(`[${SEQ_ATTRIBUTE}]`);
    if (!seq) {
      console.warn(`html-paginator: ${REF_ATTRIBUTE} target "${target}" has no ${SEQ_ATTRIBUTE} number`, ref);
      ref.textContent = '??';
      continue;
    }
    const number = seq.textContent ?? '';
    ref.textContent = mode === 'number' ? number : `${seq.getAttribute(SEQ_ATTRIBUTE)} ${number}`;
  }
}
