---
layout: post
title: "LINE 群組權限設計：從申請到審核的完整流程"
subtitle: "實作三層權限模型與群組申請審核機制"
date: 2025-12-23
categories: [Jaba AI]
tags: [Python, LINE Bot, 權限設計, 狀態機]
series: jaba-ai
---

## 前言

這是 [Jaba AI 技術分享系列]({% post_url 2025-12-19-jaba-ai-index %}) 的第七篇文章。

jaba-ai 需要管理多個 LINE 群組，每個群組有自己的管理員和設定。這篇文章分享如何設計三層權限模型和群組申請審核機制。

---

## 三層權限模型

```
┌─────────────────────────────────────────┐
│           超級管理員 (Super Admin)       │
│   • 審核群組申請                         │
│   • 管理所有店家、菜單                    │
│   • 查看所有群組和訂單                    │
│   • 管理 AI 提示詞                       │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│          群組管理員 (Group Admin)        │
│   • 設定今日店家                         │
│   • 新增群組專屬店家                      │
│   • 開單/收單                            │
│   • 查看群組訂單                         │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│            一般成員 (Member)             │
│   • 點餐                                │
│   • 查看菜單                            │
│   • 設定個人偏好                         │
└─────────────────────────────────────────┘
```

---

## 資料模型

### 群組相關表格

```python
# app/models/group.py

class Group(Base):
    """LINE 群組"""
    __tablename__ = "groups"

    id: Mapped[UUID] = mapped_column(UUID, primary_key=True, default=uuid4)
    line_group_id: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[Optional[str]] = mapped_column(String(128))
    description: Mapped[Optional[str]] = mapped_column(Text)

    # 群組代碼（管理員綁定用）
    group_code: Mapped[Optional[str]] = mapped_column(String(50))

    # 狀態
    status: Mapped[str] = mapped_column(String(20), default="pending")
    # pending: 等待審核
    # active: 已啟用
    # suspended: 已凍結

    # 啟用資訊
    activated_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    activated_by: Mapped[Optional[UUID]] = mapped_column(UUID)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class GroupApplication(Base):
    """群組申請"""
    __tablename__ = "group_applications"

    id: Mapped[UUID] = mapped_column(UUID, primary_key=True, default=uuid4)
    line_group_id: Mapped[str] = mapped_column(String(64), index=True)

    # 申請資訊
    group_name: Mapped[str] = mapped_column(String(128))
    contact_info: Mapped[str] = mapped_column(String(256))
    group_code: Mapped[str] = mapped_column(String(50))  # 自訂群組代碼
    purpose: Mapped[Optional[str]] = mapped_column(Text)

    # 申請人
    applicant_line_user_id: Mapped[Optional[str]] = mapped_column(String(64))
    applicant_name: Mapped[Optional[str]] = mapped_column(String(128))

    # 狀態
    status: Mapped[str] = mapped_column(String(20), default="pending")
    # pending: 待審核
    # approved: 已核准
    # rejected: 已拒絕

    # 審核資訊
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    reviewed_by: Mapped[Optional[UUID]] = mapped_column(UUID)
    review_note: Mapped[Optional[str]] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class GroupMember(Base):
    """群組成員"""
    __tablename__ = "group_members"

    id: Mapped[UUID] = mapped_column(UUID, primary_key=True, default=uuid4)
    group_id: Mapped[UUID] = mapped_column(UUID, ForeignKey("groups.id"))
    user_id: Mapped[UUID] = mapped_column(UUID, ForeignKey("users.id"))

    joined_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class GroupAdmin(Base):
    """群組管理員"""
    __tablename__ = "group_admins"

    id: Mapped[UUID] = mapped_column(UUID, primary_key=True, default=uuid4)
    group_id: Mapped[UUID] = mapped_column(UUID, ForeignKey("groups.id"))
    user_id: Mapped[UUID] = mapped_column(UUID, ForeignKey("users.id"))

    # 授權資訊
    granted_by: Mapped[Optional[UUID]] = mapped_column(UUID)
    granted_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
```

---

## 群組狀態流程

