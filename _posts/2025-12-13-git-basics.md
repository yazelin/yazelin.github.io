---
layout: post
title: "Git 入門：版本控制基礎指令"
subtitle: "從零開始掌握程式碼版本管理"
date: 2025-12-13
categories: [Git]
tags: [Git, 版本控制, GitHub]
---

> **📖 前置知識**：[Linux 終端機入門]({% post_url 2025-12-13-linux-basics %})
>
> **📚 延伸閱讀**：[SDD 規格驅動開發入門]({% post_url 2025-12-07-sdd-setup-guide %})

---

## 這篇文章要解決什麼問題？

**新人**：「我改壞程式碼了，可是我不記得之前改了什麼...」

**資深工程師**：「你有用 Git 嗎？」

**新人**：「沒有，Git 是什麼？」

**資深工程師**：「版本控制工具。每次改動都會記錄，隨時可以回到之前的版本。」

**新人**：「像是遊戲存檔？」

**資深工程師**：「對，而且可以看到每次存檔改了什麼。團隊協作也靠它。」

這篇文章會教你：
- Git 的核心概念
- 日常開發常用指令
- 基本的團隊協作流程

---

## Git 是什麼？

Git 是**分散式版本控制系統**，用來追蹤檔案的變更歷史。

### 為什麼需要版本控制？

| 沒有版本控制 | 有版本控制 |
|-------------|-----------|
| `project_final.zip` | 完整變更歷史 |
| `project_final_v2.zip` | 隨時回到任何版本 |
| `project_final_v2_真的最終版.zip` | 知道每次改了什麼 |
| 不敢大改，怕改壞 | 放心修改，隨時可還原 |

### 核心概念

```
工作目錄          暫存區           本地儲存庫         遠端儲存庫
(Working)    →   (Staging)   →    (Local)      →    (Remote)
                  git add          git commit         git push

  修改檔案    →   準備提交    →    建立存檔點   →    上傳到 GitHub
```

| 概念 | 說明 | 比喻 |
|------|------|------|
| **Repository（儲存庫）** | 專案的 Git 資料夾 | 整個存檔資料夾 |
| **Commit（提交）** | 一次變更記錄 | 一個存檔點 |
| **Branch（分支）** | 獨立的開發線 | 平行時間線 |
| **Remote（遠端）** | 遠端儲存庫（如 GitHub） | 雲端備份 |

---

## 安裝 Git

### Ubuntu / Debian

```bash
sudo apt update
sudo apt install git

# 驗證安裝
git --version    # git version 2.43.0
```

### macOS

```bash
# 使用 Homebrew
brew install git

# 或安裝 Xcode Command Line Tools（會包含 Git）
xcode-select --install
```

### Windows

