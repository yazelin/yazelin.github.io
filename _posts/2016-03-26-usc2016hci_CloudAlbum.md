---
layout: post
title: "實踐大學 2016 人機互動課程專案 - 雲端相簿 (Web Server 端)"
subtitle: "PHP + MySQL 圖片儲存與管理系統"
tags: [教學, Web, PHP, MySQL]
date: 2016-03-26
categories: [專案, Web, Backend]
---

## 專案簡介

這是**實踐大學 2016 人機互動技術與應用課程**的 Server 端專案，配合 [AR 相機 APP]({% post_url 2016-03-26-usc2016hci_ARCamera %}) 使用，提供**圖片上傳、儲存、檢視**的雲端相簿服務。

### 專案特色

**目標：** 建立一個雲端相簿系統，接收 AR 相機 APP 上傳的圖片並儲存

**技術架構：**
```
PHP + MySQL + Apache → 接收圖片 → 儲存到資料庫 (BLOB) → Web 檢視介面
```

**核心功能：**
- ✅ **圖片上傳 API**：接收 HTTP POST 圖片上傳
- ✅ **資料庫儲存**：將圖片儲存為 BLOB 格式
- ✅ **會員系統**：使用者帳號管理
- ✅ **圖片瀏覽**：Web 介面檢視相簿
- ✅ **錯誤處理**：檔案大小與格式驗證

---

## 系統架構

### 完整的 Client-Server 架構

```
┌─────────────────────────────────────┐
│     AR Camera APP (Client 端)       │
│                                     │
│  POST /insertImage.php              │
│  - fileToUpload (binary)            │
│  - timeid (timestamp)               │
└────────────┬────────────────────────┘
             │ HTTP POST (multipart/form-data)
             ↓
┌─────────────────────────────────────┐
│    Cloud Album Server (Server 端)   │
│                                     │
│  PHP Scripts:                       │
│  ├── index.php        # 首頁         │
│  ├── login.php        # 登入         │
│  ├── insertImage.php  # 上傳 API     │
│  ├── uploadImage.php  # 上傳表單     │
│  ├── display.php      # 顯示圖片     │
│  └── view.php         # 檢視相簿     │
│                                     │
│  MySQL Database:                    │
│  ├── users   # 會員資料              │
│  └── images  # 圖片資料 (BLOB)       │
└─────────────────────────────────────┘
```

---

## 資料庫設計

### 資料表結構

#### 1. `users` 表 - 會員資料

```sql
CREATE TABLE `users` (
  `_ai` int(11) NOT NULL AUTO_INCREMENT,
  `uid` text NOT NULL,           # 帳號
  `upwd` text NOT NULL,          # 密碼
  PRIMARY KEY (`_ai`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COMMENT='會員列表';
```

#### 2. `images` 表 - 圖片資料

```sql
CREATE TABLE `images` (
  `_ai` int(11) NOT NULL AUTO_INCREMENT,
  `time_id` int(11) NOT NULL,    # 時間戳記 ID
  `user` text NOT NULL,           # 上傳者
  `image` longblob NOT NULL,      # 圖片資料 (BLOB)
  `type` text NOT NULL,           # MIME 類型
  PRIMARY KEY (`_ai`)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COMMENT='儲存圖片';
```

**設計亮點：**
- 使用 `longblob` 儲存圖片（支援大檔案）
- 使用 Unix Timestamp 作為圖片 ID
- 記錄圖片 MIME 類型（image/png, image/jpeg）

---

## 核心功能實作

### 1. 圖片上傳 API (`insertImage.php`)

**功能：** 接收 Client 端上傳的圖片並儲存到資料庫

**處理流程：**

