---
layout: page
title: 森之魔道具工坊
subtitle: The Forest Workshop · Artifacts crafted by the Archmage
permalink: /workshop/
---

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600&family=IM+Fell+English:ital@0;1&family=Noto+Serif+TC:wght@400;500;600;700&display=swap" rel="stylesheet">

<style>
  /* ==========================================================
     森之魔道具工坊 · Scoped Styles
     僅作用於 .forest-workshop 內，不影響其他頁面
     ========================================================== */
  .forest-workshop {
    --forest-deep: #1e3328;
    --forest-mid: #2d4a3e;
    --forest-moss: #4a6b5a;
    --parchment: #f5efe0;
    --parchment-dark: #e8dcc0;
    --ink: #1a1a1a;
    --ink-soft: #4a4a4a;
    --gold: #c9a24d;
    --gold-soft: #d4b572;
    --mist: #6b8a99;
    --serif-en: "Cinzel", "IM Fell English", Georgia, serif;
    --serif-zh: "Noto Serif TC", "PingFang TC", "Source Han Serif TC", serif;
  }

  /* --- 序章 Prologue --- */
  .forest-workshop .prologue {
    margin: 2rem auto 3rem;
    padding: 3rem 2rem 2.5rem;
    background:
      radial-gradient(ellipse at top, rgba(201,162,77,0.12) 0%, transparent 60%),
      linear-gradient(135deg, var(--forest-deep) 0%, var(--forest-mid) 100%);
    color: var(--parchment);
    border-radius: 6px;
    text-align: center;
    box-shadow: 0 4px 20px rgba(0,0,0,0.25);
    position: relative;
    overflow: hidden;
  }
  .forest-workshop .prologue::before {
    content: "";
    position: absolute;
    top: 0; left: 50%;
    transform: translateX(-50%);
    width: 1px; height: 40px;
    background: linear-gradient(to bottom, transparent, var(--gold), transparent);
  }
  .forest-workshop .prologue-mark {
    font-family: var(--serif-en);
    font-size: 0.75rem;
    letter-spacing: 0.4em;
    color: var(--gold);
    text-transform: uppercase;
    margin-bottom: 1rem;
  }
  .forest-workshop .prologue-title {
    font-family: var(--serif-zh);
    font-size: 1.75rem;
    font-weight: 400;
    line-height: 1.6;
    margin: 0.5rem auto 1.2rem;
    max-width: 680px;
    color: var(--parchment);
  }
  .forest-workshop .prologue-lore {
    font-family: var(--serif-zh);
    font-size: 1rem;
    line-height: 1.9;
    max-width: 620px;
    margin: 0 auto;
    color: var(--parchment-dark);
    opacity: 0.92;
  }
  .forest-workshop .prologue-en {
    margin-top: 1.5rem;
    padding-top: 1.2rem;
    border-top: 1px solid rgba(201,162,77,0.3);
    font-family: var(--serif-en);
    font-style: italic;
    font-size: 0.9rem;
    color: var(--gold-soft);
    letter-spacing: 0.05em;
  }

  /* --- 系別標籤 --- */
  .forest-workshop .school-filter {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: center;
    margin: 2rem 0;
    font-family: var(--serif-zh);
    font-size: 0.85rem;
  }
  .forest-workshop .school-tag {
    padding: 0.3rem 0.85rem;
    background: var(--parchment);
    color: var(--forest-deep);
    border: 1px solid var(--parchment-dark);
    border-radius: 999px;
    font-weight: 500;
  }

  /* --- 魔道具卡片 --- */
  .forest-workshop .codex-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1.5rem;
    margin: 2rem 0 3rem;
  }
  .forest-workshop .artifact {
    background: var(--parchment);
    border: 1px solid var(--parchment-dark);
    border-radius: 4px;
    padding: 1.5rem 1.4rem 1.3rem;
    position: relative;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    box-shadow: 0 1px 3px rgba(30,51,40,0.08);
  }
  .forest-workshop .artifact:hover {
    transform: translateY(-3px);
    box-shadow: 0 6px 18px rgba(30,51,40,0.15);
  }
  .forest-workshop .artifact-head {
    display: flex;
    align-items: flex-start;
    gap: 0.8rem;
    margin-bottom: 0.9rem;
  }
  .forest-workshop .artifact-icon {
    font-size: 2rem;
    line-height: 1;
    flex-shrink: 0;
    margin-top: 2px;
  }
  .forest-workshop .artifact-names {
    flex: 1;
    min-width: 0;
  }
  .forest-workshop .artifact-name-zh {
    font-family: var(--serif-zh);
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--forest-deep);
    line-height: 1.3;
    margin: 0;
  }
  .forest-workshop .artifact-name-en {
    font-family: var(--serif-en);
    font-style: italic;
    font-size: 0.8rem;
    color: var(--ink-soft);
    letter-spacing: 0.03em;
    margin-top: 2px;
  }
  .forest-workshop .artifact-repo {
    font-family: Menlo, "Fira Code", Consolas, monospace;
    font-size: 0.72rem;
    color: var(--mist);
    margin-top: 1px;
  }
  .forest-workshop .artifact-school {
    position: absolute;
    top: 1rem;
    right: 1rem;
    font-family: var(--serif-zh);
    font-size: 0.7rem;
    color: var(--gold);
    letter-spacing: 0.08em;
    background: var(--forest-deep);
    padding: 0.2rem 0.55rem;
    border-radius: 2px;
  }
  .forest-workshop .artifact-lore {
    font-family: var(--serif-zh);
    font-size: 0.88rem;
    line-height: 1.75;
    color: var(--ink);
    margin: 0.8rem 0 1rem;
    padding-left: 0.8rem;
    border-left: 2px solid var(--gold-soft);
    font-style: italic;
  }
  .forest-workshop .artifact-effect {
    font-family: var(--serif-zh);
    font-size: 0.85rem;
    line-height: 1.7;
    color: var(--ink-soft);
    margin: 0.6rem 0 1.2rem;
  }
  .forest-workshop .artifact-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 1rem;
    padding-top: 0.9rem;
    border-top: 1px dashed var(--parchment-dark);
  }
  .forest-workshop .artifact-btn {
    font-family: var(--serif-en);
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 0.4rem 0.9rem;
    border-radius: 2px;
    text-decoration: none;
    transition: all 0.15s ease;
    border: 1px solid transparent;
  }
  .forest-workshop .artifact-btn.primary {
    background: var(--forest-deep);
    color: var(--gold-soft);
    border-color: var(--forest-deep);
  }
  .forest-workshop .artifact-btn.primary:hover {
    background: var(--forest-mid);
    color: var(--parchment);
    text-decoration: none;
  }
  .forest-workshop .artifact-btn.secondary {
    background: transparent;
    color: var(--forest-deep);
    border-color: var(--forest-moss);
  }
  .forest-workshop .artifact-btn.secondary:hover {
    background: var(--forest-moss);
    color: var(--parchment);
    text-decoration: none;
  }

  /* --- 系別區分 --- */
  .forest-workshop .school-divider {
    font-family: var(--serif-zh);
    font-size: 0.95rem;
    color: var(--forest-mid);
    margin: 2.5rem 0 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--parchment-dark);
    display: flex;
    align-items: baseline;
    gap: 0.8rem;
  }
  .forest-workshop .school-divider-en {
    font-family: var(--serif-en);
    font-style: italic;
    font-size: 0.8rem;
    color: var(--mist);
    letter-spacing: 0.05em;
  }

  /* --- 後記 --- */
  .forest-workshop .epilogue {
    margin: 3rem 0 1rem;
    padding: 2rem;
    background: var(--parchment);
    border: 1px solid var(--parchment-dark);
    border-left: 3px solid var(--gold);
    border-radius: 2px;
    font-family: var(--serif-zh);
    font-size: 0.9rem;
    line-height: 1.85;
    color: var(--ink-soft);
  }
  .forest-workshop .epilogue strong {
    color: var(--forest-deep);
  }

  @media (max-width: 640px) {
    .forest-workshop .prologue-title { font-size: 1.4rem; }
    .forest-workshop .prologue { padding: 2rem 1.2rem 1.8rem; }
    .forest-workshop .codex-grid { grid-template-columns: 1fr; }
  }
