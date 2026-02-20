"""
目标数据模型（OKR）
"""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List
from app.models.goal import GoalPeriod, GoalStatus


class KeyResultBase(BaseModel):
    """关键结果基础模型"""
    title: str
    target_value: float = 100.0
    current_value: float = 0.0
    unit: Optional[str] = None


class KeyResultCreate(KeyResultBase):
    pass


class KeyResultUpdate(BaseModel):
    title: Optional[str] = None
    current_value: Optional[float] = None
    target_value: Optional[float] = None
    is_completed: Optional[bool] = None


class KeyResult(KeyResultBase):
    """关键结果完整模型"""
    id: int
    goal_id: int
    is_completed: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class GoalBase(BaseModel):
    """目标基础模型"""
    title: str
    description: Optional[str] = None
    period: GoalPeriod = GoalPeriod.MONTH
    year: Optional[int] = None
    quarter: Optional[int] = None
    month: Optional[int] = None
    area: Optional[str] = None


class GoalCreate(GoalBase):
    key_results: Optional[List[KeyResultCreate]] = []


class GoalUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[GoalStatus] = None
    progress: Optional[float] = None
    area: Optional[str] = None


class Goal(GoalBase):
    """目标完整模型"""
    id: int
    user_id: int
    status: GoalStatus
    progress: float
    created_at: datetime
    key_results: List[KeyResult] = []
    
    class Config:
        from_attributes = True
