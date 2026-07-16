---
layout: post
title: "Simple Icons：3000+ 品牌 SVG 圖示庫，跟 Lobehub Icons 互補"
subtitle: "AI 品牌找 Lobehub,OS / 一般軟體 / 平台 logo 找 Simple Icons — 一頁網站、CDN URL 直拉、MIT 授權"
date: 2026-05-21
categories: [AI]
tags: [SVG, Icons, Simple Icons, Lobehub Icons, Web Design, Brand Assets, MIT License, Frontend, GitHub Pages, Open Source]
---

> **🔗 快速連結**
> - 🌐 **官網瀏覽**：[simpleicons.org](https://simpleicons.org/)
> - 💻 **GitHub repo**：[simple-icons/simple-icons](https://github.com/simple-icons/simple-icons)
> - 📔 **前情提要**：[AgentPulse 為什麼換成 Lobehub Icons]({% post_url 2026-04-16-agentpulse %})

---

## 為什麼會踩到這個

上次寫 [AgentPulse 那篇]({% post_url 2026-04-16-agentpulse %}) 時，我從「Claude 畫的 provider logo 很醜」換成 [@lobehub/icons](https://lobehub.com/icons)，那次解決得很乾淨。

但 Lobehub Icons **只收 AI 品牌**:OpenAI / Claude / Gemini / DeepSeek / 各家 cloud 有 AI 業務的牌子都收，**但 Linux / Tux / 一般軟體 / 開發工具的 logo 沒有**。

這次做 [mori-ear](https://github.com/yazelin/mori-ear)(Mori 宇宙的「耳朵」器官)的 GitHub Pages landing site 時就撞到：三張安裝路徑卡片要 OS logo,Windows 可以拿 Lobehub 的 `microsoft.svg`、「從原始碼」可以拿 `github.svg`，但 **Linux 卡的 Tux 沒人有**。

讓 Claude 在 SVG 裡畫一個 Tux 出來?畫出一個莫名其妙的綠色笑臉 — 跟 Linux 一點關係也沒有。搜了一下發現：**Simple Icons**。

## 它是什麼

**Simple Icons** 是 MIT 授權、社群維護的開源圖示庫，專門收**已知品牌 / 軟體 / 服務的 SVG logo**:Linux、Apple、Adobe、Discord、Spotify、Vim、Visual Studio Code、Slack、Stack Overflow、Notion、Figma…

目前(2026-05)收了 **3000+ 個**。每個圖示有官方品牌色，但也可以透過 CDN URL 參數切成 monochrome。

簡單列幾個對照：

| 你想要的 logo | Lobehub Icons | Simple Icons |
|---|---|---|
| OpenAI / Claude / Gemini / DeepSeek | ✓ | ✓ |
| GitHub / Microsoft / AWS / Azure | ✓ | ✓ |
| **Linux Tux** | ✗ | ✓ |
| **Apple / macOS** | ✗ | ✓ |
| Vim / VS Code / JetBrains | ✗ | ✓ |
| Spotify / Discord / Slack / Telegram | ✗ | ✓ |
| Figma / Notion / Linear / Obsidian | ✗ | ✓ |
| Rust / Go / Python / Node.js | ✗ | ✓ |

所以兩個庫**互補**不是替代：**AI 品牌找 Lobehub**(有色版 + 文字 logo 變體 + 一致的視覺語言),**OS / 一般軟體 / 服務找 Simple Icons**。

## 怎麼用 — 三種路徑

### 1. 直接抓 CDN URL(最快，單檔)

```html
<img src="https://cdn.simpleicons.org/linux" width="32" alt="Linux">
```

要指定顏色?加 hex 在路徑後面：

```html
<img src="https://cdn.simpleicons.org/linux/A8C5A2" width="32" alt="Linux">
```

`/A8C5A2` 是我 mori-ear 的森林綠 accent 色，Simple Icons 就會把 SVG 的 fill 換成這個 hex 回給你。

### 2. GitHub raw 抓 SVG 檔(可以 inline 進 HTML / CSS 控色)

```sh
curl -O https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/linux.svg
```

把檔案裡的 `fill="#FCC624"` 改成 `fill="currentColor"`,inline 進 HTML，就能用 CSS 統一控色：

```html
<svg viewBox="0 0 24 24" fill="currentColor" style="color: var(--accent)">
  <title>Linux</title>
  <path d="M12.504 0c-.155 0..."/> <!-- 直接貼整段 path -->
</svg>
```

### 3. npm 安裝(寫前端用)

```sh
npm install simple-icons
```

```js
import { siLinux } from 'simple-icons';
console.log(siLinux.path);    // 'M12.504 0c-.155...'
console.log(siLinux.hex);     // 'FCC624'
console.log(siLinux.source);  // brand 官方來源 URL
```

## 跟 mori-ear 結合的實例

[mori-ear](https://github.com/yazelin/mori-ear) 的 GitHub Pages landing site 上，三張安裝路徑卡片 icon 來源：

- **Windows · 預編譯** → [@lobehub/icons](https://lobehub.com/icons) 的 `microsoft.svg`(4 方格 logo)
- **Linux · 預編譯** → **Simple Icons** 的 `linux.svg`(Tux)← 就是今天這個
- **從原始碼建置** → [@lobehub/icons](https://lobehub.com/icons) 的 `github.svg`(Octocat)

三個 SVG 都 inline 進 `index.html`,`fill="currentColor"` 統一吃 CSS 的 `--c-accent`(森林綠)，所以雖然來自兩個不同 icon 庫，**視覺上完全一致**(同色軸、同 `viewBox="0 0 24 24"`、同 size)。

線上看：[yazelin.github.io/mori-ear](https://yazelin.github.io/mori-ear)。

## 一個小坑：不要 truncate 整段 path

我這次第一次 `curl https://cdn.simpleicons.org/linux` 抓下來時，用 `head -c 300` 偷看了一下檔頭，結果**把那 300 bytes 切片當完整檔案 inline 進去**,render 出來的 Tux 只剩上半身，沒腳、沒嘴、沒眼睛(完整 path 是 ~5300 chars,300 bytes 大概只切到 40%)。

教訓：**抓 SVG 不要偷懶，完整檔讀過再貼**。CDN 那個 endpoint 給的是壓完的單行 SVG(沒換行、沒縮排)，很容易誤判成短檔案。

## 商標規範(順手提醒)

Simple Icons 本身是 MIT，但**圖示對應到的是各品牌的 trademark**，用之前要看一下使用條款 — 大部分情況「在自己的 docs / 部落格 / 個人專案標示這是 X 平台 / 軟體」是 fair use,**但做產品包裝、廣告、暗示官方背書就要授權**。

詳見 [Simple Icons 的 Legal Disclaimer](https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md)。

## 收進個人「找 logo」清單

整合一下，以後 logo 需求按優先級：

1. **AI 品牌(provider / model / cloud AI 服務)** → [@lobehub/icons](https://lobehub.com/icons)
2. **其他軟體 / OS / 平台 / 開發工具** → [Simple Icons](https://simpleicons.org/)
3. **泛用 UI icon(箭頭、齒輪、checkbox)** → Lucide / Heroicons / Tabler / Phosphor(不在這篇，改天再寫)
4. **完全沒有 / 自家品牌** → 自己畫 SVG / 找設計師 — 不要請 LLM 畫(會很醜，參考 AgentPulse 那篇的踩雷紀錄)

下次踩到 logo 找不到時來這篇翻就行。
