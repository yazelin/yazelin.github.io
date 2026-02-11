---
layout: post
title: "catime：自動化每小時 AI 貓咪圖片生成器"
subtitle: "用 GitHub Actions + Gemini API，每小時自動生成一隻獨一無二的貓"
date: 2026-01-30
categories: [AI]
tags: [AI, Python, GitHub Actions, Gemini, 圖片生成, 自動化]
---

![catime：自動化每小時 AI 貓咪圖片生成器](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-01-30-catime-birth.png)

## 前言

某個深夜，一個念頭浮現：「如果每個小時都能自動生成一張 AI 貓咪圖片，那不是很棒嗎？」

從 idea 到第一隻貓誕生，只花了不到一小時。2026 年 1 月 30 日凌晨 05:46 UTC，Cat #1 正式問世。接下來的 18 小時內，專案從一個簡單的 cron job 演化出了 CLI 工具、PyPI 套件、自動重試機制，到了深夜已經產出 21 隻貓。

這篇文章記錄了 **catime** 的誕生過程——一個用 GitHub Actions 每小時自動生成 AI 貓咪圖片的專案。

---

## 命名歷程：從 ccat 到 catime

取名字比寫程式還難。這個專案在第一天就經歷了三次改名：

| 時間點 | 名稱 | 為什麼改 |
|--------|------|----------|
| 05:46 UTC | **ccat** | 最初的名字，cat + cat 的縮寫 |
| 數小時後 | **catcat** | 發布到 PyPI 才發現 ccat 已經被佔了 |
| 同日稍後 | **catime** | cat + time，既好記又切題 |

最終定名 **catime**，因為這個專案的核心就是「每個小時（time）生一隻貓（cat）」。

---

## 核心架構

整個系統的運作方式可以用一句話概括：**GitHub Actions 每小時觸發，透過 Gemini API 生成貓咪圖片，上傳到 GitHub Release，記錄到月度 Issue。**

初始版的架構非常單純：

```
GitHub Actions (cron: 每小時)
    |
    v
generate_cat.py
    |
    +-- 固定中文 prompt → nanobanana-py + Gemini 生成圖片
    |
    v
上傳 Release Asset -> 更新 catlist.json -> 發佈 Issue Comment
```

### 初始版 Prompt

第一版的 prompt 極其簡單——就是一行固定的中文指令：

```python
prompt = f"畫一隻可愛的貓，並在圖片中顯示現在的日期與時間: {timestamp}"
```

直接把這行餵給 nanobanana-py 的 `ImageGenerator`，就能生成一張圖。這個做法的好處是零複雜度，壞處是每張圖都差不多——「一隻可愛的貓」的變化空間有限。

這個問題在後續的演進中逐步解決：先加入了 [Gemini Flash 生成多樣化 prompt]({% post_url 2026-02-02-catime-ai-prompt %})，再加入 [故事欄位]({% post_url 2026-02-03-catime-story %})，最後發展出 [新聞靈感 + avoid list 的完整三階段管線]({% post_url 2026-02-06-catime-news-cat %})。但誕生那天，就是這麼一行搞定。

---

## GitHub Actions 自動化

### 排程與重試

workflow 設定為每小時整點和半點各觸發一次。為什麼要半點？因為 AI 圖片生成偶爾會失敗，半點的觸發就是重試機制：

```yaml
on:
  schedule:
    - cron: '0,30 * * * *'  # 每小時 :00 和 :30
  workflow_dispatch:         # 手動觸發
```

程式會先檢查這個小時是否已經有成功的貓，有的話就跳過：

```python
def already_has_cat_this_hour(now: datetime) -> bool:
    """Check if a successful cat already exists for the current hour."""
    cats = json.loads(catlist_path.read_text())
    hour_prefix = now.strftime("%Y-%m-%d %H:")
    return any(
        c.get("status", "success") == "success"
        and c["timestamp"].startswith(hour_prefix)
        for c in cats
    )
```

### Concurrency Guard

多個 workflow 同時執行可能造成 git push 衝突。用 concurrency group 避免：

```yaml
concurrency:
  group: hourly-cat
  cancel-in-progress: false  # 不取消正在執行的 job
```

再加上 push 的 retry 機制：

```python
for attempt in range(3):
    result = subprocess.run(["git", "push"], capture_output=True, text=True)
    if result.returncode == 0:
        break
    print(f"Push failed (attempt {attempt + 1}), rebasing...")
    subprocess.run(["git", "pull", "--rebase"], check=True)
```

### 模型 Fallback

圖片生成使用 `gemini-3-pro-image-preview` 作為主要模型，如果失敗會自動降級到 `gemini-2.5-flash-image`：

```yaml
env:
  NANOBANANA_MODEL: gemini-3-pro-image-preview
  NANOBANANA_FALLBACK_MODELS: gemini-3-pro-image-preview,gemini-2.5-flash-image
  NANOBANANA_TIMEOUT: '180'
```

---

## 圖片託管與資料結構

