"""
LifeFlow - 完整版本（含项目和增强任务管理）
"""
from fastapi import FastAPI, Form, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional, List
import hashlib
import json
from datetime import date, datetime, timedelta

from app.db.database import SessionLocal, engine, Base
from app import models
from app.models.habit import HabitFrequency
from app.models.task import TaskType, TaskStatus, TaskPriority
from app.models.project import ProjectStatus
from app.models.goal import GoalStatus

# HabitFrequency 值映射
HABIT_CUSTOM = HabitFrequency.CUSTOM  # 固定日期（自定义）
HABIT_FLEXIBLE = HabitFrequency.FLEXIBLE  # 灵活模式

app = FastAPI(title="LifeFlow")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def simple_hash(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

# ==================== 健康检查 ====================
@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.0"}

# ==================== 认证 ====================
@app.get("/api/auth/me")
def get_me(db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == "admin").first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None
    }

@app.post("/api/auth/login")
def login(username: str = Form(...), password: str = Form(...), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user or user.hashed_password != simple_hash(password):
        return {"error": "用户名或密码错误"}
    
    return {
        "access_token": f"token_{user.id}",
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat() if user.created_at else None
        }
    }

# ==================== 仪表盘 ====================
@app.get("/api/dashboard/stats")
def dashboard(db: Session = Depends(get_db)):
    today = date.today()
    
    # 统计今天的任务
    today_tasks = db.query(models.Task).filter(
        models.Task.user_id == 1,
        models.Task.status != TaskStatus.COMPLETED,
        models.Task.is_inbox == 0,
        ((models.Task.scheduled_date == today) | 
         (models.Task.due_date == today) |
         ((models.Task.due_date < today) & (models.Task.status != TaskStatus.COMPLETED)))
    ).count()
    
    # 统计活跃目标
    active_goals = db.query(models.Goal).filter(
        models.Goal.user_id == 1,
        models.Goal.status == GoalStatus.ACTIVE
    ).count()
    
    # 统计习惯
    total_habits = db.query(models.Habit).filter(
        models.Habit.is_active == True,
        models.Habit.is_archived == False
    ).count()
    
    # 今日已完成习惯数（简化处理，实际需要查询 habit_logs）
    completed_habits = 0
    
    # 本周数据
    week_start = today - timedelta(days=today.weekday())
    week_tasks_completed = db.query(models.Task).filter(
        models.Task.user_id == 1,
        models.Task.status == TaskStatus.COMPLETED,
        models.Task.completed_at >= week_start
    ).count()
    
    week_tasks_total = db.query(models.Task).filter(
        models.Task.user_id == 1,
        models.Task.scheduled_date >= week_start,
        models.Task.scheduled_date <= today
    ).count()
    
    return {
        "today": {
            "tasks_count": today_tasks,
            "completed_habits": completed_habits,
            "total_habits": total_habits
        },
        "overview": {
            "active_goals": active_goals,
            "active_habits": total_habits,
            "week_tasks_total": week_tasks_total,
            "week_tasks_completed": week_tasks_completed
        },
        "heatmap": []
    }

# ==================== 项目管理 ====================
class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    target_date: Optional[str] = None

@app.get("/api/projects/")
def list_projects(db: Session = Depends(get_db)):
    """获取所有项目"""
    projects = db.query(models.Project).filter(
        models.Project.user_id == 1
    ).order_by(models.Project.created_at.desc()).all()
    
    result = []
    for p in projects:
        # 计算项目下的任务统计
        total_tasks = db.query(models.Task).filter(models.Task.project_id == p.id).count()
        completed_tasks = db.query(models.Task).filter(
            models.Task.project_id == p.id,
            models.Task.status == TaskStatus.COMPLETED
        ).count()
        
        result.append({
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "status": p.status.value,
            "progress": p.progress,
            "target_date": p.target_date.isoformat() if p.target_date else None,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "total_tasks": total_tasks,
            "completed_tasks": completed_tasks
        })
    
    return result

