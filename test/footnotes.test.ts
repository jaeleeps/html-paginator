import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFootnotes, createPaginator, distribute, NOTE_ATTRIBUTE } from '../src/index';
import type { BreakBehavior, MeasureAdapter } from '../src/index';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('distribute: notes', () => {
  /** Items: [name, height, notes]; the note area is 5 + 10 per note. */
  type Item = { name: string; h: number; notes?: string[]; kids?: Item[]; keep?: boolean };
  const run = (items: Item[], pageHeight = 100) =>
    distribute<Item>({
      items,
      measure: (i) => (i.kids ? i.kids.reduce((n, k) => n + k.h, 0) : i.h),
      pageHeight: () => pageHeight,
      breakBehavior: (): BreakBehavior => 'auto',
      children: (i) => i.kids ?? [],
      wrap: (i, kids) => ({ ...i, kids }),
      keepWithNext: (i) => i.keep === true,
      notes: (i) =>
        (i.kids ?? [i]).flatMap((k) => (k.notes ?? []).map((n) => ({ name: n, h: 0 }) as Item)),
      notesHeight: (notes) => 5 + 10 * notes.length,
    });
  const names = (pages: ReturnType<typeof run>) =>
    pages.map((p) => ({
      items: p.items.map((i) => (i.kids ? `${i.name}[${i.kids.map((k) => k.name)}]` : i.name)),
      notes: p.notes!.map((n) => n.name),
      notesHeight: p.notesHeight,
    }));

  it('counts the note area against the page', () => {
    // 60 + 20 fits 100, but with the note area (15) it does not.
    expect(names(run([{ name: 'a', h: 60 }, { name: 'b', h: 30, notes: ['1'] }]))).toEqual([
      { items: ['a'], notes: [], notesHeight: 0 },
      { items: ['b'], notes: ['1'], notesHeight: 15 },
    ]);
    expect(names(run([{ name: 'a', h: 60 }, { name: 'b', h: 25, notes: ['1'] }]))).toEqual([
      { items: ['a', 'b'], notes: ['1'], notesHeight: 15 },
    ]);
  });

  it('measures all notes of a page together', () => {
    const pages = run([
      { name: 'a', h: 20, notes: ['1'] },
      { name: 'b', h: 20, notes: ['2', '3'] },
      { name: 'c', h: 30, notes: ['4'] },
    ]);
    // a + b + c = 70, notes 5 + 40 = 45 > 30 left: c moves.
    expect(names(pages)).toEqual([
      { items: ['a', 'b'], notes: ['1', '2', '3'], notesHeight: 35 },
      { items: ['c'], notes: ['4'], notesHeight: 15 },
    ]);
  });

  it('splits a container so a reference stays with its note', () => {
    const section: Item = {
      name: 's',
      h: 0,
      kids: [
        { name: 'x', h: 40, notes: ['1'] },
        { name: 'y', h: 40, notes: ['2'] },
      ],
    };
    // x + y = 80 fits 100 alone, but not with two notes (25).
    expect(names(run([section]))).toEqual([
      { items: ['s[x]'], notes: ['1'], notesHeight: 15 },
      { items: ['s[y]'], notes: ['2'], notesHeight: 15 },
    ]);
  });

  it('takes notes back with kept items', () => {
    const pages = run([
      { name: 'a', h: 50 },
      { name: 'h', h: 10, notes: ['1'], keep: true },
      { name: 'b', h: 40 },
    ]);
    expect(names(pages)).toEqual([
      { items: ['a'], notes: [], notesHeight: 0 },
      { items: ['h', 'b'], notes: ['1'], notesHeight: 15 },
    ]);
  });

  it('marks overflow when an item and its notes exceed an empty page', () => {
    const [page] = run([{ name: 'a', h: 90, notes: ['1'] }]);
    expect(page!.overflows).toBe(true);
  });

  it('continues a long note on the next page (fragmentNote)', () => {
    /** Notes are 'name:lines', 10px per line; the area adds 5. */
    const lines = (n: Item) => Number(n.name.split(':')[1]);
    const pages = distribute<Item>({
      items: [
        { name: 'a', h: 50 },
        { name: 'b', h: 10, notes: ['n1:8'] },
        { name: 'c', h: 70 },
      ],
      measure: (i) => i.h,
      pageHeight: () => 100,
      notes: (i) => (i.notes ?? []).map((n) => ({ name: n, h: 0 })),
      notesHeight: (notes) => 5 + 10 * notes.reduce((sum, n) => sum + lines(n), 0),
      fragmentNote: (note, fits) => {
        const [name, total] = note.name.split(':');
        for (let k = Number(total) - 1; k >= 1; k--) {
          const head = { name: `${name}:${k}`, h: 0 };
          if (fits(head)) return { head, tail: { name: `${name}+:${Number(total) - k}`, h: 0 } };
        }
        return null;
      },
    });
    // Page 1: a + b = 60; 40 left → note head of 3 lines (35). The rest
    // (5 lines, 55) opens page 2's notes; c (70) does not fit 45 → page 3.
    expect(pages.map((p) => ({ items: p.items.map((i) => i.name), notes: p.notes!.map((n) => n.name) }))).toEqual([
      { items: ['a', 'b'], notes: ['n1:3'] },
      { items: [], notes: ['n1+:5'] },
      { items: ['c'], notes: [] },
    ]);
  });

  it('rejects invalid note heights', () => {
    expect(() =>
      distribute({
        items: [1],
        measure: () => 1,
        pageHeight: () => 10,
        notes: () => [2],
        notesHeight: () => NaN,
      }),
    ).toThrow(/notesHeight\(\) must return/);
  });
});

