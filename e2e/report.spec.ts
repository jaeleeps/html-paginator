import { expect, test } from '@playwright/test';
import { inspectPages, markers, openPaginated, printPdf, readPdf } from './helpers';

const MARKER = /\b(COVER|CH\d|S\d-\d\d)\b/g;

test.describe('Word-style report (declarative, auto entry)', () => {
  test('cover, odd/even headers, mirrored margins and numbering', async ({ page }) => {
    const errors = await openPaginated(page, 'e2e/fixtures/report.html');
    expect(errors).toEqual([]);

    const pages = await inspectPages(page);
    const source = markers(await page.evaluate(() => (window as any).sourceText as string), MARKER);
    expect(pages.flatMap((p) => markers(p.text, MARKER))).toEqual(source);
    expect(pages.length).toBeGreaterThan(5);

    const [cover, ...rest] = pages;
    expect(cover).toMatchObject({ header: '', footer: '', bodyLeftIn: 1, bodyRightIn: 1 });
    expect(markers(cover!.text, MARKER)).toEqual(['COVER']);

    const last = rest.length;
    rest.forEach((p, i) => {
      const number = i + 1; // start 0: page 2 shows "1"
      const odd = number % 2 === 1;
      expect(p.footer, `page ${p.page} footer`).toBe(`Page ${number} of ${last}`);
      expect(p.header, `page ${p.page} header`).toContain(odd ? 'CHAPTER-HDR' : 'TITLE-HDR');
      // Mirrored margins: inside edge is 1.25in, outside 0.75in.
      expect([p.bodyLeftIn, p.bodyRightIn]).toEqual(odd ? [1.25, 0.75] : [0.75, 1.25]);
      expect(p.overflowPx, `page ${p.page} overflow`).toBe(0);
    });

    // Chapters start on their own page.
    for (const ch of ['CH1', 'CH2', 'CH3']) {
      expect(pages.some((p) => markers(p.text, MARKER)[0] === ch), `${ch} starts a page`).toBe(true);
    }
  });

  test('prints the same pages, labels and headers', async ({ page }) => {
    await openPaginated(page, 'e2e/fixtures/report.html');
    const pages = await inspectPages(page);
    const pdf = await readPdf(await printPdf(page));

    expect(pdf).toHaveLength(pages.length);
    expect(pdf[0]?.text).not.toMatch(/Page \d+ of/);
    pdf.slice(1).forEach((p, i) => {
      expect(p.text).toContain(`Page ${i + 1} of ${pdf.length - 1}`);
      expect(p.text).toContain(i % 2 === 0 ? 'CHAPTER-HDR' : 'TITLE-HDR');
      expect(markers(p.text, MARKER)).toEqual(markers(pages[i + 1]!.text, MARKER));
    });
  });
});
