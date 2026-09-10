# Avapilt

Pane avapilt siia, nimega **`hero.jpg`**:

```
public/assets/hero.jpg
```

See on ainus asi, mida avaleht väljastpoolt vajab.

## Mida silmas pidada

- **Nimi ja vorming.** Leht proovib järjekorras `hero.jpg` → `hero.jpeg` →
  `hero.png` → `hero.webp` ja kasutab esimest, mis avaneb. Ükskõik milline
  neist neljast nimedest töötab, ümber nimetama ei pea.
- **Mõõdud.** Soovituslik laius 2000–2400 px. Leht katab pildiga kogu ekraani.
- **Failimaht.** Hoia alla ~600 kB (JPEG kvaliteet ~80). Suurem fail teeb
  avanemise aeglaseks, kasu pole näha.
- **Kui pilti pole**, näitab leht kujundatud varulahendust: kolm emailtahvlit
  kirjadega *tere · hello · 你好*. Leht ei jää kunagi katki ega tühjaks.

Pärast pildi lisamist:

```sh
git add public/assets/hero.jpg
git commit -m "Lisa avapilt"
git push
```
