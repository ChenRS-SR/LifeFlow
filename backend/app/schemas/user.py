"""
用户相关 Pydantic Schema
"""
from typing import Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr


class UserBase(BaseModel):
    username: str
    email: Optional[EmailStr] = None


class UserCreate(UserBase):
    password: str


class User(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    is_active: bool = True
    life_vision: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
