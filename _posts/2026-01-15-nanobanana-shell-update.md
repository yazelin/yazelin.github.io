---
layout: post
title: "Nanobanana Shell 版更新：Windows 支援與 Namespace 重構"
subtitle: "PowerShell 安裝腳本、指令命名空間、MCP 設定驗證"
date: 2026-01-15
categories: [Claude Code]
tags: [Claude Code, MCP, Nanobanana, Shell, Windows, PowerShell]
---

## 前言

[上一篇]({% post_url 2026-01-14-nanobanana-image-generation %})介紹了 Nanobanana 的基本功能和安裝方式。發布後收到一些回饋，主要集中在兩個方向：Windows 使用者需要原生的安裝體驗、指令名稱容易與其他工具衝突。

這篇記錄 Nanobanana 在這次更新中的幾個重要變更。

---

## Windows PowerShell 安裝腳本

新增了 `install.ps1`，讓 Windows 使用者也能一鍵安裝：

```powershell
irm https://raw.githubusercontent.com/yazelin/nanobanana/main/install.ps1 | iex
```

如果遇到執行原則限制，先執行：

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

PowerShell 腳本的功能與 Bash 版完全對等：

| 功能 | Bash (`install.sh`) | PowerShell (`install.ps1`) |
|------|---------------------|---------------------------|
| 前置需求檢查 | Node.js / npm / Claude CLI | 相同 |
| API Key 設定引導 | 互動式輸入 + 格式驗證 | 相同 |
| 模型選擇 | 選單式 | 相同 |
| MCP Server 設定 | `claude mcp add` | 相同 |
| Commands 下載 | `curl` | `Invoke-WebRequest` |
| 環境變數儲存 | 寫入 `~/.zshrc` 或 `~/.bashrc` | `[Environment]::SetEnvironmentVariable()` |
| 解除安裝 | `--uninstall` 參數 | `-Uninstall` 參數 |

解除安裝也有對應的方式：

```powershell
# 下載後執行
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/yazelin/nanobanana/main/install.ps1" -OutFile "install.ps1"
.\install.ps1 -Uninstall
Remove-Item install.ps1
```

---

## Namespace 重構：指令移到子目錄

原本所有指令檔直接放在 `~/.claude/commands/` 下，檔名就是指令名稱（如 `generate.md`、`edit.md`）。問題是這些名稱太通用，容易跟其他工具的指令衝突。

這次重構把指令檔搬到 `nanobanana` 子資料夾：

```
# 舊的結構
~/.claude/commands/
  nanobanana.md
  generate.md
  edit.md
  ...

# 新的結構
~/.claude/commands/
  nanobanana/
    nanobanana.md
    generate.md
    edit.md
    restore.md
    icon.md
    pattern.md
    story.md
    diagram.md
```

使用上的變化是指令前面多了 `nanobanana:` 前綴：

```
# 舊的呼叫方式
/generate 一隻可愛的貓咪

# 新的呼叫方式
/nanobanana:generate 一隻可愛的貓咪
```

Claude Code 的 Commands 機制會自動將子資料夾名稱作為 namespace，所以只要把檔案放對位置，前綴就會自動生效。這個做法的好處：

- 不會與其他工具的 `/generate`、`/edit` 衝突
- 輸入 `/nanobanana:` 後按 Tab 可以看到所有可用指令
- 結構更清楚，方便管理

---

## MCP Server 設定驗證

安裝腳本現在會在設定完 MCP Server 之後進行驗證：

**Bash 版**：

```bash
# 驗證 MCP 是否已加入
if ! claude mcp list 2>/dev/null | grep -q "nanobanana"; then
    error_msg "MCP Server 未成功加入"
    show_mcp_setup_failed_guide
fi
```

**PowerShell 版**：

```powershell
# 驗證 MCP 是否已加入
$mcpList = claude mcp list 2>&1
if ($mcpList -match "nanobanana") {
    Write-Success "MCP Server 已設定並驗證成功"
} else {
    Write-Warn "MCP Server 可能未成功加入"
}
```

如果驗證失敗，腳本會顯示手動設定的步驟，而不是讓使用者自行摸索。

另外，API Key 也加入了基本的格式驗證（Gemini API Key 通常以 `AIza` 開頭），避免貼錯內容：

```bash
if [[ ! "$NANOBANANA_GEMINI_API_KEY" =~ ^AIza ]]; then
    warn "API Key 格式可能不正確（通常以 'AIza' 開頭）"
fi
```

---

## 其他修正

- **修正 `curl | bash` 無法讀取用戶輸入的問題**：使用 `< /dev/tty` 讓 `read` 從終端機讀取輸入，而非從 pipe 的 stdin
- **修正 `echo` 缺少 `-e` 選項**：部分系統的 `echo` 預設不解析跳脫序列，導致顏色碼直接顯示為文字
- **Windows 環境變數名稱統一**：確保 `NANOBANANA_GEMINI_API_KEY` 和 `NANOBANANA_MODEL` 在兩個平台使用相同的名稱

---

## 小結

這次更新的重點：

- **Windows 原生支援**：PowerShell 安裝腳本，功能與 Bash 版完全對等
- **Namespace 隔離**：指令移到 `nanobanana/` 子目錄，避免名稱衝突
- **設定驗證**：安裝後自動驗證 MCP Server 和 API Key 格式
- **跨平台修正**：處理 `curl | bash`、`echo -e` 等平台差異

已經安裝過的使用者，建議先解除安裝再重新安裝，以套用新的目錄結構：

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/yazelin/nanobanana/main/install.sh | bash -s -- --uninstall
curl -fsSL https://raw.githubusercontent.com/yazelin/nanobanana/main/install.sh | bash
```

---

## 參考資源

- [Nanobanana 基礎介紹]({% post_url 2026-01-14-nanobanana-image-generation %})
- [Nanobanana GitHub](https://github.com/yazelin/nanobanana)
- [MCP 協議入門]({% post_url 2026-01-04-mcp-introduction %})
