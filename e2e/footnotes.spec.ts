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
          notes: Array.from(pg.querySelectorAll('.hp-footnote'), (n) => n.getAttribute('data-hp-note')),
          noteText: Array.from(pg.querySelectorAll('.hp-footnote'), (n) => n.textContent!.match(/NOTE-\w+/)![0]),
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
    expect(all).toHaveLength(18);
    for (const [i, p] of pages.entries()) expect(p.notes, `page ${i + 1}`).toEqual(p.refs);

    // Scenario markers.
    expect(pages[0]!.noteText).toEqual(['NOTE-A1']);
    expect(pages[1]!.noteText).toEqual(['NOTE-A2']);
    expect(pages[2]!.noteText).toEqual(['NOTE-B1']);
    expect(pages[2]!.areaHeight).toBe(30); // author CSS (1 + 9 + 20, plus a 10px margin), not the defaults

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
    expect(pages.flatMap((p) => p.marks)).toHaveLength(18);
    for (const [i, p] of pages.entries()) {
      expect(p.marks, `page ${i + 1}`).toEqual(Array.from(letters.slice(0, p.marks.length)));
      expect(p.refs, `page ${i + 1}`).toEqual(p.marks);
    }
  });
});
