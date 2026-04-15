---
layout: post
title: "SSH 資安防護指南：你的主機正在被攻擊"
subtitle: "從真實攻擊日誌出發，逐步建立完整的 SSH 防禦體系"
date: 2026-04-15
categories: [Linux]
tags: [SSH, Linux, Security, fail2ban, Firewall, 2FA]
---

> **SSH 系列文章**
> - [（一）SSH 金鑰設定完整指南]({% post_url 2026-04-13-ssh-keygen-guide %}) — ssh-keygen 參數、多金鑰管理
> - [（二）SSH 連線參數完整指南]({% post_url 2026-04-14-ssh-cli-guide %}) — X11、Tunnel、跳板機
> - **（三）本篇：SSH 資安防護指南**
> - [（四）SSH 實戰應用場景]({% post_url 2026-04-15-ssh-scenarios %}) — 咖啡廳連內網、翻牆、遠端 Demo
> - [（番外一）Tailscale 入門]({% post_url 2026-04-15-tailscale-vs-ssh-tunnel %}) — SSH Tunnel 的現代替代方案
> - [（番外二）Headscale 自架指南]({% post_url 2026-04-15-headscale-setup %}) — 無限裝置、DERP、多網段 ACL

---

## 為什麼寫這篇

你把一台主機開到公網，SSH port 對外開放。你覺得沒人知道你的 IP，應該很安全。

**錯。**

打開 `/var/log/auth.log` 看看：

```log
Apr 15 03:12:41 myserver sshd[12345]: Failed password for root from 185.220.101.34 port 44832 ssh2
Apr 15 03:12:43 myserver sshd[12346]: Failed password for root from 185.220.101.34 port 44833 ssh2
Apr 15 03:12:45 myserver sshd[12347]: Failed password for admin from 185.220.101.34 port 44834 ssh2
Apr 15 03:12:47 myserver sshd[12348]: Failed password for ubuntu from 45.133.1.72 port 38291 ssh2
Apr 15 03:12:49 myserver sshd[12349]: Failed password for test from 45.133.1.72 port 38292 ssh2
Apr 15 03:12:51 myserver sshd[12350]: Failed password for postgres from 92.255.85.135 port 52100 ssh2
```

這不是針對你。全世界有成千上萬的機器人 **24 小時掃描每一個 IP 的 port 22**，嘗試用常見帳號密碼登入。你的主機上線幾分鐘內就會開始被打。

這篇用**六個真實攻擊情境**，一步步建立你的 SSH 防禦體系。

---

## 情境一：暴力破解密碼

### 😈 攻擊者做了什麼

攻擊者用自動化工具，對你的主機嘗試成千上萬組帳號密碼：

```
┌──────────┐     port 22      ┌──────────────┐
│  攻擊者   │ ──────────────→ │   你的主機    │
│  (機器人) │                  │              │
│           │  root / 123456   │  SSH Server  │
│           │  admin / admin   │              │
│           │  ubuntu / ubuntu │  等著被猜...  │
│           │  test / test     │              │
│           │  ...重複幾萬次   │              │
└──────────┘                  └──────────────┘
```

### 🔍 你怎麼發現的

```bash
# 查看失敗登入記錄
grep "Failed password" /var/log/auth.log | tail -20

# 統計哪些 IP 在攻擊你
grep "Failed password" /var/log/auth.log | awk '{print $(NF-3)}' | sort | uniq -c | sort -rn | head -10
# 輸出範例：
#   4523 185.220.101.34
#   2891 45.133.1.72
#   1205 92.255.85.135

# 統計攻擊者嘗試了哪些帳號
grep "Failed password" /var/log/auth.log | awk '{print $9}' | sort | uniq -c | sort -rn | head -10
# 輸出範例：
#   8901 root
#   2341 admin
#   1523 ubuntu
#    892 test
#    456 postgres
```

### 🛡️ 防禦：禁止密碼登入

既然你已經設定好金鑰認證（參考[第一篇]({% post_url 2026-04-13-ssh-keygen-guide %})），直接關掉密碼登入：

```bash
sudo nano /etc/ssh/sshd_config
```

