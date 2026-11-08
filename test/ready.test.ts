import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindPrintPagination, createPaginator, whenContentReady } from '../src/index';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

/** An image that is still loading until `load` or `error` is dispatched. */
function loading(img: HTMLImageElement): HTMLImageElement {
  let complete = false;
  Object.defineProperty(img, 'complete', { get: () => complete });
  img.addEventListener('load', () => (complete = true));
  return img;
}

const settled = async (promise: Promise<unknown>): Promise<boolean> => {
  let done = false;
  void promise.then(() => (done = true));
  for (let i = 0; i < 5; i++) await Promise.resolve();
  return done;
};

describe('whenContentReady', () => {
  it('waits for images still loading (load or error), switching lazy ones to eager', async () => {
    document.body.innerHTML = '<div id="r"><img id="a" loading="lazy"><img id="b"><img id="c"></div>';
    const a = loading(document.querySelector<HTMLImageElement>('#a')!);
    const b = loading(document.querySelector<HTMLImageElement>('#b')!);
    const ready = whenContentReady(document.getElementById('r')!);
    expect(a.getAttribute('loading')).toBe('eager');
    expect(await settled(ready)).toBe(false);
    a.dispatchEvent(new Event('load'));
    expect(await settled(ready)).toBe(false);
    b.dispatchEvent(new Event('error'));
    expect(await settled(ready)).toBe(true);
  });

  it('waits for the document fonts', async () => {
    let fontsLoaded!: () => void;
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: new Promise<void>((resolve) => (fontsLoaded = resolve)) },
    });
    document.body.innerHTML = '<div id="r"><p>text</p></div>';
    const ready = whenContentReady(document.getElementById('r')!);
    expect(await settled(ready)).toBe(false);
    fontsLoaded();
    expect(await settled(ready)).toBe(true);
    delete (document as { fonts?: unknown }).fonts;
  });

  it('gives up after the timeout, with a warning', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    document.body.innerHTML = '<div id="r"><img></div>';
    loading(document.querySelector('img')!);
    const ready = whenContentReady(document.getElementById('r')!, { timeout: 500 });
    vi.advanceTimersByTime(499);
    expect(await settled(ready)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(await settled(ready)).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/not ready after 500ms/));
  });
});

describe('paginating when ready', () => {
  const measurer = { measure: (el: HTMLElement) => Number(el.getAttribute('data-h') ?? 10), pageHeight: () => 100 };

  it('paginateWhenReady paginates once the images have loaded', async () => {
    document.body.innerHTML = '<div id="src"><p>a</p><img data-h="10"></div>';
    const img = loading(document.querySelector('img')!);
    const result = createPaginator({ source: '#src', measurer }).paginateWhenReady();
    expect(await settled(result)).toBe(false);
    expect(document.querySelector('.hp-page')).toBeNull();
    img.dispatchEvent(new Event('load'));
    expect((await result).totalPages).toBe(1);
  });

  it('runWhenReady does the same for declarative content', async () => {
    document.body.innerHTML = '<div data-hp-content><p>a</p><img></div>';
    const img = loading(document.querySelector('img')!);
    const handle = bindPrintPagination(document, { measurer });
    const done = handle.runWhenReady();
    expect(await settled(done)).toBe(false);
    img.dispatchEvent(new Event('load'));
    await done;
    expect(document.querySelectorAll('.hp-page')).toHaveLength(1);
    handle.unbind();
  });
});
