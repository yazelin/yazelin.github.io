---
layout: post
title: "ChingTech OS：Line Bot 文件讀取功能（Word/Excel/PDF）"
subtitle: "讓 AI 助手直接解析 Office 文件和 PDF，在對話中總結與分析文件內容"
date: 2026-01-15
categories: [ChingTech OS]
tags: [ChingTech OS, Line Bot, Python, 文件處理, PDF, Word, Excel]
---

## 前言

在前一篇 [Nanobanana：讓 Claude Code 生成圖片的 MCP Server]({% post_url 2026-01-14-nanobanana-image-generation %}) 中，我們介紹了 AI 圖片生成工具。這篇回到 ChingTech OS 的 Line Bot，來談一個實用的功能：**文件讀取**。

使用情境很直觀——同事在 Line 群組丟了一份 Excel 報價單，你想知道某個品項的價格；或是客戶傳了一份 PDF 規格書，你想快速了解重點內容。過去這些操作都要下載檔案、打開對應的 App 來看。現在，直接在 Line 裡把檔案傳給 AI 助手，就能請它幫你總結、查詢、分析。

這篇文章會涵蓋：

- 支援的文件格式與技術選型
- `document_reader.py` 的架構設計
- 各格式的解析實作
- PDF 轉圖片功能
- Line Bot 中的完整觸發流程
- AI 圖片生成整合
- 群組回覆與 @mention 機制

---

## 支援的文件格式

### 新版 Office 格式

| 格式 | 副檔名 | Python 套件 | 大小限制 |
|------|--------|------------|----------|
| Word | `.docx` | python-docx | 10 MB |
| Excel | `.xlsx` | openpyxl | 5 MB |
| PowerPoint | `.pptx` | python-pptx | 10 MB |
| PDF | `.pdf` | PyMuPDF (fitz) | 10 MB |

### 舊版格式的處理

對於 `.doc`、`.xls`、`.ppt` 等舊版 Office 格式，系統不直接支援解析，而是提示使用者轉存為新版格式：

```
不支援舊版格式 .doc，請轉存為新版格式 (.docx/.xlsx/.pptx)
```

這個決策有兩個原因：第一，舊版格式的解析通常需要系統級的外部依賴（如 LibreOffice），會增加 Docker 部署的複雜度；第二，現在大多數的 Office 軟體都支援轉存新版格式，多一個步驟但可以維持系統的簡潔。

### 純文字格式

除了 Office 和 PDF，系統也支援直接讀取純文字類型的檔案，這些不需要經過 `document_reader` 解析：

```python
READABLE_FILE_EXTENSIONS = {
    # 純文字格式
    ".txt", ".md", ".json", ".csv", ".log",
    ".xml", ".yaml", ".yml",
    # Office 文件（透過 document_reader 解析）
    ".docx", ".xlsx", ".pptx",
    # PDF 文件（透過 document_reader 解析）
    ".pdf",
}
```

---

## 套件選型

在設計文件讀取功能時，我們評估了兩種方向：

### All-in-One 方案

| 套件 | 優點 | 缺點 |
|------|------|------|
| pyxtxt | 支援多種格式、含舊版 Office | 社群較小 |
| textract | 成熟、格式多 | 需要系統依賴（antiword, pdftotext） |

### 專用套件組合（最終選擇）

| 套件 | 月下載量 | 用途 |
|------|----------|------|
| python-docx | 8M+ | Word .docx |
| openpyxl | 25M+ | Excel .xlsx |
| python-pptx | 4M+ | PowerPoint .pptx |
| PyMuPDF | 6M+ | PDF |

選擇專用套件組合的理由：

1. **穩定性** -- 每個套件專注處理一種格式，經過長期社群測試
2. **無系統依賴** -- 全部都是純 Python 實作，Docker 部署不需額外安裝系統套件
3. **彈性** -- 可以針對各格式調整輸出方式（例如 Excel 的表格格式化）
4. **維護性** -- 各套件獨立更新，問題隔離

```toml
# pyproject.toml
[project]
dependencies = [
    "python-docx>=1.1.0",
    "openpyxl>=3.1.0",
    "python-pptx>=0.6.0",
    "PyMuPDF>=1.24.0",
]
```

---

## 架構設計

### 核心元件

`document_reader.py` 是整個功能的核心，負責將各種格式的文件轉換為純文字。它被三個地方呼叫：

