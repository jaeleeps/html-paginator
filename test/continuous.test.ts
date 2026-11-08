import { afterEach, describe, expect, it } from 'vitest';
import { createPaginator, parseDeclarativeConfig } from '../src/index';
import type { MeasureAdapter } from '../src/index';
import { distribute } from '../src/distribute';
import type { PageSlot } from '../src/distribute';
import { createPageLayout } from '../src/layout';
import { createSheetPlanner } from '../src/sheets';

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

const measurer = (height = 200): MeasureAdapter => ({
  measure: (el) => Number(el.getAttribute('data-h') ?? 0),
  pageHeight: () => height,
});

const texts = (el: Element | null | undefined): string[] =>
  Array.from(el?.querySelectorAll('p') ?? [], (p) => p.textContent ?? '');

/** Each region of a page: the texts of its columns (one column when not split). */
const regions = (page: HTMLElement): string[][][] =>
  Array.from(page.querySelectorAll('.hp-region'), (region) => {
    const columns = region.querySelectorAll('.hp-column');
    return columns.length > 0 ? Array.from(columns, texts) : [texts(region)];
  });

describe('distribute: partial pages', () => {
  it('moves an item that does not fit an empty partial page on, without overflow', () => {
    const slots: PageSlot[] = [];
    const pages = distribute<number>({
      items: [30, 50, 20],
      measure: (h) => h,
      pageHeight: (page, slot) => {
        slots.push(slot);
        return page === 2 ? 40 : 100;
      },
      // A forced break before 50, onto the short page 2.
      pageBreakBefore: (h) => h === 50,
      partial: (page) => page === 2,
    });
    expect(pages.map((p) => p.items)).toEqual([[30], [], [50, 20]]);
    expect(pages.some((p) => p.overflows)).toBe(false);
  });

  it('does not start a section again when moving on from an empty partial page', () => {
    const slots: PageSlot[] = [];
    const pages = distribute<number>({
      items: [30, 50, 20],
      measure: (h) => h,
      pageHeight: (page, slot) => {
        slots.push(slot);
        return page === 2 ? 40 : 100;
      },
      section: (h) => (h === 50 ? 'b' : undefined),
      partial: (page) => page === 2,
    });
    expect(pages.map((p) => p.items)).toEqual([[30], [], [50, 20]]);
    expect(slots.map((s) => [s.section, s.sectionStart])).toEqual([
      [undefined, false],
      ['b', true],
      ['b', false],
    ]);
  });

  it('still overflows a full (not partial) empty page', () => {
    const opened: number[] = [];
    const pages = distribute<number>({
      items: [150],
      measure: (h) => h,
      pageHeight: () => 100,
      partial: () => false,
      opened: (page) => opened.push(page.page),
    });
    expect(pages[0]!.overflows).toBe(true);
    expect(opened).toEqual([1]);
  });
});

