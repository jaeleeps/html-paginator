import { expect, test } from '@playwright/test';
import { inspectPages, markers, openPaginated, printPdf, readPdf } from './helpers';

const MARKER = /\b[A-Z]+-(?:START|END)\b/g;
const LINE = 20;
const BODY = 960;

interface Piece {
  name: string;
  continued: boolean;
  lines: number;
}

test.describe('paragraph splitting', () => {
  test('splits paragraphs between lines with widow/orphan control', async ({ page }) => {
    const errors = await openPaginated(page, 'e2e/fixtures/paragraphs.html');
    expect(errors).toEqual([]);

    const layout = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.hp-pages > .hp-page'), (pg) => {
        const body = pg.querySelector<HTMLElement>('.hp-body')!;
        const top = body.getBoundingClientRect().top;
        const pieces = Array.from(body.querySelectorAll<HTMLElement>('[data-p]'), (p) => ({
          name: p.dataset.p!,
          continued: p.hasAttribute('data-hp-continued'),
          height: p.getBoundingClientRect().height,
        }));
        const last = body.lastElementChild!.getBoundingClientRect();
        return { pieces, filled: last.bottom - top, text: body.textContent ?? '' };
      }),
    );
    const pages = layout.map((p) => ({
      ...p,
      pieces: p.pieces.map((q): Piece => ({ ...q, lines: Math.round(q.height / 20) })),
    }));

    // No text lost or duplicated at split points.
    const source = await page.evaluate(() => document.getElementById('src')!.textContent ?? '');
    const squash = (s: string) => s.replace(/\s+/g, '');
    expect(squash(pages.map((p) => p.text).join(''))).toBe(squash(source));

    const piecesOf = (name: string) =>
      pages.flatMap((p, i) => p.pieces.filter((q) => q.name === name).map((q) => ({ ...q, page: i + 1 })));

    // fill: 3 lines in the 60px left, the rest on the next page.
    const fill = piecesOf('fill');
    expect(fill[0]).toMatchObject({ page: 1, continued: false, lines: 3 });
    expect(fill.slice(1).every((q) => q.continued)).toBe(true);

    // orphan: one line would be left behind, so it moves whole.
    expect(piecesOf('orphan')).toHaveLength(1);
    // widow: 4 lines would fit, but the last line would be alone.
    expect(piecesOf('widow').map((q) => q.lines)).toEqual([3, 2]);
    // custom orphans 4 / widows 3: 7 lines fit, 5 stay.
    expect(piecesOf('custom').map((q) => q.lines)).toEqual([5, 3]);
    // break-inside: avoid
    expect(piecesOf('avoid')).toHaveLength(1);
    // nested in a padded section: split inside it, continuation still in a section.
    const nested = piecesOf('nested');
    expect(nested.length).toBe(2);
    expect(nested[0]!.lines).toBe(5); // 100px left after the 860px filler

    // long: spans pages, each full to within a line.
    const long = piecesOf('long');
    expect(long.length).toBeGreaterThanOrEqual(3);
    for (const q of long.slice(0, -1)) {
      expect(pages[q.page - 1]!.filled, `page ${q.page}`).toBeGreaterThan(BODY - LINE);
    }

    // Every split respects orphans/widows (2 by default).
    for (const name of ['fill', 'long', 'nested']) {
      for (const q of piecesOf(name)) expect(q.lines, name).toBeGreaterThanOrEqual(2);
    }

    const info = await inspectPages(page);
    for (const p of info) expect(p.overflowPx, `page ${p.page}`).toBe(0);
    const nestedPages = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.hp-pages [data-p="nested"]'), (p) => p.parentElement!.tagName),
    );
    expect(nestedPages).toEqual(['SECTION', 'SECTION']);

    const pdf = await readPdf(await printPdf(page));
    expect(pdf).toHaveLength(info.length);
    expect(pdf.map((p) => markers(p.text, MARKER))).toEqual(info.map((p) => markers(p.text, MARKER)));
  });
});
