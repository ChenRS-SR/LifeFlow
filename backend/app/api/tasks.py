"""
任务管理 API

任务的增删改查、多视图过滤、周历、统计
"""
from typing import Optional
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_active_user
from app import models
from app.models.task import TaskType, TaskStatus, TaskPriority

router = APIRouter(prefix="/tasks", tags=["任务管理"])


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


class CompleteTaskRequest(BaseModel):
    actual_pomodoros: Optional[int] = None


def _parse_date(date_str: Optional[str]) -> Optional[date]:
    """将日期字符串转为 Python date 对象"""
    if not date_str:
        return None
    try:
        return date.fromisoformat(date_str)
    except ValueError:
        return None


@router.get("/")
def list_tasks(
    view: str = Query("all"),  # all/today/week/overdue/inbox/todo/completed
    year: Optional[int] = Query(None),
    week: Optional[int] = Query(None),
    current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)
):
    """获取任务列表（支持多视图）"""
    today = date.today()
    query = db.query(models.Task).filter(models.Task.user_id == current_user.id)

    if view == "inbox":
        # 收件箱：未分类的任务（task_type=inbox 且未完成的）
        query = query.filter(models.Task.task_type == TaskType.INBOX, models.Task.status != TaskStatus.COMPLETED)
    elif view == "today":
        # 今天待办：计划今天做 或 截止今天 或 已逾期，且未完成、非垃圾箱
        query = query.filter(
            models.Task.status != TaskStatus.COMPLETED,
            models.Task.task_type != TaskType.TRASH,
            models.Task.is_inbox == 0,
            ((models.Task.scheduled_date == today) |
             (models.Task.due_date == today) |
             ((models.Task.due_date < today) & (models.Task.due_date != None)))
        )
    elif view == "today_completed":
        # 今天已完成：完成日期为今天
        query = query.filter(
            models.Task.status == TaskStatus.COMPLETED,
            models.Task.completed_date == today
        )
    elif view == "week":
        # 本周：计划/截止日期在本周，或完成日期在本周（方案 B：本周活跃过的任务）
        week_year = year or today.year
        week_num = week or today.isocalendar()[1]
        from datetime import datetime as dt
        week_start = dt.strptime(f'{week_year}-W{week_num}-1', '%G-W%V-%u').date()
        week_end = week_start + timedelta(days=6)
        query = query.filter(
            models.Task.is_inbox == 0,
            models.Task.task_type != TaskType.TRASH,
            (
                ((models.Task.due_date >= week_start) & (models.Task.due_date <= week_end)) |
                ((models.Task.scheduled_date >= week_start) & (models.Task.scheduled_date <= week_end)) |
                ((models.Task.completed_date >= week_start) & (models.Task.completed_date <= week_end))
            )
        )
    elif view == "overdue":
        # 已逾期：截止日期已过且未完成、非垃圾箱
        query = query.filter(
            models.Task.status != TaskStatus.COMPLETED,
            models.Task.task_type != TaskType.TRASH,
            models.Task.due_date < today,
            models.Task.due_date != None
        )
    elif view == "todo":
        # 待办清单：已整理且未完成的任务
        query = query.filter(
            models.Task.status != TaskStatus.COMPLETED,
            models.Task.is_inbox == 0
        )
    elif view == "someday":
        # 将来也许：task_type=someday 且未完成的
        query = query.filter(
            models.Task.task_type == TaskType.SOMEDAY,
            models.Task.status != TaskStatus.COMPLETED
        )
    elif view == "trash":
        # 垃圾箱：task_type=trash
        query = query.filter(models.Task.task_type == TaskType.TRASH)
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
        "completed_date": t.completed_date.isoformat() if t.completed_date else None,
        "created_at": t.created_at.isoformat() if t.created_at else None
    } for t in tasks]


@router.get("/week-calendar")
def get_week_calendar(
    year: int = Query(None),
    week: int = Query(None),
    current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)
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
            models.Task.user_id == current_user.id,
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


