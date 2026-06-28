# LifeFlow AI 每日复盘功能设计方案

> 版本：v1.0  
> 日期：2026-06-24  
> 状态：方案设计阶段，待评审后开发

---

## 一、项目背景与目标

### 1.1 当前现状
LifeFlow 已具备：
- 任务管理（GTD 风格，支持 scheduled_date、completed_at 等）
- 习惯追踪（Habit + HabitLog，支持每日打卡）
- 目标管理（OKR 风格，Goal + KeyResult）
- 复盘系统（Review 表，支持日/周/月/季度/年五种周期）
- 前端 React + TypeScript，后端 FastAPI + SQLAlchemy

**缺失能力：**
- 无 AI 集成
- 无配置表（仅环境变量）
- 无导出 Markdown/飞书导入能力
- 无游戏化激励机制（streak、补打卡、勋章）

### 1.2 本次目标
为 LifeFlow 增加「AI 每日复盘」能力：
1. 用户在日复盘页面填写结构化模板；
2. 一键调用 AI，基于模板答案 + 系统自动抓取的数据生成总结；
3. 支持导出为 Markdown，方便粘贴到飞书文档；
4. 增加轻量级激励机制（streak、补打卡、低能量模式）。

---

## 二、功能范围（MVP）

### 2.1 包含功能
| 模块 | 功能点 |
|------|--------|
| 日复盘模板 | 可配置的每日填空模板（工作/个人提升/杂事、打卡、睡眠、饮食、满意/不满意、时间分布、碎碎念） |
| AI 总结 | 基于模板 + 系统数据生成每日总结 |
| Prompt 管理 | 系统默认 Prompt，支持用户自定义 |
| 配置管理 | API Key、模型、Base URL 走环境变量；后期迁移到配置表 |
| 导出 Markdown | 将日复盘内容导出为 `.md` 文件或复制到剪贴板 |
| 激励机制 | 复盘 streak、连续打卡 streak、补打卡、低能量模式 |

### 2.2 不包含功能（后续迭代）
- 周/月/季度/年度 AI 总结（先只做日复盘）
- 多模型切换 UI
- AI Agent 主动提醒
- 飞书 API 自动同步

---

## 三、数据库变更

### 3.1 新增表：`ai_prompt_templates`（Prompt 模板表）
```sql
CREATE TABLE ai_prompt_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name VARCHAR(100) NOT NULL,           -- 模板名称，如 "默认温暖教练"
    slug VARCHAR(100) NOT NULL,           -- 唯一标识，如 "default"
    system_prompt TEXT NOT NULL,          -- 系统 Prompt
    is_default BOOLEAN DEFAULT FALSE,     -- 是否为默认模板
    is_system BOOLEAN DEFAULT FALSE,      -- 系统内置模板（用户不可删）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, slug)
);
```

**说明：**
- 先按 user_id 维度隔离，后续多用户可扩展；
- 系统内置一条 `default` 模板，用户可修改自己的副本；
- 本条记录代替硬编码 prompt。

### 3.2 新增表：`daily_templates`（每日复盘模板表）
```sql
CREATE TABLE daily_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    fields JSON NOT NULL,                 -- [{key, label, placeholder, type, required, order}]
    is_default BOOLEAN DEFAULT FALSE,
    is_system BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, slug)
);
```

**默认字段设计（对应飞书记录）：**
```json
[
  { "key": "work", "label": "工作/个人提升/杂事完成情况", "placeholder": "今天完成了哪些工作、学习和杂事？", "type": "textarea", "required": false, "order": 1 },
  { "key": "habits", "label": "每日打卡内容", "placeholder": "今天哪些习惯完成了？哪些没有？", "type": "textarea", "required": false, "order": 2 },
  { "key": "sleep", "label": "睡眠情况", "placeholder": "昨晚几点睡？今天几点起？睡眠质量如何？", "type": "text", "required": false, "order": 3 },
  { "key": "diet", "label": "饮食与健身", "placeholder": "今天吃了什么？有没有健身/训记？", "type": "textarea", "required": false, "order": 4 },
  { "key": "best", "label": "今天最满意的事", "placeholder": "今天最有成就感/最开心的事是什么？", "type": "textarea", "required": false, "order": 5 },
  { "key": "worst", "label": "今天最不满意的事", "placeholder": "今天有什么遗憾或做得不好的？", "type": "textarea", "required": false, "order": 6 },
  { "key": "time_distribution", "label": "时间分布", "placeholder": "今天大致的时间分布是怎样的？", "type": "textarea", "required": false, "order": 7 },
  { "key": "murmur", "label": "碎碎念", "placeholder": "有什么想吐槽、想记录、想说的话？", "type": "textarea", "required": false, "order": 8 }
]
```

