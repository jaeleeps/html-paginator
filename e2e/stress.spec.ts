import { expect, test } from '@playwright/test';
import { inspectPages, markers, openPaginated, printPdf, readPdf } from './helpers';

const MARKER =
  /\b(LOOSE-TOP|INTRO-1|P\d\d|N\d\d|MIXED-(?:START|BOLD|END)|CAPTION-TABLE|R\d\d|TFOOT-TOTAL|AVOID-HEAD|AVOID-BODY|CLIP-BLOCK|FILL-\d|N?RETRY-[AB]|END-MARKER)\b/g;

test.describe('stress fixture', () => {
  test('keeps all content, once, in order, without overflowing pages', async ({ page }) => {
    const errors = await openPaginated(page, 'e2e/fixtures/stress.html');
    expect(errors).toEqual([]);

    const source = markers(await page.evaluate(() => (window as any).sourceText as string), MARKER);
    expect(source).toHaveLength(137);

    const pages = await inspectPages(page);
    expect(pages.flatMap((p) => markers(p.text, MARKER))).toEqual(source);

    for (const p of pages) {
      expect(p, `page ${p.page} size`).toMatchObject({ widthIn: 8.5, heightIn: 11 });
      expect(p.header).toBe(`Stress report — page ${p.page} of ${pages.length}`);
      expect(p.footer).toBe(`footer p${p.page}`);
      // Only the clip page may extend past its body, and it must be clipped.
      if (p.text.includes('CLIP-BLOCK')) expect(p.clipped).toBe(true);
      else expect(p.overflowPx, `page ${p.page} overflow`).toBe(0);
    }
  });

  test('splits the table with caption once, thead repeated, tfoot last', async ({ page }) => {
    await openPaginated(page, 'e2e/fixtures/stress.html');
    const tablePages = (await inspectPages(page)).filter((p) => p.tables > 0);

    expect(tablePages.length).toBeGreaterThan(1);
    expect(tablePages.map((p) => p.captions)).toEqual(tablePages.map((_, i) => (i === 0 ? 1 : 0)));
    expect(tablePages.every((p) => p.theads === 1)).toBe(true);
    expect(tablePages.map((p) => p.tfoots)).toEqual(
      tablePages.map((_, i) => (i === tablePages.length - 1 ? 1 : 0)),
    );
    expect(tablePages.at(-1)?.text).toMatch(/R60[\s\S]*TFOOT-TOTAL/);
  });

  test('prints one PDF page per paginated page with the same content', async ({ page }) => {
    await openPaginated(page, 'e2e/fixtures/stress.html');
    const pages = await inspectPages(page);
    const pdf = await readPdf(await printPdf(page));

    expect(pdf).toHaveLength(pages.length);
    pdf.forEach((p, i) => {
      expect(p, `pdf page ${i + 1} size`).toMatchObject({ widthIn: 8.5, heightIn: 11 });
      expect(markers(p.text, MARKER)).toEqual(markers(pages[i]!.text, MARKER));
      expect(p.text).toContain(`page ${i + 1} of ${pages.length}`);
    });
  });
});
