---
layout: post
title: "ralph-any：打造通用 BYOK Coding Agent"
subtitle: "7 個檔案的 Python 專案，驅動任何 ACP 相容 AI 完成開發任務"
date: 2026-02-06
categories: [Claude Code]
tags: [Claude Code, ACP, BYOK, Coding Agent, AI, Python, Gemini]
---

![ralph-any：打造通用 BYOK Coding Agent](https://github.com/yazelin/yazelin.github.io/releases/download/blog-images/2026-02-06-ralph-any-byok-agent.png)

## 前言

市面上的 AI Coding Agent 越來越多，但大多綁定特定的 AI 服務。如果你想用 Claude 今天、Gemini 明天，就需要不同的工具。

**ralph-any** 是一個通用的迭代式 AI 開發循環工具。它的核心理念是 **BYOK（Bring Your Own Key）**——你自備 API Key，它負責驅動任何 ACP 相容的 AI CLI 完成任務。

整個專案只有 7 個檔案、約 430 行 Python，卻能做到原版 copilot-ralph（TypeScript，2,065 行）的所有核心功能。

---

## 什麼是 BYOK？

BYOK 的概念很簡單：認證交給 AI CLI 自己處理，ralph-any 不碰 API Key。

```bash
# Claude（訂閱制，不需要 Key）
claude /login
ralph "Build a REST API"

# Claude（自帶 Key）
export ANTHROPIC_API_KEY=sk-xxx
ralph "Build a REST API"

# Gemini（自帶 Key）
export GEMINI_API_KEY=xxx
ralph "Build a REST API" --command gemini --command-args="--experimental-acp"
```

環境變數會自動被子程序繼承，不需要額外設定。

---

## 與 copilot-ralph 的關係

ralph-any 是參考 [copilot-ralph](https://github.com/doggy8088/copilot-ralph)（TypeScript 版）精簡重寫的 Python 版。重點差異：

| 面向 | copilot-ralph (TS) | ralph-any (Py) |
|------|-------------------|----------------|
| 程式碼行數 | 2,065 | ~430 |
| 檔案數量 | 19+ | 7 |
| AI 後端 | Copilot SDK（單一） | AcpClient（任意 ACP CLI） |
| SDK 封裝 | 651 行自訂封裝 | 0（委託給 AcpClient） |
| 事件系統 | 12 種事件 + AsyncQueue | 5 個裝飾器 |
| 重試邏輯 | 自訂 3 次指數退避 | 內建於 AcpClient |
| CLI 參數 | 18+（含 Azure BYOK） | 8 個 |
| 多 AI 支援 | 否 | 是（Claude、Gemini 等） |
| 依賴套件 | 9 | 1 |

精簡的關鍵在於 `AcpClient`——它把 SDK 封裝、事件處理、重試邏輯都抽象化了，ralph-any 只需要專注在「循環邏輯」本身。

---

## 架構概覽

```
src/ralph/
├── __init__.py    # 版本 + exports
├── __main__.py    # python -m ralph 入口
├── cli.py         # argparse CLI + 自動偵測
├── config.py      # ralph.yml 載入器
├── engine.py      # Ralph Loop 引擎
├── prompt.py      # System prompt 模板
└── detect.py      # Promise 偵測（5 行）
```

### 核心引擎

`engine.py` 是整個專案的心臟。它用 `AcpClient` 連接 AI CLI，每次迭代送出 prompt，等待回應，檢查是否完成：

```python
class RalphEngine:
    def __init__(self, config: LoopConfig) -> None:
        self.client = AcpClient(
            command=config.command,
            args=config.command_args or None,
            cwd=config.working_dir,
        )
        self._register_events()

    async def run(self) -> LoopResult:
        async with self.client:
            for i in range(1, config.max_iterations + 1):
                response = await self.client.prompt(prompt)

                if detect_promise(response, config.promise_phrase):
                    return LoopResult(state="complete", iterations=i, ...)

        return LoopResult(state="max_iterations", ...)
```

### Promise 偵測

整個偵測邏輯只有 5 行：

```python
def detect_promise(text: str, phrase: str) -> bool:
    if not phrase:
        return False
    return f"<promise>{phrase}</promise>" in text
```

AI 完成任務後，會在回應最後輸出 `<promise>任務完成！🥇</promise>`，引擎偵測到就結束循環。

---

## ralph.yml 設定檔

不想每次都打一堆參數？放一個 `ralph.yml` 在專案根目錄：

```yaml
# ralph.yml
command: gemini
command_args: --experimental-acp
max_iterations: 20
timeout: 3600
promise: Done!
```

設定優先順序：**CLI 參數 > ralph.yml > 預設值**

有趣的是，YAML 解析是自己寫的（零依賴），只支援簡單的 `key: value` 格式：

```python
def _parse(path: Path) -> dict[str, Any]:
    raw: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, _, value = line.partition(":")
        raw[key.strip()] = value.strip()
    return raw
```

不需要引入 PyYAML，因為 ralph 的設定檔根本不需要巢狀結構。

---

## 自動偵測 Prompt

如果不給 prompt 參數，Ralph 會依序尋找這些檔案：

1. `ralph.md`
2. `TASK.md`
3. `ralph.txt`
4. `TASK.txt`

```bash
# 在專案中放一個 ralph.md
echo "Refactor all utils to use dataclasses" > ralph.md

# 零參數直接執行
ralph
```

這讓 ralph 可以無縫整合到專案工作流程中——把任務寫在 `ralph.md`，跑 `ralph` 就好。

---

## 實測結果

### Claude Code（22.6 秒完成）

```
━━━ Iteration 1/3 ━━━

🛠️  Write hello.py
 ✔️ completed

🛠️  Read hello.py
 ✔️ completed

🛠️  Run: python3 hello.py
 ✔️ completed

<promise>任務完成！🥇</promise>
🎉 Promise detected: "任務完成！🥇"

▶ Result: complete (1 iterations, 22.6s)
```

### Gemini CLI（58.6 秒完成）

```
━━━ Iteration 1/3 ━━━

I will create the `hello.py` file with the specified content.
 ✔️ completed

<promise>任務完成！🥇</promise>
🎉 Promise detected: "任務完成！🥇"

▶ Result: complete (1 iterations, 58.6s)
```

同一個工具、同一個 prompt，切換後端只需要改 `--command` 參數。

---

## 安裝與快速開始

```bash
# 安裝
pip install ralph-any
# 或
uv tool install ralph-any
```

```bash
# 基本用法
ralph "Refactor utils.py to use dataclasses"

# 指定 Gemini 後端
ralph "Fix the failing tests" --command gemini --command-args="--experimental-acp"

# 從檔案讀取任務
ralph task.md -m 20

# 自動偵測 ralph.md
ralph
```

---

## 小結

ralph-any 的三個核心價值：

- **通用性**：支援任何 ACP 相容的 AI CLI，不綁定特定服務
- **簡潔性**：7 個檔案、約 430 行、1 個依賴，比原版精簡 80%
- **可維護性**：把複雜度推給 `AcpClient`，自己只做循環邏輯

如果你想要一個不綁定特定 AI 服務的自動化開發工具，ralph-any 是個不錯的起點。

---

## 參考資源

- [ralph-any GitHub](https://github.com/yazelin/ralph-any)
- [ralph-any PyPI](https://pypi.org/project/ralph-any/)
- [claude-code-acp-py](https://github.com/yazelin/claude-code-acp-py)
- [copilot-ralph（原版 TypeScript）](https://github.com/doggy8088/copilot-ralph)
- [ACP 協議說明](https://docs.anthropic.com/en/docs/claude-code/acp)