### 3.3 扩展 `reviews` 表
在 `backend/app/models/review.py` 的 `Review` 类中新增字段：
```python
# AI 生成内容
ai_summary = Column(Text, nullable=True)              # AI 生成的总结
ai_summary_raw = Column(Text, nullable=True)          # AI 原始输出（调试用）
ai_prompt_template_id = Column(Integer, ForeignKey("ai_prompt_templates.id"), nullable=True)

# 每日模板填写的原始数据（JSON: {work: "...", habits: "...", ...}）
daily_template_data = Column(JSON, nullable=True)

# 导出相关
exported_at = Column(DateTime(timezone=True), nullable=True)  # 上次导出 Markdown 时间

# 状态标记
is_low_energy = Column(Boolean, default=False)        # 是否为低能量模式
is_makeup = Column(Boolean, default=False)            # 是否为补打卡
makeup_for_date = Column(Date, nullable=True)         # 补哪一天的复盘
```

### 3.4 扩展 `users` 表
在 `backend/app/models/user.py` 的 `User` 类中新增：
```python
# AI 偏好（短期先不用，长期用）
preferred_ai_model = Column(String(50), nullable=True)
preferred_prompt_template_id = Column(Integer, ForeignKey("ai_prompt_templates.id"), nullable=True)

# 游戏化数据
longest_review_streak = Column(Integer, default=0)    # 最长复盘连续天数
current_review_streak = Column(Integer, default=0)    # 当前复盘连续天数
last_review_date = Column(Date, nullable=True)        # 上次复盘日期
```

### 3.5 数据迁移
使用 Alembic 新增 migration：
```bash
cd backend
alembic revision -m "add ai review features"
```
生成 migration 脚本，包含上述表的创建和字段添加。

---

## 四、后端设计（函数级别）

### 4.1 新增文件：`backend/app/core/ai_config.py`
读取环境变量，作为 AI 配置的兜底。

```python
from pydantic_settings import BaseSettings

class AISettings(BaseSettings):
    AI_PROVIDER: str = "openai"               # openai / claude / deepseek
    AI_API_KEY: str | None = None
    AI_MODEL: str = "gpt-4o-mini"
    AI_BASE_URL: str | None = None            # 第三方代理地址
    AI_TIMEOUT: int = 60
    AI_MAX_TOKENS: int = 1500
    AI_TEMPERATURE: float = 0.7

    class Config:
        env_file = ".env"

ai_settings = AISettings()
```

**新增文件原因：** 把 AI 相关配置从主 `Settings` 中拆分，降低耦合。

### 4.2 新增文件：`backend/app/services/ai_client.py`
封装不同厂商的 AI 调用，统一接口。

```python
from typing import Iterator
import httpx
from app.core.ai_config import ai_settings

class AIClient:
    """AI 调用统一封装"""

    def __init__(self, api_key: str | None = None, model: str | None = None,
                 base_url: str | None = None, provider: str | None = None):
        self.provider = (provider or ai_settings.AI_PROVIDER).lower()
        self.api_key = api_key or ai_settings.AI_API_KEY
        self.model = model or ai_settings.AI_MODEL
        self.base_url = base_url or ai_settings.AI_BASE_URL

    def chat_completion(self, system_prompt: str, user_prompt: str) -> str:
        """同步调用，返回文本结果"""
        if not self.api_key:
            raise ValueError("AI API Key 未配置")
        # 统一使用 OpenAI 兼容格式
        url = f"{self.base_url or self._default_base_url()}/chat/completions"
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "max_tokens": ai_settings.AI_MAX_TOKENS,
            "temperature": ai_settings.AI_TEMPERATURE,
        }
        with httpx.Client(timeout=ai_settings.AI_TIMEOUT) as client:
            resp = client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]

    def _default_base_url(self) -> str:
        if self.provider == "openai":
            return "https://api.openai.com/v1"
        if self.provider == "deepseek":
            return "https://api.deepseek.com/v1"
        if self.provider == "claude":
            return "https://api.anthropic.com/v1"
        raise ValueError(f"不支持的 AI provider: {self.provider}")
```

