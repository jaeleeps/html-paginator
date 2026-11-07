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
});
