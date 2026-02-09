---
layout: post
title: "WebAGV - AGV 車隊即時監控看板"
subtitle: "Vue 3 + Node.js + Socket.IO 打造的 AGV 資訊看板系統"
tags: [Vue3, Node.js, Socket.IO, Leaflet, MQTT, AGV, 即時監控]
date: 2025-04-24
categories: [Web開發, AGV, 即時監控]
---

![WebAGV - AGV 車隊即時監控看板](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2025-04-24-webagv-monitoring-dashboard.png)

## 專案簡介

**WebAGV** 是一套 AGV 車隊即時監控看板系統，由 **WebAGVClient**（前端）和 **WebAGVServer**（後端）組成。這個系統的目的是提供一個**直觀的資訊看板**，讓操作人員可以即時監控 AGV 在地圖上的位置、任務執行狀態、設備狀態等資訊。

**與 RosAGV 的關係：**
- WebAGV 是 **獨立的監控看板系統**
- RosAGV 是 **核心 AGV 控制系統**
- WebAGV 透過 **MQTT、Socket.IO、ROS 2** 與 RosAGV 通訊
- WebAGV 專注於 **資訊展示與監控**，不負責 AGV 控制

**專案背景：**
- **公司**：擎添工業（Ching-Tech Industrial）
- **開發時間**：2025 年 4 月
- **應用場景**：工廠操作人員即時監控 AGV 車隊

---

## 🎯 核心功能

### 1. 即時地圖監控

**使用 Leaflet 地圖引擎顯示 AGV 位置：**

- ✅ **AGV 即時位置**：在地圖上顯示每台 AGV 的即時座標
- ✅ **AGV 航向**：顯示 AGV 行駛方向（旋轉圖示）
- ✅ **電池狀態**：顏色編碼顯示電池電量（紅→黃→綠）
- ✅ **任務資訊**：顯示當前執行的任務
- ✅ **設備位置**：顯示 PLC 設備、工作站等設備位置

**地圖功能：**
- 全螢幕模式
- 縮放與平移
- 網格座標系統（40px × 40px）
- 自定義 Marker 圖示

---

### 2. 即時通訊架構

**多重通訊協定整合：**

```
前端 (WebAGVClient)
    ↕️ Socket.IO (即時雙向通訊)
後端 (WebAGVServer)
    ├─ MQTT ← AGV 狀態資料
    ├─ ROS 2 (rclnodejs) ← ROS 2 節點通訊
    └─ PostgreSQL / MSSQL ← 資料庫存取
```

**Socket.IO 命名空間：**
- 分離不同類型的資料流
- 降低網路流量
- 提高效能

**MQTT 訂閱：**
- AGV 狀態更新
- 設備狀態變化
- 任務執行進度

---

### 3. 資料視覺化

**儀表板顯示：**

| 資訊類型 | 顯示方式 | 更新頻率 |
|---------|---------|---------|
| AGV 位置 | 地圖 Marker | 即時 |
| 電池電量 | 顏色編碼圖示 | 即時 |
| 任務狀態 | 文字標籤 | 即時 |
| 歷史軌跡 | 地圖路徑 | 按需載入 |
| 系統日誌 | 日誌檢視器 | 即時 |

**電池電量顏色編碼：**
```
0% - 19%:  紅色 (#F45)
20% - 39%: 橘色 (#FC5)
40% - 49%: 黃色 (#FE5)
50% - 100%: 綠色 (#8F5)
```

---

## 🏗️ 系統架構

### WebAGVClient（前端）

**技術棧：**
- **Vue 3**：現代化前端框架
- **Vite**：極速開發建置工具
- **Vuetify 3**：Material Design UI 框架
- **Leaflet**：地圖引擎
- **Socket.IO Client**：即時通訊
- **MQTT.js**：MQTT 客戶端
- **Pinia**：狀態管理

**專案結構：**
```
src/
├── views/              # 頁面元件
│   ├── Home.vue       # 地圖監控主頁
│   ├── Task.vue       # 任務管理
│   ├── Signal.vue     # 訊號監控
│   ├── Log.vue        # 日誌檢視
│   ├── Login.vue      # 登入頁面
│   └── Dev.vue        # 開發工具
├── components/         # 可重用元件
│   ├── Sidebar.vue    # 側邊欄
│   ├── MapLegend.vue  # 地圖圖例
│   └── CopyRight.vue  # 版權資訊
├── services/           # API 服務
├── router/             # 路由配置
├── layouts/            # 佈局元件
└── store.js            # Pinia 狀態管理
```

---

### WebAGVServer（後端）

**技術棧：**
- **Node.js**：伺服器執行環境
- **Express**：Web 框架
- **Socket.IO**：即時通訊伺服器
- **MQTT**：訊息佇列
- **rclnodejs**：ROS 2 Node.js 綁定
- **Sequelize**：ORM（支援 PostgreSQL / MSSQL）
- **Winston**：日誌系統

