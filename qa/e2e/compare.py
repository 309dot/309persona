"""Compare two screenshot folders: python3 compare.py BASE_DIR NEW_DIR OUT_DIR"""
import sys
from pathlib import Path

from PIL import Image, ImageChops

base, new, out = (Path(p) for p in sys.argv[1:4])
out.mkdir(parents=True, exist_ok=True)
worst = 0.0
for b in sorted(base.glob("*.png")):
    n = new / b.name
    if not n.exists():
        print(f"MISSING  {b.name}")
        continue
    bi, ni = Image.open(b).convert("RGB"), Image.open(n).convert("RGB")
    if bi.size != ni.size:
        print(f"SIZE     {b.name}: {bi.size} -> {ni.size}")
        worst = max(worst, 1.0)
        continue
    diff = ImageChops.difference(bi, ni).convert("L").point(lambda v: 255 if v > 24 else 0)
    changed = diff.histogram()[255]  # diff is 0/255 after the threshold
    ratio = changed / (bi.size[0] * bi.size[1])
    worst = max(worst, ratio)
    status = "SAME" if changed == 0 else ("TINY" if ratio < 0.001 else "DIFF")
    print(f"{status:8} {b.name}: {changed} px ({ratio:.4%})")
    if changed:
        overlay = Image.blend(bi, Image.new("RGB", bi.size, (255, 0, 0)), 0.0)
        overlay.paste((255, 0, 0), mask=diff)
        Image.blend(bi, overlay, 0.6).save(out / b.name)
print(f"worst ratio {worst:.4%}")
