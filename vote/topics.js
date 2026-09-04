// 週三直播主題清單。這是唯一要人手動維護的檔案。
//
// 每辦完一場:把該主題從 open 搬到 done、補上 url、加 feedback:true 讓心得卡出現。
// 下一場開始之前把 feedback 拿掉,心得卡就收起來。
// 票是按 slug 算的,搬走就自然退出排行,舊票不受影響。slug 一旦公開就不要改。
//
// open 的九項照 yaze-journal/projects/wednesday-live/選題-2026-10.md 的
// 「建議的投票選項文字」原文,一字不加。要改先改那份。
window.VOTE_TOPICS = {
  open: [
    { slug: 'emoji-slot',   title: '表情拉霸影片',        desc: '自拍變成能貼 FB 的拉霸影片' },
    { slug: 'sprite',       title: '會動的角色',          desc: '上傳一張圖，生成會動的 sprite 貼圖' },
    { slug: 'city-monster', title: '家鄉小怪物',          desc: '幫你的家鄉養一隻專屬小怪物' },
    { slug: 'cast-lock',    title: 'AI 角色為什麼會變臉',  desc: '鎖角色的四條鐵律，現場鎖一隻出三張圖' },
    { slug: 'editor-night', title: '小編工具夜',          desc: '抽獎、UTM 連結、簡體稿台灣化、分享卡預覽一次打包' },
    { slug: 'wish-night',   title: '許願之夜',            desc: '手機許願，看 AI 把願望變規格' },
    { slug: 'ai-crew',      title: '拆開 AI 產線',         desc: '五個 AI 角色怎麼合作生出一部漫畫對話' },
    { slug: 'slide-bg',     title: '簡報背景怎麼做',       desc: 'AI 生的圖為什麼放不了字，配方現場驗' },
    { slug: 'visual-novel', title: '視覺小說之夜',         desc: '一天一圈的視覺小說是怎麼做出來的' },
  ],
  done: [
    { slug: 'web-deck',   title: '怎麼做高質感的網頁簡報',   date: '09-02', url: '/events/deck-2026-09-02/', feedback: true },
    { slug: 'wish-pool',  title: '拆解 AI 許願池',         date: '08-26', url: '/events/wishpool-2026-08-26/' },
    { slug: 'skull-cam',  title: 'AI 給的設計圖會騙人',     date: '08-19', url: '/events/skull-2026-08-19/' },
    { slug: 'chat-maker', title: 'LINE 對話創作營',        date: '08-12', url: '/events/chat-2026-08-12/' },
    { slug: 'sticker',    title: '貼圖實作營',            date: '08-05', url: '/events/sticker-2026-08-05/' },
  ],
  scheduled: [
    { slug: 'brand-site',  title: '做自己的個人品牌站',      date: '09-09', url: '/events/site-2026-09-09/' },
    { slug: 'novel-canon', title: '用 AI 寫長篇不崩壞的設定', date: '09-16', url: '/events/novel-2026-09-16/' },
    { slug: 'quiz-site',   title: '用 AI 做自己的刷題網站',   date: '09-23', url: '/events/quiz-2026-09-23/' },
    { slug: 'web-effects', title: '幫你的網頁加點特效',      date: '09-30', url: '/events/effects-2026-09-30/' },
  ],
};