下載 [Git for Windows](https://git-scm.com/download/win) 安裝。

---

## 初始設定（一次性）

安裝後，設定你的身份：

```bash
# 設定使用者名稱（會顯示在 commit 記錄）
git config --global user.name "你的名字"

# 設定 Email（建議與 GitHub 帳號相同）
git config --global user.email "you@example.com"

# 設定預設分支名稱為 main
git config --global init.defaultBranch main

# 查看目前設定
git config --list
```

---

## 基本工作流程

### 1. 建立儲存庫

**新專案：**

```bash
mkdir my-project && cd my-project
git init
```

**複製現有專案：**

```bash
git clone https://github.com/username/repo.git
cd repo
```

### 2. 查看狀態

```bash
git status
```

輸出範例：
```
On branch main
Changes not staged for commit:
  modified:   main.py

Untracked files:
  new_file.py
```

| 狀態 | 說明 |
|------|------|
| `modified` | 已修改，尚未加入暫存區 |
| `Untracked` | 新檔案，Git 還沒追蹤 |
| `staged` | 已加入暫存區，準備提交 |

### 3. 加入暫存區

```bash
# 加入單一檔案
git add main.py

# 加入所有變更
git add .

# 加入特定類型
git add *.py
```

### 4. 提交變更

```bash
git commit -m "簡短描述這次改了什麼"
```

**好的 commit message：**
```bash
git commit -m "新增使用者登入功能"
git commit -m "修正訂單計算錯誤"
git commit -m "重構 API 回應格式"
```

**不好的 commit message：**
```bash
git commit -m "update"
git commit -m "fix"
git commit -m "改東西"
```

### 5. 查看歷史

```bash
# 查看 commit 歷史
git log

# 簡潔版（推薦）
git log --oneline

# 圖形化顯示分支
git log --oneline --graph
```

---

## 常用操作

### 查看變更內容

```bash
# 查看未暫存的變更
git diff

# 查看已暫存的變更
git diff --staged

# 查看特定檔案的變更
git diff main.py
```

### 取消變更

```bash
# 取消未暫存的修改（還原到上次 commit）
git checkout -- main.py

# 取消暫存（從暫存區移除，但保留修改）
git reset HEAD main.py

# 取消最後一次 commit（保留變更）
git reset --soft HEAD~1

# 取消最後一次 commit（不保留變更，危險！）
git reset --hard HEAD~1
```

### 忽略檔案（.gitignore）

建立 `.gitignore` 檔案，列出不需要追蹤的檔案：

```gitignore
# Python
__pycache__/
*.pyc
.venv/

# 環境變數
.env

# IDE
.vscode/
.idea/

# 系統檔案
.DS_Store
Thumbs.db

# 編譯產物
dist/
build/
```

---

## 分支操作

### 為什麼用分支？

```
main ─────●─────●─────●─────●───────●
                       \           /
feature-login           ●────●────●
                        開發新功能
```

- 主分支（main）保持穩定
- 新功能在分支開發
- 完成後合併回主分支

### 基本分支指令

```bash
# 查看所有分支
git branch

# 建立新分支
git branch feature-login

# 切換分支
git checkout feature-login

# 建立並切換（常用）
git checkout -b feature-login

# 合併分支（先切回 main）
git checkout main
git merge feature-login

# 刪除已合併的分支
git branch -d feature-login
```

---

## 遠端操作（GitHub）

### 連結遠端儲存庫

```bash
# 查看遠端
git remote -v

# 新增遠端（通常叫 origin）
git remote add origin https://github.com/username/repo.git
```

### 推送與拉取

```bash
# 推送到遠端
git push origin main

# 第一次推送，設定上游分支
git push -u origin main

# 之後可以簡化為
git push

# 從遠端拉取更新
git pull
```

### 常見流程

```bash
# 1. 開始新功能
git checkout -b feature-xxx

# 2. 開發、提交
git add .
git commit -m "實作 xxx 功能"

# 3. 推送分支
git push -u origin feature-xxx

# 4. 在 GitHub 建立 Pull Request

# 5. 合併後，刪除本地分支
git checkout main
git pull
git branch -d feature-xxx
```

---

## 實用技巧

### 暫存目前工作

開發到一半需要切換分支：

```bash
# 暫存目前的變更
git stash

# 切換分支做其他事
git checkout main
# ... 處理完畢 ...

# 切回來，恢復暫存
git checkout feature-xxx
git stash pop
```

### 修改最後一次 commit

```bash
# 忘記加檔案
git add forgotten_file.py
git commit --amend --no-edit

# 修改 commit message
git commit --amend -m "新的訊息"
```

> **注意**：已推送到遠端的 commit 不要 amend。

### 查看誰改的（blame）

```bash
git blame main.py
```

### 搜尋 commit

```bash
# 搜尋 commit message
git log --grep="login"

# 搜尋變更內容
git log -S "function_name"
```

---

## 常用指令速查

### 每日常用

| 指令 | 用途 |
|------|------|
| `git status` | 查看目前狀態 |
| `git add .` | 加入所有變更 |
| `git commit -m "訊息"` | 提交變更 |
| `git push` | 推送到遠端 |
| `git pull` | 拉取遠端更新 |
| `git log --oneline` | 查看歷史 |

### 分支操作

| 指令 | 用途 |
|------|------|
| `git branch` | 列出分支 |
| `git checkout -b <name>` | 建立並切換分支 |
| `git checkout <name>` | 切換分支 |
| `git merge <name>` | 合併分支 |
| `git branch -d <name>` | 刪除分支 |

### 查看與比較

| 指令 | 用途 |
|------|------|
| `git diff` | 查看未暫存變更 |
| `git diff --staged` | 查看已暫存變更 |
| `git log --oneline --graph` | 圖形化歷史 |
| `git show <commit>` | 查看特定 commit |

### 還原與取消

| 指令 | 用途 |
|------|------|
| `git checkout -- <file>` | 還原檔案到上次 commit |
| `git reset HEAD <file>` | 取消暫存 |
| `git reset --soft HEAD~1` | 取消 commit（保留變更） |
| `git stash` | 暫存目前工作 |
| `git stash pop` | 恢復暫存 |

---

## 常見問題

### 推送被拒絕

```
! [rejected] main -> main (fetch first)
```

遠端有新的變更，先拉取再推送：

```bash
git pull
git push
```

### 合併衝突

```
CONFLICT (content): Merge conflict in main.py
```

1. 開啟檔案，找到 `<<<<<<` 標記
2. 手動解決衝突
3. `git add main.py`
4. `git commit`

### 不小心 commit 了敏感資訊

```bash
# 如果還沒推送，取消 commit
git reset --soft HEAD~1

# 如果已推送，需要清除歷史（複雜，建議搜尋 "git remove sensitive data"）
```

> **預防**：把敏感資訊放在 `.env`，並加入 `.gitignore`。

---

## 與 Claude Code 搭配

在 Claude Code 中，可以直接請 Claude 執行 Git 操作：

```
> 請幫我 commit
> 請建立 feature-login 分支
> 請查看最近的 commit 歷史
> 這次改了哪些檔案？
```

Claude 會自動產生適當的 commit message，並解釋每個操作。

---

## 參考連結

- [Git 官方文件](https://git-scm.com/doc)
- [GitHub Docs](https://docs.github.com/)
- [Learn Git Branching（互動式學習）](https://learngitbranching.js.org/)
- [Oh Shit, Git!?!（常見問題解法）](https://ohshitgit.com/)
