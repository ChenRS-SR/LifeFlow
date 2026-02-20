"""
项目数据模型
"""
from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional
from app.models.project import ProjectStatus


class ProjectBase(BaseModel):
    """项目基础模型"""
    title: str
    description: Optional[str] = None
    goal_id: Optional[int] = None
    start_date: Optional[date] = None
    target_date: Optional[date] = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[ProjectStatus] = None
    target_date: Optional[date] = None
    completed_date: Optional[date] = None


class Project(ProjectBase):
    """项目完整模型"""
    id: int
    user_id: int
    status: ProjectStatus
    completed_date: Optional[date]
    created_at: datetime
    
    class Config:
        from_attributes = True
