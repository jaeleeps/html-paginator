import { expect, test } from '@playwright/test';
import { inspectPages, openPaginated } from './helpers';

test.describe('right-to-left', () => {
  test('mirrors columns, the column rule and line numbers in RTL text (Word)', async ({ page }) => {
    expect(await openPaginated(page, 'e2e/fixtures/rtl.html')).toEqual([]);
    const pages = await inspectPages(page);
    for (const p of pages) expect(p.overflowPx, `page ${p.page}`).toBe(0);

    const sheets = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.hp-pages > .hp-page'), (pg) => {
        const rect = (el: Element) => el.getBoundingClientRect();
        const columns = Array.from(pg.querySelectorAll('.hp-column'), (c) => {
          const body = rect(c.querySelector('.hp-column-body')!);
          const numbers = Array.from(c.querySelectorAll('.hp-line-number'), (n) => rect(n));
          const separator = c.querySelector('.hp-footnote-separator');
          return {
            left: body.left,
            right: body.right,
            first: c.querySelector('p')?.textContent?.match(/P\d+/)?.[0] ?? null,
            numbers: numbers.map((n) => ({ left: n.left, right: n.right })),
            separator: separator && { left: rect(separator).left, right: rect(separator).right },
          };
        });
        const rule = pg.querySelector('.hp-column-rule');
        return { columns, rule: rule && rect(rule).left };
      }),
    );

    expect(sheets.length).toBeGreaterThanOrEqual(2);
    let separators = 0;
    for (const [i, sheet] of sheets.entries()) {
      const at = `page ${i + 1}`;
      const [first, second] = sheet.columns;
      // Column 1 is on the right, and the text continues in column 2 on the left.
      expect(first!.left, at).toBeGreaterThan(second!.right);
      // The rule is in the gap between them.
      expect(sheet.rule!, at).toBeGreaterThan(second!.right);
      expect(sheet.rule!, at).toBeLessThan(first!.left);
      for (const column of sheet.columns) {
        // Line numbers sit to the right of their column's text, clear of it.
        expect(column.numbers.length, at).toBeGreaterThan(0);
        for (const n of column.numbers) expect(n.left, at).toBeGreaterThanOrEqual(column.right - 0.5);
        // A short footnote separator starts at the right edge (the line start).
        if (column.separator) {
          separators++;
          expect(column.separator.right, at).toBeCloseTo(column.right, 0);
          expect(column.separator.left, at).toBeGreaterThan(column.left + 10);
        }
      }
      // Numbers beside column 2 stay on its side of the rule.
      for (const n of second!.numbers) expect(n.right, at).toBeLessThan(sheet.rule!);
    }
    expect(separators).toBeGreaterThan(0);
    expect(sheets[0]!.columns[0]!.first).toBe('P1');
  });
});