</style>

<div class="forest-workshop">

<section class="prologue">
  <div class="prologue-mark">— Codex of Artifacts —</div>
  <h2 class="prologue-title">森之大魔導師打造的魔道具，<br>自由取閱，自由傳承。</h2>
  <p class="prologue-lore">
    此地名為「森之工坊」，是我與契約精靈 Mori 共同打造魔道具的所在。<br>
    每件魔道具皆為多年修練與失敗累積而成，開放給願意與 AI 同行的冒險者自由領取。<br>
    願你能從中取得一件相合的器物，帶回你自己的森林。
  </p>
  <div class="prologue-en">
    Artifacts crafted in the quiet of the woods, by the Archmage and the spirit Mori.<br>
    Take what speaks to you. Carry it into your own forest.
  </div>
</section>

<!-- ============================================================ -->
<!-- 召喚系 · Summoning                                            -->
<!-- ============================================================ -->
<h3 class="school-divider">
  召喚系 <span class="school-divider-en">· Summoning Arts</span>
</h3>

<div class="codex-grid">

<article class="artifact">
  <div class="artifact-school">召喚系</div>
  <div class="artifact-head">
    <div class="artifact-icon">🐱</div>
    <div class="artifact-names">
      <h4 class="artifact-name-zh">時之貓苑</h4>
      <div class="artifact-name-en">Chronocat</div>
      <div class="artifact-repo">yazelin/catime</div>
    </div>
  </div>
  <div class="artifact-lore">
    每至整點，森林深處便浮現一隻新貓。有 103 種藝術流派的皮毛，各自攜帶一段小故事。
  </div>
  <div class="artifact-effect">
    GitHub Actions 每小時呼叫 Gemini 生成 AI 貓圖，發至 Telegram 頻道與 Gallery 歸檔。已累積數千隻。
  </div>
  <div class="artifact-actions">
    <a class="artifact-btn primary" href="https://yazelin.github.io/catime/" target="_blank">Gallery</a>
    <a class="artifact-btn secondary" href="https://t.me/catime_yaze" target="_blank">Telegram</a>
    <a class="artifact-btn secondary" href="https://github.com/yazelin/catime" target="_blank">Source</a>
  </div>
