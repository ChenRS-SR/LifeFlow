"""
用户数据模型

Pydantic 用于数据验证和序列化
"""
from pydantic import BaseModel, EmailStr, field_validator
from datetime import datetime
from typing import Optional


class UserBase(BaseModel):
    """用户基础模型"""
    username: str
    email: Optional[str] = None  # 改为 str 避免 EmailStr 验证问题
    life_vision: Optional[str] = None


class UserCreate(UserBase):
    """创建用户模型"""
    password: str


class UserUpdate(BaseModel):
    """更新用户模型"""
    email: Optional[str] = None  # 改为 str
    life_vision: Optional[str] = None


class User(UserBase):
    """用户完整模型（返回给前端）"""
    id: int
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True  # 允许从 ORM 对象创建
