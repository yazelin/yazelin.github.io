// 首頁直播台:格莉奇當主持人介紹亞澤。
// 台詞只能改寫站上已核可文案裡的事實;她自己的反應照 ai-brain-site/persona.json 的設定寫。
// 作品與作品台詞在 _data/works.json,這支只管流程。

const $ = (s, el = document) => el.querySelector(s);
const works = JSON.parse($('#works-data').textContent);
const data = JSON.parse($('#stream-data').textContent);
const stage = $('.stage');
const caption = $('.caption-text');
const log = $('.chat-log');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const play = works.filter(w => w.kind === 'play');

let rig = null;
let typing = Promise.resolve();
let busy = false;

/* ---------- 聊天室 ---------- */
function chat(who, html, cls = '') {
  const li = document.createElement('li');
  li.className = cls;
  if (who) {
    const b = document.createElement('b');
    b.textContent = who;
    li.append(b);
  }
  const span = document.createElement('span');
  span.innerHTML = html;
  li.append(span);
  log.append(li);
  while (log.children.length > 40) log.firstElementChild.remove();
  log.scrollTop = log.scrollHeight;
  return li;
}
const esc = t => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- 她說話:字幕逐字出來,同一句也進聊天室 ----------
   一次只能有一句在打字。interrupt() 讓正在打的那句立刻收掉(聊天室補完整句,字幕不再寫),
   排在後面還沒輪到的舊台詞直接跳過。換作品時要叫它,不然兩句會搶同一條字幕交錯在一起。 */
let gen = 0;
function interrupt() {
  gen++;
  typing = Promise.resolve();
}
function say(text, { emote, wave, links } = {}) {
  const mine = gen;
  typing = typing.then(async () => {
    if (mine !== gen) return;
    if (emote && rig) rig.emote(emote, 4500);
    if (wave && rig) rig.wave();
    caption.textContent = '';
    const li = chat('格莉奇', '', 'from-host');
    const span = li.lastElementChild;
    if (reduced) {
      caption.textContent = text;
      span.textContent = text;
    } else {
      for (const ch of text) {
        if (mine !== gen) { span.textContent = text; break; }
        caption.textContent += ch;
        span.textContent += ch;
        log.scrollTop = log.scrollHeight;
        await sleep('，。！？…'.includes(ch) ? 160 : 42);
      }
    }
    if (links) span.insertAdjacentHTML('beforeend', ' ' + links);
    if (mine === gen) await sleep(reduced ? 0 : 700);
  });
  return typing;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- 畫面分享:一次一個作品 ---------- */
const share = $('.share');
let idx = 0;
function show(i) {
  idx = (i + play.length) % play.length;
  const w = play[idx];
  const img = $('.share-shot img', share);
  img.src = data.img + w.img;
  $('.share-shot', share).href = w.url;
  const t = $('.share-title', share);
  t.textContent = w.title;
  t.href = w.url;
  $('.share-count', share).textContent = `${idx + 1} / ${play.length}`;
  const badge = $('.share-badge', share);
  badge.textContent = w.badge || '';
  badge.hidden = !w.badge;
  stage.dataset.mode = 'share';
  share.hidden = false;
  // 手機上聊天室在台的下面,點完問題看不到畫面分享,把台捲回來
  const r = stage.getBoundingClientRect();
  if (r.top < 0 || r.bottom > innerHeight) stage.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  interrupt(); // 換作品就收掉上一句
  say(w.line, { emote: idx % 3 === 0 ? 'happy' : undefined });
}
function closeShare() {
  interrupt();
  caption.textContent = '';
  stage.dataset.mode = 'board';
  share.hidden = true;
}
$('.share-prev').addEventListener('click', () => show(idx - 1));
$('.share-next').addEventListener('click', () => show(idx + 1));
$('.share-close').addEventListener('click', closeShare);
share.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') show(idx - 1);
  if (e.key === 'ArrowRight') show(idx + 1);
  if (e.key === 'Escape') closeShare();
});

