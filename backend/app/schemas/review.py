"""
复盘相关 Pydantic Schema
"""
from typing import Optional, List, Any
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class ReviewBase(BaseModel):
    period: str
    year: int
    quarter: Optional[int] = None
    month: Optional[int] = None
    week: Optional[int] = None
    date: Optional[str] = None

    # 日复盘
    timeline: Optional[List[Any]] = None
    notes: Optional[str] = None
    tomorrow: Optional[str] = None
    mood: Optional[int] = None

    # 旧字段兼容
    highlights: Optional[str] = None
    challenges: Optional[str] = None
    learnings: Optional[str] = None
    next_steps: Optional[str] = None
    gratitude: Optional[str] = None

    # 周复盘 KPT
    keep: Optional[str] = None
    problem: Optional[str] = None
    try_: Optional[str] = None

    # 月/季度/年度复盘 ORID
    objective_summary: Optional[str] = None
    reflective_summary: Optional[str] = None
    interpretive_summary: Optional[str] = None
    decisional_summary: Optional[str] = None
    # 多维度打分
    dimensions: Optional[dict] = None  # { "外型": 5, "社交": 4, ... }


class ReviewCreate(ReviewBase):
    pass


class ReviewUpdate(ReviewBase):
    period: Optional[str] = None
    year: Optional[int] = None


class Review(ReviewBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