**專案結構：**
```
src/
├── server.js           # 主伺服器入口
├── app.js              # Express 應用配置
├── api/                # RESTful API 路由
│   ├── apiRouter.js   # API 路由器
│   └── routes/        # 各功能路由
│       ├── logRoutes.js
│       ├── mapRoutes.js
│       ├── missionRoute.js
│       ├── taskRoutes.js
│       ├── signalRoutes.js
│       └── userRoutes.js
├── socket/             # Socket.IO 配置
│   ├── socketio.js    # Socket.IO 初始化
│   └── socketRouter.js # Socket 命名空間路由
├── mqtt/               # MQTT 配置
│   ├── mqtt.js        # MQTT 客戶端初始化
│   └── mqttRouter.js  # MQTT 主題訂閱
├── ros/                # ROS 2 整合
│   └── rosCore.js     # ROS 2 節點
├── db/                 # 資料庫
│   ├── database.js    # 資料庫連接
│   └── models/        # Sequelize 模型
├── services/           # 業務邏輯服務
│   └── dataPollingService.js # 資料輪詢
├── config/             # 配置檔案
└── utils/              # 工具函式
```

---

## 💻 核心技術實現

### 1. Leaflet 地圖整合

**自定義 Marker 系統：**

```javascript
// AGV Marker 配置（每個 Marker 內含 3 個 Marker）
const agvMarkers = {
  mainMarker: L.marker(),     // 主要 AGV 圖示
  batteryMarker: L.divIcon(), // 電池圖示
  taskMarker: L.divIcon()     // 任務資訊
};

// 設備 Marker 配置（每個 Marker 內含 2 個 Marker）
const eqpMarkers = {
  mainMarker: L.marker(),     // 設備圖示
  nameMarker: L.divIcon()     // 設備名稱
};
```

**Marker 旋轉（顯示 AGV 航向）：**
- 使用 `leaflet-rotatedmarker` 套件
- 根據 AGV 的 `heading` 角度旋轉圖示
- 平滑旋轉動畫

**地圖座標系統：**
- 使用自定義座標系統（非經緯度）
- 網格大小：40px × 40px
- 圖示大小：40px × 40px
- 座標轉換：AGV 實際座標 → 地圖像素座標

---

### 2. Socket.IO 即時通訊

**前端連接：**
```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:3000", {
  cors: {
    origin: "*"
  }
});

// 監聽 AGV 位置更新
socket.on("agv-update", (data) => {
  updateAGVPosition(data);
});
```

**後端事件分發：**
```javascript
io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// 命名空間路由
socketRouter(io);
```

---

### 3. MQTT 整合

**訂閱 AGV 狀態更新：**
```javascript
export function initMQTT() {
  const mqttClient = mqtt.connect(process.env.MQTT_BROKER_URL);

  mqttClient.on("connect", () => {
    console.log("Connected to MQTT broker");
    mqttRouter(mqttClient);
  });
}
```

**MQTT 主題訂閱：**
- `agv/+/status` - AGV 狀態更新
- `agv/+/position` - AGV 位置更新
- `agv/+/battery` - 電池電量更新
- `equipment/+/status` - 設備狀態更新

---

### 4. ROS 2 整合

**使用 rclnodejs 橋接 ROS 2：**

```javascript
import rclnodejs from 'rclnodejs';

export async function startRosCore() {
  await rclnodejs.init();
  const node = new rclnodejs.Node('webagv_bridge');

  // 訂閱 ROS 2 主題
  const subscription = node.createSubscription(
    'std_msgs/msg/String',
    'agv_status',
    (msg) => {
      // 處理 ROS 2 訊息
      console.log('Received:', msg.data);
    }
  );

  rclnodejs.spin(node);
}
```

**整合目的：**
- 直接訂閱 RosAGV 的 ROS 2 主題
- 無需額外的中介層
- 降低通訊延遲

---

### 5. 資料輪詢服務

**定期從資料庫更新資料：**

```javascript
export function dataPolling() {
  setInterval(async () => {
    // 從資料庫載入最新資料
    const agvData = await db.getAGVData();
    const eqpData = await db.getEquipmentData();

    // 透過 Socket.IO 廣播給所有客戶端
    io.emit("data-update", { agvData, eqpData });
  }, 1000); // 每秒更新
}
```

---

## 🎨 使用者介面

### 1. 地圖監控主頁（Home.vue）

**功能：**
- 中央大地圖顯示
- 側邊欄顯示 AGV 列表
- 地圖圖例（MapLegend）
- 全螢幕模式按鈕

**互動功能：**
- 點擊 AGV 查看詳細資訊
- 拖曳地圖平移
- 滾輪縮放
- 點擊設備查看狀態

---

### 2. 任務管理（Task.vue）

