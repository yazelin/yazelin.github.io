# Blog 改版(個人品牌主站)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 yazelin.github.io 從 Beautiful Jekyll 預設版型改成自寫版型的個人品牌主站——首頁 landing(定位句+作品牆+故事+精選文章+訂閱)、blog 退居 /blog,205 篇舊網址不斷。

**Architecture:** 移除 remote_theme,自寫 4 個 Jekyll layouts(default/page/post/首頁與 /blog 用頁面檔)+ 一份 CSS。email 收名單沿用 k-rider-api Worker(加 `source: "blog"`)。全部工作在 `rebrand` branch,驗收過後一次 merge 上線(GitHub Pages 從 master 部署)。

**Tech Stack:** Jekyll(GitHub Pages 內建)、jekyll-paginate、jekyll-feed、jekyll-sitemap、giscus、Cloudflare Worker + D1(既有 k-rider-api)、Playwright(驗證)。

## Global Constraints

- 205 篇文章舊網址一律不能斷;permalink pattern(`/:categories/:year/:month/:day/:title.html` 預設)與各頁 `permalink:` front matter 不動。
- giscus、tags 頁、文章搜尋、RSS(jekyll-feed)、sitemap 全部保留,功能與現狀等價。
- 文案(定位句、自介、故事)一律標「草稿」,經 yazelin 核可才定稿;禁用詞黑名單適用(含「接住」);不用 emoji;正體中文。
- 重圖(>100KB)走 `https://cdn.jsdelivr.net/gh/yazelin/yazelin.github.io@master/<path>`;資產連結不加 cache-busting 參數。
- 不引入 webfont;字型用系統 stack。強調色 `#047857`(emerald,與 mori-sprite-studio landing 同族)。
- 不做:寄信、會員、金流、深色模式(此輪)。
- Blog 文章內裸 URL 要 `<...>` 包才會 autolink(Jekyll kramdown)——文案任務注意。
- commit 訊息附 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。

## File Structure

```
yazelin.github.io/
├── _config.yml                  # 改:移除 remote_theme、paginate_path、navbar 資料化
├── _layouts/
│   ├── default.html             # 新:骨架(head/nav/footer)
│   ├── page.html                # 新:一般頁(about/tags/404/workshop/portfolio)
│   ├── post.html                # 新:文章頁(giscus/相關文章/CTA/TOC)
│   └── home.html                # 新:/blog 列表(paginator+搜尋)
├── _includes/
│   ├── head-custom.html         # 留(JSON-LD)
│   ├── nav.html                 # 新
│   ├── footer.html              # 新(三件套+email/yt)
│   ├── signup-form.html         # 新(訂閱表單,可重複 include)
│   └── giscus.html              # 新
├── assets/css/site.css          # 新:全站樣式(design tokens)
├── assets/js/blog-search.js     # 新:/blog 客戶端搜尋
├── search.json                  # 新:搜尋索引(Liquid 產生)
├── index.html                   # 改:landing(hero/作品牆/故事/精選/CTA)
├── blog/index.html              # 新:文章列表(原首頁功能)
├── images/portfolio/*.webp      # 新:作品牆截圖
└── docs/superpowers/plans/...   # 本檔

k-rider/worker/src/signup.js     # 改:source 白名單加 'blog'
```

---

### Task 1: k-rider-api Worker 接受 source "blog"

**Files:**
- Modify: `/home/ct/k-rider/worker/src/signup.js:28`
- Test: `/home/ct/k-rider/tests/`(先看既有測試怎麼寫,若無 signup 測試則跳過新增,以線上 curl 驗證為準)

**Interfaces:**
- Produces: `POST https://k-rider-api.yazelinj303.workers.dev/api/signup`,body `{ email, company, source: "blog" }`,回 `{ ok: true, already: boolean, gift }`。Task 5 的表單依賴這個端點與 `source: "blog"` 被記錄。

- [ ] **Step 1: 讀現有實作與測試**

Read `/home/ct/k-rider/worker/src/signup.js` 全文與 `ls /home/ct/k-rider/tests/`。若 tests 內有 signup 相關測試,加一個 case;若無,不新增測試框架(以 curl 驗證)。

- [ ] **Step 2: 修改白名單**

```js
// signup.js:28 原:
const source = ['result', 'about', 'home'].includes(body.source) ? body.source : null;
// 改:
const source = ['result', 'about', 'home', 'blog'].includes(body.source) ? body.source : null;
```

- [ ] **Step 3: 部署並驗證**

```bash
cd /home/ct/k-rider/worker && npx wrangler deploy
curl -s -X POST https://k-rider-api.yazelinj303.workers.dev/api/signup \
  -H 'content-type: application/json' -H 'Origin: https://yazelin.github.io' \
  -d '{"email":"plan-test-blog@example.com","company":"","source":"blog"}'
```
Expected: `{"ok":true,...}`。再用 admin 端點(`Authorization: Bearer $ADMIN_TOKEN`)確認該列 `source` 為 `blog`(token 在 wrangler secret,查法:問 yazelin 或用 `npx wrangler d1 execute k-rider-signups --remote --command "SELECT email,source FROM signups ORDER BY id DESC LIMIT 3"`)。驗完刪測試列:`DELETE FROM signups WHERE email='plan-test-blog@example.com'`。

