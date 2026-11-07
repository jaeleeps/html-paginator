import { expect, test } from '@playwright/test';
import { inspectPages, markers, openPaginated, printPdf, readPdf } from './helpers';

const MARKER = /\b(INTRO|WIDE|OUTRO|R\d+C1)\b/g;

test.describe('landscape section', () => {
  test('prints each page on a sheet of its own orientation', async ({ page }) => {
    const errors = await openPaginated(page, 'e2e/fixtures/landscape.html');
    expect(errors).toEqual([]);

    const pages = await inspectPages(page);
    const shape = pages.map((p) => `${p.widthIn}x${p.heightIn}`);
    const wide = pages.filter((p) => p.widthIn > p.heightIn);
    expect(shape[0]).toBe('8.5x11');
    expect(shape[shape.length - 1]).toBe('8.5x11');
    expect(wide.length).toBeGreaterThanOrEqual(2); // the table spans landscape pages
    for (const p of wide) expect(`${p.widthIn}x${p.heightIn}`).toBe('11x8.5');
    for (const p of pages) expect(p.overflowPx, `page ${p.page}`).toBe(0);
    // Every landscape page repeats the header row.
    for (const p of wide) expect(p.theads).toBe(1);

    // The watermark covers each whole sheet, behind the content.
    const layers = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.hp-pages > .hp-page'), (pg) => {
        const layer = pg.querySelector('.hp-watermark')!.getBoundingClientRect();
        const sheet = pg.getBoundingClientRect();
        const mark = pg.querySelector('.hp-watermark span')!.getBoundingClientRect();
        const z = (sel: string) => Number(getComputedStyle(pg.querySelector(sel)!).zIndex) || 0;
        return {
          covers: Math.abs(layer.width - sheet.width) < 1 && Math.abs(layer.height - sheet.height) < 1,
          centered: Math.abs(mark.left + mark.width / 2 - (sheet.left + sheet.width / 2)) < 2,
          contentOnTop: z('.hp-body') > z('.hp-watermark'),
        };
      }),
    );
    for (const [i, l] of layers.entries()) expect(l, `page ${i + 1}`).toEqual({ covers: true, centered: true, contentOnTop: true });

    const pdf = await readPdf(await printPdf(page));
    for (const [i, sheet] of pdf.entries()) expect(sheet.text, `sheet ${i + 1}`).toContain('WATERMARK');
    expect(pdf).toHaveLength(pages.length);
    pdf.forEach((sheet, i) => {
      expect(sheet.widthIn, `sheet ${i + 1}`).toBeCloseTo(pages[i]!.widthIn, 1);
      expect(sheet.heightIn, `sheet ${i + 1}`).toBeCloseTo(pages[i]!.heightIn, 1);
      expect(markers(sheet.text, MARKER)).toEqual(markers(pages[i]!.text, MARKER));
    });
  });
});
