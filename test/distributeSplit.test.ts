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
}

function measure(item: Item): number {
  if (item.kids) return item.kids.reduce((sum, k) => sum + measure(k), 0) + (item.pad ?? 0);
  return item.h ?? 0;
}

function run(items: Item[], pageHeight: number) {
  return distribute<Item>({
    items,
    measure,
    pageHeight: () => pageHeight,
    breakBehavior: (i) => i.behavior ?? (i.kids ? 'auto' : 'avoid'),
    children: (i) => i.kids ?? [],
    wrap: (i, kids, info) => ({ ...i, kids, continuation: info.continuation }),
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