- [ ] **Step 4: Commit(k-rider repo,直接推 main 或按該 repo 慣例開 PR)**

```bash
cd /home/ct/k-rider && git add worker/src/signup.js && git commit -m "feat(signup): accept source 'blog' for blog rebrand funnel

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 移除主題、建立 default/page layouts 與 CSS(站能 build、一般頁能看)

**Files:**
- Modify: `_config.yml`
- Create: `_layouts/default.html`, `_layouts/page.html`, `_includes/nav.html`, `_includes/footer.html`, `assets/css/site.css`
- Branch: `git checkout -b rebrand`(本 task 起所有 blog repo 變更都在此 branch)

**Interfaces:**
- Produces: `default.html` 接受 `page.title`;`page.html` 供 about/tags/404/workshop/portfolio 沿用(`layout: page` 不用改文章檔);CSS custom properties `--accent/--fg/--bg/--muted/--border` 供後續 task 使用;`_config.yml` 新增 `navbar` list 供 nav.html 迭代。

- [ ] **Step 1: 開 branch,改 _config.yml**

移除 `remote_theme`、`avatar/round-avatar`、`navbar-links`、`share-links-active`、`post_search`、`excerpt_length`(Beautiful Jekyll 專屬鍵);保留 title/author/description/url/markdown/timezone/plugins/feed 設定/giscus 區塊/defaults/exclude。加:

```yaml
paginate: 10
paginate_path: "/blog/page:num/"

navbar:
  - title: Blog
    url: /blog/
  - title: About
    url: /about/
  - title: Portfolio
    url: /portfolio/
  - title: Workshop
    url: /workshop/
  - title: Tags
    url: /tags/
```

(Projects 下拉選單捨棄——作品改由首頁作品牆呈現;此為刻意簡化。)

- [ ] **Step 2: 寫 default.html**

```html
<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{% if page.title %}{{ page.title }} — {{ site.title }}{% else %}{{ site.title }}{% endif %}</title>
  <meta name="description" content="{{ page.share-description | default: page.subtitle | default: page.excerpt | default: site.description | strip_html | truncate: 150 }}">
  <link rel="canonical" href="{{ page.url | absolute_url }}">
  <meta property="og:title" content="{{ page.title | default: site.title }}">
  <meta property="og:description" content="{{ page.share-description | default: page.subtitle | default: site.description | strip_html | truncate: 150 }}">
  <meta property="og:url" content="{{ page.url | absolute_url }}">
  <meta property="og:type" content="{% if page.layout == 'post' %}article{% else %}website{% endif %}">
  {% if page.cover %}<meta property="og:image" content="{{ page.cover }}">{% endif %}
  <link rel="icon" href="{{ site.avatar }}">
  <link rel="alternate" type="application/rss+xml" title="{{ site.title }}" href="{{ '/feed.xml' | absolute_url }}">
  <link rel="stylesheet" href="{{ '/assets/css/site.css' | relative_url }}">
  {% include head-custom.html %}
</head>
<body>
  {% include nav.html %}
  <main>{{ content }}</main>
  {% include footer.html %}
</body>
</html>
```

- [ ] **Step 3: 寫 nav.html 與 footer.html**

```html
<!-- _includes/nav.html -->
<header class="site-nav">
  <a class="brand" href="{{ '/' | relative_url }}">{{ site.title }}</a>
  <nav>
    {% for item in site.navbar %}
    <a href="{{ item.url | relative_url }}"{% if page.url == item.url %} class="active"{% endif %}>{{ item.title }}</a>
    {% endfor %}
  </nav>
</header>
```

```html
<!-- _includes/footer.html -->
<footer class="site-footer">
  <div class="footer-links">
    <a href="https://github.com/yazelin">GitHub</a>
    <a href="https://www.facebook.com/yazelinj303">Facebook</a>
    <a href="https://buymeacoffee.com/yazelin">Buy Me a Coffee</a>
    <a href="https://www.youtube.com/@yazelin">YouTube</a>
    <a href="mailto:{{ site.social-network-links.email | default: 'yaze.lin.j303@gmail.com' }}">Email</a>
  </div>
  <p class="footer-note">© {{ site.time | date: "%Y" }} 林亞澤 Yaze — <a href="{{ '/feed.xml' | relative_url }}">RSS</a></p>
</footer>
```

(FB/BMC 實際網址以 yazelin 現有三件套為準——實作時 grep 任一公開專案 README footer 取正確 URL,不要用上面猜的。)

- [ ] **Step 4: 寫 page.html 與 site.css**

```html
<!-- _layouts/page.html -->
---
layout: default
---
<article class="page container">
  <h1>{{ page.title }}</h1>
  {{ content }}
