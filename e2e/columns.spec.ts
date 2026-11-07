import { expect, test } from '@playwright/test';
import { inspectPages, openPaginated, printPdf, readPdf } from './helpers';

const WORD = /W\d{4}/g;

test.describe('multi-column section', () => {
  test('flows text down each column in order, with no overflow, and prints it', async ({ page }) => {
    const errors = await openPaginated(page, 'e2e/fixtures/columns.html');
    expect(errors).toEqual([]);

    const pages = await inspectPages(page);
    expect(pages.length).toBeGreaterThanOrEqual(4);
    for (const p of pages) expect(p.overflowPx, `page ${p.page}`).toBe(0);
    expect(pages[0]!.text).toContain('INTRO');
    expect(pages[pages.length - 1]!.text).toContain('OUTRO');

    const sheets = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.hp-pages > .hp-page'), (pg) => {
        const body = pg.querySelector('.hp-body')!.getBoundingClientRect();
        const columns = Array.from(pg.querySelectorAll<HTMLElement>('.hp-column'), (col) => {
          const rect = col.getBoundingClientRect();
          const content = col.querySelector<HTMLElement>('.hp-column-body')!;
          const contentRect = content.getBoundingClientRect();
          const bottoms = Array.from(content.querySelectorAll('*'), (el) => el.getBoundingClientRect().bottom);
          const notes = col.querySelector('.hp-footnotes')?.getBoundingClientRect();
          const rule = col.querySelector('.hp-column-rule')?.getBoundingClientRect();
          const paragraph = content.querySelector('p')?.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            width: rect.width,
            overflow: Math.max(0, Math.round(Math.max(contentRect.top, ...bottoms) - contentRect.bottom)),
            notesInside: !notes || (notes.bottom <= rect.bottom + 0.5 && notes.top >= contentRect.bottom - 0.5),
            ruleX: rule ? rule.left : null,
            paragraphWidth: paragraph ? paragraph.width : null,
            text: content.innerText,
            refs: Array.from(content.querySelectorAll('.hp-footnote-ref'), (r) => r.getAttribute('data-hp-note'))
              .filter((n, i, all) => all.indexOf(n) === i),
            notes: Array.from(col.querySelectorAll('.hp-footnote:not([data-hp-continued])'), (n) =>
              n.getAttribute('data-hp-note'),
            ),
          };
        });
        return { bodyWidth: body.width, columns };
      }),
    );

    const multi = sheets.filter((s) => s.columns.length > 0);
    expect(multi.length).toBeGreaterThanOrEqual(2);
    const gap = 0.4 * 96;
    const reading: string[] = [];
    for (const [i, sheet] of multi.entries()) {
      const [a, b] = sheet.columns;
      expect(sheet.columns, `sheet ${i}`).toHaveLength(2);
      // Equal columns filling the body around the gap; the rule in its middle.
      expect(a!.width).toBeCloseTo((sheet.bodyWidth - gap) / 2, 0);
      expect(b!.width).toBeCloseTo(a!.width, 0);
      expect(b!.left - a!.right).toBeCloseTo(gap, 0);
      expect(b!.ruleX!).toBeCloseTo(a!.right + gap / 2, 0);
      for (const col of sheet.columns) {
        expect(col.overflow, `sheet ${i}`).toBe(0);
        expect(col.notesInside, `sheet ${i}`).toBe(true);
        if (col.paragraphWidth !== null) expect(col.paragraphWidth).toBeCloseTo(col.width, 0);
        reading.push(col.text);
      }
    }

    // Every word once, in order, reading column by column.
    const found = reading.join(' ').match(WORD) ?? [];
    const total = found.length;
    expect(total).toBeGreaterThan(1500);
    expect(found).toEqual(Array.from({ length: total }, (_, i) => `W${String(i + 1).padStart(4, '0')}`));
    // Columns are filled before moving on: all but the section's last are used.
    const filled = multi.flatMap((s) => s.columns).map((c) => c.text.trim() !== '');
    expect(filled.slice(0, -1).every(Boolean)).toBe(true);
    // Footnotes land in the column of their reference.
    for (const col of multi.flatMap((s) => s.columns)) expect(col.notes).toEqual(col.refs);
    expect(multi.flatMap((s) => s.columns).filter((c) => c.notes.length > 0).length).toBeGreaterThanOrEqual(2);

    const pdf = await readPdf(await printPdf(page));
    expect(pdf).toHaveLength(pages.length);
    const pdfWords = pdf.flatMap((sheet) => sheet.text.match(WORD) ?? []);
    expect(new Set(pdfWords).size).toBe(total);
  });
});