@router.get("/stats")
def get_task_stats(current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    """获取任务统计（用于已完成视图）"""
    today = date.today()
    week_start = today - timedelta(days=today.weekday())

    # 本周完成任务数
    week_completed = db.query(models.Task).filter(
        models.Task.user_id == current_user.id,
        models.Task.status == TaskStatus.COMPLETED,
        models.Task.completed_at >= week_start
    ).count()

    # 按项目统计
    project_stats = db.query(
        models.Task.project_id,
        func.count(models.Task.id).label("count")
    ).filter(
        models.Task.user_id == current_user.id,
        models.Task.status == TaskStatus.COMPLETED
    ).group_by(models.Task.project_id).all()

    # 按优先级统计
    priority_stats = db.query(
        models.Task.priority,
        func.count(models.Task.id).label("count")
    ).filter(
        models.Task.user_id == current_user.id,
        models.Task.status == TaskStatus.COMPLETED
    ).group_by(models.Task.priority).all()

    return {
        "week_completed": week_completed,
        "project_stats": [{"project_id": p[0], "count": p[1]} for p in project_stats],
        "priority_stats": [{"priority": p[0].value, "count": p[1]} for p in priority_stats]
    }


@router.post("/")
def create_task(task: TaskCreate, current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    """创建任务"""
    priority_map = {1: TaskPriority.LOW, 2: TaskPriority.MEDIUM, 3: TaskPriority.HIGH, 4: TaskPriority.URGENT}
    task_priority = priority_map.get(task.priority, TaskPriority.MEDIUM)

    # 处理 scheduled_type 到具体日期
    scheduled_date = _parse_date(task.scheduled_date)
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
        user_id=current_user.id,
        title=task.title,
        description=task.description,
        task_type=TaskType(task.task_type) if task.task_type else TaskType.INBOX,
        status=TaskStatus.PENDING,
        priority=task_priority,
        due_date=_parse_date(task.due_date),
        scheduled_date=scheduled_date,
        scheduled_type=task.scheduled_type,
        estimated_pomodoros=task.estimated_pomodoros,
        project_id=task.project_id,
        is_inbox=1 if task.task_type == 'inbox' else 0
    )
    db.add(db_task)
    db.commit()
    db.refresh(db_task)

    return {
        "id": db_task.id,
        "title": db_task.title,
        "status": db_task.status.value
    }


@router.put("/{task_id}")
def update_task(
    task_id: int,
    data: dict,
    current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)
):
    """更新任务"""
    t = db.query(models.Task).filter(
        models.Task.id == task_id,
        models.Task.user_id == current_user.id
    ).first()
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
        # 状态变更时同步更新完成时间和完成日期
        if new_status == "completed" and not t.completed_at:
            t.completed_at = datetime.utcnow()
            t.completed_date = date.today()
        elif new_status != "completed":
            t.completed_at = None
            t.completed_date = None
    if 'priority' in data and data['priority'] is not None:
        t.priority = priority_map.get(data['priority'], TaskPriority.MEDIUM)
    if 'due_date' in data:
        t.due_date = _parse_date(data['due_date'])
    if 'scheduled_date' in data:
        t.scheduled_date = _parse_date(data['scheduled_date'])
    if 'estimated_pomodoros' in data:
        t.estimated_pomodoros = data['estimated_pomodoros']
    if 'actual_pomodoros' in data:
        t.actual_pomodoros = data['actual_pomodoros']
    if 'project_id' in data:
        t.project_id = data['project_id']
    if 'task_type' in data and data['task_type']:
        t.task_type = TaskType(data['task_type'])
        # 同步更新 is_inbox 字段
        t.is_inbox = 1 if data['task_type'] == 'inbox' else 0

    db.commit()
    db.refresh(t)
    return {
        "id": t.id,
        "title": t.title,
        "status": t.status.value,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        "completed_date": t.completed_date.isoformat() if t.completed_date else None
    }


@router.post("/{task_id}/complete")
def complete_task(
    task_id: int,
    data: Optional[CompleteTaskRequest] = None,
    current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)
):
    """完成任务/取消完成任务"""
    t = db.query(models.Task).filter(
        models.Task.id == task_id,
        models.Task.user_id == current_user.id
    ).first()
    if not t:
        raise HTTPException(status_code=404, detail="任务不存在")

    today = date.today()

    if t.status == TaskStatus.COMPLETED:
        # 已完成的任务取消完成
        t.status = TaskStatus.PENDING
        t.completed_at = None
        t.completed_date = None
        t.actual_pomodoros = None
    else:
        # 完成任务
        t.status = TaskStatus.COMPLETED
        t.completed_at = datetime.utcnow()
        t.completed_date = today
        if data and data.actual_pomodoros is not None:
            t.actual_pomodoros = data.actual_pomodoros

    db.commit()

    return {
        "id": t.id,
        "status": t.status.value,
        "actual_pomodoros": t.actual_pomodoros,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        "completed_date": t.completed_date.isoformat() if t.completed_date else None
    }


@router.delete("/{task_id}")
def delete_task(task_id: int, current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    """删除任务"""
    t = db.query(models.Task).filter(
        models.Task.id == task_id,
        models.Task.user_id == current_user.id
    ).first()
    if not t:
        raise HTTPException(status_code=404, detail="任务不存在")

    db.delete(t)
    db.commit()
    return {"message": "任务已删除"}
