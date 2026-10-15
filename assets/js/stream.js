// 首頁直播台:格莉奇當主持人介紹亞澤。
// 台詞只能改寫站上已核可文案裡的事實;她自己的反應照 ai-brain-site/persona.json 的設定寫。
// 作品與作品台詞在 _data/works.json,這支只管流程。

const $ = (s, el = document) => el.querySelector(s);
const works = JSON.parse($('#works-data').textContent);
const data = JSON.parse($('#stream-data').textContent);
const stage = $('.stage');
const host = $('.host');
const caption = $('.caption-text');
const log = $('.chat-log');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const play = works.filter(w => w.kind === 'play');

let rig = null;

/* ---------- 她記得你來過,但叫不出你是誰 ----------
   照正典:她很聰明,壞掉的只有「取出來」那一步。所以寫成「我確定來過，只是叫不出你是誰」,
   不寫成「你是誰？」。記的是次數和上次停在哪個作品,只存在這個瀏覽器,讀不到就當第一次來。 */
const VISIT_KEY = 'glitch_visit';
let visit = { n: 0, mem: [] };
try { visit = Object.assign(visit, JSON.parse(localStorage.getItem(VISIT_KEY) || '{}')); } catch {}
if (!Array.isArray(visit.mem)) visit.mem = visit.last ? [visit.last] : [];
delete visit.last;
const returning = visit.n > 0;
const kept = visit.mem.slice(-2);
visit.n += 1;
const saveVisit = () => { try { localStorage.setItem(VISIT_KEY, JSON.stringify(visit)); } catch {} };
saveVisit();

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

/* ---------- 4KB 記憶體條 ----------
   八格,一格 512B。看一件作品就寫進一格;再看一次會搬到最新(一直被叫出來的留得住);
   滿了就把最舊的一整件擠掉。這是她的正典,不是比喻。 */
