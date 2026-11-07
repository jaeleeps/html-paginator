/// <reference types="node" />
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Origin the repo is served from (requests are fulfilled from disk). */
export const ORIGIN = 'http://paginator.test';

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
};

/**
 * Serve the repository at ORIGIN without a web server: ES-module examples
 * cannot be imported over file://.
 */
export async function serveRepo(page: Page): Promise<void> {
  await page.route(`${ORIGIN}/**`, async (route) => {
    const file = path.join(ROOT, decodeURIComponent(new URL(route.request().url()).pathname));
    if (!file.startsWith(ROOT)) return route.fulfill({ status: 403 });
    try {
      const body = await readFile(file);
      await route.fulfill({ body, contentType: MIME[path.extname(file)] ?? 'application/octet-stream' });
    } catch {
      await route.fulfill({ status: 404 });
    }
  });
}

/** Open a page and wait until it signals pagination finished. */
export async function openPaginated(page: Page, urlPath: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await serveRepo(page);
  await page.goto(`${ORIGIN}/${urlPath}`);
  await page.locator('html[data-paginated="true"]').waitFor({ state: 'attached' });
  return errors;
}

export interface PageInfo {
  page: number;
  widthIn: number;
  heightIn: number;
  /** Pixels by which any body descendant extends past the body's bottom. */
  overflowPx: number;
  /** Body inset from the page's left / right edge, in inches. */
  bodyLeftIn: number;
  bodyRightIn: number;
  clipped: boolean;
  tables: number;
  theads: number;
  tfoots: number;
  captions: number;
  header: string;
  footer: string;
  text: string;
}

/** Geometry and content of every rendered page. */
export function inspectPages(page: Page): Promise<PageInfo[]> {
  return page.evaluate(() => {
    const clean = (s: string | undefined | null) => (s ?? '').replace(/\s+/g, ' ').trim();
    return Array.from(document.querySelectorAll<HTMLElement>('.hp-pages > .hp-page'), (pg, i) => {
      const body = pg.querySelector<HTMLElement>('.hp-body')!;
      const rect = pg.getBoundingClientRect();
      const bodyRect = body.getBoundingClientRect();
      const bodyBottom = bodyRect.bottom;
      const inches = (px: number) => Math.round((px / 96) * 100) / 100;
      let maxBottom = -Infinity;
      for (const el of body.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.height > 0) maxBottom = Math.max(maxBottom, r.bottom);
      }
      return {
        page: i + 1,
        widthIn: Math.round((rect.width / 96) * 100) / 100,
        heightIn: Math.round((rect.height / 96) * 100) / 100,
        overflowPx: Math.max(0, Math.round(maxBottom - bodyBottom)),
        bodyLeftIn: inches(bodyRect.left - rect.left),
        bodyRightIn: inches(rect.right - bodyRect.right),
        clipped: body.style.overflow === 'hidden',
        tables: body.querySelectorAll('table').length,
        theads: body.querySelectorAll('thead').length,
        tfoots: body.querySelectorAll('tfoot').length,
        captions: body.querySelectorAll('caption').length,
        header: clean(pg.querySelector('.hp-header')?.textContent),
        footer: clean(pg.querySelector('.hp-footer')?.textContent),
        text: body.innerText,
      };
    });
  });
}

/** Print to PDF the way users do with Puppeteer/Playwright. */
export async function printPdf(page: Page): Promise<Buffer> {
  await page.emulateMedia({ media: 'print' });
  return page.pdf({ preferCSSPageSize: true, printBackground: true });
}

export interface PdfPage {
  widthIn: number;
  heightIn: number;
  text: string;
}

/** Page sizes and text of a PDF. */
export async function readPdf(pdf: Buffer): Promise<PdfPage[]> {
  const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: true });
  const doc = await task.promise;
  const pages: PdfPage[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const p = await doc.getPage(n);
    const [x0, y0, x1, y1] = p.view as [number, number, number, number];
    const content = await p.getTextContent();
    const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
    pages.push({
      widthIn: Math.round(((x1 - x0) / 72) * 100) / 100,
      heightIn: Math.round(((y1 - y0) / 72) * 100) / 100,
      text,
    });
  }
  await task.destroy();
  return pages;
}

/** All matches of `pattern` (global) in `text`, in order. */
export function markers(text: string, pattern: RegExp): string[] {
  return text.match(pattern) ?? [];
}
