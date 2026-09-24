# meisterwulf.com

Staatiline sait domeenile **meisterwulf.com**: esileht ja kolm alalehte kolmes
keeles (eesti, inglise, hiina). Väliseid teeke ega fonte ei laadita; ainus
kolmanda osapoole sisu on kingsepa lehe YouTube'i video, mis laetakse alles
klõpsu peale.

**Majutus:** GitHub Pages · **DNS ja vahemälu:** Cloudflare
(sama seadistus nagu freedive.ee)

```
GitHub Pages            Cloudflare              külastaja
(serveerib faile)  <--  (proksib, vahemälu)  <--  meisterwulf.com
       ^
   see repo, haru juurkaustast
```

---

## Lehed

| Fail | Sisu |
|------|------|
| `index.html` | esileht — GIMP-i faili `temper.xcf` kompositsioon: taust, kolm keelesilti, kolm tervet fotokaarti, kiri kaartide all, Facebook |
| `shoemaker.html` | kingsepp (Kriuks): tekst, hind (alates 2500 €), protsess, video, galerii, kontakt |
| `mantis.html` | kung fu: treeningud (personaalne tund 20–40 € / h taseme järgi), koolituse sisu + treeningprogrammi PDF (avaneb uues aknas keele järgi), stiil, meister Wulf, liin, vormid, dokumendid (1991–92, 2023, duan 2026) |
| `books.html` | raamatud: „Meister Wulf“ (eesti k, ilmub okt 2026), „Raudvaal“ (e-raamat, järg, ilmub järjejutuna; proloog avaneb nupust „Loe proloogi“) ja 狼的印记 (hiina k) — tutvustus avaneb nupust „Loe raamatust“, pilk raamatusse, näidis-PDF; „Lola ja Lohe päästesalk“ (Markus Saksatamm, näidis nupust, ostulink Apollosse) |
| `404.html` | vealehekülg |

### Esilehe loogika

Paigutus järgib GIMP-i lõuendit 2912 × 1632 px. Kaks gruppi (sildid ja fotod)
on lõuendi koordinaatides protsentidena, tükid gruppide sees samuti — nii
püsivad siltide ülekatted (tere parem serv hello all) igal ekraanil õiged.
Kolm fotokaarti on terved ega kata üksteist. Püstisel ekraanil laotakse kaks
gruppi üksteise alla ja taust katab ekraani.

| Olek | Mis juhtub |
|------|------------|
| esmakülastus | inglise keel vaikimisi, kõik suured sildid 100%; vihje „Vali keel“ paremal üleval; fotod passiivsed (klõps paneb sildid korraks vilkuma) |
| keel valitud | valitud silt vilgub õrnalt 5×, jääb 100%; teised tuhmuvad 30% peale; vihje paremal üleval kaob; logo alla ilmub „Tagasi esilehele“ valitud keeles; fotod hakkavad laines helendama ja on klikitavad, nende all on kiri „Vali kaart, kuhu soovid minna“ (`body.is-wave`) |
| foto valitud | see vilgub kiiremini, teised kaovad; 2 s pärast avaneb alaleht `?lang=xx` |
| korduvkülastus | keel on `localStorage`-is (või URL-is) meeles: suuri silte ei näidata, paremal üleval on väike keelevalik nagu alalehtedel, fotod on kohe aktiivsed |
| logo | link esilehele (korduvkülastajale avaneb see juba ilma keeleküsimuseta) |

Klikitav ala on iga tüki tegelik kuju (`clip-path: polygon`), mitte
ristkülik — nii ei jää läbipaistev nurk teise tüki ette. Kolm kaarti on
terved (ei kata üksteist): kingsepp `shoemaker.webp`, kung fu
`mantis-card.webp`, raamatud `books-card.webp`. Sama kung fu kaart on
`mantis.html` päises.

### Keeled

