import { expect, test } from '@playwright/test';
import { inspectPages, openPaginated, printPdf, readPdf } from './helpers';

test.describe('running headers', () => {
  test('show the chapter and the first/last term of each page', async ({ page }) => {
    const errors = await openPaginated(page, 'e2e/fixtures/running.html');
    expect(errors).toEqual([]);
    const pages = await inspectPages(page);
    expect(pages.length).toBeGreaterThanOrEqual(6);
    for (const p of pages) expect(p.overflowPx, `page ${p.page}`).toBe(0);

    const sheets = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.hp-pages > .hp-page'), (pg) => {
        const body = pg.querySelector('.hp-body')!;
        const text = (sel: string) => pg.querySelector(`.hp-header ${sel}`)!.textContent;
        return {
          chapter: text('.chapter'),
          first: text('.first'),
          last: text('.last'),
          chapters: Array.from(body.querySelectorAll('h1'), (h) => h.textContent),
          terms: Array.from(body.querySelectorAll('dt:not([data-hp-continued])'), (d) => d.textContent),
        };
      }),
    );

    // Expected from the pages' own content (STYLEREF semantics).
    let chapter = '';
    let term = '';
    sheets.forEach((s, i) => {
      const at = `page ${i + 1}`;
      expect(s.chapter, at).toBe(s.chapters[0] ?? chapter);
      expect(s.first, at).toBe(s.terms[0] ?? term);
      expect(s.last, at).toBe(s.terms.at(-1) ?? term);
      chapter = s.chapters.at(-1) ?? chapter;
      term = s.terms.at(-1) ?? term;
    });
    // Pages without a chapter heading carry the chapter on.
    expect(sheets.some((s) => s.chapters.length === 0 && s.chapter === 'CHAPTER Beta')).toBe(true);

    const pdf = await readPdf(await printPdf(page));
    expect(pdf).toHaveLength(pages.length);
    pdf.forEach((sheet, i) => expect(sheet.text, `sheet ${i + 1}`).toContain(sheets[i]!.last!));
  });
});
