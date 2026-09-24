#!/usr/bin/env node
/*
  Lugemislehe sisu ehitus: content/<raamat>/*.md -> <raamat>/sisu/*.json

      RAUDVAAL_KOOD='…' node scripts/build-raudvaal.mjs            # raamat: raudvaal
      RAUDVAAL_KOOD='…' node scripts/build-raudvaal.mjs raudvaal

  * Tasuta ja avaldatud peatükid (free: true, published: true) lähevad avatekstina (html).
  * Tasulised ja avaldamata (mustand) peatükid krüpteeritakse: AES-256-GCM, võti
    tuletatakse koodist PBKDF2-SHA256-ga (600 000 iteratsiooni, sool on avalik).
    Brauser (raudvaal/loe.js) tuletab sama võtme koodist ja avab sisu kohapeal.
  * Sõnastik (sonastik.json) tehakse kõigi avaldatud peatükkide [[saksa||tõlge]] paaridest.
  * Lekkekontroll: kui mõni mitte-tasuta või avaldamata allikas on gitis jälgitav, ehitus katkeb.
  Ainult Node'i sisseehitatud moodulid, sõltuvusi pole.
*/
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { pbkdf2Sync, randomBytes, createCipheriv, createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAAMAT = process.argv[2] || "raudvaal";
const SRC = path.join(ROOT, "content", RAAMAT);
const OUT = path.join(ROOT, RAAMAT, "sisu");
const PILDID = path.join(ROOT, "assets", RAAMAT);
const KOOD_ENV = RAAMAT.toUpperCase() + "_KOOD";
const KOOD = process.env[KOOD_ENV];
const ITER = 600000;

function fail(msg) { console.error("VIGA: " + msg); process.exit(1); }

/* ---------- frontmatter ---------- */
function parseSource(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) fail("frontmatter puudub");
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let v = kv[2].trim();
    if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
    else if (v === "true") v = true;
    else if (v === "false") v = false;
    else if (/^-?\d+$/.test(v)) v = Number(v);
    else if (v === "" || v === "null") v = null;
    fm[kv[1]] = v;
  }
  return { fm, body: m[2] };
}

/* ---------- markdown -> html ---------- */
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");

