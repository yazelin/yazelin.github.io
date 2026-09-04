# yazelin.github.io

林亞澤(Yaze)的個人品牌主站+部落格:https://yazelin.github.io

- 首頁是 landing(定位、作品牆、故事、精選文章、訂閱表單),文章列表在 `/blog/`
- 自寫 Jekyll 版型(`_layouts/` + `assets/css/site.css`),不用 remote theme;GitHub Pages 直接 build
- 205+ 篇文章 permalink 維持 `/:categories/:year/:month/:day/:title.html`,舊網址不斷
- 作品牆截圖:`node scripts/portfolio-shots.mjs` 重截後以 Pillow 轉 webp(<100KB 走本地路徑)
- 訂閱表單打 k-rider-api Worker(D1,`source: "blog"`)
- `/vote/` 取代原本的 Google 表單,一頁收四件事:投票(限選三項、隨時可改)、
  想聽的不在上面、想來講一場、以及某一場講完的心得。全部共用同一個匿名 voter id,
  零登入、不收 email。純靜態,沒有 front matter 所以 Jekyll 原樣輸出;
  後端是 k-rider-api 的 `/vote` 與 `/note`,提案與心得不公開,讀取走 `/admin/notes`。
  **每辦完一場要手動改 `vote/topics.js`**:把該主題從 `open` 搬到 `done`、補錄影連結、
  加 `feedback: true` 讓心得卡出現;下一場開始前把那個旗標拿掉。
  票按 slug 算,搬走就自然退出排行。slug 一旦公開就不要改,改了那個主題的票會歸零。
  `open` 那幾項的文字照 `yaze-journal/projects/wednesday-live/選題-2026-10.md` 的
  「建議的投票選項文字」原文,要改先改那份
