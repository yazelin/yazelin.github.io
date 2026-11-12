# yazelin.github.io

林亞澤(Yaze)的個人品牌主站+部落格:https://yazelin.github.io

- 首頁是 landing(定位、作品牆、故事、精選文章、訂閱表單),文章列表在 `/blog/`
- 自寫 Jekyll 版型(`_layouts/` + `assets/css/site.css`),不用 remote theme;GitHub Pages 直接 build
- 首頁是「格莉奇的台」:她當直播主持人介紹亞澤。白板上的題目照筆順一筆一畫寫出來
  (`_includes/hand-title.html`,由 `scripts/make_hand_title.py` 產生;筆畫資料 hanzi-writer-data /
  Make Me a Hanzi,Arphic Public License;改句子要重跑腳本)。右邊聊天室的問題按鈕就是導覽,
  「有什麼好玩的」會切到畫面分享一個一個介紹作品。流程在 `assets/js/stream.js`。
- 直播台捲出畫面後,格莉奇縮成左下角的子母畫面(同一個骨架實例搬過去,不另載),滑過或捲到哪件作品就講那件的台詞;
  關掉只在這個分頁有效(sessionStorage)。她會記得訪客來過幾次、上次停在哪件作品(localStorage `glitch_visit`),
  再來時說「我確定來過，只是叫不出你是誰」,照正典:她叫不出內容,但知道有這件事。
  畫面分享的「直接玩」把作品真頁面嵌進台裡(iframe,允許麥克風);窄於 700px 改開新分頁。
- 首屏是主視覺:棚景背景圖 `assets/img/studio-bg.webp`(codex 產圖,裁掉天花板讓圓台靠近底部),題目大字直接寫在棚景上,
  提問鈕在題目下方,聊天室在桌機收成右邊抽屜(問問題時自動拉出)。
- 首屏以下是一段一段的色帶(`.band`):作品(棚的深色)、角色名冊、從工廠到 AI(黑洞先生的星雲深色)、文章、訂閱(阿蕊的藍)。
  每段可以請一位角色「聯動」(`.collab` 標籤加 `.collab-art` 立繪),那段的點綴色 `--acc` 跟著角色走。
  角色色寫在各角色頁 front matter 的 `accent`,首頁名冊直接吃它。內頁也用同一套:頂端是 `_includes/page-hero.html`(深色棚+大英文字+頁名+本頁聯動的角色卡),
  `layout: page` 的頁面用 front matter 的 `hero_en`、`hero_title`、`hero_lead`、`collab`(角色 slug)控制;
  文章頁的大字是日期,活動頁是活動日期,角色頁的卡是她自己、棚染上她的 `accent`。內文直接放在頁面底色上,不再裝白卡片。
  活動頁的場次視覺(cover)放在頁首右邊(page-hero 的 `art`)。作品牆是 `_includes/works-wall.html`,首頁與作品集頁(`works_wall: true`)共用。
  Blog 列表依年份分段,寬螢幕右邊一欄放精選文章;文章頁的標籤與相關文章在寬螢幕變成右邊黏住的一欄。
  Larch 作品頁 `/larch/`:卡片在 build 時由 `_data/larch.yml` 排出(縮圖在 `images/larch/<id 前八碼>.webp`、公開站網址),
  開頁時再讀 larch-showcase 每天同步的 `data/works.json` 補簡介、數字、市集名次,yml 沒有的新作品用 Larch 原圖排上去。
  文章或角色頁要掛某部作品,front matter 寫 `larch: ["id前八碼"]`:文章頁側欄出現「在 Larch 上玩」封面卡,角色頁出現「演出的 Larch 作品」,
  /larch/ 那張卡下面也會自動列出這篇文章。只有 `Larch` 標籤沒寫 `larch` 的文章,側欄只放作品頁入口。首頁角色段下面有四張精選封面。
  新作品上架:yml 補一行、縮圖轉 800 寬 webp。
  標籤頁用 `site.tags`,上方只列三篇以上的常用標籤,錨點一律 `slugify`(文章頁的標籤連結也是)。
  左右邊界全站只有一個變數 `--gut`(超過 96rem 寬時把內容收在中間),所有東西都對齊這條線。
  字體只用三種角色:標題明體(英數 Noto Serif、中文 Noto Serif TC,英文撇號才不會變全形)、英文標籤與數字窄體(Barlow Condensed)、內文黑體;手寫楷書只留給首屏題目。
  進場淡入用 CSS 捲動時間軸(`animation-timeline: view()`),不支援的瀏覽器直接顯示。色帶、頁首、頁尾跟著亮暗切換(`--band-bg` 與 `light-dark()`),只有首屏直播台永遠是深的。
  全站頂端一條黏住的導覽列上有「訂閱」(首頁就地捲到 email 訂閱,別頁連到 `/#subscribe`)與「抖內一杯咖啡」(Buy Me a Coffee)。
  左右邊界統一用 CSS 變數 `--gut`,台裡的資訊列、白板、字幕都對齊導覽列。台頂端資訊列裡是她的 4KB 記憶體條:八格,看一件作品寫一格,再看一次搬到最新,
  滿了擠掉最舊的一件,回訪時她只叫得出還留在條裡的(localStorage `glitch_visit.mem`)。
