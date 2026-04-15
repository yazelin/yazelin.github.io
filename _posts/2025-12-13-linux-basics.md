---
layout: post
title: "Linux 終端機入門：開發者必備指令"
subtitle: "從零開始掌握 Ubuntu 常用操作"
date: 2025-12-13
categories: [Linux]
tags: [Linux, Ubuntu, Terminal, SSH, rsync]
---

![Linux 終端機入門：開發者必備指令](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2025-12-13-linux-basics.png)

> **📚 延伸閱讀**
> - [Git 入門：版本控制基礎指令]({% post_url 2025-12-13-git-basics %})
> - [Docker 基礎概念與常用指令]({% post_url 2025-12-13-docker-basics %})
> - [ChingTech OS 技術分享系列：完整目錄]({% post_url 2025-12-13-ching-tech-os-index %})

---

## 這篇文章要解決什麼問題？

**新人**：「我之前都用 Windows，現在要用 Ubuntu 開發，完全不知道怎麼操作...」

**資深工程師**：「Linux 用終端機操作，一開始會不習慣，但熟悉後效率很高。」

**新人**：「終端機那個黑黑的畫面？看起來好複雜。」

**資深工程師**：「其實常用的指令就那幾個，我來教你最實用的。」

這篇文章涵蓋：
- 終端機基本操作（檔案、目錄）
- 權限管理（chmod、chown）
- 服務管理（systemctl）
- 遠端連線（SSH、rsync）
- 實用技巧

---

## 技術概念

### 為什麼要學終端機？

| 操作方式 | 優點 | 缺點 |
|----------|------|------|
| 圖形介面 (GUI) | 直覺、易上手 | 無法自動化、效率較低 |
| 終端機 (CLI) | 可自動化、效率高、遠端操作 | 需要記指令 |

開發者日常工作很多在終端機完成：
- Git 版本控制
- Docker 容器管理
- SSH 遠端連線
- 執行腳本、啟動服務

### 終端機基本認識

```bash
ct@ubuntu:~/projects$
│  │      │
│  │      └── 目前所在目錄（~ 代表家目錄）
│  └── 主機名稱
└── 使用者名稱

$ 代表一般使用者
# 代表 root（管理員）
```

---

## 跟著做：基礎指令

### 1. 目錄操作

```bash
# 顯示目前所在目錄
pwd
# /home/ct/projects

# 列出目錄內容
ls              # 簡單列出
ls -l           # 詳細列出（權限、大小、時間）
ls -la          # 包含隱藏檔（以 . 開頭的檔案）
ls -lh          # 檔案大小用人類可讀格式（KB、MB）

# 切換目錄
cd /home/ct     # 切換到指定目錄
cd ~            # 切換到家目錄（/home/ct）
cd ..           # 切換到上一層目錄
cd -            # 切換到前一個目錄

# 建立目錄
mkdir myproject              # 建立單一目錄
mkdir -p a/b/c               # 建立巢狀目錄（自動建立父目錄）

# 刪除目錄
rmdir empty_dir              # 刪除空目錄
rm -r myproject              # 刪除目錄及其內容（小心使用！）
```

### 2. 檔案操作

```bash
# 建立空檔案
touch newfile.txt

# 複製檔案
cp file.txt backup.txt           # 複製檔案
cp -r folder/ folder_backup/     # 複製目錄（-r 遞迴）

# 移動/重新命名
mv old.txt new.txt               # 重新命名
mv file.txt ~/Documents/         # 移動到其他目錄

# 刪除檔案
rm file.txt                      # 刪除檔案
rm -f file.txt                   # 強制刪除（不詢問）
rm -rf folder/                   # 強制刪除目錄（危險！）

# 查看檔案內容
cat file.txt                     # 顯示整個檔案
head -n 20 file.txt              # 顯示前 20 行
tail -n 20 file.txt              # 顯示後 20 行
tail -f logfile.log              # 持續追蹤檔案（看 log 很實用）
less file.txt                    # 分頁瀏覽（按 q 離開）
```

