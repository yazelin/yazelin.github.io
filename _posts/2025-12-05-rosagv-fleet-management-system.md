---
layout: post
title: "RosAGV - 企業級 AGV 車隊管理系統"
subtitle: "基於 ROS 2 Jazzy 的現代化自動導引車控制系統"
tags: [ROS2, AGV, Docker, Zenoh, 車隊管理, 工業自動化]
date: 2025-12-05
categories: [工業自動化, ROS2, AGV]
---

## 專案簡介

**RosAGV** 是一套企業級自動導引車（AGV）車隊管理系統，採用 ROS 2 Jazzy 和 Zenoh RMW 打造。這個系統的特別之處在於採用**雙環境容器化架構**，將車載控制與中央管理功能分離，為工業自動化提供完整的車隊管理、任務調度和設備控制解決方案。

**專案背景：**
- **公司**：擎添工業（Ching-Tech Industrial）
- **開發時間**：2024 年持續開發中
- **應用場景**：智慧工廠、倉儲管理、製造業產線物流

---

## 🎯 核心特色

### 1. 雙環境架構設計

**設計理念：** 分離關注點，將即時控制與管理功能分離，提高系統穩定性和可維護性

```
🚗 AGV 車載系統 (On-board)          🖥️ AGVC 管理系統 (Control Center)
├─ 即時控制和狀態管理                ├─ 車隊管理和任務調度
├─ PLC 設備直接通訊                 ├─ 資料庫管理和資料持久化
├─ 感測器資料處理                   ├─ Web 管理介面
├─ 手動控制（搖桿）支援             ├─ 外部系統整合（KUKA Fleet）
└─ 路徑規劃和導航                   └─ 系統監控和日誌管理
         ↕️ Zenoh RMW 通訊 ↕️
```

**為什麼要分離環境？**

- **高可用性**：車載系統獨立運行，不依賴中央系統
- **可擴展性**：管理系統可以管理多台 AGV
- **維護性**：各環境可以獨立更新和維護
- **安全性**：車載系統與管理系統網路隔離

---

### 2. 現代技術棧

**核心技術：**
- **ROS 2 Jazzy**：最新的 ROS 2 LTS 版本
- **Zenoh RMW**：高效能的跨網路通訊中介軟體
- **Docker 容器化**：完整容器化部署，AGV 環境 7 個專用工作空間，AGVC 環境 10 個專用工作空間
- **Python 3.12**：所有服務使用最新 Python 版本

**前端技術：**
- **FastAPI**：高效能 Web API 框架
- **Socket.IO**：即時雙向通訊
- **Jinja2**：HTML 模板引擎
- **Vanilla JavaScript**：原生 JavaScript ES6+
- **Bulma CSS**：現代化 CSS 框架

**資料庫：**
- **PostgreSQL**：主要資料庫
- **SQLModel ORM**：資料庫抽象層

---

### 3. 多車型支援

系統支援三種不同的 AGV 車型，每種車型都有專門的控制模組：

**Cargo Mover（貨物搬運車）**
- 專注於物料搬運
- 支援 Rack（貨架）管理系統
- 具備旋轉貨架功能

**Loader（上料車）**
- 用於產線上料作業
- 整合 KUKA Fleet 機器人系統
- 支援精確定位

**Unloader（下料車）**
- 用於產線下料作業
- 與 Loader 協同工作
- 支援多種卸料模式

---

## 🏗️ 系統架構詳解

### AGV 車載系統

**部署特性：**
```yaml
容器名稱: rosagv
網路模式: host
部署位置: AGV 車輛上的邊緣計算設備
Docker Compose: docker-compose.yml
```

**為什麼使用 Host 網路？**
- **SICK 感測器存取**：需要直接存取 SICK SLAM 感測器
- **硬體直接存取**：減少抽象層，確保即時性
- **即時性要求**：減少網路層級延遲

