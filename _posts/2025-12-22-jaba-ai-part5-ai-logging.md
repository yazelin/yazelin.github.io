---
layout: post
title: "AI 日誌系統：追蹤每一次對話"
subtitle: "建立 AI 可觀測性，從對話記錄中發現問題與改進機會"
date: 2025-12-22
categories: [Jaba AI]
tags: [Python, AI, 日誌, 可觀測性, Claude]
series: jaba-ai
---

## 前言

這是 [Jaba AI 技術分享系列]({% post_url 2025-12-19-jaba-ai-index %}) 的第五篇文章。

在 [上一篇]({% post_url 2025-12-22-jaba-ai-part4-prompt-injection %}) 中我們實作了輸入防護。但防護只是第一步，我們還需要知道：

- AI 實際收到什麼 prompt？
- AI 回應了什麼？
- 哪些對話花了太多時間？
- 哪些對話失敗了？

這就是 **AI 可觀測性** 的範疇。

---

## 為什麼需要 AI 日誌？

### 場景一：問題排查

使用者回報：「AI 一直聽不懂我說的話」

沒有日誌：只能請使用者重新描述，猜測問題在哪

有日誌：直接查看當時的完整 prompt 和 AI 回應，找出問題

### 場景二：Prompt 調優

如何知道 system prompt 的效果好不好？

- 查看 AI 回應是否符合預期格式
- 統計動作執行成功率
- 分析 token 使用量

### 場景三：成本監控

Claude API 按 token 計費，需要追蹤：

- 每次對話使用多少 token
- 哪類對話最耗 token
- 總體使用趨勢

---

## AI 日誌模型

```python
# app/models/system.py

class AiLog(Base):
    """AI 對話日誌 - 記錄 AI 輸入與輸出供分析"""

    __tablename__ = "ai_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid4)

    # 關聯（可為空，因為可能是個人對話或系統對話）
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID, ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    group_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID, ForeignKey("groups.id", ondelete="SET NULL"), index=True
    )

    # AI 模型資訊
    model: Mapped[str] = mapped_column(String(32))  # haiku, opus

    # 輸入：完整的 prompt context
    input_prompt: Mapped[str] = mapped_column(Text)

    # 輸出：AI 原始回應（包含思考過程）
    raw_response: Mapped[str] = mapped_column(Text)

    # 解析結果
    parsed_message: Mapped[Optional[str]] = mapped_column(Text)
    parsed_actions: Mapped[Optional[list]] = mapped_column(JSONB)

    # 執行狀態
    success: Mapped[bool] = mapped_column(Boolean, default=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer)

    # Token 統計
    input_tokens: Mapped[Optional[int]] = mapped_column(Integer)
    output_tokens: Mapped[Optional[int]] = mapped_column(Integer)

    # 時間戳記
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # 關聯
    user = relationship("User")
    group = relationship("Group")
```

### 欄位設計說明

| 欄位 | 用途 |
|------|------|
| `input_prompt` | 完整的 prompt（含 system prompt + context + history） |
| `raw_response` | AI 原始回應（未解析） |
| `parsed_message` | 解析後的訊息文字 |
| `parsed_actions` | 解析後的動作列表 |
| `duration_ms` | 執行時間（毫秒） |
| `input_tokens` / `output_tokens` | Token 統計 |

---

## AI Service 整合

修改 `chat()` 方法，在回傳前附加日誌資訊：

