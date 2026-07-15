# yazelin.github.io

林亞澤(Yaze)的個人品牌主站+部落格:https://yazelin.github.io

- 首頁是 landing(定位、作品牆、故事、精選文章、訂閱表單),文章列表在 `/blog/`
- 自寫 Jekyll 版型(`_layouts/` + `assets/css/site.css`),不用 remote theme;GitHub Pages 直接 build
- 205+ 篇文章 permalink 維持 `/:categories/:year/:month/:day/:title.html`,舊網址不斷
- 作品牆截圖:`node scripts/portfolio-shots.mjs` 重截後以 Pillow 轉 webp(<100KB 走本地路徑)
- 訂閱表單打 k-rider-api Worker(D1,`source: "blog"`)
