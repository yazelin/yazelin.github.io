// 首頁直播台的回歸檢查:連按換作品,字幕不可以兩句交錯。
// 用法:先在本機跑起站(預設 http://localhost:4011),然後 node scripts/check-stream.mjs [網址]
// 本 repo 沒裝 playwright,借用全域安裝的那一份(npm i -g playwright)。
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');

const url = process.argv[2] || 'http://localhost:4011/';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
p.on('pageerror', e => errors.push(e.message));
await p.goto(url, { waitUntil: 'networkidle' });
await p.click('[data-ask=play]');
await p.waitForTimeout(2500);
for (let i = 0; i < 4; i++) { await p.click('.share-next'); await p.waitForTimeout(250 + i * 120); }
await p.click('.share-prev');
await p.waitForTimeout(6000);
const r = await p.evaluate(() => {
  const play = JSON.parse(document.getElementById('works-data').textContent).filter(w => w.kind === 'play');
  const lines = new Set(play.map(w => w.line));
  const chat = [...document.querySelectorAll('.chat-log .from-host span')].map(s => s.textContent);
  return { caption: document.querySelector('.caption-text').textContent, expect: play[3].line,
           broken: chat.filter(t => t.length > 20 && !lines.has(t) && !/[。！？]$/.test(t)) };
});
await b.close();
const ok = r.caption === r.expect && r.broken.length === 0 && errors.length === 0;
console.log(ok ? 'OK 字幕與聊天室都沒有交錯' : `FAIL\n字幕:${r.caption}\n應為:${r.expect}\n殘句:${r.broken.join(' / ')}\n錯誤:${errors.join(' / ')}`);
process.exit(ok ? 0 : 1);
