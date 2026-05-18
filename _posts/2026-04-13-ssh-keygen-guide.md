---
layout: post
title: "SSH 金鑰設定完整指南：ssh-keygen 從產生到管理"
subtitle: "公私鑰概念、每個參數說明、多金鑰管理、常見錯誤排除"
date: 2026-04-13
categories: [Linux]
tags: [SSH, Linux, Security, ssh-keygen, Terminal]
---

![SSH 金鑰設定完整指南：ssh-keygen 從產生到管理](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-04-13-ssh-keygen-guide.png)

> **SSH 系列文章**
> - **（一）本篇：SSH 金鑰設定完整指南**
> - [（二）SSH 連線參數完整指南]({% post_url 2026-04-14-ssh-cli-guide %}) — X11、Tunnel、跳板機
> - [（三）SSH 資安防護指南]({% post_url 2026-04-15-ssh-security %}) — 攻擊手法與防禦體系
> - [（四）SSH 實戰應用場景]({% post_url 2026-04-15-ssh-scenarios %}) — 咖啡廳連內網、翻牆、遠端 Demo
> - [（番外一）Tailscale 入門]({% post_url 2026-04-15-tailscale-vs-ssh-tunnel %}) — SSH Tunnel 的現代替代方案
> - [（番外二）Headscale 自架指南]({% post_url 2026-04-15-headscale-setup %}) — 無限裝置、DERP、多網段 ACL

---

## 為什麼寫這篇

新進工程師第一天拿到公司電腦，通常第一件事就是要 SSH 連到開發機或部署伺服器。但很多人卡在第一步：**怎麼產生 SSH 金鑰？**

這篇從零開始，涵蓋：

- 公私鑰的概念（為什麼不用密碼登入）
- `ssh-keygen` 每個參數的用途
- 公鑰部署到遠端主機
- 多把金鑰的管理方式
- 常見錯誤與排除

---

## 什麼是公私鑰？

SSH 金鑰認證的運作方式類似門鎖：

- **私鑰**（Private Key）= 你的鑰匙，**絕對不能給別人**
- **公鑰**（Public Key）= 鎖頭，放在你想連的遠端主機上

連線時，遠端主機用公鑰出題，你的本機用私鑰解題，解對了就放行。整個過程密碼不會在網路上傳輸。

**為什麼不用密碼就好？**

| | 密碼登入 | 金鑰登入 |
|---|---|---|
| 安全性 | 密碼可能被暴力破解 | 私鑰幾乎不可能被破解 |
| 便利性 | 每次都要輸入密碼 | 設定一次後免密碼 |
| 自動化 | 腳本中放密碼很危險 | 金鑰認證天然適合自動化 |
| 管理 | 換密碼要通知所有人 | 撤銷公鑰即可 |

---

## 產生金鑰對

```bash
# 推薦使用 ed25519 演算法（更安全、金鑰更短）
ssh-keygen -t ed25519 -C "your_email@example.com"
```

執行後會問你三件事：

```
Generating public/private ed25519 key pair.

# 1. 金鑰存放位置（按 Enter 用預設路徑即可）
Enter file in which to save the key (/home/ct/.ssh/id_ed25519):

# 2. 設定密碼（passphrase）
#    - 設密碼：每次使用金鑰時要輸入，更安全
#    - 留空（直接 Enter）：免密碼，方便但私鑰被偷就完了
Enter passphrase (empty for no passphrase):

# 3. 確認密碼
Enter same passphrase again:
```

完成後會產生兩個檔案：

```
~/.ssh/id_ed25519       ← 私鑰（絕對不能外流！）
~/.ssh/id_ed25519.pub   ← 公鑰（這個要放到遠端主機）
```

---

## `ssh-keygen` 參數完整說明

### `-t`：指定演算法類型（**必填**）

```bash
ssh-keygen -t ed25519
ssh-keygen -t rsa
```

- **用途**：決定金鑰使用哪種加密演算法
- **可選值**：

| 演算法 | 指令 | 說明 |
|--------|------|------|
| **ed25519** | `ssh-keygen -t ed25519` | **推薦**，最安全、速度快、金鑰短 |
| rsa | `ssh-keygen -t rsa` | 相容性最好，老舊系統可能只支援這個 |
| ecdsa | `ssh-keygen -t ecdsa` | 介於兩者之間，但有爭議 |
| dsa | `ssh-keygen -t dsa` | **已棄用**，不要使用 |

> **新手建議**：直接用 `ed25519`，除非遠端系統太舊不支援才改用 `rsa`。

### `-b`：指定金鑰長度（位元數）

```bash
ssh-keygen -t rsa -b 4096
ssh-keygen -t ecdsa -b 521
```

- **用途**：金鑰越長越安全，但產生和驗證速度會稍慢
- **各演算法建議值**：

| 演算法 | 預設值 | 建議值 | 說明 |
|--------|--------|--------|------|
| rsa | 3072 | **4096** | 低於 2048 已不安全 |
| ecdsa | 256 | 256 / 384 / **521** | 只能選這三個值 |
| ed25519 | 256 | — | 固定長度，**不需要也不能指定 `-b`** |

