"""
习惯数据模型
"""
from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional
from app.models.habit import HabitFrequency


class HabitBase(BaseModel):
    """习惯基础模型"""
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None
    color: str = "#3B82F6"
    frequency: HabitFrequency = HabitFrequency.DAILY
    target_times: int = 1
    points_per_completion: int = 1


class HabitCreate(HabitBase):
    pass


class HabitUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None


class Habit(HabitBase):
    """习惯完整模型"""
    id: int
    user_id: int
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class HabitLogBase(BaseModel):
    """打卡记录基础模型"""
    date: date
    count: int = 1
    note: Optional[str] = None


class HabitLogCreate(HabitLogBase):
    pass


class HabitLog(HabitLogBase):
    """打卡记录完整模型"""
    id: int
    habit_id: int
    user_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True
