import { afterEach, describe, expect, it } from 'vitest';
import { CLASS_NAMES } from '../src/buildPages';
import { createDomMeasurer, measureOuterHeight } from '../src/measure';

/** jsdom has no layout engine — stub the metrics elements would report. */
function stub(el: Element, metrics: { offsetHeight?: number; clientHeight?: number }) {
  if (metrics.offsetHeight !== undefined) {
    Object.defineProperty(el, 'offsetHeight', { value: metrics.offsetHeight, configurable: true });
  }
  if (metrics.clientHeight !== undefined) {
    Object.defineProperty(el, 'clientHeight', { value: metrics.clientHeight, configurable: true });
  }
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('measureOuterHeight', () => {
  it('adds vertical margins to offsetHeight', () => {
    const el = document.createElement('div');
    el.style.marginTop = '10px';
    el.style.marginBottom = '5px';
    document.body.appendChild(el);
    stub(el, { offsetHeight: 100 });
    expect(measureOuterHeight(el)).toBe(115);
  });

  it('treats missing margins as zero', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    stub(el, { offsetHeight: 40 });
    expect(measureOuterHeight(el)).toBe(40);
  });
});

describe('createDomMeasurer', () => {
  it('mounts a hidden probe page per page config', () => {
    const measurer = createDomMeasurer({ document, page: { size: 'a4', margin: '10mm' } });
    measurer.pageHeight(1);

    const probe = document.querySelector<HTMLElement>(`.${CLASS_NAMES.page}`);
    expect(probe).not.toBeNull();
    expect(probe?.style.visibility).toBe('hidden');
    expect(probe?.style.position).toBe('absolute');
    expect(probe?.style.width).toBe('210mm');
    measurer.dispose();
  });

  it('reuses the probe for the same page and creates one per differing page', () => {
    const measurer = createDomMeasurer({
      document,
      pageOverrides: { 2: { margin: '30mm' } },
    });
    measurer.pageHeight(1);
    measurer.pageHeight(1);
    expect(document.querySelectorAll(`.${CLASS_NAMES.page}`)).toHaveLength(1);
    measurer.pageHeight(2);
    expect(document.querySelectorAll(`.${CLASS_NAMES.page}`)).toHaveLength(2);
    measurer.dispose();
  });

  it('computes available height: inner height minus header and footer', () => {
    const measurer = createDomMeasurer({
      document,
      page: { header: '<header>h</header>', footer: '<footer>f</footer>' },
    });
    measurer.pageHeight(1); // mount probe

    const pageEl = document.querySelector<HTMLElement>(`.${CLASS_NAMES.page}`);
    const header = document.querySelector<HTMLElement>(`.${CLASS_NAMES.header}`);
    const footer = document.querySelector<HTMLElement>(`.${CLASS_NAMES.footer}`);
    stub(pageEl!, { clientHeight: 1000 });
    stub(header!, { offsetHeight: 80 });
    stub(footer!, { offsetHeight: 50 });

    expect(measurer.pageHeight(1)).toBe(870);
    measurer.dispose();
  });

  it('subtracts page padding (margin config)', () => {
    const measurer = createDomMeasurer({ document, page: { margin: '20px' } });
    measurer.pageHeight(1);
    const pageEl = document.querySelector<HTMLElement>(`.${CLASS_NAMES.page}`);
    stub(pageEl!, { clientHeight: 500 });
    // clientHeight includes padding; 500 - 20 - 20 = 460
    expect(measurer.pageHeight(1)).toBe(460);
    measurer.dispose();
  });

  it('measures items inside the probe body and restores their position', () => {
    const measurer = createDomMeasurer({ document });

    const source = document.createElement('div');
    const before = document.createElement('span');
    const item = document.createElement('p');
    const after = document.createElement('span');
    source.append(before, item, after);
    document.body.appendChild(source);

    item.style.marginBottom = '8px';
    stub(item, { offsetHeight: 42 });

    expect(measurer.measure(item)).toBe(50);
    // restored to original position
    expect(item.parentNode).toBe(source);
    expect(Array.from(source.children)).toEqual([before, item, after]);
    // probe body left empty
    expect(document.querySelector(`.${CLASS_NAMES.body}`)?.children).toHaveLength(0);
    measurer.dispose();
  });

  it('measure() works before any pageHeight() call (lazy page-1 probe)', () => {
    const measurer = createDomMeasurer({ document });
    const item = document.createElement('p');
    document.body.appendChild(item);
    stub(item, { offsetHeight: 10 });
    expect(measurer.measure(item)).toBe(10);
    expect(document.querySelectorAll(`.${CLASS_NAMES.page}`)).toHaveLength(1);
    measurer.dispose();
  });

  it('dispose() removes all probes', () => {
    const measurer = createDomMeasurer({ document, pageOverrides: { 2: { margin: '5mm' } } });
    measurer.pageHeight(1);
    measurer.pageHeight(2);
    expect(document.querySelectorAll(`.${CLASS_NAMES.page}`)).toHaveLength(2);
    measurer.dispose();
    expect(document.querySelectorAll(`.${CLASS_NAMES.page}`)).toHaveLength(0);
  });
});
