---
layout: post
title: "我睡覺,它整晚加城市 —— 怎麼排班讓 AI 自己做完一整夜的內容"
subtitle: "我睡覺,它整晚把全台縣市一座座加進 Roll Formosa、再把每座城市的街頭小物在地化磨深。重點不是「AI 會寫 code」——那早就不稀奇了;而是怎麼排班讓它整晚不用人顧:backlog 怎麼排、壞掉的 PR 怎麼擋門外、撞額度怎麼自己睡到重置再爬起來、早上七點怎麼讓它停手等我 review。一夜跑出 56 個 autopilot commit、20 座城。而它其實不是 agent 框架,是約一百行 bash 加一個 backlog 檔。"
date: 2026-06-19
categories: [AI, 開發工具]
tags: [AI, 甲方思維, Automation, bash, Claude Code, autopilot]
author: Yaze Lin
---

![我睡覺,它整晚加城市](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-06-19-ai-overnight-loop.png)

> **這篇講的兩個專案**
> - Roll Formosa(搖滾・福爾摩沙)—— 台灣風滾球遊戲,有整晚自動加城市的 autopilot:<https://yazelin.github.io/roll-formosa/>
> - battlefield-editor —— 把歷史戰役編成資料 package 的戰場編輯器(同哲學、不同粒度的對照組):repo 在文末
> - repo:<https://github.com/yazelin/roll-formosa> ／ <https://github.com/yazelin/battlefield-editor>

我睡覺,AI 整晚加城市。早上起床,GitHub 上躺著一排開好、各自跑過 `npm test`、等我按 merge 的 Pull Request。讓它整晚跑的舞台小得好笑:**約一百行 bash 加一個 backlog 檔**。

一夜的產出不是紙上談兵:Roll Formosa 的 git log 裡躺著 **56 個 `autopilot:` 開頭的 commit**、自動開到 **PR #104**、**全台 20 座城市**一座座被加進遊戲又磨深了好幾輪。

你可能會想:**「約一百行 bash 加一個 backlog?這不就是個包裝過的 agent 框架?」** 不是。它沒有 orchestrator、state machine、multi-agent 調度。它敢放整晚靠的不是編排聰明,是一道 `npm test` 的 test gate:把「什麼叫做對了」做成機器會回紅綠的關卡,中間怎麼亂跑都跨不出界。

下面拆這張「排班表」怎麼設計:backlog 怎麼排、壞掉的 PR 怎麼擋在門外、撞額度怎麼睡到重置再爬起來、早上七點怎麼停手等我 review。

## 一、為什麼是 shell 在當班,不是 AI

直覺上你會想:既然要讓 AI 自動做事,那不就讓它自己去管 git、開 PR、排程嗎?

我刻意不這樣。整個系統裡,**shell 管紀律,AI 只管做事+回報**。autopilot 腳本開頭那行註解把這條分工寫得很白:

```bash
# ponytail: shell 管 git+test+PR+issue,Claude 只管做事+回報。先筆電手動證機制,跑順再搬常開機器掛 cron。
```

為什麼這樣分?因為「做事」和「守紀律」是兩種不同性質的工作。做事(把停車塔換成審計新村、算出冰淇淋杯的幾何)需要創造力、上下文、判斷。但守紀律(切 branch 前確認工作樹乾淨、跑測試、測試紅就回滾、開 PR 後停手別亂 merge)需要的是**死板、可預測、絕不通融**——這正是 shell 天生擅長、而 AI 不該被信任的地方。

把守紀律交給 shell 來框,AI 在框裡做事,就能放心讓它整晚跑。因為就算某一城做歪了,**歪也跨不出 shell 畫的線**:不能 commit、不能 push、不能 merge,做出來的東西要嘛過了 test gate 變成一個待審的 PR,要嘛被擋在門外、原地回滾乾淨。

## 二、backlog:一個 `NEXT.md` 裡的 checkbox 佇列

整個系統的「待辦清單」就是 repo 裡一個普通的 markdown 檔 `NEXT.md`,裡面是一排 checkbox:

