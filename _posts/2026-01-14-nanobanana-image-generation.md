---
layout: post
title: "Nanobanana：讓 Claude Code 生成圖片的 MCP Server"
subtitle: "一鍵安裝，用自然語言生成、編輯、修復圖片"
date: 2026-01-14
categories: [Claude Code]
tags: [Claude Code, MCP, Nanobanana, AI, 圖片生成, Gemini]
---

## 前言

在使用 Claude Code 開發時，有時候會需要產生一些圖片素材——流程圖、App Icon、示意圖等。過去可能要開 Figma、找線上工具，或是用其他 AI 繪圖服務。

**Nanobanana** 是一個 MCP Server，讓你可以直接在 Claude Code 中用自然語言生成圖片。背後使用 Google Gemini API，支援圖片生成、編輯、修復等多種功能。

本篇會介紹如何安裝和使用 Nanobanana，特別針對新手提供詳細的步驟說明。

---

## 功能特色

| 功能 | 說明 |
|------|------|
| **圖片生成** | 根據文字描述生成圖片，支援多種風格和解析度 |
| **圖片編輯** | 對現有圖片進行修改（加入元素、改變風格等） |
| **圖片修復** | 增強或修復圖片品質 |
| **Icon 生成** | 生成 App Icon、Favicon，自動輸出多種尺寸 |
| **Pattern 生成** | 建立無縫圖案和紋理 |
| **故事序列** | 生成一系列相關的圖片（分鏡、步驟圖） |
| **流程圖** | 繪製技術流程圖和架構圖 |

---

## 安裝前準備

### 1. 安裝 Claude Code CLI

如果還沒安裝 Claude Code CLI，先執行：

```bash
npm install -g @anthropic-ai/claude-code
```

安裝完成後，確認可以正常執行：

```bash
claude --version
```

### 2. 取得 Google Gemini API Key

Nanobanana 使用 Google Gemini API 來生成圖片，需要先取得 API Key：

