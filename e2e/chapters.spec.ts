import { expect, test } from '@playwright/test';
import { inspectPages, openPaginated, printPdf, readPdf } from './helpers';

test.describe('chapter page numbers', () => {
  test('label pages "<chapter>-<page>" in footers, the TOC and page references', async ({ page }) => {
    const errors = await openPaginated(page, 'e2e/fixtures/chapters.html');
    expect(errors).toEqual([]);
    const pages = await inspectPages(page);
    for (const p of pages) expect(p.overflowPx, `page ${p.page}`).toBe(0);

    const result = await page.evaluate(() => {
      const sheets = Array.from(document.querySelectorAll<HTMLElement>('.hp-pages > .hp-page'));
      const footerOf = (el: Element) => el.closest('.hp-page')!.querySelector('.hp-footer')!.textContent!.replace('Page ', '');
      return {
        footers: sheets.map((s) => s.querySelector('.hp-footer')!.textContent!.replace('Page ', '')),
        chapterStarts: sheets.map((s) => s.querySelector('h1')?.textContent ?? null),
        toc: Array.from(document.querySelectorAll('.hp-pages .hp-toc-entry'), (e) => ({
          page: e.querySelector('.hp-toc-page')!.textContent,
          expected: footerOf(document.querySelector(`.hp-pages ${e.querySelector('a')!.getAttribute('href')}`)!),
        })),
        ref: document.querySelector('.hp-pages #ref')!.textContent,
      };
    });

    // Expected labels from the content: chapter number, page within chapter.
    let chapter = 0;
    let n = 0;
    const expected = result.chapterStarts.map((start, i) => {
      if (start) {
        chapter = Number(start.replace('Chapter ', ''));
        n = 0;
      }
      n += 1;
      return i === 0 ? '0-1' : `${chapter}-${n}`;
    });
    expect(result.footers).toEqual(expected);
    expect(result.footers.filter((f) => f.startsWith('2-')).length).toBeGreaterThanOrEqual(3);
    expect(result.toc.map((e) => e.page)).toEqual(['1-1', '2-1', '3-1']);
    for (const e of result.toc) expect(e.page).toBe(e.expected);
    expect(result.ref).toBe('3-1');

    const pdf = await readPdf(await printPdf(page));
    expect(pdf).toHaveLength(pages.length);
    pdf.forEach((sheet, i) => expect(sheet.text, `sheet ${i + 1}`).toContain(`Page ${expected[i]}`));
  });
});
