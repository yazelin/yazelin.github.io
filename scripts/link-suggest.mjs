// 內部連結建議器 — 寫完文跑一次:node scripts/link-suggest.mjs _posts/xxxx.md
// 對照表自動彙整:行銷工具箱 tools.json + [Index] 系列文 + 核心頁 + 常用專案文。
// 只建議不改檔,人工決定要不要連(工具驅動開發:驗收工具,不進 production)。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const map = new Map(); // name → { link, why }

function add(name, link, why) { if (!map.has(name)) map.set(name, { link, why }); }

// 1. 核心頁
add('甲方思維', '{% post_url 2026-06-16-k-rider-case-study %}', '發包示範文(定義文未寫,先連這篇)');
add('許願池', '{% post_url 2026-07-07-wish-pool %}', '設計篇');
add('AI 願望池', '{% post_url 2026-07-07-wish-pool %}', '設計篇');
add('About', '/about/', '關於頁');
add('作品牆', '/#work', '首頁作品區');

// 2. 行銷工具箱(本機 repo 的 tools.json)
try {
  const tools = JSON.parse(fs.readFileSync('/home/ct/marketing-toolbox/tools.json', 'utf8'));
  add('行銷工具箱', 'https://yazelin.github.io/marketing-toolbox/', '工具箱本體');
  for (const t of tools) add(t.name, t.url, `工具箱:${t.category}`);
} catch {}

// 3. [Index] 系列文 + 有 featured 的文(標題關鍵詞 → post_url)
for (const f of fs.readdirSync(path.join(ROOT, '_posts'))) {
  if (!f.endsWith('.md')) continue;
  const head = fs.readFileSync(path.join(ROOT, '_posts', f), 'utf8').slice(0, 800);
  const title = (head.match(/^title:\s*"(.+?)"/m) || [])[1];
  if (!title) continue;
  const slug = f.replace(/\.md$/, '');
  const postUrl = `{% post_url ${slug} %}`;
  if (/categories:\s*\[Index\]/.test(head)) {
    // 系列 index:取書名號或冒號前主題詞
    const key = (title.match(/「(.+?)」/) || title.match(/^([^:,(]+)/) || [])[1];
    if (key && key.length >= 3) add(key.trim(), postUrl, `系列目錄:${f}`);
  }
  if (/featured:\s*true/.test(head)) {
    const key = (title.match(/「(.+?)」/) || [])[1];
    if (key && key.length >= 3) add(key.trim(), postUrl, `精選文:${f}`);
  }
}

// 4. 常用專案名手動種子(名稱在文章高頻出現的)
add('K-Rider', '{% post_url 2026-06-16-k-rider-case-study %}', '案例拆解文');
add('iPAS 模擬考', '{% post_url 2026-06-23-ipas-ai-quiz %}', '介紹文');
add('咏唱魔法', '{% post_url 2026-07-06-ai-chant-magic-index %}', '系列目錄');
add('戰場編輯器', '{% post_url 2026-06-24-battlefield-editor %}', '介紹文');
add('台語辭典', '{% post_url 2026-07-15-taigi-hakka-dictionaries %}', '介紹文');
add('LINE 對話製造機', 'https://yazelin.github.io/line-chat-maker/', '工具本體');

// ── 掃描目標檔 ──
const target = process.argv[2];
if (!target) { console.log('用法:node scripts/link-suggest.mjs _posts/xxxx.md'); process.exit(1); }
let text = fs.readFileSync(target, 'utf8');
const selfSlug = path.basename(target, '.md');
// 去掉 front matter、code fence、既有連結、原始 HTML
text = text.replace(/^---[\s\S]*?---/, '').replace(/```[\s\S]*?```/g, '')
           .replace(/<[^>]+>/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '');

let hits = 0;
for (const [name, { link, why }] of map) {
  if (link.includes(selfSlug)) continue;          // 不建議連自己
  if (text.includes(name)) {
    console.log(`提到「${name}」未連結 → ${link}(${why})`);
    hits++;
  }
}
console.log(hits ? `\n共 ${hits} 個建議(已有連結的不會列)` : '沒有可補的內部連結,乾淨。');