```markdown
- [x] 加台東 taitung:終點=三仙台八拱橋;主題=伯朗大道/釋迦/原民圖騰/海岸
- [x] 加花蓮 hualien:終點=太魯閣牌樓;主題=七星潭/麻糬/扁食/大理石
...
- [x] 加深 taichung 街頭物:目前 44/70 同台北→壓到 ≤37;在地版例=宮原冰淇淋杯/太陽餅/麻芛冰/逢甲攤車/大甲媽遶境旗
```

一行一條任務,範圍寫清楚。`- [ ]` 是待辦、`- [x]` 是做完。腳本每次挑「最上面那條未打勾的」去做。

每一條都帶著創作錨點:終點地標、主題食物、目標數字。範圍寫死在這裡,doer 照它發揮,但不能自己決定要加哪座城、要把目標壓到多少。哪座城配哪個地標、台中該換成宮原冰淇淋杯而不是隨便一個甜點,都鎖在 backlog 這一行裡。

> 後面會看到,doer 做事時還能順手回報「發現的待辦」變成 GitHub issue——但那只是**提案**,要進 `NEXT.md` 還是得人工核准。最終要做什麼,握在 backlog 手上。

## 三、把 loop 拆開看

有兩支腳本,刻意分成兩種班別:

- `scripts/autopilot.sh`(82 行)—— **單條版**:挑一條做掉、開一個 PR、停手。手動跑、或掛 cron 定時跑一條。
- `scripts/autopilot-drain.sh`(123 行)—— **整晚版**:把 backlog 裡每一條都跑掉,各開一個 PR,跑到天亮為止。

整晚版是這篇的主角。我們一段一段看它怎麼運作。

### 3-1. 一次抓完 backlog —— 一個非抓不可的坑

第一晚跑完,早上一看傻眼:十六個 PR,全是台東。

backlog 上明明排了一打城市,結果整晚的勞動成果是同一座城被重做十六次。它沒罷工,測試也每條都過了——它一整晚老老實實做了十六遍「最上面那條未打勾的」。問題是,那條從頭到尾都是台東。

順著線索倒推真因:腳本每跑完一條,就回 `main` 重新 grep「最上面未打勾的」當下一條。直覺上這沒問題——doer 不是會在它那條 branch 上把台東從 `- [ ]` 改成 `- [x]` 嗎?改了,但**那個打勾關在還沒 merge 的 PR 裡**。因為 **PR 不會被自動 merge**(我堅持人工 merge),所以 **`main` 上的 `NEXT.md` 從頭到尾沒變**,每次回去 grep 抓到的永遠是同一條台東。drain 腳本的註解後來把這個教訓記得很清楚:

```bash
# ponytail: 一夜性 driver。沿用 autopilot.sh 的 doer prompt,但一次抓完清單再逐條跑
#   —— 純 loop autopilot.sh 會因為 PR 不 merge、main 的 NEXT.md 不變而把第一條重做 16 次。
```

修法是:**別邊跑邊重新 grep**。在一切開始前把整份 backlog 一次讀進陣列,之後逐條跑陣列裡的項目,不再回頭看那個永遠不變的檔案:

```bash
# 一次抓完 backlog(run 中 main 的 NEXT.md 不會變,不能邊跑邊 re-grep)
mapfile -t ITEMS < <(grep -F -- '- [ ]' NEXT.md)
log "backlog: ${#ITEMS[@]} items"
```

### 3-2. headless doer:讓 AI 在無人值守下做一件事

每一條任務,腳本起一個 headless 的 Claude Code 來做:

```bash
run_doer(){
  timeout 3600 claude -p "你是 roll-formosa repo 的 autopilot。先讀 NEXT.md 和 docs/ADD-A-CITY.md。\
只做這一條 backlog:${1}。嚴守它寫的範圍。可以跑 scaffold/build 等指令,\
但不要 git commit/push、不要開 PR、不要 merge(外層腳本會處理)。\
...（中略,prompt 很長,下面拆重點）" \
    --dangerously-skip-permissions 2>&1 || true
}
```

幾個關鍵:

1. `claude -p "<prompt>"` 是 **headless 模式**——不開互動視窗,給一段 prompt、它做完吐出文字就結束。這是能塞進 shell loop 的前提。
2. `--dangerously-skip-permissions`:無人值守,不能每跑一個指令就停下來等人按「允許」。這個旗標的代價就是它名字寫的那樣——所以前面那道 shell 防線(不准 commit/push/merge)和後面的 test gate 才如此重要:**權限放寬了,圍欄就得自己搭好**。
3. `timeout 3600`:單條最多跑一小時,避免某條卡住把整晚耗光。後面 `|| true` 是故意的——逾時也不讓整個腳本 `set -e` 掛掉,讓外層繼續處理下一條。
4. prompt 裡反覆強調「**不要 git commit/push、不要開 PR、不要 merge(外層腳本會處理)**」——git 動作的權力,一概收回 shell 手上。

prompt 本身內建了**兩種工作模式**,靠任務那行的開頭字判斷:

- 「加 XX」=加一座新城市:照 `docs/ADD-A-CITY.md` 全流程跑(scaffold → 地標/收藏在地化 → 7 階街頭物換成在地小物 → 終點地標 → 河流在地化 → 旁白/tier 名在地化)。
- 「加深 XX」=既有城市磨深:**只動** `archetypes/tN.js` 的街頭小物,把「還照抄台北」的換成在地版,保留真・全台通用物(機車/紅綠燈/便利商店/路樹這類)。明令不准動 landmarks/collectibles/manifest。

這個「同一個 doer、靠 backlog 那行的開頭切換模式」的設計,不必維護兩套 prompt——舞台是一套,劇本由 backlog 那行決定。

### 3-3. test gate:壞掉的 PR 連門都進不來

這是整個系統敢「放整晚」的真正底氣。doer 做完之後,**shell 跑一次完整 `npm test`,紅了就整條丟掉**:

```bash
if ! npm test >>"$LOG" 2>&1; then
  log "npm test FAIL → 跳過(無 PR): $TASK"; SKIP=$((SKIP+1))
  git checkout -q main; git reset -q --hard origin/main; git clean -qfd
  git branch -qD "$BR" 2>/dev/null || true
  continue
fi
```

紅了會發生三件事:記一筆 log、**不開 PR**、把工作樹 `reset --hard` + `clean -fd` 回到乾淨的 `origin/main`、刪掉這條沒用的 branch,然後 `continue` 跳下一條。壞掉的東西不會污染後面任何一城,更不會變成一個等我 review 的 PR。

這道 gate 是能整晚放手的核心原因:**「什麼叫做對了」被做成了一個機器能跑、會回傳紅綠的指令**。AI 能不能寫對城市內容我不完全信得過,但 `npm test` 紅綠我信得過。

這套測試不是擺好看的。它裡面有幾道專為這個遊戲寫的「在地化守衛」:`localization.test.js` 會自動量每座 ready 城市的街頭物還跟台北重複幾個,超過門檻就紅;`city-content-localization.test.js` 會擋「地標還借用台北的故宮/中山堂」「landmark 檔頭還寫 `@file packs/taipei/`」這種偷懶。所以 doer 想交差,光把幾何畫出來不夠,得真的在地化到測試認可的深度。

> 這裡有兩個盲點,順手記一下,都是 doer 在 gate 內踩出來、讓我回頭把規則補硬的:`npx vitest run src/packs/<id>` 這種「只測單城」的測試**不會 import `active.js`**,所以 `active.js` 裡多打一個逗號這種語法錯,單城測試抓不到、只有完整 `npm test` 會紅;doer 就踩過一次,只跑單城以為過了。另外地標的三角面上限(tri cap)是 DEV 開機期的 assert,vitest 也抓不到,得另跑 `node scripts/check-hero-tris.mjs <id>`。為了堵這兩個洞,我在 prompt 裡明令 doer「改完 active.js 一定要再跑一次完整 npm test」「一定要跑 check-hero-tris」——但最後一道閘還是 shell 這裡的完整 `npm test`。

### 3-4. 自動開 PR,然後停手

過了 gate,shell 才接手做 git 的事:

```bash
git add -A
if ! git commit -q -m "autopilot: $TASK"; then
  log "無變更 → 跳過: $TASK"; SKIP=$((SKIP+1))
  ...
  continue
fi
git push -q -u origin "$BR" >>"$LOG" 2>&1
if gh pr create --fill --base main --head "$BR" --label autopilot >>"$LOG" 2>&1; then
  log "PR opened: $TASK"; DONE=$((DONE+1))
else
  log "PR 開失敗(branch 已推 $BR): $TASK"; SKIP=$((SKIP+1))
fi
git checkout -q main
```

branch 名是時間戳(`autopilot/20260625-110549` 這種),`gh pr create --fill` 用 commit 訊息自動填 PR、貼上 `autopilot` 標籤。

注意它**到開完 PR 就停**。沒有 `gh pr merge`。這是刻意的:**`main` 不等於上線,merge 永遠是人的決定**。AI 整晚能做到的最高權限,就是「把一個過了所有機器關卡的成果,擺成一個待我裁決的 PR」。早上我泡咖啡的時候逐個點開、看一眼截圖、按 merge——這一步我沒打算交出去。

(單條版 `autopilot.sh` 還多一個巧思:它會解析 doer 輸出裡的 `FINDINGS:` 區塊,把 doer 做事時順手發現的待辦開成 `autopilot-found` 標籤的 GitHub issue,當作「自我補充燃料」。但一樣是提案,要進 backlog 仍需我核准。)

### 3-5. 全文高潮:撞到額度上限,睡到重置再爬起來

這段是撞到額度就睡到重置再爬起來,「整晚無人值守」這四個字就落在這裡。

問題很現實:Claude 的訂閱有用量上限。一個整晚跑十幾條任務的 loop,跑到半夜幾乎一定會撞到「你已達使用上限,額度在某點重置」。撞到的當下,doer 不會做事,只會回一句帶 `resets HH:MMpm` 的訊息。

笨辦法是整批停掉、隔天人來重跑。但那就不叫「整晚自己做完」了。所以 drain 腳本做的是:**撞到上限就解析出重置時間、算出要睡幾秒、睡到重置、爬起來重做同一條**:

```bash
OUT=$(run_doer "$ITEM"); echo "$OUT" | tail -25 >> "$LOG"
# claude usage-limit recovery: if the doer came back with "hit your limit · resets HH:MMpm",
# sleep until reset then retry the SAME city (so an overnight run finishes unattended).
while echo "$OUT" | grep -qiE "hit your limit|usage limit"; do
  rt=$(echo "$OUT" | grep -oiE "resets [0-9]{1,2}:[0-9]{2} ?[ap]m" | head -1 | sed -E 's/[Rr]esets //')
  tgt=$(date -d "$rt" +%s 2>/dev/null); now=$(date +%s); sl=3600
  if [ -n "$tgt" ]; then d=$((tgt-now+120)); [ "$d" -lt 0 ] && d=$((d+86400)); [ "$d" -ge 60 ] && [ "$d" -le 21600 ] && sl=$d; fi
  if [ $((now+sl)) -ge "$DEADLINE" ]; then log "額度重置($rt)超過 deadline,停止整批。"; break 2; fi
  log "撞 claude 額度上限(resets $rt),睡 ${sl}s 後重試:$TASK"
  sleep "$sl"
  OUT=$(run_doer "$ITEM"); echo "$OUT" | tail -25 >> "$LOG"
done
```

逐行拆這段:

1. `grep -qiE "hit your limit|usage limit"`:看 doer 的輸出裡有沒有撞牆字樣,有才進這個 while。
2. 抽出重置時間 `resets 7:00pm` 裡的 `7:00pm`,用 `date -d` 換算成 epoch 秒。
3. `d=$((tgt-now+120))`:算出距離重置還有幾秒,**多加 120 秒緩衝**(別在重置的瞬間就重試)。
4. `[ "$d" -lt 0 ] && d=$((d+86400))`:**跨午夜的修正**。如果重置時間算出來是負的(例如現在凌晨一點、重置寫的是「7:00am」但 `date -d` 解成今天已過的時點),就 +86400(一天的秒數),指向明天那個時間。
5. `[ "$d" -ge 60 ] && [ "$d" -le 21600 ] && sl=$d`:**clamp 在 60 秒到 6 小時之間**。解析出怪數字就退回預設的一小時,絕不睡超過六小時——防呆。
6. `if [ $((now+sl)) -ge "$DEADLINE" ]; then ... break 2; fi`:**睡醒會超過早上七點的話,別睡了,整批收工**(`break 2` 跳出內外兩層迴圈)。
7. `sleep "$sl"` → 重新 `run_doer "$ITEM"` 同一條。

