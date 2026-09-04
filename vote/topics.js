// 週三直播主題清單。這是唯一要人手動維護的檔案。
//
// 每辦完一場:把該主題從 open 搬到 done,補上 url(錄影或活動頁)。
// 搬過去之後它就不再收票,票會集中到真正還沒排的那幾個——這正是 Google 表單做不到的事,
// 那邊刪掉選項會讓舊回覆的統計錯亂,這裡的票是按 slug 算的,搬走就自然退出排行。
//
// slug 一旦公開就不要改,改了等於那個主題的票全部歸零。
window.VOTE_TOPICS = {
  open: [
    { slug: 'ai-crew',      title: '拆開 AI 產線',        desc: '五個 AI 角色接力:編劇、評審、執行、美術指導、生圖,合作生出一段對話' },
    { slug: 'watermark',    title: '隱形浮水印',          desc: '幫作品蓋一個看不見的章,再親手偽造它' },
    { slug: 'visual-novel', title: '用 AI 做視覺小說',     desc: '《格莉奇與黑洞先生》劇本、立繪、分鏡怎麼一路做下來' },
    { slug: 'cast-lock',    title: 'AI 角色為什麼會變臉',  desc: '鎖住同一個角色的四條鐵律,現場鎖一隻出三張圖' },
    { slug: 'slide-bg',     title: '簡報背景怎麼做',       desc: 'AI 生的圖為什麼放不了字,暗場配方與機械驗收現場跑一次' },
    { slug: 'ai-platform',  title: '自建多人使用的 AI 平台', desc: '登入、權限控管、資料隔離、操作紀錄:同一個問題,不同身分得到不同答案' },
    { slug: 'emoji-slot',   title: '表情拉霸影片',        desc: '一張自拍變成會轉的搞笑影片' },
    { slug: 'editor-night', title: '小編工具夜',          desc: '留言抽獎、全通路連結 QR、對岸文稿台灣化,一次打包' },
    { slug: 'sprite',       title: '會動的角色',          desc: '上傳一張角色圖,做出會動的小動畫匯出 GIF' },
    { slug: 'city-monster', title: '家鄉小怪物',          desc: '幫家鄉創造一隻專屬小怪物,收進共同圖鑑' },
  ],
  done: [
    { slug: 'sticker',    title: '貼圖實作營',            date: '08-05', url: '/events/sticker-2026-08-05/' },
    { slug: 'chat-maker', title: 'LINE 對話創作營',        date: '08-12', url: '/events/chat-2026-08-12/' },
    { slug: 'skull-cam',  title: 'AI 給的設計圖會騙人',     date: '08-19', url: '/events/skull-2026-08-19/' },
    { slug: 'wish-pool',  title: '拆解 AI 許願池',         date: '08-26', url: '/events/wishpool-2026-08-26/' },
    { slug: 'web-deck',   title: '怎麼做高質感的網頁簡報',   date: '09-02', url: '/events/deck-2026-09-02/' },
  ],
  // 已經排定日期、還沒講的。列出來讓大家知道不用投,但看得到即將發生什麼。
  scheduled: [
    { slug: 'brand-site', title: '做自己的個人品牌站',      date: '09-09', url: '/events/site-2026-09-09/' },
    { slug: 'novel-canon',title: '用 AI 寫長篇不崩壞的設定', date: '09-16', url: '/events/novel-2026-09-16/' },
    { slug: 'quiz-site',  title: '用 AI 做自己的刷題網站',   date: '09-23', url: '/events/quiz-2026-09-23/' },
    { slug: 'web-effects',title: '幫你的網頁加點特效',      date: '09-30', url: '/events/effects-2026-09-30/' },
  ],
};