```
Bot 加入群組
      │
      ▼
┌─────────────┐
│   pending   │◄─────────────────────────┐
│  (等待審核)  │                          │
└─────────────┘                          │
      │                                  │
      │ 使用者送出申請                    │
      ▼                                  │
┌─────────────┐                          │
│   pending   │ (有申請記錄)              │
└─────────────┘                          │
      │                                  │
      ├─────────────────┐                │
      │ 超管核准        │ 超管拒絕        │
      ▼                 ▼                │
┌─────────────┐   ┌─────────────┐        │
│   active    │   │  rejected   │────────┘
│   (已啟用)   │   │  (可重新申請) │  重新申請
└─────────────┘   └─────────────┘
      │
      │ 超管凍結
      ▼
┌─────────────┐
│  suspended  │
│   (已凍結)   │
└─────────────┘
```

---

## 申請流程實作

### 方式一：LINE 群組對話申請

當未啟用的群組有人發訊息，Bot 會引導申請：

```python
async def _handle_pending_group_chat(
    self,
    user: User,
    group: Group,
    text: str,
    reply_token: str,
) -> None:
    """處理 pending 群組的對話（AI 引導申請）"""

    # 檢查是否已有待審核的申請
    existing = await self.application_repo.get_pending_by_line_group_id(
        group.line_group_id
    )

    if existing:
        await self.reply_message(
            reply_token,
            f"📝 此群組已有待審核的申請\n\n"
            f"申請人：{existing.applicant_name or '未知'}\n"
            f"申請時間：{existing.created_at.strftime('%Y-%m-%d %H:%M')}\n\n"
            f"請耐心等待審核，或聯繫管理員。"
        )
        return

    # 使用 AI 引導填寫申請
    system_prompt = await self._get_system_prompt("group_intro")

    ai_response = await self.ai_service.chat(
        message=text,
        system_prompt=system_prompt,
        context={
            "mode": "group_intro",
            "user_name": user.display_name or "使用者",
            "group_id": group.line_group_id,
        },
    )

    # 處理 AI 動作（如提交申請）
    actions = ai_response.get("actions", [])
    for action in actions:
        if action.get("type") == "submit_application":
            await self._create_application(
                group=group,
                user=user,
                data=action.get("data", {}),
            )

    await self.reply_message(reply_token, ai_response.get("message", ""))
```

### 方式二：網頁申請

提供網頁表單讓使用者填寫：

![群組申請表單](/assets/images/jaba-ai/02-board-group-application.png)
*點擊「申請開通」按鈕後，填寫群組資訊和聯絡方式*

```python
# app/routers/board.py

@router.post("/applications")
async def submit_application(
    data: ApplicationCreate,
    db: AsyncSession = Depends(get_db),
):
    """提交群組申請（網頁版）"""
    repo = GroupApplicationRepository(db)

    # 檢查是否已有待審核的申請
    existing = await repo.get_pending_by_line_group_id(data.line_group_id)
    if existing:
        raise HTTPException(400, "此群組已有待審核的申請")

    # 建立申請
    application = GroupApplication(
        line_group_id=data.line_group_id,
        group_name=data.group_name,
        contact_info=data.contact_info,
        group_code=data.group_code,
        purpose=data.purpose,
    )
    await repo.create(application)
    await db.commit()

    # 通知超管
    await emit_application_update({
        "action": "new_application",
        "application_id": str(application.id),
    })

    return {"message": "申請已送出", "application_id": str(application.id)}
```

---

## 審核流程

### 超管後台 API