```bash
# 禁止密碼登入（只允許金鑰）
PasswordAuthentication no

# 禁止空密碼
PermitEmptyPasswords no

# 禁止 challenge-response 認證（某些系統的密碼登入後門）
ChallengeResponseAuthentication no
# 或在較新的系統上
KbdInteractiveAuthentication no
```

```bash
# 重啟 SSH 服務
sudo systemctl restart sshd
```

### ✅ 驗證防禦有效

```bash
# 嘗試用密碼登入（應該直接被拒絕）
ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no username@your-server
# 預期結果：Permission denied (publickey).

# 用金鑰登入（應該正常）
ssh username@your-server
```

> **⚠️ 重要**：修改 sshd_config 之前，確保你的金鑰登入是正常的！否則你會把自己鎖在外面。建議先開兩個 SSH session，一個改設定，另一個保持連線用來救援。

---

## 情境二：攻擊者都先試 root

### 😈 攻擊者做了什麼

從上面的日誌可以看到，**root 被嘗試的次數最多**。原因很簡單：每一台 Linux 都一定有 root 帳號，而且 root 有最高權限，打下來就是全拿。

```
攻擊者的字典檔：
  root:root
  root:123456
  root:password
  root:admin
  root:toor
  root:root123
  ...（幾十萬組）
```

### 🛡️ 防禦：禁止 root 登入 + 建立專用帳號

```bash
sudo nano /etc/ssh/sshd_config
```

```bash
# 完全禁止 root 透過 SSH 登入
PermitRootLogin no

# 或者只允許 root 用金鑰登入（但建議直接禁止）
# PermitRootLogin prohibit-password
```

**建立專用帳號 + sudo 權限**：

```bash
# 建立新帳號
sudo adduser deploy

# 加入 sudo 群組
sudo usermod -aG sudo deploy

# 設定金鑰（切換到新帳號）
sudo su - deploy
mkdir -p ~/.ssh
chmod 700 ~/.ssh
# 把你的公鑰貼到這裡
nano ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

```bash
# 重啟 SSH
sudo systemctl restart sshd
```

### ✅ 驗證

```bash
# root 登入應該被拒絕
ssh root@your-server
# Permission denied.

# 用新帳號登入，需要 root 權限時用 sudo
ssh deploy@your-server
sudo apt update  # 正常運作
```

---

## 情境三：Port 22 被全網掃描

### 😈 攻擊者做了什麼

網路上有大量的掃描器（如 Shodan、Masscan）**24 小時掃描整個 IPv4 地址空間**，找出開放 port 22 的主機。掃完就交給暴力破解工具自動攻擊。

```
掃描器掃全網 port 22
         │
         ▼
┌─ 1.0.0.1    → port 22 關閉 → 跳過
├─ 1.0.0.2    → port 22 開放 → 加入攻擊清單 ✓
├─ 1.0.0.3    → port 22 關閉 → 跳過
├─ ...
└─ 你的 IP    → port 22 開放 → 加入攻擊清單 ✓
```

### 🛡️ 防禦一：改 SSH Port

```bash
sudo nano /etc/ssh/sshd_config
```

```bash
# 改用非標準 port
Port 2222
# 可以選 1024-65535 之間的任意 port
# 常見選擇：2222, 22222, 或隨機的高位 port
```

```bash
sudo systemctl restart sshd
```

```bash
# 之後連線要指定 port
ssh -p 2222 username@your-server
```

> 改 port 不是真正的安全措施（security through obscurity），但它能擋掉 99% 的自動化掃描機器人。搭配其他防禦才有效。

### 🛡️ 防禦二：防火牆限制來源 IP

```bash
# 使用 ufw（Ubuntu 預設防火牆）
sudo ufw default deny incoming
sudo ufw default allow outgoing

# 只允許特定 IP 連 SSH
sudo ufw allow from 203.0.113.10 to any port 2222 proto tcp

# 或允許整個公司網段
sudo ufw allow from 10.0.0.0/8 to any port 2222 proto tcp

# 開放其他必要服務
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS

# 啟用防火牆
sudo ufw enable
sudo ufw status
```

### 🛡️ 防禦三：fail2ban 自動封鎖

fail2ban 會監控登入日誌，發現某個 IP 連續失敗就自動封鎖：

```bash
# 安裝
sudo apt install fail2ban