### `-C`：加註解

```bash
ssh-keygen -t ed25519 -C "ct@company.com"
ssh-keygen -t ed25519 -C "ct-macbook-2026"
```

- **用途**：在公鑰尾端加上一段文字，方便辨識這把 key 是誰的、哪台電腦的
- **不影響安全性**，純粹是標記用途
- **實際效果**：

```bash
cat ~/.ssh/id_ed25519.pub
# ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... ct@company.com
#                                            ^^^^^^^^^^^^^^ 這就是 -C 的內容
```

- **不加 `-C` 的話**：預設會用 `使用者名稱@主機名稱`（如 `ct@ct-desktop`）

### `-f`：指定金鑰檔案路徑

```bash
ssh-keygen -t ed25519 -f ~/.ssh/work_key
ssh-keygen -t ed25519 -f ~/.ssh/github_key
```

- **用途**：指定金鑰存放的檔案名稱和路徑，不用在互動提示時手動輸入
- **不加 `-f` 的話**：會在互動提示中問你要存在哪裡（預設 `~/.ssh/id_ed25519`）
- **常見情境**：管理多把金鑰時，用 `-f` 指定不同檔名

### `-N`：指定 passphrase（密碼）

```bash
# 設定密碼
ssh-keygen -t ed25519 -N "my_passphrase"

# 設定空密碼（免密碼，常用於自動化腳本）
ssh-keygen -t ed25519 -N ""
```

- **用途**：直接在指令中帶入密碼，不用在互動提示中輸入
- **常見情境**：自動化腳本中產生金鑰時使用，避免互動式輸入

### `-p`：更換現有金鑰的密碼

```bash
ssh-keygen -p -f ~/.ssh/id_ed25519
# 會先問舊密碼，再問新密碼
```

- **用途**：修改已經存在的私鑰的 passphrase
- **常見情境**：
  - 當初偷懶沒設密碼，現在要補上
  - 想把有密碼的 key 改成無密碼（反過來也行）

### `-l`：查看金鑰指紋

```bash
# 查看自己的公鑰指紋
ssh-keygen -l -f ~/.ssh/id_ed25519.pub

# 輸出範例：
# 256 SHA256:abc123... ct@company.com (ED25519)
```

- **用途**：顯示金鑰的指紋（fingerprint），用來確認兩把 key 是不是同一把
- **常見情境**：GitHub / GitLab 設定頁面會顯示金鑰指紋，你可以比對是否正確

### `-R`：從 known_hosts 移除主機

```bash
ssh-keygen -R 192.168.1.100
ssh-keygen -R myserver.com
```

- **用途**：當遠端主機重灌或 SSH key 更換後，刪除 `~/.ssh/known_hosts` 中的舊紀錄
- **常見情境**：看到這個錯誤時使用：

```
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
```

### `-y`：從私鑰產生公鑰

```bash
ssh-keygen -y -f ~/.ssh/id_ed25519 > ~/.ssh/id_ed25519.pub
```

- **用途**：如果公鑰不見了，可以從私鑰重新產生
- **執行條件**：你還有私鑰檔案

---

## `ssh-keygen` 參數速查表

| 參數 | 用途 | 範例 |
|------|------|------|
| `-t` | 指定演算法 | `-t ed25519` |
| `-b` | 指定金鑰長度 | `-b 4096`（rsa 用） |
| `-C` | 加註解標記 | `-C "ct@company.com"` |
| `-f` | 指定檔案路徑 | `-f ~/.ssh/work_key` |
| `-N` | 指定 passphrase | `-N ""`（空密碼） |
| `-p` | 更換密碼 | `-p -f ~/.ssh/id_ed25519` |
| `-l` | 查看指紋 | `-l -f ~/.ssh/id_ed25519.pub` |
| `-R` | 移除 known_hosts 紀錄 | `-R 192.168.1.100` |
| `-y` | 從私鑰產生公鑰 | `-y -f ~/.ssh/id_ed25519` |

**新手最常用的一行指令**：

```bash
ssh-keygen -t ed25519 -C "your_email@example.com" -f ~/.ssh/id_ed25519
# -t：用最安全的演算法
# -C：標記這把 key 是誰的
# -f：存到預設路徑（也可以改成別的名字）
```

---

## 把公鑰放到遠端主機

```bash
# 方法一：ssh-copy-id（最簡單，推薦）
ssh-copy-id username@remote_host
# 會要求輸入遠端密碼，之後就不用了

# 方法二：手動複製（ssh-copy-id 不能用時）
cat ~/.ssh/id_ed25519.pub
# 複製輸出的內容，貼到遠端的 ~/.ssh/authorized_keys 檔案裡
```

手動設定時，**權限必須正確**，否則 SSH 會拒絕使用：

```bash
# 在遠端主機上執行
mkdir -p ~/.ssh
chmod 700 ~/.ssh                      # 只有自己能進
chmod 600 ~/.ssh/authorized_keys      # 只有自己能讀寫
```

---

## 本機私鑰權限

本機的私鑰權限如果太寬鬆，SSH 會直接拒絕使用：