```python
# app/routers/admin.py

@router.get("/applications")
async def get_applications(
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    admin: SuperAdmin = Depends(get_current_admin),
):
    """取得群組申請列表"""
    repo = GroupApplicationRepository(db)

    if status == "pending":
        applications = await repo.get_pending_applications()
    else:
        applications = await repo.get_all_applications()

    return {
        "items": [
            {
                "id": str(app.id),
                "line_group_id": app.line_group_id,
                "group_name": app.group_name,
                "contact_info": app.contact_info,
                "group_code": app.group_code,
                "purpose": app.purpose,
                "status": app.status,
                "created_at": app.created_at.isoformat(),
            }
            for app in applications
        ]
    }


class ApplicationReview(BaseModel):
    status: str  # "approved" or "rejected"
    note: Optional[str] = None


@router.post("/applications/{app_id}/review")
async def review_application(
    app_id: UUID,
    data: ApplicationReview,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin_token),
):
    """審核群組申請"""
    app_repo = GroupApplicationRepository(db)
    group_repo = GroupRepository(db)

    application = await app_repo.get_by_id(app_id)
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")

    # 更新申請狀態
    application.status = data.status
    application.reviewed_at = datetime.now(timezone.utc)
    application.review_note = data.note
    await app_repo.update(application)

    # 如果核准，啟用群組
    if data.status == "approved":
        group = await group_repo.get_by_line_group_id(application.line_group_id)
        if not group:
            group = Group(
                line_group_id=application.line_group_id,
                name=application.group_name,
                group_code=application.group_code,
                status="active",
                activated_at=datetime.now(timezone.utc),
            )
            await group_repo.create(group)
        else:
            group.status = "active"
            group.name = application.group_name
            group.group_code = application.group_code
            group.activated_at = datetime.now(timezone.utc)
            await group_repo.update(group)

    await db.commit()
    return {"success": True}
```

---

## 管理員綁定

群組管理員透過輸入「群組代碼」來綁定身份：

```python
async def _handle_admin_bind(
    self,
    user: User,
    group: Group,
    code: str,
) -> str:
    """處理管理員綁定"""
    # 檢查群組代碼是否正確
    if group.group_code != code:
        return "❌ 群組代碼不正確"

    # 檢查是否已是管理員
    is_admin = await self.admin_repo.is_admin(group.id, user.id)
    if is_admin:
        return "ℹ️ 你已經是此群組的管理員了"

    # 新增管理員
    await self.admin_repo.add_admin(group.id, user.id)
    await self.session.commit()

    return (
        f"✅ 管理員綁定成功！\n\n"
        f"你現在是「{group.name}」的管理員。\n\n"
        f"【管理員指令】\n"
        f"• 「今日」查看今日店家\n"
        f"• 直接輸入店名 - 設定今日店家\n"
        f"• 「加 [店名]」新增店家\n"
        f"• 「移除 [店名]」移除店家\n"
        f"• 「解除管理員」解除身份"
    )
```

在群組訊息中檢測綁定指令：

```python
async def _handle_special_command(
    self,
    user: User,
    text: str,
    group: Optional[Group],
    is_personal: bool,
) -> Optional[str]:
    """處理特殊指令"""

    # 管理員綁定指令
    if group and text.startswith("管理員 "):
        code = text[4:].strip()
        return await self._handle_admin_bind(user, group, code)

    # 解除管理員
    if group and text == "解除管理員":
        return await self._handle_admin_unbind(user, group)

    # ...其他指令
```

---

## 權限檢查

### Repository 層

```python
# app/repositories/group_repo.py

class GroupAdminRepository(BaseRepository[GroupAdmin]):

    async def is_admin(self, group_id: UUID, user_id: UUID) -> bool:
        """檢查使用者是否為群組管理員"""
        result = await self.session.execute(
            select(GroupAdmin).where(
                GroupAdmin.group_id == group_id,
                GroupAdmin.user_id == user_id
            )
        )
        return result.scalar_one_or_none() is not None

    async def add_admin(
        self,
        group_id: UUID,
        user_id: UUID,
        granted_by: Optional[UUID] = None
    ) -> GroupAdmin:
        """新增群組管理員"""
        admin = GroupAdmin(
            group_id=group_id,
            user_id=user_id,
            granted_by=granted_by
        )
        return await self.create(admin)

    async def remove_admin(self, group_id: UUID, user_id: UUID) -> bool:
        """移除群組管理員"""
        result = await self.session.execute(
            select(GroupAdmin).where(
                GroupAdmin.group_id == group_id,
                GroupAdmin.user_id == user_id
            )
        )
        admin = result.scalar_one_or_none()
        if admin:
            await self.session.delete(admin)
            await self.session.flush()
            return True
        return False
```

### Service 層