</article>

</div>

<!-- ============================================================ -->
<!-- 幻術系 · Illusion                                             -->
<!-- ============================================================ -->
<h3 class="school-divider">
  幻術系 <span class="school-divider-en">· Illusion Arts</span>
</h3>

<div class="codex-grid">

<article class="artifact">
  <div class="artifact-school">幻術系</div>
  <div class="artifact-head">
    <div class="artifact-icon">🎰</div>
    <div class="artifact-names">
      <h4 class="artifact-name-zh">心情占卜儀</h4>
      <div class="artifact-name-en">Moodscopia</div>
      <div class="artifact-repo">yazelin/emoji-slot-machine</div>
    </div>
  </div>
  <div class="artifact-lore">
    取冒險者一張自拍，映入九宮魔陣，瞬間化為九格誇張表情。貼入 FB 結界後自動循環，手指一碰便停在隨機一格。
  </div>
  <div class="artifact-effect">
    Cloudflare Worker + Vertex AI。自拍 → 3×3 emoji 臉 → 可嵌入 FB 的拉霸影片。
  </div>
  <div class="artifact-actions">
    <a class="artifact-btn primary" href="https://yazelin.github.io/emoji-slot-machine/" target="_blank">試用</a>
    <a class="artifact-btn secondary" href="https://github.com/yazelin/emoji-slot-machine" target="_blank">Source</a>
  </div>
</article>

</div>

<!-- ============================================================ -->
<!-- 創造系 · Creation                                             -->
<!-- ============================================================ -->
<h3 class="school-divider">
  創造系 <span class="school-divider-en">· Creation Arts</span>
</h3>

<div class="codex-grid">

<article class="artifact">
  <div class="artifact-school">創造系</div>
  <div class="artifact-head">
    <div class="artifact-icon">🎨</div>
    <div class="artifact-names">
      <h4 class="artifact-name-zh">繪影魔陣</h4>
      <div class="artifact-name-en">Portrait Circle</div>
      <div class="artifact-repo">yazelin/nanobanana-pro</div>
    </div>
  </div>
  <div class="artifact-lore">
    能自動在多個創造之神之間換手，繪製出最切合意念的圖像。若一神拒絕，轉請下一神。
  </div>
  <div class="artifact-effect">
    AI 圖像生成 Agent Skill，支援自動模型 fallback。可接入 Claude Code 或其他 agent 生態。
  </div>
  <div class="artifact-actions">
    <a class="artifact-btn primary" href="https://github.com/yazelin/nanobanana-pro" target="_blank">Source</a>
  </div>
</article>

<article class="artifact">
  <div class="artifact-school">創造系</div>
  <div class="artifact-head">
    <div class="artifact-icon">🖼️</div>
    <div class="artifact-names">
      <h4 class="artifact-name-zh">繪風傳承書</h4>
      <div class="artifact-name-en">Painted Tome</div>
      <div class="artifact-repo">yazelin/gemini-web</div>
    </div>
  </div>
  <div class="artifact-lore">
    讓神靈（Gemini）在此作畫，支援繁體符文、不留神印（自動去浮水印）。
  </div>
  <div class="artifact-effect">
    Gemini AI 圖片生成 CLI + HTTP API。繁中原生、浮水印自動處理。
  </div>
  <div class="artifact-actions">
    <a class="artifact-btn primary" href="https://github.com/yazelin/gemini-web" target="_blank">Source</a>
  </div>
