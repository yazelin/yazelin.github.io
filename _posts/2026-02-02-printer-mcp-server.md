---
layout: post
title: "printer-mcp — 讓 AI 幫你列印的 MCP Server"
subtitle: "從零開始開發一個 MCP Server 並發布到 PyPI"
date: 2026-02-02
categories: [Claude Code]
tags: [Claude Code, MCP, Python, 列印, PyPI]
---

## 前言

用 AI 寫程式、查資料已經很普遍了，但你有想過讓 AI 幫你列印文件嗎？

這個專案的起點很簡單：在用 Claude Code 的過程中，偶爾需要把某份文件或圖片印出來，每次都要自己開檔案、按列印，有點麻煩。於是就想——能不能直接告訴 AI「幫我印這份 PDF」，然後它就印了？

**printer-mcp** 就是這樣誕生的。它是一個透過 MCP 協議，讓 AI 助手直接控制印表機的小工具。整個專案只有一個 `server.py`，不到 200 行程式碼。

這篇文章會記錄完整的開發流程，讓你了解如何從零開始開發自己的 MCP Server，並發布到 PyPI。

---

## MCP Server 的最小結構

開發 MCP Server 最簡單的方式是使用 `FastMCP`。只需要三步：建立實例、定義工具函式、啟動伺服器。

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("printer")

@mcp.tool()
def list_printers() -> str:
    """列出系統中所有可用的印表機"""
    result = subprocess.run(["lpstat", "-p", "-d"], capture_output=True, text=True)
    if result.returncode != 0:
        return f"錯誤: {result.stderr.strip() or '無法取得印表機列表'}"
    return result.stdout.strip() or "未偵測到任何印表機"

def main():
    mcp.run()
```

用 `@mcp.tool()` 裝飾器標記的函式，就是 AI 可以呼叫的「工具」。函式的 docstring 會成為工具的描述，讓 AI 知道什麼情況下該使用它。參數的 type hint 會自動轉換為工具的 input schema。

就這樣，一個最小的 MCP Server 就完成了。

---

## 用 CUPS 實作列印功能

Linux 和 macOS 都內建 **CUPS**（Common UNIX Printing System），提供了 `lp`、`lpstat`、`cancel` 等命令列工具。printer-mcp 就是透過 `subprocess` 呼叫這些指令來控制印表機。

核心是 `_build_lp_cmd` 函式，負責組合 `lp` 指令的參數：

```python
def _build_lp_cmd(
    file_path: str,
    printer: str = "",
    copies: int = 1,
    page_size: str = "A4",
    orientation: str = "portrait",
    color_mode: str = "gray",
) -> list[str]:
    """組合 lp 指令參數"""
    cmd = ["lp", "-n", str(copies)]
    if printer:
        cmd.extend(["-d", printer])
    cmd.extend(["-o", f"media={page_size}"])
    if orientation == "landscape":
        cmd.extend(["-o", "landscape"])
    cmd.extend(["-o", f"ColorModel={color_mode.capitalize()}"])
    cmd.append(file_path)
    return cmd
```

透過 `lp` 的 `-o` 選項，可以控制紙張大小、列印方向、色彩模式等參數。最後整個專案提供了五個工具：

| 工具 | 功能 |
|------|------|
| `list_printers` | 列出所有可用的印表機 |
| `print_test_page` | 列印測試頁面 |
| `print_file` | 列印指定檔案 |
| `printer_status` | 查詢印表機狀態與佇列 |
| `cancel_job` | 取消列印工作 |

---

## 圖片自動轉 PDF

CUPS 的 `lp` 指令對 PDF 和純文字的支援最穩定，但直接送圖片檔去列印常常會有問題（格式不支援、大小跑掉等）。所以 printer-mcp 在列印前會先偵測副檔名，如果是圖片就自動用 Pillow 轉成 PDF：

```python
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".webp"}

def _convert_image_to_pdf(file_path: str) -> str:
    """將圖檔轉換為暫存 PDF，回傳暫存檔路徑"""
    from PIL import Image

    img = Image.open(file_path)
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    tmp.close()
    img.save(tmp.name, "PDF")
    return tmp.name
```

在 `print_file` 工具中，會判斷檔案類型並在列印完成後清理暫存檔：

```python
ext = Path(file_path).suffix.lower()
if ext in IMAGE_EXTENSIONS:
    try:
        tmp_pdf = _convert_image_to_pdf(file_path)
        actual_path = tmp_pdf
    except Exception as e:
        return f"圖檔轉 PDF 失敗: {e}"

