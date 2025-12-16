---
layout: post
title: "實踐大學 2016 人機互動課程專案 - AR 相機 (APP Client 端)"
subtitle: "Unity + Vuforia AR 雲端相簿應用"
tags: [教學, Unity, Android, AR, Vuforia, NGUI]
date: 2016-03-26
categories: [專案, Unity, AR]
---

## 專案簡介

這是**實踐大學 2016 人機互動技術與應用課程**的完整專案範例，展示如何使用 Unity + Vuforia 開發 AR 相機 APP，實現**拍照、截圖、上傳雲端**的完整功能。

### 專案特色

**目標：** 開發一個 AR 相機 APP，拍攝 AR 畫面並上傳到雲端相簿

**技術架構：**
```
Unity + Vuforia AR → 截圖功能 → HTTP 上傳 → PHP Server → MySQL 資料庫
```

**核心功能：**
- ✅ **AR 擴增實境**：使用 Vuforia 辨識圖像
- ✅ **截圖功能**：捕捉 AR 畫面
- ✅ **雲端上傳**：將圖片上傳到 Web Server
- ✅ **NGUI 介面**：美觀的使用者介面
- ✅ **錯誤重試**：網路上傳失敗自動重試

---

## 系統架構

### Client-Server 架構

這是一個完整的 **Client-Server 架構**專案：

```
┌─────────────────────────────────────┐
│     AR Camera APP (Client 端)       │
│  Unity + Vuforia + NGUI + C#        │
│                                     │
│  1. AR 圖像辨識                      │
│  2. 3D 模型疊加                      │
│  3. 截圖功能                         │
│  4. HTTP POST 上傳                   │
└────────────┬────────────────────────┘
             │ HTTP (WWWForm)
             ↓
┌─────────────────────────────────────┐
│    Cloud Album (Server 端)          │
│    PHP + MySQL + Apache             │
│                                     │
│  1. 接收圖片上傳                     │
│  2. 儲存到 MySQL (BLOB)              │
│  3. 圖片檢視與管理                   │
└─────────────────────────────────────┘
```

---

## 核心功能實作

### 1. AR 擴增實境

使用 Vuforia SDK 實現圖像辨識：
- **Image Target 設定**：辨識特定圖像
- **3D 模型疊加**：在圖像上顯示 3D 內容
- **即時追蹤**：隨著圖像移動更新 3D 模型位置

### 2. 截圖功能

**實作方式：**
使用 `ScreenshotButton.cs` 腳本

```csharp
// 關鍵程式碼
void buttonClick(GameObject button){
    ScreenshotManager.Save("temp", "MyScreenshots", true);
}

void readyToUpload(){
    unixTimestamp = (Int32)(DateTime.UtcNow.Subtract(new DateTime(1970, 1, 1))).TotalSeconds;
    StartCoroutine(Upload());
}
```

**功能特點：**
- 按下按鈕即可截圖
- 自動儲存到本地
- 截圖完成後觸發上傳

### 3. 雲端上傳功能

**HTTP POST 上傳實作：**

```csharp
IEnumerator Upload(){
    // 讀取截圖檔案
    byte[] bytes = File.ReadAllBytes(ScreenshotManager.LastSavedFilePath);

    // 建立 WWWForm
    WWWForm form = new WWWForm();
    form.AddField("timeid", unixTimestamp);
    form.AddBinaryData("fileToUpload", bytes, filename, "image/png");

    // 上傳到 Server
    WWW www = new WWW(uploadURL, form);
    yield return www;
}
```

**上傳機制：**
- ✅ **自動上傳**：截圖完成後自動上傳
- ✅ **重試機制**：失敗自動重試（最多 10 次）
- ✅ **時間戳記**：使用 Unix Timestamp 作為圖片 ID
- ✅ **錯誤處理**：偵測網路錯誤並記錄

### 4. NGUI 使用者介面

**UI 元件：**
- 截圖按鈕
- URL 連結按鈕（`URLButtonScript.cs`）
- 狀態顯示

