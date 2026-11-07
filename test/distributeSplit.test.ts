import { describe, expect, it } from 'vitest';
import { distribute } from '../src/distribute';
import type { BreakBehavior } from '../src/types';

/**
 * Test item model:
 * - leaf: { h: number }
 * - container: { kids: Item[], behavior?, pad? } — height = sum of kids + pad
 */
interface Item {
  name?: string;
  h?: number;
  kids?: Item[];
  behavior?: BreakBehavior;
  pad?: number;
  continuation?: boolean;
  /** Forced page break before this item. */
  brk?: boolean;
  /** Keep with next. */
  keep?: boolean;
  /** Section started by this item. */
  section?: string;
}

function measure(item: Item): number {
  if (item.kids) return item.kids.reduce((sum, k) => sum + measure(k), 0) + (item.pad ?? 0);
  return item.h ?? 0;
}

function run(items: Item[], pageHeight: number | ((page: number) => number)) {
  return distribute<Item>({
    items,
    measure,
    pageHeight: typeof pageHeight === 'number' ? () => pageHeight : pageHeight,
    breakBehavior: (i) => i.behavior ?? (i.kids ? 'auto' : 'avoid'),
    children: (i) => i.kids ?? [],
    wrap: (i, kids, info) => ({ ...i, kids, continuation: info.continuation }),
    pageBreakBefore: (i) => i.brk === true,
    keepWithNext: (i) => i.keep === true,
  });
}

/** Flatten a page to leaf heights for easy assertions. */
function leaves(item: Item): number[] {
  if (item.kids) return item.kids.flatMap(leaves);
  return [item.h ?? 0];
}

function pageLeaves(pages: ReturnType<typeof run>): number[][] {
  return pages.map((p) => p.items.flatMap(leaves));
}

describe('distribute with splitting', () => {
  it('splits an auto container at child boundaries', () => {
    // Page 60: leaf 25 + container [20,20,20] → 25+20 | 20+20
    const pages = run([{ h: 25 }, { kids: [{ h: 20 }, { h: 20 }, { h: 20 }] }], 60);
    expect(pageLeaves(pages)).toEqual([
      [25, 20],
      [20, 20],
    ]);
  });

  it('marks tail fragments as continuations', () => {
    const pages = run([{ h: 25 }, { kids: [{ h: 20 }, { h: 20 }, { h: 20 }] }], 60);
    const headFragment = pages[0]?.items[1];
    const tailFragment = pages[1]?.items[0];
    expect(headFragment?.continuation).toBe(false);
    expect(tailFragment?.continuation).toBe(true);
  });

  it('moves avoid containers whole', () => {
    const pages = run(
      [{ h: 25 }, { behavior: 'avoid', kids: [{ h: 20 }, { h: 20 }] }],
      60,
    );
    expect(pageLeaves(pages)).toEqual([[25], [20, 20]]);
  });

  it('splits nested auto containers recursively', () => {
    // Page 40: container[ sub[30, 30], 30 ] → 30 | 30 | 30
    const pages = run([{ kids: [{ kids: [{ h: 30 }, { h: 30 }] }, { h: 30 }] }], 40);
    expect(pageLeaves(pages)).toEqual([[30], [30], [30]]);
  });

  it('accounts for container padding overhead when splitting', () => {
    // Container pad 10; page 50. Each fragment carries the pad:
    // [20,20] = 50 fits; adding another 20 would be 70.
    const pages = run([{ pad: 10, kids: [{ h: 20 }, { h: 20 }, { h: 20 }] }], 50);
    expect(pageLeaves(pages)).toEqual([
      [20, 20],
      [20],
    ]);
  });

  it('splits a container that no longer fits mid-page (retry on fresh page)', () => {
    // Page 60: leaf 50 leaves 10 remaining; container [40, 40] cannot start
    // there (40 > 10) → fresh page, then splits 40 | 40.
    const pages = run([{ h: 50 }, { kids: [{ h: 40 }, { h: 40 }] }], 60);
    expect(pageLeaves(pages)).toEqual([[50], [40], [40]]);
  });

  it('force-splits around an oversized atomic child', () => {
    // Page 60: container [100, 20]. 100 can never fit → overflows alone,
    // 20 continues on the next page.
    const pages = run([{ kids: [{ h: 100 }, { h: 20 }] }], 60);
    expect(pageLeaves(pages)).toEqual([[100], [20]]);
    expect(pages[0]?.overflows).toBe(true);
    expect(pages[1]?.overflows).toBe(false);
  });

  it('force-splits through nested containers', () => {
    // Page 60: container[ sub[100, 10], 10 ]
    const pages = run([{ kids: [{ kids: [{ h: 100 }, { h: 10 }] }, { h: 10 }] }], 60);
    expect(pageLeaves(pages)).toEqual([[100], [10, 10]]);
    expect(pages[0]?.overflows).toBe(true);
  });

  it('keeps avoid children of a splitting auto parent intact', () => {
    // Page 60: container[ 30, avoid[20,20], 30 ]. The avoid block (40) does
    // not fit after 30 (70 > 60) so it moves whole to page 2.
    const pages = run(
      [{ kids: [{ h: 30 }, { behavior: 'avoid', kids: [{ h: 20 }, { h: 20 }] }, { h: 30 }] }],
      60,
    );
    expect(pageLeaves(pages)).toEqual([[30], [20, 20], [30]]);
    // The avoid block itself was not split: one wrapper containing one child
    // (the intact avoid container with both leaves).
    const page2Wrapper = pages[1]?.items[0];
    expect(page2Wrapper?.kids).toHaveLength(1);
    expect(page2Wrapper?.kids?.[0]?.behavior).toBe('avoid');
    expect(page2Wrapper?.kids?.[0]?.kids).toHaveLength(2);
  });

  it('without split hooks, items stay atomic (legacy behavior)', () => {
    const pages = distribute<Item>({
      items: [{ h: 25 }, { kids: [{ h: 20 }, { h: 20 }, { h: 20 }] }],
      measure,
      pageHeight: () => 60,
    });
    expect(pageLeaves(pages)).toEqual([[25], [20, 20, 20]]);
  });
});