</article>
```

`assets/css/site.css`(完整檔;design tokens + 全站基礎 + 之後 task 會用到的 landing/blog/post 區塊都先放齊):

```css
:root {
  --fg: #1c1917; --muted: #6b6560; --bg: #fdfcfa; --card: #ffffff;
  --border: #e8e5e1; --accent: #047857; --accent-weak: #ecfdf5;
  --maxw: 46rem; --maxw-wide: 68rem;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0; background: var(--bg); color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans TC", "Microsoft JhengHei", sans-serif;
  line-height: 1.75; font-size: 17px; letter-spacing: 0.01em;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
img { max-width: 100%; height: auto; }
h1, h2, h3 { line-height: 1.3; letter-spacing: 0.02em; }
code { background: var(--accent-weak); padding: 0.15em 0.4em; border-radius: 4px; font-size: 0.9em; }
pre { background: #1c1917; color: #e8e5e1; padding: 1rem 1.25rem; border-radius: 8px; overflow-x: auto; line-height: 1.6; }
pre code { background: none; padding: 0; color: inherit; }
blockquote { margin: 1.5rem 0; padding: 0.5rem 1.25rem; border-left: 3px solid var(--accent); background: var(--accent-weak); border-radius: 0 8px 8px 0; }
.container { max-width: var(--maxw); margin: 0 auto; padding: 0 1.25rem; }
.container-wide { max-width: var(--maxw-wide); margin: 0 auto; padding: 0 1.25rem; }

/* nav */
.site-nav { display: flex; justify-content: space-between; align-items: center; max-width: var(--maxw-wide); margin: 0 auto; padding: 1rem 1.25rem; }
.site-nav .brand { font-weight: 700; font-size: 1.1rem; color: var(--fg); }
.site-nav nav { display: flex; gap: 1.25rem; flex-wrap: wrap; }
.site-nav nav a { color: var(--muted); font-size: 0.95rem; }
.site-nav nav a.active, .site-nav nav a:hover { color: var(--accent); text-decoration: none; }

/* footer */
.site-footer { border-top: 1px solid var(--border); margin-top: 4rem; padding: 2rem 1.25rem 3rem; text-align: center; }
.footer-links { display: flex; gap: 1.5rem; justify-content: center; flex-wrap: wrap; margin-bottom: 0.75rem; }
.footer-links a { color: var(--muted); font-size: 0.95rem; }
.footer-note { color: var(--muted); font-size: 0.85rem; margin: 0; }

/* page & post */
.page, .post { padding-top: 1.5rem; }
.post-header h1 { margin-bottom: 0.25rem; }
.post-meta { color: var(--muted); font-size: 0.9rem; margin-bottom: 2rem; }
.post-meta a { color: var(--muted); }
.post-tags { margin-top: 2.5rem; display: flex; gap: 0.5rem; flex-wrap: wrap; }
.post-tags a, .tag-chip { background: var(--accent-weak); color: var(--accent); padding: 0.1em 0.7em; border-radius: 999px; font-size: 0.85rem; }
.related { border-top: 1px solid var(--border); margin-top: 3rem; padding-top: 1.5rem; }
.related h2 { font-size: 1.1rem; }
.related ul { padding-left: 1.2rem; }

/* blog list */
.post-list { list-style: none; padding: 0; }
.post-list li { border-bottom: 1px solid var(--border); padding: 1.5rem 0; }
.post-list h2 { margin: 0 0 0.35rem; font-size: 1.3rem; }
.post-list h2 a { color: var(--fg); }
.post-list h2 a:hover { color: var(--accent); }
.post-list .excerpt { color: var(--muted); margin: 0.25rem 0 0.5rem; }
.post-list .meta { color: var(--muted); font-size: 0.85rem; }
.pagination { display: flex; justify-content: space-between; padding: 2rem 0; }
#blog-search { width: 100%; padding: 0.6rem 1rem; font-size: 1rem; border: 1px solid var(--border); border-radius: 8px; margin: 1rem 0; background: var(--card); }

/* landing */
.hero { text-align: center; padding: 4.5rem 1.25rem 3.5rem; }
.hero h1 { font-size: clamp(1.8rem, 4.5vw, 2.8rem); max-width: 34ch; margin: 0 auto 1rem; }
.hero .sub { color: var(--muted); font-size: 1.1rem; max-width: 52ch; margin: 0 auto 2rem; }
.section { padding: 3.5rem 0; }
.section-title { text-align: center; font-size: 1.6rem; margin-bottom: 0.5rem; }
.section-lead { text-align: center; color: var(--muted); margin: 0 auto 2.5rem; max-width: 52ch; }
.work-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.25rem; }
.work-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; transition: transform 0.15s, box-shadow 0.15s; }
.work-card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,0.08); text-decoration: none; }
.work-card img { display: block; width: 100%; aspect-ratio: 16/10; object-fit: cover; border-bottom: 1px solid var(--border); }
.work-card .body { padding: 0.9rem 1.1rem 1.1rem; }
.work-card h3 { margin: 0 0 0.25rem; font-size: 1.05rem; color: var(--fg); }
.work-card p { margin: 0; color: var(--muted); font-size: 0.9rem; line-height: 1.5; }
.story { background: var(--accent-weak); border-radius: 16px; padding: 2.5rem 2rem; }
.story p { max-width: var(--maxw); margin: 0 auto 1rem; }
.featured-list { list-style: none; padding: 0; max-width: var(--maxw); margin: 0 auto; }
.featured-list li { padding: 0.9rem 0; border-bottom: 1px solid var(--border); }
.featured-list a { font-size: 1.1rem; }
.featured-list .why { color: var(--muted); font-size: 0.9rem; margin: 0.15rem 0 0; }