@app.get("/api/projects/{project_id}")
def get_project(project_id: int, db: Session = Depends(get_db)):
    """获取项目详情"""
    p = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="项目不存在")
    
    # 获取项目下的任务
    tasks = db.query(models.Task).filter(models.Task.project_id == p.id).all()
    
    # 获取项目目标
    goals = db.query(models.ProjectGoal).filter(
        models.ProjectGoal.project_id == p.id
    ).order_by(models.ProjectGoal.sort_order).all()
    
    return {
        "id": p.id,
        "name": p.name,
        "description": p.description,
        "outline": p.outline,
        "status": p.status.value,
        "progress": p.progress,
        "target_date": p.target_date.isoformat() if p.target_date else None,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "goals": [{
            "id": g.id,
            "title": g.title,
            "description": g.description,
            "is_completed": g.is_completed,
            "completed_at": g.completed_at.isoformat() if g.completed_at else None,
            "sort_order": g.sort_order,
        } for g in goals],
        "tasks": [{
            "id": t.id,
            "title": t.title,
            "status": t.status.value,
            "priority": t.priority.value,
            "completed_at": t.completed_at.isoformat() if t.completed_at else None
        } for t in tasks]
    }

@app.post("/api/projects/")
def create_project(project: ProjectCreate, db: Session = Depends(get_db)):
    """创建项目"""
    db_project = models.Project(
        user_id=1,
        name=project.name,
        description=project.description,
        status=ProjectStatus.ACTIVE,
        target_date=project.target_date,
        progress=0.0
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return {
        "id": db_project.id,
        "name": db_project.name,
        "status": db_project.status.value
    }

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    target_date: Optional[str] = None
    outline: Optional[str] = None

@app.put("/api/projects/{project_id}")
def update_project(
    project_id: int,
    data: ProjectUpdate,
    db: Session = Depends(get_db)
):
    """更新项目"""
    p = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="项目不存在")
    
    if data.name is not None:
        p.name = data.name
    if data.description is not None:
        p.description = data.description
    if data.status is not None:
        p.status = ProjectStatus(data.status)
        # 如果状态变为已完成，记录完成日期
        if data.status == "completed" and not p.completed_date:
            p.completed_date = date.today()
    if data.target_date is not None:
        p.target_date = parse_date(data.target_date)
    if data.outline is not None:
        p.outline = data.outline
    
    # 进度基于目标完成情况（不是任务）
    # 由 _update_project_progress 在目标变更时自动更新
    
    db.commit()
    db.refresh(p)
    return {
        "id": p.id,
        "name": p.name,
        "description": p.description,
        "status": p.status.value,
        "target_date": p.target_date.isoformat() if p.target_date else None,
        "outline": p.outline,
        "progress": p.progress
    }