```python
# app/services/ai_service.py

class AiService:

    async def chat(
        self,
        message: str,
        system_prompt: str,
        context: Optional[dict] = None,
        history: Optional[list] = None,
    ) -> dict:
        """與 AI 對話，回傳結果包含日誌資訊"""
        start_time = time.time()

        try:
            # 組合完整 prompt
            input_prompt = self._build_full_prompt(
                system_prompt, message, context, history
            )

            # 執行 AI 對話
            proc = await asyncio.create_subprocess_exec(...)
            stdout, stderr = await proc.communicate()

            # 計算執行時間
            duration_ms = int((time.time() - start_time) * 1000)

            # 解析回應
            result = self._parse_response(stdout.decode(), stderr.decode(), proc.returncode)

            # 附加日誌資訊
            result["_input_prompt"] = input_prompt
            result["_raw"] = stdout.decode()
            result["_duration_ms"] = duration_ms
            result["_model"] = self.chat_model
            result["_input_tokens"] = estimate_tokens(input_prompt)
            result["_output_tokens"] = estimate_tokens(result.get("_raw", ""))

            return result

        except asyncio.TimeoutError:
            duration_ms = int((time.time() - start_time) * 1000)
            return {
                "message": "抱歉，回應超時了，請再試一次。",
                "actions": [],
                "_raw": "",
                "_input_prompt": "",
                "_duration_ms": duration_ms,
                "_model": self.chat_model,
                "_input_tokens": 0,
                "_output_tokens": 0,
            }
```

### Token 估算

簡易的 token 估算函數：

```python
def estimate_tokens(text: str) -> int:
    """
    簡易估算 token 數量
    中文約 1-2 token/字，英文約 4 字符/token
    這裡使用 len(text) // 2 作為粗估
    """
    if not text:
        return 0
    return len(text) // 2
```

這只是粗估，實際計費以 API 回傳為準。但對於趨勢分析已經足夠。

---

## 寫入日誌

在 LINE Service 中處理完 AI 回應後寫入日誌：

```python
# app/services/line_service.py

async def _process_with_ai(
    self,
    user: User,
    group: Optional[Group],
    message: str,
    context: dict,
    history: list,
    system_prompt: str,
    db: AsyncSession,
) -> dict:
    """呼叫 AI 並記錄日誌"""

    # 呼叫 AI
    result = await self.ai_service.chat(
        message=message,
        system_prompt=system_prompt,
        context=context,
        history=history,
    )

    # 寫入 AI 日誌
    ai_log = AiLog(
        user_id=user.id,
        group_id=group.id if group else None,
        model=result.get("_model", "unknown"),
        input_prompt=result.get("_input_prompt", ""),
        raw_response=result.get("_raw", ""),
        parsed_message=result.get("message", ""),
        parsed_actions=result.get("actions", []),
        success=True,  # 有回應就算成功
        duration_ms=result.get("_duration_ms"),
        input_tokens=result.get("_input_tokens"),
        output_tokens=result.get("_output_tokens"),
    )
    db.add(ai_log)
    # 不需要立即 flush，會在請求結束時一起 commit

    return result
```

---

## 日誌查詢 Repository

```python
# app/repositories/system_repo.py

class AiLogRepository(BaseRepository[AiLog]):
    """AI 對話日誌 Repository"""

    def __init__(self, session: AsyncSession):
        super().__init__(AiLog, session)

    async def get_list(
        self,
        limit: int = 20,
        offset: int = 0,
        group_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> List[AiLog]:
        """取得 AI 日誌列表"""
        query = select(AiLog).options(
            selectinload(AiLog.user),
            selectinload(AiLog.group),
        )

        if group_id:
            query = query.where(AiLog.group_id == UUID(group_id))
        if user_id:
            query = query.where(AiLog.user_id == UUID(user_id))

        query = query.order_by(AiLog.created_at.desc()).offset(offset).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def get_by_id_with_relations(self, log_id: str) -> Optional[AiLog]:
        """根據 ID 取得日誌詳情"""
        query = (
            select(AiLog)
            .options(
                selectinload(AiLog.user),
                selectinload(AiLog.group),
            )
            .where(AiLog.id == UUID(log_id))
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def get_total_count(
        self,
        group_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> int:
        """取得日誌總數"""
        query = select(func.count()).select_from(AiLog)

        if group_id:
            query = query.where(AiLog.group_id == UUID(group_id))
        if user_id:
            query = query.where(AiLog.user_id == UUID(user_id))

        result = await self.session.execute(query)
        return result.scalar() or 0
```

---

## 後台 API

提供日誌查詢的 API：

