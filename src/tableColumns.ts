/**
 * Keep table column widths the same on every page (Word keeps a table's
 * grid when it breaks across pages).
 *
 * Fragments of a split table are separate tables; under auto layout each
 * would size its columns from its own rows. Before a table is first
 * measured, its auto-layout column widths are frozen as percentages in a
 * `<colgroup>` with `table-layout: fixed`, which renders the same grid as
 * the original on every fragment.
 */

/** Marks a table whose columns were frozen (fragments inherit it). */
export const FROZEN_COLUMNS_ATTRIBUTE = 'data-hp-cols';

/** Cells of the first row that spans every column with one cell each. */
function gridRow(table: HTMLTableElement): HTMLTableCellElement[] | null {
  const rows = Array.from(table.rows);
  const columns = Math.max(0, ...rows.map((r) => Array.from(r.cells).reduce((n, c) => n + c.colSpan, 0)));
  const row = rows.find(
    (r) => r.cells.length === columns && Array.from(r.cells).every((c) => c.colSpan === 1 && c.rowSpan === 1),
  );
  return row && columns > 0 ? Array.from(row.cells) : null;
}

interface Frozen {
  table: HTMLTableElement;
  /** Column widths as percentages of the table. */
  columns: number[];
  /** Table width as a percentage of its container (when not set inline). */
  width: number | null;
}

/** Measure a table laid out by the caller; null when it cannot be frozen. */
function measureTable(table: HTMLTableElement): Frozen | null {
  if (table.hasAttribute(FROZEN_COLUMNS_ATTRIBUTE) || table.querySelector(':scope > colgroup, :scope > col')) {
    return null; // Already frozen, or the author set the columns.
  }
  const cells = gridRow(table);
  if (!cells) return null;
  const widths = cells.map((c) => c.getBoundingClientRect().width);
  const total = widths.reduce((a, b) => a + b, 0);
  if (total <= 0) return null; // Not laid out.

  let width: number | null = null;
  if (!table.style.width) {
    const parent = table.parentElement;
    const view = table.ownerDocument.defaultView;
    if (!parent || !view) return null;
    const style = view.getComputedStyle(parent);
    const inner =
      parent.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
    if (inner <= 0) return null;
    width = Math.min(100, (table.getBoundingClientRect().width / inner) * 100);
  }
  return { table, columns: widths.map((w) => (w / total) * 100), width };
}

function apply({ table, columns, width }: Frozen): void {
  const doc = table.ownerDocument;
  const group = doc.createElement('colgroup');
  for (const pct of columns) {
    const col = doc.createElement('col');
    col.style.width = `${pct.toFixed(4)}%`;
    group.appendChild(col);
  }
  table.insertBefore(group, table.caption ? table.caption.nextSibling : table.firstChild);
  if (width !== null) table.style.width = `${width.toFixed(4)}%`;
  table.style.tableLayout = 'fixed';
  table.setAttribute(FROZEN_COLUMNS_ATTRIBUTE, '');
}

/**
 * Freeze the columns of `el` (if a table) and of the tables inside it.
 * `layout` runs its callback while `el` is laid out on its page.
 */
export function freezeTableColumns(el: HTMLElement, layout: (fn: () => void) => void): void {
  const tables = [
    ...(el instanceof HTMLTableElement ? [el] : []),
    ...Array.from(el.querySelectorAll('table')),
  ];
  if (tables.length === 0) return;
  let frozen: Frozen[] = [];
  layout(() => {
    frozen = tables.map(measureTable).filter((f): f is Frozen => f !== null);
  });
  // Outer tables first is fine: inner ones were measured at their own width.
  frozen.forEach(apply);
}
