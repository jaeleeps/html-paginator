import { expect, test } from '@playwright/test';
import { inspectPages, markers, openPaginated, printPdf, readPdf } from './helpers';

const MARKER = /\b(COVER|TOC|PRE-\d\d|CH\d|C\d-\d\d|END)\b/g;

test.describe('book with sections', () => {
  test('numbers front matter in roman, restarts the body, starts chapters on odd pages', async ({ page }) => {
    const errors = await openPaginated(page, 'e2e/fixtures/book.html');
    expect(errors).toEqual([]);

    // TOC entries and page references show the page label (from the footer)
    // of the page their heading lands on.
    const refs = await page.evaluate(() => {
      const labelOf = (el: Element) =>
        (el.closest('.hp-page')!.querySelector('.hp-footer')!.textContent ?? '').split(' / ')[0]!.trim();
      const target = (href: string) => document.querySelector(`.hp-pages ${href}`)!;
      const toc = Array.from(document.querySelectorAll('.hp-pages nav:not([data-hp-toc="Figure"]) .hp-toc-entry'), (e) => ({
        text: e.querySelector('.hp-toc-text')!.textContent,
        page: e.querySelector('.hp-toc-page')!.textContent,
        expected: labelOf(target(e.querySelector('a')!.getAttribute('href')!)),
      }));
      const ref = document.querySelector('.hp-pages #ref')!;
      const field = document.querySelector('.hp-pages #field')!;
      const result = {
        toc,
        ref: ref.textContent,
        refExpected: labelOf(target('#ch2')),
        field: field.textContent,
        fieldExpected: field.closest('.hp-page')!.querySelector('.hp-footer')!.textContent!.trim(),
      };
      // Entries repeat chapter markers; drop them for the marker checks below.
      document.querySelectorAll('.hp-pages nav:not([data-hp-toc="Figure"]) .hp-toc-entry').forEach((e) => e.remove());
      return result;
    });
    expect(refs.toc.map((e) => e.text)).toEqual(['Preface', 'CH1 Chapter 1', 'CH2 Chapter 2', 'CH3 Chapter 3']);
    for (const e of refs.toc) expect(e.page, e.text!).toBe(e.expected);
    expect(refs.toc[0]!.page).toBe('i');
    expect(refs.toc[1]!.page).toBe('1');
    expect(refs.ref).toBe(refs.refExpected);
    // Endnotes: the reference links to its note, collected after the end.
    const endnote = await page.evaluate(() => {
      const ref = document.querySelector('.hp-pages .hp-endnote-ref a')!;
      const note = document.querySelector(`.hp-pages ${ref.getAttribute('href')}`)!;
      const pages = Array.from(document.querySelectorAll('.hp-pages > .hp-page'));
      return {
        ref: ref.textContent,
        note: note.textContent,
        notePage: pages.indexOf(note.closest('.hp-page')!),
        lastPage: pages.length - 1,
        afterEnd: note.closest('.hp-page')!.textContent!.indexOf('Notes') > -1,
      };
    });
    expect(endnote).toMatchObject({ ref: 'i', note: 'i ENDNOTE-ONE explained.', afterEnd: true });
    expect(endnote.notePage).toBe(endnote.lastPage);

    // List of figures and a cross-reference to a numbered caption.
    const figures = await page.evaluate(() => {
      const nav = document.querySelector('.hp-pages nav[data-hp-toc="Figure"]')!;
      return {
        entries: Array.from(nav.querySelectorAll('.hp-toc-entry'), (e) => {
          const target = document.querySelector(`.hp-pages ${e.querySelector('a')!.getAttribute('href')}`)!;
          return {
            text: e.querySelector('.hp-toc-text')!.textContent,
            page: e.querySelector('.hp-toc-page')!.textContent,
            expected: (target.closest('.hp-page')!.querySelector('.hp-footer')!.textContent ?? '').split(' / ')[0]!.trim(),
          };
        }),
        xref: document.querySelector('.hp-pages #xref')!.textContent,
      };
    });
    expect(figures.entries.map((e) => e.text)).toEqual(['Figure 1. Diagram of part 2', 'Figure 2. Diagram of part 3']);
    for (const e of figures.entries) expect(e.page, e.text!).toBe(e.expected);
    expect(figures.xref).toBe('Figure 2');

    // Page fields in body text match the footer of their page.
    expect(refs.field).toBe(refs.fieldExpected);
    expect(refs.field).toMatch(/^\d+ \/ \d+$/);

    const pages = await inspectPages(page);
    const source = markers(await page.evaluate(() => (window as any).sourceText as string), MARKER);
    expect(pages.flatMap((p) => markers(p.text, MARKER))).toEqual(source);
    for (const p of pages) expect(p.overflowPx, `page ${p.page}`).toBe(0);

    // Cover: no header/footer.
    expect(pages[0]).toMatchObject({ header: '', footer: '' });

    const front = pages.filter((p) => p.header.startsWith('front'));
    expect(front.length).toBeGreaterThan(1);
    expect(front.map((p) => p.footer.split(' / ')[0])).toEqual(['i', 'ii', 'iii', 'iv', 'v'].slice(0, front.length));

    // Chapters start on odd physical pages; body numbering restarts at 1 and runs on.
    const starts = pages.filter((p) => /^CH\d/.test(markers(p.text, MARKER)[0] ?? ''));
    expect(starts.map((p) => markers(p.text, MARKER)[0])).toEqual(['CH1', 'CH2', 'CH3']);
    for (const p of starts) expect(p.page % 2, `${p.text.slice(0, 3)} on page ${p.page}`).toBe(1);
    expect(starts[0]?.footer).toMatch(/^1 \/ /);

    const body = pages.filter((p) => p.page >= starts[0]!.page);
    const last = body.length;
    body.forEach((p, i) => expect(p.footer, `page ${p.page}`).toBe(`${i + 1} / ${last}`));

    // Blank pages were inserted where a chapter would have started on an even page.
    const blanks = pages.filter((p) => p.text.trim() === '');
    expect(blanks.length).toBeGreaterThan(0);
    for (const b of blanks) expect(b.page % 2).toBe(0);
  });

  test('prints every page, blanks included', async ({ page }) => {
    await openPaginated(page, 'e2e/fixtures/book.html');
    const pages = await inspectPages(page);
    const pdf = await readPdf(await printPdf(page));

    expect(pdf).toHaveLength(pages.length);
    pdf.forEach((p, i) => {
      // A5 (148 x 210 mm); Chromium rounds PDF page boxes slightly.
      expect(p.widthIn).toBeCloseTo(5.83, 1);
      expect(p.heightIn).toBeCloseTo(8.27, 1);
      expect(markers(p.text, MARKER)).toEqual(markers(pages[i]!.text, MARKER));
      if (pages[i]!.footer) expect(p.text).toContain(pages[i]!.footer);
    });
  });

  test('mirrors the margins of facing pages, the gutter inside (Word)', async ({ page }) => {
    await openPaginated(page, 'e2e/fixtures/book.html');
    const sheets = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.hp-pages > .hp-page'), (pg) => {
        const sheet = pg.getBoundingClientRect();
        const body = pg.querySelector('.hp-body')!.getBoundingClientRect();
        return {
          label: (pg.querySelector('.hp-footer')?.textContent ?? '').split(' / ')[0]!.trim(),
          left: body.left - sheet.left,
          right: sheet.right - body.right,
        };
      }),
    );
    const MM = 96 / 25.4;
    const roman: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8 };
    const labelled = sheets.filter((s) => s.label !== '');
    expect(labelled.length).toBeGreaterThan(10);
    for (const s of labelled) {
      const n = roman[s.label] ?? Number(s.label);
      expect(Number.isInteger(n), s.label).toBe(true);
      // Odd pages (recto) have the inside margin on the left, even pages on the right.
      const [inside, outside] = n % 2 === 1 ? [s.left, s.right] : [s.right, s.left];
      expect(inside, `page ${s.label}`).toBeCloseTo(20 * MM, 0);
      expect(outside, `page ${s.label}`).toBeCloseTo(12 * MM, 0);
    }
    // Every page has the same text width.
    for (const s of sheets) expect(s.left + s.right).toBeCloseTo(32 * MM, 0);
  });
});
