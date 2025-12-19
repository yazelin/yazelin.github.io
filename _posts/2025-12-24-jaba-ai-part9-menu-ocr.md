---
layout: post
title: "菜單圖片 AI 辨識：上傳照片自動建立菜單"
subtitle: "用 Claude 視覺能力將菜單照片轉為結構化資料"
date: 2025-12-24
categories: [Jaba AI]
tags: [Python, AI, Claude, OCR, 圖片辨識, 菜單管理]
series: jaba-ai
---

## 前言

這是 [Jaba AI 技術分享系列]({% post_url 2025-12-19-jaba-ai-index %}) 的第九篇文章。

手動建立菜單是一件繁瑣的事情。jaba-ai 提供了一個方便的功能：上傳菜單照片，AI 自動辨識品項和價格，一鍵建立菜單。

這篇文章分享如何利用 Claude 的視覺能力實現這個功能。

---

## 功能流程

```
使用者上傳菜單圖片
    │
    ▼
┌─────────────────────┐
│  1. 圖片壓縮        │  減少傳輸量和 token 消耗
└─────────────────────┘
    │
    ▼
┌─────────────────────┐
│  2. AI 辨識         │  Claude 讀取圖片，輸出 JSON
└─────────────────────┘
    │
    ▼
┌─────────────────────┐
│  3. 差異比對        │  與現有菜單比對（如有）
└─────────────────────┘
    │
    ▼
┌─────────────────────┐
│  4. 人工確認        │  前端展示結果，使用者確認
└─────────────────────┘
    │
    ▼
┌─────────────────────┐
│  5. 儲存菜單        │  寫入資料庫
└─────────────────────┘
```

以下是實際的操作畫面：

![上傳菜單圖片](/assets/images/jaba-ai/05-line-admin-menu-upload-dropzone.png)
*步驟 1：選擇店家後，拖拉或點擊上傳菜單照片*

![AI 辨識中](/assets/images/jaba-ai/07-line-admin-menu-ai-processing.png)
*步驟 2：AI 正在努力辨識菜單內容*

![辨識結果與差異比對](/assets/images/jaba-ai/08-line-admin-menu-ai-result.png)
*步驟 3-4：顯示辨識結果，自動與現有菜單比對差異，使用者確認後套用*

---

## AI 辨識服務

### 核心函數

```python
# app/services/ai_service.py
import asyncio
import json
import re
import tempfile
import time
from pathlib import Path

class AiService:
    async def recognize_menu(self, image_bytes: bytes) -> dict:
        """
        辨識菜單圖片（使用 Claude Code (CLI) + Read 工具）

        Returns:
            {
                "categories": [
                    {
                        "name": "分類名稱",
                        "items": [
                            {
                                "name": "品項名稱",
                                "price": 100,
                                "description": "描述",
                                "variants": [{"name": "M", "price": 50}]
                            }
                        ]
                    }
                ]
            }
        """
        # 建立暫存檔
        temp_dir = Path(tempfile.gettempdir()) / "jaba-ai"
        temp_dir.mkdir(exist_ok=True)
        temp_path = str(temp_dir / f"menu_temp_{int(time.time())}.jpg")

        with open(temp_path, 'wb') as f:
            f.write(image_bytes)

        try:
            # 取得菜單辨識提示詞（從快取/DB）
            prompt = CacheService.get_prompt("menu_recognition")
            if not prompt:
                return {
                    "categories": [],
                    "error": "找不到菜單辨識提示詞"
                }

            # 建構 Claude Code (CLI) 命令
            full_prompt = f"請先使用 Read 工具讀取圖片 {temp_path}，然後{prompt}"
            cmd = [
                self.claude_path, "-p", full_prompt,
                "--model", self.menu_model,
                "--tools", "Read",
                "--allowedTools", "Read",
                "--dangerously-skip-permissions"
            ]

            # 非同步執行
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=self.working_dir,
            )
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(),
                timeout=300  # 圖片辨識可能需要較長時間
            )
            response_text = (stdout_bytes.decode('utf-8') if stdout_bytes else '').strip()

            # 解析 JSON 回應
            json_match = re.search(r'\{[\s\S]*\}', response_text)
            if json_match:
                menu_data = json.loads(json_match.group())
                if "categories" in menu_data:
                    return menu_data

            return {"categories": [], "error": "AI 回應格式錯誤"}

        except asyncio.TimeoutError:
            return {"categories": [], "error": "辨識超時，請稍後再試"}
        finally:
            # 清理暫存檔
            if os.path.exists(temp_path):
                os.unlink(temp_path)
```

