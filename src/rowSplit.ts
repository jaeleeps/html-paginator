import type { Fragment, FragmentInfo } from './distribute';
import { CONTINUED_ATTRIBUTE, transferTableFoot } from './domBreak';
import { layoutRoot, lineBoxes, positiveInt, slice } from './textSplit';
import type { LineBox, TextSplitterOptions } from './textSplit';

/**
 * Table rows breaking across pages (Word: "Allow row to break across
 * pages", on by default).
 *
 * The row is laid out in its table on the page probe and every cell's text
 * lines are found. A cut line across the row puts each cell's lines above it
 * in the head row and the rest in the tail row; per cell, CSS `orphans` and
 * `widows` apply (a cell that would keep too few lines moves whole). The
 * engine's `fits` picks the lowest cut whose head fits.
 *
 * Rows involved in row spans are never split.
 */

interface CellLines {
  cell: HTMLTableCellElement;
  lines: LineBox[];
  orphans: number;
  widows: number;
}

/** Lines of each cell that stay in the head for a cut at `y`. */
function cut(cells: CellLines[], y: number): number[] {
  return cells.map(({ lines, orphans, widows }) => {
    const n = lines.length;
    let k = lines.filter((line) => line.bottom <= y + 0.5).length;
    if (k === n) return k;
    if (n - k < widows) k = n - widows;
    return k < orphans ? 0 : k;
  });
}

export function createRowSplitter(
  options: TextSplitterOptions,
): (row: HTMLElement, fits: (head: HTMLElement) => boolean, info: FragmentInfo) => Fragment<HTMLElement> | null {
  const { layout, root } = options;

  return (row, fits, info) => {
    if (!(row instanceof HTMLTableRowElement)) return null;
    const table = row.closest('table');
    const spans = (scope: ParentNode | null) =>
      Array.from(scope?.querySelectorAll<HTMLTableCellElement>('td, th') ?? []).some((c) => c.rowSpan !== 1);
    if (row.cells.length === 0 || spans(row) || spans(table)) return null;

    const view = row.ownerDocument.defaultView;
    if (!view) return null;
    const cells = layout(layoutRoot(row, root), info.page, (): CellLines[] | null => {
      const measured: CellLines[] = [];
      for (const cell of Array.from(row.cells)) {
        const lines = lineBoxes(cell);
        if (!lines) return null;
        const style = view.getComputedStyle(cell);
        measured.push({
          cell,
          lines,
          orphans: positiveInt(style.orphans, 2),
          widows: positiveInt(style.widows, 2),
        });
      }
      return measured;
    });
    if (!cells) return null;

    // Cut candidates: line bottoms, lowest first, short of the full row.
    const bottom = Math.max(...cells.flatMap((c) => c.lines.map((line) => line.bottom)));
    const cuts = Array.from(new Set(cells.flatMap((c) => c.lines.map((line) => line.bottom))))
      .filter((y) => y < bottom)
      .sort((a, b) => a - b);

    const valid = (ks: number[]): boolean =>
      ks.some((k) => k > 0) && ks.some((k, i) => k < (cells[i] as CellLines).lines.length);

    const build = (ks: number[], part: 'head' | 'tail'): HTMLElement => {
      const copy = row.cloneNode(false) as HTMLElement;
      cells.forEach(({ cell, lines }, i) => {
        const k = ks[i] as number;
        const at = k < lines.length ? (lines[k] as LineBox).start : null;
        if (part === 'head') {
          copy.appendChild(k === 0 ? cell.cloneNode(false) : slice(cell, null, at));
        } else {
          copy.appendChild(at ? slice(cell, at, null) : cell.cloneNode(false));
        }
      });
      return copy;
    };

    // Lowest cut first; keep the cuts that split the row at all.
    const splits = cuts.map((y) => cut(cells, y)).filter(valid);

    // Largest split whose head fits (fits is monotonic in the cut).
    const ok = (index: number): boolean => fits(build(splits[index] as number[], 'head'));
    let low = 0;
    let high = splits.length - 1;
    if (high < 0 || !ok(low)) return null;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (ok(mid)) low = mid;
      else high = mid - 1;
    }

    const ks = splits[low] as number[];
    const tail = build(ks, 'tail');
    tail.setAttribute(CONTINUED_ATTRIBUTE, '');
    transferTableFoot(row, tail);
    return { head: build(ks, 'head'), tail };
  };
}