整段讀起來像一個會打瞌睡的工人:做著做著沒力氣了(撞額度),看一眼時鐘算出幾點能恢復,趴下睡到那個點,醒來接著做剛才那一城。而且睡前還會看一眼「醒來會不會太晚」——太晚就乾脆不睡了,把場子收乾淨等人來。

### 3-6. 07:00 deadline:讓早上回來時是停手狀態

上面那個 `$DEADLINE` 是什麼?是我設的「早上七點收工線」:

```bash
# 下一個即將到來的 07:00(過了午夜也正確):07:00 後不再開新城市,讓你早上來時是停手狀態
DEADLINE=$(date -d 'today 07:00' +%s)
[ "$DEADLINE" -le "$(date +%s)" ] && DEADLINE=$(date -d 'tomorrow 07:00' +%s)
```

如果現在還沒到今天七點,deadline 就是今天七點;如果已經過了(例如我半夜十一點開跑),就指向明天七點。loop 每跑一條前會檢查 `date +%s -ge DEADLINE`,過線就 `break`,不再開新城。

為什麼要這條線?因為我希望**早上醒來時,系統是「停手等我」的狀態,而不是「正在做到一半」**。停手狀態我能從容 review、決定哪些 PR 要 merge;做到一半我得先搞清楚它停在哪、有沒有半截的 branch。一條 deadline,把「整晚跑」收束成「我作息可預測的一夜」。

## 四、成果:那一夜到底做了什麼

講了一堆機制,把開頭那幾個數字攤開看實績。截至寫稿,Roll Formosa 的 git log 裡有 **56 個 `autopilot:` 開頭的 commit**,autopilot 開出的 PR 一路跑到 **#104**(後續還有人工 PR 接到 #130)。產出是:

- **全台 20 座城市**(台北 + 19 縣市),每座有自己的終點地標、河流、街頭小物、旁白。
- **「加深」磨了三輪**,目標一輪比一輪嚴:第一輪壓到 ≤37/70 同台北、第二輪 ≤33、第三輪 ≤25。以台中為例,backlog 與 commit 合起來記下這條軌跡(其中 `done:` 的實測數字標在 `NEXT.md` 的打勾行上):

  ```
  autopilot: 加深 taichung 街頭物:目前 44/70 同台北→壓到 ≤37（done: 39/70）
  autopilot: 加深 taichung 街頭物 round2:39→≤33（done: 33/70）
  autopilot: 加深 taichung 街頭物 round3:33→≤25
  ```

  從跟台北重複 44 個街頭物,三輪磨到 25 個以內。這個「目標數字」是我在 backlog 裡定的驗收標準,`check-city.mjs` 和測試守衛負責量,doer 負責磨到達標。

這裡我要展示一個具體的 diff,證明它做的**不是占位符、是真的在地化幾何**。commit `73992f4` 把台中的一個街頭小物從「尪仔標」(一張圓形紙牌)整顆換成「宮原冰淇淋杯」:

```
- /* [5] ngiauimia_card 尪仔標 — round printed paper play-card */
+ /* [5] miyahara_icecream_cup 宮原冰淇淋杯 — TAICHUNG SWAP: Miyahara ice
+ /*     cream cup (宮原眼科 signature dessert, waffle cone + scoops) */
- displayName: '尪仔標',
+ displayName: '宮原冰淇淋杯',
...
+ // waffle cone body (inverted cone shape, textured golden brown)
+ // three scoops of ice cream stacked (宮原 signature triple-stack)
+ // wafer stick poked in at an angle (宮原的招牌插著威化餅)
```

