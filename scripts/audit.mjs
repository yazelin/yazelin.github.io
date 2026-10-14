// 全站無障礙與版面檢查:axe 的對比、連結名稱、圖片替代文字、按鈕名稱、標題層級、表單標籤,
// 外加橫向捲動。淺色/深色 × 桌機/手機各跑一次。
// 用法:先在本機跑起站(預設 http://localhost:4011),然後 node scripts/audit.mjs /路徑 /路徑 ...
// 需要全域的 playwright 與 axe-core(npm i -g playwright axe-core)。
// LINE 社群按鈕是 LINE 官方綠底白字(品牌色,刻意不改),結果裡排除。
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const root = execSync('npm root -g').toString().trim();
const require = createRequire(root + '/');
const { chromium } = require('playwright');
const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const base = process.env.SITE || 'http://localhost:4011';
const pages = process.argv.slice(2).length ? process.argv.slice(2) : ['/'];
const b = await chromium.launch();
let total = 0;
for (const scheme of ['light', 'dark']) for (const [w, h] of [[1440, 900], [390, 844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, colorScheme: scheme, reducedMotion: 'reduce' });
  for (const u of pages) {
    await p.goto(base + u, { waitUntil: 'networkidle' });
    await p.waitForTimeout(400);
    await p.addScriptTag({ content: axe });
    const found = await p.evaluate(async () => (await axe.run(document, { runOnly: ['color-contrast', 'link-name', 'image-alt', 'button-name', 'heading-order', 'label'] })).violations
      .map(v => v.id + ': ' + v.nodes.filter(n => !n.html.includes('community-cta')).slice(0, 4).map(n => n.target.join(' ') + (n.any[0]?.data?.contrastRatio ? ' (' + n.any[0].data.contrastRatio + ')' : '')).join(' | ')));
    const r = found.filter(x => !x.endsWith(': '));
    const ov = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    total += r.length + (ov ? 1 : 0);
    if (r.length || ov) console.log(`[${scheme} ${w}] ${u}${ov ? ' H-OVERFLOW' : ''}\n  ` + r.join('\n  '));
  }
  await p.close();
}
console.log('ISSUES:', total);
await b.close();
process.exit(total ? 1 : 0);
