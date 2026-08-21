"""Generate 1200×630 Open Graph cards in the site's own visual language.

Colours and type mirror assets/css/site.css (--bg / --fg / --accent …) so a
shared card looks like the site it links to.

  python3 scripts/make_og.py                      # site default → images/og-default.png
  python3 scripts/make_og.py --title "…" --subtitle "…" -o images/og/foo.png
  python3 scripts/make_og.py --title "…" --art images/characters/x.webp -o images/og/x.png

Titles wrap on their own; CJK breaks per character, Latin/number runs stay
whole. If a title still overflows the card the font steps down until it fits.
"""

import argparse
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent

# Straight from assets/css/site.css :root
BG = (253, 252, 250)        # --bg
FG = (28, 25, 23)           # --fg
MUTED = (107, 101, 96)      # --muted
ACCENT = (4, 120, 87)       # --accent
ACCENT_WEAK = (236, 253, 245)  # --accent-weak
BORDER = (232, 229, 225)    # --border

W, H = 1200, 630
MARGIN = 96
MAX_TEXT_W = W - MARGIN * 2

FONT_BLACK = "/home/ct/.local/share/fonts/NotoSansTC-Black.ttf"
FONT_BOLD = "/home/ct/.local/share/fonts/NotoSansTC-Bold.ttf"
FONT_REG = "/home/ct/.local/share/fonts/NotoSansTC-Light.ttf"

SITE_TITLE = "不寫程式，\n也能把軟體做出來"
SITE_SUBTITLE = "甲方思維：開規格、下發包、做驗收"
SITE_URL = "yazelin.github.io"
BYLINE = "林亞澤 Yaze"

# A Latin/number/punctuation run is one unbreakable unit; every CJK
# character is its own. Keeps "LINE Creators Market" from splitting.
TOKEN_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9\-_.:/+']*|\s+|.")


def wrap(d, text, font, max_w):
    """\n forces a break — use it to control where a known title splits."""
    lines = []
    for para in text.split("\n"):
        cur = ""
        for tok in TOKEN_RE.findall(para):
            if d.textlength(cur + tok, font=font) > max_w and cur:
                lines.append(cur.rstrip())
                cur = "" if tok.isspace() else tok
            else:
                cur += tok
        if cur.strip():
            lines.append(cur.rstrip())
    return lines


def fit_title(d, text, max_w, max_lines, start=82, floor=44):
    """Largest size at which the title fits in max_lines. Steps down 4px
    at a time; at `floor` it gives up and returns whatever it has."""
    size = start
    while size > floor:
        font = ImageFont.truetype(FONT_BLACK, size)
        lines = wrap(d, text, font, max_w)
        if len(lines) <= max_lines:
            return font, lines, size
        size -= 4
    font = ImageFont.truetype(FONT_BLACK, floor)
    return font, wrap(d, text, font, max_w)[:max_lines], floor


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--title", default=SITE_TITLE)
    ap.add_argument("--subtitle", default=SITE_SUBTITLE)
    ap.add_argument("--eyebrow", default=BYLINE,
                    help="small pill above the title (e.g. a category)")
    ap.add_argument("--art", default="",
                    help="portrait pasted flush right; the text column narrows to match")
    ap.add_argument("-o", "--out", default="images/og-default.png")
    args = ap.parse_args()

    canvas = Image.new("RGBA", (W, H), BG + (255,))

    # Soft accent wash, bottom-right — same restraint as the site itself
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.ellipse((W - 420, H - 380, W + 240, H + 260), fill=ACCENT + (18,))
    canvas = Image.alpha_composite(canvas, overlay)

    # Optional portrait on the right. Bleeds off the top and bottom edges so a
    # 3:4 character sheet fills the column instead of floating in it.
    text_w = MAX_TEXT_W
    if args.art:
        art_path = Path(args.art)
        if not art_path.is_absolute():
            art_path = ROOT / art_path
        art = Image.open(art_path).convert("RGBA")
        col_w = 430
        scale = max(col_w / art.width, H / art.height)
        art = art.resize((round(art.width * scale), round(art.height * scale)),
                         Image.LANCZOS)
        # Portraits: anchor to the top so the face survives. Landscape art
        # (the group pages) has nothing at the top worth keeping, so centre it.
        top = 0 if art.height >= art.width else max(0, (art.height - H) // 2)
        art = art.crop((0, top, col_w, top + H))
        canvas.alpha_composite(art, (W - col_w, 0))
        # Feather the inner edge so the crop does not read as a hard seam
        fade = Image.new("RGBA", (72, H), BG + (255,))
        mask = Image.linear_gradient("L").rotate(270, expand=True).resize((72, H))
        canvas.paste(fade, (W - col_w, 0), mask)
        text_w = W - col_w - MARGIN - 48

    d = ImageDraw.Draw(canvas)

    # Accent rule — the one graphic element, echoes the blockquote border
    d.rounded_rectangle((MARGIN, 96, MARGIN + 64, 102), radius=3, fill=ACCENT)

    # Eyebrow pill (same shape as .post-tags chips)
    eyebrow_font = ImageFont.truetype(FONT_BOLD, 24)
    bb = d.textbbox((0, 0), args.eyebrow, font=eyebrow_font)
    pw, ph = (bb[2] - bb[0]) + 40, 44
    d.rounded_rectangle((MARGIN, 132, MARGIN + pw, 132 + ph),
                        radius=ph // 2, fill=ACCENT_WEAK)
    d.text((MARGIN + 20 - bb[0], 132 + (ph - (bb[3] - bb[1])) // 2 - bb[1]),
           args.eyebrow, fill=ACCENT, font=eyebrow_font)

    # Title — grows to fill the card, shrinks when the text is long
    title_font, title_lines, size = fit_title(d, args.title, text_w, 3)
    y = 224
    for line in title_lines:
        d.text((MARGIN, y), line, fill=FG, font=title_font)
        y += int(size * 1.18)

    # Subtitle
    if args.subtitle:
        sub_font = ImageFont.truetype(FONT_REG, 30)
        for line in wrap(d, args.subtitle, sub_font, text_w)[:2]:
            d.text((MARGIN, y + 30), line, fill=MUTED, font=sub_font)
            y += 42

    # Footer: hairline + URL
    d.line((MARGIN, H - 108, MARGIN + text_w, H - 108), fill=BORDER, width=2)
    url_font = ImageFont.truetype(FONT_BOLD, 27)
    d.text((MARGIN, H - 82), SITE_URL, fill=ACCENT, font=url_font)

    out_path = Path(args.out)
    if not out_path.is_absolute():
        out_path = ROOT / out_path
    out_path.parent.mkdir(parents=True, exist_ok=True)
    # Format follows the extension. Cards with artwork on them are photographic
    # enough that PNG costs 4-10x for no visible gain, and these go into git.
    if out_path.suffix.lower() in (".jpg", ".jpeg"):
        canvas.convert("RGB").save(out_path, "JPEG", quality=88, optimize=True,
                                   progressive=True)
    else:
        canvas.convert("RGB").save(out_path, "PNG", optimize=True)
    print(f"saved {out_path} ({out_path.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
