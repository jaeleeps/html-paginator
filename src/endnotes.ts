import { formatPageNumber } from './pageNumbers';
import type { PageNumberFormat } from './types';

/**
 * Endnotes (Word endnotes): `<span data-endnote>text</span>` becomes a
 * numbered reference linking to its note, and the notes are collected in
 * the `data-hp-endnotes` container (or a `div.hp-endnotes` appended to the
 * content). Notes are ordinary content there, so they paginate — and split
 * between lines — like paragraphs.
 */

export const ENDNOTE_ATTRIBUTE = 'data-endnote';
/** Where the endnotes go (default: the end of the content). */
export const ENDNOTES_ATTRIBUTE = 'data-hp-endnotes';

export const ENDNOTE_CLASS_NAMES = {
  list: 'hp-endnotes',
  note: 'hp-endnote',
  ref: 'hp-endnote-ref',
  mark: 'hp-endnote-mark',
} as const;

export interface EndnoteOptions {
  /** Number style, as for page numbers. Default: 'lower-roman' (Word's default). */
  format?: PageNumberFormat;
}

/**
 * Replace every `data-endnote` element under `root` with a reference and
 * move its content into the endnote list. Returns the number of endnotes.
 */
export function collectEndnotes(root: HTMLElement, options: EndnoteOptions = {}): number {
  const sources = Array.from(root.querySelectorAll<HTMLElement>(`[${ENDNOTE_ATTRIBUTE}]`)).filter(
    (el) => !el.parentElement?.closest(`[${ENDNOTE_ATTRIBUTE}]`),
  );
  if (sources.length === 0) return 0;
  const doc = root.ownerDocument;

  let list = root.querySelector<HTMLElement>(`[${ENDNOTES_ATTRIBUTE}]`);
  if (!list) {
    list = doc.createElement('div');
    root.appendChild(list);
  }
  list.classList.add(ENDNOTE_CLASS_NAMES.list);

  sources.forEach((source, i) => {
    const label = formatPageNumber(i + 1, options.format ?? 'lower-roman');
    const id = source.id || `hp-endnote-${i + 1}`;

    const note = doc.createElement('div');
    note.className = ENDNOTE_CLASS_NAMES.note;
    note.id = id;
    const mark = doc.createElement('sup');
    mark.className = ENDNOTE_CLASS_NAMES.mark;
    mark.textContent = label;
    note.append(mark, ' ', ...Array.from(source.childNodes));
    list!.appendChild(note);

    const ref = doc.createElement('sup');
    ref.className = ENDNOTE_CLASS_NAMES.ref;
    const link = doc.createElement('a');
    link.href = `#${id}`;
    link.textContent = label;
    ref.appendChild(link);
    source.replaceWith(ref);
  });
  return sources.length;
}
