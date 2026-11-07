import { captionOf, SEQ_ATTRIBUTE } from './captions';
import { BREAK_ATTRIBUTE } from './domBreak';

/**
 * Table of contents and page references (Word's TOC and PAGEREF fields).
 *
 * Both are laid out before pagination with a placeholder page number, so
 * filling in the real numbers afterwards does not change any page's layout.
 */

/**
 * Container filled with entries for the headings of the content, or with
 * the value naming a caption sequence (`data-hp-toc="Figure"`), its captions.
 */
export const TOC_ATTRIBUTE = 'data-hp-toc';
/** Heading levels in the TOC, e.g. "1-3" (default) or "2". */
export const TOC_LEVELS_ATTRIBUTE = 'data-hp-toc-levels';
/** Outline level of a non-heading element to list it in the TOC. */
export const TOC_LEVEL_ATTRIBUTE = 'data-hp-toc-level';
/** Leave a heading out of the TOC. */
export const TOC_SKIP_ATTRIBUTE = 'data-hp-toc-skip';
/**
 * Element whose text becomes the page label of a target: the attribute's
 * value ("#id"), else the element's `href`.
 */
export const PAGE_REF_ATTRIBUTE = 'data-hp-page-ref';

/** Text measured in place of page numbers before they are known. */
export const PAGE_REF_PLACEHOLDER = '000';

export const TOC_CLASS_NAMES = {
  entry: 'hp-toc-entry',
  text: 'hp-toc-text',
  leader: 'hp-toc-leader',
  page: 'hp-toc-page',
} as const;

function parseLevels(raw: string | null): [number, number] {
  const match = /^\s*([1-6])\s*(?:-\s*([1-6]))?\s*$/.exec(raw ?? '');
  if (!match) {
    if (raw !== null && raw !== '') {
      console.warn(`html-paginator: invalid ${TOC_LEVELS_ATTRIBUTE}="${raw}" (expected e.g. "1-3"), using 1-3`);
    }
    return [1, 3];
  }
  const low = Number(match[1]);
  const high = Number(match[2] ?? match[1]);
  return low <= high ? [low, high] : [high, low];
}

/** Text of a heading without footnote/endnote reference numbers. */
export function headingText(heading: HTMLElement): string {
  const copy = heading.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('.hp-footnote-ref, .hp-endnote-ref').forEach((ref) => ref.remove());
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Outline level of an element, or undefined when it is not an outline entry. */
function outlineLevel(el: Element): number | undefined {
  const explicit = el.getAttribute(TOC_LEVEL_ATTRIBUTE);
  if (explicit !== null) {
    const level = Number(explicit);
    return Number.isInteger(level) && level >= 1 && level <= 9 ? level : undefined;
  }
  const heading = /^H([1-6])$/.exec(el.tagName.toUpperCase());
  return heading ? Number(heading[1]) : undefined;
}

/**
 * Fill every `data-hp-toc` container under `root` with one entry per
 * heading in its level range: text, dot leader, page number (a page
 * reference resolved after pagination). Headings without an id get one.
 * Existing children of the container (e.g. a title) stay before the entries.
 */
export function buildTableOfContents(root: HTMLElement): void {
  const tocs = Array.from(root.querySelectorAll<HTMLElement>(`[${TOC_ATTRIBUTE}]`));
  const doc = root.ownerDocument;

  const outline = Array.from(
    root.querySelectorAll<HTMLElement>(`h1, h2, h3, h4, h5, h6, [${TOC_LEVEL_ATTRIBUTE}]`),
  ).filter(
    (el) =>
      !el.hasAttribute(TOC_SKIP_ATTRIBUTE) &&
      outlineLevel(el) !== undefined &&
      !tocs.some((toc) => toc.contains(el)),
  );

  let ids = 0;
  const idOf = (el: HTMLElement): string => {
    while (!el.id) {
      const id = `hp-toc-${++ids}`;
      if (!doc.getElementById(id) && !root.querySelector(`#${id}`)) el.id = id;
    }
    return el.id;
  };

  for (const toc of tocs) {
    // data-hp-toc="Figure": a list of the captions of that sequence (Word's
    // Table of Figures); otherwise the headings.
    const sequence = toc.getAttribute(TOC_ATTRIBUTE) ?? '';
    const [low, high] = sequence ? [1, 1] : parseLevels(toc.getAttribute(TOC_LEVELS_ATTRIBUTE));
    const listed = sequence
      ? Array.from(root.querySelectorAll<HTMLElement>(`[${SEQ_ATTRIBUTE}]`))
          .filter((seq) => seq.getAttribute(SEQ_ATTRIBUTE) === sequence && !tocs.some((t) => t.contains(seq)))
          .map(captionOf)
      : outline;
    for (const heading of listed) {
      const level = sequence ? 1 : outlineLevel(heading)!;
      if (level < low || level > high) continue;

      // Inline layout so measurement matches the final page (the library
      // stylesheet is injected after pagination); classes allow restyling.
      const entry = doc.createElement('div');
      entry.className = `${TOC_CLASS_NAMES.entry} hp-toc-level-${level}`;
      entry.setAttribute(BREAK_ATTRIBUTE, 'avoid');
      entry.style.display = 'flex';
      entry.style.alignItems = 'baseline';
      entry.style.paddingLeft = `${(level - low) * 1.5}em`;

      const link = doc.createElement('a');
      link.href = `#${idOf(heading)}`;
      link.className = TOC_CLASS_NAMES.text;
      link.textContent = headingText(heading);

      const leader = doc.createElement('span');
      leader.className = TOC_CLASS_NAMES.leader;
      leader.style.flex = '1 1 auto';
      leader.style.minWidth = '1em';
      leader.style.margin = '0 0.3em';
      leader.style.borderBottom = '1px dotted currentColor';

      const page = doc.createElement('span');
      page.className = TOC_CLASS_NAMES.page;
      page.setAttribute(PAGE_REF_ATTRIBUTE, `#${heading.id}`);

      entry.append(link, leader, page);
      toc.appendChild(entry);
    }
  }

  for (const ref of root.querySelectorAll<HTMLElement>(`[${PAGE_REF_ATTRIBUTE}]`)) {
    ref.textContent = PAGE_REF_PLACEHOLDER;
  }
}

/** Target selector of a page reference ("#id"), from its value or href. */
function refTarget(ref: Element): string | null {
  const value = ref.getAttribute(PAGE_REF_ATTRIBUTE) || ref.getAttribute('href') || '';
  return value.startsWith('#') && value.length > 1 ? value.slice(1) : null;
}

/**
 * Replace each page reference's text with the label of the page its target
 * starts on (its first fragment). Missing targets show "??" with a warning.
 */
export function resolvePageRefs(pages: HTMLElement[], label: (pageIndex: number) => string): void {
  const pageOf = new Map<string, number>();
  pages.forEach((page, index) => {
    for (const el of page.querySelectorAll('[id]')) {
      if (!pageOf.has(el.id)) pageOf.set(el.id, index);
    }
  });

  for (const page of pages) {
    for (const ref of page.querySelectorAll<HTMLElement>(`[${PAGE_REF_ATTRIBUTE}]`)) {
      const id = refTarget(ref);
      const index = id === null ? undefined : pageOf.get(id);
      if (index === undefined) {
        console.warn(`html-paginator: ${PAGE_REF_ATTRIBUTE} target "${id ?? ''}" not found`, ref);
        ref.textContent = '??';
      } else {
        ref.textContent = label(index);
      }
    }
  }
}