- 驗收:`node scripts/audit.mjs / /blog/ ...`(axe 對比/標籤/標題層級+橫向捲動,淺深×桌機手機)、
  `node scripts/check-stream.mjs`(字幕不交錯、直接玩回來骨架不糊)。兩支都要先在本機跑起站。
- 作品資料只有一份:`_data/works.json`(標題、網址、截圖、說明、怎麼做的、同系列、動手天數徽章、
  格莉奇的那句台詞)。直播台與下方「作品回放」都吃它,新增作品改這裡就好。徽章只在文案有寫明確天數時才有。
- 格莉奇本人是 glitch-2d 的活體骨架,抄在 `assets/glitch2d/`(來源 ai-brain-site 的 `glitch2d/`
  與 `images/glitch2d/`,再上游是 yazelin/glitch-2d)。本站版 `pet.js` 多了 `follow` 選項與 `look(x, y)`,畫布尺寸改用 clientWidth(不受 CSS 縮放影響,否則縮到角落再放大會變馬賽克)
  讓視線跟游標。骨架載不起來會留著靜態立繪。上游更新時手動重抄,rig.json 的貼圖路徑改成 `img/`。
- 格莉奇的台詞照 ai-brain-site `persona.json` 的設定寫,事實只能改寫站上已核可的文案。
  色票寫在 `site.css` 開頭(她的薄荷 #7cf3c0、霓虹紫 #b78bff 只當點綴),有深色模式;
  導覽列右上角可切「跟隨系統／亮色／深色」,存在 localStorage 的 `wed_theme`,與 /vote/ 共用。
  深色色票在 site.css 寫兩次(系統深色未手動選亮色、手動選深色),少一條切換鈕就只能單向作用。
  舊頁面行內樣式用 `--accent` 當按鈕底色時,字色要用 `--on-accent`,不要寫死 `#fff`。
- 250+ 篇文章 permalink 維持 `/:categories/:year/:month/:day/:title.html`,舊網址不斷
- 分享預覽圖:文章沒寫 `cover:` 時,自動用內文第一張 blog-images 封面圖(只收 png/jpg/webp/gif),再沒有才用站台預設圖。
  封面圖的寬高記在 `_data/cover_sizes.json`,文章頁替第一張圖補寬高與 `fetchpriority="high"`。
  **發新文章後跑 `python3 scripts/cover_sizes.py`**(只量還沒記過的),沒跑也不會壞,只是那篇少了寬高。
- 作品牆截圖:`node scripts/portfolio-shots.mjs` 重截後以 Pillow 轉 webp(<100KB 走本地路徑)
- 訂閱表單打 k-rider-api Worker(D1,`source: "blog"`)
- `/vote/` 只剩一頁轉址(2026-10-19 起):投票與回饋搬到 ai-workshop-backend 的「週三直播記錄」`/live/vote`,
  要登入才能投。舊的 `topics.js`、`theme.css` 已刪,場次與選項改在那邊維護。

## 活動頁瀏覽計數

已發布且有 `event_date` 的活動頁會以 `event-<event_batch>` 為鍵，透過 `sendBeacon()` 呼叫 k-rider-api 的 `/hit`。計數只記日期、鍵值與次數，不存 IP、Cookie、識別碼或 referrer；請求失敗不會影響頁面。footer 會略過這些活動頁的一般站名計數，避免同一頁重複上報。

執行 `python3 scripts/event_hits.py` 會讀取 Worker 公開的 `/hits` 儀表板，列出每場活動的累計瀏覽數。