/* signup */
.signup { max-width: 30rem; margin: 0 auto; text-align: center; }
.signup form { display: flex; gap: 0.5rem; margin-top: 1rem; }
.signup input[type=email] { flex: 1; padding: 0.65rem 1rem; border: 1px solid var(--border); border-radius: 8px; font-size: 1rem; }
.signup button { background: var(--accent); color: #fff; border: 0; border-radius: 8px; padding: 0.65rem 1.4rem; font-size: 1rem; cursor: pointer; }
.signup button:hover { filter: brightness(1.1); }
.signup .msg { min-height: 1.5rem; font-size: 0.9rem; color: var(--accent); margin-top: 0.5rem; }
.signup .hp { position: absolute; left: -9999px; }

@media (max-width: 640px) {
  .site-nav { flex-direction: column; gap: 0.5rem; }
  .hero { padding: 3rem 1.25rem 2.5rem; }
  .signup form { flex-direction: column; }
}
```

- [ ] **Step 5: 本機 build 驗證**

```bash
cd /home/ct/yazelin.github.io && bundle install && bundle exec jekyll serve --port 4400 &
curl -s http://localhost:4400/about/ | grep -c "site-nav"
```
Expected: build 成功、about 頁有新 nav。若 `bundle` 環境有問題,改用 `gem install jekyll jekyll-paginate jekyll-feed jekyll-sitemap` 后 `jekyll serve`;都不行就以 branch push 到 GitHub 讓 Pages build,用線上 preview 驗(pages 只認 master,則暫時用 `Actions` 觀察 build 結果——實作者擇一,但必須真的看到 build 成功)。
注意:此時首頁(index.html `layout: home`)會壞——home layout 到 Task 4 才建,本 task 只驗 page 類頁面。

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(theme): 移除 Beautiful Jekyll,自建 default/page layouts 與全站樣式

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: post layout(giscus/相關文章/文末 CTA/TOC)

**Files:**
- Create: `_layouts/post.html`, `_includes/giscus.html`, `_includes/signup-form.html`

**Interfaces:**
- Consumes: Task 2 的 default layout 與 CSS class(`.post/.post-meta/.post-tags/.related/.signup`)。
- Produces: `signup-form.html` 接受 `include.source`(字串,預設 `blog`),Task 5 首頁重用。

- [ ] **Step 1: 寫 signup-form.html**

```html
<div class="signup">
  <h3>訂閱電子報</h3>
  <p class="section-lead">甲方思維、AI 發包實戰、新作品上線通知。不灌水。</p>
  <form data-signup data-source="{{ include.source | default: 'blog' }}">
    <input type="email" name="email" placeholder="you@example.com" required>
    <input type="text" name="company" class="hp" tabindex="-1" autocomplete="off">
    <button type="submit">訂閱</button>
  </form>
  <p class="msg" aria-live="polite"></p>
</div>
<script>
document.querySelectorAll('form[data-signup]').forEach(function (f) {
  if (f.dataset.bound) return; f.dataset.bound = '1';
  f.addEventListener('submit', async function (e) {
    e.preventDefault();
    var msg = f.parentElement.querySelector('.msg');
    msg.textContent = '送出中…';
    try {
      var r = await fetch('https://k-rider-api.yazelinj303.workers.dev/api/signup', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: f.email.value, company: f.company.value, source: f.dataset.source })
      });
      var d = await r.json();
      msg.textContent = d.ok ? (d.already ? '這個 email 已經訂閱過了。' : '訂閱成功,之後見。') : '出了點問題,再試一次。';
      if (d.ok && !d.already) f.reset();
    } catch (err) { msg.textContent = '網路怪怪的,稍後再試。'; }
  });
});
</script>
```

- [ ] **Step 2: 寫 giscus.html(值全部從 _config.yml 的 giscus 區塊來)**

```html
{% if page.comments and site.giscus.repository %}
<div class="giscus-wrap related">
<script src="https://{{ site.giscus.hostname }}/client.js"
  data-repo="{{ site.giscus.repository }}"
  data-repo-id="{{ site.giscus.repository-id }}"
  data-category="{{ site.giscus.category }}"
  data-category-id="{{ site.giscus.category-id }}"
  data-mapping="{{ site.giscus.mapping }}"
  data-reactions-enabled="{{ site.giscus.reactions-enabled }}"
  data-emit-metadata="{{ site.giscus.emit-metadata }}"
  data-theme="{{ site.giscus.theme }}"
  data-lang="zh-TW" crossorigin="anonymous" async></script>
