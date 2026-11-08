import { expect, test } from '@playwright/test';
import { inspectPages, openPaginated, printPdf, readPdf } from './helpers';

test.describe('index', () => {
  test('lists every term with the pages of its marks, sorted, in columns (Word INDEX)', async ({ page }) => {
    const errors = await openPaginated(page, 'e2e/fixtures/index.html');
    expect(errors).toEqual([]);
    const pages = await inspectPages(page);
    for (const p of pages) expect(p.overflowPx, `page ${p.page}`).toBe(0);

    const result = await page.evaluate(() => {
      const labelOf = (el: Element) => el.closest('.hp-page')!.querySelector('.hp-footer')!.textContent!.trim();
      // Expected: for each term path, the labels of the pages its marks are on.
      const expected = new Map<string, string[]>();
      for (const mark of document.querySelectorAll('.hp-pages [data-hp-index]')) {
        const [main, sub] = mark.getAttribute('data-hp-index')!.split(':').map((s) => s.trim());
        const key = sub ? `${main} > ${sub}` : main!;
        const labels = expected.get(key) ?? [];
        const label = labelOf(mark);
        if (!labels.includes(label)) labels.push(label);
        expected.set(key, labels);
      }
      let main = '';
      const listed: [string, string[]][] = [];
      const headings: string[] = [];
      for (const el of document.querySelectorAll('.hp-pages .hp-index-entry, .hp-pages .hp-index-heading')) {
        if (el.classList.contains('hp-index-heading')) {
          headings.push(el.textContent!);
          continue;
        }
        const term = el.querySelector('.hp-index-term')!.textContent!;
        const sub = el.classList.contains('hp-index-level-2');
        if (!sub) main = term;
        listed.push([sub ? `${main} > ${term}` : term, Array.from(el.querySelectorAll('.hp-index-page'), (p) => p.textContent!)]);
      }
      const indexPages = Array.from(document.querySelectorAll('.hp-pages > .hp-page')).filter((pg) => pg.querySelector('.hp-index-entry'));
      return {
        expected: Array.from(expected.entries()),
        listed,
        headings,
        columns: indexPages.map((pg) => Array.from(pg.querySelectorAll('.hp-column'), (c) => c.querySelectorAll('.hp-index-entry').length)),
        bottoms: indexPages.map((pg) =>
          Array.from(pg.querySelectorAll('.hp-column .hp-column-body'), (c) =>
            Math.max(...Array.from(c.querySelectorAll('.hp-index-entry'), (e) => e.getBoundingClientRect().bottom)),
          ),
        ),
        titleAbove: indexPages.map((pg) => {
          const title = Array.from(pg.querySelectorAll('h2')).find((h) => h.textContent === 'Index');
          const columns = pg.querySelector('.hp-column');
          return !!title && !!columns && title.getBoundingClientRect().bottom <= columns.getBoundingClientRect().top + 0.5;
        }),
      };
    });

    const expected = new Map(result.expected);
    // Every marked term is listed once, with exactly its pages, in page order.
    const withPages = result.listed.filter(([, labels]) => labels.length > 0);
    expect(withPages.map(([key]) => key).sort()).toEqual([...expected.keys()].sort());
    for (const [key, labels] of withPages) expect(labels, key).toEqual(expected.get(key));
    // Some pages are roman (front matter), some appear only once despite two marks.
    expect(withPages.some(([, labels]) => labels.some((l) => /^[ivx]+$/.test(l)))).toBe(true);
    // Main entries sorted, subentries under their term.
    const mains = result.listed.filter(([key]) => !key.includes(' > ')).map(([key]) => key);
    expect(mains).toEqual([...mains].sort((a, b) => a.localeCompare(b)));
    expect(result.listed.map(([key]) => key)).toContain('Bridge > arch');
    expect(result.headings).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
    // In two balanced columns under a full-width title.
    expect(result.columns).toHaveLength(1);
    expect(result.columns[0]).toHaveLength(2);
    expect(result.titleAbove[0]).toBe(true);
    const [left, right] = result.bottoms[0]!;
    expect(Math.abs(left! - right!)).toBeLessThanOrEqual(3 * 18 + 1);

    const pdf = await readPdf(await printPdf(page));
    expect(pdf).toHaveLength(pages.length);
    expect(pdf.at(-1)!.text).toContain('Bridge');
  });
});
