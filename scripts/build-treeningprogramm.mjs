// Treeningprogrammi PDF-id: content/kungfu/treeningprogramm-{et,en,zh}.html -> assets/kungfu/treeningprogramm-{et,en,zh}.pdf
// Trükib Chromiumiga (Playwright). Käivita repo juurkaustast:
//   node scripts/build-treeningprogramm.mjs            (kõik kolm keelt)
//   node scripts/build-treeningprogramm.mjs et zh      (ainult need)
// Vaja: node 18+, npm-pakett playwright ja selle Chromium (npx playwright install chromium).
// Kirjad: Liberation Serif/Sans ja WenQuanYi Zen Hei (Debiani/Ubuntu paketid fonts-liberation, fonts-wqy-zenhei);
// nende puudumisel võtab Chromium asenduskirja ja lehekülgede murdumine võib nihkuda.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const langs = process.argv.slice(2).length ? process.argv.slice(2) : ['et', 'en', 'zh'];
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

// Väike staatiline server repo juurkaustast: nii töötab suhteline CSS ja logo tee ka siis, kui file:// on brauserile keelatud.
const server = createServer(async (req, res) => {
  try {
    const p = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!p.startsWith(root) || !(await stat(p)).isFile()) throw new Error('404');
    res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' });
    res.end(await readFile(p));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  for (const l of langs) {
    const page = await browser.newPage();
    await page.goto(`${base}/content/kungfu/treeningprogramm-${l}.html`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const out = join(root, 'assets', 'kungfu', `treeningprogramm-${l}.pdf`);
    await page.pdf({ path: out, format: 'Letter', preferCSSPageSize: true, printBackground: true });
    await page.close();
    console.log('kirjutatud', out);
  }
} finally {
  await browser.close();
  server.close();
}