```bash
# 如果看到這個錯誤：
# WARNING: UNPROTECTED PRIVATE KEY FILE!
# Permissions 0644 for '/home/ct/.ssh/id_ed25519' are too open.

# 修正方式：
chmod 600 ~/.ssh/id_ed25519           # 私鑰：只有自己能讀寫
chmod 644 ~/.ssh/id_ed25519.pub       # 公鑰：別人可以讀（沒關係）
```

### SSH 相關檔案權限總整理

| 檔案 / 目錄 | 權限 | 說明 |
|-------------|------|------|
| `~/.ssh/` | `700` | 只有自己能進 |
| `~/.ssh/id_ed25519`（私鑰） | `600` | 只有自己能讀寫 |
| `~/.ssh/id_ed25519.pub`（公鑰） | `644` | 別人可以讀 |
| `~/.ssh/authorized_keys` | `600` | 只有自己能讀寫 |
| `~/.ssh/config` | `600` | 只有自己能讀寫 |
| `~/.ssh/known_hosts` | `644` | 別人可以讀 |

---

## 管理多把金鑰

實務上你可能有多把金鑰（公司用一把、GitHub 一把、個人 VPS 一把）：

```bash
# 產生時指定不同檔名
ssh-keygen -t ed25519 -C "work" -f ~/.ssh/work_key
ssh-keygen -t ed25519 -C "github" -f ~/.ssh/github_key
ssh-keygen -t ed25519 -C "personal" -f ~/.ssh/personal_key
```

然後在 `~/.ssh/config` 中指定每台主機用哪把：

```bash
Host company-server
    HostName 10.0.0.50
    User deploy
    IdentityFile ~/.ssh/work_key

Host github.com
    IdentityFile ~/.ssh/github_key

Host my-vps
    HostName 203.0.113.10
    User ct
    IdentityFile ~/.ssh/personal_key
```

> **為什麼要分開？** 如果只用一把 key，萬一那把 key 外洩，所有主機都要重新設定。分開管理的話，外洩一把只需要處理對應的主機。

---

## 驗證金鑰是否設定成功

```bash
# 連線測試（不用密碼就進去 = 成功）
ssh username@remote_host

# 如果失敗，加 -vvv 看詳細原因
ssh -vvv username@remote_host
# 重點看這幾行：
#   Offering public key: /home/ct/.ssh/id_ed25519  ← 有沒有嘗試你的 key
#   Server accepts key: /home/ct/.ssh/id_ed25519   ← 伺服器有沒有接受
```

### GitHub / GitLab 金鑰驗證

```bash
# GitHub
ssh -T git@github.com
# 成功會顯示：Hi username! You've been authenticated...

# GitLab
ssh -T git@gitlab.com
# 成功會顯示：Welcome to GitLab, @username!
```

---

## 常見錯誤與排除

| 錯誤訊息 | 原因 | 解法 |
|---------|------|------|
| `Permission denied (publickey)` | 遠端沒有你的公鑰，或用了錯的 key | `ssh -vvv` 確認用了哪把 key；重新 `ssh-copy-id` |
| `WARNING: UNPROTECTED PRIVATE KEY FILE!` | 私鑰權限太寬鬆 | `chmod 600 ~/.ssh/id_ed25519` |
| `Too many authentication failures` | SSH agent 有太多 key，伺服器拒絕 | 加 `-o IdentitiesOnly=yes` 或在 config 指定 `IdentityFile` |
| `REMOTE HOST IDENTIFICATION HAS CHANGED` | 遠端主機重灌或 key 更換 | `ssh-keygen -R hostname` |
| `Could not open a connection to your authentication agent` | ssh-agent 沒有啟動 | `eval $(ssh-agent)` 然後 `ssh-add` |
| `Enter passphrase for key` 每次都要輸入 | 金鑰有設 passphrase | `ssh-add ~/.ssh/id_ed25519` 加入 agent 就不用每次輸入 |

---

## 總結

SSH 金鑰設定是工程師的基本功，搞定這一步之後，接下來就可以學習 SSH 的各種連線參數了。

**新手 checklist**：

1. `ssh-keygen -t ed25519 -C "your_email"` — 產生金鑰
2. `chmod 600 ~/.ssh/id_ed25519` — 確認私鑰權限
3. `ssh-copy-id user@host` — 部署公鑰到遠端
4. `ssh user@host` — 測試連線
5. 設定 `~/.ssh/config` — 管理多台主機和多把金鑰

> **下一篇**：[SSH 連線參數完整指南]({% post_url 2026-04-14-ssh-cli-guide %}) — 學會 `-X`、`-L`、`-R`、`-J` 等進階參數

---

## 參考資源

- [ssh-keygen(1) — OpenBSD Manual Pages](https://man.openbsd.org/ssh-keygen.1)
- [OpenSSH Release Notes](https://www.openssh.com/releasenotes.html)
- [GitHub — Connecting to GitHub with SSH](https://docs.github.com/en/authentication/connecting-to-github-with-ssh)
- [GitLab — Use SSH keys to communicate with GitLab](https://docs.gitlab.com/ee/user/ssh.html)