describe('distribute with splitting: edge cases', () => {
  it('sizes each fragment to its own page height', () => {
    // Page 1 body 30 (cover header), later pages 60.
    const leaves20 = Array.from({ length: 5 }, () => ({ h: 20 }));
    const pages = run([{ kids: leaves20 }], (page) => (page === 1 ? 30 : 60));
    expect(pageLeaves(pages)).toEqual([[20], [20, 20, 20], [20]]);
  });

  it('fills a page exactly with a split head', () => {
    const pages = run([{ h: 20 }, { kids: [{ h: 20 }, { h: 20 }, { h: 20 }] }], 60);
    expect(pageLeaves(pages)).toEqual([[20, 20, 20], [20]]);
    expect(pages[0]?.usedHeight).toBe(60);
  });

  it('force-splits when the oversized child is the last one (no tail)', () => {
    const pages = run([{ kids: [{ h: 10 }, { h: 100 }] }], 60);
    expect(pageLeaves(pages)).toEqual([[10], [100]]);
    expect(pages.map((p) => p.overflows)).toEqual([false, true]);
  });

  it('starts the next item on a fresh page after a forced split', () => {
    const pages = run([{ kids: [{ h: 100 }] }, { h: 10 }], 60);
    expect(pageLeaves(pages)).toEqual([[100], [10]]);
  });

  it('treats an auto container without children as atomic', () => {
    const pages = run([{ h: 10 }, { kids: [], pad: 100 }], 60);
    expect(pages.map((p) => p.items.length)).toEqual([1, 1]);
    expect(pages[1]?.overflows).toBe(true);
  });

  it('keeps an oversized avoid container whole on its own page', () => {
    const pages = run(
      [{ h: 10 }, { behavior: 'avoid', kids: [{ h: 50 }, { h: 50 }] }, { h: 10 }],
      60,
    );
    expect(pageLeaves(pages)).toEqual([[10], [50, 50], [10]]);
    expect(pages.map((p) => p.overflows)).toEqual([false, true, false]);
  });

  it('treats clip like avoid when distributing', () => {
    const pages = run([{ h: 30 }, { behavior: 'clip', kids: [{ h: 20 }, { h: 20 }] }], 60);
    expect(pageLeaves(pages)).toEqual([[30], [20, 20]]);
  });

  it('marks only fragments after the first as continuations across many pages', () => {
    const kids = Array.from({ length: 4 }, () => ({ h: 50 }));
    const pages = run([{ kids }], 60);
    expect(pages.map((p) => p.items[0]?.continuation)).toEqual([false, true, true, true]);
  });

  it('calls pageHeight once per page, in order', () => {
    const calls: number[] = [];
    run([{ h: 50 }, { h: 50 }, { h: 50 }], (page) => {
      calls.push(page);
      return 60;
    });
    expect(calls).toEqual([1, 2, 3]);
  });
});