# 建立自訂設定（不要直接改 jail.conf）
sudo nano /etc/fail2ban/jail.local
```

```ini
[sshd]
enabled = true
port = 2222
filter = sshd
logpath = /var/log/auth.log

# 10 分鐘內失敗 3 次就封鎖
maxretry = 3
findtime = 600

# 封鎖 1 小時
bantime = 3600

# 累犯加重封鎖（fail2ban 0.11+）
bantime.increment = true
bantime.factor = 2
# 第一次 1hr → 第二次 2hr → 第三次 4hr → ...
```

```bash
# 啟動
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# 查看目前被封鎖的 IP
sudo fail2ban-client status sshd
```

### ✅ 驗證

```bash
# 查看 fail2ban 狀態
sudo fail2ban-client status sshd
# Status for the jail: sshd
# |- Filter
# |  |- Currently failed: 2
# |  |- Total failed:     156
# |  `- File list:        /var/log/auth.log
# `- Actions
#    |- Currently banned: 3
#    |- Total banned:     47
#    `- Banned IP list:   185.220.101.34 45.133.1.72 92.255.85.135

# 手動解鎖某個 IP（不小心把自己鎖住時）
sudo fail2ban-client set sshd unbanip 203.0.113.10
```

---

## 情境四：私鑰不小心外洩

### 😈 發生了什麼

```bash
# 新手常見的悲劇
cd my-project
git add .                    # 不小心把 .ssh 目錄加進去了
git commit -m "init"
git push origin main         # 私鑰推到 GitHub 了！

# 或者
scp ~/.ssh/id_ed25519 colleague@shared-server:~/   # 把私鑰傳給同事
```

GitHub 上有自動化工具在掃描每一個新 commit，找出 SSH 私鑰和其他 secret。推上去幾分鐘內就會被發現。

### 🛡️ 防禦：多層保護

**第一層：私鑰加 passphrase**

```bash
# 產生金鑰時設定 passphrase
ssh-keygen -t ed25519 -C "ct@company.com"
# 在提示時輸入 passphrase（不要留空）

# 已有的金鑰補上 passphrase
ssh-keygen -p -f ~/.ssh/id_ed25519

# 搭配 ssh-agent 就不用每次都輸入
eval $(ssh-agent)
ssh-add ~/.ssh/id_ed25519   # 輸入一次 passphrase
# 之後這個 session 都不用再輸入
```

即使私鑰被偷，沒有 passphrase 也解不開。

**第二層：.gitignore 預防**

```bash
# 全域 .gitignore
echo ".ssh/" >> ~/.gitignore_global
git config --global core.excludesfile ~/.gitignore_global

# 專案的 .gitignore
echo "*.pem" >> .gitignore
echo "*.key" >> .gitignore
echo "id_*" >> .gitignore
```

**第三層：外洩後的緊急處理 SOP**

```bash
# 1. 立刻產生新金鑰
ssh-keygen -t ed25519 -C "ct@company.com-new" -f ~/.ssh/id_ed25519_new

# 2. 到所有主機上替換 authorized_keys
#    移除舊公鑰，加入新公鑰

# 3. 到 GitHub/GitLab 替換 SSH Key
#    Settings → SSH Keys → 刪除舊的，加入新的

# 4. 從 Git 歷史中清除私鑰
#    （即使刪除檔案，Git 歷史中還是看得到）
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch .ssh/id_ed25519" \
  --prune-empty -- --all
git push --force

# 5. 刪除舊金鑰
rm ~/.ssh/id_ed25519_old ~/.ssh/id_ed25519_old.pub
```

---

## 情境五：中間人攻擊 (MITM)

### 😈 攻擊者做了什麼

你第一次連到一台新主機，SSH 會問你：

```
The authenticity of host 'server.example.com (192.168.1.100)' can't be established.
ED25519 key fingerprint is SHA256:abc123def456...
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

大多數人直接打 `yes`。但如果攻擊者在你和真正的伺服器之間攔截了連線呢？