```
┌─────────────────────────────────────────────────────────┐
│              Document Reader Service                     │
│  services/document_reader.py                            │
├─────────────────────────────────────────────────────────┤
│  ┌────────────┐  ┌────────────┐  ┌────────────┐        │
│  │ DocxReader │  │ XlsxReader │  │ PptxReader │        │
│  │ python-docx│  │ openpyxl   │  │ python-pptx│        │
│  └────────────┘  └────────────┘  └────────────┘        │
│  ┌────────────┐                                        │
│  │ PdfReader  │                                        │
│  │ PyMuPDF    │                                        │
│  └────────────┘                                        │
│                                                         │
│  + extract_text(file_path) -> DocumentContent           │
│  + convert_pdf_to_images(file_path, ...) -> Result      │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼────────────────┐
        ▼                 ▼                ▼
 ┌──────────────┐  ┌────────────┐  ┌──────────────┐
 │  Line Bot AI │  │ MCP Server │  │ Knowledge API│
 │  (對話文件)   │  │ (NAS 文件)  │  │ (附件查詢)   │
 └──────────────┘  └────────────┘  └──────────────┘
```

### 資料結構

解析結果統一封裝在 `DocumentContent` dataclass 中：

```python
@dataclass
class DocumentContent:
    """文件解析結果"""
    text: str                      # 提取的純文字內容
    format: str                    # 原始格式 (docx, xlsx, pptx, pdf)
    page_count: Optional[int]      # 頁數（PDF）或工作表數（Excel）
    metadata: dict                 # 額外資訊（標題、作者等）
    truncated: bool                # 是否因大小限制而截斷
    error: Optional[str]           # 解析錯誤訊息（部分成功時）
```

其中 `truncated` 和 `error` 兩個欄位值得注意：

- `truncated`：文字內容超過 100,000 字元時會截斷，並在尾端加上 `[內容已截斷，原文共 N 字元]`
- `error`：有些情況下解析會「部分成功」（例如 PDF 只有圖片沒有文字層），此時會填入錯誤說明

---

## 各格式的解析實作

### 統一入口：extract_text()

```python
def extract_text(file_path: str) -> DocumentContent:
    path = Path(file_path)

    # 1. 檢查檔案存在
    if not path.exists():
        raise FileNotFoundError(f"檔案不存在: {file_path}")

    ext = path.suffix.lower()

    # 2. 檢查舊版格式
    if ext in LEGACY_EXTENSIONS:
        raise UnsupportedFormatError(
            f"不支援舊版格式 {ext}，請轉存為新版格式"
        )

    # 3. 檢查支援的格式
    if ext not in SUPPORTED_EXTENSIONS:
        raise UnsupportedFormatError(f"不支援的檔案格式: {ext}")

    # 4. 檢查檔案大小
    file_size = path.stat().st_size
    max_size = MAX_FILE_SIZE.get(ext, 10 * 1024 * 1024)
    if file_size > max_size:
        raise FileTooLargeError(...)

    # 5. 根據格式分派解析器
    extractors = {
        ".docx": _extract_docx,
        ".xlsx": _extract_xlsx,
        ".pptx": _extract_pptx,
        ".pdf": _extract_pdf,
    }
    return extractors[ext](file_path)
```

這個入口函式做了五個步驟的驗證，確保到達解析器時輸入一定是合法的。

### Word (.docx) 解析

```python
def _extract_docx(file_path: str) -> DocumentContent:
    doc = Document(file_path)
    paragraphs = []

    # 提取段落
    for para in doc.paragraphs:
        if para.text.strip():
            paragraphs.append(para.text)

    # 提取表格
    for table in doc.tables:
        for row in table.rows:
            row_text = " | ".join(cell.text.strip() for cell in row.cells)
            if row_text.strip():
                paragraphs.append(row_text)

    text = "\n".join(paragraphs)

    # 提取元資料
    metadata = {}
    core_props = doc.core_properties
    if core_props.title:
        metadata["title"] = core_props.title
    if core_props.author:
        metadata["author"] = core_props.author

    return DocumentContent(text=text, format="docx", ...)
```

兩個重點：

1. **表格也會被提取**：用 `|` 分隔儲存格，方便 AI 理解表格結構
2. **元資料**：會嘗試讀取文件標題和作者

### Excel (.xlsx) 解析

```python
def _extract_xlsx(file_path: str) -> DocumentContent:
    wb = load_workbook(file_path, data_only=True, read_only=True)
    result = []

    for sheet_name in wb.sheetnames:
        sheet = wb[sheet_name]
        result.append(f"=== 工作表: {sheet_name} ===")

        for row in sheet.iter_rows(values_only=True):
            if any(cell is not None for cell in row):
                row_text = " | ".join(
                    str(cell) if cell is not None else ""
                    for cell in row
                )
                result.append(row_text)

    wb.close()
    return DocumentContent(text="\n".join(result), format="xlsx", ...)
```

