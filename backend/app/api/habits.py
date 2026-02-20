"""
习惯追踪 API

习惯的增删改查和每日打卡
"""
from typing import Any, List, Optional
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from app.api.deps import get_db, get_current_active_user
from app import models, schemas

router = APIRouter(prefix="/habits", tags=["习惯追踪"])


@router.get("/", response_model=List[schemas.Habit])
def list_habits(
    is_active: Optional[bool] = True,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    获取习惯列表
    
    参数：is_active - 是否只显示活跃的习惯（默认 True）
    """
    query = db.query(models.Habit).filter(models.Habit.user_id == current_user.id)
    
    if is_active is not None:
        query = query.filter(models.Habit.is_active == is_active)
    
    habits = query.order_by(models.Habit.created_at.desc()).all()
    return habits


@router.post("/", response_model=schemas.Habit, status_code=status.HTTP_201_CREATED)
def create_habit(
    habit_in: schemas.HabitCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    创建新习惯
    
    示例：
        POST /habits/
        {
            "name": "早起",
            "description": "早上6点前起床",
            "icon": "🌅",
            "color": "#F59E0B",
            "frequency": "daily",
            "target_times": 1
        }
    """
    db_habit = models.Habit(
        user_id=current_user.id,
        **habit_in.model_dump()
    )
    db.add(db_habit)
    db.commit()
    db.refresh(db_habit)
    return db_habit


@router.get("/{habit_id}", response_model=schemas.Habit)
def get_habit(
    habit_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """获取习惯详情"""
    habit = db.query(models.Habit).filter(
        models.Habit.id == habit_id,
        models.Habit.user_id == current_user.id
    ).first()
    
    if not habit:
        raise HTTPException(status_code=404, detail="习惯不存在")
    
    return habit


@router.put("/{habit_id}", response_model=schemas.Habit)
def update_habit(
    habit_id: int,
    habit_in: schemas.HabitUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """更新习惯"""
    habit = db.query(models.Habit).filter(
        models.Habit.id == habit_id,
        models.Habit.user_id == current_user.id
    ).first()
    
    if not habit:
        raise HTTPException(status_code=404, detail="习惯不存在")
    
    for field, value in habit_in.model_dump(exclude_unset=True).items():
        setattr(habit, field, value)
    
    db.commit()
    db.refresh(habit)
    return habit


@router.delete("/{habit_id}")
def delete_habit(
    habit_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """删除习惯"""
    habit = db.query(models.Habit).filter(
        models.Habit.id == habit_id,
        models.Habit.user_id == current_user.id
    ).first()
    
    if not habit:
        raise HTTPException(status_code=404, detail="习惯不存在")
    
    db.delete(habit)
    db.commit()
    
    return {"message": "习惯已删除"}


# ========== 打卡相关 API ==========

@router.get("/today/check", response_model=List[dict])
def get_today_check_status(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    获取今日所有习惯的打卡状态
    
    返回每个习惯的今日打卡次数
    """
    today = date.today()
    
    habits = db.query(models.Habit).filter(
        models.Habit.user_id == current_user.id,
        models.Habit.is_active == True
    ).all()
    
    result = []
    for habit in habits:
        log = db.query(models.HabitLog).filter(
            models.HabitLog.habit_id == habit.id,
            models.HabitLog.date == today
        ).first()
        
        result.append({
            "habit": schemas.Habit.model_validate(habit),
            "today_count": log.count if log else 0,
            "is_completed_today": (log.count >= habit.target_times) if log else False
        })
    
    return result


@router.post("/{habit_id}/check", response_model=schemas.HabitLog)
def check_in_habit(
    habit_id: int,
    note: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    习惯打卡
    
    如果今天已经打卡，则增加计数
    """
    today = date.today()
    
    # 验证习惯存在
    habit = db.query(models.Habit).filter(
        models.Habit.id == habit_id,
        models.Habit.user_id == current_user.id
    ).first()
    
    if not habit:
        raise HTTPException(status_code=404, detail="习惯不存在")
    
    # 查找今日记录
    log = db.query(models.HabitLog).filter(
        models.HabitLog.habit_id == habit_id,
        models.HabitLog.date == today
    ).first()
    
    if log:
        # 已存在则增加计数
        log.count += 1
        if note:
            log.note = note
    else:
        # 创建新记录
        log = models.HabitLog(
            habit_id=habit_id,
            user_id=current_user.id,
            date=today,
            count=1,
            note=note
        )
        db.add(log)
    
    db.commit()
    db.refresh(log)
    return log


@router.get("/{habit_id}/stats", response_model=dict)
def get_habit_stats(
    habit_id: int,
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    获取习惯统计数据
    
    返回：
    - 最近 N 天的打卡记录
    - 连续打卡天数
    - 总打卡次数
    """
    habit = db.query(models.Habit).filter(
        models.Habit.id == habit_id,
        models.Habit.user_id == current_user.id
    ).first()
    
    if not habit:
        raise HTTPException(status_code=404, detail="习惯不存在")
    
    # 获取最近 N 天的记录
    start_date = date.today() - timedelta(days=days)
    logs = db.query(models.HabitLog).filter(
        models.HabitLog.habit_id == habit_id,
        models.HabitLog.date >= start_date
    ).order_by(models.HabitLog.date.desc()).all()
    
    # 计算总打卡次数
    total_checkins = sum(log.count for log in logs)
    
    # 计算连续打卡天数
    current_streak = 0
    check_date = date.today()
    
    # 如果今天还没打卡，从昨天开始算
    today_log = next((log for log in logs if log.date == date.today()), None)
    if not today_log or today_log.count < habit.target_times:
        check_date = date.today() - timedelta(days=1)
    
    # 倒推计算连续天数
    while True:
        log = next((l for l in logs if l.date == check_date), None)
        if log and log.count >= habit.target_times:
            current_streak += 1
            check_date -= timedelta(days=1)
        else:
            break
    
    return {
        "habit": schemas.Habit.model_validate(habit),
        "total_checkins": total_checkins,
        "current_streak": current_streak,
        "recent_logs": [schemas.HabitLog.model_validate(log) for log in logs[:7]]
    }