Iga tekst on lehel kolmes keeles, iga keel oma elemendis: `data-l="et|en|zh"`.
`<html data-lang="…">` valib, CSS peidab ülejäänud. Keel tuleb selektoris
tehtud valikust (`localStorage`, võti `mw-lang`); kui valikut pole veel
tehtud, siis URL-ist (`?lang=zh`, nt jagatud link), muidu inglise. Alalehe
paremas ülanurgas on samad sildid keele vahetamiseks. Esileht algab alati
neutraalsest olekust.

Valitud keel püsib lehte vahetades, kuni selektoris tehakse uus valik:
kõik sisemised lingid (jaluse menüü, logo) kannavad atribuuti
`data-keep-lang` ja `site.js` kirjutab neile iga keelevahetuse järel
`?lang=…` uuesti (`MW.keepLang`). Valik on ülimuslik ka vana ajalookirje
või kõrvalise lingi `?lang=` ees (URL kirjutatakse valitud keelele) ja
tagasi-nupuga (bfcache) taastatud leht võtab vahepeal mujal valitud keele.
Keelevahetusel saadetakse `document`-ile sündmus `mw:lang` (kung fu lehe
treeningprogrammi link vahetab selle peale PDF-faili).

Uue keele­teksti lisamiseks kirjuta kolm elementi kõrvuti:

```html
<p data-l="et">…</p><p data-l="en">…</p><p data-l="zh">…</p>
```

### Failid

```
index.html, shoemaker.html, mantis.html, books.html, 404.html
assets/
  site.css, site.js        ühised stiilid ja keelevalik
  landing/                 esilehe tükid: bg.jpg (taust), tere/hello/nihao,
                           shoemaker/mantis-card/books-card (.webp, läbipaistvad), og.jpg
  logo/                    wulf-logo-320/640 (.webp, .png)
  shoemaker/               galerii (1024×512, ühtlustatud toon), video eelvaade
  shoemaker/orig/          samad fotod töötlemata värvides — avanevad galeriis klõpsu peale suurelt
  kungfu/                  tunnistus 1991–92, pärimusregister 2023, duani tunnistus 2026,
                           treeningprogramm-et/en/zh.pdf (koolituse tutvustus, avaneb uues aknas)
  books/                   kaaned (et, raudvaal, zh, lola), tagakaas, eesleht, linoollõiked, näidis-PDF (hiina k),
                           lola-ja-lohe-lk5.jpg (näidis, avaneb nupust "Loe näidet")
favicon.svg, robots.txt, sitemap.xml, CNAME, .nojekyll
```

Taust ja sildid on GIMP-i failist kihtidena välja võetud; kolm kaarti
(`shoemaker.webp`, `mantis-card.webp`, `books-card.webp`) on eraldi
läbipaistvad pildid. Koordinaadid on `index.html` sees `--px/--py/--pw/--ph`
muutujatena. Uue kaardipildi puhul arvuta klikitav kuju (`clip-path`) pildi
läbipaistvuse järgi uuesti.

Galerii pildid on ühtlustatud tooniga (küllastus 58%, soe pruun-kuldne
toon, vinjett), et erineva taustaga fotod istuksid lehe värvigammaga.
Klõps pildil avab kaustast `orig/` originaali õigetes värvides; klõps
ükskõik kuhu (või Esc) sulgeb. Uue pildi lisamisel pane töödeldud
versioon `shoemaker/` ja originaal sama nimega `shoemaker/orig/` alla.

### Raamatu lisamine

`books.html` sees on iga raamat üks `<article class="book" id="…">`: kaanepilt
(`assets/books/`, 700 px lai, .jpg + .webp), pealkiri, autor, lühitutvustus
kolmes keeles, `<dl class="facts">` andmetega ja nupud. Hiinakeelne väljaanne
tõstetakse hiina keele valikul CSS-iga esimeseks (`order:-1`). Lisa uus
raamat ka `<script type="application/ld+json">` plokki. Väline ostulink
(nt Apollo) on tavaline `<a class="btn" target="_blank" rel="noopener">`.