**工作空間配置（7 個）：**
```
agv_ws/                    # 核心 AGV 控制
├── agv_base              # 基礎狀態機架構
├── cargo_mover_agv       # Cargo 車型實作
├── loader_agv            # Loader 車型實作
└── unloader_agv          # Unloader 車型實作

agv_cmd_service_ws/       # 手動指令服務
joystick_ws/              # 搖桿控制整合
sensorpart_ws/            # 工業相機整合（OCR 物料辨識）
keyence_plc_ws/           # Keyence PLC 通訊
plc_proxy_ws/             # PLC 代理服務
shared_constants_ws/      # 共享常數定義
path_algorithm/           # 路徑規劃演算法
```

---

### AGVC 管理系統

**部署特性：**
```yaml
容器名稱: agvc_server, postgres, nginx
網路模式: bridge (192.168.100.0/24)
部署位置: 中央管理伺服器
Docker Compose: docker-compose.agvc.yml
```

**為什麼使用 Bridge 網路？**
- **KUKA 系統整合**：KUKA 外部系統也是 Docker 部署在同台電腦上
- **固定 IP 需求**：需要固定 IP 確保與 KUKA 系統穩定連接
- **企業級隔離**：提供更好的隔離性
- **網路管理**：便於管理多個服務之間的通訊

**容器服務架構（4 個容器）：**
```
AGVC 系統
├── nginx (192.168.100.252)
│   ├── 反向代理服務
│   ├── 靜態文檔托管
│   └── WebSocket 支援
├── agvc_server (192.168.100.100)
│   ├── ROS 2 核心服務
│   ├── Web API (8000)
│   ├── AGVCUI (8001)
│   └── OPUI (8002)
├── postgres (192.168.100.254)
│   └── PostgreSQL 資料庫
└── pgadmin (192.168.100.101)
    └── 資料庫管理介面
```

**工作空間配置（10 個）：**
```
web_api_ws/               # Web API 和 Socket.IO
├── web_api              # 核心 API 服務
├── agvcui               # 車隊管理介面
├── opui                 # 操作員介面
└── agvui                # AGV 車載監控介面

db_proxy_ws/              # 資料庫代理服務
ecs_ws/                   # 設備控制系統（Equipment Control System）
rcs_ws/                   # 機器人控制系統（Robot Control System）
kuka_wcs_ws/              # KUKA WCS 倉儲控制系統
kuka_fleet_ws/            # KUKA Fleet 整合
keyence_plc_ws/           # PLC 通訊 (共用)
plc_proxy_ws/             # PLC 代理 (共用)
path_algorithm/           # 路徑規劃 (共用)

# ⚠️ 已棄用 (2025)
# tafl_ws/                # TAFL 解析器（已改用 KUKA WCS）
# tafl_wcs_ws/            # TAFL WCS（已改用 kuka_wcs_ws）
```

---

## ⚡ Zenoh RMW：跨網路高效通訊

**為什麼選擇 Zenoh RMW？**

傳統 ROS 2 的 DDS 通訊協定在跨網路環境下有明顯限制：
- ❌ 跨網段通訊困難
- ❌ 需要複雜的網路配置
- ❌ 不適合雲端部署

**Zenoh RMW 的優勢：**
- ✅ **原生支援跨網段**：AGV 車載與中央管理系統可在不同網段
- ✅ **低延遲**：優化的通訊協定
- ✅ **高可靠性**：自動重連機制
- ✅ **輕量級**：資源佔用少
- ✅ **雲端友善**：支援雲端部署

**架構：**
```
AGV 車載系統 (192.168.1.x)
    ↕️ Zenoh Router
AGVC 管理系統 (192.168.100.x)
```

---

## 🔧 核心功能模組

### 1. AGV 狀態機

**三種 AGV 車型共享基礎狀態機架構（agv_base）：**

- **狀態管理**：待命、執行任務、充電、維護
- **模式切換**：自動模式 ↔ 手動模式
- **安全機制**：緊急停止、避障、異常處理

### 2. 路徑規劃與導航

**基於 ROS 2 Navigation Stack：**

- **SLAM 定位**：使用 SICK 感測器
- **路徑規劃**：A* / Dijkstra 演算法
- **動態避障**：即時障礙物偵測與閃避
- **路徑優化**：最短路徑計算

### 3. PLC 整合

**Keyence PLC 通訊：**

- **雙向通訊**：AGV ↔ PLC
- **狀態同步**：設備狀態即時更新
- **指令下達**：遠端控制 PLC 設備
- **異常處理**：連線異常自動重連