### 3. 搜尋

```bash
# 搜尋檔案
find . -name "*.py"              # 在目前目錄找所有 .py 檔
find /home -name "config*"       # 在 /home 找 config 開頭的檔案

# 搜尋檔案內容
grep "error" logfile.log         # 在檔案中搜尋 "error"
grep -r "TODO" .                 # 在目錄中遞迴搜尋
grep -i "error" log.txt          # 不分大小寫搜尋
grep -n "error" log.txt          # 顯示行號

# 更快的搜尋工具（需安裝）
# sudo apt install ripgrep
rg "pattern" .                   # ripgrep，比 grep 快很多
```

### 4. 管線與重導向

```bash
# 管線（|）：把前一個指令的輸出傳給下一個指令
ls -la | grep ".txt"             # 列出檔案，只顯示 .txt
cat log.txt | grep "error" | wc -l   # 計算 error 出現幾次

# 重導向：把輸出存到檔案
echo "Hello" > file.txt          # 覆蓋寫入
echo "World" >> file.txt         # 附加寫入
command 2>&1                     # 把錯誤訊息導到標準輸出

# 實用組合
ps aux | grep python             # 找 python 相關程序
docker ps | grep running         # 找運行中的容器
```

---

## 權限管理

### 理解權限

```bash
ls -l file.txt
# -rw-r--r-- 1 ct ct 1024 Dec 10 10:00 file.txt
#  │││ │││ │││
#  │││ │││ └── 其他人權限 (r--)
#  │││ └── 群組權限 (r--)
#  └── 擁有者權限 (rw-)
```

| 符號 | 數字 | 意義 |
|------|------|------|
| r | 4 | 讀取 (read) |
| w | 2 | 寫入 (write) |
| x | 1 | 執行 (execute) |

### chmod：修改權限

```bash
# 符號方式
chmod +x script.sh               # 加上執行權限
chmod u+w file.txt               # 擁有者加上寫入權限
chmod go-w file.txt              # 群組和其他人移除寫入權限

# 數字方式（常用）
chmod 755 script.sh              # rwxr-xr-x（腳本常用）
chmod 644 file.txt               # rw-r--r--（一般檔案）
chmod 600 secret.key             # rw-------（私密檔案）

# 遞迴修改
chmod -R 755 folder/             # 目錄下所有檔案
```

常用權限組合：
| 數字 | 權限 | 用途 |
|------|------|------|
| 755 | rwxr-xr-x | 可執行腳本、目錄 |
| 644 | rw-r--r-- | 一般檔案 |
| 600 | rw------- | 私密檔案（如 SSH 金鑰） |
| 777 | rwxrwxrwx | 所有人都能做任何事（不建議） |

### chown：修改擁有者

```bash
# 修改擁有者
sudo chown ct file.txt           # 改擁有者為 ct
sudo chown ct:developers file.txt    # 改擁有者和群組
sudo chown -R ct:ct folder/      # 遞迴修改目錄
```

---

## 套件管理（apt）

Ubuntu 使用 `apt` 管理軟體套件：

```bash
# 更新套件清單（建議定期執行）
sudo apt update

# 升級已安裝的套件
sudo apt upgrade

# 安裝套件
sudo apt install vim git curl

# 移除套件
sudo apt remove package_name
sudo apt autoremove              # 移除不需要的依賴

# 搜尋套件
apt search keyword

# 查看已安裝套件
apt list --installed | grep docker
```

---

## 服務管理（systemctl）

Ubuntu 使用 `systemd` 管理系統服務：

```bash
# 查看服務狀態
systemctl status docker
systemctl status nginx

# 啟動/停止服務
sudo systemctl start docker
sudo systemctl stop docker
sudo systemctl restart docker

# 開機自動啟動
sudo systemctl enable docker     # 啟用
sudo systemctl disable docker    # 停用

# 查看所有服務
systemctl list-units --type=service

# 查看服務日誌
journalctl -u docker             # 查看 docker 服務日誌
journalctl -u docker -f          # 持續追蹤
journalctl -u docker --since "1 hour ago"
```