describe('continuous sections', () => {
  const src = (markup: string) => {
    document.body.innerHTML = `<div id="src">${markup}</div>`;
  };
  // The stub measures only data-h, so sections start on their first paragraph.
  const paras = (prefix: string, n: number, h = 20, section?: string) =>
    Array.from(
      { length: n },
      (_, i) => `<p data-h="${h}"${i === 0 && section ? ` data-section="${section}"` : ''}>${prefix}${i + 1}</p>`,
    ).join('');

  it('starts on the same page below the previous section, balancing columns before the break', () => {
    src(`<p data-h="30">intro</p>
      ${paras('c', 6, 20, 'cols')}
      <p data-h="20" data-section="end">end</p>`);
    const { pages } = createPaginator({
      source: '#src',
      measurer: measurer(),
      sections: {
        cols: { start: 'continuous', page: { columns: 2, columnRule: '1px solid' } },
        end: { start: 'continuous' },
      },
    }).paginate();

    expect(pages).toHaveLength(1);
    // Greedy filling would put all six in the first column (120 <= 170);
    // balanced, the columns are 3 + 3.
    expect(regions(pages[0]!)).toEqual([
      [['intro']],
      [['c1', 'c2', 'c3'], ['c4', 'c5', 'c6']],
      [['end']],
    ]);
    const [first, middle, last] = Array.from(pages[0]!.querySelectorAll<HTMLElement>('.hp-region'));
    expect(first!.style.flex).toBe('0 0 auto');
    expect(middle!.style.flex).toBe('0 0 auto');
    expect(last!.style.flex).toBe('1 1 auto');
    expect(middle!.querySelectorAll('.hp-column-rule')).toHaveLength(1);
  });

  it('flows a continuous multi-column section on over the following pages', () => {
    src(`<p data-h="100">intro</p>${paras('c', 12, 40, 'cols')}`);
    const { pages } = createPaginator({
      source: '#src',
      measurer: measurer(),
      sections: { cols: { start: 'continuous', page: { columns: 2 } } },
    }).paginate();
    // Page 1: 100px left below the intro (2 + 2 items); page 2: full columns
    // (5 + 3 items, not balanced at the end of the document, as in Word).
    expect(regions(pages[0]!)).toEqual([[['intro']], [['c1', 'c2'], ['c3', 'c4']]]);
    expect(pages[1]!.querySelector('.hp-region')).toBeNull();
    expect(Array.from(pages[1]!.querySelectorAll('.hp-column'), texts)).toEqual([
      ['c5', 'c6', 'c7', 'c8', 'c9'],
      ['c10', 'c11', 'c12'],
    ]);
  });

  it('moves to a new page when too little room is left, or the first item does not fit', () => {
    src(`<p data-h="180">intro</p><p data-h="20" data-section="a">a</p>`);
    const tight = createPaginator({
      source: '#src',
      measurer: measurer(),
      sections: { a: { start: 'continuous' } },
    }).paginate().pages;
    expect(tight.map((p) => texts(p))).toEqual([['intro'], ['a']]);

    src(`<p data-h="100">intro</p><p data-h="150" data-section="a">big</p>`);
    const big = createPaginator({
      source: '#src',
      measurer: measurer(),
      sections: { a: { start: 'continuous' } },
    }).paginate().pages;
    expect(big.map((p) => texts(p))).toEqual([['intro'], ['big']]);
    expect(big[0]!.querySelector<HTMLElement>('.hp-body')!.style.overflow).toBe('');
  });

  it('puts the new section in effect from the next page (header, footer, numbering)', () => {
    src(`<p data-h="100">intro</p>${paras('b', 8, 20, 'b')}`);
    const { pages } = createPaginator({
      source: '#src',
      measurer: measurer(),
      page: { footer: ({ section, sectionPage }) => `${section ?? '-'} ${sectionPage}` },
      sections: { b: { start: 'continuous' } },
    }).paginate();
    expect(pages).toHaveLength(2);
    expect(pages.map((p) => p.querySelector('.hp-footer')!.textContent)).toEqual(['- 1', 'b 1']);
  });

  it('balances columns holding footnotes, each note in its reference\'s column', () => {
    // A footnote area is 10px per note.
    const withNotes: MeasureAdapter = {
      measure: (el) =>
        el.classList.contains('hp-footnotes')
          ? 10 * el.querySelectorAll('.hp-footnote').length
          : Number(el.getAttribute('data-h') ?? 0),
      pageHeight: () => 200,
    };
    src(`<p data-h="30">intro</p>
      ${paras('c', 3, 20, 'cols')}<p data-h="20">n<span data-footnote>note</span></p>
      <p data-h="20" data-section="end">end</p>`);
    const { pages } = createPaginator({
      source: '#src',
      measurer: withNotes,
      injectStyles: false,
      sections: { cols: { start: 'continuous', page: { columns: 2 } }, end: { start: 'continuous' } },
    }).paginate();
    const region = pages[0]!.querySelectorAll('.hp-region')[1]!;
    expect(Array.from(region.querySelectorAll('.hp-column-body'), texts)).toEqual([
      ['c1', 'c2'],
      ['c3', 'n1'],
    ]);
    const notes = Array.from(region.querySelectorAll('.hp-column'), (c) => c.querySelectorAll('.hp-footnote').length);
    expect(notes).toEqual([0, 1]);
  });

  it('leaves a region unbalanced when canBalance says no', () => {
    const run = (canBalance: boolean) => {
      const config = { sections: { cols: { page: { columns: 2 }, balanceColumns: true } } };
      const planner = createSheetPlanner<number>({
        layout: createPageLayout(config),
        config,
        bodyHeight: () => 100,
        balance: (items, height) => {
          const columns = distribute<number>({ items, measure: (h) => h, pageHeight: () => height });
          if (columns.length > 2) return null;
          return columns;
        },
        canBalance: () => canBalance,
      });
      distribute<number>({
        items: [20, 21, 22, 23],
        measure: (h) => h,
        section: (h) => (h === 20 ? 'cols' : undefined),
        pageHeight: (page, slot) => planner.pageHeight(page, slot),
        opened: (page) => planner.opened(page),
        partial: (page) => planner.partial(page),
      });
      planner.finish();
      const region = planner.regions[0]!;
      return (region.balanced ?? region.pages).map((page) => page.items.length);
    };
    expect(run(true)).toEqual([2, 2]);
    expect(run(false)).toEqual([4]);
  });

  it('balances the last page of a section with balanceColumns, at the end or before a new page', () => {
    src(`${paras('c', 14, 20, 'cols')}<p data-h="20" data-section="next">next</p>`);
    const run = (balanceColumns: boolean) =>
      createPaginator({
        source: '#src',
        measurer: measurer(),
        sections: { cols: { page: { columns: 2 }, balanceColumns }, next: {} },
      })
        .paginate()
        .pages.map((page) => Array.from(page.querySelectorAll('.hp-column'), (c) => texts(c).length));
    // Greedy: 10 + 4 on page 1. Balanced: 7 + 7. The next section is unaffected.
    expect(run(false)).toEqual([[10, 4], []]);
    expect(run(true)).toEqual([[7, 7], []]);

    src(paras('c', 14, 20, 'cols'));
    expect(run(true)).toEqual([[7, 7]]);
    // Only the last page of the section is balanced.
    src(paras('c', 25, 20, 'cols'));
    expect(run(true)).toEqual([[10, 10], [3, 2]]);
  });

  it('ends balanced columns, and the line between, with their content', () => {
    const regionFlex = (pages: HTMLElement[]) =>
      pages.map((page) => Array.from(page.querySelectorAll<HTMLElement>('.hp-region'), (r) => r.style.flex));
    const cols = { page: { columns: 2, columnRule: '1px solid' }, balanceColumns: true };
    // Alone on the page: the body is a grid whose row is as tall as the columns.
    src(paras('c', 6, 20, 'cols'));
    const body = createPaginator({ source: '#src', measurer: measurer(), sections: { cols } })
      .paginate()
      .pages[0]!.querySelector<HTMLElement>('.hp-body')!;
    expect(body.style).toMatchObject({ display: 'grid', alignContent: 'start' });
    expect(body.querySelectorAll(':scope > .hp-column')).toHaveLength(2);
    // Last region below a title: also its content's height, not the rest of the page.
    src(`<p data-h="30">title</p>${paras('c', 6, 20, 'cols')}`);
    const { pages } = createPaginator({
      source: '#src',
      measurer: measurer(),
      sections: { cols: { ...cols, start: 'continuous' } },
    }).paginate();
    expect(regionFlex(pages)).toEqual([['0 0 auto', '0 0 auto']]);
    expect(pages[0]!.querySelectorAll('.hp-column-rule')).toHaveLength(1);
  });

  it('is read from data-hp-section-start="continuous"', () => {
    document.body.innerHTML = `
      <template data-hp-config><div data-hp-section="cols" data-hp-section-start="continuous" data-hp-columns="2" data-hp-balance-columns></div></template>
      <div data-hp-content><p>a</p></div>`;
    expect(parseDeclarativeConfig(document)!.sections?.cols).toMatchObject({
      start: 'continuous',
      balanceColumns: true,
      page: { columns: 2 },
    });
  });
});