```python
# app/routers/admin.py

@router.get("/ai-logs")
async def get_ai_logs(
    limit: int = 20,
    offset: int = 0,
    group_id: Optional[str] = None,
    user_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    admin: SuperAdmin = Depends(get_current_admin),
):
    """取得 AI 日誌列表"""
    repo = AiLogRepository(db)
    logs = await repo.get_list(
        limit=limit,
        offset=offset,
        group_id=group_id,
        user_id=user_id,
    )
    total = await repo.get_total_count(group_id=group_id, user_id=user_id)

    return {
        "logs": [
            {
                "id": str(log.id),
                "user_name": log.user.display_name if log.user else None,
                "group_name": log.group.name if log.group else None,
                "model": log.model,
                "parsed_message": log.parsed_message[:100] + "..."
                    if log.parsed_message and len(log.parsed_message) > 100
                    else log.parsed_message,
                "success": log.success,
                "duration_ms": log.duration_ms,
                "input_tokens": log.input_tokens,
                "output_tokens": log.output_tokens,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in logs
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/ai-logs/{log_id}")
async def get_ai_log_detail(
    log_id: str,
    db: AsyncSession = Depends(get_db),
    admin: SuperAdmin = Depends(get_current_admin),
):
    """取得 AI 日誌詳情（含完整 prompt）"""
    repo = AiLogRepository(db)
    log = await repo.get_by_id_with_relations(log_id)

    if not log:
        raise HTTPException(404, "日誌不存在")

    return {
        "id": str(log.id),
        "user": {...},
        "group": {...},
        "model": log.model,
        "input_prompt": log.input_prompt,      # 完整 prompt
        "raw_response": log.raw_response,      # 原始回應
        "parsed_message": log.parsed_message,
        "parsed_actions": log.parsed_actions,
        "success": log.success,
        "duration_ms": log.duration_ms,
        "input_tokens": log.input_tokens,
        "output_tokens": log.output_tokens,
        "created_at": log.created_at.isoformat(),
    }
```

---

## 日誌分析場景

### 場景一：找出回應慢的對話

```python
async def get_slow_responses(self, threshold_ms: int = 5000) -> List[AiLog]:
    """找出回應時間超過閾值的日誌"""
    query = (
        select(AiLog)
        .where(AiLog.duration_ms > threshold_ms)
        .order_by(AiLog.duration_ms.desc())
        .limit(100)
    )
    result = await self.session.execute(query)
    return list(result.scalars().all())
```

### 場景二：統計 Token 使用量

```python
async def get_token_stats(self, days: int = 7) -> dict:
    """統計最近 N 天的 Token 使用量"""
    from datetime import timedelta

    since = datetime.now() - timedelta(days=days)

    result = await self.session.execute(
        select(
            func.sum(AiLog.input_tokens).label("total_input"),
            func.sum(AiLog.output_tokens).label("total_output"),
            func.count(AiLog.id).label("total_count"),
        )
        .where(AiLog.created_at >= since)
    )
    row = result.one()

    return {
        "total_input_tokens": row.total_input or 0,
        "total_output_tokens": row.total_output or 0,
        "total_conversations": row.total_count or 0,
        "avg_input_tokens": (row.total_input or 0) // max(row.total_count, 1),
        "avg_output_tokens": (row.total_output or 0) // max(row.total_count, 1),
    }
```

### 場景三：追蹤特定使用者的對話

```python
# 查看某使用者最近的所有 AI 對話
logs = await repo.get_list(user_id="xxx-xxx-xxx", limit=50)

for log in logs:
    print(f"時間: {log.created_at}")
    print(f"輸入: {log.input_prompt[:200]}...")
    print(f"輸出: {log.parsed_message}")
    print(f"動作: {log.parsed_actions}")
    print("---")
```

---

## 日誌清理

日誌會持續增長，需要定期清理。jaba-ai 使用 APScheduler 設定排程任務：

