---
layout: post
title: "nanobanana-py：Python 移植版 + Gemini Model Auto-Fallback"
subtitle: "從 Shell/TypeScript 到 Python，用 FastMCP 重寫的 MCP 圖片生成工具"
date: 2026-01-28
categories: [Claude Code]
tags: [Claude Code, MCP, Python, Nanobanana, Gemini, AI]
---

![nanobanana-py：Python 移植版 + Gemini Model Auto-Fallback](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-01-28-nanobanana-py-python-port.png)

## 前言

之前在[Nanobanana 介紹]({% post_url 2026-01-14-nanobanana-image-generation %})中介紹過 Nanobanana——一個讓 Claude Code 透過 MCP 協議生成圖片的工具。原版是 TypeScript 寫的，搭配 Shell 腳本做安裝。

後來我做了一個完整的 **Python 移植版**：[nanobanana-py](https://github.com/yazelin/nanobanana-py)。

為什麼要重寫一個 Python 版？主要有三個原因：

1. **部署更簡單**：`uvx nanobanana-py` 一行搞定，不需要 Node.js 環境
2. **型別安全**：用 Pydantic 做參數驗證，錯誤訊息更明確
3. **Fallback 機制**：當主模型失敗時，自動切換備用模型繼續執行

本篇會深入比較兩個版本的差異，並詳細說明 Python 版新增的 Auto-Fallback 機制。

---

## 架構概覽

nanobanana-py 的程式結構非常清楚，一共六個模組：

```
src/nanobanana_py/
  __init__.py           # 套件定義
  server.py             # MCP Server 入口（FastMCP 框架）
  image_generator.py    # Gemini API 呼叫 + Fallback 邏輯
  file_handler.py       # 檔案處理（輸出目錄、檔名生成、圖片搜尋）
  icon_processor.py     # Icon 後處理（裁切、縮放）
  types.py              # Pydantic 型別定義
```

技術棧：

| 元件 | 選用 | 說明 |
|------|------|------|
| MCP 框架 | FastMCP `>=2.0.0` | Python MCP Server 框架 |
| HTTP 客戶端 | httpx `>=0.27.0` | 非同步 HTTP 請求 |
| 圖片處理 | Pillow `>=10.0.0` | Icon 裁切、格式轉換 |
| 型別驗證 | Pydantic `>=2.0.0` | 請求/回應模型 |

---

## 與 Shell/TypeScript 版的差異

### 安裝方式比較

**TypeScript 版（原版）**：

```bash
# 需要 Node.js 環境
claude mcp add nanobanana \
  -e NANOBANANA_GEMINI_API_KEY \
  -e NANOBANANA_MODEL \
  -- npx -y @willh/nano-banana-mcp
```

**Python 版**：

```bash
# 只需要 Python 3.10+
uvx nanobanana-py
# 或
pip install nanobanana-py
```

MCP 設定也更簡潔。在 `.mcp.json` 中：

```json
{
  "mcpServers": {
    "nanobanana": {
      "command": "uvx",
      "args": ["nanobanana-py"],
      "env": {
        "NANOBANANA_GEMINI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Python 版獨有的改進

| 特性 | TypeScript 版 | Python 版 |
|------|:------------:|:---------:|
| Gemini Auto-Fallback | X | O |
| `fallbackReason` 欄位 | X | O |
| 預設輸出到子目錄 | X | O |
| Pydantic 型別驗證 | X | O |
| 非 JSON 錯誤處理 | X | O |
| CI/CD 自動測試 | X | O |

---

## Gemini Model Auto-Fallback 機制

這是 Python 版最核心的新功能。Gemini API 在高負載時容易出現超時或 503 錯誤，如果只有一個模型可用，使用者就會直接拿到錯誤訊息。

### 設計思路

Fallback 機制的核心邏輯在 `image_generator.py` 的 `_call_gemini_api` 方法中：

```python
async def _call_gemini_api(
    self,
    prompt: str,
    resolution: ImageResolution | None = None,
) -> tuple[dict[str, Any], str, bool, str | None]:
    """呼叫 Gemini REST API（帶 fallback 機制）

    Returns:
        tuple: (response_data, model_used, used_fallback, fallback_reason)
    """
    last_error: Exception | None = None
    primary_model = self.fallback_models[0]
    model_errors: dict[str, str] = {}

    for model_name in self.fallback_models:
        url = f"{API_BASE_URL}/{model_name}:generateContent?key={self.api_key}"

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(url, json=request_body)

                if response.status_code != 200:
                    try:
                        error_data = response.json()
                        error_message = error_data.get("error", {}).get(
                            "message", response.text
                        )
                    except ValueError:
                        error_message = response.text or f"HTTP {response.status_code}"
                    model_errors[model_name] = (
                        f"API {response.status_code}: {error_message}"
                    )
                    continue

                # 成功，回傳結果並附帶 fallback 資訊
                # ...

        except httpx.TimeoutException:
            model_errors[model_name] = f"timeout after {self.timeout}s"
            continue

    raise RuntimeError(f"All models failed. Last error: {last_error}")
```

重點在於：每次 fallback 時都會記錄前一個模型失敗的原因（`model_errors` 字典），最終回傳時會帶上 `fallback_reason` 欄位。

### Fallback 鏈

預設的 fallback 鏈：

```
gemini-2.5-flash-image  -->  gemini-2.0-flash-exp-image-generation
     (主模型)                      (備援模型)
```

也可以自訂：

```bash
export NANOBANANA_MODEL="gemini-3-pro-image-preview"
export NANOBANANA_FALLBACK_MODELS="gemini-2.5-flash-image,gemini-2.0-flash-exp-image-generation"
```

### fallbackReason 欄位

當 fallback 發生時，API 回應會包含完整的診斷資訊：

```json
{
  "success": true,
  "message": "Successfully generated 1 image (使用備用模型: gemini-2.5-flash-image，原因: API 503: The model is overloaded)",
  "modelUsed": "gemini-2.5-flash-image",
  "usedFallback": true,
  "primaryModel": "gemini-3-pro-image-preview"
}
```

---

## 非 JSON API 錯誤回應處理

Gemini API 有時候不會回傳 JSON 格式的錯誤——例如在嚴重過載時，可能直接回傳 HTML 錯誤頁面。TypeScript 版遇到這種情況會直接 crash。

Python 版加了一層防護：

```python
if response.status_code != 200:
    try:
        error_data = response.json()
        error_message = error_data.get("error", {}).get("message", response.text)
    except ValueError:
        # 非 JSON 回應（例如 HTML 錯誤頁面）
        error_message = response.text or f"HTTP {response.status_code}"
    model_errors[model_name] = f"API {response.status_code}: {error_message}"
    continue
```

`try/except ValueError` 這段很關鍵——當 `response.json()` 解析失敗時，會退回使用 `response.text` 作為錯誤訊息，而不是讓整個流程中斷。

---

## 預設輸出到 nanobanana-output 子目錄

TypeScript 版會把圖片直接存到當前工作目錄，久了之後會混在專案檔案中。

Python 版改為預設存到 `nanobanana-output/` 子目錄：

```python
def get_output_directory() -> Path:
    output_dir = os.getenv("NANOBANANA_OUTPUT_DIR")
    if output_dir:
        path = Path(output_dir)
    else:
        path = Path.cwd() / "nanobanana-output"

    path.mkdir(parents=True, exist_ok=True)
    return path
```

好處：
- 生成的圖片不會混在專案根目錄
- `.gitignore` 一行加上 `nanobanana-output/` 就排除所有生成圖片
- 仍然可以透過 `NANOBANANA_OUTPUT_DIR` 環境變數自訂路徑

---

## Pydantic 型別系統

Python 版用 Pydantic 定義了完整的型別模型：

```python
class ImageGenerationResponse(BaseModel):
    """圖片生成回應"""
    success: bool
    message: str
    generated_files: list[str] = Field(default_factory=list)
    error: str | None = None
    model_used: str | None = None
    used_fallback: bool = False
    primary_model: str | None = None
    fallback_reason: str | None = None
```

每個 Tool 的參數也有完整的 Pydantic 定義，包含 `Field` 的 `description`、`ge`/`le` 驗證等。這意味著：

- MCP Client 能自動拿到完整的參數描述
- 無效參數會在進入邏輯前就被攔截
- IDE 可以提供完整的型別提示

---

## CI/CD 測試整合

Python 版建立了兩個 GitHub Actions workflow：

**測試 workflow**：每次 push 或 PR 時自動執行 pytest。

**發布 workflow**：在 GitHub Release 建立時觸發，使用 PyPI Trusted Publishing。流程是 **跑測試 → 建置套件 → 發布到 PyPI**，確保發布的版本一定通過測試。

---

## 環境變數一覽

| 變數 | 說明 | 預設值 |
|------|------|--------|
| `NANOBANANA_GEMINI_API_KEY` | API Key | （必填） |
| `NANOBANANA_MODEL` | 主模型 | `gemini-2.5-flash-image` |
| `NANOBANANA_FALLBACK_MODELS` | Fallback 模型（逗號分隔） | 自動設定 |
| `NANOBANANA_TIMEOUT` | API 超時（秒） | `60` |
| `NANOBANANA_OUTPUT_DIR` | 輸出目錄 | `./nanobanana-output/` |
| `NANOBANANA_DEBUG` | 啟用除錯日誌 | （未設定） |

---

## 小結

nanobanana-py 是 Nanobanana 的 Python 完整移植版，在保持相同功能的前提下，加入了幾個重要改進：

- **Gemini Auto-Fallback**：主模型失敗時自動切換備援模型，回應中帶有 `fallbackReason` 診斷資訊
- **非 JSON 錯誤處理**：不會因為 API 回傳非預期格式而 crash
- **預設輸出子目錄**：生成圖片不再散落在專案根目錄
- **Pydantic 型別驗證**：參數錯誤在進入邏輯前就被攔截
- **CI/CD 整合**：GitHub Actions 自動測試 + PyPI Trusted Publishing

如果你的開發環境有 Python 但沒有 Node.js，或是想要更穩定的 Fallback 機制，推薦切換到 Python 版。

---

## 參考資源

- [nanobanana-py GitHub](https://github.com/yazelin/nanobanana-py)
- [nanobanana-py PyPI](https://pypi.org/project/nanobanana-py/)
- [Nanobanana 基礎介紹]({% post_url 2026-01-14-nanobanana-image-generation %})
- [Nanobanana Shell 版更新]({% post_url 2026-01-15-nanobanana-shell-update %})
- [FastMCP 框架](https://github.com/jlowin/fastmcp)
- [Google AI Studio](https://aistudio.google.com/apikey)