### 為什麼用 Claude Code CLI？

Claude 本身支援視覺能力，但 jaba-ai 選擇透過 Claude Code CLI 來執行：

1. **統一架構** — 聊天和圖片辨識都用同一個呼叫方式
2. **Read 工具** — Claude Code 的 Read 工具可以直接讀取本地圖片檔案
3. **簡化實作** — 不需要自己處理 base64 編碼或 multipart 請求

---

## 提示詞設計

菜單辨識的提示詞儲存在資料庫，可以動態調整：

```python
# migrations/versions/002_seed_ai_prompts.py
DEFAULT_PROMPTS = {
    "menu_recognition": """請分析這張菜單圖片，提取所有菜單項目以及店家資訊。

回傳 JSON 格式：
```json
{
  "store_info": {
    "name": "店家名稱（如果圖片中有顯示）",
    "phone": "電話號碼（如果圖片中有顯示）",
    "address": "地址（如果圖片中有顯示）"
  },
  "categories": [
    {
      "name": "分類名稱",
      "items": [
        {
          "name": "品項名稱",
          "price": 數字價格,
          "variants": [{"name": "M", "price": 50}, {"name": "L", "price": 60}],
          "description": "描述（如有）",
          "promo": null
        }
      ]
    }
  ],
  "warnings": ["無法辨識的項目或需要確認的事項"]
}
```

注意事項：
- 價格請只填數字，不含貨幣符號
- 如果無法辨識價格，請填 0 並在 warnings 中說明
- 盡可能保留原始分類結構
- 尺寸變體（variants）：如果品項有多種尺寸，請填入 variants 陣列
- 特價促銷（promo）：如發現買一送一、第二杯半價等，請填入 promo 欄位"""
}
```

### 提示詞重點

| 項目 | 說明 |
|------|------|
| store_info | 順便辨識店家資訊，減少手動輸入 |
| categories | 保留菜單原本的分類結構 |
| variants | 處理 M/L、大碗/小碗等尺寸價格 |
| promo | 辨識買一送一、第二杯半價等促銷 |
| warnings | 回報無法辨識的項目，讓使用者知道哪些需要手動確認 |

---

## 圖片壓縮

上傳的圖片可能很大，需要壓縮以減少 token 消耗：

```python
# app/services/menu_service.py
from PIL import Image
import io

class MenuService:
    def _compress_image(
        self, image_bytes: bytes, max_size: int = 1920, quality: int = 85
    ) -> bytes:
        """
        壓縮圖片（用於 AI 辨識）

        智能檢查：如果圖片檔案 < 500KB 且尺寸 <= max_size，跳過壓縮避免品質損失
        """
        try:
            img = Image.open(io.BytesIO(image_bytes))
            original_size = len(image_bytes)
            needs_resize = max(img.size) > max_size
            needs_convert = img.mode in ("RGBA", "P")

            # 智能檢查：檔案已經夠小且尺寸合適，跳過壓縮
            if original_size < 500 * 1024 and not needs_resize and not needs_convert:
                logger.debug(f"圖片已壓縮，跳過處理")
                return image_bytes

            # 轉換為 RGB（如果是 RGBA）
            if needs_convert:
                img = img.convert("RGB")

            # 保持比例縮放
            if needs_resize:
                ratio = max_size / max(img.size)
                new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
                img = img.resize(new_size, Image.Resampling.LANCZOS)

            # 輸出為 JPEG
            output = io.BytesIO()
            img.save(output, format="JPEG", quality=quality)
            compressed = output.getvalue()

            logger.debug(f"圖片壓縮完成: {original_size} → {len(compressed)} bytes")
            return compressed

        except Exception as e:
            logger.error(f"Image compression error: {e}")
            return image_bytes
```

### 壓縮策略

