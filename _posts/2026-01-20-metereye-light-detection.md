---
layout: post
title: "MeterEye：AI 指示燈與警報燈偵測"
subtitle: "用電腦視覺監控設備狀態"
date: 2026-01-20
categories: [Computer Vision]
tags: [Computer Vision, Python, AI, 工業自動化, MeterEye]
---

> **適合讀者**：對工業自動化、電腦視覺有興趣的開發者
>
> **前置知識**：基本的 Python 與 OpenCV 概念

---

## 前言

工廠裡除了數位儀表上的數字需要讀取，還有大量的**指示燈與警報燈**需要監控。火災受信總機上的區域燈號、設備運轉狀態指示燈、異常警報燈——這些燈號的「亮」或「滅」，直接關係到產線安全與設備健康。

[MeterEye](https://github.com/yazelin/ching-tech-metereye) 是 ChingTech（擎添工業）開發的多攝影機儀表監控系統，原本專注於**七段顯示器數值辨識**。在實際部署中，客戶提出了明確需求：同一組 RTSP 攝影機畫面裡，除了壓力錶數值，還需要同時偵測警報面板上的燈號狀態。

本文記錄 MeterEye 如何擴充**指示燈偵測（Indicator Detection）**功能，從資料模型設計、影像處理演算法，到與既有系統的整合。

---

## 應用場景

具體來說，指示燈偵測要解決以下場景：

| 場景 | 說明 |
|------|------|
| 火災受信總機 | 面板上有多個區域燈號，正常時熄滅，警報時紅燈亮起 |
| 設備運轉指示 | 綠燈亮起表示正常運轉，紅燈表示異常 |
| 壓力/溫度警報 | 超過安全範圍時，旁邊的警告燈亮起 |
| 雙色指示燈 | 綠色正常 / 紅色異常，需要區分顏色而非只看亮滅 |

共同特徵是：輸出是**布林值（ON / OFF）**，而非像七段顯示器那樣輸出連續數值。

---

## 系統架構概觀

MeterEye 採用 **Thread-per-Camera** 架構，每台攝影機在獨立的 Worker 執行緒中處理影像。在指示燈功能加入後，單一攝影機可以同時配置多個 Meter（數值辨識）和多個 Indicator（燈號偵測），共用同一個影像幀進行處理：

```
RTSP Camera
    |
    v
CameraWorker (Thread)
    |
    +---> Meter 1 --> 透視校正 --> 七段辨識 --> Reading (float)
    +---> Meter 2 --> 透視校正 --> 七段辨識 --> Reading (float)
    +---> Indicator 1 --> 透視校正 --> 燈號偵測 --> IndicatorReading (bool)
    +---> Indicator 2 --> 透視校正 --> 燈號偵測 --> IndicatorReading (bool)
    |
    v
ExporterManager --> HTTP / MQTT / Database
```

指示燈的偵測流程比七段顯示器辨識輕量許多，對 CPU 負載影響有限。

---

## 資料模型設計

設計上的第一個決策是：**指示燈用獨立的資料模型，而非復用 Meter**。

原因很直接——Meter 的輸出是 `float`（數值），Indicator 的輸出是 `bool`（開/關）。雖然可以用 `value=1.0` / `value=0.0` 硬套，但語意不清。因此新增了獨立的 `IndicatorConfigData` 和 `IndicatorReading`：

```python
@dataclass(frozen=True)
class IndicatorConfigData:
    """Configuration for a single indicator/alarm light (immutable)."""

    id: str
    name: str
    perspective: PerspectivePoints
    detection_mode: str = "brightness"  # brightness or color
    threshold: int = 128  # 0 = auto (Otsu), 1-255 = manual
    on_color: str = "red"  # For color mode: red, green, blue
    show_on_dashboard: bool = True
```

```python
@dataclass
class IndicatorReading:
    """A single indicator reading (on/off state)."""

    camera_id: str
    indicator_id: str
    state: bool  # True = ON, False = OFF
    brightness: float  # Actual brightness value (0-255) for debugging
    timestamp: datetime
```

與 Meter 一樣，設定模型使用 `frozen=True` 確保執行緒安全——設定物件建立後不可修改，需要更新時整個替換。

---

## 偵測演算法：兩種模式

指示燈偵測的核心在 `IndicatorDetector` 類別，支援兩種模式。

### 亮度模式（Brightness Mode）

最直覺的方式：將 ROI 影像轉為灰階，計算**平均亮度值**，與閾值比較。

```python
def _detect_by_brightness(self, roi_image: np.ndarray) -> tuple[bool, float, np.ndarray]:
    # 轉灰階
    gray = cv2.cvtColor(roi_image, cv2.COLOR_BGR2GRAY)

    # 計算平均亮度
    brightness = float(np.mean(gray))

    # 決定閾值
    if self.threshold == 0:
        # 自動閾值：Otsu 演算法
        thresh_value, _ = cv2.threshold(
            gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU
        )
    else:
        thresh_value = self.threshold

    # 判定：亮度超過閾值 = ON
    state = brightness > thresh_value

    return state, brightness, debug
```

適用場景：單色燈號（紅色警報燈），背景較暗，亮起時整個 ROI 區域明顯變亮。

當 `threshold` 設為 `0` 時，系統使用 **Otsu 演算法**自動決定最佳二值化閾值，適合光線條件相對穩定的環境。

### 顏色模式（Color Mode）

當需要區分特定顏色時（例如紅/綠雙色燈），改用 HSV 色彩空間分析：

```python
# HSV 色彩範圍定義
COLOR_RANGES = {
    "red": [
        # 紅色在 HSV 中跨越 0 度，需要兩個範圍
        ((0, 100, 100), (10, 255, 255)),
        ((160, 100, 100), (180, 255, 255)),
    ],
    "green": [
        ((35, 100, 100), (85, 255, 255)),
    ],
    "blue": [
        ((100, 100, 100), (130, 255, 255)),
    ],
    "yellow": [
        ((20, 100, 100), (35, 255, 255)),
    ],
    "orange": [
        ((10, 100, 100), (20, 255, 255)),
    ],
}
```

偵測流程：

```python
def _detect_by_color(self, roi_image: np.ndarray) -> tuple[bool, float, np.ndarray]:
    # 轉換到 HSV 色彩空間
    hsv = cv2.cvtColor(roi_image, cv2.COLOR_BGR2HSV)

    # 對目標顏色建立遮罩
    mask = np.zeros(hsv.shape[:2], dtype=np.uint8)
    for lower, upper in color_ranges:
        lower_bound = np.array(lower, dtype=np.uint8)
        upper_bound = np.array(upper, dtype=np.uint8)
        mask |= cv2.inRange(hsv, lower_bound, upper_bound)

    # 計算顏色比例（匹配像素的百分比）
    total_pixels = mask.shape[0] * mask.shape[1]
    color_pixels = np.count_nonzero(mask)
    color_ratio = (color_pixels / total_pixels) * 100

    # 超過閾值百分比 = ON
    state = color_ratio > thresh_value

    return state, color_ratio, debug
```

這裡有個值得注意的技術細節：**紅色在 HSV 色相環上橫跨 0 度**，所以紅色需要兩組範圍（0-10 和 160-180），用 bitwise OR 合併遮罩。

預設的顏色比例閾值是 10%——當 ROI 中超過 10% 的像素匹配目標顏色時，判定為 ON。

---

## 與 Camera Manager 的整合

在 `CameraWorker` 中，指示燈偵測與七段辨識並行處理，共用同一個影像幀：

```python
def _process_frame(self, frame: np.ndarray) -> None:
    timestamp = datetime.now()

    # 處理 Meters（七段顯示器辨識）
    for meter in self._meters:
        warped = apply_perspective_transform(frame, meter.perspective)
        if warped is None:
            continue
        recognizer = self._recognizers[meter.id]
        result, _ = recognizer.recognize(warped)
        # ... 建立 Reading 並發送到 queue

    # 處理 Indicators（燈號偵測）
    for indicator in self._indicators:
        warped = apply_perspective_transform(frame, indicator.perspective)
        if warped is None:
            continue
        detector = self._indicator_detectors[indicator.id]
        state, brightness, _ = detector.detect(warped)
        # ... 建立 IndicatorReading 並發送到 queue
```

兩者都經過**透視校正**（4 點 Perspective Transform）擷取 ROI，再分別交給各自的偵測器處理。結果透過獨立的 Queue 和 Dispatcher 執行緒發送給匯出模組。

指示燈也支援**熱重載（Hot Reload）**——透過 Web 介面或 API 修改設定後，無需重啟服務，Worker 執行緒會即時更新偵測器：

```python
def update_indicators(self, indicators: tuple[IndicatorConfigData, ...]) -> None:
    with self._status_lock:
        for indicator in indicators:
            old_det = old_detectors.get(indicator.id)
            if (old_det and
                old_det.detection_mode == indicator.detection_mode and
                old_det.threshold == indicator.threshold and
                old_det.on_color == indicator.on_color):
                # 設定未變更，復用既有偵測器
                self._indicator_detectors[indicator.id] = old_det
            else:
                # 建立新偵測器
                self._indicator_detectors[indicator.id] = IndicatorDetector(...)
```

---

## YAML 設定範例

在 `config.yaml` 中，指示燈設定與錶頭並列於攝影機下：

```yaml
cameras:
  - id: cam-fire-panel
    name: 火災警報面板
    url: ${RTSP_URL_FIRE}
    enabled: true
    processing_interval_seconds: 1.0
    meters: []  # 此攝影機無數位儀表

    indicators:
      - id: fire-west
        name: 西側PBL
        perspective:
          points: [[100, 200], [200, 200], [200, 250], [100, 250]]
          output_size: [100, 50]
        detection:
          mode: brightness    # 亮度模式
          threshold: 128      # 0=自動 (Otsu), 1-255=手動
          on_color: red       # 顏色模式時使用
        show_on_dashboard: true

      - id: fire-east
        name: 東側PBL
        perspective:
          points: [[300, 200], [400, 200], [400, 250], [300, 250]]
          output_size: [100, 50]
        detection:
          mode: color         # 顏色模式
          threshold: 0        # 自動（預設 10% 匹配比例）
          on_color: red
        show_on_dashboard: true
```

同一台攝影機也可以同時監控數值與燈號：

```yaml
cameras:
  - id: cam-pressure
    name: 壓力錶區
    url: ${RTSP_URL_PRESSURE}
    meters:
      - id: meter-01
        name: 主壓力錶
        # ... 七段辨識設定
    indicators:
      - id: alarm-pressure-high
        name: 壓力過高警報
        # ... 燈號偵測設定
```

---

## REST API 與 Dashboard

指示燈狀態透過 REST API 對外暴露，與 ChingTech OS 或其他系統整合：

| 端點 | 說明 |
|------|------|
| `GET /api/cameras/{id}/indicators` | 攝影機的指示燈列表與狀態 |
| `POST /api/config/cameras/{id}/indicators` | 新增指示燈 |
| `PUT /api/config/cameras/{id}/indicators/{iid}` | 更新指示燈設定 |
| `DELETE /api/config/cameras/{id}/indicators/{iid}` | 刪除指示燈 |
| `POST /api/preview/indicator` | 偵測結果預覽 |

Web Dashboard 上，指示燈狀態以直覺的視覺化方式呈現：ON 時顯示亮色（紅/綠），OFF 時顯示灰色。

資料匯出方面，指示燈狀態與儀表讀數共用相同的三種匯出管道：

- **HTTP POST**：JSON payload 包含 `indicator_id`、`state`（boolean）、`timestamp`
- **MQTT**：發布至 `ctme/{camera_id}/{indicator_id}` topic
- **Database**：獨立的 `indicator_readings` 資料表儲存歷史記錄

---

## 小結

MeterEye 的指示燈偵測功能，從技術角度來看並不複雜——核心不過是灰階平均值與 HSV 色彩遮罩。但在工業現場，這種「簡單但可靠」的方案往往比花俏的深度學習模型更實用：

- **亮度模式**：一行 `np.mean(gray)` 就完成判斷，計算量極低
- **顏色模式**：HSV 空間的 `cv2.inRange()` 過濾，不需要訓練資料
- **Otsu 自動閾值**：在光線相對穩定的室內環境中，大幅降低人工調參的需求

設計上的幾個關鍵決策值得記錄：

1. **獨立資料模型**：Indicator 與 Meter 語意不同（bool vs float），分開比混用更清晰
2. **與既有架構共存**：共用透視校正、Camera Worker、匯出管道，新增模組而非改寫既有程式碼
3. **熱重載支援**：生產環境中不能隨意重啟服務，設定變更即時生效是必要條件

MeterEye 是 ChingTech OS 生態系的一部分，透過 REST API 與 MQTT，可以輕鬆將燈號狀態整合進上位管理系統，搭配歷史資料庫實現長期趨勢分析與異常回溯。

---

## 參考資源

- [OpenCV - cv2.threshold()](https://docs.opencv.org/4.x/d7/d4d/tutorial_py_thresholding.html) - 包含 Otsu 自動閾值說明
- [OpenCV - cv2.inRange()](https://docs.opencv.org/4.x/da/d97/tutorial_threshold_inRange.html) - HSV 色彩範圍過濾
- [OpenCV - cv2.getPerspectiveTransform()](https://docs.opencv.org/4.x/da/d54/group__imgproc__transform.html) - 透視變換
- [Otsu's method - Wikipedia](https://en.wikipedia.org/wiki/Otsu%27s_method) - Otsu 演算法原理