**功能：**
- 顯示所有進行中的任務
- 任務分配狀態
- 任務優先級
- 任務歷史記錄

---

### 3. 訊號監控（Signal.vue）

**功能：**
- PLC 訊號狀態
- 設備訊號監控
- 訊號變化歷史
- JSON 資料檢視器（@anilkumarthakur/vue3-json-viewer）

---

### 4. 日誌檢視（Log.vue）

**功能：**
- 系統日誌即時顯示
- 日誌等級篩選（Error / Warn / Info / Debug）
- 關鍵字搜尋
- 日誌匯出

---

## 🔧 開發與部署

### 開發環境

**前端開發：**
```bash
cd WebAGVClient
npm install
npm run dev  # http://localhost:5173
```

**後端開發：**
```bash
cd WebAGVServer
npm install
npm start    # http://localhost:3000
```

---

### 生產部署

**建置前端：**
```bash
npm run build
# 產生 dist/ 目錄
```

**部署流程：**
```bash
npm run deploy
# 1. 建置前端（npm run build）
# 2. 複製 dist/* 到後端 public/ 目錄（npm run publish）
```

**啟動後端伺服器：**
```bash
npm start
# 同時提供 API 服務和靜態網頁
```

**訪問網址：**
- 前端網頁：http://localhost:3000
- API 服務：http://localhost:3000/api/

---

## 🎯 技術亮點

### 1. 多重通訊協定整合

**同時支援三種通訊方式：**
- **Socket.IO**：瀏覽器 ↔ 伺服器即時雙向通訊
- **MQTT**：AGV 系統 ↔ 伺服器訊息佇列
- **ROS 2**：RosAGV 核心系統整合

**為什麼需要三種？**
- Socket.IO：Web 前端最佳選擇，即時性好
- MQTT：工業標準，AGV 系統常用
- ROS 2：直接整合 RosAGV，減少中介層

---

### 2. 地圖視覺化技術

**Leaflet 的優勢：**
- ✅ 輕量級（僅 38 KB）
- ✅ 擴展性強（豐富的插件生態）
- ✅ 支援自定義座標系統
- ✅ 效能優秀

**自定義功能：**
- 旋轉 Marker（航向顯示）
- 自定義圖示（電池、任務）
- 網格座標系統
- 全螢幕模式

---

### 3. Vue 3 Composition API

**使用最新 Vue 3 語法：**
```vue
<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { useMainStore } from "../store";

const store = useMainStore();
const agvData = computed(() => store.agvData);

onMounted(() => {
  initializeMap();
});
</script>
```

**優勢：**
- 更簡潔的程式碼
- 更好的 TypeScript 支援
- 更容易重用邏輯

---

### 4. Pinia 狀態管理

**集中管理應用狀態：**
```javascript
import { defineStore } from 'pinia';

export const useMainStore = defineStore('main', {
  state: () => ({
    agvData: [],
    eqpData: [],
    mapConfig: {}
  }),
  actions: {
    updateAGVData(data) {
      this.agvData = data;
    }
  }
});
```

---

### 5. 資料庫抽象層

**支援多種資料庫：**
- PostgreSQL（主要）
- Microsoft SQL Server

**使用 Sequelize ORM：**
- 自動化資料表管理
- 查詢建構器
- 資料驗證
- 關聯關係處理

---

## 💡 開發體會

這個專案讓我學到：

**多重通訊協定的整合挑戰：**
- Socket.IO、MQTT、ROS 2 三種協定同時運作
- 需要仔細設計訊息流向
- 避免重複資料傳輸

**地圖視覺化的複雜性：**
- Leaflet 雖然輕量，但客製化功能需要深入理解
- 座標轉換是關鍵（實際座標 → 地圖像素）
- Marker 旋轉動畫需要效能優化

**即時性 vs 效能的平衡：**
- 不是所有資料都需要即時更新
- 使用輪詢（1秒）+ 即時推送的混合模式
- Socket.IO 命名空間分離資料流

**前後端分離的好處：**
- 前端可獨立開發測試
- 後端 API 可被多個前端使用
- 部署靈活（可分開部署或一起部署）

---

## 🚀 未來優化

目前系統運作良好，未來可優化的方向：

- 📋 增加歷史軌跡回放功能
- 📋 優化地圖效能（大量 Marker 時）
- 📋 增加告警通知系統
- 📋 支援多地圖切換（不同廠區）
- 📋 增加資料統計圖表

---

**專案資訊**
- **專案類型**：AGV 車隊即時監控看板
- **前端**：Vue 3 + Vite + Vuetify 3 + Leaflet + Socket.IO
- **後端**：Node.js + Express + Socket.IO + MQTT + rclnodejs
- **資料庫**：PostgreSQL / MSSQL
- **應用領域**：工業自動化、AGV 監控
- **公司**：擎添工業（Ching-Tech Industrial）

---

Happy Coding! 📊