### 4. KUKA Fleet 整合

**與 KUKA 機器人系統協同：**

- **任務協調**：AGV 與機器人任務排程
- **位置同步**：精確定位與對位
- **狀態監控**：即時監控機器人狀態
- **API 整合**：完整的 KUKA Fleet API 支援

### 5. 工業相機 OCR 整合（Sensorpart）

**物料辨識與門禁控制：**

AGV 車載配備工業相機，與車上的 KUKA 協作手臂協同工作：

**系統架構：**
```
工業相機 (Sensorpart)
    ├─ 直接通訊 → KUKA 協作手臂
    └─ TCP 連接 → 車載 ROS2 系統
```

**核心功能：**
- **OCR 辨識**：辨識物料上的文字、條碼、標籤
- **物料驗證**：比對物料是否允許進入房間
- **門禁控制**：驗證通過才允許 AGV 進入製程區
- **即時回傳**：OCR 結果透過 TCP 傳送給 ROS2 系統
- **機器人協同**：與 KUKA 協作手臂同步作業

**應用場景：**
- 無塵室門禁控制
- 製程區物料管制
- 防止錯誤物料進入
- 自動化品質管控

---

### 6. Rack 管理系統

**貨架管理功能（Cargo Mover 專用）：**

- **Rack 追蹤**：追蹤每個貨架的位置和狀態
- **旋轉功能**：貨架可旋轉 90°、180°、270°
- **載重管理**：監控貨架載重狀態
- **自動對位**：精確對位取放貨架

### 7. WCS 倉儲控制系統

**KUKA WCS（Warehouse Control System）：**

採用純 Python 實作的現代化倉儲控制系統：

- **任務調度**：Rack 車搬移需求決策
- **流程自動化**：取代原 TAFL 語言的複雜流程
- **即時監控**：任務狀態即時追蹤
- **與 AGV 整合**：無縫整合 AGV 控制

> ⚠️ **歷史資訊**：TAFL WCS（基於 TAFL v1.1.2 語言）已於 2025 年棄用，現已改用 KUKA WCS 進行倉儲控制。

---

## 💻 Web 管理介面系統

RosAGV 提供完整的 Web 介面體系，從管理員到現場操作人員，從中央控制到車載監控，全面覆蓋各種使用場景。

### 1. AGVCUI - 車隊管理介面（Port 8001）

**定位：** 管理員級別的企業級車隊管理系統

**核心功能：**
- 🎛️ **儀表板**：系統總覽、AGV 狀態統計、任務進度監控
- 🗺️ **地圖視圖**：基於 Leaflet.js 的即時地圖、AGV 軌跡、設備狀態視覺化
- 📋 **任務管理**：任務建立、編輯、調度、執行監控
- 🚗 **AGV 監控**：即時位置、狀態、電池電量、工作狀態
- 📊 **設備管理**：架台、載具、設備狀態監控和控制
- 👥 **使用者管理**：多使用者權限、認證、稽核日誌追蹤
- 🗄️ **資料庫管理**：整合 pgAdmin 提供完整的資料庫管理功能

**技術架構：**
- 後端：FastAPI + Socket.IO + Jinja2
- 前端：原生 JavaScript ES6+ + Bulma CSS + Leaflet.js
- 資料庫：PostgreSQL + SQLModel ORM
- 通訊：WebSocket 即時雙向通訊

**存取方式：** `http://agvc.ui/` 或 `http://localhost:8001/`

---

### 2. OPUI - 操作員介面（Port 8002）

**定位：** 現場操作員的工作站介面

**核心功能：**
- 🚛 **AGV 任務管理**：加入料架（add rack）和派車（dispatch car）操作
- 📊 **即時監控**：任務狀態、料架位置、機台狀態即時更新
- 🏭 **多機台支援**：支援多個生產機台的並行操作
- 📦 **料架管理**：料架分配、移動追蹤、狀態同步
- 🏗️ **工作區配置**：支援工作區與停車格分離架構，自動分配料架位置

