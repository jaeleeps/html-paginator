/**
 * Waiting for content to be measurable. Pagination measures the content as
 * it is laid out at that moment: an image still loading (or a lazy one not
 * yet requested) takes no height, and text in a web font still loading has
 * the fallback font's metrics.
 */

export interface ReadyOptions {
  /** Give up waiting after this many milliseconds (with a warning). Default: 10000. */
  timeout?: number;
}

const DEFAULT_TIMEOUT = 10000;

/**
 * Resolve once the document's web fonts and every image under `root` have
 * loaded (or failed). Lazy images (`loading="lazy"`) are switched to eager
 * so they load without being scrolled to. Never rejects: after `timeout` it
 * resolves anyway and warns.
 */
export function whenContentReady(root: Element, options: ReadyOptions = {}): Promise<void> {
  const doc = root.ownerDocument;
  const waits: Promise<unknown>[] = [];
  const fonts = (doc as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
  if (fonts?.ready) waits.push(fonts.ready);
  const images = root.matches('img') ? [root as HTMLImageElement] : Array.from(root.querySelectorAll('img'));
  for (const img of images) {
    if (img.getAttribute('loading') === 'lazy') img.setAttribute('loading', 'eager');
    if (img.complete) continue;
    waits.push(
      new Promise<void>((resolve) => {
        img.addEventListener('load', () => resolve(), { once: true });
        img.addEventListener('error', () => resolve(), { once: true });
      }),
    );
  }
  if (waits.length === 0) return Promise.resolve();

  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`html-paginator: content not ready after ${timeout}ms (images or fonts still loading); paginating anyway`);
      resolve();
    }, timeout);
    void Promise.all(waits).then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}