```
┌──────────┐          ┌──────────┐          ┌──────────┐
│  你的筆電 │ ───────→│  攻擊者   │ ───────→│  真正的   │
│          │          │ (假冒主機) │          │  伺服器   │
│  "yes"   │          │          │          │          │
│  打了密碼 │          │  記錄你的  │          │          │
│          │          │  所有操作  │          │          │
└──────────┘          └──────────┘          └──────────┘
```

### 🔍 known_hosts 是什麼

你打 `yes` 之後，SSH 會把那台主機的指紋記錄到 `~/.ssh/known_hosts`。下次連線時會自動比對。

如果指紋突然變了，你會看到這個大警告：

```
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
IT IS POSSIBLE THAT SOMEONE IS DOING SOMETHING NASTY!
Someone could be eavesdropping on you right now (man-in-the-middle attack)!
```

**這個警告是在保護你。不要無腦刪掉 known_hosts 來「解決」這個問題。**

### 🛡️ 防禦：正確驗證主機指紋

```bash
# 情況一：你確定主機重灌了或 SSH key 換了
# 先跟管理員確認新的指紋，再移除舊紀錄
ssh-keygen -R server.example.com

# 情況二：你第一次連線，想確認指紋
# 請管理員在伺服器上執行：
ssh-keygen -l -f /etc/ssh/ssh_host_ed25519_key.pub
# 把輸出的指紋傳給你，你比對後再輸入 yes

# 情況三：你不確定為什麼指紋變了
# 不要連線！先聯絡管理員確認
```

**在 sshd_config 中強化**：

```bash
# 只使用 ed25519 host key（更安全）
HostKey /etc/ssh/ssh_host_ed25519_key

# 移除較弱的 host key
# HostKey /etc/ssh/ssh_host_rsa_key      ← 註解掉
# HostKey /etc/ssh/ssh_host_ecdsa_key    ← 註解掉
```

---

## 情境六：進階防護

### Port Knocking — 先敲門暗號才開 SSH

```
預設狀態：SSH port 完全關閉，掃描器看不到

你（知道暗號）：
  1. 連 port 7000  ← 第一敲
  2. 連 port 8000  ← 第二敲
  3. 連 port 9000  ← 第三敲
  → 防火牆自動對你的 IP 開放 SSH port 30 秒
  → 你趕快 SSH 連進去
  → 30 秒後 SSH port 再次關閉
```

```bash
# 安裝 knockd
sudo apt install knockd

# 設定 /etc/knockd.conf
[options]
    UseSyslog

[openSSH]
    sequence    = 7000,8000,9000
    seq_timeout = 5
    command     = /sbin/iptables -A INPUT -s %IP% -p tcp --dport 2222 -j ACCEPT
    tcpflags    = syn

[closeSSH]
    sequence    = 9000,8000,7000
    seq_timeout = 5
    command     = /sbin/iptables -D INPUT -s %IP% -p tcp --dport 2222 -j ACCEPT
    tcpflags    = syn
```

```bash
# 客戶端敲門
knock your-server 7000 8000 9000
# 然後立刻連線
ssh -p 2222 username@your-server

# 離開後關門
knock your-server 9000 8000 7000
```

### 雙因素認證 (2FA) — Google Authenticator

```bash
# 安裝
sudo apt install libpam-google-authenticator

# 以你的帳號執行設定
google-authenticator
# 會產生 QR code，用手機的 Google Authenticator app 掃描
# 回答幾個問題（建議都選 yes）
```

```bash
# 設定 PAM
sudo nano /etc/pam.d/sshd
# 加入這行：
auth required pam_google_authenticator.so

# 設定 sshd_config
sudo nano /etc/ssh/sshd_config
ChallengeResponseAuthentication yes
# 或較新的系統：
KbdInteractiveAuthentication yes

# 同時要求金鑰 + 2FA
AuthenticationMethods publickey,keyboard-interactive

sudo systemctl restart sshd
```

**登入流程變成**：

```
SSH 連線
  │
  ├─ 第一關：金鑰認證（自動通過）
  │
  └─ 第二關：Verification code: ______
              輸入手機 App 上的 6 位數驗證碼
              │
              └─ 驗證通過 → 登入成功
```

