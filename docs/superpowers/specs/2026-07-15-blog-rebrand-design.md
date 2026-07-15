# yazelin.github.io 改版設計:從預設版型 blog 到個人品牌主站

> 2026-07-15 拍板。緣由:blog 用 Beautiful Jekyll 預設版型,內容強(205 篇、2011–2026)但呈現弱——沒有定位句、沒有視覺識別、首頁純時間序、credibility 素材散落。目標:為未來線上課(甲方思維 + AI 發包法體系)建立說服力,讓網站本身成為「這個人值得學」的證據。

## 定位(已拍板)

- **買家排序**:主打付費力最高的「中小企業主/傳產決策者 + 想提升產出的專業者」;工程師買家靠開源作品自然吸引,不當主目標。
- **三屏定位組合**:
  1. 定位句 = 甲方思維方法論(你能學到什麼)
  2. 作品牆 = 產出量證明(憑什麼信我)
  3. 傳產轉型故事 = About 敘事(我和你是同一種人)
- **站點分工**:yazelin.github.io = 個人品牌主站,負責信任與導流;課程銷售頁在課程 hub / 新個人 j303(原 j303 repo 改名歸公司,另案處理)。

## 技術路線(已拍板)

- 丟掉 `remote_theme: daattali/beautiful-jekyll`,自寫 Jekyll layouts。仍是 Jekyll + GitHub Pages,不換框架。
- 視覺:乾淨現代技術感——大量留白、強排版、克制的強調色、良好中文字型處理(font stack 與行距字距;不引入重量級 webfont,或只 subset 必要字重)。
- **硬性限制**:
  - 205 篇文章舊網址一律不能斷(SEO + 外部引用)。permalink 維持現行 pattern(`/:categories/:year/:month/:day/:title.html`),`_config.yml` 的 permalink 相關設定不動。
  - giscus 評論、tags 頁、文章搜尋、RSS feed、sitemap 全部保留。
  - 重圖資產走 jsDelivr(`cdn.jsdelivr.net/gh/...@main`)——GitHub Pages 路由實測僅 50–90KB/s,見 mori-sprite-studio PR #4/#5 先例。
  - 資產連結不加 cache-busting 參數。

## 頁面結構

### 1. 首頁 `/`(新 landing,取代文章列表)

- **第一屏**:甲方思維定位句(主標)+ 一句話自介(副標)+ 主 CTA(email 訂閱表單)。10 秒內回答「這人是誰、憑什麼教我、我能得到什麼」。
- **第二屏 作品牆**:6–8 個上線作品卡片(截圖 + 一句話 + 連結),候選:咏唱魔法、ChingTech OS、K-Rider、Roll Formosa、台語/客語辭典、mori-sprite-studio、魚苗計數、呷爸。挑選標準:上線可玩/可看、能支撐「一個人 + AI 能做出這些」的主張。
- **第三屏 轉型故事摘要**:工廠自動化 → AI 應用的敘事節選,導去 About。
- **第四屏 精選文章**:人工策展,front matter 加 `featured: true` 旗標,非時間序;區塊尾再放一次訂閱 CTA。
- **Footer**:GitHub / FB / BMC 三件套(公開專案 footer 標配)+ Email / YouTube。

### 2. `/blog` 文章列表

- 原首頁的時間序列表搬到這裡,分頁(jekyll-paginate)、搜尋照舊。導航列加 Blog 入口。

### 3. 文章內頁

- 新版型:更好的中文行距字距、(長文)目錄、文末訂閱 CTA + 相關文章(同 tag 撈)、giscus 保留。

### 4. About / Portfolio / Workshop

- 內容沿用、套新版型。About 重寫成轉型敘事——素材從 yaze-journal 的 resume-facts 整理,重寫稿需 yazelin 核可後才上。

## Email 漏斗(已拍板:收集自建、發送延後)

- Cloudflare Worker + D1 收名單:直接擴充現有 k-rider-api Worker,同 D1 同表,`source: "blog"` 區分入口;honeypot、per-IP 限流、`ON CONFLICT DO NOTHING`、admin token 查詢端點全部沿用既有實作。
- **不寄信**。等課程開賣、要發第一封電子報時,再把 D1 名單匯出到現成服務(Buttondown / MailerLite 免費層)。不自架 SMTP。
- Lead magnet(「甲方思維入門」checklist)另案製作,不擋改版上線;上線初期 CTA 文案先用純訂閱。
- **未來金流銜接**:課程開賣時,CTA / 課程卡片直接連到 ai-workshop-backend(SHOPLINE Payments,KYC 已過)產生的結帳頁。blog 只放連結,不碰金流。

## 不做(YAGNI)

- 寄信系統、電子報排程
- 會員系統、金流(屬課程 hub / 新 j303)
- 留言以外的互動功能
- 深色模式以外的主題切換(深色模式本身做不做,實作 plan 時依工程量再定,非必要項)

## 驗收標準

1. 首頁第一屏在冷快取下 3 秒內可讀(行動網路);Lighthouse performance 不低於現狀。
2. 隨機抽 10 篇舊文網址(含最舊 2011 與最新 2026)全部 200、giscus 正常。
3. tags、搜尋、RSS、sitemap 功能與現狀等價。
4. 首頁能在 10 秒內讓陌生訪客答出「這人是誰、教什麼、下一步做什麼」(以文案自查 + 找 1–2 人實測)。
5. 訂閱表單:正常 email 寫入 D1;honeypot 假成功;重複 email 回 already;限流生效。
6. 手機版(iPhone 13 viewport)四屏排版不破版。

## 風險與備註

- 文案(定位句、自介、轉型故事)是說服力核心,需 yazelin 逐句核可,不由 AI 定稿。
- 正體中文;全站文案禁用詞黑名單適用(如「接住」)。
- 人-AI 分工署名原則適用於 About 敘事。
