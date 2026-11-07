import { expect, test } from '@playwright/test';
import { inspectPages, markers, openPaginated, printPdf, readPdf } from './helpers';

const MARKER = /\b(FILL-[ABC]|KEEP-(?:HEAD|BODY)|STRAND-(?:HEAD|BODY)|LEAD-IN|ROW-\d)\b/g;

test.describe('keep with next', () => {
  test('moves headings and lead-ins with what follows them', async ({ page }) => {
    const errors = await openPaginated(page, 'e2e/fixtures/keep.html');
    expect(errors).toEqual([]);

    const pages = await inspectPages(page);
    expect(pages.map((p) => markers(p.text, MARKER))).toEqual([
      ['FILL-A'],
      ['KEEP-HEAD', 'KEEP-BODY'],
      ['FILL-B', 'STRAND-HEAD'], // opted out: stays stranded
      ['STRAND-BODY'],
      ['FILL-C'],
      ['LEAD-IN', 'ROW-1', 'ROW-2', 'ROW-3'],
    ]);
    for (const p of pages) expect(p.overflowPx, `page ${p.page}`).toBe(0);

    const pdf = await readPdf(await printPdf(page));
    expect(pdf.map((p) => markers(p.text, MARKER))).toEqual(pages.map((p) => markers(p.text, MARKER)));
  });
});
