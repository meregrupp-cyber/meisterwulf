# meisterwulf.com

Ajutine avaleht domeenile **meisterwulf.com**. Staatiline üheleheline sait.

**Majutus:** GitHub Pages · **DNS ja vahemälu:** Cloudflare
(sama seadistus nagu freedive.ee)

```
GitHub Pages            Cloudflare              külastaja
(serveerib faile)  <--  (proksib, vahemälu)  <--  meisterwulf.com
       ^
   see repo, haru juurkaustast
```

Cloudflare'i DNS-is on CNAME `meregrupp-cyber.github.io` peale, oranži
pilvega (proksitud). Külastaja näeb Cloudflare'i IP-d, sisu tuleb GitHubist.

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
`CNAME` on kirjas apex-domeen. Eraldi suunamisreeglit vaja ei ole.

### C. Kaks lõksu, mis muidu murravad HTTPS-i

> Mõlemad seaded on **Cloudflare'i** poolel. GitHubis on ainus TLS-iga
> seotud asi „Enforce HTTPS" linnuke Pages'i seadetes.

1. **Sertifikaadi väljastamine ja oranž pilv.** Kuni GitHub pole sertifikaati
   väljastanud, hoia kirjed **DNS only** (hall pilv) — muidu ei näe GitHub
   domeeni ega saa seda kinnitada. Kui sertifikaat on olemas ja *Enforce
   HTTPS* märgitud, lülita pilv oranžiks.

2. **SSL/TLS režiim peab olema `Full`.**
   Cloudflare → `meisterwulf.com` → vasak menüü **SSL/TLS** → **Overview** →
   *Choose an encryption mode*.
   Kui seal on **Flexible**, tekib GitHub Pagesi *Enforce HTTPS*-iga lõputu
   ümbersuunamise tsükkel ja leht ei avane.

---

## Failid

```
index.html      kogu leht — üks fail, väliste sõltuvusteta
404.html        vealehekülg
assets/
  hero.jpg      avapilt (2400x1345, 625 kB)
favicon.svg     vahekaardi ikoon
robots.txt      indekseerimine lubatud
sitemap.xml
CNAME           meisterwulf.com — GitHub Pages loeb siit custom domain'i
.nojekyll       Jekyll eemale, failid serveeritakse muutmata kujul
```

### Kuidas leht töötab

`index.html` sisaldab kogu kujundust — CSS on failis sees, väliseid fonte ega
teeke ei laadita. Lehel on kaks olekut:

| Olek | Millal | Mida näidatakse |
|------|--------|-----------------|
| foto | `assets/hero.*` avaneb | pilt katab ekraani, all nimi |
| varulahendus | pilti pole | CSS-iga joonistatud emailtahvlid |

Väike skript lehe lõpus proovib pilti laadida ja lisab õnnestumisel `<body>`
külge klassi `has-hero`. Katkist pildiikooni ei näidata kunagi.

### Pildi vahetamine

```sh
cp uus-pilt.jpg assets/hero.jpg
git commit -am "Vaheta avapilt" && git push
```

Hoia laius 2000-2400 px ja maht alla ~600 kB. Vt [`assets/README.md`](assets/README.md).

### Teksti muutmine

Nimi ja „Varsti avatud" on `index.html` lõpus, `<div class="plate">` sees.
Värvid on faili alguses `:root` all.

---

## Kohapeal vaatamine

```sh
python3 -m http.server 8000
# http://localhost:8000
```

## Mida GitHub Pages ei oska

Pages ei toeta kohandatud vastusepäiseid (`_headers` ei tööta). Turvapäised
saab vajadusel lisada Cloudflare'i poolelt: **Rules → Transform Rules →
Modify Response Header**. Ajutise avalehe jaoks pole see hädavajalik.