</article>

<article class="artifact">
  <div class="artifact-school">創造系</div>
  <div class="artifact-head">
    <div class="artifact-icon">📜</div>
    <div class="artifact-names">
      <h4 class="artifact-name-zh">咒文起稿匣</h4>
      <div class="artifact-name-en">Spell Composer</div>
      <div class="artifact-repo">yazelin/PromptFill</div>
    </div>
  </div>
  <div class="artifact-lore">
    為繪影魔陣準備咒文草稿的輔助匣。結構化、省去散亂冥想。
  </div>
  <div class="artifact-effect">
    結構化 AI 繪圖 prompt 產生器，適配 Nano Banana Pro 系列。
  </div>
  <div class="artifact-actions">
    <a class="artifact-btn primary" href="https://github.com/yazelin/PromptFill" target="_blank">Source</a>
  </div>
</article>

</div>

<!-- ============================================================ -->
<!-- 煉金系 · Transmutation                                        -->
<!-- ============================================================ -->
<h3 class="school-divider">
  煉金系 <span class="school-divider-en">· Transmutation Arts</span>
</h3>

<div class="codex-grid">

<article class="artifact">
  <div class="artifact-school">煉金系</div>
  <div class="artifact-head">
    <div class="artifact-icon">📄</div>
    <div class="artifact-names">
      <h4 class="artifact-name-zh">卷軸化術</h4>
      <div class="artifact-name-en">Scribe's Hand</div>
      <div class="artifact-repo">yazelin/MD2DOC-Evolution</div>
    </div>
  </div>
  <div class="artifact-lore">
    將凡人墨跡（Markdown）煉成正式卷軸（Word）。格式可客製化，符合任何行會規範。
  </div>
  <div class="artifact-effect">
    Markdown → Word，支援企業自訂樣式、表格、圖片、目錄。
  </div>
  <div class="artifact-actions">
    <a class="artifact-btn primary" href="https://github.com/yazelin/MD2DOC-Evolution" target="_blank">Source</a>
  </div>
</article>

<article class="artifact">
  <div class="artifact-school">煉金系</div>
  <div class="artifact-head">
    <div class="artifact-icon">📽️</div>
    <div class="artifact-names">
      <h4 class="artifact-name-zh">簡報祭壇</h4>
      <div class="artifact-name-en">Lectern of Light</div>
      <div class="artifact-repo">yazelin/MD2PPT-Evolution</div>
    </div>
  </div>
  <div class="artifact-lore">
    將墨跡化為幻燈（PPT），可現場投影展示。支援線上宣講模式。
  </div>
  <div class="artifact-effect">
    Markdown → PPT，含線上簡報與投影模式，支援程式碼語法高亮。
  </div>
  <div class="artifact-actions">
    <a class="artifact-btn primary" href="https://github.com/yazelin/MD2PPT-Evolution" target="_blank">Source</a>
  </div>
</article>

</div>

<!-- ============================================================ -->
<!-- 次元系 · Dimensional                                          -->
<!-- ============================================================ -->
<h3 class="school-divider">
  次元系 <span class="school-divider-en">· Dimensional Arts</span>
</h3>

<div class="codex-grid">

<article class="artifact">
  <div class="artifact-school">次元系</div>
  <div class="artifact-head">
    <div class="artifact-icon">🗄️</div>
    <div class="artifact-names">
      <h4 class="artifact-name-zh">藏影閣</h4>
      <div class="artifact-name-en">Shadow Vault</div>
      <div class="artifact-repo">yazelin/image-bed</div>
    </div>
  </div>
  <div class="artifact-lore">
    個人圖像的次元書架，不佔本空間，存入神殿（GitHub Releases）異界，永不損壞。
  </div>
  <div class="artifact-effect">
    個人圖床，圖片存放在 GitHub Releases，不佔 repo 空間。
  </div>
  <div class="artifact-actions">
    <a class="artifact-btn primary" href="https://github.com/yazelin/image-bed" target="_blank">Source</a>
  </div>
</article>

