import { expect, test } from '@playwright/test';
import { inspectPages, openPaginated, printPdf, readPdf } from './helpers';

test.describe('invoice example', () => {
  test('paginates the shipped example and prints matching pages', async ({ page }) => {
    const errors = await openPaginated(page, 'examples/invoice.html');
    expect(errors).toEqual([]);

    const pages = await inspectPages(page);
    expect(pages.length).toBeGreaterThan(1);

    const rows = pages.flatMap((p) => p.text.match(/sprint \d+/g) ?? []);
    expect(rows).toEqual(Array.from({ length: rows.length }, (_, i) => `sprint ${i + 1}`));

    for (const p of pages) {
      expect(p).toMatchObject({ widthIn: 8.5, heightIn: 11, overflowPx: 0 });
      expect(p.header).toContain(`Page ${p.page} of ${pages.length}`);
    }
    // Totals block stays on the last page with the last rows.
    expect(pages.at(-1)?.text).toMatch(/Subtotal[\s\S]*Total/);

    const pdf = await readPdf(await printPdf(page));
    expect(pdf).toHaveLength(pages.length);
    pdf.forEach((p, i) => expect(p.text).toContain(`Page ${i + 1} of ${pages.length}`));
  });
});
