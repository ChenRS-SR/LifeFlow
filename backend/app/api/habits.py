"""
习惯追踪 API

习惯的增删改查和每日打卡
"""
from typing import Optional, List
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_active_user
from app import models
from app.models.habit import HabitFrequency

router = APIRouter(prefix="/habits", tags=["习惯追踪"])


class HabitToggleRequest(BaseModel):
    habit_id: int
    date: str
    count: Optional[int] = None


class HabitCreateRequest(BaseModel):
    name: str
    icon: Optional[str] = "✅"
    color: Optional[str] = "#3B82F6"
    frequency_type: str = "daily"
    weekly_target: int = 7
    times_per_day: int = 1
    custom_schedule: Optional[list] = None
    allow_overflow: bool = False


@router.get("/")
def list_habits(current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    habits = db.query(models.Habit).filter(
        models.Habit.user_id == current_user.id,
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


@router.get("/week")
def get_habits_week(year: int = Query(None), week: int = Query(None), current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    if year is None or week is None:
        today = date.today()
        year, week, _ = today.isocalendar()

    from datetime import datetime as dt
    week_start = dt.strptime(f'{year}-W{week}-1', '%G-W%V-%u').date()
    week_dates = [week_start + timedelta(days=i) for i in range(7)]

    habits = db.query(models.Habit).filter(
        models.Habit.user_id == current_user.id,
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
            daily_target = habit.times_per_day
            log = next((l for l in logs if l.date == d), None)
            actual = log.count if log else 0
            total_actual += actual

            week_status.append({
                "date": d.isoformat(),
                "weekday": d.weekday(),
                "target": daily_target,
                "actual": actual,
                "completed": (actual >= daily_target) if target > 0 else False,
            })

        weekly_target = habit.get_weekly_target_total()
        if habit.frequency_type == HabitFrequency.FLEXIBLE:
            # 灵活模式：完成次数 / 目标次数，超过100%显示超额
            raw_rate = round((total_actual / weekly_target * 100) if weekly_target > 0 else 0)
            weekly_rate = min(raw_rate, 100)  # 显示最多100%
        else:
            # 固定模式：完成天数 / 计划天数
            # 当天需要实际完成次数 >= 目标次数才算完成一天
            completed_days = sum(1 for s in week_status if s["completed"])
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


@router.post("/toggle")
def toggle_habit(data: HabitToggleRequest, current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    """习惯打卡/取消打卡"""
    habit = db.query(models.Habit).filter(
        models.Habit.user_id == current_user.id,
        models.Habit.id == data.habit_id
    ).first()
    if not habit:
        raise HTTPException(status_code=404, detail="习惯不存在")

    toggle_date = date.fromisoformat(data.date)

    # 查找现有记录
    log = db.query(models.HabitLog).filter(
        models.HabitLog.habit_id == data.habit_id,
        models.HabitLog.date == toggle_date
    ).first()

    target = habit.times_per_day

    if data.count is not None:
        # 直接设置次数
        new_count = data.count
    else:
        # 智能 toggle：当前次数 >= 目标则取消，否则 +1
        current = log.count if log else 0
        if current >= target:
            new_count = 0
        else:
            new_count = current + 1

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
    return {"success": True, "count": new_count, "target": target, "completed": new_count >= target}


@router.post("/")
def create_habit_api(habit: HabitCreateRequest, current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    """创建习惯"""
    freq_map = {
        "daily": HabitFrequency.DAILY,
        "weekdays": HabitFrequency.WEEKDAYS,
        "weekends": HabitFrequency.WEEKENDS,
        "custom": HabitFrequency.CUSTOM,
        "flexible": HabitFrequency.FLEXIBLE,
    }

    db_habit = models.Habit(
        user_id=current_user.id,
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


@router.put("/{habit_id}")
def update_habit_api(
    habit_id: int,
    habit: HabitCreateRequest,
    current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)
):
    """更新习惯"""
    h = db.query(models.Habit).filter(
        models.Habit.id == habit_id,
        models.Habit.user_id == current_user.id
    ).first()
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


@router.delete("/{habit_id}")
def delete_habit_api(habit_id: int, current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    """删除习惯"""
    h = db.query(models.Habit).filter(
        models.Habit.id == habit_id,
        models.Habit.user_id == current_user.id
    ).first()
    if not h:
        raise HTTPException(status_code=404, detail="习惯不存在")

    db.delete(h)
    db.commit()
    return {"message": "习惯已删除"}
