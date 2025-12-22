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

````python
# migrations/versions/002_seed_ai_prompts.py
DEFAULT_PROMPTS = {
    "menu_recognition": """請分析這張菜單圖片，提取所有菜單項目以及店家資訊。

回傳 JSON 格式：
```json
{
  "store_info": {
    "name": "店家名稱（如果圖片中有顯示）",
    "phone": "電話號碼（如果圖片中有顯示）",
    "address": "地址（如果圖片中有顯示）",
    "description": "店家描述或營業時間等資訊（如果圖片中有顯示）"
  },
  "categories": [
    {
      "name": "分類名稱",
      "items": [
        {
          "id": "item-1",
          "name": "品項名稱",
          "price": 數字價格,
          "variants": [{"name": "M", "price": 50}, {"name": "L", "price": 60}],
          "description": "描述（如有）",
          "available": true,
          "promo": null
        }
      ]
    }
  ],
  "warnings": ["無法辨識的項目或需要確認的事項"]
}
```

注意事項：
- store_info 欄位：請盡可能從菜單圖片中辨識店家資訊
  - 如果圖片中沒有該資訊，該欄位填 null
  - 電話格式範例：02-1234-5678、0912-345-678
  - 地址請盡量完整
- id 請用 item-1, item-2... 格式
- 價格請只填數字，不含貨幣符號
- 如果無法辨識價格，請填 0 並在 warnings 中說明
- 盡可能保留原始分類結構
- 如果沒有明確分類，請使用「一般」作為分類名稱
- available 預設為 true
- 尺寸變體（variants）：
  - 如果品項有多種尺寸（如 M/L、大/中/小、大碗/小碗），請填入 variants 陣列
  - 每個 variant 包含 name（尺寸名稱）和 price（該尺寸價格）
  - price 欄位填入最小尺寸的價格作為預設
  - 如果品項只有單一價格，不需要 variants 欄位

特價促銷品項（promo）：
- 如果發現特價或促銷標示（如「買一送一」、「第二杯10元」、「第二杯半價」、「限時特價」、「優惠價」），請填入 promo 欄位
- 將特價品項歸類至「特價優惠」分類
- promo 格式依促銷類型：
  - 買一送一：{"type": "buy_one_get_one", "label": "買一送一"}
  - 第二杯固定價：{"type": "second_discount", "label": "第二杯10元", "second_price": 10}
  - 第二杯折扣：{"type": "second_discount", "label": "第二杯半價", "second_ratio": 0.5}
  - 限時特價：{"type": "time_limited", "label": "限時特價", "original_price": 原價, "promo_price": 特價}
- 無促銷則 promo 為 null 或不填"""
}
````

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

上傳的圖片可能很大，壓縮可以減少上傳時間。