describe('createFootnotes', () => {
  it('turns data-footnote into numbered references and notes', () => {
    document.body.innerHTML = `<div id="root">
      <p id="p">Claim<span data-footnote id="fn-a">Source <i>A</i>.</span> and more<span data-footnote>B<span data-footnote>nested</span></span>.</p>
      <p id="q">None</p></div>`;
    const root = document.getElementById('root')!;
    const footnotes = createFootnotes(root)!;
    expect(footnotes.count).toBe(2);
    expect(root.querySelector('#p')!.textContent).toBe('Claim1 and more2.');
    expect(root.querySelectorAll(`sup[${NOTE_ATTRIBUTE}]`)).toHaveLength(2);

    const notes = footnotes.notesOf(root.querySelector('#p')!);
    expect(notes.map((n) => n.textContent)).toEqual(['1Source A.', '2Bnested']);
    expect(notes[0]!.id).toBe('fn-a');
    expect(notes[0]!.querySelector('i')).not.toBeNull();
    expect(footnotes.notesOf(root.querySelector('#q')!)).toEqual([]);

    const area = footnotes.area(notes);
    expect(Array.from(area.children, (c) => c.className)).toEqual([
      'hp-footnote-separator',
      'hp-footnote',
      'hp-footnote',
    ]);
    expect(area.children[1]).not.toBe(notes[0]); // copies
  });

  it('ignores empty reference copies left by line splits', () => {
    document.body.innerHTML = '<p id="p">x<span data-footnote>n</span></p>';
    const footnotes = createFootnotes(document.getElementById('p')!)!;
    const head = document.createElement('p');
    head.innerHTML = `x<sup ${NOTE_ATTRIBUTE}="1"></sup>`;
    expect(footnotes.notesOf(head)).toEqual([]);
  });

  it('returns null without footnotes', () => {
    document.body.innerHTML = '<p>plain</p>';
    expect(createFootnotes(document.body)).toBeNull();
  });
});

describe('createPaginator: footnotes', () => {
  const measurer = (): MeasureAdapter => ({
    measure: (el) =>
      el.classList.contains('hp-footnotes')
        ? 5 + 10 * el.querySelectorAll('.hp-footnote').length
        : Number(el.getAttribute('data-h') ?? 0),
    pageHeight: () => 100,
  });

  it('renders notes between body and footer of the page holding the reference', () => {
    document.body.innerHTML = `<div id="src">
      <p data-h="60">One</p>
      <p data-h="30">Two<span data-footnote>Note two</span></p>
      <h2 data-h="10">Three<span data-footnote>Heading note</span></h2><p data-h="10">After</p></div>`;
    const { pages } = createPaginator({
      source: '#src',
      measurer: measurer(),
      page: { footer: '<div>F</div>' },
    }).paginate();
    expect(pages).toHaveLength(2);
    expect(pages[0]!.querySelector('.hp-footnotes')).toBeNull();
    const parts = Array.from(pages[1]!.children, (c) => c.className);
    expect(parts).toEqual(['hp-body', 'hp-footnotes', 'hp-footer']);
    expect(Array.from(pages[1]!.querySelectorAll('.hp-footnote'), (n) => n.textContent)).toEqual([
      '1Note two',
      '2Heading note',
    ]);
    // Default styles go in before measuring; the source is untouched.
    expect(document.head.querySelector('style[data-html-paginator-footnotes]')).not.toBeNull();
    expect(document.querySelectorAll('#src [data-footnote]')).toHaveLength(2);
  });

  it('leaves reference numbers out of TOC entries', () => {
    document.body.innerHTML =
      '<div id="src"><nav data-hp-toc></nav><h1 data-h="10">Title<span data-footnote>n</span></h1></div>';
    const { pages } = createPaginator({ source: '#src', measurer: measurer() }).paginate();
    expect(pages[0]!.querySelector('.hp-toc-text')!.textContent).toBe('Title');
  });
});

describe('footnote numbering', () => {
  const measurer = (): MeasureAdapter => ({
    measure: (el) =>
      el.classList.contains('hp-footnotes') ? 5 : Number(el.getAttribute('data-h') ?? 0),
    pageHeight: () => 100,
  });
  const source = `<div id="src">
    <p data-h="60">a<span data-footnote>n1</span> b<span data-footnote>n2</span></p>
    <p data-h="60">c<span data-footnote>n3</span></p>
    <p data-h="60" data-section="s">d<span data-footnote>n4</span></p>
    <p data-h="60">e<span data-footnote>n5</span></p></div>`;
  const numbers = (footnotes?: Parameters<typeof createPaginator>[0]['footnotes']) => {
    document.body.innerHTML = source;
    const { pages } = createPaginator({ source: '#src', measurer: measurer(), footnotes }).paginate();
    return pages.map((p) => ({
      refs: Array.from(p.querySelectorAll('.hp-footnote-ref'), (r) => r.textContent).join(','),
      marks: Array.from(p.querySelectorAll('.hp-footnote-mark'), (r) => r.textContent).join(','),
    }));
  };

  it('is continuous by default', () => {
    expect(numbers()).toEqual([
      { refs: '1,2', marks: '1,2' },
      { refs: '3', marks: '3' },
      { refs: '4', marks: '4' },
      { refs: '5', marks: '5' },
    ]);
  });

  it('restarts each page or each section, in any number format', () => {
    expect(numbers({ restart: 'page', format: 'lower-alpha' }).map((p) => p.refs)).toEqual(['a,b', 'a', 'a', 'a']);
    expect(numbers({ restart: 'section', format: 'lower-roman' })).toEqual([
      { refs: 'i,ii', marks: 'i,ii' },
      { refs: 'iii', marks: 'iii' },
      { refs: 'i', marks: 'i' },
      { refs: 'ii', marks: 'ii' },
    ]);
  });
});
