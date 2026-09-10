# Avapilt

`hero.jpg` on lehe taustapilt. See on olemas ja leht kasutab seda.

## Vahetamine

Kirjuta fail lihtsalt üle — muud seadistust vaja ei ole:

```sh
cp uus-pilt.jpg assets/hero.jpg
git commit -am "Vaheta avapilt" && git push
```

## Mida silmas pidada

- **Nimi ja vorming.** Leht proovib järjekorras `hero.jpg` -> `hero.jpeg` ->
  `hero.png` -> `hero.webp` ja kasutab esimest, mis avaneb.
- **Mõõdud.** Soovituslik laius 2000-2400 px. Leht katab pildiga kogu ekraani
  (kitsal ekraanil näidatakse pilti tervikuna, ilma väljalõiketa).
- **Failimaht.** Hoia alla ~600 kB. Praegune fail on 625 kB. Otse kaamerast
  või ekraanitõmmisena salvestatud PNG on tavaliselt kümme korda suurem ja
  teeb lehe avanemise mobiilis aeglaseks — salvesta JPEG-ina.
- **Kui faili pole**, näitab leht CSS-iga joonistatud emailtahvleid. Leht ei
  jää kunagi katki ega tühjaks.
