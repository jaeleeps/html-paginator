import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { inspectPages, openPaginated } from './helpers';

/** Serve 400×300 SVGs from slow.test, each after a delay. */
async function slowImages(page: Page): Promise<void> {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#9ab"/></svg>';
  await page.route('http://slow.test/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.fulfill({ body: svg, contentType: 'image/svg+xml' });
  });
}

const imageHeights = (page: Page) =>
  page.evaluate(() => Array.from(document.querySelectorAll<HTMLImageElement>('.hp-pages img'), (img) => img.getBoundingClientRect().height));

test.describe('images', () => {
  test('paginateWhenReady waits for slow and lazy images, so they are measured', async ({ page }) => {
    await slowImages(page);
    expect(await openPaginated(page, 'e2e/fixtures/images.html?mode=ready')).toEqual([]);
    expect(await imageHeights(page)).toEqual([300, 300]);
    const pages = await inspectPages(page);
    for (const p of pages) expect(p.overflowPx, `page ${p.page}`).toBe(0);
  });

  test('without waiting, images loading later overflow their pages (the problem it solves)', async ({ page }) => {
    await slowImages(page);
    await openPaginated(page, 'e2e/fixtures/images.html?mode=now');
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.hp-pages img'), (img) => (img as HTMLImageElement).complete).every(Boolean));
    const pages = await inspectPages(page);
    expect(Math.max(...pages.map((p) => p.overflowPx))).toBeGreaterThan(0);
  });
});