```php
function upload(){
    // 1. 檢查檔案是否上傳
    if(is_uploaded_file($_FILES['fileToUpload']['tmp_name'])){

        // 2. 取得圖片資訊
        $size = getimagesize($_FILES['fileToUpload']['tmp_name']);
        $type = $size['mime'];
        $imgfp = fopen($_FILES['fileToUpload']['tmp_name'], 'rb');
        $timeid = $_POST['timeid'];

        // 3. 檢查檔案大小
        if($_FILES['fileToUpload']['size'] < $maxsize){

            // 4. 連接資料庫
            $dbh = new PDO("mysql:host=localhost;dbname=DB", 'user', 'pwd');

            // 5. 準備 SQL 語句
            $stmt = $dbh->prepare("INSERT INTO images
                (time_id, user, image, type)
                VALUES (?, ?, ?, ?)");

            // 6. 綁定參數並執行
            $stmt->bindParam(1, $timeid);
            $stmt->bindParam(2, $user);
            $stmt->bindParam(3, $imgfp, PDO::PARAM_LOB);
            $stmt->bindParam(4, $type);
            $stmt->execute();
        }
    }
}
```

**安全機制：**
- ✅ 檔案大小限制（最大 99MB）
- ✅ 圖片格式驗證（getimagesize）
- ✅ SQL Injection 防護（Prepared Statement）
- ✅ 錯誤處理（Exception）

---

### 2. 圖片顯示 (`display.php`)

**功能：** 從資料庫讀取圖片並輸出

```php
// 從資料庫讀取圖片
$stmt = $dbh->prepare("SELECT image, type FROM images WHERE time_id = ?");
$stmt->bindParam(1, $image_id);
$stmt->execute();
$row = $stmt->fetch(PDO::FETCH_ASSOC);

// 輸出圖片
header("Content-type: ".$row['type']);
echo $row['image'];
```

---

### 3. 圖片上傳表單 (`uploadImage.php`)

**功能：** 提供 Web 介面手動上傳圖片

```php
<form action="insertImage.php" method="post" enctype="multipart/form-data">
    <input type="file" name="fileToUpload" />
    <input type="submit" value="上傳" />
</form>
```

---

### 4. 相簿檢視 (`view.php`)

**功能：** 列出所有圖片，提供瀏覽介面

```php
// 查詢所有圖片
$stmt = $dbh->query("SELECT time_id, user FROM images ORDER BY time_id DESC");

// 顯示圖片列表
while($row = $stmt->fetch()){
    echo '<img src="display.php?image_id='.$row['time_id'].'" />';
    echo '<p>上傳者: '.$row['user'].'</p>';
}
```

---

### 5. 會員登入 (`login.php`)

**功能：** 會員登入驗證

```php
// 驗證帳號密碼
$stmt = $dbh->prepare("SELECT * FROM users WHERE uid = ? AND upwd = ?");
$stmt->bindParam(1, $uid);
$stmt->bindParam(2, $upwd);
$stmt->execute();

if($stmt->rowCount() > 0){
    // 登入成功
    $_SESSION['user'] = $uid;
}
```

---

## 技術亮點

### 1. BLOB 圖片儲存

**為什麼使用 BLOB？**
- ✅ 圖片與資料一起備份
- ✅ 統一的資料庫管理
- ✅ 支援大檔案（longblob: 4GB）
- ✅ 交易一致性

**儲存方式：**
```php
// 以二進位方式讀取檔案
$imgfp = fopen($file, 'rb');

// 使用 PDO::PARAM_LOB 綁定 BLOB 資料
$stmt->bindParam(3, $imgfp, PDO::PARAM_LOB);
```

---

### 2. PDO 資料庫操作

**優點：**
- ✅ Prepared Statement（防止 SQL Injection）
- ✅ 支援多種資料庫
- ✅ 物件導向介面
- ✅ 錯誤處理機制

```php
$dbh = new PDO("mysql:host=localhost;dbname=DB", 'user', 'pwd');
$dbh->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
```

---

### 3. Unix Timestamp 作為 ID

**優點：**
- ✅ 全域唯一（時間戳記）
- ✅ 可排序（時間順序）
- ✅ 跨平台一致
- ✅ 易於 Client-Server 同步

```php
// Client 端（Unity C#）
unixTimestamp = (Int32)(DateTime.UtcNow.Subtract(new DateTime(1970, 1, 1))).TotalSeconds;

// Server 端（PHP）
$timeid = $_POST['timeid'];
```

---

### 4. 錯誤處理機制

**多層錯誤檢查：**