```python
# app/services/scheduler.py

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

scheduler = AsyncIOScheduler()


async def cleanup_old_chat_messages():
    """清理超過一年的對話記錄"""
    logger.info(f"[{datetime.now()}] 開始定期清理舊對話記錄...")

    try:
        async with get_db_context() as db:
            repo = ChatRepository(db)

            # 取得統計
            stats = await repo.get_stats()
            logger.info(f"  清理前: {stats['total_messages']} 筆訊息")
            logger.info(f"  超過一年: {stats['messages_older_than_1_year']} 筆")

            if stats["messages_older_than_1_year"] > 0:
                deleted = await repo.cleanup_old_messages(retention_days=365)
                await db.commit()
                logger.info(f"  已刪除: {deleted} 筆")

    except Exception as e:
        logger.error(f"清理對話記錄失敗: {e}")


def start_scheduler():
    """啟動排程器"""
    # 每月 1 號凌晨 3 點執行清理
    scheduler.add_job(
        cleanup_old_chat_messages,
        CronTrigger(day=1, hour=3, minute=0),
        id="cleanup_chat_messages",
        name="清理舊對話記錄",
        replace_existing=True,
    )
    scheduler.start()
```

> **備註**：目前只清理 ChatMessages（對話記錄），AI 日誌保留較長時間供分析。如需清理 AI 日誌，可以加入類似的排程任務。

---

## 前端展示

在後台提供日誌查看界面：

```javascript
// static/js/admin.js

async function loadAiLogs() {
    const response = await fetch('/api/admin/ai-logs?limit=20');
    const data = await response.json();

    const tbody = document.getElementById('ai-logs-table');
    tbody.innerHTML = data.logs.map(log => `
        <tr>
            <td>${formatTime(log.created_at)}</td>
            <td>${log.user_name || '系統'}</td>
            <td>${log.group_name || '個人'}</td>
            <td>${log.model}</td>
            <td>${log.parsed_message?.substring(0, 50) || '...'}</td>
            <td>${log.duration_ms} ms</td>
            <td>${(log.input_tokens || 0) + (log.output_tokens || 0)}</td>
            <td>
                <button onclick="viewLogDetail('${log.id}')">詳情</button>
            </td>
        </tr>
    `).join('');
}

async function viewLogDetail(logId) {
    const response = await fetch(`/api/admin/ai-logs/${logId}`);
    const log = await response.json();

    // 顯示完整 prompt 和回應
    showModal({
        title: 'AI 對話詳情',
        content: `
            <h4>輸入 Prompt</h4>
            <pre>${escapeHtml(log.input_prompt)}</pre>

            <h4>AI 回應</h4>
            <pre>${escapeHtml(log.raw_response)}</pre>

            <h4>解析結果</h4>
            <p>訊息: ${log.parsed_message}</p>
            <p>動作: ${JSON.stringify(log.parsed_actions, null, 2)}</p>
        `
    });
}
```

![AI 日誌列表](/assets/images/jaba-ai/16-admin-ai-logs-list.png)
*AI 對話日誌列表，顯示每次對話的時間、使用者、模型和執行時間*

![AI 日誌詳情](/assets/images/jaba-ai/17-admin-ai-logs-detail-prompt.png)
*點擊「詳情」可查看完整的 prompt 和 AI 回應內容*

---

## 隱私考量

AI 日誌包含使用者的對話內容，需要注意：

| 考量 | 處理方式 |
|------|---------|
| 資料保留期限 | 對話記錄 365 天自動清理 |
| 存取權限 | 僅超管可查看 |
| 敏感資料 | 不記錄密碼等敏感欄位 |
| GDPR 合規 | 提供刪除機制 |

---

## 總結

AI 日誌系統提供了：

| 功能 | 價值 |
|------|------|
| 完整記錄 | 問題排查有據可查 |
| Token 統計 | 成本監控與優化 |
| 效能追蹤 | 發現慢回應 |
| 動作分析 | 驗證 AI 行為正確性 |

配合 [Prompt Injection 防護]({% post_url 2025-12-22-jaba-ai-part4-prompt-injection %})，形成完整的 AI 安全與可觀測性方案。

---

## 下一篇

系列四會進入 LINE Bot 進階開發：[LINE Bot v3 SDK + FastAPI 非同步整合]({% post_url 2025-12-23-jaba-ai-part6-linebot-v3 %})。

---

## 系列文章

- [Jaba AI 技術分享系列：完整目錄]({% post_url 2025-12-19-jaba-ai-index %})