> **注意**：Claude 會自動將超過 1568px 的圖片縮小，所以壓縮主要是為了加快上傳速度，對 token 消耗影響有限。詳見 [Anthropic 官方文件](https://docs.anthropic.com/en/docs/build-with-claude/vision)。

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

圖片辨識比純文字對話慢很多，以下是實際測試結果：

**測試環境**：Claude Code CLI + Read 工具

**測試指令（簡化版 prompt）**：

```bash
time claude -p "請先使用 Read 工具讀取圖片 /path/to/menu.jpg，然後請分析這張菜單圖片，提取所有菜單項目以及店家資訊。回傳 JSON 格式，包含 store_info、categories、warnings。價格請只填數字。" \
  --model opus \
  --allowedTools "Read" \
  --dangerously-skip-permissions
```

**測試指令（完整版 prompt）**：

```bash
# 將完整 prompt 存成檔案
cat > /tmp/menu_prompt.txt << 'EOF'
請先使用 Read 工具讀取圖片 /path/to/menu.jpg，然後請分析這張菜單圖片，提取所有菜單項目以及店家資訊。

回傳 JSON 格式：
{
  "store_info": {
    "name": "店家名稱（如果圖片中有顯示）",
    "phone": "電話號碼（如果圖片中有顯示）",
    "address": "地址（如果圖片中有顯示）",
    "description": "店家描述或營業時間等資訊（如果圖片中有顯示）"
  },
  "categories": [
    {
      "name": "分類名稱",
      "items": [
        {
          "id": "item-1",
          "name": "品項名稱",
          "price": 數字價格,
          "variants": [{"name": "M", "price": 50}, {"name": "L", "price": 60}],
          "description": "描述（如有）",
          "available": true,
          "promo": null
        }
      ]
    }
  ],
  "warnings": ["無法辨識的項目或需要確認的事項"]
}

注意事項：
- store_info 欄位：請盡可能從菜單圖片中辨識店家資訊，如果圖片中沒有該資訊，該欄位填 null
- id 請用 item-1, item-2... 格式
- 價格請只填數字，不含貨幣符號
- 如果無法辨識價格，請填 0 並在 warnings 中說明
- 盡可能保留原始分類結構
- available 預設為 true
- 尺寸變體（variants）：如果品項有多種尺寸，請填入 variants 陣列
- 特價促銷品項（promo）：如果發現特價或促銷標示，請填入 promo 欄位
EOF

# 執行測試
time cat /tmp/menu_prompt.txt | claude --model opus --allowedTools "Read" --dangerously-skip-permissions
```

將 `/path/to/menu.jpg` 換成你的菜單圖片路徑，`--model` 可選 `opus` 或 `sonnet`。

**測試圖片 1：便當菜單**（653×932 px, 387KB）

<img src="/assets/images/jaba-ai/menu-test-1-bento.jpg" alt="測試菜單1-便當" width="300">

<details>
<summary>Opus 辨識結果（24.5 秒）</summary>

```json
{
  "store_info": {
    "name": "家香味排骨便當",
    "slogan": "當天採購 新鮮現做 健康美味",
    "features": "歡迎工商團體包月訂購，主菜均可依公司需求洽談價格",
    "address": "新北市五股區新城八路17號",
    "phone": ["(02) 2291-0938", "0921684983", "0983295385"],
    "business_hours": {
      "monday_to_friday": "上午10點至晚上7點",
      "saturday": "上午10點至下午2點",
      "sunday": "公休"
    },
    "notes": [
      "便當合菜團購51個以上即可外送",
      "大量訂購請於10:30分前",
      "以上便當附湯或多多",
      "本店已投保餐飲責任險，敬請安心食用"
    ]
  },
  "categories": [
    {
      "name": "便當",
      "items": [
        {"name": "炸雞腿", "price": 125},
        {"name": "古早味排骨", "price": 110},
        {"name": "卡啦雞", "price": 105},
        {"name": "高粱酒香腸", "price": 105},
        {"name": "蔥爆豬", "price": 105},
        {"name": "紅糟肉", "price": 105},
        {"name": "鯖魚便當", "price": 105},
        {"name": "鱈魚飯", "price": 105},
        {"name": "鹹豬肉", "price": 105},
        {"name": "蔥油雞", "price": 105},
        {"name": "宮保雞丁", "price": 105},
        {"name": "紅燒炊肉", "price": 105}
      ]
    },
    {
      "name": "單點類",
      "items": [
        {"name": "炸雞腿", "price": 80},
        {"name": "卡啦雞", "price": 60},
        {"name": "鯖魚", "price": 60},
        {"name": "鱈魚", "price": 60},
        {"name": "古早味排骨", "price": 70},
        {"name": "高粱酒香腸", "price": 35, "unit": "1條", "bulk_price": 200, "bulk_unit": "1斤"},
        {"name": "紅糟肉", "price": 60, "unit": "1份"},
        {"name": "鹹豬肉", "price": 60, "unit": "1份"}
      ]
    }
  ],
  "warnings": [
    "部分單點類項目價格可能因圖片解析度略有誤差",
    "營業時間週日公休，週六僅營業至下午2點"
  ]
}
```
</details>

**測試圖片 2：牛排菜單**（1286×882 px, 1.3MB）

<img src="/assets/images/jaba-ai/menu-test-2-steak.png" alt="測試菜單2-牛排" width="400">

<details>
<summary>Opus 辨識結果（32.0 秒）</summary>

```json
{
  "store_info": {
    "name": "未顯示店名",
    "notes": "提供牛排、豬排、雞排、海鮮等排餐系列"
  },
  "categories": [
    {
      "category_name": "店長推薦",
      "items": [
        {"name": "松露厚切雪花牛7oz", "price": 350},
        {"name": "松露黃金雞腿排", "price": 350},
        {"name": "厚切起司豬排", "price": 350}
      ]
    },
    {
      "category_name": "大胃王",
      "items": [
        {"name": "海陸雙拼（沙朗牛5oz＋豬排、雞排、比目魚）", "price": 400, "note": "任選二種"},
        {"name": "厚切雪花牛7oz雙拼（厚切雪花牛＋豬排、雞排、比目魚、魷魚、草蝦2支）", "price": 450, "note": "任選二種"},
        {"name": "海鮮雙拼（鮭魚、魷魚、比目魚、草蝦2支）", "price": 450, "note": "任選二種"},
        {"name": "安格斯沙朗10oz", "price": 420},
        {"name": "頂級沙朗16oz", "price": 699}
      ]
    },
    {
      "category_name": "排餐系列 Steak Series",
      "items": [
        {"name": "沙朗牛排5oz（數量有限）", "price": 280},
        {"name": "法式羊肩排 frenched lamb shoulder chop", "price": 350},
        {"name": "厚切雪花沙朗牛排7oz", "price": 320},
        {"name": "厚切豬排 thick cut pork", "price": 280},
        {"name": "黃金雞腿排 golden chrispy chicken", "price": 270},
        {"name": "菲力牛排9oz fillet steak 9oz", "price": 399},
        {"name": "帶骨牛小排8oz bone-in short ribs 8oz", "price": 399}
      ]
    },
    {
      "category_name": "主餐（右側）",
      "items": [
        {"name": "大比目魚排（鱈魚）halibut steak", "price": 300},
        {"name": "香煎鮭魚排 seared salmon steak", "price": 320},
        {"name": "深海魷魚排 deep-fried squid fillet", "price": 300}
      ]
    },
    {
      "category_name": "點心 Dessert",
      "items": [
        {"name": "脆炸薯條 crisp french fries", "price": 60},
        {"name": "洋蔥圈 onion rings", "price": 60},
        {"name": "草蝦3隻 shrimp 3pcs", "price": 160},
        {"name": "雞塊 chicken nugget", "price": 60},
        {"name": "檸檬雞翅2支 lemon chicken wings 2pcs", "price": 99}
      ]
    }
  ],
  "extras": {
    "sauces": {
      "description": "搭配醬料",
      "options": ["胡椒 pepper", "蘑菇 mushroom", "黑胡椒 mix", "不要醬 no sauce"]
    },
    "steak_doneness": {
      "description": "牛排熟度",
      "options": ["3分 medium rare", "5分 medium", "7分 medium well", "全熟 well done"]
    },
    "upgrade_options": {
      "description": "當月壽星免費加一份肉（沙朗/豬排/雞排/比目魚）",
      "meat_upgrades": [
        {"weight": "100~109公克", "price": 80},
        {"weight": "110~139公克", "price": 120},
        {"weight": "140公克以上", "price": 180}
      ]
    }
  },
  "warnings": [
    "部分品項標示「數量有限」，可能售完為止",
    "大胃王系列為雙拼組合，需任選二種配料",
    "牛排需選擇熟度",
    "當月壽星可免費加一份肉品"
  ]
}
```
</details>

**測試結果彙整**（共 5 輪測試，使用 Claude Opus 4.5 / Sonnet 4.5）：

**簡化版 prompt**：

| 圖片 | 大小 | 模型 | #1 | #2 | #3 | #4 | #5 | 平均 |
|------|------|------|-----|-----|-----|-----|-----|------|
| 便當菜單 | 387KB | Opus 4.5 | 22.3s | 24.5s | 24.7s | 25.1s | 23.6s | **24.0s** |
| 便當菜單 | 387KB | Sonnet 4.5 | 24.8s | 24.0s | 28.1s | 25.8s | 28.5s | **26.2s** |
| 牛排菜單 | 1.3MB | Opus 4.5 | 34.5s | 32.0s | 34.0s | 31.2s | 31.4s | **32.6s** |
| 牛排菜單 | 1.3MB | Sonnet 4.5 | 38.4s | 39.9s | 34.9s | 37.8s | 43.2s | **38.8s** |

**完整版 prompt**：

| 圖片 | 大小 | 模型 | #1 | #2 | #3 | #4 | #5 | 平均 |
|------|------|------|-----|-----|-----|-----|-----|------|
| 便當菜單 | 387KB | Opus 4.5 | 30.1s | 30.6s | 31.1s | 30.6s | 31.1s | **30.7s** |
| 便當菜單 | 387KB | Sonnet 4.5 | 34.4s | 32.6s | 34.6s | 33.4s | 34.4s | **33.9s** |
| 牛排菜單 | 1.3MB | Opus 4.5 | 39.8s | 44.0s | 40.5s | 42.4s | 43.0s | **41.9s** |
| 牛排菜單 | 1.3MB | Sonnet 4.5 | 46.2s | 46.2s | 41.8s | 46.6s | 47.1s | **45.6s** |

**簡化版 vs 完整版對比**：

| 圖片 | 模型 | 簡化版 | 完整版 | 差異 |
|------|------|--------|--------|------|
| 便當菜單 | Opus 4.5 | 24.0s | 30.7s | +6.7s |
| 便當菜單 | Sonnet 4.5 | 26.2s | 33.9s | +7.7s |
| 牛排菜單 | Opus 4.5 | 32.6s | 41.9s | +9.3s |
| 牛排菜單 | Sonnet 4.5 | 38.8s | 45.6s | +6.8s |

**結論**：
- 完整版 prompt 比簡化版慢約 **6-10 秒**（prompt 越長，處理時間越長）
- 小圖（< 500KB）：簡化版約 24-26 秒，完整版約 31-34 秒
- 中圖（1-2MB）：簡化版約 33-39 秒，完整版約 42-46 秒
- Opus 4.5 比 Sonnet 4.5 略快（約快 2-6 秒）
- 超時設定：300 秒

### 3. 成本考量

本專案使用 Claude Code 訂閱制，未詳細計算 token 成本。

如果你使用 API 計費，視覺功能的 token 消耗較高，建議參考 [Anthropic 官方定價頁面](https://docs.anthropic.com/en/docs/about-claude/models#model-comparison-table) 評估成本。壓縮圖片至 1568px 以內可避免伺服器端 resize。

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