同一個 commit 裡,它還把「停車塔」換成了「審計新村」——把一棟機械式停車塔的幾何,改寫成審計新村那種兩層翻修宿舍 + 彩色雨棚 + 市集攤位的造型,連紅綠雙色雨棚、走廊立柱、掛燈都用 box 拼了出來:

```
- /* ---- slot 4: 停車塔 parking_tower ---- */
+ /* ---- slot 4: 審計新村 shengjicun (TAICHUNG SWAP: Shengjicun market) - */
...
+ // 審計新村 — the retro government dormitory village turned creative market:
+ // rows of 2-storey refurbished concrete dorms with colorful awnings + vendors.
+ box(4.0, 0.1, 0.6, 0xc23a2e, { y: 1.7, z: 1.35 }), // red canopy
+ box(4.0, 0.1, 0.6, 0x3f8a52, { y: 1.35, z: 1.35 }), // green lower canopy band
```

這是真的 Three.js 幾何在地化——華夫餅錐、三球冰淇淋、斜插的威化餅,一根一根 box 拼出來。一夜之間,二十座城市裡像這樣的替換有上百處。我醒來的工作,是逐個 PR 點開、看截圖、判斷「這顆冰淇淋杯看起來像不像」,然後 merge。

## 五、同哲學、不同粒度:battlefield-editor 的 in-session loop

這套「把驗收做成機器 gate、讓 AI 在 gate 內自己 loop」的心法,我在另一個專案 battlefield-editor 上用過,但形態很不一樣。它不是整晚自己滾的,別搞混。

battlefield-editor 是把一場歷史戰役編成一份資料 package(陣營/地形/建築/單位/分鏡/音訊),引擎只負責演出。它的 authoring skill(`skills/author-battlefield/SKILL.md`)規範的 loop 是這樣:

> 每改一批就過機器三關(validate → residue → render),綠了再往下;**任一關紅,AI 自己 loop 修,不交人**。本機驗到綠才算完;交人時附截圖 + 只列「人該判的」清單。

它有四道機器 gate,跟 Roll Formosa 的 `npm test` 是同一個精神,只是拆得更細:

| gate | 把關什麼 |
|---|---|
| `validate-data.mjs` | schema 合法、跨檔引用完整、鏡頭/音訊 cue 參數齊全 |
| `residue-scan.mjs` | 沒有從赤壁範本複製來的殘留、placeholder 已換掉 |
| `render-check.mjs` | headless 載入、逐幕截圖、0 console error |
| `audio-check.mjs` | 旁白音長 ≤ 幕長、音訊素材全解析 |

它的 SKILL 還明確畫了一張「機器判 vs 人判」的界線表:schema/引用/0-error 這種客觀的交給機器,**位置合不合理、鏡頭框沒框到、好不好看好不好聽、史實對不對**留給人。和 Roll Formosa 一樣,機器關卡管「對不對」,人管「好不好」。

但關鍵的不同在這:**battlefield-editor 沒有 overnight driver、沒有 `NEXT.md` backlog 佇列、沒有撞額度睡到重置這套東西。**它是一個**單一 session 內、由人一場一場手動觸發**的 loop:AI 在同一次對話裡自改、過四道 gate、紅了自己修、綠了交人。一場戰役可能要編好幾個小時,人在旁邊推。對照 Roll Formosa 那種**一整晚、無人值守、自動滾一打城市**(撞額度會睡、到七點會停、開完 PR 等人 merge),粒度差很多。

可以說它是 overnight loop 的**前身**:同一個「機器 gate + AI 在 gate 內自循環」的內核,一個還握在人手上一場一場推,一個被那一百行 bash 包成了能整晚自己跑的班。它最自豪的成績是「零 context 的 agent 也能照 SKILL 從 scaffold 編出官渡、垓下兩場完整戰役」;dogfood 時 doer 還踩出一個 residue-scan 的 bug——它把跨戰役共用的「襄陽/江陵」誤判成赤壁殘留,被抓出來修掉(至於「長江」這種跨戰役共用地名,則是我設計 gate 時就刻意排除的白名單)。