@app.delete("/api/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    """删除项目"""
    p = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="项目不存在")
    
    # 将项目下的任务设为无项目
    db.query(models.Task).filter(models.Task.project_id == project_id).update({"project_id": None})
    
    db.delete(p)
    db.commit()
    return {"message": "项目已删除"}

# ==================== 目标管理 ====================
@app.get("/api/goals/")
def list_goals(
    period: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    """获取目标列表"""
    query = db.query(models.Goal).filter(models.Goal.user_id == 1)
    
    if period:
        query = query.filter(models.Goal.period == period)
    if year:
        query = query.filter(models.Goal.year == year)
    
    goals = query.order_by(models.Goal.created_at.desc()).all()
    
    return [{
        "id": g.id,
        "title": g.title,
        "description": g.description,
        "period": g.period.value,
        "year": g.year,
        "quarter": g.quarter,
        "month": g.month,
        "area": g.area,
        "status": g.status.value,
        "progress": g.progress,
        "created_at": g.created_at.isoformat() if g.created_at else None,
        "key_results": [{
            "id": kr.id,
            "title": kr.title,
            "target_value": kr.target_value,
            "current_value": kr.current_value,
            "unit": kr.unit,
            "is_completed": kr.is_completed
        } for kr in g.key_results]
    } for g in goals]

@app.post("/api/goals/")
def create_goal(
    goal: dict,
    db: Session = Depends(get_db)
):
    """创建目标"""
    db_goal = models.Goal(
        user_id=1,
        title=goal.get("title", ""),
        description=goal.get("description"),
        period=goal.get("period", "month"),
        year=goal.get("year") or date.today().year,
        quarter=goal.get("quarter"),
        month=goal.get("month"),
        area=goal.get("area"),
        status=GoalStatus.ACTIVE,
        progress=0.0
    )
    db.add(db_goal)
    db.commit()
    db.refresh(db_goal)
    return {"id": db_goal.id, "title": db_goal.title}

@app.put("/api/goals/{goal_id}")
def update_goal(
    goal_id: int,
    goal: dict,
    db: Session = Depends(get_db)
):
    """更新目标"""
    g = db.query(models.Goal).filter(models.Goal.id == goal_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="目标不存在")
    
    g.title = goal.get("title", g.title)
    g.description = goal.get("description", g.description)
    g.status = goal.get("status", g.status)
    
    db.commit()
    db.refresh(g)
    return {"id": g.id, "title": g.title}

@app.delete("/api/goals/{goal_id}")
def delete_goal(goal_id: int, db: Session = Depends(get_db)):
    """删除目标"""
    g = db.query(models.Goal).filter(models.Goal.id == goal_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="目标不存在")
    
    db.delete(g)
    db.commit()
    return {"message": "目标已删除"}

# ==================== 任务管理（增强版） ====================
class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    task_type: str = "inbox"
    priority: int = 2
    due_date: Optional[str] = None
    scheduled_date: Optional[str] = None
    scheduled_type: Optional[str] = None
    estimated_pomodoros: Optional[int] = None
    project_id: Optional[int] = None
    is_inbox: int = 0

@app.get("/api/tasks/")
def list_tasks(
    view: str = Query("all"),  # all/today/week/overdue/inbox/todo/completed
    db: Session = Depends(get_db)
):
    """获取任务列表（支持多视图）"""
    today = date.today()
    query = db.query(models.Task).filter(models.Task.user_id == 1)
    
    if view == "inbox":
        # 收件箱：未整理的想法（未完成的）
        query = query.filter(models.Task.is_inbox == 1, models.Task.status != TaskStatus.COMPLETED)
    elif view == "today":
        # 今天：计划今天做 或 截止今天 或 已逾期（未完成的）
        query = query.filter(
            models.Task.status != TaskStatus.COMPLETED,
            models.Task.is_inbox == 0,
            ((models.Task.scheduled_date == today) | 
             (models.Task.due_date == today) |
             ((models.Task.due_date < today) & (models.Task.due_date != None)))
        )
    elif view == "week":
        # 本周：截止日期或计划日期在本周（未完成的）
        week_start = today - timedelta(days=today.weekday())  # 周一
        week_end = week_start + timedelta(days=6)  # 周日
        query = query.filter(
            models.Task.status != TaskStatus.COMPLETED,
            models.Task.is_inbox == 0,
            ((models.Task.due_date >= week_start) & (models.Task.due_date <= week_end)) |
            ((models.Task.scheduled_date >= week_start) & (models.Task.scheduled_date <= week_end))
        )
    elif view == "overdue":
        # 已逾期：截止日期已过且未完成
        query = query.filter(
            models.Task.status != TaskStatus.COMPLETED,
            models.Task.due_date < today,
            models.Task.due_date != None
        )
    elif view == "todo":
        # 待办清单：已整理且未完成的任务
        query = query.filter(
            models.Task.status != TaskStatus.COMPLETED,
            models.Task.is_inbox == 0
        )
    elif view == "completed":
        # 已完成
        query = query.filter(models.Task.status == TaskStatus.COMPLETED)
    
    tasks = query.order_by(models.Task.created_at.desc()).all()
    
    # 优先级映射：字符串 -> 数字
    priority_map = {"low": 1, "medium": 2, "high": 3, "urgent": 4}
    
    return [{
        "id": t.id,
        "title": t.title,
        "description": t.description,
        "task_type": t.task_type.value,
        "status": t.status.value,
        "priority": priority_map.get(t.priority.value, 2),
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "scheduled_date": t.scheduled_date.isoformat() if t.scheduled_date else None,
        "scheduled_type": t.scheduled_type,
        "estimated_pomodoros": t.estimated_pomodoros,
        "actual_pomodoros": t.actual_pomodoros,
        "project_id": t.project_id,
        "project_name": t.project.name if t.project else None,
        "is_inbox": t.is_inbox,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        "created_at": t.created_at.isoformat() if t.created_at else None
    } for t in tasks]

@app.get("/api/tasks/week-calendar")
def get_week_calendar(
    year: int = Query(None),
    week: int = Query(None),
    db: Session = Depends(get_db)
):
    """获取本周日历视图数据"""
    if year is None or week is None:
        today = date.today()
        year, week, _ = today.isocalendar()
    
    from datetime import datetime as dt
    week_start = dt.strptime(f'{year}-W{week}-1', '%G-W%V-%u').date()
    week_dates = [week_start + timedelta(days=i) for i in range(7)]
    
    # 获取本周内的任务（按日期分组）
    priority_map = {"low": 1, "medium": 2, "high": 3, "urgent": 4}
    result = []
    for d in week_dates:
        tasks = db.query(models.Task).filter(
            models.Task.user_id == 1,
            models.Task.status != TaskStatus.COMPLETED,
            models.Task.is_inbox == 0,
            models.Task.scheduled_date == d
        ).all()
        
        result.append({
            "date": d.isoformat(),
            "weekday": d.weekday(),
            "tasks": [{
                "id": t.id,
                "title": t.title,
                "priority": priority_map.get(t.priority.value, 2),
                "project_name": t.project.name if t.project else None
            } for t in tasks]
        })
    
    return {
        "year": year,
        "week": week,
        "days": result
    }

@app.get("/api/tasks/stats")
def get_task_stats(db: Session = Depends(get_db)):
    """获取任务统计（用于已完成视图）"""
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    
    # 本周完成任务数
    week_completed = db.query(models.Task).filter(
        models.Task.user_id == 1,
        models.Task.status == TaskStatus.COMPLETED,
        models.Task.completed_at >= week_start
    ).count()
    
    # 按项目统计
    project_stats = db.query(
        models.Task.project_id,
        func.count(models.Task.id).label("count")
    ).filter(
        models.Task.user_id == 1,
        models.Task.status == TaskStatus.COMPLETED
    ).group_by(models.Task.project_id).all()
    
    # 按优先级统计
    priority_stats = db.query(
        models.Task.priority,
        func.count(models.Task.id).label("count")
    ).filter(
        models.Task.user_id == 1,
        models.Task.status == TaskStatus.COMPLETED
    ).group_by(models.Task.priority).all()
    
    return {
        "week_completed": week_completed,
        "project_stats": [{"project_id": p[0], "count": p[1]} for p in project_stats],
        "priority_stats": [{"priority": p[0].value, "count": p[1]} for p in priority_stats]
    }

def parse_date(date_str: Optional[str]) -> Optional[date]:
    """将日期字符串转为 Python date 对象"""
    if not date_str:
        return None
    try:
        return date.fromisoformat(date_str)
    except ValueError:
        return None

@app.post("/api/tasks/")
def create_task(task: TaskCreate, db: Session = Depends(get_db)):
    """创建任务"""
    priority_map = {1: TaskPriority.LOW, 2: TaskPriority.MEDIUM, 3: TaskPriority.HIGH, 4: TaskPriority.URGENT}
    task_priority = priority_map.get(task.priority, TaskPriority.MEDIUM)
    
    # 处理 scheduled_type 到具体日期
    scheduled_date = parse_date(task.scheduled_date)
    if task.scheduled_type:
        today = date.today()
        if task.scheduled_type == "today":
            scheduled_date = today
        elif task.scheduled_type == "tomorrow":
            scheduled_date = today + timedelta(days=1)
        elif task.scheduled_type == "week":
            scheduled_date = today + timedelta(days=7)
        elif task.scheduled_type == "month":
            scheduled_date = today + timedelta(days=30)
        elif task.scheduled_type == "year":
            scheduled_date = today + timedelta(days=365)
    
    db_task = models.Task(
        user_id=1,
        title=task.title,
        description=task.description,
        task_type=TaskType(task.task_type) if task.task_type else TaskType.INBOX,
        status=TaskStatus.PENDING,
        priority=task_priority,
        due_date=parse_date(task.due_date),
        scheduled_date=scheduled_date,
        scheduled_type=task.scheduled_type,
        estimated_pomodoros=task.estimated_pomodoros,
        project_id=task.project_id,
        is_inbox=task.is_inbox
    )
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    
    return {
        "id": db_task.id,
        "title": db_task.title,
        "status": db_task.status.value
    }

@app.put("/api/tasks/{task_id}")
def update_task(
    task_id: int,
    data: dict,
    db: Session = Depends(get_db)
):
    """更新任务"""
    t = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    priority_map = {1: TaskPriority.LOW, 2: TaskPriority.MEDIUM, 3: TaskPriority.HIGH, 4: TaskPriority.URGENT}
    
    # 更新字段
    if 'title' in data and data['title'] is not None:
        t.title = data['title']
    if 'description' in data:
        t.description = data['description'] or None
    if 'status' in data and data['status']:
        new_status = data['status']
        t.status = TaskStatus(new_status)
        # 状态变更时更新完成时间
        if new_status == "completed" and not t.completed_at:
            t.completed_at = datetime.utcnow()
        elif new_status != "completed":
            t.completed_at = None
    if 'priority' in data and data['priority'] is not None:
        t.priority = priority_map.get(data['priority'], TaskPriority.MEDIUM)
    if 'due_date' in data:
        t.due_date = parse_date(data['due_date'])
    if 'scheduled_date' in data:
        t.scheduled_date = parse_date(data['scheduled_date'])
    if 'estimated_pomodoros' in data:
        t.estimated_pomodoros = data['estimated_pomodoros']
    if 'actual_pomodoros' in data:
        t.actual_pomodoros = data['actual_pomodoros']
    if 'project_id' in data:
        t.project_id = data['project_id']
    
    db.commit()
    db.refresh(t)
    return {"id": t.id, "title": t.title, "status": t.status.value}

class CompleteTaskRequest(BaseModel):
    actual_pomodoros: Optional[int] = None

@app.post("/api/tasks/{task_id}/complete")
def complete_task(
    task_id: int,
    data: Optional[CompleteTaskRequest] = None,
    db: Session = Depends(get_db)
):
    """完成任务"""
    t = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not t:
        return {"error": "任务不存在"}
    
    if t.status == TaskStatus.COMPLETED:
        # 已完成的任务取消完成
        t.status = TaskStatus.PENDING
        t.completed_at = None
        t.actual_pomodoros = None
    else:
        # 完成任务
        t.status = TaskStatus.COMPLETED
        t.completed_at = datetime.utcnow()
        if data and data.actual_pomodoros is not None:
            t.actual_pomodoros = data.actual_pomodoros
    
    db.commit()
    
    # 更新项目进度
    if t.project_id:
        project = db.query(models.Project).filter(models.Project.id == t.project_id).first()
        if project:
            total = db.query(models.Task).filter(models.Task.project_id == project.id).count()
            completed = db.query(models.Task).filter(
                models.Task.project_id == project.id,
                models.Task.status == TaskStatus.COMPLETED
            ).count()
            project.progress = round(completed / total * 100, 1)
            db.commit()
    
    return {"id": t.id, "status": t.status.value, "actual_pomodoros": t.actual_pomodoros}

@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db)):
    """删除任务"""
    t = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    db.delete(t)
    db.commit()
    return {"message": "任务已删除"}

# ==================== 习惯管理 ====================
@app.get("/api/habits/")
def list_habits(db: Session = Depends(get_db)):
    habits = db.query(models.Habit).filter(
        models.Habit.is_active == True,
        models.Habit.is_archived == False
    ).order_by(models.Habit.sort_order).all()
    
    return [{
        "id": h.id,
        "name": h.name,
        "icon": h.icon,
        "color": h.color,
        "frequency_type": h.frequency_type.value,
        "weekly_target": h.weekly_target,
        "times_per_day": h.times_per_day,
        "custom_schedule": h.custom_schedule,
        "allow_overflow": h.allow_overflow,
        "weekly_total": h.get_weekly_target_total(),
        "is_active": h.is_active,
    } for h in habits]

@app.get("/api/habits/week")
def get_habits_week(year: int = Query(None), week: int = Query(None), db: Session = Depends(get_db)):
    if year is None or week is None:
        today = date.today()
        year, week, _ = today.isocalendar()
    
    from datetime import datetime as dt
    week_start = dt.strptime(f'{year}-W{week}-1', '%G-W%V-%u').date()
    week_dates = [week_start + timedelta(days=i) for i in range(7)]
    
    habits = db.query(models.Habit).filter(
        models.Habit.is_active == True,
        models.Habit.is_archived == False
    ).order_by(models.Habit.sort_order).all()
    
    result = []
    for habit in habits:
        logs = db.query(models.HabitLog).filter(
            models.HabitLog.habit_id == habit.id,
            models.HabitLog.date >= week_dates[0],
            models.HabitLog.date <= week_dates[6]
        ).all()
        
        week_status = []
        total_actual = 0
        for d in week_dates:
            target = habit.get_target_for_date(d)
            log = next((l for l in logs if l.date == d), None)
            actual = log.count if log else 0
            total_actual += actual
            
            week_status.append({
                "date": d.isoformat(),
                "weekday": d.weekday(),
                "target": target,
                "actual": actual,
                "completed": actual >= target if target > 0 else False,
            })
        
        weekly_target = habit.get_weekly_target_total()
        if habit.frequency_type == HabitFrequency.FLEXIBLE:
            # 灵活模式：完成次数 / 目标次数，超过100%显示超额
            raw_rate = round((total_actual / weekly_target * 100) if weekly_target > 0 else 0)
            weekly_rate = min(raw_rate, 100)  # 显示最多100%
        else:
            # 固定模式：完成天数 / 计划天数
            # 只要当天打卡了（actual > 0），就算完成了一天
            completed_days = sum(1 for s in week_status if s["actual"] > 0 and s["target"] > 0)
            total_scheduled_days = sum(1 for s in week_status if s["target"] > 0)
            weekly_rate = round((completed_days / total_scheduled_days * 100) if total_scheduled_days > 0 else 100)
        
        # 计算是否超额（仅灵活模式）
        is_overflow = (habit.frequency_type == HabitFrequency.FLEXIBLE and 
                       total_actual > weekly_target)
        
        result.append({
            "habit": {
                "id": habit.id,
                "name": habit.name,
                "icon": habit.icon,
                "color": habit.color,
                "frequency_type": habit.frequency_type.value,
                "weekly_target": habit.weekly_target,
                "times_per_day": habit.times_per_day,
                "custom_schedule": habit.custom_schedule,
                "weekly_total": weekly_target,
                "allow_overflow": habit.allow_overflow,
            },
            "week_status": week_status,
            "weekly_rate": weekly_rate,
            "total_actual": total_actual,
            "is_perfect": weekly_rate == 100,
            "is_overflow": is_overflow
        })
    
    return {
        "year": year,
        "week": week,
        "week_dates": [d.isoformat() for d in week_dates],
        "habits": result
    }

class HabitToggleRequest(BaseModel):
    habit_id: int
    date: str
    count: Optional[int] = None

@app.post("/api/habits/toggle")
def toggle_habit(data: HabitToggleRequest, db: Session = Depends(get_db)):
    """习惯打卡/取消打卡"""
    habit = db.query(models.Habit).filter(models.Habit.id == data.habit_id).first()
    if not habit:
        raise HTTPException(status_code=404, detail="习惯不存在")
    
    toggle_date = date.fromisoformat(data.date)
    
    # 查找现有记录
    log = db.query(models.HabitLog).filter(
        models.HabitLog.habit_id == data.habit_id,
        models.HabitLog.date == toggle_date
    ).first()
    
    target = habit.get_target_for_date(toggle_date)
    
    if data.count is not None:
        # 直接设置次数
        new_count = data.count
    elif log and log.count > 0:
        # 已打卡则取消
        new_count = 0
    else:
        # 未打卡则打卡一次
        new_count = 1
    
    if log:
        log.count = new_count
    else:
        log = models.HabitLog(
            habit_id=data.habit_id,
            user_id=habit.user_id,
            date=toggle_date,
            count=new_count
        )
        db.add(log)
    
    db.commit()
    return {"success": True, "count": new_count}

class HabitCreateRequest(BaseModel):
    name: str
    icon: Optional[str] = "✅"
    color: Optional[str] = "#3B82F6"
    frequency_type: str = "daily"
    weekly_target: int = 7
    times_per_day: int = 1
    custom_schedule: Optional[list] = None
    allow_overflow: bool = False

@app.post("/api/habits/")
def create_habit_api(habit: HabitCreateRequest, db: Session = Depends(get_db)):
    """创建习惯"""
    freq_map = {
        "daily": HabitFrequency.DAILY,
        "weekdays": HabitFrequency.WEEKDAYS,
        "weekends": HabitFrequency.WEEKENDS,
        "custom": HabitFrequency.CUSTOM,
        "flexible": HabitFrequency.FLEXIBLE,
    }
    
    db_habit = models.Habit(
        user_id=1,  # 默认用户
        name=habit.name,
        icon=habit.icon,
        color=habit.color,
        frequency_type=freq_map.get(habit.frequency_type, HabitFrequency.DAILY),
        weekly_target=habit.weekly_target,
        times_per_day=habit.times_per_day,
        custom_schedule=habit.custom_schedule,
        allow_overflow=habit.allow_overflow,
        is_active=True,
        is_archived=False,
        sort_order=0
    )
    db.add(db_habit)
    db.commit()
    db.refresh(db_habit)
    return {"id": db_habit.id, "name": db_habit.name}

@app.put("/api/habits/{habit_id}")
def update_habit_api(
    habit_id: int,
    habit: HabitCreateRequest,
    db: Session = Depends(get_db)
):
    """更新习惯"""
    h = db.query(models.Habit).filter(models.Habit.id == habit_id).first()
    if not h:
        raise HTTPException(status_code=404, detail="习惯不存在")
    
    freq_map = {
        "daily": HabitFrequency.DAILY,
        "weekdays": HabitFrequency.WEEKDAYS,
        "weekends": HabitFrequency.WEEKENDS,
        "custom": HabitFrequency.CUSTOM,
        "flexible": HabitFrequency.FLEXIBLE,
    }
    
    h.name = habit.name
    h.icon = habit.icon
    h.color = habit.color
    h.frequency_type = freq_map.get(habit.frequency_type, HabitFrequency.DAILY)
    h.weekly_target = habit.weekly_target
    h.times_per_day = habit.times_per_day
    h.custom_schedule = habit.custom_schedule
    h.allow_overflow = habit.allow_overflow
    
    db.commit()
    db.refresh(h)
    return {"id": h.id, "name": h.name}

@app.delete("/api/habits/{habit_id}")
def delete_habit_api(habit_id: int, db: Session = Depends(get_db)):
    """删除习惯"""
    h = db.query(models.Habit).filter(models.Habit.id == habit_id).first()
    if not h:
        raise HTTPException(status_code=404, detail="习惯不存在")
    
    db.delete(h)
    db.commit()
    return {"message": "习惯已删除"}


# ==================== 项目目标 API ====================
class ProjectGoalCreateRequest(BaseModel):
    title: str
    description: Optional[str] = None
    sort_order: int = 0


class ProjectGoalUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    is_completed: Optional[bool] = None
    sort_order: Optional[int] = None


def _update_project_progress(db: Session, project_id: int):
    """根据目标完成情况更新项目进度"""
    goals = db.query(models.ProjectGoal).filter(
        models.ProjectGoal.project_id == project_id
    ).all()
    
    if not goals:
        progress = 0.0
    else:
        completed = sum(1 for g in goals if g.is_completed)
        progress = (completed / len(goals)) * 100
    
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if project:
        project.progress = progress
        db.commit()


@app.get("/api/projects/{project_id}/goals")
def list_project_goals(project_id: int, db: Session = Depends(get_db)):
    """获取项目的目标列表"""
    goals = db.query(models.ProjectGoal).filter(
        models.ProjectGoal.project_id == project_id
    ).order_by(models.ProjectGoal.sort_order, models.ProjectGoal.created_at).all()
    
    return [{
        "id": g.id,
        "project_id": g.project_id,
        "title": g.title,
        "description": g.description,
        "is_completed": g.is_completed,
        "completed_at": g.completed_at.isoformat() if g.completed_at else None,
        "sort_order": g.sort_order,
        "created_at": g.created_at.isoformat() if g.created_at else None,
    } for g in goals]


@app.post("/api/projects/{project_id}/goals")
def create_project_goal(
    project_id: int, 
    req: ProjectGoalCreateRequest, 
    db: Session = Depends(get_db)
):
    """创建项目目标"""
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    
    goal = models.ProjectGoal(
        project_id=project_id,
        user_id=1,  # 默认用户
        title=req.title,
        description=req.description,
        sort_order=req.sort_order,
        is_completed=False
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    
    # 更新项目进度
    _update_project_progress(db, project_id)
    
    return {
        "id": goal.id,
        "project_id": goal.project_id,
        "title": goal.title,
        "description": goal.description,
        "is_completed": goal.is_completed,
        "sort_order": goal.sort_order,
    }


@app.put("/api/projects/{project_id}/goals/{goal_id}")
def update_project_goal(
    project_id: int,
    goal_id: int,
    req: ProjectGoalUpdateRequest,
    db: Session = Depends(get_db)
):
    """更新项目目标"""
    goal = db.query(models.ProjectGoal).filter(
        models.ProjectGoal.id == goal_id,
        models.ProjectGoal.project_id == project_id
    ).first()
    
    if not goal:
        raise HTTPException(status_code=404, detail="目标不存在")
    
    # 更新字段
    if req.title is not None:
        goal.title = req.title
    if req.description is not None:
        goal.description = req.description
    if req.sort_order is not None:
        goal.sort_order = req.sort_order
    if req.is_completed is not None:
        goal.is_completed = req.is_completed
        goal.completed_at = datetime.now() if req.is_completed else None
    
    db.commit()
    db.refresh(goal)
    
    # 更新项目进度
    _update_project_progress(db, project_id)
    
    return {
        "id": goal.id,
        "project_id": goal.project_id,
        "title": goal.title,
        "description": goal.description,
        "is_completed": goal.is_completed,
        "completed_at": goal.completed_at.isoformat() if goal.completed_at else None,
        "sort_order": goal.sort_order,
    }


@app.delete("/api/projects/{project_id}/goals/{goal_id}")
def delete_project_goal(
    project_id: int,
    goal_id: int,
    db: Session = Depends(get_db)
):
    """删除项目目标"""
    goal = db.query(models.ProjectGoal).filter(
        models.ProjectGoal.id == goal_id,
        models.ProjectGoal.project_id == project_id
    ).first()
    
    if not goal:
        raise HTTPException(status_code=404, detail="目标不存在")
    
    db.delete(goal)
    db.commit()
    
    # 更新项目进度
    _update_project_progress(db, project_id)
    
    return {"message": "目标已删除"}


@app.post("/api/projects/{project_id}/goals/{goal_id}/toggle")
def toggle_project_goal(
    project_id: int,
    goal_id: int,
    db: Session = Depends(get_db)
):
    """切换目标完成状态"""
    goal = db.query(models.ProjectGoal).filter(
        models.ProjectGoal.id == goal_id,
        models.ProjectGoal.project_id == project_id
    ).first()
    
    if not goal:
        raise HTTPException(status_code=404, detail="目标不存在")
    
    goal.is_completed = not goal.is_completed
    goal.completed_at = datetime.now() if goal.is_completed else None
    
    db.commit()
    db.refresh(goal)
    
    # 更新项目进度
    _update_project_progress(db, project_id)
    
    return {
        "id": goal.id,
        "is_completed": goal.is_completed,
        "completed_at": goal.completed_at.isoformat() if goal.completed_at else None,
    }


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
                hashed_password=simple_hash("admin123"),
                is_active=True
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            print("[INIT] 创建默认用户: admin / admin123")
        
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
    finally:
        db.close()

@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    init_default_data()
    print("[START] LifeFlow 启动成功！")
    print("[URL] 前端: http://localhost:3000")
    print("[URL] 后端: http://127.0.0.1:8000")
