import { afterEach, describe, expect, it } from 'vitest';
import { createPaginator, longestRunning, parseDeclarativeConfig, runningValues } from '../src/index';
import type { MeasureAdapter, PageContext } from '../src/index';
import { createPageLayout } from '../src/layout';
import { createDomMeasurer } from '../src/measure';

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

function els(markup: string): HTMLElement[] {
  const root = document.createElement('div');
  root.innerHTML = markup;
  return Array.from(root.children) as HTMLElement[];
}

describe('running header values', () => {
  it('gives the first value on a page, else the one carried from before; and the last', () => {
    const values = runningValues([
      els('<h1>One</h1><p>x</p><h2>A</h2><h2>B</h2>'),
      els('<p>no headings</p>'),
      els('<section><h2>C</h2><p>y</p></section><h1>Two <sup class="hp-footnote-ref">3</sup></h1>'),
    ]);
    expect(values.map((v) => v.running)).toEqual([
      { h1: 'One', h2: 'A' },
      { h1: 'One', h2: 'B' },
      { h1: 'Two', h2: 'C' },
    ]);
    expect(values.map((v) => v.runningLast)).toEqual([
      { h1: 'One', h2: 'B' },
      { h1: 'One', h2: 'B' },
      { h1: 'Two', h2: 'C' },
    ]);
  });

  it('reads data-hp-running names and skips continued fragments', () => {
    const values = runningValues([
      els('<dt data-hp-running="term">apple</dt><dt data-hp-running="term">banana</dt>'),
      els('<dt data-hp-running="term" data-hp-continued>banana</dt><dt data-hp-running="term">cherry</dt>'),
    ]);
    expect(values.map((v) => [v.running.term, v.runningLast.term])).toEqual([
      ['apple', 'banana'],
      ['cherry', 'cherry'],
    ]);
  });

  it('finds the longest value of each name (for measuring)', () => {
    const [root] = els('<div><h1>Short</h1><h1>A much longer title</h1><p data-hp-running="x">x</p></div>');
    expect(longestRunning(root!)).toEqual({ h1: 'A much longer title', x: 'x' });
  });

  it('measures probe headers with the longest values', () => {
    const layout = createPageLayout({ page: { header: ({ running }) => `<div>${running.h1 ?? ''}</div>` } });
    layout.setRunning({ h1: 'The longest chapter title' });
    const measurer = createDomMeasurer({ document, layout });
    measurer.pageHeight(1);
    expect(document.body.lastElementChild!.querySelector('.hp-header')!.textContent).toBe('The longest chapter title');
    measurer.dispose();
  });

  it('feeds headers and footers per page', () => {
    document.body.innerHTML = `<div id="src">
      <h1 data-h="10">Intro</h1><p data-h="80">a</p>
      <p data-h="80">b</p>
      <h1 data-h="10">Methods and Materials</h1><p data-h="50">c</p><h2 data-h="10">Sub</h2>
    </div>`;
    const measurer: MeasureAdapter = { measure: (el) => Number(el.getAttribute('data-h') ?? 0), pageHeight: () => 100 };
    const header = (ctx: PageContext) => `<div>${ctx.running.h1 ?? ''} | ${ctx.runningLast.h2 ?? '-'}</div>`;
    const { pages } = createPaginator({ source: '#src', measurer, page: { header } }).paginate();
    expect(pages.map((p) => p.querySelector('.hp-header')!.textContent)).toEqual([
      'Intro | -',
      'Intro | -',
      'Methods and Materials | Sub',
    ]);
  });

  it('interpolates {{running.name}} / {{runningLast.name}} in declarative slots, escaped', () => {
    document.body.innerHTML = `
      <template data-hp-config><div data-hp-header>{{running.h1}} / {{runningLast.term}} / {{section}}</div></template>
      <div data-hp-content><p>a</p></div>`;
    const template = parseDeclarativeConfig(document)!.page!.header as (ctx: Partial<PageContext>) => string;
    const html = template({ running: { h1: 'A <b> & C' }, runningLast: {}, section: 'body' });
    expect(html).toContain('A &lt;b&gt; &amp; C /  / body');
  });
});
