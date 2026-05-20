---
layout: post
title: "codex-image-service：把 Codex $imagegen 包成內網共用的 HTTP 服務"
subtitle: "FastAPI + Docker + bearer API key — 從 Claude Code skill 進一步到多 caller 共享同一個 ChatGPT 訂閱"
date: 2026-05-20
categories: [AI]
tags: [ChatGPT, Codex CLI, FastAPI, Docker, Image Generation, Self-hosted, Homelab, Bearer Token, HTTP API, OpenAI]
---

![codex-image-service cover](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-05-20-codex-image-service.png)

> **🔗 快速連結**
> - 💻 **GitHub**：[yazelin/codex-image-service](https://github.com/yazelin/codex-image-service)
> - 🌐 **Polished guide**：[yazelin.github.io/codex-image-service](https://yazelin.github.io/codex-image-service/)（[繁中](https://yazelin.github.io/codex-image-service/zh-tw.html)）
> - 📔 **昨天的相關文**：[把 Codex 的 $imagegen 包成 Claude Code skill]({% post_url 2026-05-19-claude-codex-imagegen %})

---

## 這個服務是什麼

`codex-image-service` 是一個 **FastAPI 包在 Codex CLI 的 `$imagegen` 工具外面**的小服務。掛在 homelab 裡，發 bearer API key 給內部 script、CI job、各種 side project，讓它們**共享同一個 ChatGPT 訂閱的 image-gen 額度**——透過一個乾淨的 HTTP endpoint，而不是每個 caller 各自 shell 進 host 或燒各自的 OpenAI Images API 額度。

### 後台長什麼樣（19 秒實機操作）

<video controls muted playsinline preload="metadata" style="width: 100%; max-width: 720px; border-radius: 8px; border: 1px solid #e6e8f5;">
  <source src="https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/admin-dashboard.mp4" type="video/mp4">
  你的瀏覽器不支援影片：<a href="https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/admin-dashboard.mp4">直接下載 admin-dashboard.mp4</a>
</video>

實際看一下：API key 發放 / 停用 / 刪除、request 歷史含完整 prompt 與 stdout/stderr、test-generation 表單、手動清理觸發。整個後台沒做花俏設計，就是把日常運維需要的東西放出來。

## 重要 disclaimer

這段直接引 README，因為這個專案的定位需要先講清楚：

> **Personal / experimental use only**
>
> 這個專案是給自己的 homelab 開發測試用。**不隸屬 OpenAI、未獲 OpenAI 背書、也不在 OpenAI 支援範圍內**。它包裝 `@openai/codex` CLI、把它的 `$imagegen` skill 重新暴露成 HTTP API；**每一個 request 都從容器內掛載的 `~/.codex/auth.json` 對應的那一個 ChatGPT 帳號扣 quota**。
>
> - 把單一 ChatGPT 登入給多 caller 共用，**不是 OpenAI 文件化的 pattern**——請自己確認你的帳號條款允許這個情境，合規、計費、濫用處理都由你自己負責
> - Codex CLI 更新可能會改 `$imagegen`、底下的模型（`gpt-image-2`）、sandbox flag、磁碟 layout，這個服務可能要跟著 patch
> - **No SLA, no warranty, no production hardening**。admin login 就是一組 password + HMAC cookie；API key 用 sha256 hash 存；沒有 per-key rate limit、quota、audit log、scoping，只有 enable / disable / delete
> - 如果你 fork 來用，先 audit `app/services/codex_image.py`（它跑 codex 時帶 `--dangerously-bypass-approvals-and-sandbox`，因為 bubblewrap 在 Docker 裡跑不起來），重新評估 threat model

簡單一句：**個人用 / 內部用 / 自負風險**。

## 為什麼需要這個服務

[昨天的 codex-imagegen-skill]({% post_url 2026-05-19-claude-codex-imagegen %}) 處理的是「**個人本機**生圖」——你坐在 Claude Code 前面、想生圖、skill 跑一下、PNG 落地。一個人一台機器一次一張，沒問題。

但接下來這些情境 skill 模式應付不來：

- **多個 script / CI job 都想生圖**——它們不會坐在 Claude Code 前面、不能交互式跑
- **跨機器的工具想用**——例如 GitHub Actions runner、家用 NAS 上的小工具
- **想集中管理 quota**——所有 caller 共用一個訂閱，希望知道誰用了多少、哪些 prompt 失敗了

這就是 codex-image-service 解決的場景：**把 `$imagegen` 從本機 shell 拉到 HTTP 服務**。掛在 homelab、給每個 caller 一把 bearer key、所有 request 都記在 SQLite history、定期自動清過期檔案。

## 大綱

1. [API 介面](#api-介面)
2. [架構](#架構)
3. [兩種部署模式](#兩種部署模式)
4. [Queue 行為](#queue-行為)
5. [自動清理](#自動清理)
6. [Reference image (edit mode)](#reference-image-edit-mode)
7. [今天的開發時間軸](#今天的開發時間軸)
8. [跟 codex-imagegen-skill 的對比](#跟-codex-imagegen-skill-的對比)
9. [何時用 / 不該用](#何時用--不該用)

---

## API 介面

四個 endpoint：

| Method | Path | 用途 | Auth |
|---|---|---|---|
| `POST` | `/v1/images/generate` | 生圖（同步、回傳 URL）| Bearer |
| `GET` | `/generated/<id>.png` | 下載生成的 PNG | Public |
| `GET` | `/health` | health check | Public |
| `*` | `/admin/...` | 管理 UI（發 key、測試生圖、手動清理）| Cookie session |

**用 curl 打一張**：

```bash
curl -sS --fail --max-time 650 \
  -X POST https://images.example.com/codex-image/v1/images/generate \
  -H "Authorization: Bearer $CODEX_IMAGE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "a clean product photo of a ceramic tea cup",
    "size": "1024x1024",
    "quality": "medium",
    "count": 1
  }'
```

回傳：

```json
{
  "id": "img_3f81...",
  "status": "succeeded",
  "images": [
    {
      "url": "https://images.example.com/codex-image/generated/img_3f81....png",
      "expires_at": "2026-05-27T..."
    }
  ],
  "created_at": "2026-05-20T..."
}
```

PNG 直接公開可下載（透過上面那個 `url`）。`expires_at` 是 `created_at + IMAGE_RETENTION_DAYS`（預設 7 天）。

### 多圖編輯（2026-05-20 更新）

`/v1/images/generate` 支援 1–4 張參考圖，走 codex CLI 的 `--image` 變參 + gpt-image edit mode 做 composition / outfit-swap / scene-merge / style-transfer / text-localization。把每張圖 base64 後丟進 `reference_images_base64` 陣列：

```bash
A=$(base64 -w0 < person.png)
B=$(base64 -w0 < kitchen.png)
curl -sS --fail --max-time 650 \
  -X POST https://images.example.com/codex-image/v1/images/generate \
  -H "Authorization: Bearer $CODEX_IMAGE_KEY" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg a "$A" --arg b "$B" '{
    prompt: "place the person from image 1 into the kitchen scene from image 2, preserve their face and outfit",
    reference_images_base64: [$a, $b],
    size: "1024x1024",
    quality: "medium"
  }')"
```

注意事項：
- `count` 在 edit 模式下強制 = 1（gpt-image edit 一次只回一張）
- 舊的單張 `reference_image_base64` （字串）仍保留為 backwards-compat alias
- 每張 ≤ 10 MB；總數上限 4 是服務端的保守設定，gpt-image 本身吃得更多

---

## 架構

```
codex-image-service/
├── app/
│   ├── main.py                   ← FastAPI app entry
│   ├── config.py                 ← env settings (Pydantic Settings)
│   ├── db.py                     ← SQLite connection / migrations
│   ├── models.py                 ← ORM models
│   ├── security.py               ← bearer auth + HMAC session cookie + sha256 key hash
│   ├── api/
│   │   ├── public.py             ← /v1/images/generate, /health, /generated/<id>.png
│   │   └── admin.py              ← /admin/* dashboard routes
│   └── services/
│       ├── codex_image.py        ← 呼叫 codex exec + 撈 session id + 搬檔
│       ├── job_queue.py          ← async queue + worker concurrency
│       ├── storage.py            ← static/generated/ 檔案管理
│       └── cleanup.py            ← 過期掃描 + 刪 PNG / 刪 workdir / mark expired
├── deploy/
│   ├── nginx.codex-image-service.conf.example
│   └── nginx.codex-image-service.location.conf.example
├── tests/
│   ├── test_cleanup.py
│   ├── test_codex_image_edit.py
│   └── test_security.py
├── docker-compose.yml            ← production (behind nginx)
├── docker-compose.local.yml      ← local (port 8000 direct)
├── Dockerfile
├── index.html + zh-tw.html       ← GitHub Pages landing
└── README.md
```

幾個比較關鍵的子模組：

- **`app/services/codex_image.py`**——核心。呼叫 codex 子進程、從 stderr 抓 `session id: <uuid>`、到 `$CODEX_HOME/generated_images/<session_id>/` 撈 PNG / JPG / WebP。和 [skill 那邊]({% post_url 2026-05-19-claude-codex-imagegen %}) 概念一樣，但用 Python `asyncio.subprocess` + 結構化的 dataclass 包起來。
- **`app/services/job_queue.py`**——asyncio queue + 多 worker。requests 進 queue，worker 排隊跑 `codex exec`。並發數靠 `CODEX_WORKER_CONCURRENCY` 控（預設 2）。
- **`app/services/cleanup.py`**——startup + 定期掃 SQLite，把過期 row 對應的 PNG 跟 workdir 刪掉、row 標 `expired`。
- **`app/security.py`**——API key 進 DB 時 sha256 hash、原始值只在發 key 那一刻回傳一次。admin session 走 HMAC-signed cookie。

---

## 兩種部署模式

### 1. Local testing（直接綁 port 8000，不需 nginx）

最快上手的方式：

```bash
git clone https://github.com/yazelin/codex-image-service
cd codex-image-service

cp .env.example .env
# 至少設這兩個：
#   ADMIN_PASSWORD          長一點的隨機字串
#   ADMIN_SESSION_SECRET    長一點的隨機字串
# PUBLIC_BASE_URL 和 ADMIN_URL_PREFIX 用預設即可

docker compose -f docker-compose.local.yml up -d --build

curl -sf http://localhost:8000/health     # {"status":"ok"}
open http://localhost:8000/admin           # 登入、開 API key
```

不想用 Docker 跑開發 loop：

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # 同上
uvicorn app.main:app --reload --port 8000
```

不用 bind-mount，直接吃 host 的 `~/.codex/auth.json`。

### 2. Production — 掛在既有 nginx 後面

```bash
cp .env.example .env
# 至少設：
#   ADMIN_PASSWORD, ADMIN_SESSION_SECRET     長隨機字串
#   PUBLIC_BASE_URL                          https://images.example.com/codex-image
#   ADMIN_URL_PREFIX                         /codex-image

docker compose up -d --build
```

預設的 `docker-compose.yml` 把 container 接到一個事先存在的 Docker network `nginx_bridge_network`。nginx 那邊套 `deploy/nginx.codex-image-service.location.conf.example` 的 snippet，reload nginx，然後：

```bash
curl -sf https://images.example.com/codex-image/health
# {"status":"ok"}
```

打開 `/admin`、登入、按 **Create API Key**，把 `cimg_<random-token>` 整段抄下來。重新整理或離開頁面後**原始值就消失了**（只剩 sha256 hash 在 server）。

---

## Queue 行為

Request 進來會先進內部 queue，背景 worker 跑 `codex exec`。HTTP request 保持開啟直到圖好或 `REQUEST_WAIT_TIMEOUT_SECONDS` 到（預設 600 秒）。

幾個 env knob：

| 變數 | 預設 | 意義 |
|---|---|---|
| `CODEX_WORKER_CONCURRENCY` | 2 | 同時跑幾個 codex 子進程 |
| `GENERATION_QUEUE_MAX_SIZE` | 50 | queue 滿了就 reject 新 request |
| `REQUEST_WAIT_TIMEOUT_SECONDS` | 600 | 單一 request 等多久 |
| `IMAGE_RETENTION_DAYS` | 7 | PNG 保留幾天 |
| `CLEANUP_INTERVAL_HOURS` | (預設) | 過期掃描間隔 |

設計考量：每張圖生成大約 50-70 秒，跟 [昨天 skill 那篇]({% post_url 2026-05-19-claude-codex-imagegen %}) 觀察一致。所以 concurrency 預設 2、timeout 預設 600，是針對「小規模 homelab、可容忍 worker 排隊」這個 sizing 訂的。

---

## 自動清理

每筆 `image_requests` row 都有 `created_at + IMAGE_RETENTION_DAYS` 的 expiry。背景 sweep 啟動時跑一次、之後每 `CLEANUP_INTERVAL_HOURS` 跑一次，做這幾件事：

1. 刪 `static/generated/` 下對應的 PNG
2. 刪 `data/codex-runs/<id>/` 對應的 workdir
3. 把 row 在 SQLite 裡 mark 成 `expired`

admin 也可以從 dashboard 觸發即時 cleanup 或逐筆 delete。

> ⚠️ **Foreign key gotcha**：今天踩到一個雷，刪 API key 時報 500——`connect()` 會跑 `PRAGMA foreign_keys=ON`，所以直接 DELETE api_key row 會因為 history 表還參考它而失敗。修法是 history 的 row 要先 unlink 才能刪 key（commit `6ea829f`）。

---

## Reference image (edit mode)

下午加的功能（commit `1906815`）：`POST /v1/images/generate` 多接受一個 optional field：

```json
{
  "prompt": "...",
  "reference_image_base64": "iVBORw0KGgoAAAANSUhEUg..."
}
```

帶上之後 codex 進 image edit 模式——用 reference image 當 visual seed 而不是純文字 prompt 生成。底層的 `image_gen` 工具在 edit mode 有時會跳過 follow-up copy 步驟，所以 `codex_image.py` 自己用 stderr 的 session id 撈檔（這就是為什麼程式碼裡有 `_find_generated_in_session()` 這個函式）：

```python
_SESSION_ID_RE = re.compile(r"^session id:\s*([0-9a-fA-F-]+)\s*$", re.MULTILINE)

def _find_generated_in_session(stderr: str) -> Path | None:
    """Extract Codex's session id from stderr and locate the image_gen output."""
    match = _SESSION_ID_RE.search(stderr or "")
    if not match:
        return None
    session_id = match.group(1).strip()
    session_dir = _codex_home() / "generated_images" / session_id
    if not session_dir.is_dir():
        return None
    candidates = sorted(
        (p for p in session_dir.iterdir()
         if p.is_file() and p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return candidates[0] if candidates else None
```

跟 skill 那邊靠 stdout 的 `realpath` 不同，service 這邊靠 stderr 的 session id 自己搬——因為 edit mode 不保證有 stdout 的最終路徑。

---

## 今天的開發時間軸

從 `git log` 看，今天 2026-05-20 的 7 個 commit：

| 時間（台北 UTC+8）| SHA | 內容 |
|---|---|---|
| 09:47 | `1b17dd8` | Initial codex-image-service (FastAPI wrapper、bearer auth、SQLite history、admin UI、Docker compose) |
| 10:28 | `ff91c48` | Refactor admin into 4-page dashboard; add local-testing compose |
| 10:37 | `b16802e` | Make new-API-key reveal truly one-shot via PRG flash cookie |
| 10:45 | `d53c6a5` | Clarify Handle vs bearer key on Keys page（避免 operator 把 `key_<last12>` handle 跟真正的 bearer key 搞混）|
| 10:55 | `6ea829f` | Fix 500 on Delete API key: unlink history rows before deleting（上面那個 foreign key 雷）|
| 11:11 | `4e52fd5` | Add OG and Twitter Card meta tags + 1200x630 social image |
| 12:09 | `1906815` | Support image edit (reference_image_base64) on /v1/images/generate |

從 Initial commit 到 image edit 完成，約 2 小時 22 分。

---

## 跟 codex-imagegen-skill 的對比

| 維度 | [codex-imagegen-skill]({% post_url 2026-05-19-claude-codex-imagegen %}) | codex-image-service |
|---|---|---|
| **形式** | Claude Code skill（bash wrapper）| FastAPI HTTP service |
| **使用者** | 你本人坐在 Claude Code 前面 | N 個內部 caller（script / CI / side project）|
| **介面** | `codex-imagegen.sh "<prompt>" "<target>"` | `POST /v1/images/generate` + bearer key |
| **狀態** | 無狀態，每次跑完就結束 | SQLite history、queue、worker、auto-expiry |
| **部署** | `~/.claude/skills/` 目錄 | Docker container + nginx |
| **auth** | 共用 host 上的 `~/.codex/auth.json` | bearer API key + admin password |
| **scope** | 個人、本機 | 內網、多 caller |
| **代碼量** | ~30 行 bash | ~2900 行 Python + HTML + Docker |
| **適合誰** | 個人開發、寫 blog 補圖 | homelab 主、想集中 quota 管理 |

兩者底層都靠 `codex exec '$imagegen ...'`，只是把它從「本機 shell」升級到「HTTP 服務」。

## 何時用 / 不該用

**適合**：

- 自家 homelab、想讓多個內部工具共用同一個 ChatGPT 訂閱的 image quota
- 內網 CI / GitHub Actions runner 之類的 callable 想生圖
- 開發者本機之外，還有家裡的 NAS、樹莓派、各種小服務都想要生圖能力

**不適合**：

- **服務終端使用者的 production app**——LINE bot、SaaS、面向客戶的 web app 都不該用個人 ChatGPT 訂閱 quota，請用 OpenAI Images API + 真 API key
- **需要 SLA、有 audit log 要求、需要 per-tenant rate limit** 的情境——這個服務沒這些東西
- **想完全 air-gapped 跑**——還是要 codex CLI 連 OpenAI，不是離線方案

簡單講：**個人 / 內部 / homelab**——OK；**對外服務終端使用者**——換成 OpenAI Images API 比較對。

---

## 完整連結

- **Repo**：[yazelin/codex-image-service](https://github.com/yazelin/codex-image-service)
- **Polished guide**：[yazelin.github.io/codex-image-service](https://yazelin.github.io/codex-image-service/)（含 Python / GitHub Actions 範例）
- **繁中介紹頁**：[yazelin.github.io/codex-image-service/zh-tw.html](https://yazelin.github.io/codex-image-service/zh-tw.html)
- **License**：MIT
- **前一篇相關**：[把 Codex 的 $imagegen 包成 Claude Code skill]({% post_url 2026-05-19-claude-codex-imagegen %})——個人本機版本，這篇是 HTTP 服務版本
