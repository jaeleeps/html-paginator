import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPaginator, numberLines, parseDeclarativeConfig } from '../src/index';
import type { LineNumberOptions, MeasureAdapter } from '../src/index';

// jsdom has no layout: each text node is one line, at its parent's data-y.
beforeEach(() => {
  Range.prototype.getBoundingClientRect = function (this: Range) {
    const top = Number((this.startContainer.parentElement as HTMLElement | null)?.dataset.y ?? 0);
    return { top, bottom: top + 10, height: 10, left: 0, right: 10, width: 10, x: 0, y: top, toJSON: () => ({}) };
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (Range.prototype as Partial<Range>).getBoundingClientRect;
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

const measurer: MeasureAdapter = { measure: (el) => Number(el.getAttribute('data-h') ?? 0), pageHeight: () => 100 };

const numbers = (page: Element): string[] =>
  Array.from(page.querySelectorAll('.hp-line-number'), (n) => n.textContent ?? '');

function body(markup: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = markup;
  document.body.appendChild(el);
  return el;
}

describe('numberLines', () => {
  it('numbers each line in the margin, skipping tables and suppressed elements', () => {
    const b = body(`
      <p data-y="0">one</p>
      <p data-y="20">two <b data-y="20">bold</b></p>
      <table><tr><td data-y="40">cell</td></tr></table>
      <p data-hp-suppress-line-numbers data-y="60">quote</p>
      <p data-y="80">three</p>`);
    expect(numberLines([{ bodies: [b], options: { distance: '10px' }, sectionStart: true }])).toBe(3);
    expect(numbers(b)).toEqual(['1', '2', '3']);
    const mark = b.querySelector<HTMLElement>('.hp-line-number:nth-of-type(1)') ?? b.querySelector<HTMLElement>('.hp-line-number')!;
    expect(mark.style.position).toBe('absolute');
    expect(mark.style.right).toBe('calc(100% + 10px)');
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    const tops = Array.from(b.querySelectorAll<HTMLElement>('.hp-line-number'), (n) => n.style.top);
    expect(tops).toEqual(['0px', '20px', '80px']);
    expect(b.style.position).toBe('relative');
  });

  it('shows multiples of countBy, from start', () => {
    const b = body([0, 10, 20, 30, 40, 50].map((y) => `<p data-y="${y}">l</p>`).join(''));
    numberLines([{ bodies: [b], options: { start: 3, countBy: 5 }, sectionStart: false }]);
    expect(numbers(b)).toEqual(['5']); // lines 3..8
  });

  it('restarts per page, per section or never; pages without options do not count', () => {
    const page = (n: number) => body(Array.from({ length: n }, (_, i) => `<p data-y="${i * 10}">l</p>`).join(''));
    const run = (options: LineNumberOptions, starts: boolean[], off: number[] = []) => {
      const pages = starts.map((sectionStart, i) => ({
        bodies: [page(2)],
        options: off.includes(i) ? null : options,
        sectionStart,
      }));
      numberLines(pages);
      return pages.map((p) => numbers(p.bodies[0]!).join(','));
    };
    expect(run({}, [true, false, true])).toEqual(['1,2', '1,2', '1,2']);
    expect(run({ restart: 'continuous' }, [true, false, true])).toEqual(['1,2', '3,4', '5,6']);
    expect(run({ restart: 'section' }, [true, false, true])).toEqual(['1,2', '3,4', '1,2']);
    expect(run({ restart: 'continuous' }, [true, false, false], [1])).toEqual(['1,2', '', '1,2']);
  });

  it('rejects invalid options', () => {
    const b = body('<p data-y="0">l</p>');
    const run = (options: LineNumberOptions) => () => numberLines([{ bodies: [b], options, sectionStart: false }]);
    expect(run({ countBy: 0 })).toThrow(/countBy/);
    expect(run({ start: 1.5 })).toThrow(/start/);
    expect(run({ restart: 'chapter' as never })).toThrow(/restart/);
  });

  it('numbers the rendered pages of a paginator, per section and per column', () => {
    document.body.innerHTML = `<div id="src">
      <p data-h="60" data-y="0">a</p><p data-h="60" data-y="10">b</p>
      <p data-h="60" data-y="0" data-section="cols">c</p><p data-h="60" data-y="0">d</p>
      <p data-h="60" data-y="0" data-section="plain">e</p>
    </div>`;
    const { pages } = createPaginator({
      source: '#src',
      measurer,
      page: { lineNumbers: { restart: 'continuous' } },
      sections: { cols: { page: { columns: 2 } }, plain: { page: { lineNumbers: null } } },
    }).paginate();
    expect(pages.map(numbers)).toEqual([['1'], ['2'], ['3', '4'], []]);
    // In columns, each column gets its own numbers.
    expect(Array.from(pages[2]!.querySelectorAll('.hp-column-body'), (c) => numbers(c))).toEqual([['3'], ['4']]);
  });

  it('is read from data-hp-line-numbers attributes', () => {
    document.body.innerHTML = `
      <template data-hp-config data-hp-line-numbers="section" data-hp-line-numbers-count-by="5"
        data-hp-line-numbers-start="2" data-hp-line-numbers-distance="1em">
        <div data-hp-section="appendix" data-hp-line-numbers="none"></div>
      </template>
      <div data-hp-content><p>a</p></div>`;
    const config = parseDeclarativeConfig(document)!;
    expect(config.page?.lineNumbers).toEqual({ restart: 'section', countBy: 5, start: 2, distance: '1em' });
    expect(config.sections?.appendix?.page?.lineNumbers).toBeNull();
  });
});