---

## 完整的 sshd_config 防護範本

把以上所有防禦整合在一起：

```bash
# /etc/ssh/sshd_config

# === 基本設定 ===
Port 2222                              # 改掉預設 port
ListenAddress 0.0.0.0                  # 監聽所有介面（或指定內網介面）

# === 認證設定 ===
PermitRootLogin no                     # 禁止 root 登入
PasswordAuthentication no              # 禁止密碼登入
PermitEmptyPasswords no                # 禁止空密碼
PubkeyAuthentication yes               # 允許金鑰認證
AuthorizedKeysFile .ssh/authorized_keys

# === 安全強化 ===
MaxAuthTries 3                         # 最多嘗試 3 次
MaxSessions 5                          # 最多 5 個 session
LoginGraceTime 30                      # 30 秒內要完成認證
ClientAliveInterval 300                # 5 分鐘沒動作就斷線
ClientAliveCountMax 2                  # 2 次沒回應就踢掉

# === 限制使用者 ===
AllowUsers deploy admin                # 只允許這些帳號 SSH 登入
# 或用群組限制
# AllowGroups ssh-users

# === 停用不需要的功能 ===
X11Forwarding no                       # 不需要 GUI 就關掉
AllowTcpForwarding no                  # 不需要 tunnel 就關掉
# （如果你需要 tunnel，改成 yes）

# === Host Key ===
HostKey /etc/ssh/ssh_host_ed25519_key  # 只用最安全的演算法

# === 日誌 ===
LogLevel VERBOSE                       # 記錄詳細日誌
```

```bash
# 檢查設定語法
sudo sshd -t
# 沒有輸出 = 語法正確

# 重啟生效
sudo systemctl restart sshd
```

---

## 防禦層級總整理

由外到內，每一層都在擋不同的攻擊：

```
第一層：改 Port
  → 擋掉 99% 自動掃描機器人
    │
第二層：防火牆（ufw）
  → 限制誰能碰到你的 SSH port
    │
第三層：fail2ban
  → 自動封鎖暴力破解的 IP
    │
第四層：禁止密碼登入
  → 沒有金鑰 = 完全進不來
    │
第五層：禁止 root 登入
  → 猜到帳號名稱的難度大增
    │
第六層：2FA
  → 即使私鑰被偷也還有一道防線
    │
第七層：Port Knocking
  → SSH port 根本看不到
```

不是每一層都要做。**最低限度**建議前五層，2FA 和 Port Knocking 視安全需求而定。

---

## 總結

SSH 資安的核心原則只有一個：**減少攻擊面**。

- 不需要密碼登入 → 關掉
- 不需要 root 登入 → 關掉
- 不需要所有人都能連 → 防火牆限制
- 有人在暴力破解 → fail2ban 封鎖
- 私鑰可能被偷 → passphrase + 2FA

先從最基本的做起，再根據你的環境需求逐步加強。

> **上一篇**：[SSH 連線參數完整指南]({% post_url 2026-04-14-ssh-cli-guide %}) — X11、Tunnel、跳板機等進階用法
> **下一篇**：[SSH 實戰應用場景]({% post_url 2026-04-15-ssh-scenarios %}) — 咖啡廳連內網、翻牆、遠端 Demo
> **番外一**：[Tailscale 入門]({% post_url 2026-04-15-tailscale-vs-ssh-tunnel %}) — SSH Tunnel 的現代替代方案
> **番外二**：[Headscale 自架指南]({% post_url 2026-04-15-headscale-setup %}) — 無限裝置、DERP、多網段 ACL

---

## 參考資源

- [sshd_config(5) — OpenBSD Manual Pages](https://man.openbsd.org/sshd_config.5)
- [fail2ban — Official Documentation](https://www.fail2ban.org/wiki/index.php/Main_Page)
- [fail2ban — GitHub Repository](https://github.com/fail2ban/fail2ban)
- [UFW — Ubuntu Community Help](https://help.ubuntu.com/community/UFW)
- [Google Authenticator PAM Module — GitHub](https://github.com/google/google-authenticator-libpam)
- [knockd — Port Knocking](https://github.com/jvinet/knock)