關鍵設計：

- `data_only=True`：讀取計算後的值，而非公式本身
- `read_only=True`：唯讀模式，降低記憶體使用
- **所有工作表都會輸出**：讓 AI 可以看到完整資料後自行判斷，或詢問使用者想了解哪些資訊

### PowerPoint (.pptx) 解析

```python
def _extract_pptx(file_path: str) -> DocumentContent:
    prs = Presentation(file_path)
    result = []

    for i, slide in enumerate(prs.slides, 1):
        result.append(f"=== 投影片 {i} ===")

        for shape in slide.shapes:
            if hasattr(shape, "text") and shape.text.strip():
                result.append(shape.text)

    return DocumentContent(text="\n".join(result), format="pptx", ...)
```

投影片以 `=== 投影片 N ===` 分隔，讓 AI 知道每張投影片的內容。

### PDF 解析

```python
def _extract_pdf(file_path: str) -> DocumentContent:
    with fitz.open(file_path) as doc:
        if doc.needs_pass:
            raise PasswordProtectedError("此文件有密碼保護，無法讀取")

        result = []
        has_text = False

        for page in doc:
            text = page.get_text()
            if text.strip():
                result.append(text)
                has_text = True

        # 純圖片 PDF 的特殊處理
        if not has_text:
            return DocumentContent(
                text="此 PDF 為掃描圖片，沒有可提取的文字。",
                format="pdf",
                metadata={"is_scanned": True},
                error="純圖片 PDF，無文字層"
            )

        return DocumentContent(text="\n".join(result), format="pdf", ...)
```

PDF 解析使用 PyMuPDF（`fitz`），有一個特別的處理：**純圖片 PDF**。有些 PDF 其實是掃描後產生的，沒有文字層。這種情況下系統會回傳提示訊息，建議使用者截圖後上傳讓 AI 的圖片辨識功能來讀取。

---

## 錯誤處理

系統定義了一組層次化的錯誤類別：

```python
class DocumentReadError(Exception):
    """文件讀取錯誤（基礎類別）"""

class PasswordProtectedError(DocumentReadError):
    """文件有密碼保護"""

class CorruptedFileError(DocumentReadError):
    """文件損壞"""

class UnsupportedFormatError(DocumentReadError):
    """不支援的格式"""

class FileTooLargeError(DocumentReadError):
    """檔案過大"""
```

每個解析器都會捕捉各自的底層套件異常，並轉換為統一的錯誤類別。例如 Word 解析：

```python
try:
    doc = Document(file_path)
except Exception as e:
    error_msg = str(e).lower()
    if "password" in error_msg or "encrypted" in error_msg:
        raise PasswordProtectedError("此文件有密碼保護，無法讀取")
    raise CorruptedFileError(f"無法解析 Word 文件: {e}")
```

這樣上層的呼叫端只需要處理 `DocumentReadError` 的子類別，不需要知道底層用的是哪個套件。

---

## PDF 轉圖片功能

除了提取文字之外，`document_reader.py` 還提供了 PDF 轉圖片的功能。這個需求來自實際使用場景：工程師經常用 CAD 軟體繪製工程圖後輸出成 PDF，但 Line 對 PDF 的預覽不好用，如果能直接轉成圖片就能在 Line 中直接查看。

### 轉換函式

```python
def convert_pdf_to_images(
    file_path: str,
    output_dir: str,
    pages: str = "all",
    dpi: int = 150,
    output_format: str = "png",
    max_pages: int = 20
) -> PdfConversionResult:
    with fitz.open(file_path) as doc:
        if doc.needs_pass:
            raise PasswordProtectedError("此 PDF 有密碼保護")

        total_pages = len(doc)
        page_indices = _parse_pages_param(pages, total_pages)

        # pages="0" 時只回傳頁數資訊，不實際轉換
        if not page_indices:
            return PdfConversionResult(
                success=True,
                total_pages=total_pages,
                converted_pages=0,
                images=[],
                message=f"此 PDF 共有 {total_pages} 頁"
            )

        # 執行轉換
        zoom = dpi / 72
        mat = fitz.Matrix(zoom, zoom)
        images = []

        for idx in page_indices:
            page = doc[idx]
            pix = page.get_pixmap(matrix=mat)
            img_path = output_path / f"page-{idx + 1}.{output_format}"
            pix.save(str(img_path))
            images.append(str(img_path))

        return PdfConversionResult(
            success=True,
            total_pages=total_pages,
            converted_pages=len(images),
            images=images,
            message=f"已將全部 {total_pages} 頁轉換為圖片"
        )
```

