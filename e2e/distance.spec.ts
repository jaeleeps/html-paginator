import { expect, test } from '@playwright/test';
import { inspectPages, openPaginated, printPdf, readPdf } from './helpers';

const IN = 96;

test.describe('header / footer distance', () => {
  test('places header and footer from the sheet edges, the body at the margins (Word)', async ({ page }) => {
    const errors = await openPaginated(page, 'e2e/fixtures/distance.html');
    expect(errors).toEqual([]);
    const pages = await inspectPages(page);
    for (const p of pages) expect(p.overflowPx, `page ${p.page}`).toBe(0);

    const boxes = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.hp-pages > .hp-page'), (pg) => {
        const sheet = pg.getBoundingClientRect();
        const rel = (sel: string) => {
          const r = pg.querySelector(sel)!.getBoundingClientRect();
          return { top: r.top - sheet.top, bottom: r.bottom - sheet.top };
        };
        const body = pg.querySelector('.hp-body')!;
        const last = body.lastElementChild!.getBoundingClientRect();
        return {
          height: sheet.height,
          header: rel('.hp-header'),
          footer: rel('.hp-footer'),
          body: rel('.hp-body'),
          lastBottom: last.bottom - sheet.top,
          tall: (pg.querySelector('.hp-header')!.textContent ?? '').includes('tall'),
        };
      }),
    );

    const short = boxes.filter((b) => !b.tall);
    const tall = boxes.filter((b) => b.tall);
    expect(short.length).toBeGreaterThanOrEqual(2);
    expect(tall.length).toBeGreaterThanOrEqual(2);

    for (const [i, b] of boxes.entries()) {
      const at = `page ${i + 1}`;
      expect(b.header.top, at).toBeCloseTo(0.5 * IN, 0);
      expect(b.footer.bottom, at).toBeCloseTo(b.height - 0.5 * IN, 0);
      // Body: from the top margin, or below a taller header; to the bottom margin.
      expect(b.body.top, at).toBeCloseTo(Math.max(1 * IN, b.header.bottom), 0);
      expect(b.body.bottom, at).toBeCloseTo(b.height - 1 * IN, 0);
    }
    // The short header fits in the margin; the tall one pushes the body down.
    for (const b of short) expect(b.header.bottom).toBeLessThan(1 * IN);
    for (const b of tall) expect(b.body.top).toBeGreaterThan(1 * IN + 1);

    // Pages are filled to the bottom margin, within one three-line paragraph
    // (orphans/widows 2 keep it whole), so the available height was
    // measured with the same frame.
    const fullPages = [...short.slice(0, -1), ...tall.slice(0, -1)];
    for (const b of fullPages) expect(b.body.bottom - b.lastBottom).toBeLessThan(3 * 18 + 6 + 1);

    const pdf = await readPdf(await printPdf(page));
    expect(pdf).toHaveLength(pages.length);
    pdf.forEach((sheet, i) => {
      expect(sheet.text, `sheet ${i + 1}`).toContain('HEADER');
      expect(sheet.text, `sheet ${i + 1}`).toContain(`FOOTER ${i + 1}`);
    });
  });
});