**互動設計：**
```csharp
// NGUI 事件處理
UIEventListener.Get(button).onClick = buttonClick;
```

---

## 技術亮點

### 1. 完整的 AR 拍照流程

```
AR 場景渲染 → 按下拍照按鈕 → 截圖 → 儲存本地 → 上傳雲端 → 顯示結果
```

### 2. 穩定的網路上傳

- **自動重試機制**：網路不穩定時自動重試
- **上傳進度追蹤**：Debug.Log 記錄上傳狀態
- **錯誤處理**：完整的錯誤訊息

### 3. Unity 與 Web 整合

- 使用 Unity 的 `WWW` 和 `WWWForm` 進行 HTTP 通訊
- 支援 Binary Data 上傳（圖片）
- 與 PHP Server 無縫整合

### 4. 模組化設計

- `ScreenshotButton.cs`：截圖與上傳
- `URLButtonScript.cs`：URL 連結功能
- `ButtonScript.cs`：通用按鈕功能
- `CameraFocus.cs`：相機對焦

---

## 開發環境

### 硬體需求
- Android 手機或平板
- 或 iOS 設備（需 macOS + 開發者帳號）

### 軟體需求
- **Unity 5.3.0**（配合 Vuforia 5.0.1）
- **Vuforia SDK**：AR 功能
- **NGUI**：UI 系統
- **Android SDK**：打包 APK
- **Java SDK**：Android 開發

---

## 專案結構

```
Assets/
├── Scripts/
│   ├── ScreenshotButton.cs      # 截圖與上傳
│   ├── URLButtonScript.cs       # URL 按鈕
│   ├── ButtonScript.cs          # 通用按鈕
│   └── CameraFocus.cs           # 相機對焦
├── Vuforia/                     # Vuforia SDK
└── NGUI/                        # UI 系統
```

---

## 學習重點

### 1. AR 開發技能
- Vuforia SDK 使用
- Image Target 設定
- AR 場景設計

### 2. Unity 網路通訊
- WWW/WWWForm 使用
- HTTP POST 上傳
- Coroutine 異步處理

### 3. 檔案處理
- 截圖功能實作
- 檔案讀取與處理
- Binary Data 處理

### 4. UI 互動設計
- NGUI 事件系統
- 按鈕互動處理
- 使用者體驗設計

### 5. 錯誤處理
- 網路錯誤偵測
- 自動重試機制
- Debug 訊息記錄

---

## 應用場景

這個專案可以應用在：
- 📸 **AR 相機應用**：拍攝 AR 場景並分享
- 🎨 **互動展覽**：展場互動拍照
- 📚 **教育應用**：AR 教材拍照記錄
- 🎮 **AR 遊戲**：遊戲截圖分享
- 🏢 **行銷活動**：AR 互動行銷

---

## 專案資源

**完整專案網站：**
[https://yazelin.github.io/usc2016hci_ARCamera/](https://yazelin.github.io/usc2016hci_ARCamera/)

**GitHub 開源專案：**
[https://github.com/yazelin/usc2016hci_ARCamera](https://github.com/yazelin/usc2016hci_ARCamera)

**Server 端專案：**
[雲端相簿 (Web Server 端)]({% post_url 2016-03-26-usc2016hci_CloudAlbum %})

**相關課程：**
- [實踐大學 2016 人機互動課程]({% post_url 2016-02-14-usc2016hci %})
- [實踐大學 2015 互動導覽課程]({% post_url 2015-11-26-usc2015 %})

---

**專案資訊**
- **學校**：實踐大學
- **課程**：人機互動技術與應用
- **專案名稱**：AR 相機 APP (Client 端)
- **開發時間**：2016 年 3 月
- **開發者**：Yaze Lin
- **技術棧**：Unity + Vuforia + NGUI + C# + HTTP
- **特色**：完整的 Client-Server 架構、AR 拍照上傳雲端
