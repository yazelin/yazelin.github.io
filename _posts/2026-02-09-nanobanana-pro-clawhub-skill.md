---
layout: post
title: "我的第一個 ClawHub Skill：nanobanana-pro-fallback"
subtitle: "把現有的 Python MCP Server 改成 Agent Skill 格式上架"
date: 2026-02-09
categories: [AI]
tags: [ClawHub, Agent Skills, Gemini, 圖片生成, Python, OpenClaw]
---

![配圖](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-02-09-nanobanana-skill.png)


## 前言

我之前已經寫了 [nanobanana-py](https://github.com/yazelin/nanobanana-py) — 一個用 Python + FastMCP 做的 Gemini 圖片生成 MCP Server，功能包含 auto model fallback（自動切換模型）。

今天的任務很單純：**把它從 MCP Server 格式改成 Agent Skill 格式**，然後上架到 [ClawHub](https://clawhub.com)。

聽起來應該很快？結果踩了不少坑。

---

## 背景：原版 vs 我的版本

OpenClaw 內建了一個 `nano-banana-pro` skill（作者是 OpenClaw 官方），用的是固定模型 `gemini-3-pro-image-preview`。

我的 `nanobanana-py` 本來就有 fallback 機制：

- 優先用 `gemini-2.5-flash-image`
- 失敗就 fallback 到 `gemini-2.0-flash-exp-image-generation`
- 可透過 `NANOBANANA_FALLBACK_MODELS` 環境變數自訂模型鏈

所以差異就是：**原版固定一個模型，我的會自動切換**。

今天要做的就是把這個 fallback 邏輯包成 Skill 格式發布。

---

## 改造過程

### 從 MCP Server 到 Skill

原本 `nanobanana-py` 是完整的 MCP Server — 有 `FastMCP` 框架、7 個 tool、types 定義、一堆模組。但 Agent Skill 不需要這些，它只需要：

1. 一個 `SKILL.md`（frontmatter 定義 metadata）
2. `scripts/` 目錄放可執行腳本

所以我參考 OpenClaw 內建的 `nano-banana-pro` skill，把核心邏輯濃縮成單一 `generate_image.py`，加上 fallback 迴圈。

### 踩坑：Agent 不看 SKILL.md

在 Copilot 環境測試時，agent 明明該用 `uv run` 來跑腳本（SKILL.md 裡寫得清清楚楚），結果它直接用 `python3` 跑，然後因為沒裝 `google-genai` 套件就炸了。

**原因**：Agent 在 system prompt 裡只看到 skill 的 `description` 欄位，不會主動去讀完整的 `SKILL.md`。

**解法**：把使用方式直接塞進 description：

```yaml
description: "Generate/edit images with Gemini Image API and auto model fallback. 
  Run via: uv run {baseDir}/scripts/generate_image.py --prompt 'desc' --filename 'out.png'
  MUST use uv run, not python3."
```

這樣 agent 在 system prompt 階段就知道怎麼用了。

### 踩坑：image_size 參數不相容

`gemini-2.5-flash-image` 不支援 `image_size` 參數（只有 `gemini-3` 系列才支援），直接傳會 400 INVALID_ARGUMENT。

原版因為固定用 `gemini-3-pro-image-preview` 所以沒這問題。我的 fallback 鏈裡有非 gemini-3 的模型，必須處理。

**解法**：根據模型名稱判斷：

```python
is_gemini3 = "gemini-3" in model_name
if is_gemini3:
    image_config = types.ImageConfig(image_size=output_resolution)
else:
    image_config = types.ImageConfig()
```

### Slug 被佔了

`clawhub publish` 的時候發現 `nanobanana-pro` 這個 slug 已經被原版佔了。改名為 `nanobanana-pro-fallback`，反而更能表達特色。

---

## 成果

- **GitHub**: [github.com/yazelin/nanobanana-pro](https://github.com/yazelin/nanobanana-pro)
- **ClawHub**: `clawhub install nanobanana-pro-fallback`
- **版本**: v0.4.3

跟原版的差異：

| | nano-banana-pro（原版） | nanobanana-pro-fallback（我的） |
|---|---|---|
| 模型 | 固定 `gemini-3-pro-image-preview` | 自動 fallback 多模型 |
| 解析度偵測 | 手動指定 | 自動從輸入圖片偵測 |
| 來源 | OpenClaw 內建 | 從 nanobanana-py 改造 |

---

## 小結

把現有的 Python 專案改成 Agent Skill 格式，技術上不難 — 核心就是寫一個 `SKILL.md` 和一個自包含的腳本。

真正花時間的是 agent 行為的除錯：它不看你的文件、它用錯的方式跑你的腳本、它傳了不支援的參數。這些都不是 code 層面的 bug，是「AI 怎麼理解你的 skill」的問題。

最重要的教訓：**description 比 SKILL.md 重要**。Agent 能看到的只有 description，把關鍵資訊放那裡。