**关键函数说明：**
- `__init__`：优先使用传入参数，否则 fallback 到环境变量；
- `chat_completion`：统一走 OpenAI 兼容协议，方便后续切换国产模型；
- `_default_base_url`：根据 provider 给出默认地址。

### 4.3 新增文件：`backend/app/services/ai_summary.py`
AI 总结业务逻辑。

```python
from datetime import date
from sqlalchemy.orm import Session
from app import models
from app.services.ai_client import AIClient

class DailySummaryService:
    """每日总结服务"""

    def __init__(self, db: Session, user: models.User):
        self.db = db
        self.user = user

    def build_context(self, target_date: date) -> dict:
        """
        构建 AI 总结所需的上下文数据
        """
        # 1. 今日完成任务
        tasks = self.db.query(models.Task).filter(
            models.Task.user_id == self.user.id,
            models.Task.scheduled_date == target_date,
            models.Task.status == models.TaskStatus.COMPLETED
        ).all()

        # 2. 今日习惯打卡
        habits = self.db.query(models.Habit).filter(
            models.Habit.user_id == self.user.id,
            models.Habit.is_active == True
        ).all()
        habit_logs = self.db.query(models.HabitLog).filter(
            models.HabitLog.user_id == self.user.id,
            models.HabitLog.date == target_date
        ).all()
        habit_status = []
        for habit in habits:
            log = next((l for l in habit_logs if l.habit_id == habit.id), None)
            habit_status.append({
                "name": habit.name,
                "icon": habit.icon,
                "target": habit.times_per_day,
                "actual": log.count if log else 0,
                "completed": (log.count >= habit.times_per_day) if log else False
            })

        # 3. 日复盘模板数据
        review = self.db.query(models.Review).filter(
            models.Review.user_id == self.user.id,
            models.Review.period == models.ReviewPeriod.DAILY,
            models.Review.date == target_date
        ).first()

        # 4. 最近 7 天心情曲线
        mood_data = self._recent_mood(target_date)

        return {
            "date": target_date.isoformat(),
            "tasks": [{"title": t.title, "completed_at": t.completed_at.isoformat() if t.completed_at else None} for t in tasks],
            "habits": habit_status,
            "review_fields": review.daily_template_data if review and review.daily_template_data else {},
            "mood": review.mood if review else None,
            "recent_mood": mood_data,
            "streak": self.user.current_review_streak
        }

    def _recent_mood(self, target_date: date, days: int = 7) -> list[dict]:
        """获取最近 N 天的心情评分"""
        from datetime import timedelta
        start = target_date - timedelta(days=days-1)
        reviews = self.db.query(models.Review).filter(
            models.Review.user_id == self.user.id,
            models.Review.period == models.ReviewPeriod.DAILY,
            models.Review.date >= start,
            models.Review.date <= target_date
        ).order_by(models.Review.date.asc()).all()
        return [{"date": r.date.isoformat(), "mood": r.mood} for r in reviews if r.mood]

    def generate(self, target_date: date, prompt_template_id: int | None = None) -> dict:
        """
        生成 AI 每日总结
        返回: {"summary": "...", "raw": "...", "template_id": ...}
        """
        # 获取 prompt 模板
        template = self._get_prompt_template(prompt_template_id)
        # 构建上下文
        context = self.build_context(target_date)
        # 生成 user prompt
        user_prompt = self._build_user_prompt(context)
        # 调用 AI
        client = AIClient()
        raw_content = client.chat_completion(template.system_prompt, user_prompt)
        # 保存到 review
        self._save_summary(target_date, raw_content, template.id)
        return {"summary": raw_content, "raw": raw_content, "template_id": template.id}

    def _get_prompt_template(self, prompt_template_id: int | None) -> models.AIPromptTemplate:
        """获取 Prompt 模板"""
        if prompt_template_id:
            tpl = self.db.query(models.AIPromptTemplate).filter(
                models.AIPromptTemplate.id == prompt_template_id,
                models.AIPromptTemplate.user_id == self.user.id
            ).first()
            if tpl:
                return tpl
        # 返回用户默认模板
        tpl = self.db.query(models.AIPromptTemplate).filter(
            models.AIPromptTemplate.user_id == self.user.id,
            models.AIPromptTemplate.is_default == True
        ).first()
        if tpl:
            return tpl
        # 返回系统默认模板
        tpl = self.db.query(models.AIPromptTemplate).filter(
            models.AIPromptTemplate.slug == "default",
            models.AIPromptTemplate.is_system == True
        ).first()
        return tpl

    def _build_user_prompt(self, context: dict) -> str:
        """将上下文拼接成 user prompt"""
        import json
        return f"""请根据以下数据生成今日复盘总结：

【今日日期】{context['date']}
【当前复盘连续天数】{context['streak']}

【今日完成任务】
{json.dumps(context['tasks'], ensure_ascii=False, indent=2)}

【今日习惯打卡】
{json.dumps(context['habits'], ensure_ascii=False, indent=2)}

【用户填写的每日模板】
{json.dumps(context['review_fields'], ensure_ascii=False, indent=2)}

【今日心情评分】{context['mood'] or '未填写'}

【近7天心情曲线】
{json.dumps(context['recent_mood'], ensure_ascii=False, indent=2)}
"""

    def _save_summary(self, target_date: date, summary: str, template_id: int):
        """将 AI 总结保存到 Review 记录"""
        review = self.db.query(models.Review).filter(
            models.Review.user_id == self.user.id,
            models.Review.period == models.ReviewPeriod.DAILY,
            models.Review.date == target_date
        ).first()
        if not review:
            from datetime import datetime
            review = models.Review(
                user_id=self.user.id,
                period=models.ReviewPeriod.DAILY,
                year=target_date.year,
                month=target_date.month,
                date=target_date,
                created_at=datetime.utcnow()
            )
            self.db.add(review)
        review.ai_summary = summary
        review.ai_summary_raw = summary
        review.ai_prompt_template_id = template_id
        review.updated_at = datetime.utcnow()
        self.db.commit()
```

