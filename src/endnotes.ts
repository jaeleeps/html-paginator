import { formatPageNumber } from './pageNumbers';
import type { PageNumberFormat } from './types';
import { SECTION_ATTRIBUTE } from './domBreak';

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
  /**
   * Where the notes go (Word: End of document / End of section). With
   * 'section', each section's notes are collected at its end, before the
   * next `data-section` element, or in a `data-hp-endnotes` element inside
   * the section element. Default: 'document'.
   */
  location?: 'document' | 'section';
  /** Where numbering starts over (Word: Continuous / Restart each section). Default: 'continuous'. */
  restart?: 'continuous' | 'section';
}

/** A section's endnotes: the element starting it (null before the first) and its notes. */
interface SectionNotes {
  start: Element | null;
  sources: HTMLElement[];
}

/**
 * Replace every `data-endnote` element under `root` with a reference and
 * move its content into the endnote list. Returns the number of endnotes.
 */
export function collectEndnotes(root: HTMLElement, options: EndnoteOptions = {}): number {
  const location = options.location ?? 'document';
  const restart = options.restart ?? 'continuous';
  if (location !== 'document' && location !== 'section') {
    throw new Error(`html-paginator: endnotes.location must be document or section, got "${String(location)}"`);
  }
  if (restart !== 'continuous' && restart !== 'section') {
    throw new Error(`html-paginator: endnotes.restart must be continuous or section, got "${String(restart)}"`);
  }
  // Notes and section starts in document order, grouped by section.
  const sections: SectionNotes[] = [{ start: null, sources: [] }];
  for (const el of root.querySelectorAll<HTMLElement>(`[${ENDNOTE_ATTRIBUTE}], [${SECTION_ATTRIBUTE}]`)) {
    if (el.hasAttribute(SECTION_ATTRIBUTE) && !el.closest(`[${ENDNOTE_ATTRIBUTE}]`)) {
      sections.push({ start: el, sources: [] });
    }
    // A note inside another one stays part of that note's text.
    if (el.hasAttribute(ENDNOTE_ATTRIBUTE) && !el.parentElement?.closest(`[${ENDNOTE_ATTRIBUTE}]`)) {
      sections[sections.length - 1]!.sources.push(el);
    }
  }
  const total = sections.reduce((sum, section) => sum + section.sources.length, 0);
  if (total === 0) return 0;
  const doc = root.ownerDocument;

  const newList = (): HTMLElement => {
    const list = doc.createElement('div');
    list.classList.add(ENDNOTE_CLASS_NAMES.list);
    return list;
  };
  /** The list for the notes of `sections[index]`. */
  const listFor = (index: number): HTMLElement => {
    const { start } = sections[index]!;
    // A container inside the section element, or before the next section.
    const inside = start?.querySelector<HTMLElement>(`[${ENDNOTES_ATTRIBUTE}]`);
    if (inside) {
      inside.classList.add(ENDNOTE_CLASS_NAMES.list);
      return inside;
    }
    const list = newList();
    const next = sections[index + 1]?.start;
    if (next) next.before(list);
    else root.appendChild(list);
    return list;
  };

  let documentList: HTMLElement | null = null;
  let counter = 0;
  let n = 0;
  sections.forEach((section, index) => {
    if (section.sources.length === 0) return;
    if (restart === 'section') counter = 0;
    let list: HTMLElement;
    if (location === 'section') list = listFor(index);
    else {
      if (!documentList) {
        documentList = root.querySelector<HTMLElement>(`[${ENDNOTES_ATTRIBUTE}]`) ?? root.appendChild(newList());
        documentList.classList.add(ENDNOTE_CLASS_NAMES.list);
      }
      list = documentList;
    }
    for (const source of section.sources) {
      const label = formatPageNumber(++counter, options.format ?? 'lower-roman');
      const id = source.id || `hp-endnote-${n + 1}`;
      n++;

      const note = doc.createElement('div');
      note.className = ENDNOTE_CLASS_NAMES.note;
      note.id = id;
      const mark = doc.createElement('sup');
      mark.className = ENDNOTE_CLASS_NAMES.mark;
      mark.textContent = label;
      note.append(mark, ' ', ...Array.from(source.childNodes));
      list.appendChild(note);

      const ref = doc.createElement('sup');
      ref.className = ENDNOTE_CLASS_NAMES.ref;
      const link = doc.createElement('a');
      link.href = `#${id}`;
      link.textContent = label;
      ref.appendChild(link);
      source.replaceWith(ref);
    }
  });
  return total;
}
