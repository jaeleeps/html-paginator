import { expect, test } from '@playwright/test';
import { inspectPages, markers, openPaginated, printPdf, readPdf } from './helpers';

const MARKER = /\b(NOTE-[A-C]\d[abc]?|[AB]-(?:ONE|TWO)|C\d_(?:START|END))\b/g;

test.describe('footnotes', () => {
  test('puts each note at the bottom of its reference page', async ({ page }) => {
    const errors = await openPaginated(page, 'e2e/fixtures/footnotes.html');
    expect(errors).toEqual([]);

    const pages = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.hp-pages > .hp-page'), (pg) => {
        const box = (sel: string) => pg.querySelector(sel)?.getBoundingClientRect() ?? null;
        const area = box('.hp-footnotes');
        const body = pg.querySelector('.hp-body')!;
        let contentBottom = 0;
        for (const el of body.querySelectorAll('*')) contentBottom = Math.max(contentBottom, el.getBoundingClientRect().bottom);
        return {
          refs: Array.from(pg.querySelectorAll('.hp-body .hp-footnote-ref'), (r) => r.textContent).filter(Boolean),
          notes: Array.from(pg.querySelectorAll('.hp-footnote:not([data-hp-continued])'), (n) => n.getAttribute('data-hp-note')),
          noteText: Array.from(pg.querySelectorAll('.hp-footnote:not([data-hp-continued])'), (n) => n.textContent!.match(/NOTE-\w+/)![0]),
          continued: Array.from(pg.querySelectorAll('.hp-footnote[data-hp-continued]'), (n) => ({
            note: n.getAttribute('data-hp-note'),
            first: n === pg.querySelector('.hp-footnote'),
            mark: n.querySelector('.hp-footnote-mark') !== null,
            separatorWidth: pg.querySelector('.hp-footnote-separator')!.getBoundingClientRect().width,
            areaWidth: pg.querySelector('.hp-footnotes')!.getBoundingClientRect().width,
            continuationSeparator: pg.querySelector('.hp-footnote-separator')!.classList.contains('hp-footnote-separator-continued'),
          })),
          noteLines: Array.from(pg.querySelectorAll('.hp-footnote'), (n) => Math.round(n.getBoundingClientRect().height / 20)),
          order: Array.from(pg.children, (c) => [...c.classList].find((k) => k.startsWith('hp-'))),
          contentBottom,
          bodyBottom: box('.hp-body')!.bottom,
          areaTop: area?.top ?? null,
          areaBottom: area?.bottom ?? null,
          areaHeight: area?.height ?? 0,
          footerTop: box('.hp-footer')!.top,
        };
      }),
    );

    // Numbering is continuous and every note is on its reference's page.
    const all = pages.flatMap((p) => p.notes);
    expect(all).toEqual(Array.from({ length: all.length }, (_, i) => String(i + 1)));
    expect(all).toHaveLength(19);
    for (const [i, p] of pages.entries()) expect(p.notes, `page ${i + 1}`).toEqual(p.refs);

    // Scenario markers.
    expect(pages[0]!.noteText).toEqual(['NOTE-A1']);
    expect(pages[1]!.noteText).toEqual(['NOTE-A2']);
    expect(pages[2]!.noteText).toEqual(['NOTE-B1']);
    expect(pages[2]!.areaHeight).toBe(30); // author CSS (1 + 9 + 20, plus a 10px margin), not the defaults

    // D: the long note starts on its reference's page and continues, first
    // in the next page's area, without a number, under a full-width rule.
    const start = pages.findIndex((p) => p.noteText.includes('NOTE-D1'));
    const next = pages[start + 1]!;
    expect(next.continued).toHaveLength(1);
    expect(next.continued[0]).toMatchObject({ note: '19', first: true, mark: false, continuationSeparator: true });
    expect(next.continued[0]!.separatorWidth).toBeCloseTo(next.continued[0]!.areaWidth, 0);
    expect(pages[start]!.noteLines.at(-1)).toBeGreaterThanOrEqual(2); // orphans
    expect(next.noteLines[0]).toBeGreaterThanOrEqual(2); // widows
    expect(pages.flatMap((p) => p.continued)).toHaveLength(1);

    for (const [i, p] of pages.entries()) {
      // Body, notes, footer stack without overlap; content stays in the body.
      if (p.areaTop !== null) {
        expect(p.order, `page ${i + 1}`).toEqual(['hp-body', 'hp-footnotes', 'hp-footer']);
        expect(p.areaBottom!, `page ${i + 1}`).toBeLessThanOrEqual(p.footerTop + 0.5);
      }
      expect(p.contentBottom, `page ${i + 1}`).toBeLessThanOrEqual(p.bodyBottom + 0.5);
    }

    const info = await inspectPages(page);
    const pdf = await readPdf(await printPdf(page));
    expect(pdf).toHaveLength(info.length);
    pdf.forEach((p, i) => {
      // Notes print on the same sheet as their reference.
      expect(markers(p.text, MARKER), `sheet ${i + 1}`).toEqual(
        markers((info[i]!.text + ' ' + pages[i]!.noteText.join(' ')), MARKER),
      );
      expect(p.text).toContain(`PAGE-${i + 1}`);
    });
  });

  test('restarts numbering on each page when asked', async ({ page }) => {
    const errors = await openPaginated(page, 'e2e/fixtures/footnotes.html?restart=page');
    expect(errors).toEqual([]);
    const pages = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.hp-pages > .hp-page'), (pg) => ({
        refs: Array.from(pg.querySelectorAll('.hp-body .hp-footnote-ref'), (r) => r.textContent).filter(Boolean),
        marks: Array.from(pg.querySelectorAll('.hp-footnote-mark'), (m) => m.textContent),
      })),
    );
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    expect(pages.flatMap((p) => p.marks)).toHaveLength(19);
    for (const [i, p] of pages.entries()) {
      expect(p.marks, `page ${i + 1}`).toEqual(Array.from(letters.slice(0, p.marks.length)));
      expect(p.refs, `page ${i + 1}`).toEqual(p.marks);
    }
  });

  test('puts the notes right below the text with position: beneath-text, same pages', async ({ page }) => {
    const layout = async (url: string) => {
      expect(await openPaginated(page, url)).toEqual([]);
      return page.evaluate(() =>
        Array.from(document.querySelectorAll('.hp-pages > .hp-page'), (pg) => {
          const body = pg.querySelector('.hp-body')!;
          let contentBottom = 0;
          for (const el of body.querySelectorAll('p, span, .hp-footnote-ref')) {
            contentBottom = Math.max(contentBottom, el.getBoundingClientRect().bottom);
          }
          const area = pg.querySelector('.hp-footnotes')?.getBoundingClientRect() ?? null;
          return {
            notes: Array.from(pg.querySelectorAll('.hp-footnote'), (n) => n.textContent!.slice(0, 12)),
            contentBottom,
            areaTop: area?.top ?? null,
            areaBottom: area?.bottom ?? null,
            footerTop: pg.querySelector('.hp-footer')!.getBoundingClientRect().top,
          };
        }),
      );
    };
    const atBottom = await layout('e2e/fixtures/footnotes.html');
    const beneath = await layout('e2e/fixtures/footnotes.html?position=beneath');
    // Pagination is unchanged: the same notes on the same pages.
    expect(beneath.map((p) => p.notes)).toEqual(atBottom.map((p) => p.notes));
    let moved = 0;
    for (const [i, p] of beneath.entries()) {
      expect(p.footerTop, `page ${i + 1}`).toBeCloseTo(atBottom[i]!.footerTop, 0);
      if (p.areaTop === null) continue;
      // Right below the last line of text (the area's own top margin aside).
      expect(p.areaTop, `page ${i + 1}`).toBeGreaterThanOrEqual(p.contentBottom - 0.5);
      expect(p.areaTop - p.contentBottom, `page ${i + 1}`).toBeLessThan(30);
      expect(p.areaBottom!, `page ${i + 1}`).toBeLessThanOrEqual(p.footerTop + 0.5);
      if (atBottom[i]!.areaTop! - p.areaTop > 50) moved++;
    }
    // Some pages end short of the bottom (sections, the last page): their notes moved up.
    expect(moved).toBeGreaterThan(0);
  });
});
