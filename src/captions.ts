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
 */

export const SEQ_ATTRIBUTE = 'data-hp-seq';
export const SEQ_FORMAT_ATTRIBUTE = 'data-hp-seq-format';
export const REF_ATTRIBUTE = 'data-hp-ref';

/** Number every sequence element under `root`; returns the elements in order. */
export function numberSequences(root: HTMLElement): HTMLElement[] {
  const counters = new Map<string, number>();
  const seqs = Array.from(root.querySelectorAll<HTMLElement>(`[${SEQ_ATTRIBUTE}]`));
  for (const seq of seqs) {
    const name = seq.getAttribute(SEQ_ATTRIBUTE) ?? '';
    const n = (counters.get(name) ?? 0) + 1;
    counters.set(name, n);
    const format = (seq.getAttribute(SEQ_FORMAT_ATTRIBUTE) ?? undefined) as PageNumberFormat | undefined;
    seq.textContent = formatPageNumber(n, format);
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
