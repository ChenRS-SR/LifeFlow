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
    
    # 复盘内容
    highlights: Optional[str] = None
    challenges: Optional[str] = None
    learnings: Optional[str] = None
    next_steps: Optional[str] = None
    gratitude: Optional[str] = None
    mood: Optional[int] = None  # 1-10


class ReviewCreate(ReviewBase):
    pass


class ReviewUpdate(BaseModel):
    highlights: Optional[str] = None
    challenges: Optional[str] = None
    learnings: Optional[str] = None
    next_steps: Optional[str] = None
    gratitude: Optional[str] = None
    mood: Optional[int] = None


class Review(ReviewBase):
    """复盘完整模型"""
    id: int
    user_id: int
    created_at: datetime
    updated_at: Optional[datetime]
    
    class Config:
        from_attributes = True
