#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pildid Wikimedia Commonsist lugemislehe lisamullide jaoks (content/<raamat>/lisad.json).

    python3 scripts/pildid.py too                       # kirjed, millel on pilt_url, aga pilti pole -> assets/<raamat>/pildid/
    python3 scripts/pildid.py too --uuenda               # too ka olemasolevad uuesti
    python3 scripts/pildid.py otsi "hand lead sounding line" 6 /kuhu/kandidaadid   # kandidaadid ülevaatamiseks (Commonsi otsing)
    python3 scripts/pildid.py otsi "en:Sounding line|de:Handlot|sv:Bohuslän" 8 /kuhu   # kandidaadid Vikipeedia artiklite piltidest

Lubatud litsentsid: avalik omand, CC0, CC BY, CC BY-SA (mitte NC/ND). Pilt vähendatakse 800 px laiuseks
JPEG-iks; kirje saab väljad pilt, pildi_allikas (autor / litsents, kui puudub), pildi_litsents_url, pildi_leht.
Litsentsi nõuded (autor, litsentsilink, märge muutmise kohta) kuvatakse mullis pildi all.
"""
import argparse, io, json, re, sys, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = "https://commons.wikimedia.org/w/api.php"
UA = "meisterwulf-raudvaal/1.0 (https://meisterwulf.com; meister.wulf@pm.me)"
LICENSE_OK = re.compile(r"^(public domain|pd\b|cc0|cc[ -]by(-sa)?([ -]\d\.\d)?([ -][a-z]{2})?)", re.I)


import time
_last = [0.0]
def api(params, base=API):
    """Üks päring korraga, viisakas paus, 429/5xx korral ootab ja proovib uuesti."""
    q = dict(params, format="json", formatversion="2", maxlag=5)
    req = urllib.request.Request(base + "?" + urllib.parse.urlencode(q), headers={"User-Agent": UA})
    for wait in (0, 30, 90, 180, 300):
        if wait:
            print(f"    (Commons: ootan {wait} s ja proovin uuesti)")
            time.sleep(wait)
        gap = 8.0 - (time.time() - _last[0])
        if gap > 0:
            time.sleep(gap)
        _last[0] = time.time()
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as ex:
            if ex.code not in (429, 500, 502, 503, 504):
                raise
    raise SystemExit("Commons ei vasta (429/5xx), proovi hiljem uuesti")


def fetch(url, path: Path):
    """Pildifail. upload.wikimedia.org teenindab robotitele ainult standardlaiuses pisipilte
    (20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840 px); originaal ja muud laiused annavad 429/400.
    imageinfo API iiurlwidth ümardatakse ise lähima standardlaiuseni."""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for wait in (0, 30, 90, 180, 300):
        if wait:
            print(f"    (upload.wikimedia: ootan {wait} s)"); time.sleep(wait)
        time.sleep(6)
        try:
            with urllib.request.urlopen(req, timeout=120) as r, open(path, "wb") as f:
                f.write(r.read())
            return
        except urllib.error.HTTPError as ex:
            if ex.code not in (429, 500, 502, 503, 504):
                raise
    raise SystemExit("upload.wikimedia.org ei vasta (429), proovi hiljem")


def title_from_url(url):
    m = re.search(r"/wiki/(File:[^?#]+)", url)
    if m:
        return urllib.parse.unquote(m.group(1)).replace("_", " ")
    m = re.search(r"/commons/(?:thumb/)?[0-9a-f]/[0-9a-f]{2}/([^/]+)", url)
    if m:
        return "File:" + urllib.parse.unquote(m.group(1)).replace("_", " ")
    sys.exit(f"ei oska failinime leida: {url}")


IIPROPS = {"prop": "imageinfo", "iiprop": "url|extmetadata|size|mime",
           "iiextmetadatafilter": "LicenseShortName|LicenseUrl|Artist|Credit|ImageDescription|Attribution|DateTimeOriginal"}


def _info_from_page(page):
    if "imageinfo" not in page:
        return None
    ii = page["imageinfo"][0]
    md = {k: v.get("value", "") for k, v in ii.get("extmetadata", {}).items()}
    strip = lambda h: re.sub(r"<[^>]+>", "", h or "").strip()
    return {"title": page["title"], "thumb": ii.get("thumburl") or ii["url"], "url": ii["url"],
            "leht": ii.get("descriptionurl"), "w": ii.get("width"), "h": ii.get("height"), "mime": ii.get("mime"),
            "litsents": strip(md.get("LicenseShortName")), "litsents_url": md.get("LicenseUrl", ""),
            "autor": strip(md.get("Artist")), "credit": strip(md.get("Credit")), "attribution": strip(md.get("Attribution")),
            "kirjeldus": strip(md.get("ImageDescription"))[:300], "aeg": md.get("DateTimeOriginal", "")}


def imageinfo(title, width=1280):
    d = api(dict(IIPROPS, action="query", titles=title, iiurlwidth=width))
    pages = d["query"]["pages"]
    return _info_from_page(pages[0]) if pages else None


def imageinfo_many(titles, width=500):
    """Kuni 50 faili ühe päringuga."""
    out = []
    for i in range(0, len(titles), 50):
        d = api(dict(IIPROPS, action="query", titles="|".join(titles[i:i + 50]), iiurlwidth=width))
        for pg in d["query"]["pages"]:
            info = _info_from_page(pg)
            if info:
                out.append(info)
    return out


def search_titles(query, limit):
    """Commonsi failiotsing (üks päring) -> failinimed."""
    d = api({"action": "query", "list": "search", "srsearch": query, "srnamespace": 6, "srlimit": limit})
    return [h["title"] for h in d["query"]["search"] if re.search(r"\.(jpe?g|png|tiff?)$", h["title"], re.I)]


def article_images(spec):
    """'en:Bohuslän' -> selle Vikipeedia artikli pildifailid (kureeritud, asjakohased)."""
    lang, _, title = spec.partition(":")
    d = api({"action": "query", "titles": title, "prop": "images", "imlimit": 60, "redirects": 1}, base=f"https://{lang}.wikipedia.org/w/api.php")
    out = []
    for pg in d["query"].get("pages", []):
        for im in pg.get("images", []):
            t = im["title"]
            if re.search(r"\.(jpe?g|png|tiff?)$", t, re.I) and not re.search(r"icon|logo|flag|wiki|symbol|commons-|edit-|ambox|pictogram|map[_ -]?pin", t, re.I):
                out.append(t)
    return out


def slugify(s):
    s = s.lower().replace("õ", "o").replace("ä", "a").replace("ö", "o").replace("ü", "u").replace("š", "s").replace("ž", "z")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "pilt"


def save_resized(src: Path, dst: Path, width=800):
    from PIL import Image
    im = Image.open(src).convert("RGB")
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(dst, "JPEG", quality=84, optimize=True, progressive=True)
    return im.size


def cmd_too(raamat, uuenda):
    lisad_path = ROOT / "content" / raamat / "lisad.json"
    lisad = json.loads(lisad_path.read_text(encoding="utf-8"))
    outdir = ROOT / "assets" / raamat / "pildid"
    outdir.mkdir(parents=True, exist_ok=True)
    tmp = outdir / ".tmp"
    n = 0
    for e in lisad:
        if not e.get("pilt_url") or (e.get("pilt") and not uuenda):
            continue
        name = e.get("marker") or slugify(e.get("saksa", "pilt"))
        info = imageinfo(title_from_url(e["pilt_url"]))
        if not info:
            print(f"  {name}: Commonsist ei leitud {e['pilt_url']}")
            continue
        if not LICENSE_OK.match(info["litsents"] or ""):
            print(f"  {name}: litsents „{info['litsents']}” ei ole lubatud, jätan vahele")
            continue
        fetch(info["thumb"], tmp)
        dst = outdir / f"{name}.jpg"
        size = save_resized(tmp, dst)
        tmp.unlink(missing_ok=True)
        e["pilt"] = dst.name
        e["pildi_leht"] = info["leht"] or e["pilt_url"]
        if info["litsents_url"]:
            e["pildi_litsents_url"] = info["litsents_url"]
        if not e.get("pildi_allikas"):
            autor = info["attribution"] or info["autor"] or info["credit"] or "Wikimedia Commons"
            e["pildi_allikas"] = f"{autor} / {info['litsents']}".strip(" /")
        e["pildi_litsents"] = info["litsents"]
        print(f"  {name}: {dst.relative_to(ROOT)} {size[0]}x{size[1]} | {info['litsents']} | {e['pildi_allikas'][:80]}")
        n += 1
    lisad_path.write_text(json.dumps(lisad, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"toodud {n} pilti")


def cmd_otsi(query, n, outdir: Path):
    outdir.mkdir(parents=True, exist_ok=True)
    titles = []
    if re.match(r"^[a-z]{2,3}:", query):                  # "en:Artikkel|de:Artikel": artiklite pildid
        for spec in query.split("|"):
            titles += article_images(spec.strip())
    else:
        titles = search_titles(query, max(n * 4, 12))
    seen, uniq = set(), []
    for t in titles:
        if t not in seen:
            seen.add(t); uniq.append(t)
    found = []
    for info in imageinfo_many(uniq[:60]):
        if not LICENSE_OK.match(info["litsents"] or "") or (info["w"] or 0) < 500 or not (info["mime"] or "").startswith("image/"):
            continue
        idx = len(found) + 1
        path = outdir / f"{idx:02d}.jpg"
        try:
            fetch(info["thumb"], path)
        except Exception as ex:
            print("  ei saanud tuua:", info["title"], ex)
            continue
        info["fail"] = str(path)
        found.append(info)
        if len(found) >= n:
            break
    (outdir / "kandidaadid.json").write_text(json.dumps(found, ensure_ascii=False, indent=1), encoding="utf-8")
    for i, f in enumerate(found, 1):
        print(f"  {i:02d}. {f['title']} | {f['litsents']} | {f['w']}x{f['h']} | {f['kirjeldus'][:90]}")
    print(f"{len(found)} kandidaati -> {outdir}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("too"); t.add_argument("--raamat", default="raudvaal"); t.add_argument("--uuenda", action="store_true")
    o = sub.add_parser("otsi"); o.add_argument("query"); o.add_argument("n", type=int, nargs="?", default=6); o.add_argument("outdir", type=Path)
    a = ap.parse_args()
    if a.cmd == "too":
        cmd_too(a.raamat, a.uuenda)
    else:
        cmd_otsi(a.query, a.n, a.outdir)
