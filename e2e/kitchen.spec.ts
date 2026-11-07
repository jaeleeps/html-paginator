import { expect, test } from '@playwright/test';
import { inspectPages, openPaginated, printPdf, readPdf } from './helpers';

const WORD = /W\d{4}/g;

test.describe('kitchen sink', () => {
  test('all features together keep the pagination invariants', async ({ page }) => {
    const errors = await openPaginated(page, 'e2e/fixtures/kitchen.html');
    expect(errors).toEqual([]);
    const pages = await inspectPages(page);

    const sheets = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.hp-pages > .hp-page'), (pg) => {
        const sheet = pg.getBoundingClientRect();
        // Every box holding content: nothing may reach below it.
        const boxes = Array.from(pg.querySelectorAll<HTMLElement>('.hp-column-body, .hp-region, .hp-body'));
        const overflow = Math.max(
          0,
          ...boxes.map((box) => {
            const bottom = box.getBoundingClientRect().bottom;
            const kids = Array.from(box.querySelectorAll('*'), (el) => el.getBoundingClientRect()).filter((r) => r.height > 0);
            return Math.round(Math.max(bottom, ...kids.map((r) => r.bottom)) - bottom);
          }),
        );
        const footer = pg.querySelector('.hp-footer')!.getBoundingClientRect();
        const header = pg.querySelector('.hp-header')!.getBoundingClientRect();
        const notesBelowFooter = Array.from(pg.querySelectorAll('.hp-footnotes'), (n) => n.getBoundingClientRect().bottom - footer.top);
        // Footnotes: each note in the column of its reference, or (outside
        // columns) on the page of its reference.
        const inColumn = (el: Element) => el.closest('.hp-column') !== null;
        const groups: [Element[], Element[]][] = Array.from(pg.querySelectorAll('.hp-column'), (c) => [
          Array.from(c.querySelectorAll('.hp-footnote-ref')),
          Array.from(c.querySelectorAll('.hp-footnote')),
        ]);
        groups.push([
          Array.from(pg.querySelectorAll('.hp-footnote-ref')).filter((r) => !inColumn(r)),
          Array.from(pg.querySelectorAll('.hp-footnote')).filter((n) => !inColumn(n)),
        ]);
        const notesMismatch = groups.flatMap(([refEls, noteEls]) => {
          const refs = [...new Set(refEls.filter((r) => r.textContent !== '').map((r) => r.getAttribute('data-hp-note')))];
          const notes = noteEls.filter((n) => !n.hasAttribute('data-hp-continued')).map((n) => n.getAttribute('data-hp-note'));
          return JSON.stringify(refs) === JSON.stringify(notes) ? [] : [{ refs, notes }];
        });
        // Line numbers never cover text.
        const text = Array.from(pg.querySelectorAll('.hp-body p, .hp-body h1, .hp-body h2, .hp-body td, .hp-body th'), (el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return Array.from(range.getClientRects());
        }).flat();
        const covered = Array.from(pg.querySelectorAll('.hp-line-number'), (n) => {
          const r = n.firstChild ? (() => { const range = document.createRange(); range.selectNodeContents(n); return range.getBoundingClientRect(); })() : n.getBoundingClientRect();
          return text.some((t) => r.left < t.right - 0.5 && r.right > t.left + 0.5 && r.top < t.bottom - 0.5 && r.bottom > t.top + 0.5) ? n.textContent : null;
        }).filter((x) => x !== null);
        // Footnote areas: below all content of the body.
        const bodyBottom = pg.querySelector('.hp-body')!.getBoundingClientRect().bottom;
        return {
          covered,
          // Footnotes outside columns: one area below the body (Word).
          regionNotes: pg.querySelectorAll('.hp-region > .hp-footnotes').length,
          notesAboveBody: Array.from(pg.querySelectorAll(':scope > .hp-footnotes'), (n) => bodyBottom - n.getBoundingClientRect().top),
          overflow,
          headerTop: header.top - sheet.top,
          footerBottom: sheet.bottom - footer.bottom,
          notesBelowFooter,
          notesMismatch,
          run: pg.querySelector('.hp-header')!.textContent,
          footer: pg.querySelector('.hp-footer')!.textContent,
          h1: Array.from(pg.querySelectorAll('.hp-body h1'), (h) => h.textContent),
          body: (pg.querySelector('.hp-body') as HTMLElement).innerText,
          landscape: sheet.width > sheet.height,
          lineNumbers: pg.querySelectorAll('.hp-line-number').length,
          regions: pg.querySelectorAll('.hp-region').length,
        };
      }),
    );

    sheets.forEach((s, i) => {
      const at = `page ${i + 1}`;
      expect(s.overflow, at).toBe(0);
      expect(pages[i]!.overflowPx, at).toBe(0);
      expect(s.headerTop, at).toBeCloseTo(48, 0);
      expect(s.footerBottom, at).toBeCloseTo(48, 0);
      for (const d of s.notesBelowFooter) expect(d, at).toBeLessThanOrEqual(0.5);
      expect(s.notesMismatch, at).toEqual([]);
      expect(s.covered, at).toEqual([]);
      expect(s.regionNotes, at).toBe(0);
      for (const d of s.notesAboveBody) expect(d, at).toBeLessThanOrEqual(0.5);
    });

    // Reading order of the body text across everything.
    const found = sheets.map((s) => s.body).join('\n').match(WORD) ?? [];
    expect(found.length).toBeGreaterThan(2500);
    expect(found).toEqual(Array.from({ length: found.length }, (_, i) => `W${String(i + 1).padStart(4, '0')}`));

    // Running header: the chapter heading on the page, else the last one.
    let chapter = 'Front';
    for (const [i, s] of sheets.entries()) {
      expect(s.run, `page ${i + 1}`).toBe(s.h1[0] ?? chapter);
      chapter = s.h1.at(-1) ?? chapter;
    }

    // Footers: roman front matter, then "<chapter>-<n> of <chapter>-<last>".
    const labels = sheets.map((s) => s.footer!.replace(/^Page /, ''));
    expect(labels[0]).toMatch(/^i of /);
    const chapterOf = (label: string) => /^(\d+)-(\d+) of (\d+)-(\d+)$/.exec(label);
    for (const label of labels.slice(1)) {
      const m = chapterOf(label);
      if (!m) continue;
      expect(m[1]).toBe(m[3]);
      expect(Number(m[2])).toBeLessThanOrEqual(Number(m[4]));
    }
    expect(labels.filter((l) => l.startsWith('2-')).length).toBeGreaterThanOrEqual(2);

    // Feature presence.
    expect(sheets.some((s) => s.regions >= 2)).toBe(true);
    expect(sheets.filter((s) => s.landscape).length).toBeGreaterThanOrEqual(2);
    expect(sheets.filter((s) => !s.landscape && s.h1.length + s.body.length > 0 && s.lineNumbers > 0).length).toBeGreaterThan(3);
    for (const s of sheets.filter((x) => x.landscape)) expect(s.lineNumbers).toBe(0);

    const refs = await page.evaluate(() => ({
      toc: Array.from(document.querySelectorAll('.hp-pages nav:not([data-hp-toc="Figure"]) .hp-toc-entry'), (e) => {
        const target = document.querySelector(`.hp-pages ${e.querySelector('a')!.getAttribute('href')}`)!;
        return [e.querySelector('.hp-toc-page')!.textContent, target.closest('.hp-page')!.querySelector('.hp-footer')!.textContent!.replace(/^Page (\S+) of .*/, '$1')];
      }),
      ref: document.querySelector('.hp-pages #ref')!.textContent,
    }));
    for (const [shown, actual] of refs.toc) expect(shown).toBe(actual);
    expect(refs.ref).toBe('2-1');

    const pdf = await readPdf(await printPdf(page));
    expect(pdf).toHaveLength(pages.length);
    pdf.forEach((sheet, i) => {
      expect(sheet.text, `sheet ${i + 1}`).toContain('DRAFT');
      expect(sheet.widthIn > sheet.heightIn, `sheet ${i + 1}`).toBe(sheets[i]!.landscape);
    });
    expect(new Set(pdf.flatMap((s) => s.text.match(WORD) ?? [])).size).toBe(found.length);
  });
});