---

## 遠端連線

### SSH：安全遠端連線

```bash
# 基本連線
ssh username@192.168.1.100

# 指定埠號
ssh -p 2222 username@192.168.1.100

# 使用金鑰連線
ssh -i ~/.ssh/my_key username@host

# 第一次連線會詢問是否信任，輸入 yes
```

**SSH 金鑰設定（免密碼登入）：**

```bash
# 1. 產生金鑰對
ssh-keygen -t ed25519 -C "your_email@example.com"
# 按 Enter 使用預設路徑，可設定密碼或留空

# 2. 複製公鑰到遠端主機
ssh-copy-id username@remote_host

# 3. 之後就能免密碼登入
ssh username@remote_host
```

**SSH 設定檔（~/.ssh/config）：**

```bash
# ~/.ssh/config
Host myserver
    HostName 192.168.1.100
    User ct
    Port 22
    IdentityFile ~/.ssh/id_ed25519

# 之後可以直接用
ssh myserver
```

> **想深入了解？SSH 完整系列文章：**
> - [SSH 金鑰設定完整指南]({% post_url 2026-04-13-ssh-keygen-guide %}) — ssh-keygen 參數詳解、多金鑰管理
> - [SSH 連線參數完整指南]({% post_url 2026-04-14-ssh-cli-guide %}) — X11、Port Forwarding、跳板機
> - [SSH 資安防護指南]({% post_url 2026-04-15-ssh-security %}) — 攻擊手法與防禦體系
> - [SSH 實戰應用場景]({% post_url 2026-04-15-ssh-scenarios %}) — 咖啡廳連內網、翻牆、遠端 Demo
> - [Tailscale — SSH Tunnel 的現代替代方案]({% post_url 2026-04-15-tailscale-vs-ssh-tunnel %})
> - [Headscale 自架指南]({% post_url 2026-04-15-headscale-setup %}) — 無限裝置、DERP、多網段 ACL

### SCP：安全複製檔案

```bash
# 上傳到遠端
scp file.txt user@host:/path/to/destination/

# 從遠端下載
scp user@host:/path/to/file.txt ./

# 複製整個目錄
scp -r folder/ user@host:/path/to/destination/

# 指定埠號
scp -P 2222 file.txt user@host:/path/
```

### rsync：同步檔案（比 scp 更強大）

```bash
# 基本同步（本地到遠端）
rsync -av ./folder/ user@host:/path/to/destination/

# 從遠端同步到本地
rsync -av user@host:/path/to/folder/ ./local_folder/

# 常用選項組合
rsync -avz --progress ./folder/ user@host:/path/
#  -a  保留權限、時間等屬性
#  -v  顯示詳細資訊
#  -z  壓縮傳輸
#  --progress  顯示進度

# 刪除目標端多餘的檔案（完全同步）
rsync -av --delete ./folder/ user@host:/path/

# 排除特定檔案
rsync -av --exclude='*.log' --exclude='node_modules/' ./folder/ user@host:/path/

# 試跑模式（不實際執行）
rsync -av --dry-run ./folder/ user@host:/path/
```

**rsync vs scp：**

| 特性 | scp | rsync |
|------|-----|-------|
| 增量傳輸 | ❌ 每次全部傳 | ✅ 只傳變更的部分 |
| 斷點續傳 | ❌ | ✅ |
| 顯示進度 | ❌ | ✅ |
| 適用場景 | 小檔案、一次性傳輸 | 大檔案、定期同步 |

---

## 程序管理