try:
    cmd = _build_lp_cmd(actual_path, printer, copies, page_size, orientation, color_mode)
    result = subprocess.run(cmd, capture_output=True, text=True)
    # ...
finally:
    if tmp_pdf:
        os.unlink(tmp_pdf)
```

這裡有個細節：RGBA 和 P（palette）模式的圖片需要先轉成 RGB，否則 Pillow 無法存成 PDF。

---

## color_mode：灰階與彩色列印

辦公室列印大部分情況用黑白就夠了，彩色列印成本高很多。所以 `color_mode` 預設值設為 `gray`（灰階），需要彩色時再指定 `color`：

```python
VALID_COLOR_MODES = {"gray", "color"}

# 在 _build_lp_cmd 中：
cmd.extend(["-o", f"ColorModel={color_mode.capitalize()}"])
```

這會產生 `lp -o ColorModel=Gray` 或 `lp -o ColorModel=Color` 的指令。參數驗證也統一放在 `_validate_options` 函式中處理，避免送出無效的列印指令。

---

## 發布到 PyPI

要讓使用者可以直接 `uvx printer-mcp` 啟動伺服器，需要把套件發布到 PyPI。

### pyproject.toml

```toml
[project]
name = "printer-mcp"
version = "0.2.1"
description = "MCP server for printer control via CUPS"
requires-python = ">=3.10"
dependencies = ["mcp[cli]", "Pillow"]

[project.scripts]
printer-mcp = "server:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

`[project.scripts]` 定義了 `printer-mcp` 這個命令會呼叫 `server.py` 裡的 `main()` 函式。這樣安裝後就能直接在命令列執行 `printer-mcp`。

### GitHub Actions 自動發布

在 GitHub 建立 Release 時自動發布到 PyPI：

```yaml
name: Publish to PyPI

on:
  release:
    types: [published]

permissions:
  id-token: write

jobs:
  publish:
    runs-on: ubuntu-latest
    environment: pypi
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - name: Build package
        run: pip install build && python -m build
      - name: Publish to PyPI
        uses: pypa/gh-action-pypi-publish@release/v1
```

使用 PyPI 的 **Trusted Publisher** 機制，透過 `id-token: write` 權限和 `environment: pypi` 設定，不需要手動管理 API token。只要在 PyPI 上設定好對應的 GitHub repository，push Release 就會自動發布。

---

## 安裝與使用

### 前置需求

系統需要有 CUPS 列印系統，且至少設定一台印表機：

```bash
# 確認 CUPS 是否已安裝
lpstat -v

# 確認是否有已設定的印表機
lpstat -a
```

### 安裝

```bash
uv pip install printer-mcp
# 或
pip install printer-mcp
```

### 設定 Claude Code

在 `~/.claude/mcp.json` 或專案的 `.mcp.json` 中加入：

```json
{
  "mcpServers": {
    "printer": {
      "command": "uvx",
      "args": ["printer-mcp"]
    }
  }
}
```

設定完成後，就可以直接用自然語言請 AI 列印：

```
「幫我把 report.pdf 印出來」
「用彩色印 3 份 invoice.pdf」
「印表機現在什麼狀態？」
「取消所有列印工作」
```

---

## 小結

printer-mcp 是一個很小的專案，但它展示了開發 MCP Server 的完整流程：

1. 用 `FastMCP` 建立伺服器，用 `@mcp.tool()` 定義工具
2. 透過 `subprocess` 呼叫系統指令（CUPS）實作功能
3. 處理邊界情況（圖片轉 PDF、參數驗證）
4. 用 `pyproject.toml` 打包，透過 GitHub Actions 發布到 PyPI

MCP Server 的開發門檻其實很低。如果你有什麼重複性的操作想讓 AI 幫你做，不妨試試自己寫一個。

---

## 參考資源

- [printer-mcp PyPI](https://pypi.org/project/printer-mcp/)
- [printer-mcp GitHub](https://github.com/yazelin/printer-mcp)
- [Model Context Protocol 官方文件](https://modelcontextprotocol.io/)
- [FastMCP 文件](https://gofastmcp.com/)
- [CUPS 官方文件](https://www.cups.org/)
- [PyPI Trusted Publishers](https://docs.pypi.org/trusted-publishers/)