const MEM = 8;
const memCells = $('.mem-cells');
const memUsed = $('.mem-used');
function renderMem(fresh, evicted) {
  memCells.textContent = '';
  for (let i = 0; i < MEM; i++) {
    const li = document.createElement('li');
    const t = visit.mem[i];
    if (t) { li.title = t; li.className = 'on' + (t === fresh ? ' fresh' : ''); }
    memCells.append(li);
  }
  memUsed.textContent = (visit.mem.length / 2).toString();
  if (evicted) {
    const gone = document.createElement('span');
    gone.className = 'mem-gone';
    gone.textContent = evicted;
    $('.mem').append(gone);
    setTimeout(() => gone.remove(), 2400);
  }
}
function remember(title) {
  const i = visit.mem.indexOf(title);
  if (i >= 0) visit.mem.splice(i, 1);
  visit.mem.push(title);
  let evicted = '';
  if (visit.mem.length > MEM) {
    evicted = visit.mem.shift();
    chat('', `（記憶體滿了，「${esc(evicted)}」被擠掉了）`, 'sys');
  }
  saveVisit();
  renderMem(title, evicted);
}
let typing = Promise.resolve();


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
const playBtn = $('.share-play');
function restoreShot() {
  $('.share-live', share)?.remove();
  $('.share-shot', share).hidden = false;
  share.classList.remove('playing');
  playBtn.textContent = '直接玩';
}
playBtn.addEventListener('click', () => {
  const w = play[idx];
  if (share.classList.contains('playing')) return restoreShot();
  // 手機上台太小,嵌進來玩不動,直接開新分頁
  if (innerWidth < 700) return void open(w.url, '_blank', 'noopener');
  const f = document.createElement('iframe');
  f.className = 'share-live';
  f.src = w.url;
  f.title = w.title;
  f.allow = 'microphone; fullscreen; autoplay; clipboard-write';
  $('.share-shot', share).hidden = true;
  $('.share-shot', share).after(f);
  share.classList.add('playing');
  stage.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  playBtn.textContent = '看截圖';
  interrupt();
  say('你玩，我看。', { emote: 'happy' });
});
function show(i) {
  restoreShot();
  idx = (i + play.length) % play.length;
  const w = play[idx];
  remember(w.title);
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
  restoreShot();
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
    say('我分享畫面給你看。上面的箭頭可以換下一個。', { emote: 'happy' }).then(() => {
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
/* ---------- 聊天室抽屜 ----------
   桌機首屏留給主視覺,聊天室平常收在右邊,按「聊天室」或問了問題才拉出來。窄螢幕聊天室固定在台下面,這顆鈕用 CSS 藏掉 */
const chatBtn = $('.chat-toggle');
function openChat(on) {
  $('.stream').classList.toggle('chat-open', on);
  chatBtn.setAttribute('aria-expanded', on);
  if (on) log.scrollTop = log.scrollHeight;
}
chatBtn.addEventListener('click', () => openChat(!$('.stream').classList.contains('chat-open')));

document.querySelectorAll('[data-ask]').forEach(btn => {
  btn.addEventListener('click', () => {
    openChat(true);
    interrupt(); // 訪客開口了,還在排隊的開場白就不講了,直接回答
    chat('你', esc(btn.textContent), 'me');
    btn.classList.add('asked');
    answers[btn.dataset.ask]();
  });
});

/* ---------- 訂閱與抖內 ---------- */
// 兩顆鈕在全站導覽列上;別頁的「訂閱」是連到首頁 #subscribe,在首頁就地捲過去
$('.cta-sub').addEventListener('click', e => {
  e.preventDefault();
  chat('你', '（按了訂閱）', 'me');
  $('#subscribe').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  setTimeout(() => $('#subscribe input[type=email]')?.focus({ preventScroll: true }), reduced ? 0 : 700);
});
$('.cta-tip').addEventListener('click', () => {
  interrupt();
  chat('你', '抖內了一杯咖啡', 'me tip');
  say('謝謝！咖啡會變成他的下一個作品。我負責天線抖一下。', { emote: 'happy', wave: true });
});

/* ---------- 工具列 ---------- */
const WAVES = ['嗨！我看到你了。', '天線在抖，因為你在看。', '揮手收到，訊號滿格。'];
let waveN = 0;
$('.tool-wave').addEventListener('click', () => {
  interrupt();
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
    host.classList.add('rig-on');
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

/* ---------- 子母畫面:台捲出去之後她縮到左下角,跟著看作品 ----------
   搬的是同一個骨架實例(canvas 換父節點 context 還在),不另外載一份。 */
const pip = $('.pip');
const pipSay = $('.pip-say');
const hostAnchor = $('.caption');
let pipOff = false;
try { pipOff = sessionStorage.getItem('pip_off') === '1'; } catch {}
function toPip(on) {
  if (on === host.parentNode.classList.contains('pip-body')) return;
  if (on) {
    pip.hidden = false;
    $('.pip-body').append(host);
    rig?.setView('bust');
  } else {
    stage.insertBefore(host, hostAnchor);
    pip.hidden = true;
    pipSay.classList.remove('on');
    rig?.setView('full');
  }
}
new IntersectionObserver(([e]) => toPip(!e.isIntersecting && !pipOff), { threshold: .12 }).observe($('.stream'));
$('.pip-body').addEventListener('click', () => $('.stream').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }));
$('.pip-close').addEventListener('click', () => {
  pipOff = true;
  try { sessionStorage.setItem('pip_off', '1'); } catch {}
  toPip(false);
});
let pipGen = 0;
async function pipLine(text) {
  const mine = ++pipGen;
  pipSay.textContent = '';
  pipSay.classList.add('on');
  pip.classList.add('talking');
  if (reduced) pipSay.textContent = text;
  else for (const ch of text) {
    if (mine !== pipGen) return;
    pipSay.textContent += ch;
    await sleep(34);
  }
  await sleep(6000);
  if (mine === pipGen) { pipSay.classList.remove('on'); pip.classList.remove('talking'); }
}
const byTitle = Object.fromEntries(works.map(w => [w.title, w]));
let lastPip = '';
function comment(title) {
  if (pip.hidden || title === lastPip || !byTitle[title]) return;
  lastPip = title;
  remember(title);
  pipLine(byTitle[title].line);
}
const vods = [...document.querySelectorAll('.vod')];
const vodTitle = v => v.querySelector('.vod-link').textContent.trim();
vods.forEach(v => {
  v.addEventListener('mouseenter', () => comment(vodTitle(v)));
  v.addEventListener('focusin', () => comment(vodTitle(v)));
});
// 手機沒有滑鼠:作品捲到畫面中間就講
if (matchMedia('(hover: none)').matches) {
  const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && comment(vodTitle(e.target))), { rootMargin: '-45% 0px -45% 0px' });
  vods.forEach(v => io.observe(v));
}
new IntersectionObserver(([e]) => {
  if (e.isIntersecting && !pip.hidden && lastPip !== '#subscribe') {
    lastPip = '#subscribe';
    pipLine('在這裡留 email，有新文章或新作品上線時他會告訴你。');
  }
}, { threshold: .5 }).observe($('#subscribe'));

/* ---------- 開台 ---------- */
renderMem();
chat('', '林亞澤 進入了聊天室', 'sys');
chat('', returning ? `你 進入了聊天室（第 ${visit.n} 次）` : '你 進入了聊天室', 'sys');
mount().then(async () => {
  await sleep(reduced ? 0 : 500);
  say('逼——嗶！開台了。今天的來賓是林亞澤。', { wave: true, emote: 'happy' }); // speak-tw-ok 角色正典口頭禪
  if (returning) {
    say('……你好像來過。我確定來過，只是叫不出你是誰。', { emote: 'thinking' });
    if (kept.length) say(`記憶體裡還留著你看過的${kept.map(t => `「${t}」`).join('、')}。`);
  } else {
    say('他說他不寫程式，可是做出了三十幾個上線的東西。白板上那句就是他說的。');
    say('他的做法是開規格、下發包、做驗收，乙方是 AI。我也是 AI，所以我有點緊張。', { emote: 'thinking' });
  }
  // 窄螢幕聊天室在台的下面
  const where = matchMedia('(max-width: 700px)').matches ? '下面' : '左邊';
  say(`${where}可以問我問題。我一定答得出來。大概。`);
});