**技術特色：**
- ✅ **模組化前端架構**：按頁面功能分離的 JavaScript 架構
  - `index.js`：共用功能（全域初始化、Store 狀態管理、Socket 連線處理）
  - `pages/homePage.js`：Home 頁面專用功能
  - `pages/settingPage.js`：Settings 頁面專用功能
  - `pages/rackPage.js`：Rack 頁面專用功能
- ✅ **統一狀態管理**：基於 miniStore 的輕量級狀態管理
  - `userStore`：用戶狀態管理
  - `operationStore`：操作狀態管理
  - `dataStore`：資料狀態管理
  - `tasksStore`：任務狀態管理
  - `uiStore`：UI 狀態管理
- ✅ **直接資料庫連接**：使用 db_proxy 的 connection_pool_manager
- ✅ **即時通訊**：基於 Socket.IO 的雙向即時通訊

**技術架構：**
- 後端：FastAPI + Socket.IO + 分離式架構
  - `op_ui_server.py`：FastAPI 伺服器和 HTTP 路由處理
  - `op_ui_socket.py`：Socket.IO 事件處理和即時通訊功能
- 前端：Vanilla JS ES6+ + Bulma CSS + miniStore（自研）
- 通訊：WebSocket + PostgreSQL

**存取方式：** `http://localhost:8002/`

---

### 3. HMI Station - 人機介面終端（Port 8002）

**定位：** 觸控操作的現場終端介面（基於 OPUI 的擴展功能）

**核心特色：**
- 🎨 **大按鈕設計**：按鈕佔畫面 40-50% 高度，易於觸控操作
- 📱 **觸控優化**：專為 11 吋平板設計，支援手勢操作
- 🌑 **深色主題**：現代化深色背景配合漸層邊框設計
- ✨ **動畫效果**：呼吸燈效果、點擊動畫、內部光暈效果
- 🎯 **場景定制**：根據設備 ID 顯示不同的 Location 監控

**雙層路由機制：**
- **第一層：Device Type 路由**
  - `op_station`：操作員工作站 → `/home`
  - `hmi_terminal`：HMI 終端設備 → `/hmi`
- **第二層：DeviceId 配置**
  - 根據 License 表中的 `permissions` JSON 欄位配置顯示內容
  - 支援多種排版方式：1x2、2x2、1x3、1x4、2x3

**核心功能：**
- 📦 **Rack 移出操作**：從指定 Location 移出 Rack
- 📍 **Location 監控**：即時顯示 Location、Rack、Carrier 詳細資訊
- 🔄 **自動刷新**：每 30 秒自動刷新頁面狀態
- ✅ **確認機制**：操作前顯示確認對話框，避免誤操作

**視覺設計：**
- 深色漸層背景：`#1a1a1a → #0f0f0f`
- 綠色漸層按鈕：`#00d68f → #00b074`
- 四色漸層邊框：紅紫青藍循環
- 呼吸動畫：3 秒循環脈動效果

**技術架構：**
- 基於 OPUI 的路由擴展
- Bulma CSS Framework + 深度客製化 CSS
- WebSocket 即時通訊
- 資料庫：PostgreSQL（License 表權限控制）

**存取方式：** `http://localhost:8002/?deviceId=hmi0000000000001`

---

### 4. AGVUI - AGV 車載監控界面（Port 8003）

**定位：** 輕量級 AGV 車載設備監控界面

**核心特色：**
- 🪶 **輕量級設計**：專為車載設備資源限制環境設計
- 🔄 **自適應模式**：自動識別單機部署或多機測試環境
- 📡 **即時更新**：透過 Socket.IO 提供即時狀態更新
- 📁 **檔案監控**：定時讀取狀態檔案並廣播更新

**雙模式支援：**
- **單機模式**（實際 AGV 部署）
  - 檔案格式：`/tmp/agv_status.json`
  - 只監控本機 AGV 狀態
  - 用於實際車載部署
- **多機模式**（測試/模擬環境）
  - 檔案格式：`/tmp/agv_status_<agv_id>.json`
  - 同時監控多台 AGV（loader01, loader02, cargo01, cargo02, unloader01, unloader02）
  - 用於測試環境或中央監控系統

**身份識別機制：**
1. 讀取 `/app/.device_identity` 確認容器類型
2. 如果是 AGV 容器，讀取 `/app/.agv_identity`
3. 備用：從環境變數 `AGV_ID` 讀取
4. 無法識別時顯示所有 AGV 狀態