**关键函数说明：**
- `build_context`：从 Task、Habit、HabitLog、Review 中抓取目标日期的全部相关数据；
- `_recent_mood`：给 AI 提供近期情绪趋势；
- `generate`：主入口，负责模板选择 → 上下文构建 → AI 调用 → 结果保存；
- `_get_prompt_template`：三级 fallback（指定 ID → 用户默认 → 系统默认）；
- `_build_user_prompt`：把结构化的 context 转成自然语言，让 AI 更容易理解；
- `_save_summary`：没有 Review 时自动创建一条，再把 AI 结果写进去。

### 4.4 新增文件：`backend/app/services/gamification.py`
复盘 streak 和补打卡逻辑。

```python
from datetime import date, timedelta
from sqlalchemy.orm import Session
from app import models

class GamificationService:
    """游戏化服务：streak、补打卡"""

    def __init__(self, db: Session, user: models.User):
        self.db = db
        self.user = user

    def update_review_streak(self, review_date: date):
        """
        更新用户复盘连续天数
        """
        last = self.user.last_review_date
        if not last:
            self.user.current_review_streak = 1
        elif last == review_date:
            # 同一天更新，不重复计算
            return
        elif last == review_date - timedelta(days=1):
            self.user.current_review_streak += 1
        else:
            # 断了，重新计算
            self.user.current_review_streak = 1

        self.user.last_review_date = review_date
        if self.user.current_review_streak > self.user.longest_review_streak:
            self.user.longest_review_streak = self.user.current_review_streak
        self.db.commit()

    def can_makeup(self, target_date: date) -> bool:
        """判断某一天是否允许补复盘"""
        today = date.today()
        # 只允许补最近 7 天（可配置）
        if target_date >= today:
            return False
        if (today - target_date).days > 7:
            return False
        # 该日期不能已有复盘
        existing = self.db.query(models.Review).filter(
            models.Review.user_id == self.user.id,
            models.Review.period == models.ReviewPeriod.DAILY,
            models.Review.date == target_date,
            models.Review.is_makeup == False
        ).first()
        return existing is None

    def apply_makeup(self, review: models.Review):
        """标记一条复盘为补打卡，并更新 streak"""
        review.is_makeup = True
        review.makeup_for_date = review.date
        self.db.commit()
        # 补打卡不更新 streak（或者只更新最长 streak，不更新当前 streak）
```

**关键函数说明：**
- `update_review_streak`：每次保存日复盘后调用，自动判断是连续、断开还是同一天更新；
- `can_makeup`：限制只能补最近 7 天，且不能已有正式复盘；
- `apply_makeup`：标记补打卡，不破坏当前 streak 公平性。