Hüpikaknad („Loe raamatust“, „Loe proloogi“) on `<div class="aboutbox" id="…">`
plokid lehe lõpus; nupp `data-about="<id>"` avab vastava akna (tühi väärtus =
`aboutbox`, Meister Wulfi tutvustus).

### E-raamat „Raudvaal“

Järg eestikeelsele „Meister Wulfile“, ilmub veebis järjejutuna (eraldi
lugemiskeskkond maksumüüriga, hind 4,99 €, proloog ja I peatükk tasuta).
Kaardil on selge märgistus: kuldne silt `.badge--ebook` pealkirja kõrval ja
lint `.cover-tag` kaane nurgas. Proloogi tekst on lehel endas (`#proloog`,
sama tekst mis lugemiskeskkonna failis `content/raudvaal/00-proloog.md`) ja
avaneb nupust „Loe proloogi“; uue versiooni korral uuenda mõlemat.

Nupp „Loe veebis“ (`a[data-when-live]`, `href="/raudvaal/"`) on peidus, kuni
see aadress päriselt vastab (lehe enda skript teeb `HEAD`-päringu); seni on
nupu all märkus „Lugemisleht on tulekul“ (`data-until-live`). Kui
lugemiskeskkond avaneb samal aadressil, ilmub nupp ise; kui mujal (nt
alamdomeen), muuda ainult `href` — võõra päritolu aadressi näidatakse kohe.
Kui raamat läheb müüki, vaheta hinna märkus „Müügile tuleb, kui raamat on
valmis“ ja JSON-LD `availability` (praegu `PreOrder`).

### Kontaktid lehel

E-posti aadressid pannakse kokku JavaScriptiga (`data-u` + `data-d`), et
robotid neid lähtekoodist ei korjaks. Kingsepp: kriuks@suvi.ch; kung fu ja
raamatud: meister.wulf@pm.me, tel 510 5573. Iga lehe jaluses (esilehel
paremal all) on Facebooki link facebook.com/meister.von.wulf; allvee-
instruktori mainimised viitavad meregrupp.ee-le (eesti k → `/`, inglise ja
hiina k → `/en/`).

---

## Seadistus

### A. GitHub  ·  *github.com/meregrupp-cyber/meisterwulf*

1. **Settings → Pages**
2. *Source:* **Deploy from a branch**
3. *Branch:* `main`, kaust **`/ (root)`** → **Save**
4. *Custom domain* täitub failist `CNAME` ise (`meisterwulf.com`).
   Oota, kuni ilmub roheline linnuke ja teade sertifikaadi kohta.
5. Kui sertifikaat on väljastatud, märgi **Enforce HTTPS**

> **Repo peab olema avalik.** GitHub Pages privaatse repo pealt eeldab
> tasulist plaani (Pro/Team). Tasuta plaanil: *Settings → General →
> Danger Zone → Change visibility → Public*.

### B. Cloudflare  ·  *dash.cloudflare.com -> meisterwulf.com -> DNS*

**DNS → Records → Add record**, kaks kirjet:

| Type | Name | Target | Proxy |
|------|------|--------------------------|-----------|
| CNAME | `@` | `meregrupp-cyber.github.io` | Proxied |
| CNAME | `www` | `meregrupp-cyber.github.io` | Proxied |

`www` suunatakse 301-ga apexile — selle teeb GitHub Pages ise, kuna failis
`CNAME` on kirjas apex-domeen.

### C. Kaks lõksu, mis muidu murravad HTTPS-i

1. **Sertifikaadi väljastamine ja oranž pilv.** Kuni GitHub pole sertifikaati
   väljastanud, hoia kirjed **DNS only** (hall pilv). Kui sertifikaat on
   olemas ja *Enforce HTTPS* märgitud, lülita pilv oranžiks.
2. **SSL/TLS režiim peab olema `Full`.** Cloudflare → **SSL/TLS** →
   **Overview**. `Flexible` tekitab lõputu ümbersuunamise.

---

## Kohapeal vaatamine

```sh
python3 -m http.server 8000
# http://localhost:8000
```
