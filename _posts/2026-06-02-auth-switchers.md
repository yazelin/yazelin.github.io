---
layout: post
title: "在一台電腦上養多個 Claude / Codex 帳號:cl 與 cx 兩個切換器"
subtitle: "一行指令瞬間切換使用中的 Claude Code 或 Codex CLI 訂閱帳號,不用登出再登入。Windows / Linux / macOS 都支援。附我反查到的『為什麼只換 token 會退回 API 計費』。"
date: 2026-06-02
categories: [AI, 開發工具]
tags: [claude-auth-switcher, codex-auth-switcher, Claude Code, Codex CLI, ChatGPT, CLI, 帳號切換, Auth, 開發工具]
author: Yaze Lin
---

![在一台電腦上養多個 Claude / Codex 帳號:cl 與 cx 兩個切換器 封面](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-06-02-auth-switchers.png)

> **快速連結**
> - **Claude** 版:[GitHub](https://github.com/yazelin/claude-auth-switcher) · [說明站](https://yazelin.github.io/claude-auth-switcher/)(指令 `cl`)
> - **Codex** 版:[GitHub](https://github.com/yazelin/codex-auth-switcher) · [說明站](https://yazelin.github.io/codex-auth-switcher/)(指令 `cx`)
> - 兩個都支援 Windows / Linux / macOS,READMEs 有繁中 / English / 日本語。

---

## 痛點

如果你有不只一個 Claude Code 或 Codex(ChatGPT)訂閱帳號 —— 個人一個、公司一個,或多個 Max 帳號輪流用 —— 你大概很熟這個流程:登出、重新 `claude login` / `codex login`、走一遍瀏覽器授權、貼 token… 切一次帳號要好幾步,切回來再走一遍。

`cl`(Claude)和 `cx`(Codex)就是來解這個的:**一行指令瞬間切換目前使用中的帳號,完全不用登出再登入。**

```bash
cl            # 列出已存的 Claude 帳號,選一個切過去
cx            # 同樣,給 Codex CLI 用
```

切過去之後,`claude` / `codex` 直接就是那個帳號,額度、訂閱身分都是對的。

## 一個我反查很久才搞懂的雷

切帳號最直覺的做法是「換掉那個 token」就好。但**只換 token 會退回 API 計費** —— 也就是你以為在用訂閱額度,其實在按 API 量付錢。

原因是:身分**不是只在一個檔案**裡。以 Claude 為例,它同時看兩個地方 —— `credentials.json`(token)**和** `~/.claude.json`(訂閱身分等狀態)。只換前者、不換後者,工具就會判定你「沒有有效訂閱」而落回 API key 計費路徑。

`cl` / `cx` 是把**整組身分檔**一起換,所以切過去是真的用那個帳號的訂閱額度,不會偷偷變成 API 計費。這件事我是實際抓封包 + 翻設定檔反查出來的,順手把 usage / token-refresh 的 endpoint 也記了下來。

## 怎麼裝

**Windows PowerShell**(兩個都是一行):

```powershell
# Claude
irm https://raw.githubusercontent.com/yazelin/claude-auth-switcher/main/install-oneliner.ps1 | iex
# Codex
irm https://raw.githubusercontent.com/yazelin/codex-auth-switcher/main/install-oneliner.ps1 | iex
```

**Linux / macOS** 的安裝指令在各自的[說明站](https://yazelin.github.io/claude-auth-switcher/)。裝完第一次先把現有帳號存進去,之後 `cl` / `cx` 就能在帳號間瞬切。

## 為什麼是兩個分開的 repo

Claude Code 跟 Codex CLI 的身分檔結構不一樣(放的位置、要換哪幾個檔都不同),所以拆成兩個各自處理、各自一行安裝;但概念、用法、指令風格刻意做成對稱的 —— 你會用 `cl` 就會用 `cx`。

兩個我自己每天都在用(多帳號開發 + 跑 agent),Linux 跟 Windows 都驗證過可用。有 bug 開 issue。

> **想支持持續開發?** 請我喝杯咖啡 → [buymeacoffee.com/yazelin](https://buymeacoffee.com/yazelin)