**狀態資料結構：**
- 基本狀態：AGV_ID、模式、移動狀態
- 位置資訊：SLAM 座標、PGV 座標、角度
- 系統狀態：電量、速度、目標點
- I/O 狀態：Input_1-100、Output_1-100
- 警報狀態：Alarm_1-50
- PLC 記憶體：PLC_D1-80
- **總計 330+ 個狀態屬性**

**技術架構：**
- 後端：FastAPI + Socket.IO + ROS 2
  - `agv_ui_server.py`：主伺服器
  - `agv_ui_socket.py`：Socket.IO 事件處理
  - `agv_ui_ros.py`：ROS 2 節點整合
- 前端：原生 JavaScript + Bulma CSS + miniStore
- 通訊：WebSocket + 檔案系統監控

**存取方式：**
- 主監控頁面：`http://localhost:8003/`
- 測試選擇頁面：`http://localhost:8003/test`
- 直接監控特定 AGV：`http://localhost:8003/?agv_id=loader01`

---

### UI 系統技術對比

| 特性 | AGVCUI | OPUI | HMI Station | AGVUI |
|------|--------|------|-------------|-------|
| **Port** | 8001 | 8002 | 8002 | 8003 |
| **目標用戶** | 系統管理員 | 現場操作員 | 現場操作人員 | 車載設備 |
| **介面複雜度** | 高（完整功能） | 中（簡化操作） | 低（大按鈕） | 低（單頁監控） |
| **狀態管理** | 無（DOM 直接操作） | miniStore | 無 | miniStore |
| **資料庫** | PostgreSQL | PostgreSQL | PostgreSQL | 檔案系統 |
| **即時通訊** | Socket.IO | Socket.IO | Socket.IO | Socket.IO |
| **地圖功能** | ✅ Leaflet.js | ❌ | ❌ | ❌ |
| **權限控制** | ✅ 多用戶 | ✅ 設備授權 | ✅ 設備授權 | ❌ |
| **部署位置** | AGVC 伺服器 | AGVC 伺服器 | AGVC 伺服器 | AGV 車載 |

---

## 🛠️ 統一工具系統

**RosAGV 提供強大的統一工具系統，只需一個字母 `r` 即可存取所有管理功能。**

### 系統診斷工具

| 命令 | 功能 |
|------|------|
| `r agvc-check` | AGVC 管理系統健康檢查 |
| `r agv-check` | AGV 車載系統健康檢查 |
| `r system-health` | 完整系統健康檢查 |
| `r quick-diag` | 快速綜合診斷 |

### 容器管理工具

| 命令 | 功能 |
|------|------|
| `r containers-status` | 檢查所有容器狀態 |
| `r agv-start` / `r agv-stop` | AGV 容器啟停 |
| `r agvc-start` / `r agvc-stop` | AGVC 系統啟停 |

### 網路診斷工具

| 命令 | 功能 |
|------|------|
| `r network-check` | 系統連接埠檢查 |
| `r zenoh-check` | Zenoh 連接檢查 |

**日常運維範例：**
```bash
# 每日系統檢查
r agvc-check && r containers-status && r network-check

# 系統啟動
r agvc-start

# 故障排除
r quick-diag
```

---

## 📋 應用場景

### 1. 智慧工廠

**物料搬運自動化：**
- Cargo Mover 負責產線間物料運送
- Loader / Unloader 負責上下料
- 與 KUKA 機器人協同作業
- 整合 PLC 自動化產線

**OCR 門禁控制：**
- AGV 搭載工業相機，辨識物料標籤
- 進入無塵室前自動驗證物料許可
- 防止錯誤物料進入製程區
- 與車載 KUKA 協作手臂協同確認物料

### 2. 倉儲管理

**倉庫自動化：**
- 貨物自動分揀
- Rack 管理與運輸
- 庫存追蹤
- 路徑優化減少搬運時間

### 3. 製造業產線

**產線物流自動化：**
- 原料上料自動化
- 成品下料自動化
- 產線間物料配送
- WCS 系統整合

---

## 🎯 技術亮點