describe('distribute with a destructive wrap (DOM move semantics)', () => {
  /**
   * Mimics DOM wrapping: putting a child into a new fragment removes it from
   * its previous parent, so trial wraps can empty the original container.
   */
  function runDestructive(items: Item[], pageHeight: number) {
    const parent = new Map<Item, Item>();
    const adopt = (item: Item): void => {
      for (const kid of item.kids ?? []) {
        parent.set(kid, item);
        adopt(kid);
      }
    };
    items.forEach(adopt);

    return distribute<Item>({
      items,
      measure,
      pageHeight: () => pageHeight,
      breakBehavior: (i) => i.behavior ?? (i.kids ? 'auto' : 'avoid'),
      children: (i) => [...(i.kids ?? [])],
      wrap: (i, kids, info) => {
        const fragment: Item = { ...i, kids: [], continuation: info.continuation };
        for (const kid of kids) {
          const old = parent.get(kid);
          if (old?.kids) old.kids = old.kids.filter((k) => k !== kid);
          fragment.kids!.push(kid);
          parent.set(kid, fragment);
        }
        return fragment;
      },
    });
  }

  it('keeps all children when a container retries on a fresh page', () => {
    const pages = runDestructive([{ h: 50 }, { kids: [{ h: 40 }, { h: 40 }] }], 60);
    expect(pageLeaves(pages)).toEqual([[50], [40], [40]]);
  });

  it('keeps nested children when the boundary child is a container', () => {
    const pages = runDestructive([{ h: 50 }, { kids: [{ kids: [{ h: 40 }, { h: 40 }] }] }], 60);
    expect(pageLeaves(pages)).toEqual([[50], [40], [40]]);
  });

  it('keeps all children when a retry ends in a forced split', () => {
    const pages = runDestructive([{ h: 50 }, { kids: [{ h: 100 }, { h: 20 }] }], 60);
    expect(pageLeaves(pages)).toEqual([[50], [100], [20]]);
    expect(pages[1]?.overflows).toBe(true);
  });

  it('keeps the retried fragment non-continued', () => {
    const pages = runDestructive([{ h: 50 }, { kids: [{ h: 40 }, { h: 40 }] }], 60);
    expect(pages.slice(1).map((p) => p.items[0]?.continuation)).toEqual([false, true]);
  });
});

