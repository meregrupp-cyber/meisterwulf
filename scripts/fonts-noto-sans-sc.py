#!/usr/bin/env python3
"""Treeningprogrammi PDF-ide hiina kiri: Noto Sans SC Regular ja Bold staatiliste TrueType-lõigetena.

Google Fonts annab Noto Sans SC muutuvkirjana (variable font). Chromium salvestab nii muutuvkirja kui ka
CFF-kujul (OTF) kirja ning sünteesitud rasvase lõike PDF-i Type 3 kirjana, mida osa PDF-lugejaid näitab
kastikestena. Skript teeb muutuvkirjast kaks staatilist TrueType-lõiget (wght 400 ja 700) ja paigaldab need
kasutaja kirjade kausta. Vaja: python3, fontTools (pip install fonttools), curl või internet.

    python3 scripts/fonts-noto-sans-sc.py            # ~/.local/share/fonts/noto-sans-sc/
"""
import subprocess, sys, tempfile, urllib.request
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf"
OUT = Path.home() / ".local/share/fonts/noto-sans-sc"

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        vf_path = Path(tmp) / "NotoSansSC-VF.ttf"
        print("laen", URL)
        urllib.request.urlretrieve(URL, vf_path)
        for wght, style in ((400, "Regular"), (700, "Bold")):
            font = instancer.instantiateVariableFont(TTFont(vf_path), {"wght": wght}, updateFontNames=True)
            assert "fvar" not in font and "glyf" in font
            out = OUT / f"NotoSansSC-{style}.ttf"
            font.save(out)
            print("kirjutatud", out)
    subprocess.run(["fc-cache", "-f", str(OUT)], check=False)
    found = subprocess.run(["fc-list", "Noto Sans SC", "style"], capture_output=True, text=True).stdout
    print(found.strip() or "HOIATUS: fc-list ei leia kirja Noto Sans SC")

if __name__ == "__main__":
    sys.exit(main())
