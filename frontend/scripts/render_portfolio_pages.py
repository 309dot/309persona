#!/usr/bin/env python3
"""Render the portfolio PDF into the page images the in-app viewer shows.

Needs poppler (`pdftoppm`) and Pillow:  brew install poppler && pip install pillow
Run from the repo root after the PDF changes:

    python3 frontend/scripts/render_portfolio_pages.py

Writes frontend/public/portfolio/pNN.webp (2000px, the viewer), mNN.webp (800px, answer cards)
and tNN.webp (240px, the viewer's page strip).
If the page count or chapters change, update PORTFOLIO_PAGES and CHAPTERS in
frontend/src/pages/persona/portfolio/chapters.ts (PAGE_SIZE too if the slides stop being 16:9)
and `pages` in the knowledge pack.
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PDF = ROOT / "knowledge_base" / "309files" / "pdf" / "포트폴리오_성백곤.pdf"
OUT = ROOT / "frontend" / "public" / "portfolio"
SIZES = {"p": (2000, 80), "m": (800, 76), "t": (240, 70)}  # prefix: (width, WebP quality)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.webp"):
        old.unlink()
    with tempfile.TemporaryDirectory() as tmp:
        # 1920pt-wide slides at 75 dpi come out 2000px wide.
        subprocess.run(["pdftoppm", "-r", "75", "-png", str(PDF), f"{tmp}/p"], check=True, stderr=subprocess.DEVNULL)
        pages = sorted(Path(tmp).glob("p-*.png"))
        for number, path in enumerate(pages, start=1):
            image = Image.open(path).convert("RGB")
            for prefix, (width, quality) in SIZES.items():
                resized = image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
                resized.save(OUT / f"{prefix}{number:02d}.webp", "WEBP", quality=quality, method=6)
    size = sum(f.stat().st_size for f in OUT.glob("*.webp")) / 1024
    print(f"{len(pages)} pages → {OUT.relative_to(ROOT)} ({size:.0f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
