import { describe, expect, it } from 'vitest';
import { distribute } from '../src/distribute';

/** Distribute plain number-items where the item itself is its height. */
function run(heights: number[], pageHeight: number | ((page: number) => number)) {
  return distribute({
    items: heights,
    measure: (h) => h,
    pageHeight: typeof pageHeight === 'number' ? () => pageHeight : pageHeight,
  });
}

function layout(pages: ReturnType<typeof run>): number[][] {
  return pages.map((p) => p.items);
}

describe('distribute', () => {
  it('matches the spec example: 50 20 40 10 50 40 60 @ 60', () => {
    const pages = run([50, 20, 40, 10, 50, 40, 60], 60);
    expect(layout(pages)).toEqual([[50], [20, 40], [10, 50], [40], [60]]);
  });

  it('returns no pages for empty input', () => {
    expect(run([], 60)).toEqual([]);
  });

  it('fills a page exactly to its boundary', () => {
    const pages = run([30, 30], 60);
    expect(layout(pages)).toEqual([[30, 30]]);
    expect(pages[0]?.usedHeight).toBe(60);
  });

  it('preserves order (never backfills gaps)', () => {
    // 10 would fit page 1's remaining 10, but comes after 55 → page 3.
    const pages = run([50, 55, 10], 60);
    expect(layout(pages)).toEqual([[50], [55], [10]]);
  });

  it('supports zero-height items', () => {
    const pages = run([0, 60, 0], 60);
    expect(layout(pages)).toEqual([[0, 60, 0]]);
  });

  it('supports per-page heights (different header/footer per page)', () => {
    // Page 1 has a large cover header (body 40), other pages body 100.
    const pages = run([30, 30, 30, 30], (page) => (page === 1 ? 40 : 100));
    expect(layout(pages)).toEqual([[30], [30, 30, 30]]);
    expect(pages[0]?.availableHeight).toBe(40);
    expect(pages[1]?.availableHeight).toBe(100);
  });

  describe('oversized items (taller than an empty page)', () => {
    it('places the item alone and marks the page as overflowing', () => {
      const pages = run([100], 60);
      expect(layout(pages)).toEqual([[100]]);
      expect(pages[0]?.overflows).toBe(true);
    });

    it('does not place following items on an overflowing page', () => {
      const pages = run([100, 10], 60);
      expect(layout(pages)).toEqual([[100], [10]]);
      expect(pages[0]?.overflows).toBe(true);
      expect(pages[1]?.overflows).toBe(false);
    });

    it('handles consecutive oversized items', () => {
      const pages = run([100, 200], 60);
      expect(layout(pages)).toEqual([[100], [200]]);
      expect(pages.every((p) => p.overflows)).toBe(true);
    });

    it('oversized relative to the current page config only', () => {
      // 80 overflows page 1 (60) but fits page 2 (100) → no overflow.
      const pages = run([80], (page) => (page === 1 ? 60 : 100));
      expect(layout(pages)).toEqual([[80]]);
      expect(pages[0]?.overflows).toBe(true);
    });
  });

  describe('validation', () => {
    it('rejects non-positive page heights', () => {
      expect(() => run([10], 0)).toThrow(/pageHeight/);
      expect(() => run([10], -5)).toThrow(/pageHeight/);
      expect(() => run([10], () => NaN)).toThrow(/pageHeight/);
    });

    it('rejects invalid measurements', () => {
      expect(() => run([-1], 60)).toThrow(/measure/);
      expect(() => run([NaN], 60)).toThrow(/measure/);
      expect(() => run([Infinity], 60)).toThrow(/measure/);
    });
  });

  it('reports page numbers and used heights', () => {
    const pages = run([50, 20, 40], 60);
    expect(pages.map((p) => p.page)).toEqual([1, 2]);
    expect(pages.map((p) => p.usedHeight)).toEqual([50, 60]);
  });

  it('works with arbitrary item types', () => {
    const items = [
      { id: 'a', h: 50 },
      { id: 'b', h: 20 },
      { id: 'c', h: 40 },
    ];
    const pages = distribute({
      items,
      measure: (i) => i.h,
      pageHeight: () => 60,
    });
    expect(pages.map((p) => p.items.map((i) => i.id))).toEqual([['a'], ['b', 'c']]);
  });
});
