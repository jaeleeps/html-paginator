/**
 * Generate a PDF from the invoice example with Puppeteer.
 *
 * Prerequisites:
 *   npm run build          # example imports ../dist/index.js
 *   npm i -D puppeteer     # not a package dependency
 *
 * Usage:
 *   node examples/generate-pdf.mjs [output.pdf]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const dir = path.dirname(fileURLToPath(import.meta.url));
const output = process.argv[2] ?? path.join(dir, 'invoice.pdf');

const browser = await puppeteer.launch();
try {
  const page = await browser.newPage();
  await page.goto(`file://${path.join(dir, 'invoice.html')}`);

  // Pagination runs synchronously on load; wait for its marker anyway.
  await page.waitForSelector('html[data-paginated="true"]');

  await page.pdf({
    path: output,
    // Use the library's @page size/margin (margins are part of the page
    // config, not the browser's).
    preferCSSPageSize: true,
    printBackground: true,
  });
  console.log(`PDF written to ${output}`);
} finally {
  await browser.close();
}
