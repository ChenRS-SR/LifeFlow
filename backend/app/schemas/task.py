"""
任务数据模型
"""
from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional
from app.models.task import TaskType, TaskStatus, TaskPriority


class TaskBase(BaseModel):
    """任务基础模型"""
    title: str
    description: Optional[str] = None
    task_type: TaskType = TaskType.INBOX
    project_id: Optional[int] = None
    goal_id: Optional[int] = None
    priority: TaskPriority = TaskPriority.MEDIUM
    due_date: Optional[date] = None
    scheduled_date: Optional[date] = None
    estimated_minutes: Optional[int] = None


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    due_date: Optional[date] = None
    scheduled_date: Optional[date] = None


class Task(TaskBase):
    """任务完整模型"""
    id: int
    user_id: int
    status: TaskStatus
    completed_at: Optional[datetime]
    created_at: datetime
    
    class Config:
        from_attributes = True