### Release Asset 託管

生成的圖片不存在 repo 裡（那會讓 repo 爆炸），而是上傳到名為 `cats` 的 GitHub Release 作為 asset：

```python
def upload_image_as_release_asset(image_path: str) -> str:
    subprocess.run([
        "gh", "release", "upload", RELEASE_TAG,
        image_path, "--repo", REPO, "--clobber",
    ], check=True)
    return f"https://github.com/{REPO}/releases/download/{RELEASE_TAG}/{filename}"
```

### catlist.json

每隻貓的生成記錄都寫入 `catlist.json`，包含編號、時間戳、圖片 URL、使用的模型、生成狀態等。初始版是一個扁平的 JSON 陣列，所有資料都在同一個檔案裡。

後來隨著貓咪數量增加和資料欄位擴充（prompt、story、idea、news_inspiration），這個檔案逐漸膨脹。最終在 [WebP 優化]({% post_url 2026-02-07-catime-webp-optimization %})時，拆分為輕量索引 + 月度明細的兩層結構。

### 月度 Issue 相簿

每個月自動建立一個 GitHub Issue，每隻貓生成後會自動留言附圖：

```python
def get_or_create_monthly_issue(now: datetime) -> str:
    month_label = now.strftime("%Y-%m")
    title = f"Cat Gallery - {month_label}"
    # 搜尋已存在的 issue，沒有就建新的
```

---

## PyPI 發布

catime 發布在 PyPI，使用 Trusted Publisher 免密碼發布。建立 GitHub Release 時自動觸發：

```yaml
name: Publish to PyPI

on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    environment: pypi
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install uv
      - run: uv build
      - run: uv publish --trusted-publishing always
```

不需要手動設定 PyPI token，GitHub 和 PyPI 之間透過 OIDC 信任關係完成身份驗證。

---

## CLI 功能

安裝後即可用一行指令查看貓咪：

```bash
# 安裝（不需要 clone repo）
uvx catime

# 查看總數
uvx catime

# 查看最新的貓
uvx catime latest

# 查看特定編號
uvx catime 42

# 查看今天的貓
uvx catime today

# 查看特定日期特定小時
uvx catime 2026-01-30T05
```

CLI 會從 GitHub 拉取 `catlist.json` 來查詢貓咪資訊。後來又加入了 `catime view` 指令，可以直接在瀏覽器中開啟 [Gallery]({% post_url 2026-02-01-catime-gallery %})。

---

## 第一天的 Git Log

從 git log 可以看到第一天的開發歷程，幾乎每一個 commit 都代表一個功能的完成：

```
05:46  Add cat #1                          <- 第一隻貓！
05:56  Add cat #2
       Add failure logging                 <- 加入失敗記錄
       Add README.md
       Add time-based query support to CLI <- CLI 時間查詢
       Add PyPI publish workflow           <- PyPI 自動發布
       Rename PyPI package to catcat       <- ccat 被佔了
       Fix push conflicts: retry + concurrency guard
       Rename to catime                    <- 最終定名
       Use monthly issues for cat gallery
       Add 'catime latest' command
       Update README with all features
06:33  Add cat #4
  ...
23:27  Add cat #21                         <- 第一天結束，共 21 隻貓
```

從凌晨到深夜，Cat #1 到 Cat #21，專案在 18 小時內從零到一個完整的自動化系統。

---

## 小結

catime 的核心理念很簡單：**讓無聊的事情自動化，讓 AI 來負責創意。**

回顧第一天的成果：

- **圖片生成**：nanobanana-py 封裝 Gemini API，支援模型 fallback
- **自動化**：GitHub Actions 每小時排程，失敗自動重試，concurrency guard 防止衝突
- **資料管理**：catlist.json 記錄每隻貓的生成資訊，圖片託管在 Release Asset
- **使用者體驗**：PyPI 套件 + CLI 工具，`uvx catime` 一行指令就能看貓

第一天結束時，catime 已經自動產出 21 隻貓。雖然每隻都差不多是「一隻可愛的貓」，但自動化管線已經跑起來了。接下來的一週，專案持續演進——[AI prompt 生成]({% post_url 2026-02-02-catime-ai-prompt %})、[Gallery]({% post_url 2026-02-01-catime-gallery %})、[故事功能]({% post_url 2026-02-03-catime-story %})、[新聞靈感]({% post_url 2026-02-06-catime-news-cat %})——最終在一週後累積超過 150 隻風格各異的貓。

---

## 參考資源

- [catime GitHub](https://github.com/yazelin/catime)
- [catime PyPI](https://pypi.org/project/catime/)
- [catime 貓咪相簿](https://yazelin.github.io/catime)
- [nanobanana-py PyPI](https://pypi.org/project/nanobanana-py/)
- [Nanobanana 介紹]({% post_url 2026-01-14-nanobanana-image-generation %})
- [Google Gemini API](https://ai.google.dev/)
- [GitHub Actions 文件](https://docs.github.com/en/actions)