describe('distribute with forced page breaks', () => {
  it('starts a new page before a breaking item', () => {
    const pages = run([{ h: 10 }, { h: 10, brk: true }, { h: 10 }], 60);
    expect(pageLeaves(pages)).toEqual([[10], [10, 10]]);
  });

  it('never creates a blank first page', () => {
    const pages = run([{ h: 10, brk: true }, { h: 10 }], 60);
    expect(pageLeaves(pages)).toEqual([[10, 10]]);
  });

  it('does not add a blank page after an overflowing page', () => {
    const pages = run([{ h: 100 }, { h: 10, brk: true }], 60);
    expect(pageLeaves(pages)).toEqual([[100], [10]]);
  });

  it('honors consecutive breaks', () => {
    const pages = run([{ h: 10 }, { h: 10, brk: true }, { h: 10, brk: true }], 60);
    expect(pageLeaves(pages)).toEqual([[10], [10], [10]]);
  });

  it('splits a container that would fit at a nested break', () => {
    const pages = run([{ kids: [{ h: 10 }, { h: 10, brk: true }, { h: 10 }] }], 60);
    expect(pageLeaves(pages)).toEqual([[10], [10, 10]]);
    expect(pages.map((p) => p.items[0]?.continuation)).toEqual([false, true]);
  });

  it('splits through several levels to reach a deep break', () => {
    const pages = run([{ kids: [{ h: 10 }, { kids: [{ h: 10 }, { h: 10, brk: true }] }] }], 60);
    expect(pageLeaves(pages)).toEqual([[10, 10], [10]]);
  });

  it('treats a break on a first child as a break before its container', () => {
    const pages = run([{ h: 10 }, { kids: [{ h: 10, brk: true }, { h: 10 }] }], 60);
    expect(pageLeaves(pages)).toEqual([[10], [10, 10]]);
    // Moved whole: one unsplit fragment.
    expect(pages[1]?.items[0]?.continuation).toBeUndefined();
  });

  it('ignores breaks inside avoid containers', () => {
    const pages = run([{ h: 10 }, { behavior: 'avoid', kids: [{ h: 10 }, { h: 10, brk: true }] }], 60);
    expect(pageLeaves(pages)).toEqual([[10, 10, 10]]);
  });

  it('combines fit splits and forced breaks', () => {
    const pages = run([{ kids: [{ h: 30 }, { h: 30 }, { h: 30 }, { h: 10, brk: true }] }], 60);
    expect(pageLeaves(pages)).toEqual([[30, 30], [30], [10]]);
  });

  it('does not double-break when a split tail starts with a break', () => {
    // Head [30, 30] fills page 1; the tail begins with the breaking child.
    const pages = run([{ kids: [{ h: 30 }, { h: 30 }, { h: 10, brk: true }] }], 60);
    expect(pageLeaves(pages)).toEqual([[30, 30], [10]]);
  });

  it('works with a destructive wrap', () => {
    const parent = new Map<Item, Item>();
    const root: Item = { kids: [{ h: 10 }, { kids: [{ h: 10 }, { h: 10, brk: true }, { h: 10 }] }] };
    const adopt = (i: Item): void => i.kids?.forEach((k) => (parent.set(k, i), adopt(k)));
    adopt(root);
    const pages = distribute<Item>({
      items: [root],
      measure,
      pageHeight: () => 60,
      breakBehavior: (i) => (i.kids ? 'auto' : 'avoid'),
      children: (i) => [...(i.kids ?? [])],
      wrap: (i, kids, info) => {
        const fragment: Item = { ...i, kids: [], continuation: info.continuation };
        for (const kid of kids) {
          const old = parent.get(kid);
          if (old?.kids) old.kids = old.kids.filter((k) => k !== kid);
          fragment.kids!.push(kid);
          parent.set(kid, fragment);
        }
        return fragment;
      },
      pageBreakBefore: (i) => i.brk === true,
    });
    expect(pageLeaves(pages)).toEqual([[10, 10], [10, 10]]);
  });
});

describe('distribute with keep-with-next', () => {
  it('moves a kept item along with an atomic item that starts a new page', () => {
    const pages = run([{ h: 30 }, { h: 10, keep: true }, { h: 30 }], 60);
    expect(pageLeaves(pages)).toEqual([[30], [10, 30]]);
  });

  it('moves a chain of kept items together', () => {
    const pages = run([{ h: 20 }, { h: 10, keep: true }, { h: 10, keep: true }, { h: 30 }], 60);
    expect(pageLeaves(pages)).toEqual([[20], [10, 10, 30]]);
  });

  it('never empties a page to honor keep-with-next', () => {
    const pages = run([{ h: 10, keep: true }, { h: 60 }], 60);
    expect(pageLeaves(pages)).toEqual([[10], [60]]);
  });

  it('keeps the item in place when the next one starts on the same page', () => {
    // The container's head fits after the kept item.
    const pages = run([{ h: 30 }, { h: 10, keep: true }, { kids: [{ h: 10 }, { h: 10 }, { h: 30 }] }], 60);
    expect(pageLeaves(pages)).toEqual([[30, 10, 10, 10], [30]]);
  });

  it('moves along when a container retries on a fresh page', () => {
    const pages = run([{ h: 30 }, { h: 10, keep: true }, { kids: [{ h: 30 }, { h: 30 }] }], 60);
    expect(pageLeaves(pages)).toEqual([[30], [10, 30], [30]]);
  });

  it('moves a kept child from the end of a split head into the tail', () => {
    const pages = run([{ kids: [{ h: 30 }, { h: 10, keep: true }, { h: 30 }] }], 60);
    expect(pageLeaves(pages)).toEqual([[30], [10, 30]]);
  });

  it('does not move a kept child before a forced break', () => {
    const pages = run([{ kids: [{ h: 30 }, { h: 10, keep: true }, { h: 10, brk: true }] }], 60);
    expect(pageLeaves(pages)).toEqual([[30, 10], [10]]);
  });

  it('moves a container whose head would be only kept children to the next page', () => {
    // [heading 10 (keep), 50] after 45: the heading alone would fit, but
    // stranding it is worse than moving the container (the page holds 45).
    const pages = run([{ h: 45 }, { kids: [{ h: 10, keep: true }, { h: 50 }] }], 60);
    expect(pageLeaves(pages)).toEqual([[45], [10, 50]]);
  });

  it('keeps a lone kept head where moving on cannot help (empty full page)', () => {
    const pages = run([{ kids: [{ h: 10, keep: true }, { h: 60 }] }], 60);
    expect(pageLeaves(pages)).toEqual([[10], [60]]);
  });

  it('may empty a partial page to keep items together', () => {
    const pages = distribute<Item>({
      items: [{ h: 50 }, { h: 10, keep: true, brk: true }, { h: 30 }],
      measure,
      pageHeight: (page) => (page === 2 ? 25 : 60),
      breakBehavior: () => 'avoid',
      pageBreakBefore: (i) => i.brk === true,
      keepWithNext: (i) => i.keep === true,
      partial: (page) => page === 2,
    });
    expect(pageLeaves(pages)).toEqual([[50], [], [10, 30]]);
  });

  it('does not strand the last item of the document', () => {
    const pages = run([{ h: 30 }, { h: 10, keep: true }], 60);
    expect(pageLeaves(pages)).toEqual([[30, 10]]);
  });
});

