---
layout: post
title: "C# WinForms 整合 Python OpenCV - Python.NET 完整教學"
subtitle: "用 Python.NET 在 C# 中呼叫 Python 寫的 OpenCV 程式"
date: 2025-12-16
categories: [C#, Python]
tags: [C#, Python, OpenCV, Python.NET, WinForms, 影像處理]
---

![C# WinForms 整合 Python OpenCV - Python.NET 完整教學](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2025-12-16-csharp-pythonnet-opencv.png)

> **📖 前置知識**：本文假設你已熟悉 C# WinForms 基礎開發
>
> **🔧 替代方案**：如果不需要使用現有的 Python 程式碼，建議直接使用 [OpenCVSharp](https://github.com/shimat/opencvsharp)

---

## 這篇文章要解決什麼問題？

**開發者**：「我有一些 Python 寫的 OpenCV 影像處理程式，但專案是 C# WinForms，能不能直接呼叫？」

**前輩**：「可以啊，用 Python.NET。」

**開發者**：「聽起來很複雜...」

**前輩**：「其實不難，但要注意版本相容性。Python 版本、.NET 版本都有限制。」

**開發者**：「那我該用 .NET Framework 還是 .NET Core？」

**前輩**：「都可以，但 .NET Framework 4.8 最簡單。新專案建議 .NET 8。」

這篇文章會教你：
- ✅ Python.NET 的版本相容性（Python 3.14 不支援！）
- ✅ 完整的環境設定流程
- ⭐ **使用自訂模組前必讀**（GIL、路徑、型別轉換等核心概念）
- ✅ OpenCV 實戰範例（包含自訂函數呼叫）
- ✅ 常見錯誤的疑難排解

---

## Python.NET 是什麼？

**Python.NET**（pythonnet）是讓 .NET 應用程式能夠呼叫 Python 程式碼的橋接套件。

### 兩個主要功能

1. **從 C# 呼叫 Python**（本文重點）
   - 在 C# 專案中執行 Python 程式碼
   - 呼叫 Python 函數、匯入模組
   - 使用 Python 套件（如 OpenCV、NumPy）

2. **從 Python 呼叫 .NET**
   - 在 Python 中使用 .NET 類別庫
   - 本文不涵蓋此用法

### 為什麼選擇 Python.NET？

| 情境 | 建議 |
|------|------|
| 已有 Python OpenCV 程式碼想重複使用 | ✅ 使用 Python.NET |
| 從零開始開發影像處理功能 | ⭐ 建議直接用 [OpenCVSharp](https://github.com/shimat/opencvsharp) |
| 需要高效能的即時處理 | ⭐ 建議用 OpenCVSharp |
| 想用 Python 的機器學習模型 | ✅ 使用 Python.NET |

---

## 版本相容性（超級重要！）

### Python 版本支援

| Python 版本 | Python.NET 3.0.5 支援 |
|------------|---------------------|
| **3.7 - 3.13** | ✅ 支援 |
| **3.14.x** | ❌ **不支援** |
| 3.6 或更低 | ❌ 不支援 |

> ⚠️ **常見錯誤**：如果你的 Python 是 3.14，會遇到 `System.NotSupportedException: 'Python ABI v3.14.x is not supported'`
>
> **解決方案**：安裝 Python 3.12 或 3.13（推薦 3.12）

### .NET 版本支援

| .NET 版本 | 支援情況 | WinForms 支援 | 建議 |
|----------|---------|-------------|------|
| **.NET Framework 4.8** | ✅ 需要 ≥ 4.7.2 | ✅ 原生支援 | ⭐ 舊專案首選 |
| **.NET Framework 4.7.2** | ✅ 最低版本 | ✅ | ✅ |
| **.NET 6/7/8** | ✅ 支援 | ✅ 僅 Windows | ⭐ 新專案首選 |
| **.NET Core 3.1** | ✅ 最低版本 | ✅ 僅 Windows | ⚠️ 已過時 |
| .NET Framework 4.6 或更低 | ❌ 不支援 | - | - |

### 推薦組合

| 專案類型 | .NET 版本 | Python 版本 | NuGet 套件 |
|---------|----------|------------|-----------|
| **舊專案/穩定性優先** | .NET Framework 4.8 | Python 3.12 | pythonnet 3.0.5 |
| **新專案/現代化** | .NET 8 | Python 3.12 | pythonnet 3.0.5 |

---

## 環境準備

### 1. 安裝 Python（重要）

**下載 Python 3.12：**
- 前往 [Python 官網](https://www.python.org/downloads/)
- 下載 Python 3.12.x（**不要用 3.14**）
- 安裝時勾選「Add Python to PATH」

**驗證安裝：**
```bash
python --version
# 應顯示：Python 3.12.x
```

### 2. 安裝 Python 套件

```bash
# 安裝 OpenCV
pip install opencv-python

# 驗證安裝
python -c "import cv2; print(cv2.__version__)"
```

### 3. 建立 Visual Studio 專案

#### 方案 A：.NET Framework 4.8（推薦初學者）

1. 開啟 Visual Studio
2. 建立新專案 → **Windows Forms App (.NET Framework)**
3. 選擇 **.NET Framework 4.8**
4. 專案名稱：`OpenCVWinFormsApp`

#### 方案 B：.NET 8（推薦新專案）

1. 建立新專案 → **Windows Forms App**
2. 選擇 **.NET 8.0**
3. 目標框架：**.NET 8.0-windows**

### 4. 安裝 NuGet 套件

在 Visual Studio 的「套件管理器主控台」執行：

```powershell
Install-Package pythonnet
```

或使用 NuGet 套件管理員搜尋並安裝 `pythonnet`（版本 3.0.5）。

---

## 基本設定與初始化

### .NET Framework 4.8 版本

```csharp
using System;
using System.IO;
using System.Windows.Forms;
using Python.Runtime;

namespace OpenCVWinFormsApp
{
    public partial class Form1 : Form
    {
        public Form1()
        {
            InitializeComponent();

            if (!InitializePython())
            {
                MessageBox.Show("Python 初始化失敗，應用程式將關閉");
                this.Close();
            }
        }

        private bool InitializePython()
        {
            try
            {
                // 設定 Python DLL 路徑（根據你的安裝位置調整）
                // 方法 1：直接指定完整路徑
                Runtime.PythonDLL = @"C:\Python312\python312.dll";

                // 方法 2：自動偵測（推薦）
                // Runtime.PythonDLL = GetPythonDLL();

                // 初始化 Python 引擎
                PythonEngine.Initialize();

                // 驗證 OpenCV 是否可用
                using (Py.GIL())
                {
                    dynamic cv2 = Py.Import("cv2");
                    string version = cv2.__version__.ToString();

                    MessageBox.Show(
                        $"Python 初始化成功！\nOpenCV 版本：{version}",
                        "成功",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information
                    );

                    return true;
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    $"初始化失敗：{ex.Message}\n\n" +
                    "請確認：\n" +
                    "1. Python 3.7-3.13 已安裝（不支援 3.14）\n" +
                    "2. 已執行：pip install opencv-python\n" +
                    "3. Runtime.PythonDLL 路徑正確",
                    "錯誤",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );

                return false;
            }
        }

        // 自動偵測 Python DLL（推薦）
        private string GetPythonDLL()
        {
            string username = Environment.UserName;
            string[] pythonVersions = { "312", "313", "311", "310", "39" };

            foreach (var version in pythonVersions)
            {
                // 檢查標準安裝路徑
                string dllPath = $@"C:\Python{version}\python{version}.dll";
                if (File.Exists(dllPath))
                    return dllPath;

                // 檢查使用者目錄
                dllPath = $@"C:\Users\{username}\AppData\Local\Programs\Python\Python{version}\python{version}.dll";
                if (File.Exists(dllPath))
                    return dllPath;
            }

            throw new FileNotFoundException("找不到支援的 Python DLL（需要 3.9-3.13）");
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            // 關閉時釋放 Python 引擎
            if (PythonEngine.IsInitialized)
            {
                PythonEngine.Shutdown();
            }
            base.OnFormClosing(e);
        }
    }
}
```

### .NET 8 版本（額外設定）

```csharp
using System;
using System.Windows.Forms;
using Python.Runtime;

namespace OpenCVWinFormsApp
{
    public partial class Form1 : Form
    {
        public Form1()
        {
            InitializeComponent();
            InitializePython();
        }

        private void InitializePython()
        {
            try
            {
                // .NET 8 需要指定使用 CoreCLR
                Environment.SetEnvironmentVariable("PYTHONNET_RUNTIME", "coreclr");

                Runtime.PythonDLL = @"C:\Python312\python312.dll";
                PythonEngine.Initialize();

                // .NET Core/.NET 建議啟用多執行緒
                PythonEngine.BeginAllowThreads();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Python 初始化失敗：{ex.Message}");
            }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (PythonEngine.IsInitialized)
            {
                PythonEngine.Shutdown();
            }
            base.OnFormClosing(e);
        }
    }
}
```

---

## ⚠️ 使用自訂模組前必讀

在開始寫程式之前，**一定要先了解這些核心概念**，否則會遇到很多難以理解的錯誤！

### 1. GIL 是什麼？為什麼必須使用？

**GIL = Global Interpreter Lock（全域解譯器鎖）**

```csharp
// ❌ 錯誤：沒有 GIL，程式會崩潰或行為異常
dynamic cv2 = Py.Import("cv2");

// ✅ 正確：所有 Python 操作都要在 GIL 內
using (Py.GIL())
{
    dynamic cv2 = Py.Import("cv2");
    // ... 所有 Python 操作 ...
}
```

> **為什麼需要 GIL？**
> Python 的執行緒安全機制。在多執行緒環境下，GIL 確保同一時間只有一個執行緒執行 Python 程式碼。

**常見錯誤：GIL 範圍太小**

```csharp
// ❌ 錯誤：變數離開 GIL 後無法使用
dynamic mymodule;
using (Py.GIL())
{
    mymodule = Py.Import("mymodule");
}
var result = mymodule.process(); // 錯誤！已離開 GIL

// ✅ 正確：整個操作都在 GIL 內完成
using (Py.GIL())
{
    dynamic mymodule = Py.Import("mymodule");
    var result = mymodule.process();
    string output = result.ToString(); // 在 GIL 內取得結果
}
```

### 2. Python 模組路徑設定（重要！）

假設你的 Python 檔案在 `C:\MyProject\PythonScripts\opencv_utils.py`：

```csharp
using (Py.GIL())
{
    dynamic sys = Py.Import("sys");

    // ❌ 錯誤：忘記設定路徑
    dynamic mymodule = Py.Import("opencv_utils");
    // ModuleNotFoundError: No module named 'opencv_utils'

    // ❌ 錯誤：路徑格式錯誤（斜線方向）
    sys.path.append("C:/MyProject/PythonScripts");  // 混用斜線

    // ✅ 正確：使用 @ 字串
    sys.path.append(@"C:\MyProject\PythonScripts");
    dynamic mymodule = Py.Import("opencv_utils");

    // ⭐ 最佳：使用絕對路徑
    string scriptPath = Path.GetFullPath(@".\PythonScripts");
    sys.path.append(scriptPath);
}
```

**路徑設定的三種方式：**

| 方式 | 優點 | 缺點 |
|------|------|------|
| `@"C:\path"` | 簡單明確 | 寫死路徑 |
| `Path.GetFullPath(@".\relative")` | 相對路徑，彈性高 | 需注意工作目錄 |
| 環境變數 `PYTHONPATH` | 全域設定 | 影響其他程式 |

### 3. 參數傳遞與型別轉換

**C# 型別如何傳給 Python？**

```csharp
// Python 函數定義
/*
def process_data(name, age, scores):
    avg = sum(scores) / len(scores)
    return f"{name} ({age}歲) 平均: {avg}"
*/

using (Py.GIL())
{
    dynamic mymodule = Py.Import("mymodule");

    // ✅ 基本型別可直接傳遞
    string name = "張三";
    int age = 25;
    // 這些會自動轉換為 Python 的 str 和 int

    // ⚠️ List 需要特別處理
    List<int> csharpScores = new List<int> { 90, 85, 95 };

    // 方法 1：轉成陣列（簡單）
    int[] scores = csharpScores.ToArray();
    var result = mymodule.process_data(name, age, scores);

    // 方法 2：使用 PyList（精確控制）
    using (PyList pyScores = new PyList())
    {
        foreach (int score in csharpScores)
        {
            pyScores.Append(new PyInt(score));
        }
        var result = mymodule.process_data(name, age, pyScores);
    }
}
```

**型別對照速查表：**

| C# 型別 | Python 型別 | 傳遞方式 | 範例 |
|---------|------------|---------|------|
| `int`, `double`, `float` | `int`, `float` | ✅ 直接傳 | `42`, `3.14` |
| `string` | `str` | ✅ 直接傳 | `"Hello"` |
| `bool` | `bool` | ✅ 直接傳 | `true` → `True` |
| `int[]`, `double[]` | `list` | ✅ 直接傳 | `new int[] {1,2,3}` |
| `List<T>` | `list` | ⚠️ 轉陣列或 PyList | `list.ToArray()` |
| `Dictionary<K,V>` | `dict` | ⚠️ 需轉 PyDict | 見下方 |
| `null` | `None` | ✅ 直接傳 | `null` → `None` |

**Dictionary 的處理：**

```csharp
// Python 函數需要 dict
/*
def process_config(config):
    return config.get("mode", "default")
*/

using (Py.GIL())
{
    dynamic mymodule = Py.Import("mymodule");

    // 方法 1：用 PyDict
    using (PyDict config = new PyDict())
    {
        config["mode"] = new PyString("advanced");
        config["timeout"] = new PyInt(30);
        var result = mymodule.process_config(config);
    }

    // 方法 2：傳 JSON 字串（推薦）
    var configObj = new { mode = "advanced", timeout = 30 };
    string jsonConfig = JsonSerializer.Serialize(configObj);

    dynamic json = Py.Import("json");
    dynamic configDict = json.loads(jsonConfig);
    var result = mymodule.process_config(configDict);
}
```

### 4. 返回值處理

**Python 回傳值如何轉回 C#？**

```csharp
// Python 函數
/*
def get_user():
    return {
        "name": "張三",
        "age": 25,
        "scores": [90, 85, 95]
    }
*/

using (Py.GIL())
{
    dynamic mymodule = Py.Import("mymodule");
    dynamic result = mymodule.get_user();

    // ❌ 可能出錯：型別不明確
    string name = result["name"];  // 可能執行階段錯誤

    // ✅ 正確：明確轉換
    string name = result["name"].ToString();
    int age = (int)result["age"];

    // List 的處理
    dynamic pyScores = result["scores"];
    List<int> csharpScores = new List<int>();

    foreach (dynamic score in pyScores)
    {
        csharpScores.Add((int)score);
    }
}
```

**處理不同返回型別：**

```csharp
using (Py.GIL())
{
    dynamic result = mymodule.some_function();

    // 檢查型別
    if (result is PyDict)
    {
        // 字典
        string value = result["key"].ToString();
    }
    else if (result is PyList)
    {
        // 列表
        foreach (dynamic item in result)
        {
            Console.WriteLine(item);
        }
    }
    else if (result is PyString)
    {
        // 字串
        string text = result.ToString();
    }
    else if (result == null)
    {
        // Python 的 None
        Console.WriteLine("返回 None");
    }
}
```

### 5. 錯誤處理（必須！）

**Python 函數可能拋出異常：**

```csharp
// Python 函數
/*
def divide(a, b):
    if b == 0:
        raise ValueError("除數不能為 0")
    return a / b
*/

// ❌ 沒有錯誤處理，程式會崩潰
using (Py.GIL())
{
    dynamic mymodule = Py.Import("mymodule");
    var result = mymodule.divide(10, 0); // 崩潰！
}

// ✅ 正確：捕捉 PythonException
using (Py.GIL())
{
    try
    {
        dynamic mymodule = Py.Import("mymodule");
        var result = mymodule.divide(10, 0);
    }
    catch (PythonException ex)
    {
        // Python 的異常
        MessageBox.Show($"Python 錯誤：{ex.Message}");
        // 詳細資訊
        Console.WriteLine(ex.StackTrace);
    }
    catch (Exception ex)
    {
        // C# 的異常
        MessageBox.Show($"系統錯誤：{ex.Message}");
    }
}
```

**實用的封裝方法：**

```csharp
private T SafeCallPython<T>(Func<T> pythonOperation, T defaultValue = default)
{
    try
    {
        using (Py.GIL())
        {
            return pythonOperation();
        }
    }
    catch (PythonException ex)
    {
        MessageBox.Show($"Python 執行錯誤：{ex.Message}");
        return defaultValue;
    }
    catch (Exception ex)
    {
        MessageBox.Show($"系統錯誤：{ex.Message}");
        return defaultValue;
    }
}

// 使用
double result = SafeCallPython(() =>
{
    dynamic mymodule = Py.Import("mymodule");
    return (double)mymodule.divide(10, 2);
}, defaultValue: 0.0);
```

### 6. 常見陷阱速覽

在開始寫程式前，先看看這些陷阱：

| 陷阱 | 後果 | 解決方案 |
|------|------|---------|
| 忘記 `using (Py.GIL())` | 程式崩潰 | 所有 Python 操作都要在 GIL 內 |
| GIL 範圍太小 | 無法使用 Python 物件 | 整個操作都放在同一個 GIL 內 |
| 忘記 `sys.path.append()` | `ModuleNotFoundError` | 先設定路徑再匯入 |
| 路徑用 `/` 混用 `\` | 找不到模組 | 統一用 `@"\\"` 或 `"/"` |
| List 直接傳遞 | 型別錯誤 | 轉成陣列或 PyList |
| 沒有錯誤處理 | 程式崩潰 | 用 `try-catch (PythonException)` |
| 使用相對路徑 | 找不到檔案 | 用 `Path.GetFullPath()` |
| 修改 Python 後沒重新載入 | 執行舊程式碼 | 用 `importlib.reload()` |

### 7. 快速檢查清單

在寫程式前，用這個清單確認：

- [ ] ✅ 已安裝 Python 3.7-3.13（不是 3.14）
- [ ] ✅ 已執行 `pip install opencv-python`（或你需要的套件）
- [ ] ✅ Python 檔案路徑確認存在
- [ ] ✅ 知道要用 `using (Py.GIL())`
- [ ] ✅ 知道要用 `sys.path.append()` 設定路徑
- [ ] ✅ 了解基本型別轉換規則
- [ ] ✅ 準備好錯誤處理

---

## OpenCV 實戰範例

### 範例 1：圖片灰階轉換

```csharp
private void btnGrayscale_Click(object sender, EventArgs e)
{
    using (Py.GIL()) // 所有 Python 呼叫都必須在 GIL 區塊內
    {
        dynamic cv2 = Py.Import("cv2");

        // 讀取圖片
        string inputPath = "input.jpg";
        dynamic img = cv2.imread(inputPath);

        // 轉換為灰階
        dynamic gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY);

        // 儲存結果
        string outputPath = "output_gray.jpg";
        cv2.imwrite(outputPath, gray);

        // 在 PictureBox 中顯示
        pictureBox1.Image = Image.FromFile(outputPath);

        MessageBox.Show("灰階轉換完成！");
    }
}
```

### 範例 2：邊緣檢測

```csharp
private void btnEdgeDetect_Click(object sender, EventArgs e)
{
    using (Py.GIL())
    {
        dynamic cv2 = Py.Import("cv2");

        // 讀取圖片
        dynamic img = cv2.imread("input.jpg");

        // 轉灰階
        dynamic gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY);

        // Canny 邊緣檢測
        dynamic edges = cv2.Canny(gray, 100, 200);

        // 儲存並顯示
        cv2.imwrite("edges.jpg", edges);
        pictureBox1.Image = Image.FromFile("edges.jpg");
    }
}
```

### 範例 3：Webcam 即時擷取

```csharp
private void btnCapture_Click(object sender, EventArgs e)
{
    using (Py.GIL())
    {
        dynamic cv2 = Py.Import("cv2");

        // 開啟攝影機（0 = 預設攝影機）
        dynamic cap = cv2.VideoCapture(0);

        if (!cap.isOpened())
        {
            MessageBox.Show("無法開啟攝影機！");
            return;
        }

        // 讀取一幀
        dynamic ret_frame = cap.read();
        bool ret = ret_frame[0];
        dynamic frame = ret_frame[1];

        if (ret)
        {
            // 儲存截圖
            string capturePath = "webcam_capture.jpg";
            cv2.imwrite(capturePath, frame);

            // 顯示在 PictureBox
            pictureBox1.Image = Image.FromFile(capturePath);

            MessageBox.Show("截圖完成！");
        }

        // 釋放攝影機
        cap.release();
    }
}
```

### 範例 4：呼叫自訂 Python 函數

假設你有一個 `opencv_utils.py`：

```python
# opencv_utils.py
import cv2
import numpy as np

def process_image(image_path):
    """圖片處理：灰階 + 高斯模糊"""
    img = cv2.imread(image_path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    return blurred

def detect_faces(image_path, cascade_path):
    """人臉偵測"""
    img = cv2.imread(image_path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    face_cascade = cv2.CascadeClassifier(cascade_path)
    faces = face_cascade.detectMultiScale(gray, 1.1, 4)

    # 畫框
    for (x, y, w, h) in faces:
        cv2.rectangle(img, (x, y), (x+w, y+h), (255, 0, 0), 2)

    return img
```

在 C# 中呼叫：

```csharp
private void btnCustomFunction_Click(object sender, EventArgs e)
{
    using (Py.GIL())
    {
        // 加入 Python 模組搜尋路徑
        dynamic sys = Py.Import("sys");
        sys.path.append(@"C:\path\to\your\python\scripts");

        // 匯入自訂模組
        dynamic opencv_utils = Py.Import("opencv_utils");

        // 呼叫自訂函數
        dynamic result = opencv_utils.process_image("input.jpg");

        // 儲存結果
        dynamic cv2 = Py.Import("cv2");
        cv2.imwrite("processed.jpg", result);

        // 顯示
        pictureBox1.Image = Image.FromFile("processed.jpg");
    }
}
```

### 範例 5：NumPy 陣列轉 Bitmap

```csharp
private Bitmap NumpyArrayToBitmap(dynamic numpyArray)
{
    using (Py.GIL())
    {
        dynamic cv2 = Py.Import("cv2");

        // 儲存到暫存檔
        string tempFile = Path.GetTempFileName() + ".png";
        cv2.imwrite(tempFile, numpyArray);

        // 載入為 Bitmap
        Bitmap bitmap = new Bitmap(tempFile);

        // 可選：刪除暫存檔
        // File.Delete(tempFile);

        return bitmap;
    }
}

// 使用範例
private void btnConvert_Click(object sender, EventArgs e)
{
    using (Py.GIL())
    {
        dynamic cv2 = Py.Import("cv2");
        dynamic img = cv2.imread("input.jpg");

        Bitmap bmp = NumpyArrayToBitmap(img);
        pictureBox1.Image = bmp;
    }
}
```

---

## 常見問題與疑難排解

### 問題 1：Python ABI v3.14 is not supported

```
System.NotSupportedException: 'Python ABI v3.14.2 is not supported.
Searching for Python Runtime TypeOffset314, found TypeOffset...
```

**原因：** Python.NET 3.0.5 不支援 Python 3.14

**解決方案：**
1. 解除安裝 Python 3.14
2. 安裝 Python 3.12：[下載連結](https://www.python.org/downloads/)
3. 修改程式碼：
   ```csharp
   Runtime.PythonDLL = @"C:\Python312\python312.dll";
   ```

### 問題 2：找不到 python3xx.dll

```
DllNotFoundException: Unable to load DLL 'python312.dll'
```

**解決方案：**

```csharp
// 檢查 DLL 是否存在
string dllPath = @"C:\Python312\python312.dll";
if (!File.Exists(dllPath))
{
    MessageBox.Show($"找不到 Python DLL：{dllPath}");
    return;
}
Runtime.PythonDLL = dllPath;
```

**常見路徑：**
- `C:\Python312\python312.dll`
- `C:\Users\<使用者>\AppData\Local\Programs\Python\Python312\python312.dll`

### 問題 3：ModuleNotFoundError: No module named 'cv2'

**原因：** Python 環境沒有安裝 OpenCV

**解決方案：**
```bash
pip install opencv-python

# 驗證
python -c "import cv2; print(cv2.__version__)"
```

### 問題 4：忘記使用 Py.GIL()

```csharp
// ❌ 錯誤：沒有 GIL
dynamic cv2 = Py.Import("cv2");

// ✅ 正確：使用 GIL
using (Py.GIL())
{
    dynamic cv2 = Py.Import("cv2");
    // ... 所有 Python 操作 ...
}
```

**為什麼需要 GIL？**
Python 的 Global Interpreter Lock 確保執行緒安全，所有 Python 呼叫都必須在 GIL 區塊內。

### 問題 5：.NET 8 無法載入

**錯誤：** 在 .NET 8 專案中無法正常初始化

**解決方案：** 明確指定使用 CoreCLR runtime

```csharp
// 在 PythonEngine.Initialize() 之前
Environment.SetEnvironmentVariable("PYTHONNET_RUNTIME", "coreclr");
Runtime.PythonDLL = @"C:\Python312\python312.dll";
PythonEngine.Initialize();
```

### 問題 6：.NET Framework 4.8 DLL 載入失敗

**參考：** [GitHub Issue #2005](https://github.com/pythonnet/pythonnet/discussions/2005)

**解決方案：**
1. 確認 .NET Framework 版本 ≥ 4.7.2
2. 如果問題持續，嘗試降級到 pythonnet 2.4.0

---

## 完整範例專案

### Form1.Designer.cs（部分）

```csharp
private void InitializeComponent()
{
    this.pictureBox1 = new System.Windows.Forms.PictureBox();
    this.btnGrayscale = new System.Windows.Forms.Button();
    this.btnEdgeDetect = new System.Windows.Forms.Button();
    this.btnCapture = new System.Windows.Forms.Button();
    this.btnBrowse = new System.Windows.Forms.Button();

    // pictureBox1
    this.pictureBox1.BorderStyle = System.Windows.Forms.BorderStyle.FixedSingle;
    this.pictureBox1.Location = new System.Drawing.Point(12, 12);
    this.pictureBox1.Size = new System.Drawing.Size(640, 480);
    this.pictureBox1.SizeMode = System.Windows.Forms.PictureBoxSizeMode.Zoom;

    // btnGrayscale
    this.btnGrayscale.Location = new System.Drawing.Point(12, 500);
    this.btnGrayscale.Text = "灰階轉換";
    this.btnGrayscale.Click += new System.EventHandler(this.btnGrayscale_Click);

    // ... 其他按鈕設定 ...
}
```

### Form1.cs（完整版）

```csharp
using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using Python.Runtime;

namespace OpenCVWinFormsApp
{
    public partial class Form1 : Form
    {
        private string currentImagePath;

        public Form1()
        {
            InitializeComponent();

            if (!InitializePython())
            {
                this.Close();
            }
        }

        private bool InitializePython()
        {
            try
            {
                Runtime.PythonDLL = GetPythonDLL();
                PythonEngine.Initialize();

                using (Py.GIL())
                {
                    dynamic cv2 = Py.Import("cv2");
                    MessageBox.Show($"初始化成功！OpenCV {cv2.__version__}");
                }

                return true;
            }
            catch (Exception ex)
            {
                MessageBox.Show($"初始化失敗：{ex.Message}");
                return false;
            }
        }

        private string GetPythonDLL()
        {
            string[] versions = { "312", "313", "311", "310" };
            foreach (var ver in versions)
            {
                string path = $@"C:\Python{ver}\python{ver}.dll";
                if (File.Exists(path)) return path;
            }
            throw new FileNotFoundException("找不到 Python 3.10-3.13");
        }

        private void btnBrowse_Click(object sender, EventArgs e)
        {
            using (OpenFileDialog ofd = new OpenFileDialog())
            {
                ofd.Filter = "圖片檔案|*.jpg;*.jpeg;*.png;*.bmp";
                if (ofd.ShowDialog() == DialogResult.OK)
                {
                    currentImagePath = ofd.FileName;
                    pictureBox1.Image = Image.FromFile(currentImagePath);
                }
            }
        }

        private void btnGrayscale_Click(object sender, EventArgs e)
        {
            if (string.IsNullOrEmpty(currentImagePath))
            {
                MessageBox.Show("請先選擇圖片！");
                return;
            }

            using (Py.GIL())
            {
                dynamic cv2 = Py.Import("cv2");
                dynamic img = cv2.imread(currentImagePath);
                dynamic gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY);

                string output = "gray.jpg";
                cv2.imwrite(output, gray);
                pictureBox1.Image = Image.FromFile(output);
            }
        }

        private void btnEdgeDetect_Click(object sender, EventArgs e)
        {
            if (string.IsNullOrEmpty(currentImagePath))
            {
                MessageBox.Show("請先選擇圖片！");
                return;
            }

            using (Py.GIL())
            {
                dynamic cv2 = Py.Import("cv2");
                dynamic img = cv2.imread(currentImagePath);
                dynamic gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY);
                dynamic edges = cv2.Canny(gray, 100, 200);

                string output = "edges.jpg";
                cv2.imwrite(output, edges);
                pictureBox1.Image = Image.FromFile(output);
            }
        }

        private void btnCapture_Click(object sender, EventArgs e)
        {
            using (Py.GIL())
            {
                dynamic cv2 = Py.Import("cv2");
                dynamic cap = cv2.VideoCapture(0);

                if (!cap.isOpened())
                {
                    MessageBox.Show("無法開啟攝影機！");
                    return;
                }

                var ret_frame = cap.read();
                bool ret = ret_frame[0];
                dynamic frame = ret_frame[1];

                if (ret)
                {
                    string output = "capture.jpg";
                    cv2.imwrite(output, frame);
                    pictureBox1.Image = Image.FromFile(output);
                }

                cap.release();
            }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (PythonEngine.IsInitialized)
            {
                PythonEngine.Shutdown();
            }
            base.OnFormClosing(e);
        }
    }
}
```

---

## 效能考量

### Python.NET vs OpenCVSharp 效能比較

| 項目 | Python.NET + OpenCV | OpenCVSharp |
|------|-------------------|-------------|
| 執行速度 | ⚠️ 較慢（跨語言呼叫） | ✅ 快（原生 .NET） |
| 記憶體使用 | ⚠️ 較高 | ✅ 較低 |
| 啟動時間 | ⚠️ 需初始化 Python | ✅ 即時 |
| 適用場景 | 批次處理、非即時 | 即時影像處理 |

### 最佳化建議

1. **重複使用 Python 物件**
   ```csharp
   // ❌ 每次都匯入（慢）
   using (Py.GIL())
   {
       dynamic cv2 = Py.Import("cv2");
       // ...
   }

   // ✅ 在初始化時匯入一次
   private dynamic cv2;
   private void InitializePython()
   {
       // ...
       using (Py.GIL())
       {
           cv2 = Py.Import("cv2");
       }
   }
   ```

2. **批次處理**：一次處理多張圖片，減少 GIL 進出次數

3. **非同步處理**：圖片處理放在背景執行緒
   ```csharp
   private async Task<Bitmap> ProcessImageAsync(string path)
   {
       return await Task.Run(() =>
       {
           using (Py.GIL())
           {
               // OpenCV 處理...
           }
       });
   }
   ```

---

## 參考資源

### 官方文件
- [Python.NET 官方文件](https://pythonnet.github.io/pythonnet/)
- [Python.NET GitHub](https://github.com/pythonnet/pythonnet)
- [NuGet: pythonnet](https://www.nuget.org/packages/pythonnet)

### 教學與範例
- [Calling Python from C# using Python.NET (2025)](https://www.r-bloggers.com/2025/02/calling-python-from-c-using-python-net/)
- [PythonNet OpenCV Webcam 範例](https://gist.github.com/Akasan/30f7a0ec78c94dacf55ebe2b5980c703)
- [Medium: Introduction to PythonNET](https://somegenericdev.medium.com/calling-python-from-c-an-introduction-to-pythonnet-c3d45f7d5232)

### GitHub Issues
- [.NET Core Support](https://github.com/pythonnet/pythonnet/issues/984)
- [.NET 4.8 Runtime 問題](https://github.com/pythonnet/pythonnet/discussions/2005)
- [.NET 8 支援](https://github.com/pythonnet/pythonnet/discussions/2421)

### 替代方案
- [OpenCVSharp](https://github.com/shimat/opencvsharp) - .NET 原生 OpenCV 封裝

---

## 總結

### 何時使用 Python.NET？

✅ **適合的情境：**
- 已有 Python OpenCV 程式碼需要整合
- 需要使用 Python 的機器學習模型
- 批次處理、非即時應用

❌ **不建議的情境：**
- 從零開始開發（建議用 OpenCVSharp）
- 需要即時影像處理（如即時攝影機）
- 對效能要求極高的應用

### 版本選擇速查

| 你的情況 | 建議組合 |
|---------|---------|
| 舊的 WinForms 專案 | .NET Framework 4.8 + Python 3.12 |
| 新的 WinForms 專案 | .NET 8 + Python 3.12 |
| 需要跨平台（非 WinForms） | .NET 8 + Python 3.12 |

### 重要提醒

1. ⚠️ **Python 3.14 不支援**，請用 3.7-3.13
2. ⚠️ **所有 Python 呼叫都要在 `using (Py.GIL())` 區塊內**
3. ⚠️ **.NET Framework 最低 4.7.2，推薦 4.8**
4. ⚠️ **.NET 8 需要設定 `PYTHONNET_RUNTIME=coreclr`**

希望這篇教學能幫助你順利整合 Python OpenCV 到 C# WinForms 專案！
