// Treeningprogrammi PDF-id: content/kungfu/treeningprogramm-{et,en,zh}.html -> assets/kungfu/treeningprogramm-{et,en,zh}.pdf
// NB! Alates 29.10.2026 on saidil autori enda PDF-id (vt README „Treeningprogrammi PDF“); see skript
// kirjutaks need vanema HTML-allikaga üle. Käivita ainult siis, kui HTML-allikas on uuesti ajakohane.
// Trükib Chromiumiga (Playwright). Käivita repo juurkaustast:
//   node scripts/build-treeningprogramm.mjs            (kõik kolm keelt)
//   node scripts/build-treeningprogramm.mjs et zh      (ainult need)
// Vaja: node 18+, npm-pakett playwright ja selle Chromium (npx playwright install chromium).
// Kirjad: Liberation Serif/Sans (Debiani/Ubuntu pakett fonts-liberation) ja hiina märkidele Noto Sans SC Regular + Bold
// staatiliste TrueType-lõigetena (python3 scripts/fonts-noto-sans-sc.py). Muu hiina kirjaga (sünteesitud rasvane,
// OTF/CFF või muutuvkiri) salvestab Chromium märgid Type 3 kirjana, mida osa PDF-lugejaid näitab kastikestena;
// seepärast skript ilma Noto Sans SC Regular ja Bold lõiketa ei ehita.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let styles = '';
try { styles = execFileSync('fc-list', ['Noto Sans SC', 'style'], { encoding: 'utf8' }); } catch {}
if (!/Regular/.test(styles) || !/Bold/.test(styles)) {
  console.error('Puudub kiri Noto Sans SC (Regular ja Bold). Paigalda: python3 scripts/fonts-noto-sans-sc.py');
  process.exit(1);
}

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
