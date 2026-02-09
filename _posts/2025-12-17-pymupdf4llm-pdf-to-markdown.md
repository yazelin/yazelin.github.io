---
layout: post
title: "pymupdf4llm - 把 PDF 轉成 AI 看得懂的 Markdown"
subtitle: "專為 LLM 設計的 PDF 轉換工具，讓大型文件也能輕鬆處理"
tags: [Python, AI, LLM, PDF, Markdown, 工具推薦]
date: 2025-12-17
categories: [AI, 工具, Python]
---

## 為什麼需要 PDF 轉 Markdown？

在用 AI 處理文件時，常常會遇到這些問題：

**PDF 太大太長，AI 無法一次處理完**
一份完整的技術文件、論文、手冊動輒上百頁，直接丟給 AI 會超過 token 限制，或是回應品質很差。

**需要分段處理給 AI Agent**
想要建立 RAG 系統、文件分析工具，或是讓 AI Agent 逐步處理內容，就需要把 PDF 拆解成結構化的資料。

**PDF 格式不適合 AI 理解**
PDF 的排版、圖片、表格，AI 不一定能正確解讀。轉成 Markdown 後，結構清楚、語意明確，AI 處理起來效果更好。

我自己最近就遇到這個需求：把學士論文（PDF）轉成 Markdown，讓 AI 擷取內容後整理成 blog 文章。效果很好，所以想介紹這個工具。

---

## pymupdf4llm 是什麼？

