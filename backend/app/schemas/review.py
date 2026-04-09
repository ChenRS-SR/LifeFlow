"""
复盘数据模型
"""
from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional, List
from app.models.review import ReviewPeriod


class TimelineItem(BaseModel):
    """时间线记录项"""
    time: str                    # 时间，如 "14:30"
    content: str                 # 内容描述
    type: str = "life"          # 类型: task, habit, life
    ref_id: Optional[int] = None # 关联的任务/习惯ID


class ReviewBase(BaseModel):
    """复盘基础模型"""
    period: ReviewPeriod
    year: int
    quarter: Optional[int] = None
    month: Optional[int] = None
    week: Optional[int] = None
    date: Optional[date] = None
    
    # 日复盘 - 新字段（时间线 + 简化反思）
    timeline: Optional[List[TimelineItem]] = None  # 时间线记录
    notes: Optional[str] = None                    # 随意记录
    tomorrow: Optional[str] = None                 # 明天注意
    mood: Optional[int] = None                     # 心情评分 1-10
    
    # 兼容旧字段
    highlights: Optional[str] = None
    challenges: Optional[str] = None
    learnings: Optional[str] = None
    next_steps: Optional[str] = None
    gratitude: Optional[str] = None
    
    # 周复盘 - KPT模板
    keep: Optional[str] = None
    problem: Optional[str] = None
    try_: Optional[str] = None
    
    # 月/季度/年度复盘 - ORID模板
    objective_summary: Optional[str] = None
    reflective_summary: Optional[str] = None
    interpretive_summary: Optional[str] = None
    decisional_summary: Optional[str] = None


class ReviewCreate(ReviewBase):
    pass


class ReviewUpdate(BaseModel):
    # 日复盘 - 新字段
    timeline: Optional[List[TimelineItem]] = None
    notes: Optional[str] = None
    tomorrow: Optional[str] = None
    mood: Optional[int] = None
    
    # 兼容旧字段
    highlights: Optional[str] = None
    challenges: Optional[str] = None
    learnings: Optional[str] = None
    next_steps: Optional[str] = None
    gratitude: Optional[str] = None
    
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