### 頁面選擇參數

`pages` 參數支援多種格式：

| 參數值 | 效果 |
|--------|------|
| `"0"` | 只查詢頁數，不轉換 |
| `"1"` | 轉換第 1 頁 |
| `"1-3"` | 轉換第 1 到第 3 頁 |
| `"1,3,5"` | 轉換第 1、3、5 頁 |
| `"all"` | 轉換全部（最多 20 頁） |

### 多頁 PDF 的互動流程

為了避免不必要的等待，AI 會先查詢頁數再決定是否直接轉換：

1. AI 收到轉換請求，先呼叫 `convert_pdf_to_images(pages="0")` 取得頁數
2. 若只有 1 頁：直接轉換並發送
3. 若有多頁：詢問使用者「這份 PDF 共有 X 頁，要轉換哪幾頁？」
4. 使用者回覆後，AI 根據回覆設定 `pages` 參數進行轉換

---

## Line Bot 中的文件讀取流程

### 使用者上傳檔案的完整流程

當使用者在 Line 傳送一份文件時，系統的處理流程如下：

```
使用者傳送 Word/Excel/PDF 檔案
         │
         ▼
Line Webhook 收到 file 訊息
         │
         ▼
download_and_save_file() 下載並存到 NAS
         │
         ▼
ensure_temp_file() 準備暫存檔
         │
   ┌─────┴──────┐
   │ 是文件格式？ │
   └─────┬──────┘
    是    │    否
   ┌─────┘    └──────── 直接複製為暫存
   ▼
document_reader.extract_text()
   │
   ▼
將純文字寫入 .txt 暫存檔
   │
   ▼
AI 透過 Read 工具讀取暫存檔
   │
   ▼
AI 回覆分析結果
```

### 暫存檔處理的關鍵邏輯

`ensure_temp_file()` 是文件讀取功能的核心整合點，位於 `file_handler.py`。它做的事情是：

1. **判斷檔案類型**：用 `is_document_file()` 判斷是否需要解析
2. **寫入臨時檔案**：將二進位內容寫到系統暫存目錄
3. **解析文件**：呼叫 `document_reader.extract_text()` 取得純文字
4. **輸出純文字**：將解析結果寫入 `.txt` 暫存檔

```python
# 解析文件
result = document_reader.extract_text(tmp_path)
text_content = result.text

# 寫入純文字暫存檔
with open(temp_path, "w", encoding="utf-8") as f:
    f.write(text_content)
```

### PDF 的特殊暫存處理

PDF 比較特殊，因為它同時需要文字版和原始檔（供轉圖片使用）。系統會保留兩份暫存檔，並用特殊格式回傳路徑：

```python
# 同時保留 PDF 原始檔和文字版
# 回傳格式："PDF:/tmp/bot-files/xxx.pdf|TXT:/tmp/bot-files/xxx.txt"
if is_pdf:
    with open(pdf_temp_path, "wb") as f:
        f.write(content)
    return f"PDF:{pdf_temp_path}|TXT:{temp_path}"
```

上層程式在處理時會用 `parse_pdf_temp_path()` 解析這個特殊格式，分別取得 PDF 路徑和文字路徑。

---

## AI 圖片生成整合

ChingTech OS 的 Line Bot 也整合了 AI 圖片生成功能。這個功能使用了 Nanobanana MCP Server（底層為 Google Gemini API）加上 Hugging Face FLUX 作為備用方案：

```python
# linebot_ai.py 中的工具設定
nanobanana_tools = [
    "mcp__nanobanana__generate_image",
    "mcp__nanobanana__edit_image",
]
```

### Fallback 機制

圖片生成整合了兩層 fallback：

1. **Nanobanana MCP**：內建 Gemini Pro 到 Flash 的自動 fallback
2. **Hugging Face FLUX**：當 Nanobanana 完全失敗時（timeout 或錯誤）觸發備用

```python
"""圖片生成 Fallback 機制

整合兩層圖片生成服務：
1. nanobanana MCP（內建 Gemini Pro -> Flash 自動 fallback）
2. Hugging Face FLUX（最後備用，30 秒超時）
"""
```

### 自動發送生成的圖片

AI 呼叫 `generate_image` 後，系統會自動處理圖片的發送。`post_process_ai_response()` 會檢查 AI 是否產生了圖片但沒有呼叫 `prepare_file_message`，如果是的話就自動補上：

