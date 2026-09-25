#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Käsikirja import: .odt/.docx -> content/<raamat>/NN-pealkirjaslug.md

    python3 scripts/import-kasikiri.py kasikiri/Meister_Wulf_Raudvaal_II_Poeg_mundris.odt --nr 2
    python3 scripts/import-kasikiri.py fail.docx --nr 0                  # proloog
    python3 scripts/import-kasikiri.py fail.odt --nr 5 --mustand         # published: false
    python3 scripts/import-kasikiri.py fail.odt --nr 5 --raport /kuhugi/raport.md

Mida tehakse:
  * pandoc teisendab faili markdowniks (jutumärgid ja kriipsud jäävad nagu käsikirjas);
  * faili alguse pealkirjaread (raamatu nimi, number, peatüki pealkiri) jäetakse ära,
    need tulevad registrist content/<raamat>/sisukord.json; kaldkirjas kuupäevarida
    läheb frontmatteri väljaks `dateline`;
  * joonealune märkus, mis järgneb saksakeelsele tsitaadile „…”, muutub tõlkemulliks:
        „Jawohl, Herr Kaleun.”[^3]  ->  „[[Jawohl, Herr Kaleun.||„Just nii, härra kaptenleitnant.”]]”
    (kui ühes lõigus on enne viidet mitu saksakeelset tsitaati, saavad kõik sama tõlke);
  * üksik * omaette real on stseenivahe -> ***;
  * autori seletusviide (ülaindeksis [n] linkina pealkirjale) -> marker [[#pealkirja-slug]];
    faili lõpus olev osa „Infomullid ja allikad” (## N Pealkiri, tekst, **tootmismärkused**,
    Autorimärge:, Allikas: lingid) loetakse sisse ja kirjutatakse content/<raamat>/lisad.json
    faili (marker + peatukk); olemasolevaid kirjeid ei kirjutata üle ilma --uuenda-lisad;
    Commonsi faililehe link saab pilt_url väljaks, pildi toob scripts/pildid.py too;
  * lõpus raport: saksapärased tsitaadid, millel joonealust tõlget ei ole. Need saavad mulli
    ehituse ajal tõlkesõnastikust content/<raamat>/saksa-tolked.json (kõik saksakeelsed sõnad
    ja laused peavad olema mullidega); ehitus raporteerib, mis sõnastikust puudub.

Pandoc: süsteemi `pandoc` või `pip install pypandoc_binary`.
Pärast importi: node scripts/build-raudvaal.mjs (vt README).
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Saksa keele tunnussõnad (väiketähtedega). "ja" on meelega väljas: eesti sidesõna.
GERMAN = set("""
der die das den dem des ein eine einen einem einer und oder nicht ist sind war waren wird werden
hat haben sein bin bist ich du er es wir ihr mich mir dich dir uns euch ihn ihm ihnen sich
herr frau zum zur zu auf aus mit für von bei nach vor über unter im am bis ohne gegen durch
kein keine keinen keinem keiner noch schon jetzt hier dort dann wenn dass was wer wie wo warum
alle alles nichts etwas auch nur mehr sehr gut nein bitte danke bleibt bleiben kommen kommt geht
gehen mann leute schiff boot befehl wache kaleun oberleutnant leutnant kommandant sie
sehen danach weiter alles ordnung jawohl papiere bitte öffnen zuerst langsam bringen seine meinen
verstanden heißt unterschrift beide achtern zeigt wohin gleich mein setzt vorläufig klar ablegen
wie viele festhalten jungen zwei hierher unten ihren plätzen rucken unser sachen ganz strümpfe
""".split())

# Eesti keele tunnussõnad: joonealuse ees olev tsitaat saab tõlke, kui see EI ole eestikeelne.
# ("see" on väljas: saksa "zur See".)
ESTONIAN = set("""
ja on ei ta kas mis kui siis oma ka aga et või mida kes nii seda olen oled tema meie teie nad
ma sa me te ole olid oli need selle sellele minu sinu tal mul sul kus kuhu miks kuidas juba veel
ainult midagi keegi mitte nüüd sest siia sinna seal siin kõik
""".split())

QUOTE = re.compile(r"„([^„”]+)”")
MARK = re.compile(r"\[\^(\d+)\]")
NOTE_DEF = re.compile(r"^\[\^(\d+)\]:\s*(.*)$")
ITALIC_LINE = re.compile(r"^\*([^*].*?)\*$")
SCENE_BREAK = re.compile(r"^(\\?\*\s*){1,3}$")
# autori seletusviide: ülaindeksis [n], mis on link infomulli pealkirjale. Pandoc annab kaks kuju:
#   [^\[4\]^](#käsilood)        ja        ^ [\[2\]](#mida-tähendas-internimine)^
SUP_LINK = re.compile(r"\[\^\\\[(\d+)\\\]\^\]\(#([^)]+)\)|\^\s*\[\\\[(\d+)\\\]\]\(#([^)]+)\)\^")
INFO_HEAD = re.compile(r"^#+\s*Infomullid\b", re.I)
SUB_HEAD = re.compile(r"^##\s*(\d+)\s+(.+?)\s*$")
MD_LINK = re.compile(r"\[\[?([^\]]+?)\]?(?:\{\.underline\})?\]\((https?://[^)\s]+)\)")


def pandoc_slug(title: str) -> str:
    """Pandoci automaatne pealkirja-id: väiketähed, tühik -> sidekriips, algusest numbrid maha."""
    t = title.lower()
    t = re.sub(r"[^\w\s\-.]", "", t)
    t = re.sub(r"\s+", "-", t.strip())
    t = re.sub(r"^[^a-zäöüõšž]+", "", t)
    return t


def parse_infomullid(lines):
    """Autori osa „Infomullid ja allikad” faili lõpus -> (kehareead, kirjed).
    Kirje: pealkiri, tekst (lõigud), markused (tootmismärkused, ei näidata), allikad (lingid),
    pilt_url (Commonsi failileht, kui viidatud), pildi_allikas (Autorimärge), pildi_allkiri."""
    start = next((i for i, ln in enumerate(lines) if INFO_HEAD.match(ln.strip())), None)
    if start is None:
        return lines, []
    entries, cur = [], None
    for ln in lines[start + 1:]:
        s = ln.strip()
        m = SUB_HEAD.match(s)
        if m:
            cur = {"nr": int(m.group(1)), "pealkiri": m.group(2).strip(), "marker": pandoc_slug(m.group(2)),
                   "tekst": [], "markused": [], "allikad": []}
            entries.append(cur)
            continue
        if cur is None or not s:
            continue
        if s.startswith("Allikas:"):
            for lm in MD_LINK.finditer(s):
                text = re.sub(r"\{\.underline\}", "", lm.group(1)).strip("[] ")
                url = lm.group(2)
                cur["allikad"].append({"tekst": text, "url": url})
                if ("commons.wikimedia.org/wiki/File:" in url or "upload.wikimedia.org" in url) and "pilt_url" not in cur:
                    cur["pilt_url"] = url
            continue
        if s.startswith("Autorimärge:"):
            cur["pildi_allikas"] = s[len("Autorimärge:"):].strip()
            continue
        if s.startswith("**"):
            cur["markused"].append(s.replace("**", ""))
            pm = re.search(r"Pildiallkiri:\s*„([^”]+)”", s)
            if pm:
                cur["pildi_allkiri"] = pm.group(1)
            continue
        cur["tekst"].append(s)
    return lines[:start], entries


def pandoc_path():
    p = shutil.which("pandoc")
    if p:
        return p
    try:
        import pypandoc  # type: ignore
        return pypandoc.get_pandoc_path()
    except Exception:
        sys.exit("pandoc puudub: paigalda pandoc või `python3 -m pip install pypandoc_binary`")


def to_markdown(src: Path) -> str:
    r = subprocess.run([pandoc_path(), str(src), "-t", "markdown-smart", "--wrap=none"],
                       check=True, capture_output=True, text=True, encoding="utf-8")
    return r.stdout


def slugify(s: str) -> str:
    s = s.lower().replace("õ", "o").replace("ä", "a").replace("ö", "o").replace("ü", "u").replace("š", "s").replace("ž", "z")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "peatukk"


def looks_estonian(text: str) -> bool:
    words = re.findall(r"[a-zõäöüšž]+", text.lower())
    return any(c in text for c in "õšž") or any(w in ESTONIAN for w in words)


def looks_german(text: str) -> bool:
    words = re.findall(r"[a-zäöüß]+", text.lower())
    if not words:
        return False
    hits = sum(1 for w in words if w in GERMAN)
    return "ß" in text or hits >= 2 or (hits >= 1 and len(words) <= 3)


def split_notes(lines):
    """Eraldab joonealuste definitsioonid ([^n]: …) kehast."""
    body, notes, cur = [], {}, None
    for ln in lines:
        m = NOTE_DEF.match(ln)
        if m:
            cur = m.group(1)
            notes[cur] = m.group(2).strip()
            continue
        if cur is not None and (ln.startswith("    ") and ln.strip()):
            notes[cur] += " " + ln.strip()          # mitmerealine märkus
            continue
        if cur is not None and not ln.strip():
            continue                                 # tühi rida märkuste vahel
        cur = None
        body.append(ln)
    for k, v in notes.items():
        v = re.sub(r"\s+", " ", v).strip()
        if "||" in v or "]]" in v:
            print(f"HOIATUS: joonealune {k} sisaldab '||' või ']]', kontrolli käsitsi", file=sys.stderr)
        notes[k] = v
    return body, notes


def strip_header(body, expected_title, warnings):
    """Jätab ära pealkirjaread faili algusest; tagastab (dateline, read)."""
    head = []
    for i, ln in enumerate(body[:12]):
        m = ITALIC_LINE.match(ln.strip())
        if m:
            dateline = m.group(1).strip()
            head = [h for h in body[:i] if h.strip()]
            body = body[i + 1:]
            break
    else:
        dateline = None
        i = 0
        while i < len(body) and (not body[i].strip() or re.match(r"^(#|\d+\.\s|[IVXL]+$|Meister Wulf)", body[i].strip())):
            if body[i].strip():
                head.append(body[i])
            i += 1
        body = body[i:]
        warnings.append("kuupäevarida (kaldkirjas rida faili alguses) ei leitud; dateline jääb tühjaks")
    for h in head:
        t = re.sub(r"^(#+\s*|\d+\.\s+)", "", h.strip())
        if t and t.lower() != expected_title.lower() and not re.match(r"^[IVXL]+$", t) and "Meister Wulf" not in t:
            warnings.append(f"faili pealkirjarida „{t}” erineb registri pealkirjast „{expected_title}”")
    return dateline, body


def bubble_paragraph(par, notes, lineno, warnings):
    out, pos = [], 0
    for m in MARK.finditer(par):
        seg = par[pos:m.start()]
        note = notes.get(m.group(1))
        pos = m.end()
        if note is None:
            warnings.append(f"rida {lineno}: joonealuse [^{m.group(1)}] definitsiooni ei leitud")
            out.append(seg)
            continue
        quotes = list(QUOTE.finditer(seg))
        chosen = [q for q in quotes if not looks_estonian(q.group(1))]
        if not chosen and quotes:
            chosen = quotes[-1:]
            warnings.append(f"rida {lineno}: tsitaat „{quotes[-1].group(1)[:50]}…” paistab eestikeelne, aga sai tõlke [^{m.group(1)}]")
        if not chosen:
            sm = re.search(r"([^.!?„”]+[.!?]?)\s*$", seg)
            if sm and sm.group(1).strip():
                a, b = sm.start(1), sm.end(1)
                warnings.append(f"rida {lineno}: joonealune [^{m.group(1)}] ei järgne tsitaadile; märgistasin lause „{seg[a:b].strip()[:50]}”")
                out.append(seg[:a] + "[[" + seg[a:b].strip() + "||" + note + "]]" + seg[b:])
            else:
                warnings.append(f"rida {lineno}: joonealusele [^{m.group(1)}] ei leidnud kohta, jätsin tõlke välja")
                out.append(seg)
            continue
        rebuilt, last = "", 0
        for q in chosen:
            rebuilt += seg[last:q.start(1)] + "[[" + q.group(1).strip() + "||" + note + "]]"
            last = q.end(1)
        out.append(rebuilt + seg[last:])
    out.append(par[pos:])
    return "".join(out)


def report_unmarked(body):
    found = []
    for i, ln in enumerate(body, 1):
        plain = re.sub(r"\[\[.*?\]\]", "", ln)
        for q in QUOTE.finditer(plain):
            if looks_german(q.group(1)):
                found.append((i, q.group(1)))
    return found


def main():
    ap = argparse.ArgumentParser(description="Käsikirja import (.odt/.docx -> markdown tõlkemullidega)")
    ap.add_argument("fail", type=Path)
    ap.add_argument("--nr", type=int, required=True, help="peatüki number (0 = proloog)")
    ap.add_argument("--raamat", default="raudvaal")
    ap.add_argument("--mustand", action="store_true", help="published: false (avalikkusele tulekul, koodiga loetav)")
    ap.add_argument("--raport", type=Path, help="kirjuta märgistamata saksapäraste kohtade raport siia faili")
    ap.add_argument("--valjund", type=Path, help="kirjuta mujale kui content/<raamat>/")
    ap.add_argument("--uuenda-lisad", action="store_true", help="kirjuta autori infomullid lisad.json faili üle ka siis, kui need seal juba on")
    a = ap.parse_args()

    reg_path = ROOT / "content" / a.raamat / "sisukord.json"
    reg = json.loads(reg_path.read_text(encoding="utf-8"))
    entry = next((p for p in reg["peatukid"] if p["ord"] == a.nr), None)
    if not entry:
        sys.exit(f"registris {reg_path} ei ole peatükki nr {a.nr}")
    part = next((o for o in reg["osad"] if o["ord"] == entry["osa"]), None)

    warnings = []
    md = to_markdown(a.fail)
    lines = md.replace("\r\n", "\n").split("\n")
    body, notes = split_notes(lines)
    body, infomullid = parse_infomullid(body)
    dateline, body = strip_header(body, entry["pealkiri"], warnings)

    out_lines, used = [], set()
    for i, ln in enumerate(body, 1):
        s = ln.strip()
        if not s:
            out_lines.append("")
            continue
        if SCENE_BREAK.match(s):
            out_lines.append("***")
            continue
        used.update(MARK.findall(s))
        s = SUP_LINK.sub(lambda m: "[[#" + (m.group(2) or m.group(4)) + "]]", s)      # seletusviide jääb markeriks [[#slug]]
        out_lines.append(bubble_paragraph(s, notes, i, warnings))
    for k in notes:
        if k not in used:
            warnings.append(f"joonealune [^{k}] on defineeritud, aga tekstis viidet pole: {notes[k][:60]}")

    text = "\n".join(out_lines).strip("\n")
    text = re.sub(r"\n{3,}", "\n\n", text) + "\n"

    fm = ["---",
          f'title: "{entry["pealkiri"]}"']
    if entry.get("number"):
        fm.append(f'number: "{entry["number"]}"')
    fm += [f'slug: "{entry["slug"]}"',
           f"ord: {entry['ord']}",
           f"part_ord: {entry['osa']}"]
    if part:
        fm.append(f'part: "{part["pealkiri"]}"')
    fm += [f"free: {'true' if entry.get('free') else 'false'}",
           f"published: {'false' if a.mustand else 'true'}"]
    if dateline:
        fm.append(f'dateline: "{dateline}"')
    fm.append("---")

    out_dir = a.valjund or (ROOT / "content" / a.raamat)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{a.nr:02d}-{slugify(entry['pealkiri'])}.md"
    out_path.write_text("\n".join(fm) + "\n\n" + text, encoding="utf-8")

    paras = sum(1 for l in out_lines if l and l != "***")
    markers = re.findall(r"\[\[#([^\]]+)\]\]", text)
    bubbles = text.count("[[") - len(markers)
    breaks = out_lines.count("***")
    print(f"{a.fail.name} -> {out_path.relative_to(ROOT) if out_path.is_relative_to(ROOT) else out_path}")
    print(f"  {paras} lõiku, {breaks} stseenivahet, {bubbles} tõlkemulli ({len(notes)} joonealust), dateline: {dateline or '—'}")
    if markers:
        print(f"  {len(markers)} autori seletusviidet tekstis: " + ", ".join(markers))
    if infomullid:
        lisad_path = ROOT / "content" / a.raamat / "lisad.json"
        lisad = json.loads(lisad_path.read_text(encoding="utf-8")) if lisad_path.exists() else []
        olemas = {(e.get("marker"), e.get("peatukk")) for e in lisad}
        added, kept = 0, 0
        for im in infomullid:
            key = (im["marker"], entry["ord"])
            if key in olemas and not a.uuenda_lisad:
                kept += 1
                continue
            lisad = [e for e in lisad if (e.get("marker"), e.get("peatukk")) != key]
            rec = {"marker": im["marker"], "peatukk": entry["ord"], "pealkiri": im["pealkiri"],
                   "tekst": "\n\n".join(im["tekst"])}
            for k in ("pilt_url", "pildi_allikas", "pildi_allkiri"):
                if im.get(k):
                    rec[k] = im[k]
            if im["allikad"]:
                rec["allikad"] = im["allikad"]
            if im["markused"]:
                rec["markused"] = im["markused"]
            lisad.append(rec)
            added += 1
            if im["marker"] not in markers:
                warnings.append(f"infomullil „{im['pealkiri']}” (#{im['marker']}) ei ole tekstis viidet")
        for mk in markers:
            if mk not in {im["marker"] for im in infomullid}:
                warnings.append(f"tekstis on viide [[#{mk}]], aga infomullide osas sellist pealkirja pole")
        lisad_path.write_text(json.dumps(lisad, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"  {len(infomullid)} autori infomulli -> content/{a.raamat}/lisad.json ({added} lisatud/uuendatud, {kept} jäi alles; ülekirjutamiseks --uuenda-lisad)")
        print("    pildid: " + ", ".join(f"{im['marker']} <- {im['pilt_url']}" for im in infomullid if im.get("pilt_url")) if any(im.get("pilt_url") for im in infomullid) else "    (Commonsi pildiviiteid pole)")
    for w in warnings:
        print("  HOIATUS: " + w)

    unmarked = report_unmarked(out_lines)
    if unmarked:
        print(f"  KONTROLLI: {len(unmarked)} saksapärast tsitaati ilma tõlketa:")
        for i, q in unmarked:
            print(f"    rida {i}: „{q}”")
    if a.raport:
        with a.raport.open("a", encoding="utf-8") as f:
            f.write(f"## {entry.get('number') or 'Proloog'} {entry['pealkiri']} ({a.fail.name})\n\n")
            f.write("Tõlkemullid (saksa -> tõlge):\n\n")
            for m in re.finditer(r"\[\[(.+?)\|\|(.+?)\]\]", text):
                f.write(f"- {m.group(1)}  →  {m.group(2)}\n")
            f.write("\nSaksapärased tsitaadid ilma tõlketa:\n\n")
            for i, q in unmarked:
                f.write(f"- rida {i}: „{q}”\n")
            if warnings:
                f.write("\nHoiatused:\n\n" + "".join(f"- {w}\n" for w in warnings))
            f.write("\n")
    if not entry.get("free"):
        print("  NB: tasuline peatükk. Faili EI tohi committida (.gitignore hoiab kinni); saidile läheb ainult krüpteeritud sisu.")


if __name__ == "__main__":
    main()