</div>
{% endif %}
```

- [ ] **Step 3: 寫 post.html**

```html
---
layout: default
---
<article class="post container">
  <header class="post-header">
    <h1>{{ page.title }}</h1>
    {% if page.subtitle %}<p class="section-lead" style="text-align:left">{{ page.subtitle }}</p>{% endif %}
    <p class="post-meta">{{ page.date | date: "%Y-%m-%d" }}{% if page.author %} · {{ page.author }}{% endif %}</p>
  </header>

  {{ content }}

  {% if page.tags.size > 0 %}
  <div class="post-tags">
    {% for tag in page.tags %}<a href="{{ '/tags/' | relative_url }}#{{ tag }}">{{ tag }}</a>{% endfor %}
  </div>
  {% endif %}

  {% assign related = "" | split: "" %}
  {% for p in site.posts %}
    {% if p.url != page.url and related.size < 3 %}
      {% assign common = p.tags | where_exp: "t", "page.tags contains t" %}
      {% if common.size > 0 %}{% assign related = related | push: p %}{% endif %}
    {% endif %}
  {% endfor %}
  {% if related.size > 0 %}
  <aside class="related">
    <h2>相關文章</h2>
    <ul>{% for p in related %}<li><a href="{{ p.url | relative_url }}">{{ p.title }}</a></li>{% endfor %}</ul>
  </aside>
  {% endif %}

  <div class="related">{% include signup-form.html source="post" %}</div>
  {% include giscus.html %}
</article>
```

注意:`source="post"` 需回 Task 1 把 `'post'` 一併加進白名單——實作 Task 1 時白名單直接寫 `['result','about','home','blog','post']`。
TOC:kramdown 已支援,長文由文章自行加 `* toc\n{:toc}`,不做 JS 自動 TOC(刻意簡化,YAGNI)。

- [ ] **Step 4: 本機驗證三篇代表文章**

```bash
curl -s http://localhost:4400/ai/2026/07/15/taigi-hakka-dictionaries.html | grep -c "giscus\|post-tags"
curl -s http://localhost:4400/2015/11/03/icemore.html | head -5
```
Expected: 新舊文章都渲染、URL 與現行線上一致(先 `curl -sI https://yazelin.github.io/...` 對照現行 URL 再驗本機同 path)、giscus script 有出現、相關文章有列出。無 categories 的舊文 path 不含 category 段——以線上現況為準逐篇對照。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(post): 文章版型——giscus/相關文章/訂閱 CTA

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: /blog 列表(分頁+搜尋)與 tags 頁沿用

**Files:**
- Create: `blog/index.html`, `_layouts/home.html`(可直接把列表寫在 blog/index.html、不建 home layout——擇一,以簡為準), `search.json`, `assets/js/blog-search.js`

**Interfaces:**
- Consumes: `_config.yml` 的 `paginate: 10`、`paginate_path: "/blog/page:num/"`(Task 2 已設)。
- Produces: `/blog/` 分頁列表 + 即時搜尋;`/search.json` 索引(title/url/date/tags)。

- [ ] **Step 1: 寫 blog/index.html**

```html
---
layout: default
title: Blog
permalink: /blog/
---
<div class="container">
  <h1>Blog</h1>
  <input id="blog-search" type="search" placeholder="搜尋文章標題或 tag…" autocomplete="off">
  <ul class="post-list" id="post-list">
    {% for post in paginator.posts %}
    <li>
      <h2><a href="{{ post.url | relative_url }}">{{ post.title }}</a></h2>
      {% if post.subtitle %}<p class="excerpt">{{ post.subtitle | truncate: 120 }}</p>{% endif %}
      <p class="meta">{{ post.date | date: "%Y-%m-%d" }}{% if post.tags.size > 0 %} · {{ post.tags | join: ", " | truncate: 60 }}{% endif %}</p>
    </li>
    {% endfor %}
  </ul>
  <ul class="post-list" id="search-results" hidden></ul>
  <nav class="pagination">
    {% if paginator.previous_page %}<a href="{{ paginator.previous_page_path | relative_url }}">← 較新文章</a>{% else %}<span></span>{% endif %}
    {% if paginator.next_page %}<a href="{{ paginator.next_page_path | relative_url }}">較舊文章 →</a>{% endif %}
  </nav>
</div>
<script src="{{ '/assets/js/blog-search.js' | relative_url }}"></script>
```

(jekyll-paginate 需要 paginator 所在檔為 `blog/index.html` 且 `paginate_path` 指向 `/blog/page:num/`——兩者 Task 2 已就位。若 build 後 paginator 為空,把 front matter 的 `permalink` 拿掉再試,jekyll-paginate v1 對 permalink + paginator 並用有已知怪癖。)