describe('distribute with sections', () => {
  function runSections(items: Item[], pageHeight = 60, blank?: (s: string, page: number) => boolean) {
    const slots: string[] = [];
    const pages = distribute<Item>({
      items,
      measure,
      pageHeight: (page, slot) => {
        slots.push(`${page}:${slot.section ?? '-'}:${slot.sectionStart ? 'start' : ''}${slot.blank ? 'blank' : ''}`);
        return pageHeight;
      },
      breakBehavior: (i) => i.behavior ?? (i.kids ? 'auto' : 'avoid'),
      children: (i) => i.kids ?? [],
      wrap: (i, kids, info) => ({ ...i, kids, continuation: info.continuation }),
      // Continuation fragments never restart their section.
      section: (i) => (i.continuation ? undefined : i.section),
      blankPageBefore: blank,
    });
    return { pages, slots };
  }

  it('starts a section on a new page and tags pages', () => {
    const { pages, slots } = runSections([{ h: 10 }, { h: 10, section: 'b' }, { h: 10 }]);
    expect(pageLeaves(pages)).toEqual([[10], [10, 10]]);
    expect(pages.map((p) => [p.section, p.sectionStart])).toEqual([
      [undefined, false],
      ['b', true],
    ]);
    expect(slots).toEqual(['1:-:', '2:b:start']);
  });

  it('starts a section on the first page without a blank page', () => {
    const { pages } = runSections([{ h: 10, section: 'a' }, { h: 10 }]);
    expect(pages.map((p) => [p.section, p.sectionStart])).toEqual([['a', true]]);
  });

  it('keeps continuation pages of a split section element in that section', () => {
    const { pages } = runSections([{ section: 'a', kids: [{ h: 30 }, { h: 30 }, { h: 30 }] }]);
    expect(pageLeaves(pages)).toEqual([[30, 30], [30]]);
    expect(pages.map((p) => [p.section, p.sectionStart])).toEqual([
      ['a', true],
      ['a', false],
    ]);
  });

  it('starts a section nested inside a container', () => {
    const { pages } = runSections([{ kids: [{ h: 10 }, { h: 10, section: 'b' }] }]);
    expect(pageLeaves(pages)).toEqual([[10], [10]]);
    expect(pages.map((p) => p.section)).toEqual([undefined, 'b']);
  });

  it('inserts a blank page before a section when asked', () => {
    const { pages, slots } = runSections(
      [{ h: 10 }, { h: 10, section: 'ch' }],
      60,
      (_s, page) => page % 2 === 0, // start sections on odd pages
    );
    expect(pageLeaves(pages)).toEqual([[10], [], [10]]);
    expect(pages.map((p) => p.blank === true)).toEqual([false, true, false]);
    expect(slots).toEqual(['1:-:', '2:-:blank', '3:ch:start']);
  });

  it('starts a new section instance each time the same name appears', () => {
    const { pages } = runSections([{ h: 10, section: 'ch' }, { h: 10, section: 'ch' }]);
    expect(pages.map((p) => [p.section, p.sectionStart])).toEqual([
      ['ch', true],
      ['ch', true],
    ]);
  });
});