[pymupdf4llm](https://github.com/pymupdf/pymupdf4llm) 是基於 PyMuPDF 的擴充套件，**專門為 LLM（大型語言模型）設計**。

**核心功能：**
- ✅ 將 PDF 轉換成 **GitHub 相容的 Markdown**
- ✅ 保留文件結構（標題、段落、列表、表格）
- ✅ 自動識別閱讀順序
- ✅ **支援分頁輸出**（重點！可以逐頁處理）
- ✅ 圖片處理（內嵌或存檔）
- ✅ 與 LlamaIndex、LangChain 整合

**為什麼選它？**
- 本地執行，不需要網路或外部 API
- 轉換速度快
- 輸出品質高，適合 AI 理解
- Python >=3.10

---

## 安裝與基本使用

### 安裝

**使用 uv（推薦）：**

```bash
# 建立虛擬環境
uv venv

# 啟動環境
source .venv/bin/activate  # Linux/Mac
# 或
.venv\Scripts\activate  # Windows

# 安裝 pymupdf4llm
uv pip install pymupdf4llm
```

**使用 pip：**

```bash
pip install pymupdf4llm
# 或
pip install pdf4llm  # 別名
```

> 💡 不熟悉 uv 的話可以看我的另一篇文章：[uv 基礎教學]({% post_url 2025-12-13-uv-basics %})

### 基本轉換

最簡單的用法，整份 PDF 轉成一個 Markdown 字串：

```python
import pymupdf4llm

# 轉換整份 PDF
md_text = pymupdf4llm.to_markdown("input.pdf")

# 存成檔案
with open("output.md", "w", encoding="utf-8") as f:
    f.write(md_text)
```

就這麼簡單！幾行程式碼就能把 PDF 轉成 Markdown。

---

## 分頁處理（核心功能）

**這是最重要的功能**：當 PDF 太大時，用 `page_chunks=True` 可以把每一頁拆成獨立的資料。

### 為什麼需要分頁？

想像一份 100 頁的論文：
- 直接轉成一整個字串 → AI 可能超過 token 限制
- 分頁後逐頁處理 → AI Agent 可以分段理解、擷取、分析

### 程式碼範例

```python
import pymupdf4llm

# 重點：page_chunks=True
data = pymupdf4llm.to_markdown("input.pdf", page_chunks=True)

# data 是一個 list，每個元素是一頁的資料
print(f"總共 {len(data)} 頁")

# 逐頁處理
for i, page in enumerate(data):
    print(f"\n===== 第 {i+1} 頁 =====")
    print(f"內容：{page['text'][:200]}...")  # 前 200 字
    print(f"Metadata：{page['metadata']}")

    # 可以在這裡把每一頁丟給 AI 處理
    # response = llm.process(page['text'])
```

### 每頁資料結構

```python
{
    'text': '這一頁的 Markdown 內容...',
    'metadata': {
        'page': 1,           # 頁碼
        'source': 'input.pdf'  # 來源檔案
    }
}
```

---

## 進階功能

### 1. 圖片處理

**嵌入圖片（base64）：**

```python
md_text = pymupdf4llm.to_markdown(
    "input.pdf",
    embed_images=True  # 圖片轉成 base64 嵌入
)
```

**圖片存成檔案：**

```python
md_text = pymupdf4llm.to_markdown(
    "input.pdf",
    write_images=True  # 圖片存成獨立檔案
)
```

---

### 2. 整合 LlamaIndex

pymupdf4llm 可以直接轉成 LlamaIndex 的 Document 格式，方便建立 RAG 系統：

```python
import pymupdf4llm

# 使用 LlamaMarkdownReader
llama_reader = pymupdf4llm.LlamaMarkdownReader()
llama_docs = llama_reader.load_data("input.pdf")

# llama_docs 可以直接用於 LlamaIndex
```

---

### 3. 整合 LangChain

轉成 Markdown 後，可以用 LangChain 的 `MarkdownTextSplitter` 分段：

```python
import pymupdf4llm
from langchain.text_splitter import MarkdownTextSplitter

# 先轉成 Markdown
md_text = pymupdf4llm.to_markdown("input.pdf")

# 用 LangChain 分段
splitter = MarkdownTextSplitter(chunk_size=1000, chunk_overlap=100)
chunks = splitter.split_text(md_text)

# 現在可以把 chunks 餵給 AI
for i, chunk in enumerate(chunks):
    print(f"\n===== Chunk {i+1} =====")
    print(chunk[:200])
```

---

## 實際應用：學士論文轉換

我最近把自己的學士論文（PDF）用 pymupdf4llm 轉成 Markdown，效果很好。

**使用情境：**
- 論文原始 PDF 有 **255 頁**，包含大量表格、圖片、程式碼
- 想要讓 AI 擷取內容，整理成 blog 文章
- PDF 太大太長，直接丟給 AI 效果不好

**使用方式：**

```python
import pymupdf4llm

# 轉換整份論文
md_text = pymupdf4llm.to_markdown("thesis.pdf")

# 存成 Markdown 檔案
with open("thesis.md", "w", encoding="utf-8") as f:
    f.write(md_text)

# 接著把 thesis.md 丟給 AI，請它整理成 blog 格式
```

**轉換結果：**
- 原始 PDF：**255 頁**（9.8 MB）→ [下載原始 PDF](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/airship-thesis.pdf)
- 轉換後 Markdown：**12,458 行**（實際內容約 5,370 行，其餘為排版空白行）→ **[查看轉換結果](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/airship-thesis.md)**
- 檔案大小：**286 KB**（9.8 MB → 286 KB，約 3% 大小）
- **註：這次轉換沒有包含圖片**（只轉文字和表格），如果需要圖片可用 `embed_images=True` 參數

**轉換效果：**
- ✅ 表格完整保留（轉成 Markdown 表格）
- ✅ 標題層級正確（`##`、`###`）
- ✅ 列表格式清楚
- ✅ 程式碼區塊保留
- ✅ 章節結構清晰
- ⚠️ 封面部分有些遺漏（例如作者名單不完整）
- ⚠️ 部分格式需要手動調整（例如有多餘的反引號 `` ` ``）

**轉換後的範例片段：**

```markdown
# `實踐大學` `資訊科技與通訊學系`

### `劉文茜 葉曉霈 鄧靜容` `指導教授：` `吳啟偉老師` 民國 100 年

### `專題摘要`

本專題以 Microchip 公司所生產的 PIC24FJ128GB106 板子為主體，
搭配自行製作的子板銜接 GPS、GPRS 以及 Compass 等週邊模組，
達成無人飛行船自動飛行的目標...
```

可以看到：
- 整體結構保留得很好
- 有些排版符號（反引號）需要清理
- 封面的作者名單只轉出部分（實際有 6 位作者，但只顯示 3 位）

**儘管有些小瑕疵，但對於 AI 處理來說已經足夠好了。**
AI 拿到 Markdown 後，很快就整理出一篇結構完整的技術文章。

你可以看看最終成果：[無人飛行船自動導航系統]({% post_url 2011-06-01-airship-auto-navigation-thesis %})

---

## 完整範例：批次處理多個 PDF

如果你有一堆 PDF 要處理，可以這樣寫：

```python
import pymupdf4llm
from pathlib import Path

# 要處理的 PDF 檔案
pdf_files = Path("./pdfs").glob("*.pdf")

for pdf_path in pdf_files:
    print(f"正在處理：{pdf_path.name}")

    # 分頁輸出
    pages = pymupdf4llm.to_markdown(str(pdf_path), page_chunks=True)

    # 建立輸出資料夾
    output_dir = Path("./output") / pdf_path.stem
    output_dir.mkdir(parents=True, exist_ok=True)

    # 每一頁存成獨立檔案
    for i, page in enumerate(pages):
        output_file = output_dir / f"page_{i+1:03d}.md"
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(page['text'])

    print(f"完成！共 {len(pages)} 頁")
```

---

## 限制與注意事項

**已知限制（實際遇到的問題）：**
- ⚠️ **封面或特殊排版可能會遺漏內容**
  - 例如：我的論文封面有 6 位作者，但轉換後只顯示 3 位
  - 原因可能是排版分散在不同位置，或是文字在圖層中
- ⚠️ 列表和連結的轉換可能不完美
- ⚠️ 複雜的排版可能需要手動調整
  - 例如：轉換後可能有多餘的反引號 `` ` ``
- ⚠️ 掃描檔（圖片 PDF）需要先 OCR

**適合的情況：**
- ✅ 電子文件（非掃描檔）
- ✅ 結構清楚的文件（論文、技術文件、手冊）
- ✅ 需要餵給 AI 處理的內容

**不適合的情況：**
- ❌ 掃描檔（需要先用 OCR）
- ❌ 複雜排版（雜誌、海報）
- ❌ 需要 100% 精確還原排版

---

## 總結

pymupdf4llm 是一個專為 AI 設計的 PDF 轉 Markdown 工具，特別適合：

1. **處理大型 PDF 文件**
   用 `page_chunks=True` 分頁處理，避免 token 限制

2. **建立 RAG 系統**
   與 LlamaIndex、LangChain 整合

3. **文件分析**
   把 PDF 轉成結構化資料，方便 AI 理解

4. **本地執行**
   不需要網路，速度快

我自己用來處理學士論文的經驗很好，推薦給需要處理 PDF 的朋友。

---

## 參考資料

- [pymupdf4llm · PyPI](https://pypi.org/project/pymupdf4llm/)
- [PyMuPDF4LLM - PyMuPDF documentation](https://pymupdf.readthedocs.io/en/latest/pymupdf4llm/)
- [GitHub - pymupdf/pymupdf4llm](https://github.com/pymupdf/pymupdf4llm)
- [How to Convert PDFs to Markdown Using PyMuPDF4LLM - DEV Community](https://dev.to/m_sea_bass/how-to-convert-pdfs-to-markdown-using-pymupdf4llm-and-its-evaluation-kg6)

Happy Coding! 🚀
