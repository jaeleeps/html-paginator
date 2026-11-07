import { expect, test } from '@playwright/test';
import { inspectPages, openPaginated, printPdf, readPdf } from './helpers';

test.describe('vertical alignment', () => {
  test('centers the cover, keeps body pages at the top, bottom-aligns the colophon (Word)', async ({ page }) => {
    const errors = await openPaginated(page, 'e2e/fixtures/valign.html');
    expect(errors).toEqual([]);
    const pages = await inspectPages(page);
    for (const p of pages) expect(p.overflowPx, `page ${p.page}`).toBe(0);

    const sheets = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.hp-pages > .hp-page'), (pg) => {
        const body = pg.querySelector('.hp-body')!.getBoundingClientRect();
        const items = Array.from(pg.querySelectorAll('.hp-body h1, .hp-body p'), (el) => el.getBoundingClientRect());
        const style = (el: Element) => getComputedStyle(el);
        const first = pg.querySelector('.hp-body h1, .hp-body p')!;
        const lastP = Array.from(pg.querySelectorAll('.hp-body p')).at(-1)!;
        return {
          text: (pg.querySelector('.hp-body') as HTMLElement).innerText,
          bodyTop: body.top,
          bodyBottom: body.bottom,
          // The content's margin box: first item's top margin to last's bottom margin.
          contentTop: items[0]!.top - parseFloat(style(first).marginTop),
          contentBottom: items.at(-1)!.bottom + parseFloat(style(lastP).marginBottom),
          titleToSubtitle: items.length > 1 ? items[1]!.top - items[0]!.bottom : 0,
          notesTop: pg.querySelector('.hp-footnotes')?.getBoundingClientRect().top ?? null,
        };
      }),
    );

    const cover = sheets[0]!;
    expect(cover.text).toContain('COVER TITLE');
    // Centered: equal space above and below the content.
    expect(cover.contentTop - cover.bodyTop).toBeGreaterThan(200);
    expect(cover.contentTop - cover.bodyTop).toBeCloseTo(cover.bodyBottom - cover.contentBottom, 0);
    // Margins between the title and subtitle collapse (24px, not 36px).
    expect(cover.titleToSubtitle).toBeCloseTo(24, 0);

    const body = sheets.slice(1, -1);
    expect(body.length).toBeGreaterThanOrEqual(2);
    for (const sheet of body) expect(sheet.contentTop).toBeCloseTo(sheet.bodyTop, 0);

    const colophon = sheets.at(-1)!;
    expect(colophon.text).toContain('COLOPHON');
    expect(colophon.contentTop - colophon.bodyTop).toBeGreaterThan(400);
    // Bottom-aligned: the content ends at the body's end, just above the footnote.
    expect(colophon.contentBottom).toBeCloseTo(colophon.bodyBottom, 0);
    expect(colophon.notesTop).not.toBeNull();
    expect(colophon.notesTop!).toBeGreaterThanOrEqual(colophon.bodyBottom - 0.5);

    const pdf = await readPdf(await printPdf(page));
    expect(pdf).toHaveLength(pages.length);
    expect(pdf[0]!.text).toContain('COVER TITLE');
    expect(pdf.at(-1)!.text).toContain('COLOPHON');
  });
});
