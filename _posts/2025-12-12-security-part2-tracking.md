---
layout: post
title: "登入追蹤：裝置指紋與地理位置記錄"
subtitle: "偵測異常登入行為，每次登入都留下軌跡"
date: 2025-12-12
categories: [Security]
tags: [安全, GeoIP, 指紋, JavaScript, Python]
---

> **📚 系列文章**
> 1. [認證系統：用 NAS 帳號實現 SSO 效果]({% post_url 2025-12-12-security-part1-auth %})
> 2. [登入追蹤：裝置指紋與地理位置記錄]({% post_url 2025-12-12-security-part2-tracking %}) ← 目前閱讀

---

## 這篇文章要解決什麼問題？

認證系統做好了，使用者可以登入了。但是：

- 帳號被別人盜用了怎麼辦？
- 有人在不明地點登入，怎麼知道？
- 新裝置登入，要不要通知使用者？
- 登入失敗太多次，是不是有人在暴力破解？

**員工**：「奇怪，我明明沒登入，怎麼系統顯示我剛剛有操作？」
**IT**：「可能是帳號被盜了，但我們沒有登入記錄，查不出來...」
**老闘**：「這很嚴重！怎麼知道是誰、從哪裡登入的？」
**後端工程師**：「我們需要加入登入追蹤，記錄每次登入的時間、IP、地理位置、裝置指紋。」
**IT**：「有了這些資料，異常登入馬上就能發現。比如同一帳號同時從台北和上海登入，一定有問題。」
**老闆**：「新裝置登入也要通知使用者，讓他們自己確認。」

這些問題的答案都是：**記錄每一次登入**，包括時間、地點、裝置。有了這些資料，異常行為一目瞭然。

---

## 技術概念

### 登入追蹤記錄哪些資訊？

| 類別 | 資訊 | 用途 |
|------|------|------|
| 基本 | 帳號、時間、成功/失敗 | 追查登入歷史 |
| 網路 | IP 位址 | 判斷來源地區 |
| 地理 | 國家、城市、經緯度 | 偵測異地登入 |
| 裝置 | 瀏覽器、作業系統、裝置指紋 | 識別新裝置 |

### 什麼是裝置指紋？

裝置指紋是收集**瀏覽器和裝置的多種特徵**，組合成一個唯一識別碼。

就像人的指紋，每個人都不一樣。裝置指紋也是，即使沒有登入帳號，也能識別「這是同一台裝置」。

```
特徵收集：
┌─────────────────────────────────────────┐
│ User-Agent: Chrome 120 on Windows 10    │
│ 螢幕解析度: 1920x1080                    │
│ 時區: Asia/Taipei                        │
│ 語言: zh-TW                              │
│ CPU 核心數: 8                            │
│ 記憶體: 8GB                              │
│ Canvas 渲染特徵: abc123...               │
│ WebGL 顯示卡: Intel UHD Graphics         │
└─────────────────────────────────────────┘
                    ↓ 雜湊
           裝置指紋: 8f3a2b1c
```

### 什麼是 GeoIP？

GeoIP 是透過 IP 位址查詢地理位置的技術。MaxMind 公司提供免費的 GeoLite2 資料庫，可以查詢 IP 對應的：

- 國家
- 城市
- 經緯度

```
IP: 114.32.123.45
       ↓ 查詢 GeoIP 資料庫
國家: 台灣
城市: 台北
經緯度: 25.0330, 121.5654
```

---

## 跟著做：Step by Step

### 步驟 1：前端收集裝置指紋

建立一個模組來收集裝置特徵：