## 六、踩雷與心法

把這套東西交給整晚跑,有幾條規矩是用教訓換來的:

- **切 branch 前工作樹必須乾淨**。autopilot.sh 開頭就檢查 `git status --porcelain`,不乾淨就大聲中止——否則切 branch 會把未提交內容帶過去、和別的東西相撞污染 build。寧可中止,不要默默弄壞。
- **driver 腳本要放 repo 外跑**。因為 doer 會跑 `git add -A`,腳本放 repo 裡會被包進某個 PR。drain 腳本的註解特別記了這條。
- **`main` ≠ 上線,merge 永遠人工**。這是我對「AI 整晚自己做完」設的天花板。它能做到「擺好一個待審的 PR」,最後拍板是人的事。
- **跑的那台機器當唯讀**。整晚 loop 在哪台機器跑,那台就別同時拿來做別的會動工作樹的事。
- **先手動證機制,再上 cron**。我是先在筆電上手動跑 `autopilot.sh` 一條一條看它對不對,確認 gate 真的會擋、PR 真的會開、stop 真的會停,才敢搬到常開機器掛整晚。
- **把額度當儀表盤,別撞到才知道**。drain 腳本裡有個 `log_usage()`,每跑一條前用 `curl` 查一下 Claude 帳號的 5 小時 / 7 天用量印進 log(這個 usage endpoint 沿用自我另一個專案 claude-auth-switcher)。它不影響 loop 邏輯,純粹讓我事後翻 log 時看得到「那一夜大概燒了多少額度、什麼時候開始吃緊」。

## 結尾:回到那個「不就是 agent 框架?」

繞了一圈,回收開頭那個質疑。它真的不是 agent 框架——再講一次:沒有 orchestrator、沒有 state machine、沒有 multi-agent 調度,就是約一百行 bash(`autopilot.sh` 82 行 + `autopilot-drain.sh` 123 行)加一個 `NEXT.md` backlog 檔。

敢把它放整晚的底氣,從來不是腳本多聰明,而是**「什麼叫做對了」被做成了機器能跑、會回紅綠的 gate**。`npm test` 的紅綠信得過,在地化深度有測試守衛量得出來,三角面超標有 check 腳本擋得住。驗收標準是客觀、可執行、不通融的,才敢讓 loop 在這些 gate 之間整晚自己跑,不必整夜守著。一百行 bash 不是把 agent 框架做小,是硬度全押在 gate 上,編排根本不必聰明。

說到這就得戳破一個常見的誤會:**很多人以為「會用 AI」等於「會下 prompt」**——以為把需求講得夠漂亮、prompt 工程做得夠細,AI 就會替你把事做對。這話不能說錯,prompt 確實要寫清楚。但這一夜真正花時間的,完全不是雕 prompt;是把「怎樣算做對了」一條條寫成 `npm test` 跑得出紅綠的東西:在地化守衛、三角面 check、跨檔語法驗。prompt 寫得再美,也只是「聽起來像做對了」。gate 紅綠才是「真的做對了」。

核心不在「會不會下 prompt」,在**「驗收標準能不能變成一個機器幫你跑的關卡」**。能,你就能睡覺;不能,你就得整晚盯著。整晚做的事值不值得早上按那顆 merge 鈕,取決於前一天晚上把 gate 設得夠不夠硬。

早上那杯咖啡,喝得挺安心。

## 參考

- Roll Formosa:<https://github.com/yazelin/roll-formosa>(autopilot 在 `scripts/autopilot.sh`、`scripts/autopilot-drain.sh`;backlog 在 `NEXT.md`)
- battlefield-editor:<https://github.com/yazelin/battlefield-editor>(authoring loop 在 `skills/author-battlefield/SKILL.md`,四道 gate 在 `tools/`)
- 上一篇談這幾個專案的 PWA 離線/安裝坑:[Service Worker 寫好了,離線卻還是恐龍頁]({% post_url 2026-06-15-pwa-offline-install-pitfalls %})
- Claude Code headless 模式:`claude -p "<prompt>"`(無互動視窗、給 prompt 做完即結束,是塞進 shell loop 的前提)
