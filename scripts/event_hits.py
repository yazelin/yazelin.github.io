#!/usr/bin/env python3
"""列出每場已發布直播活動頁的累計瀏覽數。"""

from __future__ import annotations

import argparse
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent.parent
DASHBOARD_URL = "https://k-rider-api.yazelinj303.workers.dev/hits"
FRONTMATTER_RE = re.compile(r"\A---[ \t]*\r?\n(.*?)\r?\n---[ \t]*(?:\r?\n|\Z)", re.DOTALL)
FIELD_RE = re.compile(r"^([\w-]+):[ \t]*(.*?)[ \t]*$", re.MULTILINE)


class SiteHitParser(HTMLParser):
    """讀取公開儀表板中每個站名的累計數。"""

    def __init__(self) -> None:
        super().__init__()
        self.totals: dict[str, int] = {}
        self._row: list[tuple[str, str | None, str]] | None = None
        self._cell: tuple[str, str | None, list[str]] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "tr":
            self._row = []
        elif tag in {"th", "td"} and self._row is not None:
            attr_map = dict(attrs)
            self._cell = (tag, attr_map.get("scope"), [])

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._cell[2].append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"th", "td"} and self._cell is not None:
            cell_tag, scope, parts = self._cell
            if self._row is not None:
                self._row.append((cell_tag, scope, "".join(parts).strip()))
            self._cell = None
        elif tag == "tr" and self._row is not None:
            self._record_row(self._row)
            self._row = None

    def _record_row(self, row: list[tuple[str, str | None, str]]) -> None:
        if len(row) < 2 or row[0][:2] != ("th", "row") or row[1][0] != "td":
            return
        try:
            self.totals[row[0][2]] = int(row[1][2].replace(",", ""))
        except ValueError:
            return


def event_sites(events_dir: Path) -> list[str]:
    """回傳已發布、屬於直播場次的計數鍵值。"""
    sites: list[str] = []
    for path in sorted(events_dir.rglob("*.md")):
        match = FRONTMATTER_RE.match(path.read_text(encoding="utf-8"))
        if not match:
            continue
        fields = {key: value.strip().strip("\"'") for key, value in FIELD_RE.findall(match.group(1))}
        if fields.get("layout") != "event" or not fields.get("event_date"):
            continue
        if fields.get("published", "true").lower() == "false":
            continue
        sites.append(f"event-{path.stem}")
    return sites


def parse_dashboard(html: str) -> dict[str, int]:
    """解析 Worker 公開儀表板的站名與累計數。"""
    if "站台開啟計數" not in html:
        raise ValueError("回應內容不是站台開啟計數儀表板")
    parser = SiteHitParser()
    parser.feed(html)
    return parser.totals


def fetch_dashboard(url: str) -> str:
    request = Request(url, headers={"User-Agent": "event-hits/1.0"})
    with urlopen(request, timeout=15) as response:
        return response.read().decode("utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="列出每場已發布直播活動頁的累計瀏覽數")
    parser.add_argument("--events-dir", type=Path, default=ROOT / "events", help="活動頁目錄")
    parser.add_argument("--url", default=DASHBOARD_URL, help="計數儀表板網址")
    args = parser.parse_args()

    try:
        sites = event_sites(args.events_dir)
        counts = parse_dashboard(fetch_dashboard(args.url))
    except (OSError, UnicodeError, ValueError) as error:
        print(f"讀取活動頁瀏覽數失敗：{error}", file=sys.stderr)
        return 1

    if not sites:
        print(f"找不到活動頁：{args.events_dir}", file=sys.stderr)
        return 1

    print("活動頁鍵值\t累計瀏覽")
    for site in sites:
        print(f"{site}\t{counts.get(site, 0)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
