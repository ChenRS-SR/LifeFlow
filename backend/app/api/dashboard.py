"""
仪表盘 API

汇总各项数据，用于首页展示
"""
from typing import Any, Dict
from datetime import date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_active_user
from app import models
from app.models.task import TaskStatus, TaskType
from app.models.project import ProjectStatus
from app.models.goal import GoalStatus

router = APIRouter(prefix="/dashboard", tags=["仪表盘"])


@router.get("/stats")
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
) -> Dict[str, Any]:
    """
    获取仪表盘统计数据

    与前端 Dashboard.tsx 期望的数据结构保持一致
    """
    today = date.today()
    week_start = today - timedelta(days=today.weekday())

    # 1. 今日待办任务（计划今天做 或 截止今天 或 已逾期）
    today_pending = db.query(models.Task).filter(
        models.Task.user_id == current_user.id,
        models.Task.status != TaskStatus.COMPLETED,
        models.Task.is_inbox == 0,
        ((models.Task.scheduled_date == today) |
         (models.Task.due_date == today) |
         ((models.Task.due_date < today) & (models.Task.due_date != None)))
    ).count()

    # 2. 今日已完成任务（完成日期为今天）
    today_completed = db.query(models.Task).filter(
        models.Task.user_id == current_user.id,
        models.Task.status == TaskStatus.COMPLETED,
        models.Task.completed_date == today
    ).count()

    # 3. 逾期任务总数
    overdue_count = db.query(models.Task).filter(
        models.Task.user_id == current_user.id,
        models.Task.status != TaskStatus.COMPLETED,
        models.Task.task_type != TaskType.TRASH,
        models.Task.due_date < today,
        models.Task.due_date != None
    ).count()

    # 4. 收集箱未整理任务
    inbox_count = db.query(models.Task).filter(
        models.Task.user_id == current_user.id,
        models.Task.task_type == TaskType.INBOX,
        models.Task.status != TaskStatus.COMPLETED
    ).count()

    # 5. 本周数据
    week_end = week_start + timedelta(days=6)
    week_tasks_completed = db.query(models.Task).filter(
        models.Task.user_id == current_user.id,
        models.Task.status == TaskStatus.COMPLETED,
        models.Task.completed_date >= week_start
    ).count()

    week_tasks_total = db.query(models.Task).filter(
        models.Task.user_id == current_user.id,
        models.Task.task_type != TaskType.TRASH,
        models.Task.is_inbox == 0,
        ((models.Task.scheduled_date >= week_start) & (models.Task.scheduled_date <= week_end)) |
        ((models.Task.due_date >= week_start) & (models.Task.due_date <= week_end)) |
        ((models.Task.completed_date >= week_start) & (models.Task.completed_date <= week_end))
    ).count()

    # 6. 活跃目标数
    active_goals = db.query(models.Goal).filter(
        models.Goal.user_id == current_user.id,
        models.Goal.status == GoalStatus.ACTIVE
    ).count()

    # 7. 习惯统计
    habits = db.query(models.Habit).filter(
        models.Habit.user_id == current_user.id,
        models.Habit.is_active == True,
        models.Habit.is_archived == False
    ).all()
    total_habits = len(habits)
    habit_map = {h.id: h for h in habits}

    # 8. 今日习惯打卡情况
    today_habit_logs = db.query(models.HabitLog).filter(
        models.HabitLog.user_id == current_user.id,
        models.HabitLog.date == today
    ).all()
    completed_habits = sum(
        1 for log in today_habit_logs
        if log.habit_id in habit_map and log.count >= habit_map[log.habit_id].times_per_day
    )

    # 9. 项目列表（带进度）
    projects = db.query(models.Project).filter(
        models.Project.user_id == current_user.id,
        models.Project.status.in_([ProjectStatus.ACTIVE, ProjectStatus.PLANNING])
    ).order_by(models.Project.progress.desc()).limit(5).all()

    project_list = [{
        "id": p.id,
        "name": p.name,
        "progress": round(p.progress, 1),
        "status": p.status.value
    } for p in projects]

    # 10. 今日 Top 任务
    top_tasks = db.query(models.Task).filter(
        models.Task.user_id == current_user.id,
        models.Task.status != TaskStatus.COMPLETED,
        models.Task.is_inbox == 0,
        ((models.Task.scheduled_date == today) | (models.Task.due_date == today))
    ).order_by(
        models.Task.priority.desc(),
        models.Task.created_at.desc()
    ).limit(3).all()

    top_task_list = [{
        "id": t.id,
        "title": t.title,
        "priority": t.priority.value if hasattr(t.priority, 'value') else str(t.priority),
        "due_date": t.due_date.isoformat() if t.due_date else None
    } for t in top_tasks]

    return {
        "today": {
            "pending": today_pending,
            "completed": today_completed,
            "overdue": overdue_count,
            "inbox": inbox_count
        },
        "week": {
            "total": week_tasks_total,
            "completed": week_tasks_completed,
            "progress": round((week_tasks_completed / week_tasks_total * 100), 1) if week_tasks_total > 0 else 0
        },
        "goals": {
            "active": active_goals
        },
        "habits": {
            "total": total_habits,
            "completed": completed_habits
        },
        "projects": project_list,
        "top_tasks": top_task_list,
        "heatmap": []
    }