```python
# nanobanana 輸出的路徑需要轉換為相對路徑
# /tmp/ching-tech-os-cli/nanobanana-output/xxx.jpg
#   -> nanobanana-output/xxx.jpg
if "nanobanana-output/" in file_path:
    relative_path = "nanobanana-output/" + file_path.split("nanobanana-output/")[-1]
```

---

## 群組回覆與 @mention 機制

### 群組中觸發 AI 的條件

在群組中，不是每則訊息都會觸發 AI。`should_trigger_ai()` 定義了觸發規則：

```python
def should_trigger_ai(
    message_content: str,
    is_group: bool,
    is_reply_to_bot: bool = False,
) -> bool:
    if not is_group:
        # 個人對話：所有訊息都觸發
        return True

    # 群組對話：回覆機器人訊息時觸發
    if is_reply_to_bot:
        return True

    # 群組對話：被 @mention 時觸發
    content_lower = message_content.lower()
    for name in settings.line_bot_trigger_names:
        if f"@{name.lower()}" in content_lower:
            return True

    return False
```

三種觸發方式：

1. **個人對話**：所有訊息都會觸發
2. **回覆機器人訊息**：在群組中回覆機器人之前的訊息
3. **@mention**：在群組中 `@機器人名稱` 來呼叫

### 群組回覆的 @mention

在群組中回覆時，為了讓發問者知道 AI 是在回應他，系統會用 Line Messaging API V2 的 mention 功能：

```python
def create_text_message_with_mention(
    text: str,
    mention_user_id: str | None = None,
) -> TextMessage | TextMessageV2:
    if mention_user_id:
        # 使用 TextMessageV2 + mention
        return TextMessageV2(
            text=MENTION_PLACEHOLDER + text,  # "{user} " + 回覆文字
            substitution={
                MENTION_KEY: MentionSubstitutionObject(
                    mentionee=UserMentionTarget(userId=mention_user_id)
                )
            },
        )
    else:
        return TextMessage(text=text)
```

`MENTION_PLACEHOLDER` 是 `{user} `，Line 會自動將它替換為 `@用戶名稱`，這樣在群組中回覆時，發問的人會收到通知。

---

## MCP 工具整合

文件讀取功能也透過 MCP 工具暴露給 AI，讓它可以讀取 NAS 上的文件：

### read_document 工具

AI 可以用 `read_document` 工具讀取 NAS 上的任何支援格式文件。這個工具支援 `nas://` 路徑格式：

| 路徑格式 | 轉換結果 |
|----------|----------|
| `nas://linebot/files/...` | `/mnt/nas/ctos/linebot/files/...` |
| `nas://projects/attachments/...` | `/mnt/nas/ctos/projects/attachments/...` |

### convert_pdf_to_images 工具

用於將 NAS 上的 PDF 轉換為圖片。轉換後的圖片儲存在：

```
/mnt/nas/ctos/linebot/files/pdf-converted/{date}/{uuid}/
├── page-1.png
├── page-2.png
└── ...
```

---

## 小結

文件讀取功能是 Line Bot 中相當實用的一個模組。透過 `document_reader.py` 這個統一的服務層，不管是在 Line 對話中上傳檔案、透過 MCP 工具讀取 NAS 文件、還是從知識庫附件中提取內容，都使用同一套解析邏輯。

設計上有幾個值得記錄的取捨：

- **專用套件 vs All-in-One**：選擇專用套件組合，犧牲一點設定的便利性，換取穩定性和無系統依賴
- **舊版格式不支援**：避免引入 LibreOffice 等重量級依賴，保持 Docker image 的精簡
- **統一解析入口**：不管來源是 Line 上傳、NAS 文件還是知識庫附件，都走同一套 `extract_text()` 邏輯
- **PDF 雙暫存**：同時保留原始檔和文字版，讓使用者可以選擇讀文字或轉圖片

Line Bot 整合了文件讀取、圖片生成、PDF 轉圖片等多個功能後，已經能夠處理日常工作中大部分的文件相關需求。從傳一份 Excel 請 AI 幫忙整理資料，到把 CAD 圖轉成圖片在群組中討論，這些過去需要多個步驟的操作現在都能在 Line 對話中直接完成。

---

## 參考資源

- [python-docx 官方文件](https://python-docx.readthedocs.io/)
- [openpyxl 官方文件](https://openpyxl.readthedocs.io/)
- [python-pptx 官方文件](https://python-pptx.readthedocs.io/)
- [PyMuPDF 官方文件](https://pymupdf.readthedocs.io/)
- [Line Messaging API V2 - Mention](https://developers.line.biz/en/docs/messaging-api/text-message-v2/)
