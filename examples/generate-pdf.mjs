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
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import puppeteer from 'puppeteer';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '..');
const output = process.argv[2] ?? path.join(dir, 'invoice.pdf');

// Chrome blocks ES-module imports over file://, so serve the repo over HTTP.
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };
const server = http.createServer(async (req, res) => {
  try {
    const file = path.join(root, path.normalize(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(root)) throw new Error('forbidden');
    res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

const browser = await puppeteer.launch();
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/examples/invoice.html`);

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
  server.close();
}
