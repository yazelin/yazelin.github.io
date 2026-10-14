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
- 直播台是滿版的深色攝影棚(只有台內;頁面其他地方維持淺色),白板與 LIVE 紅是棚裡唯二的亮點。
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
- 205+ 篇文章 permalink 維持 `/:categories/:year/:month/:day/:title.html`,舊網址不斷
- 作品牆截圖:`node scripts/portfolio-shots.mjs` 重截後以 Pillow 轉 webp(<100KB 走本地路徑)
- 訂閱表單打 k-rider-api Worker(D1,`source: "blog"`)
- `/vote/` 取代原本的 Google 表單,一頁收六件事:投票(限選三項、隨時可改)、
  用 AI 到什麼程度(複選,選項在 `vote/topics.js` 的 `VOTE_USES`)、對已講過場次按愛心、
  想聽的不在上面、想來講一場、以及某一場講完的心得。全部共用同一個匿名 voter id,
  零登入、不收 email。純靜態,沒有 front matter 所以 Jekyll 原樣輸出;
  後端是 k-rider-api 的 `/vote` 與 `/note`,提案與心得不公開,讀取走 `/admin/notes`。
  **每辦完一場要手動改 `vote/topics.js`**:把該主題從 `open` 搬到 `done`、補錄影連結、
  加 `feedback: true` 讓心得卡出現;下一場開始前把那個旗標拿掉。
  票按 slug 算,搬走就自然退出排行。slug 一旦公開就不要改,改了那個主題的票會歸零。
  `open` 那幾項的文字照 `yaze-journal/projects/wednesday-live/選題-2026-10.md` 的
  「建議的投票選項文字」原文,要改先改那份。
  **換顏色改 `vote/theme.css`**(色票獨立成一支,不用動 index.html);頁面右上角有
  亮色/深色/跟隨系統的切換,選擇存 localStorage。`--all` 與 `--mine` 是唯二帶資料
  意義的顏色,換之前先對 theme.css 開頭寫的三個條件(明度帶、彩度地板、色盲分離)。
  送上來的東西在 k-rider 後台 `admin.html` 的「回饋」分頁看