```python
async def _handle_admin_command(
    self,
    user: User,
    group: Group,
    text: str,
) -> Optional[str]:
    """處理管理員指令"""
    # 檢查是否為管理員
    is_admin = await self.admin_repo.is_admin(group.id, user.id)
    if not is_admin:
        return None  # 不是管理員，不處理

    # 設定今日店家
    if text.startswith("加 "):
        store_name = text[2:].strip()
        return await self._add_today_store(group, store_name)

    if text.startswith("移除 "):
        store_name = text[3:].strip()
        return await self._remove_today_store(group, store_name)

    if text == "清除":
        return await self._clear_today_stores(group)

    # ...其他管理員指令

    return None
```

---

## 群組管理員後台

除了 LINE 群組內的指令，也提供網頁後台：

![群組管理頁面](/assets/images/jaba-ai/13-admin-group-management.png)
*超管後台的群組管理頁面，可審核申請、查看群組狀態*

```python
# app/routers/line_admin.py

@router.post("/login")
async def line_admin_login(
    group_code: str,
    db: AsyncSession = Depends(get_db),
):
    """群組管理員登入（用群組代碼）"""
    group_repo = GroupRepository(db)

    # 用群組代碼找群組
    groups = await group_repo.get_all_by_code(group_code)
    if not groups:
        raise HTTPException(401, "群組代碼不正確")

    # 產生 token
    token = generate_line_admin_token(group_code)

    return {
        "token": token,
        "groups": [
            {"id": str(g.id), "name": g.name}
            for g in groups
        ]
    }


@router.get("/today-stores")
async def get_today_stores(
    group_id: UUID,
    db: AsyncSession = Depends(get_db),
    group_code: str = Depends(get_line_admin_group_code),
):
    """取得今日店家"""
    # 驗證此 group_code 可以存取此群組
    await verify_group_access(db, group_code, group_id)

    repo = GroupTodayStoreRepository(db)
    today_stores = await repo.get_today_stores(group_id)

    return {
        "items": [
            {
                "store_id": str(ts.store_id),
                "store_name": ts.store.name,
            }
            for ts in today_stores
        ]
    }


@router.post("/today-stores")
async def set_today_store(
    group_id: UUID,
    store_id: UUID,
    db: AsyncSession = Depends(get_db),
    group_code: str = Depends(get_line_admin_group_code),
):
    """設定今日店家"""
    await verify_group_access(db, group_code, group_id)

    repo = GroupTodayStoreRepository(db)
    await repo.set_today_store(group_id, store_id)
    await db.commit()

    return {"message": "已設定"}
```

---

## 權限設計要點

### 1. 群組代碼的作用

群組代碼有兩個用途：

| 用途 | 說明 |
|------|------|
| 管理員綁定 | 在 LINE 群組輸入「管理員 XXX」綁定身份 |
| 後台登入 | 用群組代碼登入群組管理員後台 |

### 2. 為什麼不用 LINE User ID？

群組代碼比 LINE User ID 更適合這個場景：

- 群組代碼可以自訂、易記
- 同一個群組代碼可以對應多個群組（連鎖店情境）
- 不依賴 LINE 平台的資料

### 3. 權限繼承

```
超級管理員 ⊃ 群組管理員 ⊃ 一般成員

超級管理員可以做群組管理員的所有事
群組管理員可以做一般成員的所有事
```

---

## 總結

三層權限模型的實作要點：

| 層級 | 認證方式 | 資料表 |
|------|---------|--------|
| 超級管理員 | 帳號密碼 | `super_admins` |
| 群組管理員 | 群組代碼 | `group_admins` |
| 一般成員 | LINE 身份 | `group_members` |

群組申請流程：
1. Bot 加入群組 → 自動建立 pending 群組
2. 使用者申請 → 建立 GroupApplication
3. 超管審核 → 核准後群組變為 active
4. 管理員綁定 → 輸入群組代碼成為管理員

---

## 下一篇

系列五會進入 AI 應用實戰：[自然語言點餐：從使用者輸入到訂單建立]({% post_url 2025-12-24-jaba-ai-part8-natural-language %})。

---

## 系列文章

- [Jaba AI 技術分享系列：完整目錄]({% post_url 2025-12-19-jaba-ai-index %})
