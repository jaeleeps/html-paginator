import type { ResolvedPageConfig } from './pageConfig';

/**
 * Header and footer placement, shared by rendered pages and measuring
 * probes so both have the same geometry.
 *
 * By default the header and footer sit inside the page margin box, above
 * and below the body. With `headerDistance` / `footerDistance` they are
 * placed the way Word places them: the header starts at that distance from
 * the top edge of the sheet, inside the top margin, and the body starts at
 * the top margin — lower only when the header does not fit in the margin.
 * The footer likewise ends at its distance from the bottom edge.
 */

export const HEADER_AREA_CLASS = 'hp-header-area';
export const FOOTER_AREA_CLASS = 'hp-footer-area';

/** The four sides of a CSS margin shorthand (top, right, bottom, left). */
export function marginSides(margin: string): [string, string, string, string] {
  // Split on spaces outside parentheses (calc(1in + 2px) stays whole).
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of margin.trim()) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (current) parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  const [top, right = top, bottom = top, left = right] = parts;
  if (top === undefined || right === undefined || bottom === undefined || left === undefined || parts.length > 4) {
    throw new Error(`html-paginator: invalid margin "${margin}" (expected 1-4 CSS lengths)`);
  }
  return [top, right, bottom, left];
}

/**
 * Page padding: the margin, with the top/bottom side replaced by the
 * header/footer distance when that slot is placed by distance.
 */
export function pagePadding(config: ResolvedPageConfig, hasHeader: boolean, hasFooter: boolean): string {
  const byHeader = hasHeader && config.headerDistance !== undefined;
  const byFooter = hasFooter && config.footerDistance !== undefined;
  if (!byHeader && !byFooter) return config.margin;
  const [top, right, bottom, left] = marginSides(config.margin);
  return [byHeader ? config.headerDistance : top, right, byFooter ? config.footerDistance : bottom, left].join(' ');
}

/**
 * The element to put on the page for a rendered header or footer: the slot
 * itself, or with a distance, an area reaching to the margin around it.
 */
export function slotArea(
  slot: HTMLElement,
  kind: 'header' | 'footer',
  config: ResolvedPageConfig,
): HTMLElement {
  const distance = kind === 'header' ? config.headerDistance : config.footerDistance;
  if (distance === undefined) return slot;
  const [top, , bottom] = marginSides(config.margin);
  const area = slot.ownerDocument.createElement('div');
  area.className = kind === 'header' ? HEADER_AREA_CLASS : FOOTER_AREA_CLASS;
  Object.assign(area.style, {
    flex: '0 0 auto',
    display: 'flex',
    flexDirection: 'column',
    // Down to the top margin (header) / up from the bottom margin (footer),
    // or further when the slot is taller.
    minHeight: `calc(${kind === 'header' ? top : bottom} - ${distance})`,
    // The footer's bottom stays at its distance from the edge.
    justifyContent: kind === 'header' ? 'flex-start' : 'flex-end',
  });
  area.appendChild(slot);
  return area;
}