```php
// 1. 檢查檔案是否上傳
if(!isset($_FILES['fileToUpload'])){
    throw new Exception("Please select a file");
}

// 2. 檢查是否為圖片
if(getimagesize($_FILES['fileToUpload']['tmp_name']) == false){
    throw new Exception("Unsupported Image Format!");
}

// 3. 檢查檔案大小
if($_FILES['fileToUpload']['size'] >= $maxsize){
    throw new Exception("File Size Error");
}
```

---

## 專案檔案結構

```
CloudAlbum/
├── index.php           # 首頁
├── login.php           # 登入頁面
├── insertImage.php     # 圖片上傳 API ★
├── uploadImage.php     # 上傳表單介面
├── display.php         # 圖片顯示 ★
├── view.php            # 相簿瀏覽
└── db.sql              # 資料庫結構 ★
```

**★ 核心檔案**

---

## 開發環境

### Server 需求
- **Apache** 或 **Nginx** Web Server
- **PHP 5.4+**
- **MySQL 5.5+**
- **PDO Extension**（PHP 資料庫擴充）

### 本地開發環境
- **XAMPP** / **WAMP** / **MAMP**
- 或使用 **Docker**

---

## 部署步驟

### 1. 建立資料庫

```bash
mysql -u root -p < db.sql
```

### 2. 設定資料庫連線

編輯 `insertImage.php`：
```php
$dbh = new PDO(
    "mysql:host=localhost;dbname=YOUR_DB",
    'YOUR_USER',
    'YOUR_PASSWORD'
);
```

### 3. 設定上傳目錄權限

```bash
chmod 755 /path/to/CloudAlbum
```

### 4. 測試上傳功能

訪問 `http://your-server/uploadImage.php`

---

## 學習重點

### 1. PHP 後端開發
- HTTP POST 請求處理
- 檔案上傳處理
- Session 管理

### 2. MySQL 資料庫
- 資料表設計
- BLOB 資料儲存
- PDO 資料庫操作

### 3. Web 安全
- SQL Injection 防護
- 檔案上傳驗證
- 錯誤處理

### 4. Client-Server 整合
- RESTful API 設計
- HTTP 通訊協定
- 跨平台資料交換

---

## 應用場景

這個系統可以應用在：
- 📸 **雲端相簿**：個人或團體相簿
- 🎨 **作品集系統**：藝術家作品展示
- 📚 **教學平台**：學生作業上傳
- 🏢 **企業系統**：員工照片管理
- 🎮 **遊戲系統**：玩家截圖分享

---

## 可能的改進

### 功能擴充
- [ ] 縮圖生成（Thumbnail）
- [ ] 圖片壓縮
- [ ] 圖片分類與標籤
- [ ] 搜尋功能
- [ ] 相簿分享

### 效能優化
- [ ] 使用 CDN 分發
- [ ] 圖片快取
- [ ] 資料庫索引優化
- [ ] 負載平衡

### 安全強化
- [ ] HTTPS 加密傳輸
- [ ] 密碼雜湊（bcrypt）
- [ ] CSRF 防護
- [ ] 上傳頻率限制

---

## 專案資源

**完整專案網站：**
[https://yazelin.github.io/usc2016hci_CloudAlbum/](https://yazelin.github.io/usc2016hci_CloudAlbum/)

**GitHub 開源專案：**
[https://github.com/yazelin/usc2016hci_CloudAlbum](https://github.com/yazelin/usc2016hci_CloudAlbum)

**Client 端專案：**
[AR 相機 APP (Unity Client 端)]({% post_url 2016-03-26-usc2016hci_ARCamera %})

**相關課程：**
- [實踐大學 2016 人機互動課程]({% post_url 2016-02-14-usc2016hci %})
- [實踐大學 2015 互動導覽課程]({% post_url 2015-11-26-usc2015 %})

---

**專案資訊**
- **學校**：實踐大學
- **課程**：人機互動技術與應用
- **專案名稱**：雲端相簿 (Web Server 端)
- **開發時間**：2016 年 3 月
- **開發者**：Yaze Lin
- **技術棧**：PHP + MySQL + Apache + PDO
- **特色**：BLOB 圖片儲存、完整的 API、會員系統