/* ---------- 問題按鈕 = 導覽 ---------- */
const answers = {
  who() {
    say('他在工業自動化做了十幾年，機器人、視覺檢測、AGV 車隊都碰過。');
    say('2024 年起他換邊坐，改當甲方，乙方換成 AI。', {
      links: `<a href="${data.about}">完整的故事</a>`,
    });
  },
  play() {
    say('我分享畫面給你看。左右鍵可以換下一個。', { emote: 'happy' }).then(() => {
      show(0);
      $('.share-next').focus({ preventScroll: true });
    });
  },
  read() {
    say(`他寫了 ${data.posts} 篇。先從這幾篇開始，我挑的。`, {
      links: data.feats.map(f => `<a href="${f.u}">${esc(f.t)}</a>`).join('') + `<a href="${data.blog}">全部文章</a>`,
    });
  },
  follow() {
    say('最下面可以留 email，有新文章或新作品上線時他會告訴你。想快一點的話，也有 LINE 社群。', {
      links: '<a href="#subscribe">到訂閱那邊</a>',
    });
  },
};
document.querySelectorAll('[data-ask]').forEach(btn => {
  btn.addEventListener('click', () => {
    chat('你', esc(btn.textContent), 'me');
    btn.classList.add('asked');
    answers[btn.dataset.ask]();
  });
});

/* ---------- 工具列 ---------- */
const WAVES = ['嗨！我看到你了。', '天線在抖，因為你在看。', '揮手收到，訊號滿格。'];
let waveN = 0;
$('.tool-wave').addEventListener('click', () => {
  chat('你', '（揮手）', 'me');
  say(WAVES[waveN++ % WAVES.length], { wave: true, emote: 'happy' });
});

const voiceBtn = $('.tool-voice');
const VOICE_TEXT = '大家好，我是格莉奇。虛擬主播，頻道第二年。我的記憶體只有四KB。這句話我每天都要講一次。真的沒有那麼少啦。可是我手邊確實放不下，滿了就把最舊的一整件擠掉。所以我每天晚上都會抄一次守則本。第一頁有七行，上面有六個名字。我知道有第七個。我只是叫不出來。';
let fallbackAudio = null;
voiceBtn.addEventListener('click', () => {
  const on = voiceBtn.getAttribute('aria-pressed') === 'true';
  const stop = () => { voiceBtn.setAttribute('aria-pressed', 'false'); voiceBtn.textContent = '聽她自我介紹'; };
  if (on) {
    rig ? rig.stopSpeaking() : fallbackAudio?.pause();
    return stop();
  }
  voiceBtn.setAttribute('aria-pressed', 'true');
  voiceBtn.textContent = '停止';
  caption.textContent = VOICE_TEXT;
  if (rig) {
    // speak() 開頭會先 stop() 一次,那一發 'stopped' 要忽略,播出來之後的停止才算數(格莉奇OS 踩過)
    let started = false;
    rig.onvoice = state => {
      if (state === 'playing') { started = true; return; }
      if (started) stop();
    };
    rig.speak(data.voice).catch(stop);
  } else {
    fallbackAudio = new Audio(data.voice);
    fallbackAudio.onended = stop;
    fallbackAudio.play().catch(stop);
  }
});

/* ---------- 活體骨架 ---------- */
async function mount() {
  try {
    const { mountPet } = await import(data.rig);
    const canvas = $('.host-canvas');
    const handle = await mountPet(canvas, { view: 'full', follow: true });
    if (!handle) return;
    rig = handle;
    stage.classList.add('rig-on');
    const surface = handle.canvas;
    addEventListener('pointermove', e => {
      const r = surface.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) / (innerWidth / 2);
      const y = (e.clientY - (r.top + r.height * .25)) / (innerHeight / 2);
      handle.look(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, -y)));
    }, { passive: true });
  } catch {
    // 骨架載不起來就留著靜態立繪,台還是開得了
  }
}

/* ---------- 開台 ---------- */
chat('', '林亞澤 進入了聊天室', 'sys');
chat('', '你 進入了聊天室', 'sys');
mount().then(async () => {
  await sleep(reduced ? 0 : 500);
  say('逼——嗶！開台了。今天的來賓是林亞澤。', { wave: true, emote: 'happy' }); // speak-tw-ok 角色正典口頭禪
  say('他說他不寫程式，可是做出了三十幾個上線的東西。白板上那句就是他說的。');
  say('他的做法是開規格、下發包、做驗收，乙方是 AI。我也是 AI，所以我有點緊張。', { emote: 'thinking' });
  // 窄螢幕聊天室在台的下面
  const where = matchMedia('(max-width: 1080px)').matches ? '下面' : '右邊';
  say(`${where}可以問我問題。我一定答得出來。大概。`);
});
