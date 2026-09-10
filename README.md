# meisterwulf.com

Ajutine avaleht domeenile **meisterwulf.com**. Staatiline üheleheline sait,
mida serveeritakse Cloudflare'i kaudu.

---

## 1. Avapilt

Avapilt on repos olemas: `public/assets/hero.jpg` (2400x1345, 625 kB).

Originaal oli 2912x1632 PNG mahuga 8,5 MB — see on avalehe taustapildiks liiga
suur (mobiilis mitu sekundit ootamist). Repos on sellest tehtud veebi jaoks
sobiv JPEG: laius 2400 px, kvaliteet 82. Originaalfaili repos ei hoita.

### Pildi vahetamine

```sh
cp uus-pilt.jpg public/assets/hero.jpg
git commit -am "Vaheta avapilt" && git push
```

- Nimi võib olla ka `hero.jpeg`, `hero.png` või `hero.webp` — leht proovib
  neid selles järjekorras. `hero.jpg` on esimene, seega kiireim.
- Hoia laius 2000-2400 px ja maht alla ~600 kB.
- **Kui pilti ei ole**, ei jää leht tühjaks: siis joonistatakse CSS-iga kolm
  emailtahvlit kirjadega *tere / hello / 你好*. See on valmis kujundus, mitte
  kohatäide — saiti võib serveerida ka ilma pildita.

Vt ka [`public/assets/README.md`](public/assets/README.md).

---

## 2. Cloudflare'i seadistus

Domeen `meisterwulf.com` on juba Cloudflare'i kontos tsoonina olemas. Puudu on
ainult sait, mis selle taga vastaks. Vali üks kahest teest.

### A. Dashboardist, Giti-integratsiooniga *(lihtsaim, soovitatav)*

Iga `git push` paneb muudatuse ise üles — GitHubi saladusi vaja ei ole.

1. Ava **Workers & Pages → Create → Workers → Import a repository**
2. Vali repo `meregrupp-cyber/meisterwulf`
3. Seaded loeb Cloudflare failist `wrangler.jsonc`, muuta pole vaja:
   - Build command: *(tühi)*
   - Deploy command: `npx wrangler deploy`
4. Vajuta **Deploy**

Domeenid `meisterwulf.com` ja `www.meisterwulf.com` seotakse esimese
väljalaske käigus automaatselt (need on kirjas `wrangler.jsonc` failis
`routes` all). Kontrolli üle: **Workers & Pages → meisterwulf → Settings →
Domains & Routes**.

> **Tähelepanu:** vali produktsiooniharuks see haru, kus kood tegelikult on.
> Praegu on kogu töö harus `claude/upbeat-brown-hjmzic` — kui liidad selle
> `main`-haruga, vali `main`.

### B. Käsurealt

```sh
npm install
npx wrangler login
npm run deploy
```

### C. GitHub Actions *(valikuline)*

Fail [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) on olemas,
aga **magab**. Kui tahad seda kasutada (nt Giti-integratsiooni asemel):

1. Lisa saladused `CLOUDFLARE_API_TOKEN` ja `CLOUDFLARE_ACCOUNT_ID`
   (*Settings → Secrets and variables → Actions → Secrets*)
2. Lisa muutuja `DEPLOY_VIA_ACTIONS` = `true` (samas, *Variables*)

Ilma nendeta töövoog lihtsalt ei käivitu ega tekita veateateid.

---

## 3. Kohapeal vaatamine

```sh
npm install
npm run dev      # http://localhost:8787
npm run check    # kontrollib seadistust ilma üles laadimata
```

---

## 4. Failid

```
public/
  index.html          kogu leht — üks fail, väliste sõltuvusteta
  404.html            vealehekülg
  favicon.svg         vahekaardi ikoon
  robots.txt          otsimootoritele (indekseerimine lubatud)
  sitemap.xml
  _headers            turvapäised ja vahemälu reeglid
  _redirects          www.meisterwulf.com -> meisterwulf.com
  .assetsignore       mida avalikult ei serveerita
  assets/
    hero.jpg          <- AVAPILT KÄIB SIIA (praegu puudu)

wrangler.jsonc        Cloudflare Workersi seadistus
```

### Kuidas leht töötab

`public/index.html` sisaldab kogu kujundust — CSS on failis sees, väliseid
fonte ega teeke ei laadita. Lehel on kaks olekut:

| Olek | Millal | Mida näidatakse |
|------|--------|-----------------|
| varulahendus | `assets/hero.*` puudub | CSS-iga joonistatud emailtahvlid |
| foto | pilt laeb | pilt katab ekraani, all nimi ja „Varsti avatud" |

Väike skript lehe lõpus proovib pilti laadida ja lisab õnnestumisel `<body>`
külge klassi `has-hero`. Kui pilti pole, ei juhtu midagi — varulahendus jääb
ekraanile. Katkist pildiikooni ei näidata kunagi.

### Teksti muutmine

Nimi, tervitused ja „Varsti avatud" on `public/index.html` lõpus, `<div
class="plate">` sees. Värvid on ühes kohas, faili alguses `:root` all.
