#!/usr/bin/env python3
"""把每篇文章封面圖（releases 的 blog-images）的寬高記進 _data/cover_sizes.json。

文章頁的 layout 用這份資料替封面 <img> 補上 width/height（避免版面位移）。
新文章發完跑一次就好，已經量過的檔名會跳過：

    python3 scripts/cover_sizes.py

只下載每張圖的前 256KB 讀檔頭，讀不到才抓整張。
"""
import io
import json
import re
import sys
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "_data" / "cover_sizes.json"
BASE = "https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/"
PAT = re.compile(re.escape(BASE) + r'([^)\s"\']+)')


def first_cover(md: str):
    m = PAT.search(md)
    return m.group(1) if m else None


def size_of(name: str, limit=256 * 1024):
    for rng in (f"bytes=0-{limit - 1}", None):
        req = urllib.request.Request(BASE + name, headers={"User-Agent": "cover-sizes"})
        if rng:
            req.add_header("Range", rng)
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
        try:
            with Image.open(io.BytesIO(data)) as im:
                return list(im.size)
        except Exception:
            continue
    return None


def main():
    sizes = json.loads(OUT.read_text()) if OUT.exists() else {}
    names = sorted({n for p in (ROOT / "_posts").glob("*.md") if (n := first_cover(p.read_text(encoding="utf-8")))})
    todo = [n for n in names if n not in sizes]
    for i, n in enumerate(todo, 1):
        try:
            s = size_of(n)
        except Exception as e:  # 單張失敗不擋其他張
            print(f"[{i}/{len(todo)}] {n}: {e}", file=sys.stderr)
            continue
        if s:
            sizes[n] = s
        print(f"[{i}/{len(todo)}] {n}: {s}")
    OUT.write_text(json.dumps(dict(sorted(sizes.items())), indent=0, ensure_ascii=False) + "\n")
    print(f"{len(sizes)} 張有尺寸，{len(names)} 篇有封面")


if __name__ == "__main__":
    main()