### 4.5 修改文件：`backend/app/api/reviews.py`
新增以下路由：

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date
from app.api.deps import get_db, get_current_active_user
from app import models
from app.services.ai_summary import DailySummaryService
from app.services.gamification import GamificationService
from app.services.export_service import DailyReviewExportService

router = APIRouter(prefix="/reviews", tags=["复盘"])

# ... 原有路由 ...

@router.post("/{review_date}/ai-summary")
def generate_ai_summary(
    review_date: date,
    prompt_template_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """生成某一天的 AI 总结"""
    service = DailySummaryService(db, current_user)
    result = service.generate(review_date, prompt_template_id)
    return {"summary": result["summary"], "template_id": result["template_id"]}


@router.post("/{review_date}/makeup")
def makeup_daily_review(
    review_date: date,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """补某一天的复盘"""
    gamification = GamificationService(db, current_user)
    if not gamification.can_makeup(review_date):
        raise HTTPException(status_code=400, detail="该日期不允许补复盘")

    review = models.Review(
        user_id=current_user.id,
        period=models.ReviewPeriod.DAILY,
        year=review_date.year,
        month=review_date.month,
        date=review_date,
        is_makeup=True,
        makeup_for_date=review_date
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return review


@router.get("/{review_date}/export")
def export_daily_review(
    review_date: date,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """导出某一天的复盘为 Markdown"""
    service = DailyReviewExportService(db, current_user)
    md = service.export_daily(review_date)
    return {"markdown": md}
```

### 4.6 新增文件：`backend/app/services/export_service.py`
Markdown 导出服务。

```python
from datetime import date
from sqlalchemy.orm import Session
from app import models

class DailyReviewExportService:
    """每日复盘导出服务"""

    def __init__(self, db: Session, user: models.User):
        self.db = db
        self.user = user

    def export_daily(self, target_date: date) -> str:
        """导出指定日期的日复盘为 Markdown"""
        review = self.db.query(models.Review).filter(
            models.Review.user_id == self.user.id,
            models.Review.period == models.ReviewPeriod.DAILY,
            models.Review.date == target_date
        ).first()

        tasks = self.db.query(models.Task).filter(
            models.Task.user_id == self.user.id,
            models.Task.scheduled_date == target_date,
            models.Task.status == models.TaskStatus.COMPLETED
        ).all()

        lines = [
            f"# {target_date.isoformat()} 每日记录",
            "",
            f"> 心情评分：{review.mood if review and review.mood else '未填写'}",
            f"> 复盘连续天数：{self.user.current_review_streak}",
            "",
            "## 一、工作/个人提升/杂事完成情况",
            self._field(review, "work") if review else "未填写",
            "",
            "## 二、每日打卡内容",
            self._field(review, "habits") if review else "未填写",
            "",
            "## 三、睡眠情况",
            self._field(review, "sleep") if review else "未填写",
            "",
            "## 四、饮食与健身",
            self._field(review, "diet") if review else "未填写",
            "",
            "## 五、最满意与最不满意",
            f"**最满意：** {self._field(review, 'best')}",
            f"**最不满意：** {self._field(review, 'worst')}",
            "",
            "## 六、时间分布",
            self._field(review, "time_distribution") if review else "未填写",
            "",
            "## 七、碎碎念",
            self._field(review, "murmur") if review else "未填写",
            "",
            "## 八、今日完成任务",
        ]
        if tasks:
            for t in tasks:
                lines.append(f"- [x] {t.title}")
        else:
            lines.append("无")

        if review and review.ai_summary:
            lines.extend([
                "",
                "## 九、AI 总结",
                review.ai_summary
            ])

        return "\n".join(lines)

    def _field(self, review: models.Review | None, key: str) -> str:
        if not review or not review.daily_template_data:
            return "未填写"
        return review.daily_template_data.get(key) or "未填写"
```

### 4.7 修改文件：`backend/app/main.py`
注册新的路由：
```python
from app.api import reviews
# ...
app.include_router(reviews.router, prefix="/api")
```
（如果已注册则跳过）

### 4.8 修改文件：`backend/app/core/config.py`
把 `AISettings` 合并进来或单独引用。推荐主配置：
```python
from app.core.ai_config import AISettings

class Settings(BaseSettings):
    # ... 原有配置 ...
    ai: AISettings = AISettings()
```

### 4.9 初始化脚本
新增 `backend/app/initial_data.py`：
```python
from sqlalchemy.orm import Session
from app import models

def init_ai_templates(db: Session):
    """初始化系统默认 AI Prompt 模板和每日复盘模板"""
    existing = db.query(models.AIPromptTemplate).filter(
        models.AIPromptTemplate.slug == "default",
        models.AIPromptTemplate.is_system == True
    ).first()
    if existing:
        return

    default_prompt = """你是一位温和、有洞察力的人生管理教练。用户正在使用 LifeFlow 进行每日复盘。
请基于用户提供的数据，生成一段 200-400 字的总结，语气温暖、真诚，不要指责。
要求：
1. 肯定今天的成就，哪怕很小；
2. 指出一个可以注意的模式或状态（如睡眠、情绪、时间分配）；
3. 给明天一个具体、可执行的小建议；
4. 如果娱乐/屏幕时间过长，用关心的方式提醒，而非批评。
"""
    tpl = models.AIPromptTemplate(
        user_id=0,  # 系统模板
        name="默认温暖教练",
        slug="default",
        system_prompt=default_prompt,
        is_default=True,
        is_system=True
    )
    db.add(tpl)
    db.commit()

    # 初始化每日模板字段...
```

启动时调用（`main.py` 或 alembic 后）。

---

## 五、前端设计（函数级别）

### 5.1 修改文件：`frontend/src/services/api.ts`
新增 `reviewAIAPI` 和 `reviewExportAPI`：

```typescript
// AI 总结 API
export const reviewAIAPI = {
  generateSummary: (date: string, promptTemplateId?: number) =>
    apiClient.post(`/api/reviews/${date}/ai-summary`, { prompt_template_id: promptTemplateId }),

  listPromptTemplates: () =>
    apiClient.get('/api/ai/prompt-templates'),

  updatePromptTemplate: (id: number, data: any) =>
    apiClient.put(`/api/ai/prompt-templates/${id}`, data),
};

// 导出 API
export const reviewExportAPI = {
  exportDaily: (date: string) =>
    apiClient.get(`/api/reviews/${date}/export`),
};
```

### 5.2 修改文件：`frontend/src/pages/Reviews.tsx`
在 `DailyFormData` 类型中增加模板字段：
```typescript
interface DailyFormData {
  timeline: TimelineItem[];
  notes: string;
  tomorrow: string;
  mood: number;
  templateData: Record<string, string>;  // 新增：每日模板填写内容
  aiSummary: string;                       // 新增：AI 总结
}
```

新增子组件 `DailyTemplateEditor`：
```typescript
function DailyTemplateEditor({
  fields,
  values,
  onChange
}: {
  fields: TemplateField[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}) {
  return (
    <div className="space-y-4">
      {fields.map(field => (
        <div key={field.key}>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {field.label}
          </label>
          {field.type === 'textarea' ? (
            <textarea
              value={values[field.key] || ''}
              onChange={e => onChange({ ...values, [field.key]: e.target.value })}
              placeholder={field.placeholder}
              className="input w-full h-24 text-sm"
            />
          ) : (
            <input
              type="text"
              value={values[field.key] || ''}
              onChange={e => onChange({ ...values, [field.key]: e.target.value })}
              placeholder={field.placeholder}
              className="input w-full text-sm"
            />
          )}
        </div>
      ))}
    </div>
  );
}
```

新增 AI 总结按钮区域：
```typescript
function AISummarySection({
  date,
  summary,
  onGenerate,
  loading
}: {
  date: string;
  summary: string;
  onGenerate: () => void;
  loading: boolean;
}) {
  return (
    <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-gray-900 flex items-center gap-2">
          <Zap size={18} className="text-purple-600" />
          AI 每日总结
        </h3>
        <button
          onClick={onGenerate}
          disabled={loading}
          className="btn-primary text-sm px-3 py-1.5 disabled:opacity-50"
        >
          {loading ? '生成中...' : summary ? '重新生成' : '生成总结'}
        </button>
      </div>
      {summary ? (
        <div className="text-sm text-gray-700 whitespace-pre-wrap bg-white/60 rounded p-3">
          {summary}
        </div>
      ) : (
        <p className="text-sm text-gray-500">点击按钮生成今日 AI 总结</p>
      )}
    </div>
  );
}
```

新增导出按钮：
```typescript
const handleExportMarkdown = async () => {
  const dateStr = format(currentDate, 'yyyy-MM-dd');
  const res = await reviewExportAPI.exportDaily(dateStr);
  const blob = new Blob([res.data.markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${dateStr}_daily_review.md`;
  a.click();
  URL.revokeObjectURL(url);
};
```

修改保存逻辑 `handleSave`：
```typescript
const handleSave = async () => {
  setSaving(true);
  try {
    const dateStr = format(currentDate, 'yyyy-MM-dd');
    const payload = {
      period: 'daily',
      year: currentYear,
      month: currentDate.getMonth() + 1,
      date: dateStr,
      timeline: dailyForm.timeline,
      notes: dailyForm.notes,
      tomorrow: dailyForm.tomorrow,
      mood: dailyForm.mood,
      daily_template_data: dailyForm.templateData,  // 新增
      ai_summary: dailyForm.aiSummary               // 新增
    };

    if (existingReview?.id) {
      await reviewsAPI.update(existingReview.id, payload);
    } else {
      await reviewsAPI.create(payload);
    }

    // 保存成功后更新 streak
    // 后端 reviews.create 内部会调用 GamificationService.update_review_streak
    showToast('保存成功', 'success');
    loadReviews();
  } catch (error) {
    showToast('保存失败', 'error');
  } finally {
    setSaving(false);
  }
};
```

### 5.3 新增文件：`frontend/src/components/LowEnergyMode.tsx`
低能量模式弹窗：
```typescript
export default function LowEnergyMode({ onSubmit }: { onSubmit: (mood: number, note: string) => void }) {
  return (
    <div className="bg-yellow-50 rounded-lg p-4">
      <h4 className="text-sm font-medium text-yellow-800 mb-2">低能量模式</h4>
      <p className="text-xs text-yellow-700 mb-3">今天不想写太多？只回答这一句就好。</p>
      <textarea
        placeholder="今天过得怎么样？"
        className="input w-full h-20 text-sm"
        // ...
      />
    </div>
  );
}
```

### 5.4 修改文件：`frontend/src/components/Layout.tsx`
在侧边栏用户名下显示当前 streak：
```tsx
<div>
  <p className="font-medium text-gray-900">{user.username}</p>
  <p className="text-sm text-gray-500">
    🔥 连续复盘 {user.current_review_streak || 0} 天
  </p>
</div>
```

---

## 六、AI Prompt 设计

### 6.1 系统默认 Prompt（内置）
```
你是一位温和、有洞察力的人生管理教练。用户正在使用 LifeFlow 进行每日复盘。
请基于以下数据，生成一段 200-400 字的总结，语气温暖、真诚，不要指责。

要求：
1. 肯定今天的成就，哪怕很小；
2. 指出一个可以注意的模式或状态（如睡眠、情绪、时间分配、习惯打卡情况）；
3. 给明天一个具体、可执行的小建议；
4. 如果娱乐/屏幕时间过长，用关心的方式提醒，而非批评；
5. 如果今天状态很差，用接纳的语气给予支持，不要增加焦虑。

输出格式：
- 第一段：总体感受
- 第二段：今日亮点
- 第三段：注意到的小模式
- 第四段：给明天的小建议
```

### 6.2 用户 Prompt（每次动态生成）
见 `DailySummaryService._build_user_prompt`。

### 6.3 可选 Prompt 变体
| 名称 | 风格 |
|------|------|
| 默认温暖教练 | 鼓励、洞察、具体建议 |
| 极简冷淡版 | 只列出 3 个要点 |
| 犀利鞭策版 | 直接指出问题，适合需要推力时 |
| 诗意叙事版 | 用故事化语言回顾一天 |

---

## 七、导出 Markdown 格式示例

```markdown
# 2026-06-24 每日记录

> 心情评分：6
> 复盘连续天数：3

## 一、工作/个人提升/杂事完成情况
软著稍微修改了下，检查清单数据稍微整理了下，洗了衣服，退宿，搞了咨询和 last100 的事情。

## 二、每日打卡内容
早睡早起没有，洗漱护肤补剂都没做，饭也没按时吃，没健身。

## 三、睡眠情况
4-5 点睡的，下午 1 点起。

## 四、饮食与健身
无。

## 五、最满意与最不满意
**最满意：** 终于踏出记录这一步。
**最不满意：** 生活状态很差。

## 六、时间分布
1 点起，弄软著和清单 2 小时，然后睡到 5 点，起来继续稍微搞了下，点了外卖，去退宿。7 点半搞大迎咨询，整理 last100，21 点半开始当日记录。

## 七、碎碎念
30 分钟绰绰有余，难的不是事情本身，而是自己的内心。

## 八、今日完成任务
- [x] 修改软著
- [x] 整理检查清单数据
- [x] 洗衣服
- [x] 退宿
- [x] 处理咨询和 last100

## 九、AI 总结
今天你最值得肯定的是：终于开始了每日记录。这是一个很小的动作，但它代表你愿意重新审视自己的生活。
......
```

---

## 八、激励机制设计

### 8.1 Streak 规则
- 每天保存一次日复盘，streak +1；
- 断开后重新从 1 开始；
- 最长 streak 永久记录；
- 补打卡不增加当前 streak，但可记录为「补签」。

### 8.2 勋章/成就（可选后续）
| 勋章 | 条件 |
|------|------|
| 初见 | 完成第一次日复盘 |
| 一周战士 | 连续 7 天 |
| 月度坚持 | 连续 30 天 |
| 百日复盘 | 累计 100 天 |
| 低能量守护者 | 在低能量模式下完成复盘 |

### 8.3 补打卡规则
- 仅允许补最近 7 天；
- 一天只能有一条正式复盘或一条补打卡复盘；
- 补打卡在 Markdown 导出中标注 `(补)`。

### 8.4 低能量模式
- 在日复盘页面提供「今天不想写太多」按钮；
- 只显示一个文本框：「今天过得怎么样？」 + 心情评分；
- AI 仍可基于系统数据生成总结。

---

## 九、实施步骤（开发顺序）

### 阶段 1：数据库与配置（1 天）
1. 新增 `ai_prompt_templates`、`daily_templates` 表；
2. 扩展 `Review` 和 `User` 模型；
3. 生成 Alembic migration 并执行；
4. 新增 `backend/app/core/ai_config.py`；
5. 在 `.env.example` 中添加 AI 配置项。

### 阶段 2：后端 AI 服务（1-2 天）
1. 实现 `AIClient`；
2. 实现 `DailySummaryService`；
3. 实现 `GamificationService`；
4. 实现 `DailyReviewExportService`；
5. 在 `reviews.py` 新增 `/ai-summary`、`/makeup`、`/export` 路由；
6. 新增 `/ai/prompt-templates` 管理路由；
7. 新增 `initial_data.py` 初始化默认模板。

### 阶段 3：前端改造（2 天）
1. 扩展 `api.ts`；
2. 改造 `Reviews.tsx`：
   - 新增每日模板编辑区；
   - 新增 AI 总结区；
   - 新增导出按钮；
   - 新增低能量模式入口；
3. 修改 `Layout.tsx` 显示 streak；
4. 调整保存逻辑，把 `daily_template_data` 和 `ai_summary` 传后端。

### 阶段 4：测试与部署（1 天）
1. 本地完整测试一遍：填写模板 → 保存 → AI 总结 → 导出 Markdown；
2. 测试补打卡、streak 计算；
3. 更新 `deploy.sh` 或 docker-compose 环境变量；
4. 部署到云端服务器 `121.43.239.9`；
5. 配置服务器 `.env` 中的 AI API Key。

---

## 十、环境变量配置

### 10.1 `.env.example` 新增
```bash
# AI 配置
AI_PROVIDER=openai
AI_API_KEY=sk-your-key-here
AI_MODEL=gpt-4o-mini
# AI_BASE_URL=                       # 可选，第三方代理地址
# AI_MAX_TOKENS=1500
# AI_TEMPERATURE=0.7
```

### 10.2 生产环境建议
- 不要把 Key 提交到 Git；
- 服务器上手动创建 `.env` 文件；
- 定期轮换 Key；
- 后续迁移到数据库配置表，避免重启服务。

---

## 十一、风险与注意事项

1. **API Key 泄露**：永远不要写死在前端，必须走后端调用；
2. **AI 调用失败**：需要降级文案（如「AI 服务暂时不可用，请稍后再试」）；
3. **数据隐私**：个人数据通过后端发给 AI，建议不要发送敏感信息；
4. **成本**：个人使用很低，但仍建议设置 max_tokens；
5. **版本同步**：开发前请确认本地、GitHub、云端三个版本一致，避免字段冲突。

---

## 十二、后续可扩展方向

1. 周/月/季度 AI 总结；
2. 自动定时提醒（邮件/浏览器通知）；
3. 飞书 API 直接同步；
4. 多模型切换 UI；
5. AI 根据历史数据给出长期趋势分析；
6. 语音输入转文字后自动填充模板。

---

*文档结束*
