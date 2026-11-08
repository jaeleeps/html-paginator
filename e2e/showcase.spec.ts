import { expect, test } from '@playwright/test';
import { inspectPages, openPaginated, printPdf, readPdf } from './helpers';

test.describe('showcase example', () => {
  test('paginates the book shown in the README', async ({ page }) => {
    const errors = await openPaginated(page, 'examples/showcase.html');
    expect(errors).toEqual([]);

    const pages = await inspectPages(page);
    for (const p of pages) {
      expect(p).toMatchObject({ widthIn: 5.83, heightIn: 8.27, overflowPx: 0 });
      // Mirror margins: the inside margin (16mm + 4mm gutter) is at the spine.
      const [inside, outside] = p.page % 2 ? [p.bodyLeftIn, p.bodyRightIn] : [p.bodyRightIn, p.bodyLeftIn];
      expect(inside).toBeCloseTo(0.79, 1);
      expect(outside).toBeCloseTo(0.55, 1);
    }

    // Front matter in roman numerals, then chapters from 1 on right-hand pages.
    expect(pages.map((p) => p.footer)).toEqual(['', '', 'i', 'ii', '1', '2', '3', '4', '5', '6', '7']);
    expect(pages[4]!.text).toMatch(/^1\. Paper/);
    expect(pages[6]!.text).toMatch(/^2\. Type/);
    expect(pages[8]!.text).toMatch(/^3\. The Page Break/);
    // Chapter openers have no header; other pages show it on the outside.
    expect(pages[4]!.header).toBe('');
    expect(pages[5]!.header).toBe('On the Printed Page');
    // The continuous column sections are linked to the chapter's headers.
    expect(pages[7]!.header).toBe('On the Printed Page');

    // Contents and index carry real page numbers.
    expect(pages[2]!.text).toMatch(/1\. Paper\D+1\s+2\. Type\D+3\s+3\. The Page Break\D+5/);
    const index = pages.at(-1)!.text;
    expect(index).toMatch(/Footnotes, 5/);
    expect(index).not.toContain('000');

    const pdf = await readPdf(await printPdf(page));
    expect(pdf).toHaveLength(pages.length);
  });
});
