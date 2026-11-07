import { formatPageNumber } from './pageNumbers';
import type { PageNumberFormat } from './types';

/**
 * Footnotes (Word footnotes; CSS GCPM `float: footnote`).
 *
 * `<span data-footnote>text</span>` in content becomes a numbered reference
 * (`sup.hp-footnote-ref`) and its content a note (`div.hp-footnote`) shown
 * in the footnote area (`div.hp-footnotes`) at the bottom of the page where
 * the reference lands, between the body and the footer. Numbering is
 * continuous through the document.
 */

export const FOOTNOTE_ATTRIBUTE = 'data-footnote';
/** Number of the note a reference or note belongs to. */
export const NOTE_ATTRIBUTE = 'data-hp-note';

export const FOOTNOTE_CLASS_NAMES = {
  area: 'hp-footnotes',
  separator: 'hp-footnote-separator',
  note: 'hp-footnote',
  ref: 'hp-footnote-ref',
  mark: 'hp-footnote-mark',
} as const;

export interface FootnoteOptions {
  /**
   * Where numbering starts over (Word: continuous, restart each section,
   * restart each page). Default: 'continuous'.
   */
  restart?: 'continuous' | 'section' | 'page';
  /** Number style, as for page numbers (e.g. 'lower-roman'). Default: decimal. */
  format?: PageNumberFormat;
}

const STYLE_ATTRIBUTE = 'data-html-paginator-footnotes';

/** Default look, zero specificity so any author rule wins. */
const FOOTNOTE_CSS = `
:where(.hp-footnotes) { margin-top: 1em; font-size: 0.8em; line-height: 1.4; }
:where(.hp-footnote-separator) { width: 33%; border-top: 1px solid currentColor; margin-bottom: 0.5em; }
:where(.hp-footnote) { margin: 0 0 0.2em; }
:where(.hp-footnote-ref, .hp-footnote-mark) { font-size: 0.75em; line-height: 0; vertical-align: super; }
:where(.hp-footnote-mark) { margin-right: 0.3em; }
`.trim();

/**
 * Insert the default footnote styles. Injected before measuring (unlike the
 * page stylesheet) because they change footnote heights.
 */
export function injectFootnoteStyles(doc: Document): void {
  if (doc.head.querySelector(`style[${STYLE_ATTRIBUTE}]`)) return;
  const style = doc.createElement('style');
  style.setAttribute(STYLE_ATTRIBUTE, '');
  style.textContent = FOOTNOTE_CSS;
  doc.head.prepend(style); // First, so author stylesheets come later.
}

export interface Footnotes {
  /** Number of footnotes found. */
  count: number;
  /** Notes referenced inside `el` (or by `el` itself), in order. */
  notesOf(el: HTMLElement): HTMLElement[];
  /** A footnote area holding copies of `notes`. */
  area(notes: readonly HTMLElement[]): HTMLElement;
}

/**
 * Replace every `data-footnote` element under `root` with a numbered
 * reference and collect its content as a note. Returns null when there are
 * none.
 */
export function createFootnotes(root: HTMLElement): Footnotes | null {
  const sources = Array.from(root.querySelectorAll<HTMLElement>(`[${FOOTNOTE_ATTRIBUTE}]`)).filter(
    // A footnote inside another one stays part of that note's text.
    (el) => !el.parentElement?.closest(`[${FOOTNOTE_ATTRIBUTE}]`),
  );
  if (sources.length === 0) return null;
  const doc = root.ownerDocument;

  const notes = new Map<string, HTMLElement>();
  sources.forEach((source, i) => {
    const number = String(i + 1);

    const note = doc.createElement('div');
    note.className = FOOTNOTE_CLASS_NAMES.note;
    note.setAttribute(NOTE_ATTRIBUTE, number);
    if (source.id) note.id = source.id;
    const mark = doc.createElement('sup');
    mark.className = FOOTNOTE_CLASS_NAMES.mark;
    mark.textContent = number;
    note.append(mark, ...Array.from(source.childNodes));
    notes.set(number, note);

    const ref = doc.createElement('sup');
    ref.className = FOOTNOTE_CLASS_NAMES.ref;
    ref.setAttribute(NOTE_ATTRIBUTE, number);
    ref.textContent = number;
    source.replaceWith(ref);
  });

  return {
    count: notes.size,

    notesOf(el) {
      const refs = el.matches(`sup[${NOTE_ATTRIBUTE}]`)
        ? [el]
        : Array.from(el.querySelectorAll<HTMLElement>(`sup[${NOTE_ATTRIBUTE}]`));
      const found: HTMLElement[] = [];
      for (const ref of refs) {
        // A line split may leave an empty copy of a reference behind.
        if ((ref.textContent ?? '') === '') continue;
        const note = notes.get(ref.getAttribute(NOTE_ATTRIBUTE) ?? '');
        if (note && !found.includes(note)) found.push(note);
      }
      return found;
    },

    area(list) {
      const area = doc.createElement('div');
      area.className = FOOTNOTE_CLASS_NAMES.area;
      const separator = doc.createElement('div');
      separator.className = FOOTNOTE_CLASS_NAMES.separator;
      area.appendChild(separator);
      for (const note of list) area.appendChild(note.cloneNode(true));
      return area;
    },
  };
}

/**
 * Number references and notes as the options ask, once pages are known.
 * `sectionStarts[i]` tells whether page i starts a section.
 */
export function renumberFootnotes(
  pages: HTMLElement[],
  sectionStarts: readonly boolean[],
  options: FootnoteOptions = {},
): void {
  const restart = options.restart ?? 'continuous';
  if (restart === 'continuous' && options.format === undefined) return;

  let counter = 0;
  pages.forEach((page, index) => {
    if (restart === 'page' || (restart === 'section' && sectionStarts[index])) counter = 0;
    const labels = new Map<string, string>();
    for (const note of page.querySelectorAll<HTMLElement>(`.${FOOTNOTE_CLASS_NAMES.note}`)) {
      const label = formatPageNumber(++counter, options.format);
      labels.set(note.getAttribute(NOTE_ATTRIBUTE) ?? '', label);
      const mark = note.querySelector(`.${FOOTNOTE_CLASS_NAMES.mark}`);
      if (mark) mark.textContent = label;
    }
    for (const ref of page.querySelectorAll<HTMLElement>(`.${FOOTNOTE_CLASS_NAMES.ref}`)) {
      const label = labels.get(ref.getAttribute(NOTE_ATTRIBUTE) ?? '');
      // Empty copies left by line splits stay empty.
      if (label !== undefined && ref.textContent !== '') ref.textContent = label;
    }
  });
}