- [ ] **Step 2: 寫 search.json 與 blog-search.js**

```liquid
---
layout: null
permalink: /search.json
---
[{% for post in site.posts %}{"title":{{ post.title | jsonify }},"url":{{ post.url | relative_url | jsonify }},"date":"{{ post.date | date: '%Y-%m-%d' }}","tags":{{ post.tags | join: " " | jsonify }}}{% unless forloop.last %},{% endunless %}{% endfor %}]
```

```js
// assets/js/blog-search.js
(async function () {
  const input = document.getElementById('blog-search');
  const list = document.getElementById('post-list');
  const out = document.getElementById('search-results');
  const pagination = document.querySelector('.pagination');
  let idx = null;
  input.addEventListener('input', async function () {
    const q = input.value.trim().toLowerCase();
    if (!q) { out.hidden = true; list.hidden = false; pagination.hidden = false; return; }
    if (!idx) idx = await (await fetch('/search.json')).json();
    const hits = idx.filter(p => (p.title + ' ' + p.tags).toLowerCase().includes(q)).slice(0, 30);
    out.innerHTML = hits.map(p =>
      `<li><h2><a href="${p.url}">${p.title}</a></h2><p class="meta">${p.date}</p></li>`
    ).join('') || '<li><p class="meta">沒有符合的文章。</p></li>';
    out.hidden = false; list.hidden = true; pagination.hidden = true;
  });
})();
```

- [ ] **Step 3: 驗證分頁與搜尋**

```bash
curl -s http://localhost:4400/blog/ | grep -c "post-list"
curl -s http://localhost:4400/blog/page2/ | grep -c "post-list"
curl -s http://localhost:4400/search.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d))"
```
Expected: 兩頁都有列表、search.json 有 205 筆。瀏覽器開 /blog/ 打「台語」確認即時搜尋出現該篇。tags 頁 `curl -s http://localhost:4400/tags/ | grep -c tag` 仍正常(它用 layout: page,Task 2 已覆蓋)。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(blog): /blog 分頁列表+客戶端搜尋,tags 頁沿用新版型

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 作品牆截圖素材

**Files:**
- Create: `images/portfolio/{ai-chant-magic,ctos,k-rider,roll-formosa,taigi,sprite-studio,fish-cv,jaba}.webp`
- Create: `scripts/portfolio-shots.mjs`(Playwright 截圖腳本,留在 repo 供日後更新)

**Interfaces:**
- Produces: 8 張 16:10 截圖 webp(每張 <150KB),Task 6 的作品卡片以 jsDelivr URL 引用:`https://cdn.jsdelivr.net/gh/yazelin/yazelin.github.io@master/images/portfolio/<name>.webp`。

- [ ] **Step 1: 確認 8 個作品的線上 URL 都活著**

```bash
for u in https://yazelin.github.io/ai-chant-magic/ https://yazelin.github.io/k-rider/ https://yazelin.github.io/roll-formosa/ https://yazelin.github.io/mandarin-taigi/ https://yazelin.github.io/mori-sprite-studio/; do curl -s -o /dev/null -w "%{http_code} $u\n" $u; done
```
CTOS/魚苗/呷爸沒有公開網頁——這三個用 blog 文章內既有的 GitHub Releases 圖(找該篇文章第一張圖的 URL 下載轉 webp),不截圖。

- [ ] **Step 2: 寫截圖腳本並執行**

```js
// scripts/portfolio-shots.mjs
import { chromium } from 'playwright';
const shots = [
  ['ai-chant-magic', 'https://yazelin.github.io/ai-chant-magic/'],
  ['k-rider', 'https://yazelin.github.io/k-rider/'],
  ['roll-formosa', 'https://yazelin.github.io/roll-formosa/'],
  ['taigi', 'https://yazelin.github.io/mandarin-taigi/'],
  ['sprite-studio', 'https://yazelin.github.io/mori-sprite-studio/'],
];
const b = await chromium.launch({ channel: 'chrome' });
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
for (const [name, url] of shots) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500); // 等動畫/canvas 進場
  await page.screenshot({ path: `images/portfolio/${name}.png` });
  console.log(name, 'done');
}
await b.close();
```

```bash
cd /home/ct/yazelin.github.io && mkdir -p images/portfolio && node scripts/portfolio-shots.mjs
python3 - <<'EOF'
from PIL import Image; import glob, os
for f in glob.glob('images/portfolio/*.png'):
    Image.open(f).convert('RGB').save(f[:-4]+'.webp', quality=82, method=6); os.remove(f)
    print(f, os.path.getsize(f[:-4]+'.webp')//1024, 'KB')
EOF
```
Expected: 每張 <150KB;超過就降 quality 到 75 重轉。人工看一眼每張圖不是空白/載入中畫面(canvas 類站要真的有畫面)。

- [ ] **Step 3: Commit**

