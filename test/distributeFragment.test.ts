import { describe, expect, it } from 'vitest';
import { distribute } from '../src/distribute';
import type { BreakBehavior } from '../src/types';

/** A paragraph of `lines` 10px lines, or a container of children. */
interface Node {
  name: string;
  lines?: number;
  kids?: Node[];
  avoid?: boolean;
  keep?: boolean;
}

const height = (n: Node): number =>
  n.kids ? n.kids.reduce((sum, k) => sum + height(k), 0) : (n.lines ?? 0) * 10;

/** Line splitter with orphans/widows of 2, like the DOM one. */
const fragment = (n: Node, fits: (head: Node) => boolean) => {
  const lines = n.lines ?? 0;
  let best = 0;
  for (let k = 2; k <= lines - 2; k++) {
    if (fits({ name: n.name, lines: k })) best = k;
  }
  return best === 0
    ? null
    : { head: { name: n.name, lines: best }, tail: { name: `${n.name}+`, lines: lines - best } };
};

const run = (items: Node[], pageHeight = 100, withFragment = true) =>
  distribute<Node>({
    items,
    measure: height,
    pageHeight: () => pageHeight,
    breakBehavior: (n): BreakBehavior => (n.avoid ? 'avoid' : 'auto'),
    children: (n) => n.kids ?? [],
    wrap: (n, kids) => ({ ...n, kids }),
    keepWithNext: (n) => n.keep === true,
    fragment: withFragment ? fragment : undefined,
  }).map((p) =>
    p.items.map((n) => (n.kids ? `${n.name}[${n.kids.map((k) => `${k.name}:${k.lines}`).join(',')}]` : `${n.name}:${n.lines}`)),
  );

describe('distribute: fragment hook (paragraph lines)', () => {
  it('splits a paragraph to fill the page', () => {
    expect(run([{ name: 'a', lines: 6 }, { name: 'p', lines: 10 }])).toEqual([
      ['a:6', 'p:4'],
      ['p+:6'],
    ]);
  });

  it('moves the paragraph whole when no valid head fits (orphans)', () => {
    expect(run([{ name: 'a', lines: 9 }, { name: 'p', lines: 10 }])).toEqual([['a:9'], ['p:10']]);
  });

  it('splits a paragraph across several pages', () => {
    expect(run([{ name: 'p', lines: 25 }])).toEqual([['p:10'], ['p+:10'], ['p++:5']]);
  });

  it('does not split avoid paragraphs', () => {
    expect(run([{ name: 'a', lines: 6 }, { name: 'p', lines: 10, avoid: true }])).toEqual([
      ['a:6'],
      ['p:10'],
    ]);
  });

  it('splits a paragraph at the boundary inside a container', () => {
    const section: Node = { name: 's', kids: [{ name: 'a', lines: 6 }, { name: 'p', lines: 10 }] };
    expect(run([section])).toEqual([['s[a:6,p:4]'], ['s[p+:6]']]);
  });

  it('keeps a heading with the head of a split paragraph', () => {
    expect(
      run([{ name: 'a', lines: 5 }, { name: 'h', lines: 1, keep: true }, { name: 'p', lines: 10 }]),
    ).toEqual([['a:5', 'h:1', 'p:4'], ['p+:6']]);
  });

  it('without the hook, paragraphs stay atomic', () => {
    expect(run([{ name: 'a', lines: 6 }, { name: 'p', lines: 10 }], 100, false)).toEqual([
      ['a:6'],
      ['p:10'],
    ]);
  });
});