1. 前往 [Google AI Studio](https://aistudio.google.com/)
2. 登入你的 Google 帳號
3. 點擊 **Create API Key**
4. **重要**：設定 Google Cloud 帳單（圖片生成功能不在免費額度內）
5. 複製產生的 API Key

### 費用說明

圖片生成每張約 **$0.02 - $0.04 美元**，實際費用依解析度和模型而定。建議先設定預算上限避免意外支出。

---

## 一鍵安裝（推薦）

### macOS / Linux

打開終端機，執行：

```bash
curl -fsSL https://raw.githubusercontent.com/yazelin/nanobanana/main/install.sh | bash
```

安裝腳本會自動：
- 加入 MCP Server 到 Claude Code
- 複製指令檔到 `~/.claude/commands/`
- 提示你設定 API Key

安裝完成後，設定環境變數：

```bash
# 加到 ~/.zshrc 或 ~/.bashrc
export NANOBANANA_GEMINI_API_KEY="你的API金鑰"
```

然後重新載入設定：

```bash
source ~/.zshrc  # 或 source ~/.bashrc
```

### Windows

打開 PowerShell，執行：

```powershell
irm https://raw.githubusercontent.com/yazelin/nanobanana/main/install.ps1 | iex
```

如果遇到執行原則錯誤，先執行：

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

設定環境變數（在 PowerShell 中）：

```powershell
# 永久設定
[Environment]::SetEnvironmentVariable("NANOBANANA_GEMINI_API_KEY", "你的API金鑰", "User")
```

---

## 手動安裝

如果一鍵安裝遇到問題，可以手動安裝：

### 步驟 1：設定環境變數

先設定環境變數（加到 `~/.bashrc` 或 `~/.zshrc`）：

```bash
export NANOBANANA_GEMINI_API_KEY="你的API金鑰"
export NANOBANANA_MODEL="gemini-3-pro-image-preview"
```

重新載入設定：

```bash
source ~/.zshrc  # 或 source ~/.bashrc
```

### 步驟 2：加入 MCP Server

```bash
claude mcp add nanobanana \
  -e NANOBANANA_GEMINI_API_KEY \
  -e NANOBANANA_MODEL \
  -- npx -y @willh/nano-banana-mcp
```

### 步驟 3：下載指令檔

```bash
# 建立目錄
mkdir -p ~/.claude/commands/nanobanana

# 下載所有指令檔
REPO_URL="https://raw.githubusercontent.com/yazelin/nanobanana/main/commands/nanobanana"
for cmd in nanobanana generate edit restore icon pattern story diagram; do
  curl -fsSL "$REPO_URL/$cmd.md" -o ~/.claude/commands/nanobanana/$cmd.md
done
```

這會下載 8 個指令檔到 `~/.claude/commands/nanobanana/` 目錄。

或者用 git clone（下載整個 repo）：

```bash
git clone https://github.com/yazelin/nanobanana.git
cp -r nanobanana/commands/nanobanana ~/.claude/commands/
rm -rf nanobanana  # 清理
```

### 步驟 4：重啟 Claude Code

關閉目前的 Claude Code 終端機，重新開啟即可。

---

## 使用方式

安裝完成後，可以在 Claude Code 中使用以下指令：

### 自然語言介面

最簡單的方式是使用 `/nanobanana:nanobanana`，它會自動判斷你要做什麼：

```
/nanobanana:nanobanana 幫我畫一隻可愛的貓咪
```

### 指定功能

也可以直接使用特定功能：

| 指令 | 用途 | 範例 |
|------|------|------|
| `/nanobanana:generate` | 生成圖片 | `/nanobanana:generate 山景日落 --styles=watercolor` |
| `/nanobanana:edit` | 編輯圖片 | `/nanobanana:edit photo.jpg "在天空加上彩虹"` |
| `/nanobanana:restore` | 修復圖片 | `/nanobanana:restore old-photo.jpg` |
| `/nanobanana:icon` | 生成 Icon | `/nanobanana:icon 一個簡約的聊天 App 圖示` |
| `/nanobanana:pattern` | 生成圖案 | `/nanobanana:pattern 幾何圖形背景` |
| `/nanobanana:story` | 生成故事序列 | `/nanobanana:story 咖啡製作過程 --count=4` |
| `/nanobanana:diagram` | 繪製流程圖 | `/nanobanana:diagram 使用者登入流程` |

---

## 使用範例

### 範例 1：生成專案 Logo

```
/nanobanana:generate 一個現代簡約風格的科技公司 Logo，使用藍色和白色
```

### 範例 2：批量生成不同風格

```
/nanobanana:generate 森林小屋 --count=4 --variations=lighting,season
```

這會產生 4 張不同光線和季節的森林小屋圖片。

### 範例 3：編輯現有圖片

```
/nanobanana:edit ./screenshot.png "把背景改成深色主題"
```

### 範例 4：產生 App Icon

```
/nanobanana:icon 一個記事本 App 的圖示，扁平化設計，使用黃色系
```

這會自動產生不同尺寸的 Icon（16x16、32x32、128x128 等）。

### 範例 5：繪製系統架構圖

```
/nanobanana:diagram 微服務架構，包含 API Gateway、用戶服務、訂單服務、資料庫
```

---

## 進階設定

### 環境變數

| 變數 | 說明 | 預設值 |
|------|------|--------|
| `NANOBANANA_GEMINI_API_KEY` | Gemini API 金鑰 | （必填） |
| `NANOBANANA_MODEL` | 使用的模型 | `gemini-3-pro-image-preview` |
| `NANOBANANA_DEBUG` | 啟用除錯輸出 | `false` |

### 可用模型

- **gemini-3-pro-image-preview**（預設）：品質較好，適合正式用途
- **gemini-2.5-flash-image**：速度較快，適合快速測試

切換模型：

```bash
export NANOBANANA_MODEL="gemini-2.5-flash-image"
```

---

## 常見問題

### Q1: 安裝後指令沒有出現？

重啟 Claude Code，或檢查指令檔是否正確放在 `~/.claude/commands/` 目錄下。

### Q2: 出現 API Key 錯誤？

確認環境變數已正確設定：

```bash
echo $NANOBANANA_GEMINI_API_KEY
```

如果是空的，重新設定並重啟終端機。

### Q3: 圖片生成失敗？

1. 確認已設定 Google Cloud 帳單（免費額度不包含圖片生成）
2. 檢查 API Key 是否有效
3. 嘗試使用較簡單的 prompt

### Q4: 如何查看已安裝的 MCP Server？

```bash
claude mcp list
```

### Q5: 如何移除 Nanobanana？

macOS/Linux：

```bash
curl -fsSL https://raw.githubusercontent.com/yazelin/nanobanana/main/install.sh | bash -s -- --uninstall
```

Windows（先下載再執行）：

```powershell
Invoke-WebRequest -Uri https://raw.githubusercontent.com/yazelin/nanobanana/main/install.ps1 -OutFile install.ps1
.\install.ps1 -Uninstall
Remove-Item install.ps1
```

或手動移除：

```bash
claude mcp remove nanobanana
rm -rf ~/.claude/commands/nanobanana
```

---

## 小結

Nanobanana 讓 Claude Code 具備圖片生成能力：

- **一鍵安裝**：執行一行指令就能完成設定
- **自然語言**：用中文描述就能生成圖片
- **多種功能**：生成、編輯、修復、Icon、流程圖一應俱全
- **整合順暢**：不需離開終端機，開發流程不中斷

對於需要快速產生圖片素材的開發者來說，是個非常方便的工具。

---

## 參考資源

- [Nanobanana GitHub](https://github.com/yazelin/nanobanana)
- [Google AI Studio](https://aistudio.google.com/)
- [MCP 協議入門]({% post_url 2026-01-04-mcp-introduction %})
- [Claude Code 官方文件](https://docs.anthropic.com/en/docs/claude-code)
