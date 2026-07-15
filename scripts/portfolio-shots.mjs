// 作品牆截圖腳本 — 留在 repo 供日後更新
// 用法（因 worktree 內未裝 playwright，借用已裝 playwright 的 repo 的 node_modules）：
//   cd /home/ct/fb-photo-dl && node /home/ct/yazelin-blog-rebrand/scripts/portfolio-shots.mjs
// 輸出固定寫絕對路徑，與執行時的 cwd 無關。
import { chromium } from 'playwright';

const OUT_DIR = '/home/ct/yazelin-blog-rebrand/images/portfolio';

const shots = [
  ['ai-chant-magic', 'https://yazelin.github.io/ai-chant-magic/'],
  ['k-rider', 'https://yazelin.github.io/k-rider/'],
  ['roll-formosa', 'https://yazelin.github.io/roll-formosa/'],
  ['taigi', 'https://yazelin.github.io/mandarin-taigi/'],
  ['sprite-studio', 'https://yazelin.github.io/mori-sprite-studio/'],
];

// 常見的「先按掉再截」選擇器（cookie/說明彈窗/開始畫面按鈕）
const DISMISS_SELECTORS = [
  'text=/開始/i',
  'text=/start/i',
  'text=/我知道了/i',
  'text=/關閉/i',
  'text=/close/i',
  'button:has-text("同意")',
  '[class*="close"]',
  '[class*="dismiss"]',
];

async function tryDismiss(page) {
  for (const sel of DISMISS_SELECTORS) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 500 })) {
        await el.click({ timeout: 1000 });
        await page.waitForTimeout(500);
      }
    } catch {
      // selector 沒命中就跳過，不中斷流程
    }
  }
}

const b = await chromium.launch({ channel: 'chrome' });
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
for (const [name, url] of shots) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500); // 等動畫/canvas 進場
  await tryDismiss(page);
  // 有些 dismiss 選擇器的 actionability 檢查會把頁面捲走，截圖前強制拉回頂部
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT_DIR}/${name}.png` });
  console.log(name, 'done');
}
await b.close();