```bash
# 查看程序
ps aux                           # 列出所有程序
ps aux | grep python             # 找特定程序
top                              # 即時監控（按 q 離開）
htop                             # 更好看的監控（需安裝）

# 結束程序
kill PID                         # 正常結束
kill -9 PID                      # 強制結束
killall python                   # 結束所有 python 程序

# 背景執行
./script.sh &                    # 背景執行
nohup ./script.sh &              # 背景執行，登出後繼續
jobs                             # 查看背景工作
fg %1                            # 把背景工作拉到前景

# Ctrl+C：中斷目前程序
# Ctrl+Z：暫停目前程序（用 fg 恢復）
```

---

## 環境變數

```bash
# 查看環境變數
echo $HOME                       # 家目錄
echo $PATH                       # 可執行檔搜尋路徑
echo $USER                       # 目前使用者
env                              # 列出所有環境變數

# 設定環境變數（當前 session）
export MY_VAR="hello"
echo $MY_VAR

# 永久設定（加入 ~/.bashrc）
echo 'export MY_VAR="hello"' >> ~/.bashrc
source ~/.bashrc                 # 重新載入設定

# 常見的設定檔
~/.bashrc                        # Bash 設定（每次開終端機載入）
~/.profile                       # 登入時載入
~/.bash_aliases                  # 別名設定
```

---

## 實用技巧

### 1. 快捷鍵

| 快捷鍵 | 功能 |
|--------|------|
| `Tab` | 自動補全 |
| `Ctrl+C` | 中斷目前指令 |
| `Ctrl+Z` | 暫停目前指令 |
| `Ctrl+D` | 登出/結束輸入 |
| `Ctrl+L` | 清除畫面 |
| `Ctrl+R` | 搜尋歷史指令 |
| `Ctrl+A` | 移到行首 |
| `Ctrl+E` | 移到行尾 |
| `↑` / `↓` | 瀏覽歷史指令 |

### 2. 歷史指令

```bash
history                          # 查看歷史指令
history | grep docker            # 搜尋歷史
!123                             # 執行第 123 條歷史指令
!!                               # 執行上一條指令
sudo !!                          # 用 sudo 執行上一條指令
```

### 3. 別名（alias）

```bash
# 設定別名（加入 ~/.bashrc）
alias ll='ls -la'
alias gs='git status'
alias dc='docker compose'
alias dps='docker ps'

# 重新載入
source ~/.bashrc
```

### 4. 磁碟空間

```bash
# 查看磁碟使用量
df -h                            # 各分區使用量
du -sh *                         # 目前目錄各資料夾大小
du -sh ~/                        # 家目錄總大小
ncdu                             # 互動式查看（需安裝）
```

### 5. 網路

```bash
# 查看 IP
ip addr
hostname -I

# 測試連線
ping google.com
ping -c 4 192.168.1.1            # 只 ping 4 次

# 查看埠號使用
lsof -i :8080                    # 誰在用 8080 埠
netstat -tlnp                    # 列出所有監聽的埠
ss -tlnp                         # 同上（較新的指令）

# 下載檔案
curl -O https://example.com/file.zip
wget https://example.com/file.zip
```

---

## 小結

這篇文章涵蓋了開發者最常用的 Linux 指令：

| 類別 | 重點指令 |
|------|----------|
| 目錄操作 | `cd`、`ls`、`mkdir`、`pwd` |
| 檔案操作 | `cp`、`mv`、`rm`、`cat`、`less` |
| 搜尋 | `find`、`grep`、`rg` |
| 權限 | `chmod`、`chown` |
| 套件 | `apt update`、`apt install` |
| 服務 | `systemctl`、`journalctl` |
| 遠端 | `ssh`、`scp`、`rsync` |
| 程序 | `ps`、`kill`、`top` |

熟悉這些指令後，就能順利操作 Ubuntu 開發環境了！

---

## 參考資源

- [Ubuntu 官方文件](https://help.ubuntu.com/)
- [Linux Command](https://linuxcommand.org/)（英文教學）
- [鳥哥的 Linux 私房菜](https://linux.vbird.org/)（中文經典教材）
- [tldr](https://tldr.sh/)（簡化版 man page）
