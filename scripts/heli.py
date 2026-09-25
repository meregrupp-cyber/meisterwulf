#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Heliillustratsioonid lugemislehe mullidele: sünteesitud numpy-ga, MP3 ffmpeg-iga.

    python3 scripts/heli.py koik                      # menüü helid -> assets/raudvaal/heli/<id>.mp3
    python3 scripts/heli.py uks kuumpea                # ainult üks heli menüüst
    python3 scripts/heli.py morse "SOS U398" morse-u398.mp3   # morsekood antud tekstist

Menüü: sonar (ASDIC-i ping), wasserbombe (süvaveepommid), diesel (allveelaeva diislid),
emootor (elektrimootorid vee all), laevakell (laevakell), lennuk (lennuk möödub), flak (õhutõrje),
kuumpea (kalakutri kuumpeamootor ehk semidiisel, aeglased üksikud löögid), diisel-kaivitus (allveelaeva
diisli käivitamine suruõhuga), praam (väikese praami tihke mootor ja lahtine plekk).
Merelaineid meelega ei ole. Kõik on heliillustratsioonid, mitte ajaloolised salvestised.
Vajab: numpy, imageio-ffmpeg (python3 -m pip install numpy imageio-ffmpeg).
"""
import math, subprocess, sys, tempfile, wave
from pathlib import Path
import numpy as np

SR = 22050
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "raudvaal" / "heli"
rng = np.random.default_rng(1945)


def t(sec): return np.arange(int(SR * sec)) / SR
def env_exp(sec, tau): return np.exp(-t(sec) / tau)
def lowpass(x, alpha):
    y = np.empty_like(x); acc = 0.0
    for i, v in enumerate(x):
        acc += alpha * (v - acc); y[i] = acc
    return y
def lowpass_fast(x, n):            # liikuv keskmine (kiire)
    k = np.ones(n) / n
    return np.convolve(x, k, mode="same")
def norm(x, peak=0.9):
    m = np.max(np.abs(x)) or 1.0
    return x / m * peak
def fade(x, ms_in=20, ms_out=200):
    a, b = int(SR * ms_in / 1000), int(SR * ms_out / 1000)
    x = x.copy()
    if a: x[:a] *= np.linspace(0, 1, a)
    if b: x[-b:] *= np.linspace(1, 0, b)
    return x
def mix_at(buf, x, at):
    i = int(SR * at); n = min(len(x), len(buf) - i)
    if n > 0: buf[i:i + n] += x[:n]


def sonar():
    out = np.zeros(int(SR * 7.5))
    for k in range(4):
        d = 0.9; tt = t(d)
        f = 1150 - 150 * tt / d                       # kerge langev ping
        ping = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(d, 0.18)
        echo = np.zeros_like(ping)
        for j, g in ((0.12, .35), (0.27, .2), (0.45, .1)):
            e = np.roll(ping, int(SR * j)) * g; e[:int(SR * j)] = 0; echo += e
        mix_at(out, (ping + echo) * (0.9 - 0.1 * k), 0.3 + k * 1.75)
    out += rng.normal(0, 0.006, len(out))            # vaikne veealune kohin
    return fade(norm(out, 0.8))


def wasserbombe():
    out = np.zeros(int(SR * 9))
    for k, (at, dist) in enumerate(((0.4, 1.0), (3.2, 0.7), (5.6, 1.3))):
        d = 3.0
        boom = rng.normal(0, 1, int(SR * d))
        boom = lowpass_fast(boom, int(60 * dist)) * env_exp(d, 0.55 * dist)
        click = rng.normal(0, 1, int(SR * 0.06)) * env_exp(0.06, 0.015)
        thump = np.sin(2 * np.pi * 42 * t(d)) * env_exp(d, 0.7) * 0.6
        x = boom * 1.8 + thump
        mix_at(out, x * (1.2 / dist), at); mix_at(out, click * 0.5, at)
    return fade(norm(out, 0.85), 5, 600)


def diesel():
    d = 9.0; tt = t(d)
    rpm = 11.5 + 0.4 * np.sin(2 * np.pi * 0.15 * tt)
    phase = 2 * np.pi * np.cumsum(rpm) / SR
    pulses = np.maximum(0, np.sin(phase)) ** 12                      # süütetaktid
    body = pulses * (np.sin(2 * np.pi * 55 * tt) + 0.5 * np.sin(2 * np.pi * 110 * tt) + 0.3 * np.sin(2 * np.pi * 220 * tt))
    hiss = lowpass_fast(rng.normal(0, 1, len(tt)), 6) * 0.08 * (0.6 + pulses)
    x = body + hiss
    return fade(norm(x, 0.8), 800, 900)


def emootor():
    d = 9.0; tt = t(d)
    hum = np.sin(2 * np.pi * 50 * tt) + 0.4 * np.sin(2 * np.pi * 100 * tt) + 0.2 * np.sin(2 * np.pi * 150 * tt)
    whine = 0.12 * np.sin(2 * np.pi * (410 + 6 * np.sin(2 * np.pi * 0.3 * tt)) * tt)
    x = (hum + whine) * (0.85 + 0.15 * np.sin(2 * np.pi * 0.7 * tt)) + rng.normal(0, 0.01, len(tt))
    return fade(norm(x, 0.6), 800, 900)


def bell_strike(dur=2.8, f0=520):
    tt = t(dur)
    parts = ((1.0, 1.0, 1.4), (2.02, 0.55, 0.9), (2.98, 0.35, 0.6), (4.1, 0.2, 0.4), (5.4, 0.12, 0.3))
    x = sum(a * np.sin(2 * np.pi * f0 * r * tt) * np.exp(-tt / tau) for r, a, tau in parts)
    return x * (1 - np.exp(-tt * 400))


def laevakell():
    out = np.zeros(int(SR * 7))
    for at in (0.3, 0.75, 2.4, 2.85):                              # kaks paari: „kaks kella”
        mix_at(out, bell_strike(), at)
    return fade(norm(out, 0.8), 5, 900)


def lennuk():
    d = 11.0; tt = t(d)
    pitch = 96 - 18 / (1 + np.exp(-(tt - 5.5) * 1.6))              # Doppler: möödudes langeb
    ph = 2 * np.pi * np.cumsum(pitch) / SR
    x = np.sin(ph) + 0.6 * np.sin(2 * ph) + 0.35 * np.sin(3 * ph) + 0.2 * np.sin(4.02 * ph)
    beat = 1 + 0.25 * np.sin(2 * np.pi * 2.3 * tt)                 # kahe mootori löök
    loud = np.exp(-((tt - 5.5) / 2.6) ** 2) * 0.95 + 0.05
    x = x * beat * loud + lowpass_fast(rng.normal(0, 1, len(tt)), 4) * 0.05 * loud
    return fade(norm(x, 0.8), 300, 900)


def flak():
    out = np.zeros(int(SR * 7))
    at = 0.3
    while at < 6.2:
        d = 0.5
        burst = lowpass_fast(rng.normal(0, 1, int(SR * d)), 8) * env_exp(d, 0.09)
        thump = np.sin(2 * np.pi * 70 * t(d)) * env_exp(d, 0.12) * 0.5
        mix_at(out, (burst + thump) * rng.uniform(0.5, 1.0), at)
        at += rng.uniform(0.25, 0.7)
    out += lowpass_fast(rng.normal(0, 1, len(out)), 40) * 0.05
    return fade(norm(out, 0.85), 5, 600)


MORSE = {"A": ".-", "B": "-...", "C": "-.-.", "D": "-..", "E": ".", "F": "..-.", "G": "--.", "H": "....", "I": "..", "J": ".---",
         "K": "-.-", "L": ".-..", "M": "--", "N": "-.", "O": "---", "P": ".--.", "Q": "--.-", "R": ".-.", "S": "...", "T": "-",
         "U": "..-", "V": "...-", "W": ".--", "X": "-..-", "Y": "-.--", "Z": "--..", "0": "-----", "1": ".----", "2": "..---",
         "3": "...--", "4": "....-", "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.", ".": ".-.-.-",
         ",": "--..--", "?": "..--..", "/": "-..-.", "-": "-....-", "Ä": ".-.-", "Ö": "---.", "Ü": "..--"}


def morse(text, wpm=16, f=720):
    unit = 1.2 / wpm
    seq = []
    for word in text.upper().split():
        for ch in word:
            code = MORSE.get(ch)
            if not code: continue
            for sym in code:
                seq.append((True, unit if sym == "." else 3 * unit)); seq.append((False, unit))
            seq.append((False, 2 * unit))
        seq.append((False, 4 * unit))
    total = sum(d for _, d in seq) + 1.0
    out = np.zeros(int(SR * total)); pos = 0.3
    for on, d in seq:
        if on:
            tone = np.sin(2 * np.pi * f * t(d))
            tone = fade(tone, 5, 5)
            mix_at(out, tone * 0.7, pos)
        pos += d
    out += lowpass_fast(rng.normal(0, 1, len(out)), 3) * 0.02        # raadiokohin
    return fade(norm(out, 0.8), 5, 300)


def kuumpea(sec=9.0, bpm=150):
    """Aeglane kuumpeamootor (semidiisel): üksikud madalad löögid, vahel raua klõbin."""
    n = int(SR * sec); out = np.zeros(n)
    period = 60.0 / bpm
    k = 0
    while k * period < sec:
        at = k * period + rng.normal(0, 0.008)
        # pehme madal löök: summutatud impulss + resonants
        dur = 0.35; tt = t(dur)
        thump = np.sin(2 * np.pi * 52 * tt) * np.exp(-tt * 14) + 0.4 * np.sin(2 * np.pi * 104 * tt) * np.exp(-tt * 22)
        thump += 0.25 * lowpass_fast(rng.normal(0, 1, len(tt)), 40) * np.exp(-tt * 30)
        mix_at(out, thump * (0.9 + 0.2 * rng.random()), at)
        # väljalaske "tuh": hingav müra
        puff = lowpass_fast(rng.normal(0, 1, int(SR * 0.16)), 12) * np.exp(-t(0.16) * 18)
        mix_at(out, puff * 0.35, at + 0.03)
        # raua klõbin löökide vahel
        if rng.random() < 0.7:
            c = t(0.06); click = np.sin(2 * np.pi * (1800 + 600 * rng.random()) * c) * np.exp(-c * 90)
            mix_at(out, click * 0.12, at + period * (0.45 + 0.1 * rng.random()))
        k += 1
    # tasane pidev põhi (hooratas, vibratsioon)
    hum = 0.05 * np.sin(2 * np.pi * 26 * t(sec)) * (1 + 0.3 * np.sin(2 * np.pi * 0.7 * t(sec)))
    out[:len(hum)] += hum
    return fade(norm(out, 0.8), 400, 900)


def diisel_kaivitus(sec=11.0):
    """Allveelaeva diisli käivitamine suruõhuga: õhu pahvak, aeglane raske pöörlemine, esimesed süütelöögid, ühtlane töö."""
    tt = t(sec); n = len(tt)
    # pöörlemiskiirus (süütetakte sekundis): 0.3 s kuni õhk liigutab, siis kiireneb kütuse peal
    rpm = np.where(tt < 0.3, 0.0, np.where(tt < 2.5, 1.5 + (tt - 0.3) / 2.2 * 2.5, np.where(tt < 5.0, 4.0 + (tt - 2.5) / 2.5 * 7.5, 11.5 + 0.4 * np.sin(2 * np.pi * 0.15 * tt))))
    phase = 2 * np.pi * np.cumsum(rpm) / SR
    soft = np.maximum(0, np.sin(phase)) ** 6                 # õhuga pööramise pehmed lohud
    sharp = np.maximum(0, np.sin(phase)) ** 12               # süütetaktid
    comb = np.clip((tt - 2.2) / 2.3, 0, 1)                   # kütuse põlemine tuleb järk-järgult
    air = np.clip(1 - (tt - 3.5) / 1.5, 0, 1) * (tt > 0.3)  # õhuga pööramine kaob
    body = sharp * comb * (np.sin(2 * np.pi * 55 * tt) + 0.5 * np.sin(2 * np.pi * 110 * tt) + 0.3 * np.sin(2 * np.pi * 220 * tt))
    body += soft * air * 0.7 * (np.sin(2 * np.pi * 38 * tt) + 0.4 * np.sin(2 * np.pi * 76 * tt))
    breath = lowpass_fast(rng.normal(0, 1, n), 5) * (0.25 * soft * air + 0.08 * (0.6 + sharp) * comb)
    hiss = lowpass_fast(rng.normal(0, 1, n), 4) * 0.55 * np.exp(-tt / 0.9) * (tt > 0.05)   # käivitusõhu pahvak
    out = body + breath + hiss
    valve = t(0.05); mix_at(out, np.sin(2 * np.pi * 900 * valve) * np.exp(-valve * 120) * 0.5, 0.05)   # käivitusventiili klõps
    return fade(norm(out, 0.85), 10, 900)


def praam(sec=9.0):
    """Väike praam: kiirem ja tihkem ühesilindriline mootor, ahtris lahtine plekk klõbiseb vastu teist plekki."""
    tt = t(sec); n = len(tt)
    rate = 7.0 + 0.3 * np.sin(2 * np.pi * 0.4 * tt)
    phase = 2 * np.pi * np.cumsum(rate) / SR
    pulses = np.maximum(0, np.sin(phase)) ** 10
    body = pulses * (np.sin(2 * np.pi * 70 * tt) + 0.6 * np.sin(2 * np.pi * 140 * tt) + 0.25 * np.sin(2 * np.pi * 280 * tt))
    exhaust = lowpass_fast(rng.normal(0, 1, n), 4) * 0.12 * (0.5 + pulses)
    out = body + exhaust
    # lahtine plekk: iga löögi järel juhuslik plekiklõbin, vahel topelt
    k = 0
    while k / 7.0 < sec:
        at = k / 7.0 + 0.04 + rng.normal(0, 0.01)
        if rng.random() < 0.85:
            c = t(0.09); f = 2200 + 900 * rng.random()
            clank = (np.sin(2 * np.pi * f * c) + 0.5 * np.sin(2 * np.pi * f * 1.7 * c)) * np.exp(-c * 70) * (0.12 + 0.1 * rng.random())
            clank += lowpass_fast(rng.normal(0, 1, len(c)), 2) * np.exp(-c * 90) * 0.08
            mix_at(out, clank, at)
            if rng.random() < 0.3: mix_at(out, clank * 0.6, at + 0.05)
        k += 1
    return fade(norm(out, 0.8), 500, 900)


def write_mp3(x, path: Path):
    import imageio_ffmpeg
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        with wave.open(tmp.name, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())
        path.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run([ff, "-y", "-loglevel", "error", "-i", tmp.name, "-codec:a", "libmp3lame", "-b:a", "64k", str(path)], check=True)
    Path(tmp.name).unlink(missing_ok=True)
    print(f"  {path.relative_to(ROOT)}  {len(x) / SR:.1f} s, {path.stat().st_size // 1024} KB")


MENU = {"sonar": sonar, "wasserbombe": wasserbombe, "diesel": diesel, "emootor": emootor, "laevakell": laevakell, "lennuk": lennuk, "flak": flak, "kuumpea": kuumpea, "diisel-kaivitus": diisel_kaivitus, "praam": praam}

if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "koik":
        for name, fn in MENU.items():
            write_mp3(fn(), OUT / f"{name}.mp3")
    elif len(sys.argv) >= 3 and sys.argv[1] == "uks":
        write_mp3(MENU[sys.argv[2]](), OUT / f"{sys.argv[2]}.mp3")
    elif len(sys.argv) >= 4 and sys.argv[1] == "morse":
        write_mp3(morse(sys.argv[2]), OUT / sys.argv[3])
    else:
        print(__doc__)
