"""
任务管理 API

任务（关联目标）和待办（琐事）的增删改查
"""
from typing import Any, List, Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.api.deps import get_db, get_current_active_user
from app import models, schemas

router = APIRouter(prefix="/tasks", tags=["任务管理"])


@router.get("/", response_model=List[schemas.Task])
def list_tasks(
    status: Optional[models.TaskStatus] = None,
    task_type: Optional[models.TaskType] = None,
    scheduled_date: Optional[date] = None,
    goal_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    获取任务列表
    
    可筛选：status（状态）、task_type（类型）、scheduled_date（计划日期）、goal_id（目标ID）
    """
    query = db.query(models.Task).filter(models.Task.user_id == current_user.id)
    
    if status:
        query = query.filter(models.Task.status == status)
    if task_type:
        query = query.filter(models.Task.task_type == task_type)
    if scheduled_date:
        query = query.filter(models.Task.scheduled_date == scheduled_date)
    if goal_id:
        query = query.filter(models.Task.goal_id == goal_id)
    
    tasks = query.order_by(
        models.Task.priority.desc(),
        models.Task.due_date.asc()
    ).all()
    
    return tasks


@router.get("/today", response_model=List[schemas.Task])
def get_today_tasks(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    获取今日任务
    
    包括：
    - 计划在今天执行的任务
    - 截止日期是今天或之前的未完成事项
    """
    today = date.today()
    
    tasks = db.query(models.Task).filter(
        models.Task.user_id == current_user.id,
        or_(
            models.Task.scheduled_date == today,
            models.Task.due_date <= today
        ),
        models.Task.status != models.TaskStatus.COMPLETED
    ).order_by(models.Task.priority.desc()).all()
    
    return tasks


@router.post("/", response_model=schemas.Task, status_code=status.HTTP_201_CREATED)
def create_task(
    task_in: schemas.TaskCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    创建新任务
    
    示例：
        POST /tasks/
        {
            "title": "学习 FastAPI",
            "description": "阅读官方文档",
            "task_type": "task",
            "goal_id": 1,
            "priority": "high",
            "scheduled_date": "2026-02-20"
        }
    """
    db_task = models.Task(
        user_id=current_user.id,
        **task_in.model_dump()
    )
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task


@router.get("/{task_id}", response_model=schemas.Task)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """获取单个任务详情"""
    task = db.query(models.Task).filter(
        models.Task.id == task_id,
        models.Task.user_id == current_user.id
    ).first()
    
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    return task


@router.put("/{task_id}", response_model=schemas.Task)
def update_task(
    task_id: int,
    task_in: schemas.TaskUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """更新任务"""
    task = db.query(models.Task).filter(
        models.Task.id == task_id,
        models.Task.user_id == current_user.id
    ).first()
    
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    # 更新字段
    for field, value in task_in.model_dump(exclude_unset=True).items():
        setattr(task, field, value)
    
    db.commit()
    db.refresh(task)
    return task


@router.post("/{task_id}/complete", response_model=schemas.Task)
def complete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """完成任务"""
    from datetime import datetime
    
    task = db.query(models.Task).filter(
        models.Task.id == task_id,
        models.Task.user_id == current_user.id
    ).first()
    
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    task.status = models.TaskStatus.COMPLETED
    task.completed_at = datetime.utcnow()
    
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}")
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """删除任务"""
    task = db.query(models.Task).filter(
        models.Task.id == task_id,
        models.Task.user_id == current_user.id
    ).first()
    
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    db.delete(task)
    db.commit()
    
    return {"message": "任务已删除"}