```javascript
// device-fingerprint.js

const DeviceFingerprint = {
    /**
     * 產生裝置指紋
     * @returns {Promise<Object>} 裝置資訊
     */
    async generate() {
        const components = await this.collectComponents();
        const fingerprint = this.hash(JSON.stringify(components));

        return {
            fingerprint,
            device_type: this.getDeviceType(),
            browser: this.getBrowserInfo(),
            os: this.getOSInfo(),
            screen_resolution: this.getScreenResolution(),
            timezone: this.getTimezone(),
            language: navigator.language,
        };
    },

    /**
     * 收集裝置特徵
     */
    async collectComponents() {
        return {
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            hardwareConcurrency: navigator.hardwareConcurrency || 0,
            deviceMemory: navigator.deviceMemory || 0,
            screenResolution: this.getScreenResolution(),
            timezone: this.getTimezone(),
            colorDepth: screen.colorDepth,
            pixelRatio: window.devicePixelRatio || 1,
            touchSupport: this.getTouchSupport(),
            canvas: await this.getCanvasFingerprint(),
            webgl: this.getWebGLFingerprint(),
        };
    },

    /**
     * 螢幕解析度
     */
    getScreenResolution() {
        return `${screen.width}x${screen.height}`;
    },

    /**
     * 時區
     */
    getTimezone() {
        try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch {
            return '';
        }
    },

    /**
     * 觸控支援
     */
    getTouchSupport() {
        return {
            maxTouchPoints: navigator.maxTouchPoints || 0,
            touchEvent: 'ontouchstart' in window,
        };
    },

    /**
     * Canvas 指紋 - 不同裝置渲染結果略有不同
     */
    async getCanvasFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 200;
            canvas.height = 50;

            // 繪製文字和圖形
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = '#f60';
            ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = '#069';
            ctx.font = '11pt Arial';
            ctx.fillText('Hello World', 2, 15);

            // 取得資料 URL 的後 50 字元作為特徵
            return canvas.toDataURL().slice(-50);
        } catch {
            return '';
        }
    },

    /**
     * WebGL 指紋 - 取得顯示卡資訊
     */
    getWebGLFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl');
            if (!gl) return '';

            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                return {
                    vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
                    renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL),
                };
            }
            return '';
        } catch {
            return '';
        }
    },

    /**
     * 裝置類型判斷
     */
    getDeviceType() {
        const ua = navigator.userAgent.toLowerCase();
        if (/mobile|android|iphone|ipod/i.test(ua)) return 'mobile';
        if (/ipad|tablet/i.test(ua)) return 'tablet';
        return 'desktop';
    },

    /**
     * 瀏覽器資訊
     */
    getBrowserInfo() {
        const ua = navigator.userAgent;
        if (ua.indexOf('Firefox') > -1) return 'Firefox';
        if (ua.indexOf('Edg') > -1) return 'Edge';
        if (ua.indexOf('Chrome') > -1) return 'Chrome';
        if (ua.indexOf('Safari') > -1) return 'Safari';
        return 'Unknown';
    },

    /**
     * 作業系統資訊
     */
    getOSInfo() {
        const ua = navigator.userAgent;
        if (ua.indexOf('Windows') > -1) return 'Windows';
        if (ua.indexOf('Mac') > -1) return 'macOS';
        if (ua.indexOf('Linux') > -1) return 'Linux';
        if (ua.indexOf('Android') > -1) return 'Android';
        if (ua.indexOf('iPhone') > -1 || ua.indexOf('iPad') > -1) return 'iOS';
        return 'Unknown';
    },

    /**
     * 簡單雜湊函式
     */
    hash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16).padStart(8, '0');
    },
};
```

### 步驟 2：登入時送出裝置資訊

修改登入請求，加入裝置資訊：

```javascript
// login.js

async function login(username, password) {
    // 收集裝置指紋
    const deviceInfo = await DeviceFingerprint.generate();

    const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username,
            password,
            device: deviceInfo  // 加入裝置資訊
        })
    });

    return response.json();
}
```

### 步驟 3：後端 GeoIP 解析

安裝必要套件：

```bash
uv add geoip2 user-agents
```