| 條件 | 處理 |
|------|------|
| < 500KB 且尺寸合適 | 跳過壓縮，保持原始品質 |
| RGBA/透明背景 | 轉為 RGB（JPEG 不支援透明） |
| 尺寸超過 1920px | 等比縮放到 1920px |
| 壓縮後 | 使用 85% 品質的 JPEG |

---

## API 設計

### 純辨識（不指定店家）

```python
# app/routers/admin.py
@router.post("/menu/recognize")
async def recognize_menu_only(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_token),
):
    """辨識菜單圖片（不需要指定店家）"""
    service = MenuService(db)
    image_bytes = await file.read()
    result = await service.recognize_menu_image(image_bytes)
    return result
```

這個 API 用於建立新店家時，先辨識菜單再填店家資訊。

### 辨識並比對（指定店家）

```python
@router.post("/stores/{store_id}/menu/recognize")
async def recognize_menu(
    store_id: UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_token),
):
    """辨識菜單圖片並與現有菜單比對"""
    service = MenuService(db)
    image_bytes = await file.read()

    # 辨識新菜單
    recognized_menu = await service.recognize_menu_image(image_bytes)

    # 取得現有菜單
    existing_menu = await service.get_store_menu(store_id)

    # 比對差異
    diff = None
    if existing_menu:
        diff = service.compare_menus(existing_menu, recognized_menu)

    return {
        "recognized_menu": recognized_menu,
        "existing_menu": existing_menu,
        "diff": diff,
        "store_id": str(store_id),
    }
```

這個 API 用於更新現有店家的菜單，會自動比對差異。

---

## 菜單差異比對

當店家已有菜單時，辨識新菜單後會進行差異比對：

```python
# app/services/menu_service.py

def compare_menus(self, old_menu: dict, new_menu: dict) -> dict:
    """
    比較新舊菜單差異

    Returns:
        {
            "added": [...],      # 新增的品項
            "modified": [...],   # 價格或內容變更的品項
            "unchanged": [...],  # 沒有變更的品項
            "removed": [...]     # 舊菜單有但新菜單沒有的品項
        }
    """
    # 建立索引（用正規化名稱作為 key）
    old_items = {}
    for cat in old_menu.get("categories", []):
        for item in cat.get("items", []):
            key = self._normalize_name(item["name"])
            old_items[key] = {"category": cat["name"], **item}

    new_items = {}
    for cat in new_menu.get("categories", []):
        for item in cat.get("items", []):
            key = self._normalize_name(item["name"])
            new_items[key] = {"category": cat["name"], **item}

    # 比較
    added = []
    modified = []
    unchanged = []
    removed = []

    for key, new_item in new_items.items():
        if key not in old_items:
            added.append(new_item)
        else:
            old_item = old_items[key]
            if self._items_differ(old_item, new_item):
                modified.append({
                    "old": old_item,
                    "new": new_item,
                    "changes": self._get_item_changes(old_item, new_item),
                })
            else:
                unchanged.append(new_item)

    for key, old_item in old_items.items():
        if key not in new_items:
            removed.append(old_item)

    return {
        "added": added,
        "modified": modified,
        "unchanged": unchanged,
        "removed": removed,
    }

def _normalize_name(self, name: str) -> str:
    """正規化品項名稱（去除空白和標點）"""
    import re
    return re.sub(r"[\s\W]", "", name.lower())
```

### 正規化比對

為什麼需要正規化名稱？

| 舊菜單 | 新辨識 | 正規化後 | 結果 |
|--------|--------|----------|------|
| 雞腿便當 | 雞腿便當 | 雞腿便當 | 相同 |
| 雞腿便當 | 雞腿 便當 | 雞腿便當 | 相同 |
| 雞腿便當 | 雞腿便當（人氣）| 雞腿便當人氣 | 不同 |

透過正規化可以減少因為空白、標點不同造成的誤判。

---

## 差異模式儲存

使用者確認辨識結果後，可以選擇性地套用變更：