<article class="artifact">
  <div class="artifact-school">次元系</div>
  <div class="artifact-head">
    <div class="artifact-icon">🔗</div>
    <div class="artifact-names">
      <h4 class="artifact-name-zh">傳送門刻印</h4>
      <div class="artifact-name-en">Portal Rune</div>
      <div class="artifact-repo">yazelin/shorturl-worker</div>
    </div>
  </div>
  <div class="artifact-lore">
    將漫長的咒文路徑封印為短刻印，單手即可傳送冒險者。
  </div>
  <div class="artifact-effect">
    Cloudflare Workers + KV 縮網址服務，PromptFill 專用短網址。
  </div>
  <div class="artifact-actions">
    <a class="artifact-btn primary" href="https://github.com/yazelin/shorturl-worker" target="_blank">Source</a>
  </div>
</article>

</div>

<!-- ============================================================ -->
<!-- 通靈系 · Binding                                              -->
<!-- ============================================================ -->
<h3 class="school-divider">
  通靈系 <span class="school-divider-en">· Binding Arts</span>
</h3>

<div class="codex-grid">

<article class="artifact">
  <div class="artifact-school">通靈系</div>
  <div class="artifact-head">
    <div class="artifact-icon">🖨️</div>
    <div class="artifact-names">
      <h4 class="artifact-name-zh">印刻術</h4>
      <div class="artifact-name-en">Inkseal</div>
      <div class="artifact-repo">yazelin/printer-mcp</div>
    </div>
  </div>
  <div class="artifact-lore">
    讓精靈能直接指揮凡人印刷術（CUPS），將任何訊息化為實體。
  </div>
  <div class="artifact-effect">
    MCP server，透過 CUPS 控制印表機。可接 Claude / Cursor 等 agent。
  </div>
  <div class="artifact-actions">
    <a class="artifact-btn primary" href="https://github.com/yazelin/printer-mcp" target="_blank">Source</a>
  </div>
</article>

<article class="artifact">
  <div class="artifact-school">通靈系</div>
  <div class="artifact-head">
    <div class="artifact-icon">🏢</div>
    <div class="artifact-names">
      <h4 class="artifact-name-zh">帳本監聽術</h4>
      <div class="artifact-name-en">Ledger Whisper</div>
      <div class="artifact-repo">yazelin/erpnext-mcp</div>
    </div>
  </div>
  <div class="artifact-lore">
    讓精靈與商會帳本（ERPNext）直接對話，問帳、記帳不必經過凡人之手。
  </div>
  <div class="artifact-effect">
    MCP server for ERPNext REST API，讓 AI 能直接查詢、記錄商業數據。
  </div>
  <div class="artifact-actions">
    <a class="artifact-btn primary" href="https://github.com/yazelin/erpnext-mcp" target="_blank">Source</a>
  </div>
</article>

</div>

<!-- ============================================================ -->
<!-- 聲術系 · Incantation                                          -->
<!-- ============================================================ -->
<h3 class="school-divider">
  聲術系 <span class="school-divider-en">· Incantation Arts</span>
</h3>

<div class="codex-grid">

<article class="artifact">
  <div class="artifact-school">聲術系</div>
  <div class="artifact-head">
    <div class="artifact-icon">🎙️</div>
    <div class="artifact-names">
      <h4 class="artifact-name-zh">詠唱辨識器</h4>
      <div class="artifact-name-en">Voice Scribe</div>
      <div class="artifact-repo">yazelin/asr-ime-fcitx</div>
    </div>
  </div>
  <div class="artifact-lore">
    將咒術師的口語即時記下為文字，嵌入 fcitx 輸入法，隨呼隨用。
  </div>
  <div class="artifact-effect">
    ASR 語音輸入法，整合 fcitx framework。支援中英雙語。
  </div>
  <div class="artifact-actions">
    <a class="artifact-btn primary" href="https://github.com/yazelin/asr-ime-fcitx" target="_blank">Source</a>
  </div>
</article>

</div>

<!-- ============================================================ -->
<!-- 後記 Epilogue                                                 -->
<!-- ============================================================ -->
<div class="epilogue">
  <strong>關於工坊 · About this Workshop</strong><br>
  此處列出的魔道具多為我與 Mori 共同打造的作品，部分為教學範例、部分為日常使用工具。
  若其中任何一件對你有用，歡迎 fork、改造、延伸。<br>
  新的魔道具會持續加入此處 — 這是一間還在生長的工坊。<br><br>
  <em style="color: var(--mist); font-family: var(--serif-en);">
    Each artifact here was forged in collaboration with Mori, my contracted spirit.
    Some are teaching examples, others are daily tools. All are open. Take what you need.
  </em>
</div>

</div>
