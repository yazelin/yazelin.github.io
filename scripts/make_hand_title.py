"""產生首頁案由那句「一筆一畫寫出來」的 SVG:_includes/hand-title.html

用法:python3 scripts/make_hand_title.py
筆畫外形與行筆中線來自 hanzi-writer-data(Make Me a Hanzi,Arphic Public License),從 jsDelivr 抓。
每一畫 = 一條沿著中線的粗線,用筆畫外形裁切;動畫只是把那條線的 dash 從頭推到尾,所以會照筆順一畫一畫出現。
改句子就改 LINES,`|` 是手機上允許換行的位置。
"""
import json, math, os, urllib.request, urllib.parse

LINES = [("不寫程式，", "w1"), ("也能把軟體|做出來", "w2")]
START = 0.3          # 第一畫開始(秒)
TARGET = 3.9         # 整句寫完的目標秒數(含停頓);速度由總筆畫長度反推
MIN_STROKE = 0.03    # 再短的點也至少這麼久,看得出是一筆
GAP_STROKE = 0.004
GAP_CHAR = 0.03
GAP_LINE = 0.12
OUT = os.path.join(os.path.dirname(__file__), "..", "_includes", "hand-title.html")
CACHE = "/tmp/hanzi-writer-data"

def load(c):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, c + ".json")
    if not os.path.exists(p):
        url = "https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/" + urllib.parse.quote(c) + ".json"
        urllib.request.urlretrieve(url, p)
    return json.load(open(p))

def mlen(m):
    return sum(math.dist(m[i], m[i + 1]) for i in range(len(m) - 1))

def extend(m, k=40):
    # 頭尾各延長一點,粗線的圓頭才蓋得滿筆鋒
    def push(a, b):
        d = math.dist(a, b) or 1
        return [a[0] + (a[0] - b[0]) / d * k, a[1] + (a[1] - b[1]) / d * k]
    return [push(m[0], m[1])] + m[1:-1] + [push(m[-1], m[-2])]

chars = [c for text, _ in LINES for c in text if c not in "|，"]
n_strokes = sum(len(load(c)["strokes"]) for c in chars)
total_len = sum(mlen(m) for c in chars for m in load(c)["medians"])
pause = n_strokes * GAP_STROKE + len(chars) * GAP_CHAR + GAP_LINE * (len(LINES) - 1) + 0.12
SPEED = max(TARGET - pause, 1) / total_len

out, uid, t = [], 0, START
for text, cls in LINES:
    html = [f'<span class="w {cls}">']
    for group in text.split("|"):
        html.append('<span class="nb">')
        for c in group:
            svg = '<svg class="hz" viewBox="0 0 1024 1024" aria-hidden="true">'
            if c == "，":
                # 逗號資料庫裡沒有,自己畫一筆
                svg += f'<path class="sk" pathLength="1" style="--t:{t:.2f}s;--d:.12s" d="M250,770 Q285,805 262,868 Q240,915 195,945"/></svg>'
                t += 0.12 + GAP_CHAR
                html.append(svg)
                continue
            d = load(c)
            svg += '<g transform="scale(1,-1) translate(0,-900)">'
            for outline, median in zip(d["strokes"], d["medians"]):
                uid += 1
                dur = max(MIN_STROKE, mlen(median) * SPEED)
                pts = " ".join(f"{x:.0f},{y:.0f}" for x, y in extend(median))
                svg += (f'<clipPath id="k{uid}"><path d="{outline}"/></clipPath>'
                        f'<path class="sk" clip-path="url(#k{uid})" pathLength="1" style="--t:{t:.2f}s;--d:{dur:.2f}s" d="M{pts}"/>')
                t += dur + GAP_STROKE
            html.append(svg + "</g></svg>")
            t += GAP_CHAR
        html.append("</span>")
    html.append("</span>")
    out.append("".join(html))
    print(f"{cls} 寫完於 {t:.2f}s")
    t += GAP_LINE

with open(OUT, "w") as f:
    f.write("{% comment %} 由 scripts/make_hand_title.py 產生,不要手改。筆畫資料:hanzi-writer-data(Make Me a Hanzi,Arphic Public License)。 {% endcomment %}\n")
    f.write("\n".join(out) + "\n")
    # 打勾與蓋章接在最後一筆之後,時間從這裡給 CSS
    f.write(f"<style>:root{{--write-end:{t:.2f}s}}</style>\n")
# 給 CSS 用:最後一筆寫完的時間,打勾與蓋章接在後面
print(f"END={t:.2f}")
