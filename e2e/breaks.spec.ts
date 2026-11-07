import { expect, test } from '@playwright/test';
import { inspectPages, markers, openPaginated, printPdf, readPdf } from './helpers';

const MARKER = /\b(TITLE|CH\d|C\d-\d\d|NESTED-BREAK|APPX-LEAD|APPX|T\d\d)\b/g;

test.describe('forced page breaks', () => {
  test('start pages exactly where breaks are declared', async ({ page }) => {
    const errors = await openPaginated(page, 'e2e/fixtures/breaks.html');
    expect(errors).toEqual([]);

    const pages = await inspectPages(page);
    const perPage = pages.map((p) => markers(p.text, MARKER));
    const source = markers(await page.evaluate(() => (window as any).sourceText as string), MARKER);
    expect(perPage.flat()).toEqual(source);

    const firsts = perPage.map((m) => m[0]);
    // Each declared break starts a page; CH1 overflows onto a second page.
    for (const start of ['CH1', 'CH2', 'NESTED-BREAK', 'APPX', 'CH3', 'T07']) {
      expect(firsts, `${start} starts a page`).toContain(start);
    }
    expect(perPage[0]).toEqual(['TITLE']);
    // CH3's table: the break row T07 starts the last page.
    expect(perPage.at(-1)?.[0]).toBe('T07');
    for (const p of pages) {
      expect(p).toMatchObject({ widthIn: 8.27, heightIn: 11.69, overflowPx: 0 });
    }
  });

  test('prints without extra sheets from the content breaks', async ({ page }) => {
    await openPaginated(page, 'e2e/fixtures/breaks.html');
    const pages = await inspectPages(page);
    const pdf = await readPdf(await printPdf(page));

    expect(pdf).toHaveLength(pages.length);
    pdf.forEach((p, i) => {
      expect(markers(p.text, MARKER)).toEqual(markers(pages[i]!.text, MARKER));
      expect(p.text).toContain(`Breaks — ${i + 1}/${pages.length}`);
    });
  });
});