### 1. 完整容器化部署

**所有服務容器化：**
- 一鍵啟動整個系統
- 環境一致性保證
- 易於部署與擴展
- 完整的開發/測試/生產環境隔離

### 2. ROS 2 現代架構

**採用最新 ROS 2 Jazzy：**
- 更好的即時性
- 更強的安全性
- 完整的生態系統
- 活躍的社群支援

### 3. 跨平台 Web 管理

**不需要專用軟體：**
- 瀏覽器即可管理
- 支援手機/平板存取
- 即時資料更新（Socket.IO）
- 現代化 UI/UX

### 4. 模組化設計

**17 個專用工作空間：**
- 功能清楚分離
- 便於維護與擴展
- 可獨立更新
- 易於測試

### 5. 多層級 Web 介面系統

**4 個不同層級的 Web 介面：**
- **AGVCUI**：管理員級別完整管理功能，整合 Leaflet.js 地圖、pgAdmin 資料庫管理
- **OPUI**：現場操作員工作站，模組化架構，自研 miniStore 狀態管理
- **HMI Station**：觸控優化終端，深色主題 + 漸層邊框 + 呼吸動畫，雙層路由機制
- **AGVUI**：車載輕量級監控，支援 330+ 狀態屬性，自適應單機/多機模式
- 全部基於 FastAPI + Socket.IO + 原生 JavaScript
- 統一技術棧，但針對不同使用場景優化

### 6. 完整的開發文件系統

**超過 50 份技術文件：**
- 系統架構說明
- 開發指導
- 運維指南
- 故障排除
- **@docs-ai/ 引用系統**：讓人員和 AI 都能快速獲取所需資訊
- 完整的 CLAUDE.md 文檔體系，每個模組都有專屬開發指南

---

## 💡 開發體會

這個專案讓我深刻體會到：

**雙環境架構的必要性：**
- 車載系統需要即時性，不能依賴網路
- 管理系統需要靈活性，方便擴展
- 分離後各自獨立演進，互不影響

**Zenoh RMW 的強大：**
- 解決了 ROS 2 跨網段通訊的痛點
- 讓雲端部署成為可能
- 大幅簡化網路配置

**容器化的價值：**
- 開發環境與生產環境完全一致
- 部署簡單，只需 Docker Compose
- 易於擴展，新增 AGV 只需複製容器

**模組化的重要性：**
- 17 個工作空間，功能清楚分離
- 每個模組可獨立開發測試
- 降低系統耦合度

**UI 分層設計的智慧：**
- 不同用戶需要不同的介面複雜度
- 統一技術棧降低學習成本
- 原生 JavaScript 減少依賴，提高穩定性
- 自研 miniStore 狀態管理，輕量高效

**文檔架構的前瞻性：**
- **@docs-ai/** 引用系統讓文檔成為可檢索的知識庫
- 每個模組的 CLAUDE.md 形成完整的開發指南體系
- 既服務人員也服務 AI，降低維護門檻
- 文檔即代碼，與專案同步演進

---

## 🚀 未來發展

目前系統持續優化中，未來計畫：

- ✅ 已完成 KUKA WCS 系統（取代舊版 TAFL WCS）
- ✅ 已完成 4 層級 Web UI 系統（AGVCUI、OPUI、HMI、AGVUI）
- ✅ 已完成工業相機 OCR 整合（Sensorpart）
- 🔄 優化 Rack 管理邏輯和旋轉功能
- 🔄 增強 AI 路徑優化演算法
- 📋 計畫支援更多 AGV 車型
- 📋 計畫雲端監控部署方案
- 📋 計畫 5G 網路整合

---

**專案資訊**
- **專案類型**：企業級 AGV 車隊管理系統
- **技術棧**：ROS 2 Jazzy + Zenoh RMW + Docker + Python 3.12 + FastAPI + Socket.IO + PostgreSQL
- **前端技術**：Jinja2 + Vanilla JavaScript ES6+ + Bulma CSS + Leaflet.js + miniStore
- **應用領域**：智慧工廠、倉儲管理、製造業物流自動化
- **公司**：擎添工業（Ching-Tech Industrial）
- **授權**：專有軟體

---

Happy Coding! 🤖
