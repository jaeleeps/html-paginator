import { expect, test } from '@playwright/test';
import { inspectPages, markers, openPaginated, printPdf, readPdf } from './helpers';

const TOKEN = /\b([A-Z])-(\d)-(\d\d)\b/g;

/** Per page, per body row: the tokens of each cell. */
type Rows = string[][][][];

test.describe('table rows across pages', () => {
  test('splits rows between lines with per-cell widow/orphan control', async ({ page }) => {
    const errors = await openPaginated(page, 'e2e/fixtures/rows.html');
    expect(errors).toEqual([]);

    const rows: Rows = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.hp-pages .hp-page'), (pg) =>
        Array.from(pg.querySelectorAll('tbody tr'), (tr) =>
          Array.from((tr as HTMLTableRowElement).cells, (td) => td.textContent!.match(/[A-Z]-\d-\d\d/g) ?? []),
        ),
      ),
    );
    const rowOf = (name: string) =>
      rows.flatMap((page, i) =>
        page.filter((r) => r.flat().some((t) => t.startsWith(`${name}-`))).map((r) => ({ page: i + 1, cells: r })),
      );
    const lines = (name: string) => rowOf(name).map((r) => r.cells.map((c) => c.length));

    expect(lines('A')).toEqual([[5, 3], [7, 0]]);
    expect(rowOf('A')[0]!.page).toBe(1);
    expect(lines('B')).toEqual([[3, 2], [9, 2]]);
    expect(lines('C')).toEqual([[6, 2]]);
    const d = lines('D');
    expect(d.length).toBeGreaterThanOrEqual(3);
    expect(d.reduce((sum, [a]) => sum + a!, 0)).toBe(110);

    const info = await inspectPages(page);
    for (const p of info) expect(p.overflowPx, `page ${p.page}`).toBe(0);
    // Header repeats on every part; the footer follows the last part only.
    const dPages = rowOf('D').map((r) => info[r.page - 1]!);
    for (const p of dPages) expect(p.theads).toBe(1);
    // Other tables do not repeat theirs (no repeatTableHead).
    const aPages = rowOf('A').map((r) => info[r.page - 1]!);
    expect(aPages.map((p) => p.theads)).toEqual([1, 0]);
    expect(dPages.map((p) => p.tfoots)).toEqual([...dPages.slice(1).map(() => 0), 1]);

    // Every part of a table has the same column grid.
    const grids = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLTableElement>('.hp-pages table'), (t) => ({
        name: t.tBodies[0]!.textContent!.match(/([A-Z])-\d-\d\d/)![1]!,
        edges: Array.from(t.tBodies[0]!.rows[0]!.cells, (c) => {
          const r = c.getBoundingClientRect();
          const left = t.getBoundingClientRect().left;
          return [Math.round(r.left - left), Math.round(r.right - left)];
        }),
      })),
    );
    for (const name of ['A', 'B', 'D']) {
      const parts = grids.filter((g) => g.name === name || (name === 'A' && g.name === 'S'));
      expect(parts.length, name).toBeGreaterThan(1);
      for (const part of parts) expect(part.edges, name).toEqual(parts[0]!.edges);
    }

    // Nothing lost or duplicated, in order.
    const source = await page.evaluate(() => (window as any).sourceText as string);
    const tokens = (s: string) => s.match(/[A-Z]-\d-\d\d/g) ?? [];
    const pageTokens = rows.flat(1).map((r) => r.flat());
    expect(new Set(pageTokens.flat())).toEqual(new Set(tokens(source)));
    expect(pageTokens.flat().length).toBe(tokens(source).length);

    const pdf = await readPdf(await printPdf(page));
    expect(pdf).toHaveLength(info.length);
    expect(pdf.map((p) => markers(p.text, TOKEN))).toEqual(info.map((p) => markers(p.text, TOKEN)));
  });
});
