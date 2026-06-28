"""
LifeFlow - 完整版本（含项目和增强任务管理）
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import date, datetime, timedelta
import os

from app.db.database import SessionLocal, engine, Base
from app import models
from app.models.habit import HabitFrequency
from app.models.task import TaskType, TaskStatus, TaskPriority
from app.api import auth as auth_router, dashboard as dashboard_router, reviews as reviews_router
from app.api import projects as projects_router, tasks as tasks_router, goals as goals_router, habits as habits_router
from app.api.auth import get_password_hash, verify_password

# HabitFrequency 值映射
HABIT_CUSTOM = HabitFrequency.CUSTOM  # 固定日期（自定义）
HABIT_FLEXIBLE = HabitFrequency.FLEXIBLE  # 灵活模式

app = FastAPI(title="LifeFlow")

# CORS
# 开发环境默认放行 localhost；生产环境通过 CORS_ORIGINS / FRONTEND_URL 注入域名
_default_origins = "http://localhost,http://localhost:3000,http://127.0.0.1:3000"
_cors_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", _default_origins).split(",") if o.strip()]
_frontend_url = os.getenv("FRONTEND_URL")
if _frontend_url:
    _cors_origins.append(_frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(auth_router.router, prefix="/api")
app.include_router(dashboard_router.router, prefix="/api")
app.include_router(reviews_router.router, prefix="/api")
app.include_router(projects_router.router, prefix="/api")
app.include_router(tasks_router.router, prefix="/api")
app.include_router(goals_router.router, prefix="/api")
app.include_router(habits_router.router, prefix="/api")


# ==================== 健康检查 ====================
@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.0"}


# ==================== 初始化 ====================
def init_default_data():
    """初始化默认数据"""
    db = SessionLocal()
    try:
        # 创建默认用户
        user = db.query(models.User).filter(models.User.username == "admin").first()
        if not user:
            user = models.User(
                username="admin",
                email="admin@example.com",
                hashed_password=get_password_hash("admin123"),
                is_active=True
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            print("[INIT] 创建默认用户: admin / admin123")
        elif not user.hashed_password.startswith(("$2a$", "$2b$", "$2y$")):
            # 兼容旧版 SHA256 密码，自动升级为 bcrypt
            user.hashed_password = get_password_hash("admin123")
            db.commit()
            print("[INIT] 已升级默认用户密码哈希")

        # 创建默认习惯（仅在用户没有习惯时创建）
        existing_habits = db.query(models.Habit).filter(models.Habit.user_id == user.id).first()
        if not existing_habits:
            default_habits = [
                # (名称, 图标, 颜色, 频率类型, 每周目标, 每日次数, 自定义安排, 允许超额)
                # 自定义安排格式: [周一,周二,周三,周四,周五,周六,周日] 1=打卡,0=跳过
                ("早睡早起", "🌙", "#6366F1", HABIT_CUSTOM, 5, 1, [1,1,1,1,1,0,0], False),
                ("早晚护肤", "✨", "#EC4899", HABIT_CUSTOM, 6, 2, [1,1,1,1,1,1,0], False),
                ("健身", "💪", "#EF4444", HABIT_FLEXIBLE, 5, 1, None, True),  # 灵活模式允许超额
                ("练腹肌核心", "🎯", "#F59E0B", HABIT_CUSTOM, 4, 1, [1,0,1,0,1,0,1], False),
                ("做有氧", "🏃", "#3B82F6", HABIT_CUSTOM, 2, 1, [0,1,0,0,1,0,0], False),
                ("柔韧性训练", "🧘", "#10B981", HABIT_CUSTOM, 4, 1, [1,0,1,0,1,0,1], False),
                ("肌酸", "💊", "#84CC16", HABIT_CUSTOM, 7, 1, [1,1,1,1,1,1,1], False),
                ("坚持朗读", "📖", "#8B5CF6", HABIT_CUSTOM, 7, 1, [1,1,1,1,1,1,1], False),
            ]

            for name, icon, color, freq_type, weekly_target, times_per_day, custom_schedule, allow_overflow in default_habits:
                habit = models.Habit(
                    user_id=user.id,
                    name=name,
                    icon=icon,
                    color=color,
                    frequency_type=freq_type,
                    weekly_target=weekly_target,
                    times_per_day=times_per_day,
                    custom_schedule=custom_schedule,
                    allow_overflow=allow_overflow,
                    is_active=True,
                    is_archived=False,
                    sort_order=0
                )
                db.add(habit)

            db.commit()
            print(f"[INIT] 创建 {len(default_habits)} 个默认习惯")

        # 创建随机测试任务（确保至少有30条）
        task_count = db.query(models.Task).filter(models.Task.user_id == user.id).count()
        if task_count >= 30:
            print(f"[INIT] 已有 {task_count} 条任务，无需生成")
        else:
            import random
            from datetime import date, timedelta

            # 任务标题库
            task_titles = [
                "完成项目需求文档", "参加周会", "修复登录bug", "优化数据库查询",
                "学习Python新特性", "阅读技术文章", "整理桌面文件", "备份重要数据",
                "更新软件版本", "配置开发环境", "写单元测试", "Code Review",
                "部署到生产环境", "写周报", "客户沟通", "需求评审",
                "设计数据库表结构", "画流程图", "研究新技术", "整理笔记",
                "买生活用品", "预约体检", "还信用卡", "订机票",
                "准备演讲PPT", "团队聚餐", "整理照片", "学习外语",
                "健身锻炼", "看电影", "听音乐放松", "整理书架"
            ]

            # 任务类型
            task_types = [TaskType.SCHEDULE, TaskType.TODO, TaskType.SOMEDAY, TaskType.INBOX]

            # 优先级
            priorities = [TaskPriority.LOW, TaskPriority.MEDIUM, TaskPriority.HIGH, TaskPriority.URGENT]

            # 2月日期范围
            feb_start = date(2026, 2, 1)
            feb_end = date(2026, 2, 28)
            feb_days = (feb_end - feb_start).days + 1

            num_tasks = max(30 - task_count, random.randint(5, 10))  # 确保至少30条，再多生成5-10条
            created_count = 0

            for i in range(num_tasks):
                title = random.choice(task_titles)
                # 偶尔添加序号区分
                if random.random() > 0.7:
                    title = f"{title} #{i+1}"

                task_type = random.choice(task_types)
                priority = random.choice(priorities)

                # 截止日期：70%概率有，30%概率为空
                if random.random() > 0.3:
                    due_date = feb_start + timedelta(days=random.randint(0, feb_days - 1))
                else:
                    due_date = None

                # 计划日期：50%概率有，50%概率为空
                if random.random() > 0.5:
                    scheduled_date = feb_start + timedelta(days=random.randint(0, feb_days - 1))
                else:
                    scheduled_date = None

                # 预估番茄钟：30%概率有
                if random.random() > 0.7:
                    estimated_pomodoros = random.randint(1, 8)
                else:
                    estimated_pomodoros = None

                # 任务状态：大部分未完成，小部分已完成
                rand = random.random()
                if rand > 0.8:
                    status = TaskStatus.COMPLETED
                    completed_at = datetime.now() - timedelta(days=random.randint(1, 10))
                elif rand > 0.6:
                    status = TaskStatus.IN_PROGRESS
                    completed_at = None
                else:
                    status = TaskStatus.PENDING
                    completed_at = None

                task = models.Task(
                    user_id=user.id,
                    title=title,
                    description=f"这是{title}的详细描述" if random.random() > 0.5 else None,
                    task_type=task_type,
                    status=status,
                    priority=priority,
                    due_date=due_date,
                    scheduled_date=scheduled_date,
                    estimated_pomodoros=estimated_pomodoros,
                    actual_pomodoros=random.randint(1, estimated_pomodoros + 2) if estimated_pomodoros and status == TaskStatus.COMPLETED else None,
                    is_inbox=1 if task_type == TaskType.INBOX else 0,
                    completed_at=completed_at
                )
                db.add(task)
                created_count += 1

            db.commit()
            total = task_count + created_count
            print(f"[INIT] 原有 {task_count} 条任务，新增 {created_count} 条，现有共 {total} 条任务")
    finally:
        db.close()


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    init_default_data()
    print("[START] LifeFlow 启动成功！")
    print("[URL] 前端: http://localhost:3000")
    print("[URL] 后端: http://127.0.0.1:8000")