```bash
git add images/portfolio scripts/portfolio-shots.mjs && git commit -m "assets: 作品牆截圖(webp)+截圖腳本

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 首頁 landing(文案全部標草稿)

**Files:**
- Modify: `index.html`(整檔重寫)
- Modify: 4–6 篇精選文章 front matter 加 `featured: true` + `featured-why: "一句話"`

**Interfaces:**
- Consumes: Task 2 CSS(hero/work-grid/story/featured-list/signup)、Task 3 `signup-form.html`、Task 5 截圖。
- Produces: 完整 landing;文案以 HTML 註解標 `<!-- 草稿:待核可 -->`。

- [ ] **Step 1: 挑精選文章並加旗標**

從甲方思維/AI 發包相關文章挑 4–6 篇(用 `grep -l "甲方思維" _posts/*.md` 起手,加上咏唱魔法 index、台語辭典篇),front matter 加:

```yaml
featured: true
featured-why: "為什麼值得讀的一句話"
```

- [ ] **Step 2: 重寫 index.html**

```html
---
layout: default
title: null
share-description: 林亞澤 Yaze — 甲方思維:不寫程式也能把軟體做出來。工業自動化 10+ 年轉 AI 應用,一個人 + AI 維護 30+ 個活躍專案。
head-extra:
  - head-custom.html
---
<!-- 文案草稿:全部待 yazelin 逐句核可 -->
<section class="hero">
  <h1>不寫程式,也能把軟體做出來</h1>
  <p class="sub">我用「甲方思維」驅動 AI 開發:開規格、下發包、做驗收。工業自動化 10+ 年,現在一個人 + AI 同時維護 30+ 個上線專案——這個網站會教你同一套方法。</p>
  {% include signup-form.html source="blog" %}
</section>

<section class="section container-wide" id="work">
  <h2 class="section-title">上線的作品,不是 demo</h2>
  <p class="section-lead">每一個都可以點進去用。這是「AI 發包法」的產出證明。</p>
  <div class="work-grid">
    <a class="work-card" href="https://yazelin.github.io/ai-chant-magic/">
      <img src="https://cdn.jsdelivr.net/gh/yazelin/yazelin.github.io@master/images/portfolio/ai-chant-magic.webp" alt="真AI咏唱魔法" loading="lazy">
      <div class="body"><h3>真AI咏唱魔法</h3><p>對麥克風唸咒語,AI 即時生成魔法效果的生存遊戲。</p></div>
    </a>
    <!-- 其餘 7 張卡片同構:ctos / k-rider / roll-formosa / taigi / sprite-studio / fish-cv / jaba,
         標題與一句話說明照下表,連結:有站連站、沒站連 blog 該篇文章 -->
  </div>
</section>

<section class="section container-wide">
  <div class="story">
    <h2 class="section-title">從工廠到 AI</h2>
    <p>我在工業自動化做了十幾年:機器人、視覺檢測、AGV 車隊。工業現場預算有限,習慣了用軟體取代昂貴的感測器、用不一樣的解法把事情做成。</p>
    <p>2024 年起我把同一套「發包給供應商」的功夫,原封不動用在 AI 身上——結果是一個人維護 30+ 個活躍專案。這套方法不需要你會寫程式,需要你會當一個好甲方。</p>
    <p style="text-align:center"><a href="{{ '/about/' | relative_url }}">完整的故事 →</a></p>
  </div>
</section>

<section class="section container">
  <h2 class="section-title">從這幾篇開始讀</h2>
  <ul class="featured-list">
    {% assign feats = site.posts | where: "featured", true %}
    {% for p in feats %}
    <li><a href="{{ p.url | relative_url }}">{{ p.title }}</a><p class="why">{{ p.featured-why }}</p></li>
    {% endfor %}
  </ul>
  <p style="text-align:center"><a href="{{ '/blog/' | relative_url }}">全部 {{ site.posts | size }} 篇文章 →</a></p>
</section>

<section class="section container">{% include signup-form.html source="blog" %}</section>
```

作品卡片文字(草稿,一併待核可):

| name | 標題 | 一句話 | 連結 |
|---|---|---|---|
| ai-chant-magic | 真AI咏唱魔法 | 對麥克風唸咒語,AI 即時判定的生存遊戲 | 站 |
| ctos | ChingTech OS | 中小製造業的 AI 企業系統,商用中 | blog 文 |
| k-rider | K-Rider K線騎手 | 用真實股價 K 線玩的騎乘遊戲 | 站 |
| roll-formosa | Roll Formosa | 把台灣街景滾成一顆球的遊戲 | 站 |
| taigi | 台語/客語辭典 | 兩天長出兩本教育部資料離線辭典 | 站 |
| sprite-studio | Mori Sprite Studio | 一張圖生成完整角色動畫包的工具 | 站 |
| fish-cv | 魚苗計數系統 | 用視覺 AI 數魚苗,取代人工點數 | blog 文 |
| jaba | 呷爸 Jaba | 公司訂便當 LINE Bot,天天在用 | blog 文 |

- [ ] **Step 3: 本機驗證**

瀏覽器開 http://localhost:4400/ :四屏都渲染、8 張卡片圖有出來、精選文章列表非空、兩個訂閱表單都能打 API(打一筆測試 email 後從 D1 刪除)。iPhone 13 viewport(Playwright `devices['iPhone 13']` + `channel:'chrome'` + `.tap()`)確認不破版。

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(landing): 首頁改個人品牌 landing(文案草稿待核可)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: 文案核可關卡(HARD GATE:需 yazelin 逐句拍板)

**Files:**
- Modify: `index.html`(依核可結果修文案)、精選文章 front matter(`featured-why`)

- [ ] **Step 1: 把所有草稿文案整理成清單端給 yazelin**

定位句、副標、三個 section 標題與 lead、8 張卡片的標題+一句話、故事兩段、訂閱表單文案、精選文章的 featured-why。逐句列出,等回覆。**沒核可不得進 Task 8。**

- [ ] **Step 2: 依回覆修改、檢查禁用詞**

```bash
grep -rn "接住" index.html _includes/ && echo "FAIL: 禁用詞" || echo OK
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "copy: 首頁文案定稿(yazelin 核可)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: 驗收與上線(merge 前全部過)

**Files:**
- 無新檔;驗收 + merge `rebrand` → `master`

- [ ] **Step 1: 舊網址抽驗(本機 build 對照線上)**

```bash
# 線上抓 10 個現行 URL(含 2011 最舊與 2026 最新), 本機同 path 必須 200
for p in $(curl -s https://yazelin.github.io/sitemap.xml | grep -o '<loc>[^<]*' | sed 's/<loc>//;s|https://yazelin.github.io||' | shuf -n 10); do
  curl -s -o /dev/null -w "%{http_code} $p\n" "http://localhost:4400$p"; done
```
Expected: 全部 200(landing 換掉的舊首頁分頁 /page2 等除外——那些由 /blog/page2/ 取代,301 無法做,GitHub Pages 不支援,可接受:舊分頁 URL 本來就不該被外部引用;sitemap 會更新)。

- [ ] **Step 2: 功能等價檢查**

```bash
curl -s http://localhost:4400/feed.xml | head -5          # RSS
curl -s http://localhost:4400/sitemap.xml | grep -c "<loc>"  # sitemap
curl -s http://localhost:4400/tags/ | grep -c "tag"          # tags
curl -s http://localhost:4400/404.html | grep -c "找不到"     # 404
```

- [ ] **Step 3: 行動版 + Lighthouse**

Playwright iPhone 13 走首頁四屏截圖人工看;`mcp chrome-devtools lighthouse_audit` 對本機首頁,performance 分數記錄下來(基準:不低於改版前線上首頁——先對線上跑一次留數字)。

- [ ] **Step 4: giscus 冒煙**

本機或 push 後線上開任一篇文章,giscus iframe 有載入(giscus 認 pathname,本機 localhost 不一定能載——線上驗)。

- [ ] **Step 5: Merge 上線與線上複驗**

```bash
git checkout master && git merge --no-ff rebrand -m "feat: 個人品牌主站改版上線

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" && git push
# 等 Pages 部署後:
for p in / /blog/ /about/ /tags/ /ai/2026/07/15/taigi-hakka-dictionaries.html; do
  curl -s -o /dev/null -w "%{http_code} $p\n" "https://yazelin.github.io$p"; done
```
Expected: 全 200;線上再開首頁確認訂閱表單真的寫進 D1(打一筆再刪)。giscus 線上驗。README 若描述舊主題,一併更新。

---

### Task 9(後續、不擋上線): About 轉型敘事重寫

- 素材:`~/mori-universe/yaze-journal/projects/portfolio-resume/resume-facts.md` + 現有 about.md。
- 產出重寫稿(人-AI 分工署名原則適用),端給 yazelin 逐段核可後才上。
- Lead magnet(甲方思維入門 checklist)同為後續另案,不在本 plan。

## Self-Review 紀錄

- Spec 覆蓋:定位三屏(Task 6)、技術路線與硬限制(Task 2–4)、email 漏斗(Task 1/3)、footer 三件套+SHOPLINE 備註(Task 2,SHOPLINE 是未來事不建任務)、驗收六條(Task 8;第 4 條「10 秒測驗」在 Task 7 文案關卡由 yazelin 自查)、About 敘事(Task 9)。
- 型別/名稱一致:`signup-form.html` 的 `include.source` 與 Task 1 白名單(`blog`/`post`)對齊;CSS class 名 Task 2 定義、Task 3/4/6 使用一致;jsDelivr path 用 `@master`(本 repo 預設分支是 master 非 main)。
- 已知風險:jekyll-paginate v1 + blog/index.html 的 permalink 並用怪癖(Task 4 Step 1 已註記對策);giscus 本機驗不了(Task 8 Step 4 線上驗)。