```python
async def save_menu_diff(
    self,
    store_id: UUID,
    apply_items: List[dict],   # 要套用的品項
    remove_items: List[str],   # 要刪除的品項名稱
) -> Menu:
    """
    選擇性儲存菜單（差異模式）
    """
    # 取得現有菜單
    existing_menu = await self.get_store_menu(store_id)
    if not existing_menu:
        # 沒有現有菜單，直接建立
        categories_data = self._group_items_by_category(apply_items)
        return await self.save_menu(store_id, categories_data)

    # 建立現有品項索引
    existing_by_key = {}
    for cat in existing_menu.get("categories", []):
        for item in cat.get("items", []):
            key = self._normalize_name(item["name"])
            existing_by_key[key] = {"category": cat["name"], **item}

    # 移除指定品項
    for key in remove_items:
        normalized_key = self._normalize_name(key)
        if normalized_key in existing_by_key:
            del existing_by_key[normalized_key]

    # 套用新品項（新增或修改）
    for item in apply_items:
        key = self._normalize_name(item["name"])
        existing_by_key[key] = item

    # 重組成分類結構
    categories_data = self._group_items_by_category(list(existing_by_key.values()))

    return await self.save_menu(store_id, categories_data)
```

這個設計讓使用者可以：
- 只套用新增的品項
- 只更新有變更的價格
- 保留原有但辨識不到的品項
- 刪除已下架的品項

---

## 使用者體驗設計

前端的操作流程：

```
1. 上傳圖片
   ├─ 顯示上傳進度
   └─ 圖片預覽

2. 等待辨識
   ├─ 顯示 loading 動畫
   └─ 預計等待時間（約 30-60 秒）

3. 檢視結果
   ├─ 辨識到的品項列表
   ├─ 差異對比（如有現有菜單）
   │   ├─ 🟢 新增品項
   │   ├─ 🟡 價格變更
   │   └─ 🔴 可能下架
   └─ warnings 提示

4. 確認儲存
   ├─ 可勾選要套用的變更
   ├─ 可手動修改錯誤
   └─ 一鍵儲存
```

---

## 錯誤處理

### 辨識失敗的情況

```python
# 可能的錯誤回應
{
    "categories": [],
    "error": "找不到菜單辨識提示詞"
}

{
    "categories": [],
    "error": "辨識超時，請稍後再試"
}

{
    "categories": [],
    "error": "AI 回應格式錯誤"
}
```

### 前端處理

```javascript
// 前端錯誤處理示意
const result = await recognizeMenu(file);

if (result.error) {
    showError(result.error);
    return;
}

if (result.warnings?.length > 0) {
    showWarnings(result.warnings);
}

// 顯示辨識結果
displayRecognizedMenu(result.categories);
```

---

## 限制與注意事項

### 1. 辨識準確度

AI 辨識不是 100% 準確，可能出錯的情況：

| 情況 | 問題 | 解法 |
|------|------|------|
| 手寫菜單 | 辨識率較低 | 提供手動修改功能 |
| 模糊圖片 | 無法辨識 | 提示重新拍照 |
| 複雜排版 | 分類可能錯誤 | 允許調整分類 |
| 價格標示不清 | 可能讀錯 | warnings 提示 |

### 2. 處理時間

圖片辨識比純文字對話慢很多：

- 小圖（< 1MB）：約 10-20 秒
- 大圖（> 3MB）：約 30-60 秒
- 超時設定：300 秒

### 3. 成本考量

視覺 API 的 token 成本較高。壓縮圖片可以顯著降低成本：

| 圖片大小 | 預估 token | 成本（約） |
|----------|------------|-----------|
| 4000x3000 | ~1700 | $0.02 |
| 1920x1440 | ~800 | $0.01 |
| 壓縮後 | ~500 | $0.006 |

---

## 總結

菜單圖片 AI 辨識的實作重點：

| 項目 | 做法 |
|------|------|
| 視覺辨識 | 透過 Claude Code CLI 的 Read 工具 |
| 提示詞 | 儲存在資料庫，可動態調整 |
| 圖片處理 | 智能壓縮，平衡品質和成本 |
| 差異比對 | 正規化名稱比對，減少誤判 |
| 使用者確認 | 不直接覆蓋，讓使用者選擇性套用 |

這個功能大幅降低了建立菜單的門檻，從原本需要逐項輸入，變成拍張照片就能完成。

---

## 下一篇

下一篇文章會介紹部署相關的主題：[一鍵啟動腳本設計]({% post_url 2025-12-25-jaba-ai-part10-deploy-script %})。

---

## 系列文章

- [Jaba AI 技術分享系列：完整目錄]({% post_url 2025-12-19-jaba-ai-index %})
