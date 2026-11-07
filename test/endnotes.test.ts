import { afterEach, describe, expect, it } from 'vitest';
import { collectEndnotes, createPaginator } from '../src/index';
import type { MeasureAdapter } from '../src/index';

afterEach(() => {
  document.body.innerHTML = '';
});

const refs = (root: ParentNode) =>
  Array.from(root.querySelectorAll('.hp-endnote-ref a'), (a) => `${a.textContent}${a.getAttribute('href')}`);
const notes = (root: ParentNode) =>
  Array.from(root.querySelectorAll('.hp-endnote'), (n) => `${n.id}:${n.textContent}`);

describe('collectEndnotes', () => {
  it('numbers in lower-roman and appends the notes to the content', () => {
    document.body.innerHTML = `<div id="r"><p>a<span data-endnote>One <b>bold</b>.</span> b<span data-endnote id="why">Two<span data-endnote>inner</span></span></p></div>`;
    const root = document.getElementById('r')!;
    expect(collectEndnotes(root)).toBe(2);
    expect(root.querySelector('p')!.textContent).toBe('ai bii');
    expect(refs(root)).toEqual(['i#hp-endnote-1', 'ii#why']);
    expect(root.lastElementChild!.className).toBe('hp-endnotes');
    expect(notes(root)).toEqual(['hp-endnote-1:i One bold.', 'why:ii Twoinner']);
    expect(root.querySelector('.hp-endnote b')).not.toBeNull();
  });

  it('fills the data-hp-endnotes container, in the given format', () => {
    document.body.innerHTML = `<div id="r"><div data-hp-endnotes><h2>Notes</h2></div><p>x<span data-endnote>n</span></p></div>`;
    const root = document.getElementById('r')!;
    collectEndnotes(root, { format: 'decimal' });
    const list = root.querySelector('[data-hp-endnotes]')!;
    expect(list.classList.contains('hp-endnotes')).toBe(true);
    expect(Array.from(list.children, (c) => c.tagName)).toEqual(['H2', 'DIV']);
    expect(refs(root)).toEqual(['1#hp-endnote-1']);
  });

  it('collects each section\'s notes at its end (Word: End of section)', () => {
    document.body.innerHTML = `<div id="r">
      <p>a<span data-endnote>A</span></p>
      <div data-section="one"></div><p>b<span data-endnote>B</span> c<span data-endnote>C</span></p>
      <div data-section="two"></div><p>none</p>
      <section data-section="three"><p>d<span data-endnote>D</span></p><div data-hp-endnotes><h3>Notes</h3></div><p>tail</p></section>
      <p>e<span data-endnote>E</span></p>
    </div>`;
    const root = document.getElementById('r')!;
    expect(collectEndnotes(root, { location: 'section', restart: 'section' })).toBe(5);
    // Lists: before "one", before "two", in three's container (with E, still section three).
    const lists = Array.from(root.querySelectorAll('.hp-endnotes'), (list) =>
      Array.from(list.querySelectorAll('.hp-endnote'), (n) => n.textContent),
    );
    expect(lists).toEqual([['i A'], ['i B', 'ii C'], ['i D', 'ii E']]);
    expect(root.querySelector('[data-section="one"]')!.previousElementSibling!.className).toBe('hp-endnotes');
    expect(root.querySelector('[data-section="two"]')!.previousElementSibling!.className).toBe('hp-endnotes');
    expect(root.querySelector('[data-hp-endnotes] h3')).not.toBeNull();
    // Ids stay unique across sections.
    expect(refs(root)).toEqual(['i#hp-endnote-1', 'i#hp-endnote-2', 'ii#hp-endnote-3', 'i#hp-endnote-4', 'ii#hp-endnote-5']);
  });

  it('numbers continuously across section lists, or restarts at the end of the document', () => {
    const markup = `<div id="r"><p>a<span data-endnote>A</span></p><div data-section="s"></div><p>b<span data-endnote>B</span></p></div>`;
    document.body.innerHTML = markup;
    collectEndnotes(document.getElementById('r')!, { location: 'section', format: 'decimal' });
    expect(notes(document)).toEqual(['hp-endnote-1:1 A', 'hp-endnote-2:2 B']);
    expect(document.querySelectorAll('.hp-endnotes')).toHaveLength(2);

    document.body.innerHTML = markup;
    collectEndnotes(document.getElementById('r')!, { restart: 'section' });
    expect(notes(document)).toEqual(['hp-endnote-1:i A', 'hp-endnote-2:i B']);
    expect(document.querySelectorAll('.hp-endnotes')).toHaveLength(1);
    expect(document.getElementById('r')!.lastElementChild!.className).toBe('hp-endnotes');
  });

  it('rejects unknown options', () => {
    document.body.innerHTML = '<div id="r"><p>x<span data-endnote>n</span></p></div>';
    const root = document.getElementById('r')!;
    expect(() => collectEndnotes(root, { location: 'chapter' as never })).toThrow(/location must be document or section/);
    expect(() => collectEndnotes(root, { restart: 'page' as never })).toThrow(/restart must be continuous or section/);
  });

  it('does nothing without endnotes', () => {
    document.body.innerHTML = '<div id="r"><p>x</p></div>';
    expect(collectEndnotes(document.getElementById('r')!)).toBe(0);
    expect(document.querySelector('.hp-endnotes')).toBeNull();
  });
});

describe('createPaginator: endnotes', () => {
  const measurer = (): MeasureAdapter => ({
    measure: (el) => Number(el.getAttribute('data-h') ?? 20),
    pageHeight: () => 100,
  });

  it('paginates the notes at the end, leaving the source alone', () => {
    document.body.innerHTML = `<div id="src"><p data-h="90">x<span data-endnote>note</span></p><h1 data-h="10">T<span data-endnote>h</span></h1><nav data-hp-toc></nav></div>`;
    const { pages } = createPaginator({ source: '#src', measurer: measurer() }).paginate();
    const last = pages[pages.length - 1]!;
    expect(notes(last)).toEqual(['hp-endnote-1:i note', 'hp-endnote-2:ii h']);
    // TOC entries leave endnote references out.
    expect(pages.flatMap((p) => Array.from(p.querySelectorAll('.hp-toc-text'), (a) => a.textContent))).toEqual(['T']);
    expect(document.querySelectorAll('#src [data-endnote]')).toHaveLength(2);
  });

  it('paginates section endnotes before the next section\'s page break', () => {
    document.body.innerHTML = `<div id="src">
      <p data-h="50">a<span data-endnote>A</span></p>
      <p data-h="50" data-section="next">b<span data-endnote>B</span></p></div>`;
    const { pages } = createPaginator({
      source: '#src',
      measurer: measurer(),
      endnotes: { location: 'section', restart: 'section' },
      sections: { next: {} },
    }).paginate();
    expect(pages.map((p) => notes(p).map((n) => n.split(':')[1]))).toEqual([['i A'], ['i B']]);
  });
});
