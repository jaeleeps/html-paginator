import { expect, test } from '@playwright/test';
import { inspectPages, openPaginated, printPdf, readPdf } from './helpers';

const WORD = /W\d{4}/g;

test.describe('continuous section breaks', () => {
  test('stacks sections on one page, balancing columns before a continuous break', async ({ page }) => {
    const errors = await openPaginated(page, 'e2e/fixtures/continuous.html');
    expect(errors).toEqual([]);
    const pages = await inspectPages(page);
    for (const p of pages) expect(p.overflowPx, `page ${p.page}`).toBe(0);

    const sheets = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.hp-pages > .hp-page'), (pg) => {
        const body = pg.querySelector('.hp-body')!.getBoundingClientRect();
        const bottomOf = (el: Element) =>
          Math.max(el.getBoundingClientRect().top, ...Array.from(el.querySelectorAll('p, h1, h2'), (c) => c.getBoundingClientRect().bottom));
        const region = (el: Element) => {
          const rect = el.getBoundingClientRect();
          const columns = Array.from(el.querySelectorAll('.hp-column-body'), (c) => ({
            text: (c as HTMLElement).innerText,
            bottom: bottomOf(c),
            box: c.getBoundingClientRect().bottom,
          }));
          return { top: rect.top, bottom: rect.bottom, contentBottom: bottomOf(el), text: (el as HTMLElement).innerText, columns };
        };
        const regions = Array.from(pg.querySelectorAll('.hp-region'), region);
        return {
          bodyTop: body.top,
          bodyBottom: body.bottom,
          regions,
          columns: regions.length === 0 ? Array.from(pg.querySelectorAll('.hp-column-body'), (c) => (c as HTMLElement).innerText) : [],
          columnBottoms: Array.from(pg.querySelectorAll('.hp-column-body'), bottomOf),
          text: (pg.querySelector('.hp-body') as HTMLElement).innerText,
        };
      }),
    );

    // Page 1: title, the balanced NEWS columns, then AFTER — all on one page,
    // and MORE starting below them.
    const first = sheets[0]!;
    expect(first.regions.length).toBe(4);
    const [title, news, after, more] = first.regions;
    expect(title!.text).toContain('TITLE');
    expect(news!.columns).toHaveLength(2);
    expect(after!.text).toContain('AFTER');
    expect(more!.columns).toHaveLength(2);
    // Regions stack without overlapping.
    for (const [a, b] of [[title, news], [news, after], [after, more]] as const) {
      expect(b!.top).toBeGreaterThanOrEqual(a!.contentBottom - 0.5);
    }
    // Balanced: both NEWS columns end within one paragraph line of each other.
    const [left, right] = news!.columns;
    expect(Math.abs(left!.bottom - right!.bottom)).toBeLessThanOrEqual(18 + 6 + 1);
    expect(right!.text).toMatch(WORD);
    // MORE fills the rest of the page: its columns reach the body bottom.
    expect(more!.bottom).toBeCloseTo(first.bodyBottom, 0);

    // Later pages: MORE in plain two-column pages.
    for (const sheet of sheets.slice(1)) {
      expect(sheet.regions).toHaveLength(0);
      expect(sheet.columns).toHaveLength(2);
    }

    // The document's last page of columns is balanced too (balanceColumns),
    // the pages before it are filled.
    const [lastLeft, lastRight] = sheets.at(-1)!.columnBottoms;
    expect(sheets.length).toBeGreaterThanOrEqual(3);
    // Within one unsplittable chunk: orphans/widows (2) keep up to 3 lines together.
    expect(Math.abs(lastLeft! - lastRight!)).toBeLessThanOrEqual(3 * 18 + 6 + 1);
    expect(lastLeft!).toBeLessThan(sheets.at(-1)!.bodyBottom - 18 * 3);

    // Reading order: every numbered word once, in order.
    const reading = [
      ...news!.columns.map((c) => c.text),
      ...more!.columns.map((c) => c.text),
      ...sheets.slice(1).flatMap((s) => s.columns),
    ].join(' ');
    const found = reading.match(WORD) ?? [];
    expect(found.length).toBeGreaterThan(1000);
    expect(found).toEqual(Array.from({ length: found.length }, (_, i) => `W${String(i + 1).padStart(4, '0')}`));

    const pdf = await readPdf(await printPdf(page));
    expect(pdf).toHaveLength(pages.length);
    expect(new Set(pdf.flatMap((s) => s.text.match(WORD) ?? [])).size).toBe(found.length);
  });
});
