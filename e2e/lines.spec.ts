import { expect, test } from '@playwright/test';
import { inspectPages, openPaginated, printPdf, readPdf } from './helpers';

test.describe('line numbers', () => {
  test('numbers every rendered line in the margin, per page, section and column', async ({ page }) => {
    const errors = await openPaginated(page, 'e2e/fixtures/lines.html');
    expect(errors).toEqual([]);
    const pages = await inspectPages(page);
    for (const p of pages) expect(p.overflowPx, `page ${p.page}`).toBe(0);

    const sheets = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.hp-pages > .hp-page'), (pg) => {
        const sheet = pg.getBoundingClientRect();
        const bodies = Array.from(pg.querySelectorAll<HTMLElement>('.hp-column-body'));
        if (bodies.length === 0) bodies.push(pg.querySelector<HTMLElement>('.hp-body')!);
        return bodies.map((body) => {
          const box = body.getBoundingClientRect();
          // Lines of each numbered element, from its height and line height.
          let lines = 0;
          const centers: number[] = [];
          for (const el of body.querySelectorAll<HTMLElement>('p, h2')) {
            if (el.closest('[data-hp-suppress-line-numbers], table')) continue;
            const rect = el.getBoundingClientRect();
            const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
            const n = Math.round(rect.height / lineHeight);
            for (let i = 0; i < n; i++) centers.push(rect.top + (i + 0.5) * lineHeight);
            lines += n;
          }
          const marks = Array.from(body.querySelectorAll<HTMLElement>('.hp-line-number'), (m) => {
            const r = m.getBoundingClientRect();
            return { n: Number(m.textContent), center: r.top + r.height / 2, right: r.right, left: r.left };
          });
          return { lines, centers, marks, bodyLeft: box.left, sheetLeft: sheet.left, text: body.innerText };
        });
      }),
    );

    const main = sheets.filter((s) => s.length === 1);
    const cols = sheets.filter((s) => s.length === 2);
    expect(main.length).toBeGreaterThanOrEqual(2);
    expect(cols.length).toBeGreaterThanOrEqual(1);

    // Main: every line numbered, from 1 on each page, beside its line.
    for (const [i, [body]] of main.entries()) {
      expect(body!.marks.map((m) => m.n), `page ${i + 1}`).toEqual(Array.from({ length: body!.lines }, (_, k) => k + 1));
      body!.marks.forEach((m, k) => {
        expect(Math.abs(m.center - body!.centers[k]!), `page ${i + 1} line ${k + 1}`).toBeLessThan(2);
        expect(m.right).toBeCloseTo(body!.bodyLeft - 0.3 * 96, 0);
        expect(m.left).toBeGreaterThan(body!.sheetLeft);
      });
    }
    expect(main.some(([b]) => b!.text.includes('TABLE'))).toBe(true);
    expect(main.some(([b]) => b!.text.includes('QUOTE'))).toBe(true);

    // Columns: every 5th line, counted down column 1 then column 2,
    // continuing across pages of the section.
    let counted = 0;
    for (const [i, sheet] of cols.entries()) {
      for (const [c, body] of sheet.entries()) {
        const expected: number[] = [];
        const centers: number[] = [];
        for (let k = 1; k <= body.lines; k++) {
          if ((counted + k) % 5 === 0) {
            expected.push(counted + k);
            centers.push(body.centers[k - 1]!);
          }
        }
        counted += body.lines;
        expect(body.marks.map((m) => m.n), `cols page ${i + 1} column ${c + 1}`).toEqual(expected);
        body.marks.forEach((m, k) => expect(Math.abs(m.center - centers[k]!)).toBeLessThan(2));
        for (const m of body.marks) expect(m.right).toBeCloseTo(body.bodyLeft - 0.15 * 96, 0);
      }
    }

    // Printed: the numbers are on the sheets, after the content they number.
    const pdf = await readPdf(await printPdf(page));
    expect(pdf).toHaveLength(pages.length);
    const firstLast = main[0]![0]!.marks.at(-1)!.n;
    expect(pdf[0]!.text).toMatch(new RegExp(`\\b${firstLast}\\b`));
  });
});
