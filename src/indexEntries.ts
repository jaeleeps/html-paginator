import { BREAK_ATTRIBUTE, KEEP_WITH_NEXT_ATTRIBUTE } from './domBreak';
import { PAGE_REF_ATTRIBUTE, PAGE_REF_PLACEHOLDER } from './toc';

/**
 * Index (Word's XE and INDEX fields).
 *
 * `<span data-hp-index="Term">` marks where a term is discussed;
 * `"Term:Subterm"` makes a subentry, and an empty value takes the element's
 * own text. A `data-hp-index-list` container is filled with the terms in
 * alphabetical order, each followed by the pages of its marks. The pages are
 * page references, filled in after pagination; a page repeated within an
 * entry is then dropped. Laid out first with placeholders, then (given the
 * labels from that pass) with the real page numbers.
 */

export const INDEX_ATTRIBUTE = 'data-hp-index';
export const INDEX_LIST_ATTRIBUTE = 'data-hp-index-list';
/** On the list: a heading before each letter's entries. */
export const INDEX_HEADINGS_ATTRIBUTE = 'data-hp-index-headings';

export const INDEX_CLASS_NAMES = {
  entry: 'hp-index-entry',
  term: 'hp-index-term',
  page: 'hp-index-page',
  heading: 'hp-index-heading',
} as const;

/** A term: its marks (element ids) and subterms. */
interface Term {
  name: string;
  marks: string[];
  subterms: Map<string, Term>;
}

const collator = typeof Intl !== 'undefined' ? new Intl.Collator(undefined, { sensitivity: 'base', numeric: true }) : null;
const compare = (a: string, b: string): number => (collator ? collator.compare(a, b) : a.localeCompare(b));

const sorted = (terms: Map<string, Term>): Term[] => Array.from(terms.values()).sort((a, b) => compare(a.name, b.name));

/** Letter heading of a term: its first letter, or "#" for digits and symbols. */
function letterOf(name: string): string {
  const first = name.charAt(0).toLocaleUpperCase();
  return /\p{L}/u.test(first) ? first.normalize('NFD').charAt(0) : '#';
}

/**
 * Fill every `data-hp-index-list` container under `root` with the index of
 * the `data-hp-index` marks under `root`. Marks without an id get one (the
 * same ones on the same content). With `labels` (page labels by mark id,
 * from a previous pass) the pages show them, each once per entry; else a
 * placeholder per mark. Returns the number of marks indexed.
 */
export function buildIndex(root: HTMLElement, labels?: ReadonlyMap<string, string>): number {
  const lists = Array.from(root.querySelectorAll<HTMLElement>(`[${INDEX_LIST_ATTRIBUTE}]`));
  if (lists.length === 0) return 0;
  const doc = root.ownerDocument;

  const terms = new Map<string, Term>();
  let ids = 0;
  let count = 0;
  for (const mark of root.querySelectorAll<HTMLElement>(`[${INDEX_ATTRIBUTE}]`)) {
    if (lists.some((list) => list.contains(mark))) continue;
    const value = (mark.getAttribute(INDEX_ATTRIBUTE) || mark.textContent || '').replace(/\s+/g, ' ').trim();
    const path = value.split(':').map((part) => part.trim()).filter(Boolean);
    if (path.length === 0) continue;
    while (!mark.id) {
      const id = `hp-index-${++ids}`;
      if (!doc.getElementById(id) && !root.querySelector(`#${id}`)) mark.id = id;
    }
    // Terms that differ only in case or accents are one entry, named as first seen.
    let level = terms;
    let term: Term | undefined;
    for (const name of path.slice(0, 2)) {
      const key = name.toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
      term = level.get(key);
      if (!term) level.set(key, (term = { name, marks: [], subterms: new Map() }));
      level = term.subterms;
    }
    term!.marks.push(mark.id);
    count++;
  }

  const entry = (term: Term, level: number): HTMLElement => {
    const el = doc.createElement('div');
    el.className = `${INDEX_CLASS_NAMES.entry} hp-index-level-${level}`;
    el.setAttribute(BREAK_ATTRIBUTE, 'avoid');
    // Inline, so measurement matches the final page; wrapped lines hang.
    Object.assign(el.style, { paddingLeft: `${level * 1.5 - 0.5}em`, textIndent: '-1em' });
    const name = doc.createElement('span');
    name.className = INDEX_CLASS_NAMES.term;
    name.textContent = term.name;
    el.appendChild(name);
    const shown = new Set<string>();
    for (const id of term.marks) {
      const label = labels?.get(id);
      if (label !== undefined) {
        if (shown.has(label)) continue;
        shown.add(label);
      }
      el.append(', ');
      const page = doc.createElement('span');
      page.className = INDEX_CLASS_NAMES.page;
      page.setAttribute(PAGE_REF_ATTRIBUTE, `#${id}`);
      page.textContent = label ?? PAGE_REF_PLACEHOLDER;
      el.appendChild(page);
    }
    // A term with subentries stays with the first of them.
    if (term.subterms.size > 0) el.setAttribute(KEEP_WITH_NEXT_ATTRIBUTE, '');
    return el;
  };

  for (const list of lists) {
    const headings = list.hasAttribute(INDEX_HEADINGS_ATTRIBUTE);
    let letter: string | null = null;
    for (const term of sorted(terms)) {
      if (headings && letterOf(term.name) !== letter) {
        letter = letterOf(term.name);
        const heading = doc.createElement('div');
        heading.className = INDEX_CLASS_NAMES.heading;
        heading.textContent = letter;
        Object.assign(heading.style, { fontWeight: 'bold', marginTop: '0.75em' });
        heading.setAttribute(KEEP_WITH_NEXT_ATTRIBUTE, '');
        list.appendChild(heading);
      }
      list.appendChild(entry(term, 1));
      for (const sub of sorted(term.subterms)) list.appendChild(entry(sub, 2));
    }
  }
  return count;
}

/** Page labels of the index marks on rendered pages, by mark id (first page). */
export function indexPageLabels(pages: HTMLElement[], label: (pageIndex: number) => string): Map<string, string> {
  const labels = new Map<string, string>();
  pages.forEach((page, index) => {
    for (const mark of page.querySelectorAll<HTMLElement>(`[${INDEX_ATTRIBUTE}][id]`)) {
      if (!labels.has(mark.id) && !mark.closest(`[${INDEX_LIST_ATTRIBUTE}]`)) labels.set(mark.id, label(index));
    }
  });
  return labels;
}

/**
 * Once page references are resolved: drop a page repeated within an index
 * entry (several marks on one page), with its separator.
 */
export function dedupeIndexPages(pages: HTMLElement[]): void {
  for (const page of pages) {
    for (const entry of page.querySelectorAll<HTMLElement>(`.${INDEX_CLASS_NAMES.entry}`)) {
      const seen = new Set<string>();
      for (const ref of entry.querySelectorAll<HTMLElement>(`.${INDEX_CLASS_NAMES.page}`)) {
        const label = ref.textContent ?? '';
        if (!seen.has(label)) {
          seen.add(label);
          continue;
        }
        ref.previousSibling?.remove();
        ref.remove();
      }
    }
  }
}