> 本系列使用 [uv](https://docs.astral.sh/uv/) 管理 Python 套件。如尚未安裝，請參考 **[SDD 環境安裝篇]({{ site.baseurl }}/sdd-setup-guide/)**。

下載 GeoLite2 資料庫（需要 MaxMind 帳號）：

```bash
# 放在 backend/data/GeoLite2-City.mmdb
```

實作 GeoIP 服務：

```python
# services/geoip.py

import ipaddress
from decimal import Decimal
from pathlib import Path

import geoip2.database
from user_agents import parse as parse_user_agent

from ..models.login_record import DeviceInfo, DeviceType, GeoLocation

# GeoIP 資料庫路徑
GEOIP_DB_PATH = Path(__file__).parent.parent.parent / "data" / "GeoLite2-City.mmdb"

# 延遲載入的 reader
_geoip_reader = None


def _get_geoip_reader():
    """取得 GeoIP reader（延遲載入）"""
    global _geoip_reader
    if _geoip_reader is None:
        if GEOIP_DB_PATH.exists():
            _geoip_reader = geoip2.database.Reader(str(GEOIP_DB_PATH))
        else:
            print(f"Warning: GeoIP database not found at {GEOIP_DB_PATH}")
            _geoip_reader = False  # 標記為載入失敗
    return _geoip_reader if _geoip_reader else None


def is_private_ip(ip_str: str) -> bool:
    """檢查是否為內網 IP"""
    try:
        ip = ipaddress.ip_address(ip_str)
        return ip.is_private or ip.is_loopback or ip.is_link_local
    except ValueError:
        return False


def resolve_ip_location(ip_address: str) -> GeoLocation | None:
    """解析 IP 地理位置"""
    # 內網 IP 無法解析
    if is_private_ip(ip_address):
        return None

    reader = _get_geoip_reader()
    if reader is None:
        return None

    try:
        response = reader.city(ip_address)
        return GeoLocation(
            country=response.country.names.get("zh-CN") or response.country.name,
            city=response.city.names.get("zh-CN") or response.city.name,
            latitude=Decimal(str(response.location.latitude)),
            longitude=Decimal(str(response.location.longitude)),
        )
    except Exception:
        return None


def parse_device_info(user_agent: str) -> DeviceInfo:
    """解析 User-Agent 取得裝置資訊"""
    ua = parse_user_agent(user_agent)

    # 判斷裝置類型
    if ua.is_mobile:
        device_type = DeviceType.MOBILE
    elif ua.is_tablet:
        device_type = DeviceType.TABLET
    elif ua.is_pc:
        device_type = DeviceType.DESKTOP
    else:
        device_type = DeviceType.UNKNOWN

    # 組合瀏覽器資訊
    browser = f"{ua.browser.family} {ua.browser.version_string}"

    # 組合 OS 資訊
    os_info = f"{ua.os.family} {ua.os.version_string}"

    return DeviceInfo(
        device_type=device_type,
        browser=browser,
        os=os_info,
    )
```

### 步驟 4：定義資料模型

```python
# models/login_record.py

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import Enum


class DeviceType(str, Enum):
    DESKTOP = "desktop"
    MOBILE = "mobile"
    TABLET = "tablet"
    UNKNOWN = "unknown"


@dataclass
class GeoLocation:
    """地理位置"""
    country: str | None
    city: str | None
    latitude: Decimal | None
    longitude: Decimal | None


@dataclass
class DeviceInfo:
    """裝置資訊"""
    fingerprint: str | None = None
    device_type: DeviceType = DeviceType.UNKNOWN
    browser: str | None = None
    os: str | None = None
```

### 步驟 5：建立登入記錄資料表

```sql
CREATE TABLE login_records (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- 使用者資訊
    user_id INTEGER REFERENCES users(id),
    username VARCHAR(100) NOT NULL,
    success BOOLEAN NOT NULL,
    failure_reason VARCHAR(200),

    -- 網路資訊
    ip_address INET NOT NULL,
    user_agent TEXT,

    -- 地理位置
    geo_country VARCHAR(100),
    geo_city VARCHAR(100),
    geo_latitude DECIMAL(10, 7),
    geo_longitude DECIMAL(10, 7),

    -- 裝置資訊
    device_fingerprint VARCHAR(100),
    device_type VARCHAR(20),
    browser VARCHAR(100),
    os VARCHAR(100),

    -- Session
    session_id VARCHAR(100)
);

-- 索引加速查詢
CREATE INDEX idx_login_records_user_id ON login_records(user_id);
CREATE INDEX idx_login_records_username ON login_records(username);
CREATE INDEX idx_login_records_created_at ON login_records(created_at);
CREATE INDEX idx_login_records_ip ON login_records(ip_address);
```

### 步驟 6：實作登入記錄服務

```python
# services/login_record.py

from ..database import get_connection
from ..models.login_record import DeviceInfo, GeoLocation


async def record_login(
    username: str,
    success: bool,
    ip_address: str,
    user_id: int | None = None,
    failure_reason: str | None = None,
    user_agent: str | None = None,
    geo: GeoLocation | None = None,
    device: DeviceInfo | None = None,
    session_id: str | None = None,
) -> int:
    """記錄登入嘗試"""
    async with get_connection() as conn:
        result = await conn.fetchrow(
            """
            INSERT INTO login_records (
                user_id, username, success, failure_reason,
                ip_address, user_agent,
                geo_country, geo_city, geo_latitude, geo_longitude,
                device_fingerprint, device_type, browser, os,
                session_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING id
            """,
            user_id,
            username,
            success,
            failure_reason,
            ip_address,
            user_agent,
            geo.country if geo else None,
            geo.city if geo else None,
            geo.latitude if geo else None,
            geo.longitude if geo else None,
            device.fingerprint if device else None,
            device.device_type.value if device else None,
            device.browser if device else None,
            device.os if device else None,
            session_id,
        )
        return result["id"]
```

### 步驟 7：在登入 API 中記錄

```python
# api/auth.py

from ..services.geoip import resolve_ip_location, parse_device_info
from ..services.login_record import record_login


@router.post("/login")
async def login(request: LoginRequest, req: Request):
    # 取得客戶端資訊
    ip_address = get_client_ip(req)
    user_agent = req.headers.get("user-agent", "")

    # 解析地理位置
    geo = resolve_ip_location(ip_address)

    # 解析裝置資訊（從 User-Agent）
    ua_device = parse_device_info(user_agent)

    # 合併前端提供的裝置資訊
    device_info = DeviceInfo(
        fingerprint=request.device.fingerprint if request.device else None,
        device_type=request.device.device_type or ua_device.device_type,
        browser=request.device.browser or ua_device.browser,
        os=request.device.os or ua_device.os,
    )

    # 嘗試 SMB 認證
    try:
        smb.test_auth()
    except SMBAuthError:
        # 記錄失敗的登入
        await record_login(
            username=request.username,
            success=False,
            ip_address=ip_address,
            failure_reason="帳號或密碼錯誤",
            user_agent=user_agent,
            geo=geo,
            device=device_info,
        )
        return LoginResponse(success=False, error="帳號或密碼錯誤")

    # 認證成功，建立 session
    token = session_manager.create_session(...)

    # 記錄成功登入
    await record_login(
        username=request.username,
        success=True,
        ip_address=ip_address,
        user_id=user_id,
        user_agent=user_agent,
        geo=geo,
        device=device_info,
        session_id=token,
    )

    return LoginResponse(success=True, token=token)
```

### 步驟 8：查詢登入記錄 API

```python
# api/login_records.py

@router.get("/login-records")
async def list_login_records(
    username: str | None = None,
    success: bool | None = None,
    page: int = 1,
    limit: int = 20,
    session: SessionData = Depends(get_current_session)
):
    """查詢登入記錄"""
    return await search_login_records(
        LoginRecordFilter(
            username=username,
            success=success,
            page=page,
            limit=limit,
        )
    )


@router.get("/login-records/recent")
async def recent_logins(
    limit: int = 10,
    session: SessionData = Depends(get_current_session)
):
    """取得最近登入記錄"""
    return await get_recent_logins(
        username=session.username,
        limit=limit,
    )
```

---

## 進階技巧與踩坑紀錄

### 1. 內網 IP 的處理

公司內部使用時，幾乎所有 IP 都是內網 IP（192.168.x.x），無法查到地理位置。

```python
def is_private_ip(ip_str: str) -> bool:
    """檢查是否為內網 IP"""
    ip = ipaddress.ip_address(ip_str)
    return ip.is_private or ip.is_loopback or ip.is_link_local
```

對於內網 IP，我們直接回傳 `None`，前端顯示「內網」即可。

### 2. GeoIP 資料庫更新

GeoLite2 資料庫需要定期更新（MaxMind 每週更新），IP 段的歸屬會變動。

可以設定定期下載任務：

```bash
# 每週更新一次（需要 MaxMind License Key）
0 0 * * 0 curl -o /path/to/GeoLite2-City.mmdb "https://download.maxmind.com/..."
```

### 3. 裝置指紋的限制

裝置指紋不是 100% 準確：

| 情況 | 影響 |
|------|------|
| 瀏覽器更新 | 指紋可能改變 |
| 隱私模式 | 某些特徵無法取得 |
| 同型號裝置 | 指紋可能相同 |

建議把指紋當作**輔助參考**，不要當作唯一依據。

### 4. 異常登入偵測

有了登入記錄，可以做簡單的異常偵測：

```python
async def check_suspicious_login(
    username: str,
    ip_address: str,
    device_fingerprint: str
) -> list[str]:
    """檢查可疑登入"""
    warnings = []

    # 取得該使用者的歷史記錄
    records = await get_recent_logins(username=username, limit=100)

    # 檢查是否為新裝置
    known_devices = set(r.device_fingerprint for r in records if r.device_fingerprint)
    if device_fingerprint and device_fingerprint not in known_devices:
        warnings.append("新裝置登入")

    # 檢查是否為新 IP
    known_ips = set(r.ip_address for r in records)
    if ip_address not in known_ips:
        warnings.append("新 IP 位址登入")

    # 檢查最近失敗次數
    recent_failures = sum(1 for r in records[:10] if not r.success)
    if recent_failures >= 3:
        warnings.append(f"最近有 {recent_failures} 次失敗登入")

    return warnings
```

### 5. 隱私考量

登入記錄包含敏感資訊，需要注意：

- **保留期限**：建議保留 90 天，定期清理舊記錄
- **存取權限**：只有管理員可查看其他人的記錄
- **資料最小化**：不要收集不必要的資訊
- **告知使用者**：讓使用者知道系統會記錄登入資訊

```python
# 定期清理舊記錄
async def cleanup_old_records(days: int = 90):
    """清理超過指定天數的登入記錄"""
    async with get_connection() as conn:
        result = await conn.execute(
            """
            DELETE FROM login_records
            WHERE created_at < NOW() - ($1 || ' days')::INTERVAL
            """,
            days,
        )
        return result
```

---

## 小結

這篇文章實作了：

1. **裝置指紋**：前端收集多種特徵產生唯一識別碼
2. **GeoIP 解析**：透過 IP 查詢地理位置
3. **登入記錄**：記錄每次登入的完整資訊
4. **查詢 API**：提供登入記錄查詢功能

有了這些資料，可以：
- 追蹤使用者的登入歷史
- 偵測異常登入（新裝置、新地點）
- 發現暴力破解嘗試（連續失敗）

下一個系列我們會進入 **DevOps**，談談如何用 Alembic 做資料庫版本控制，以及用 Docker Compose 一鍵啟動開發環境。

---

## 完整程式碼

### 前端裝置指紋模組

```javascript
/**
 * 裝置指紋產生器
 */
const DeviceFingerprint = {
    async generate() {
        const components = await this.collectComponents();
        const fingerprint = this.hash(JSON.stringify(components));

        return {
            fingerprint,
            device_type: this.getDeviceType(),
            browser: this.getBrowserInfo(),
            os: this.getOSInfo(),
            screen_resolution: this.getScreenResolution(),
            timezone: this.getTimezone(),
            language: navigator.language,
        };
    },

    async collectComponents() {
        return {
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            hardwareConcurrency: navigator.hardwareConcurrency || 0,
            deviceMemory: navigator.deviceMemory || 0,
            screenResolution: this.getScreenResolution(),
            timezone: this.getTimezone(),
            colorDepth: screen.colorDepth,
            pixelRatio: window.devicePixelRatio || 1,
            touchSupport: this.getTouchSupport(),
            canvas: await this.getCanvasFingerprint(),
            webgl: this.getWebGLFingerprint(),
        };
    },

    getScreenResolution() {
        return `${screen.width}x${screen.height}`;
    },

    getTimezone() {
        try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch { return ''; }
    },

    getTouchSupport() {
        return {
            maxTouchPoints: navigator.maxTouchPoints || 0,
            touchEvent: 'ontouchstart' in window,
        };
    },

    async getCanvasFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 200;
            canvas.height = 50;
            ctx.fillStyle = '#f60';
            ctx.fillRect(125, 1, 62, 20);
            ctx.font = '11pt Arial';
            ctx.fillText('Hello World', 2, 15);
            return canvas.toDataURL().slice(-50);
        } catch { return ''; }
    },

    getWebGLFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl');
            if (!gl) return '';
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                return {
                    vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
                    renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL),
                };
            }
            return '';
        } catch { return ''; }
    },

    getDeviceType() {
        const ua = navigator.userAgent.toLowerCase();
        if (/mobile|android|iphone/i.test(ua)) return 'mobile';
        if (/ipad|tablet/i.test(ua)) return 'tablet';
        return 'desktop';
    },

    getBrowserInfo() {
        const ua = navigator.userAgent;
        if (ua.indexOf('Firefox') > -1) return 'Firefox';
        if (ua.indexOf('Edg') > -1) return 'Edge';
        if (ua.indexOf('Chrome') > -1) return 'Chrome';
        if (ua.indexOf('Safari') > -1) return 'Safari';
        return 'Unknown';
    },

    getOSInfo() {
        const ua = navigator.userAgent;
        if (ua.indexOf('Windows') > -1) return 'Windows';
        if (ua.indexOf('Mac') > -1) return 'macOS';
        if (ua.indexOf('Linux') > -1) return 'Linux';
        if (ua.indexOf('Android') > -1) return 'Android';
        if (/iPhone|iPad/.test(ua)) return 'iOS';
        return 'Unknown';
    },

    hash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16).padStart(8, '0');
    },
};

window.DeviceFingerprint = DeviceFingerprint;
```

### 後端 GeoIP 服務

```python
"""GeoIP 地理位置解析服務"""

import ipaddress
from decimal import Decimal
from pathlib import Path

import geoip2.database
from user_agents import parse as parse_user_agent

from ..models.login_record import DeviceInfo, DeviceType, GeoLocation

GEOIP_DB_PATH = Path(__file__).parent.parent.parent / "data" / "GeoLite2-City.mmdb"
_geoip_reader = None


def _get_geoip_reader():
    global _geoip_reader
    if _geoip_reader is None:
        if GEOIP_DB_PATH.exists():
            _geoip_reader = geoip2.database.Reader(str(GEOIP_DB_PATH))
        else:
            _geoip_reader = False
    return _geoip_reader if _geoip_reader else None


def is_private_ip(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
        return ip.is_private or ip.is_loopback or ip.is_link_local
    except ValueError:
        return False


def resolve_ip_location(ip_address: str) -> GeoLocation | None:
    if is_private_ip(ip_address):
        return None

    reader = _get_geoip_reader()
    if reader is None:
        return None

    try:
        response = reader.city(ip_address)
        return GeoLocation(
            country=response.country.names.get("zh-CN") or response.country.name,
            city=response.city.names.get("zh-CN") or response.city.name,
            latitude=Decimal(str(response.location.latitude)),
            longitude=Decimal(str(response.location.longitude)),
        )
    except Exception:
        return None


def parse_device_info(user_agent: str) -> DeviceInfo:
    ua = parse_user_agent(user_agent)

    if ua.is_mobile:
        device_type = DeviceType.MOBILE
    elif ua.is_tablet:
        device_type = DeviceType.TABLET
    elif ua.is_pc:
        device_type = DeviceType.DESKTOP
    else:
        device_type = DeviceType.UNKNOWN

    return DeviceInfo(
        device_type=device_type,
        browser=f"{ua.browser.family} {ua.browser.version_string}",
        os=f"{ua.os.family} {ua.os.version_string}",
    )
```

### 登入記錄服務

```python
"""登入記錄服務"""

from ..database import get_connection
from ..models.login_record import DeviceInfo, GeoLocation


async def record_login(
    username: str,
    success: bool,
    ip_address: str,
    user_id: int | None = None,
    failure_reason: str | None = None,
    user_agent: str | None = None,
    geo: GeoLocation | None = None,
    device: DeviceInfo | None = None,
    session_id: str | None = None,
) -> int:
    """記錄登入嘗試"""
    async with get_connection() as conn:
        result = await conn.fetchrow(
            """
            INSERT INTO login_records (
                user_id, username, success, failure_reason,
                ip_address, user_agent,
                geo_country, geo_city, geo_latitude, geo_longitude,
                device_fingerprint, device_type, browser, os,
                session_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING id
            """,
            user_id, username, success, failure_reason,
            ip_address, user_agent,
            geo.country if geo else None,
            geo.city if geo else None,
            geo.latitude if geo else None,
            geo.longitude if geo else None,
            device.fingerprint if device else None,
            device.device_type.value if device else None,
            device.browser if device else None,
            device.os if device else None,
            session_id,
        )
        return result["id"]


async def get_recent_logins(username: str, limit: int = 10):
    """取得最近登入記錄"""
    async with get_connection() as conn:
        rows = await conn.fetch(
            """
            SELECT id, created_at, success, failure_reason,
                   ip_address, geo_country, geo_city, device_type, browser
            FROM login_records
            WHERE username = $1
            ORDER BY created_at DESC
            LIMIT $2
            """,
            username, limit,
        )
        return rows
```