function inline(text, bubbles) {
  const found = [];
  text = text.replace(/\[\[([\s\S]+?)\|\|([\s\S]+?)\]\]/g, (m, a, b) => {
    found.push([a.trim().replace(/\s+/g, " "), b.trim().replace(/\s+/g, " ")]);
    return "\u0000" + (found.length - 1) + "\u0000";
  });
  let html = esc(text);
  html = html.replace(/(?<![\\*])\*(?!\s)([^*]+?)(?<!\s)\*(?!\*)/g, "<em>$1</em>");   /* *kaldkiri* */
  html = html.replace(/\\(&gt;|&lt;|[\\`*_{}\[\]()#+\-.!'"])/g, "$1");                 /* pandoci varjestus */
  html = html.replace(/(?<!-)--(?!-)/g, "–");
  html = html.replace(/\u0000(\d+)\u0000/g, (m, i) => {
    const [a, b] = found[Number(i)];
    bubbles.push([a, b]);
    return `<span class="saksa" tabindex="0" role="button" aria-expanded="false" data-tolge="${escAttr(b)}">${esc(a)}</span>`;
  });
  return html;
}

function toHtml(body, bubbles) {
  const blocks = body.replace(/\r\n/g, "\n").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((b) => {
    if (/^(\\?\*\s*){1,3}$/.test(b) || /^-{3,}$/.test(b)) return "<hr>";
    return "<p>" + inline(b.replace(/\s*\n\s*/g, " "), bubbles) + "</p>";
  }).join("\n");
}

/* ---------- krüpto ---------- */
const salt = createHash("sha256").update("meisterwulf/" + RAAMAT).digest().subarray(0, 16);   /* avalik, püsiv */
let key = null;
function encrypt(text) {
  if (!key) {
    if (!KOOD) fail(`kood puudub: käivita  ${KOOD_ENV}='…' node scripts/build-raudvaal.mjs`);
    key = pbkdf2Sync(KOOD.normalize("NFC"), salt, ITER, 32, "sha256");
  }
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(text, "utf8"), c.final(), c.getAuthTag()]);   /* WebCrypto ootab ct||tag */
  return { iv: iv.toString("base64"), ct: ct.toString("base64") };
}

/* ---------- ehitus ---------- */
const reg = JSON.parse(readFileSync(path.join(SRC, "sisukord.json"), "utf8"));
const files = existsSync(SRC) ? readdirSync(SRC).filter((f) => /^\d\d-.*\.md$/.test(f)) : [];
let tracked = [];
try { tracked = execSync("git ls-files -- " + JSON.stringify(path.relative(ROOT, SRC)), { cwd: ROOT, encoding: "utf8" }).split(/\r?\n/).filter(Boolean).map((f) => path.basename(f)); } catch (e) { /* ilma gitita */ }

mkdirSync(OUT, { recursive: true });
const toc = [];
const glossary = new Map();
const summary = [];
let leaks = [];

for (const p of reg.peatukid) {
  const prefix = String(p.ord).padStart(2, "0") + "-";
  const file = files.find((f) => f.startsWith(prefix));
  const row = { slug: p.slug, number: p.number, pealkiri: p.pealkiri, ord: p.ord, osa: p.osa, free: !!p.free, published: false, mustand: false, dateline: null };
  if (!file) { toc.push(row); summary.push(`${(p.number || "Proloog").padEnd(7)} ${p.pealkiri.padEnd(22)} tulekul (allikat pole)`); continue; }

  const { fm, body } = parseSource(readFileSync(path.join(SRC, file), "utf8"));
  const free = fm.free === true;
  const published = fm.published !== false;
  if ((!free || !published) && tracked.includes(file)) leaks.push(file);

  const bubbles = [];
  const html = toHtml(body, bubbles);
  const illu = fm.illustration && existsSync(path.join(PILDID, fm.illustration)) ? `/assets/${RAAMAT}/${fm.illustration}` : null;
  const chapter = { slug: p.slug, number: p.number, title: fm.title || p.pealkiri, ord: p.ord, part_ord: p.osa, part: fm.part || null,
                    dateline: fm.dateline || null, free, published, illustration: illu };
  row.free = free; row.published = published; row.mustand = !published; row.dateline = chapter.dateline;

  let mode;
  if (free && published) { chapter.html = html; mode = "avatekst"; }
  else { chapter.enc = encrypt(html); mode = published ? "krüpteeritud" : "krüpteeritud, MUSTAND"; }
  writeFileSync(path.join(OUT, p.slug + ".json"), JSON.stringify(chapter, null, 1) + "\n");

  if (published) for (const [a, b] of bubbles) {
    const k = a.toLowerCase();
    if (!glossary.has(k)) glossary.set(k, { saksa: a, tolge: b, peatukid: [] });
    const g = glossary.get(k);
    const nr = p.number || "Proloog";
    if (!g.peatukid.includes(nr)) g.peatukid.push(nr);
    if (g.tolge !== b) summary.push(`  märkus: „${a}” on tõlgitud mitut moodi; sõnastikus esimene`);
  }
  toc.push(row);
  summary.push(`${(p.number || "Proloog").padEnd(7)} ${p.pealkiri.padEnd(22)} ${mode}, ${bubbles.length} mulli  <- ${file}`);
}

if (leaks.length) fail(`need allikad on gitis jälgitavad, aga ei ole tasuta+avaldatud: ${leaks.join(", ")}\n  Eemalda: git rm --cached content/${RAAMAT}/<fail>  (fail ise jääb kettale)`);

const kontroll = toc.some((r) => r.published && !r.free) || toc.some((r) => r.mustand) ? encrypt("ok") : null;
const sisukord = { raamat: reg.raamat, sari: reg.sari, osad: reg.osad,
                   kdf: { salt: Buffer.from(salt).toString("base64"), iter: ITER }, kontroll, peatukid: toc };
writeFileSync(path.join(OUT, "sisukord.json"), JSON.stringify(sisukord, null, 1) + "\n");

const sonastik = [...glossary.values()].sort((x, y) => x.saksa.localeCompare(y.saksa, "de"));
writeFileSync(path.join(OUT, "sonastik.json"), JSON.stringify(sonastik, null, 1) + "\n");

console.log(`Ehitatud: ${path.relative(ROOT, OUT)}/  (${toc.filter((r) => r.published).length} avaldatud peatükki ${toc.length - 1}-st, sõnastikus ${sonastik.length} väljendit)`);
for (const s of summary) console.log("  " + s);
if (!kontroll) console.log("  (krüpteeritud sisu pole; koodi ei olnud vaja)");
