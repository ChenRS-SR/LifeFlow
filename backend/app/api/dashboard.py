"""
仪表盘 API

汇总各项数据，用于首页展示
"""
from typing import Any, Dict
from datetime import date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from app.api.deps import get_db, get_current_active_user
from app import models, schemas

router = APIRouter(prefix="/dashboard", tags=["仪表盘"])


@router.get("/stats")
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
) -> Dict[str, Any]:
    """
    获取仪表盘统计数据
    
    包括：
    - 今日待办数量
    - 进行中的目标数量
    - 活跃习惯数量
    - 今日打卡情况
    - 任务完成情况统计
    """
    today = date.today()
    
    # 今日待办
    today_tasks = db.query(models.Task).filter(
        models.Task.user_id == current_user.id,
        models.Task.scheduled_date == today,
        models.Task.status != models.TaskStatus.COMPLETED
    ).count()
    
    # 进行中目标
    active_goals = db.query(models.Goal).filter(
        models.Goal.user_id == current_user.id,
        models.Goal.status == models.GoalStatus.ACTIVE
    ).count()
    
    # 活跃习惯
    active_habits = db.query(models.Habit).filter(
        models.Habit.user_id == current_user.id,
        models.Habit.is_active == True
    ).count()
    
    # 今日打卡情况
    habits = db.query(models.Habit).filter(
        models.Habit.user_id == current_user.id,
        models.Habit.is_active == True
    ).all()
    
    completed_habits = 0
    for habit in habits:
        log = db.query(models.HabitLog).filter(
            models.HabitLog.habit_id == habit.id,
            models.HabitLog.date == today
        ).first()
        if log and log.count >= habit.target_times:
            completed_habits += 1
    
    # 本周任务完成情况
    week_start = today - timedelta(days=today.weekday())
    week_tasks_total = db.query(models.Task).filter(
        models.Task.user_id == current_user.id,
        models.Task.created_at >= week_start
    ).count()
    
    week_tasks_completed = db.query(models.Task).filter(
        models.Task.user_id == current_user.id,
        models.Task.status == models.TaskStatus.COMPLETED,
        models.Task.completed_at >= week_start
    ).count()
    
    # 近7天打卡热力图数据
    heatmap_data = []
    for i in range(6, -1, -1):
        check_date = today - timedelta(days=i)
        
        # 计算当天的总打卡次数
        total_checks = db.query(func.sum(models.HabitLog.count)).filter(
            models.HabitLog.user_id == current_user.id,
            models.HabitLog.date == check_date
        ).scalar() or 0
        
        heatmap_data.append({
            "date": check_date.isoformat(),
            "count": int(total_checks)
        })
    
    return {
        "today": {
            "tasks_count": today_tasks,
            "completed_habits": completed_habits,
            "total_habits": len(habits)
        },
        "overview": {
            "active_goals": active_goals,
            "active_habits": active_habits,
            "week_tasks_total": week_tasks_total,
            "week_tasks_completed": week_tasks_completed
        },
        "heatmap": heatmap_data
    }
