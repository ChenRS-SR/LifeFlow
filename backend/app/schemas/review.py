"""
复盘数据模型
"""
from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional
from app.models.review import ReviewPeriod


class ReviewBase(BaseModel):
    """复盘基础模型"""
    period: ReviewPeriod
    year: int
    quarter: Optional[int] = None
    month: Optional[int] = None
    week: Optional[int] = None
    date: Optional[date] = None
    
    # 复盘内容 - 日复盘
    highlights: Optional[str] = None
    challenges: Optional[str] = None
    learnings: Optional[str] = None
    next_steps: Optional[str] = None
    gratitude: Optional[str] = None
    mood: Optional[int] = None  # 1-10
    
    # 周复盘 - KPT模板
    keep: Optional[str] = None
    problem: Optional[str] = None
    try_: Optional[str] = None  # 使用 try_ 避免 Python 关键字冲突
    
    # 月/季度/年度复盘 - ORID模板
    objective_summary: Optional[str] = None
    reflective_summary: Optional[str] = None
    interpretive_summary: Optional[str] = None
    decisional_summary: Optional[str] = None


class ReviewCreate(ReviewBase):
    pass


class ReviewUpdate(BaseModel):
    # 日复盘
    highlights: Optional[str] = None
    challenges: Optional[str] = None
    learnings: Optional[str] = None
    next_steps: Optional[str] = None
    gratitude: Optional[str] = None
    mood: Optional[int] = None
    
    # 周复盘 - KPT
    keep: Optional[str] = None
    problem: Optional[str] = None
    try_: Optional[str] = None
    
    # 月/季度/年度 - ORID
    objective_summary: Optional[str] = None
    reflective_summary: Optional[str] = None
    interpretive_summary: Optional[str] = None
    decisional_summary: Optional[str] = None


class Review(ReviewBase):
    """复盘完整模型"""
    id: int
    user_id: int
    created_at: datetime
    updated_at: Optional[datetime]
    
    class Config:
        from_attributes = True
