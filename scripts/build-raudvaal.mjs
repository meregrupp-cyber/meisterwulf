#!/usr/bin/env node
/*
  Lugemislehe sisu ehitus: content/<raamat>/*.md -> <raamat>/sisu/*.json

      RAUDVAAL_KOOD='…' node scripts/build-raudvaal.mjs            # raamat: raudvaal
      RAUDVAAL_KOOD='…' node scripts/build-raudvaal.mjs raudvaal

  * Tasuta ja avaldatud peatükid (free: true, published: true) lähevad avatekstina (html).
  * Tasulised ja avaldamata (mustand) peatükid krüpteeritakse: AES-256-GCM, võti
    tuletatakse koodist PBKDF2-SHA256-ga (600 000 iteratsiooni, sool on avalik).
    Brauser (raudvaal/loe.js) tuletab sama võtme koodist ja avab sisu kohapeal.
  * Tõlkesõnastik content/<raamat>/saksa-tolked.json ({saksa, tolge, liik}) rakendatakse igale
    peatükile: iga kirje iga esinemine tekstis (väljaspool autori enda [[…]] mulle) saab mulli.
    liik "sona" haarab kaasa ka eesti käändelõpu (Kaleun -> Kaleunile). Pikem kirje enne lühemat.
    Ehitus raporteerib kirjed, mis ei esine kuskil, ja saksapärased tsitaadid, millel mulli pole.
  * Lisamullid content/<raamat>/lisad.json: seletus, pilt (assets/<raamat>/pildid/) või heli
    (assets/<raamat>/heli/). Kaks kuju: {saksa, liik} -> sõna tekstis saab mulli nagu tõlkegi;
    {marker, peatukk} -> autori infomulli viide [[#marker]] tekstis saab ikoonimärgi.
    Liik (ikoon) tuletatakse sisust: heli > pilt > selgitus. Puuduv pilt/heli fail = hoiatus.
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

/* ---------- tõlkesõnastik ---------- */
const isWordChar = (c) => c !== undefined && /[\p{L}\p{N}]/u.test(c);
function protectedRanges(text) {
  const r = []; const re = /\[\[[\s\S]*?\]\]/g; let m;
  while ((m = re.exec(text))) r.push([m.index, m.index + m[0].length]);
  return r;
}
function inRange(ranges, i) { return ranges.some(([a, b]) => i >= a && i < b); }
function applyDictionary(body, dict, stats) {
  const entries = [...dict].filter((e) => e.saksa && e.tolge).sort((a, b) => b.saksa.length - a.saksa.length);
  for (const e of entries) {
    const ranges = protectedRanges(body);
    let out = "", pos = 0, count = 0;
    let idx = body.indexOf(e.saksa);
    while (idx !== -1) {
      let end = idx + e.saksa.length;
      const ok = !isWordChar(body[idx - 1]) && !inRange(ranges, idx) && !inRange(ranges, end - 1);
      if (ok && e.liik === "sona") {                        /* eesti käändelõpp jääb mulli sisse */
        const suf = /^[a-zäöõü]{1,5}(?![\p{L}])/u.exec(body.slice(end, end + 6));
        if (suf) end += suf[0].length;
      }
      if (ok && !isWordChar(body[end])) {
        out += body.slice(pos, idx) + "[[" + body.slice(idx, end) + "||" + e.tolge + "]]";
        pos = end; count++;
      }
      idx = body.indexOf(e.saksa, end);
    }
    body = out + body.slice(pos);
    stats.set(e.saksa, (stats.get(e.saksa) || 0) + count);
  }
  return body;
}
/* saksapärased tsitaadid, millel mulli pole (uue peatüki kontrolliks) */
const GERMAN = new Set("der die das den dem des ein eine einen einem einer und oder nicht ist sind war waren wird werden hat haben sein ich du er es wir ihr mich mir dich dir uns euch ihn ihm ihnen sich herr frau zum zur zu auf aus mit für bei nach vor über unter im am bis ohne gegen durch kein keine noch schon jetzt hier dort dann wenn dass was wer wie wo warum alle alles nichts etwas auch nur mehr sehr gut nein bitte danke bleibt bleiben kommen kommt geht gehen mann leute schiff boot befehl wache kaleun oberleutnant leutnant kommandant sie sehen danach weiter ordnung jawohl papiere öffnen zuerst langsam bringen seine meinen verstanden heißt unterschrift beide achtern zeigt wohin gleich mein setzt vorläufig klar ablegen viele festhalten jungen zwei hierher unten ihren plätzen rucken unser sachen ganz strümpfe weiß".split(" "));
const ESTONIAN = new Set("ja on ei ta kas mis kui siis oma ka aga et või mida kes nii seda olen oled tema meie teie nad ma sa me te ole olid oli need selle minu sinu tal mul sul kus kuhu miks kuidas juba veel ainult midagi keegi mitte nüüd sest siia sinna seal siin kõik sind".split(" "));
function looksGerman(t) {
  const words = t.toLowerCase().match(/[a-zäöüß]+/g) || [];
  if (!words.length || /[õšž]/.test(t) || words.some((w) => ESTONIAN.has(w))) return false;
  const hits = words.filter((w) => GERMAN.has(w)).length;
  return t.includes("ß") || hits >= 2 || (hits >= 1 && words.length <= 3);
}
function unmarkedGerman(body) {
  const plain = body.replace(/\[\[[\s\S]*?\]\]/g, "◊");          /* olemasolev mull = ◊ */
  const found = []; const re = /„([^„”]+)”/g; let m;
  while ((m = re.exec(plain))) if (looksGerman(m[1]) && !/ALAR+M!/.test(m[1])) found.push(m[1].replace(/◊/g, "…"));
  return found;
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
  html = html.replace(/\[\[#([^\]]+)\]\]/g, (m, slug) => {
    const e = lisaMarkers.find((x) => x.marker === slug && x.peatukk === CUR.ord) || lisaMarkers.find((x) => x.marker === slug);
    if (!e) { kontrolli.push(`${CUR.number || "Proloog"}: seletusviide [[#${slug}]] ilma kirjeta lisad.json failis`); return ""; }
    CUR.markersUsed.add(slug);
    return lisaSpan(e, "", true);
  });
  html = html.replace(/\u0000(\d+)\u0000/g, (m, i) => {
    const [a, b] = found[Number(i)];
    if (b.startsWith(LISA)) return lisaSpan(lisaTerms[Number(b.slice(1))], esc(a), false);
    bubbles.push([a, b]);
    return `<span class="saksa" tabindex="0" role="button" aria-expanded="false" data-liik="tolge" data-tolge="${escAttr(b)}">${esc(a)}</span>`;
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
let CUR = { ord: 0, number: null, markersUsed: new Set() };
const reg = JSON.parse(readFileSync(path.join(SRC, "sisukord.json"), "utf8"));
const dictPath = path.join(SRC, "saksa-tolked.json");
const dict = existsSync(dictPath) ? JSON.parse(readFileSync(dictPath, "utf8")) : [];
const dictStats = new Map();
const kontrolli = [];
const lisadPath = path.join(SRC, "lisad.json");
const lisad = existsSync(lisadPath) ? JSON.parse(readFileSync(lisadPath, "utf8")) : [];
const lisaTerms = lisad.filter((e) => e.saksa);
const lisaMarkers = lisad.filter((e) => e.marker);
const lisaStats = new Map();
const LISA = "\u0002";                              /* [[tekst||\u0002N]] = lisamull nr N */
const hoiatused = [];
function lisaFail(kind, name) {
  if (!name) return null;
  const rel = `/assets/${RAAMAT}/${kind}/${name}`;
  if (!existsSync(path.join(ROOT, "assets", RAAMAT, kind, name))) { hoiatused.push(`${kind}/${name} puudub`); return null; }
  return rel;
}
function lisaSpan(e, inner, iconOnly) {
  const heli = lisaFail("heli", e.heli), pilt = lisaFail("pildid", e.pilt);
  const liik = heli ? "heli" : pilt ? "pilt" : "selgitus";
  const a = [`class="lisa lisa--${liik}${iconOnly ? " lisa--markus" : ""}${e.klass ? " " + e.klass : ""}"`,
             `role="button" tabindex="0" aria-expanded="false" data-liik="${liik}"`];
  if (e.pealkiri) a.push(`data-pealkiri="${escAttr(e.pealkiri)}"`);
  a.push(`data-tolge="${escAttr(e.tekst || "")}"`);
  if (pilt) {
    a.push(`data-pilt="${pilt}"`);
    if (e.pildi_allkiri) a.push(`data-pildi-allkiri="${escAttr(e.pildi_allkiri)}"`);
    if (e.pildi_allikas) a.push(`data-pildi-allikas="${escAttr(e.pildi_allikas)}"`);
    if (e.pildi_litsents_url) a.push(`data-litsents="${escAttr(e.pildi_litsents_url)}"`);
    if (e.pildi_leht) a.push(`data-pildi-leht="${escAttr(e.pildi_leht)}"`);
  }
  if (heli) {
    a.push(`data-heli="${heli}"`);
    if (e.heli_allkiri) a.push(`data-heli-allkiri="${escAttr(e.heli_allkiri)}"`);
    if (e.helitugevus) a.push(`data-helitugevus="${e.helitugevus}"`);
  }
  if (e.allikad && e.allikad.length) a.push(`data-allikad="${escAttr(JSON.stringify(e.allikad))}"`);
  const label = iconOnly ? `<span class="sr-only">Lisa: ${esc(e.pealkiri || "selgitus")}</span>` : inner;
  return `<span ${a.join(" ")}>${label}</span>`;
}
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
  let marked = applyDictionary(body, dict, dictStats);
  marked = applyDictionary(marked, lisaTerms.map((e, i) => ({ saksa: e.saksa, liik: e.liik || "sona", tolge: LISA + i })), lisaStats);
  for (const q of unmarkedGerman(marked)) kontrolli.push(`${p.number || "Proloog"}: „${q}”`);
  CUR = { ord: p.ord, number: p.number, markersUsed: new Set() };
  const html = toHtml(marked, bubbles);
  for (const e of lisaMarkers) if (e.peatukk === p.ord && !CUR.markersUsed.has(e.marker)) kontrolli.push(`${p.number}: infomull „${e.pealkiri}” (#${e.marker}) ei ole tekstis viidatud`);
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
const sonad = new Set(dict.filter((e) => e.liik === "sona").map((e) => e.saksa));   /* üksiksõnad on varuks ka siis, kui praegu ei esine */
const unused = [...dictStats.entries()].filter(([k, n]) => n === 0 && !sonad.has(k)).map(([k]) => k);
console.log(`Tõlkesõnastik: ${dict.length} kirjet, ${[...dictStats.values()].reduce((a, b) => a + b, 0)} lisatud mulli` + (unused.length ? `; EI ESINE kuskil (${unused.length}): ${unused.map((u) => "„" + u + "”").join(", ")}` : ""));
const lisaUnused = [...lisaStats.entries()].filter(([k, n]) => n === 0).map(([k]) => lisaTerms[Number(k.length ? lisaTerms.findIndex((e) => e.saksa === k) : -1)]).filter(Boolean).map((e) => e.saksa);
console.log(`Lisamullid: ${lisaTerms.length} sõnakirjet (${[...lisaStats.values()].reduce((a, b) => a + b, 0)} mulli), ${lisaMarkers.length} autori infomulli` + (lisaUnused.length ? `; EI ESINE kuskil: ${lisaUnused.map((u) => "„" + u + "”").join(", ")}` : ""));
if (hoiatused.length) console.log("HOIATUS: puuduvad failid: " + [...new Set(hoiatused)].join(", "));
if (kontrolli.length) { console.log(`KONTROLLI: ${kontrolli.length} saksapärast tsitaati ilma mullita (lisa content/${RAAMAT}/saksa-tolked.json faili):`); for (const k of kontrolli) console.log("  " + k); }
