"""
用户模型

存储用户基本信息
"""
from sqlalchemy import Column, Integer, String, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base


class User(Base):
    """用户表"""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=True)
    hashed_password = Column(String(255), nullable=False)
    
    # 个人愿景（最宏观的人生目标）
    life_vision = Column(String(1000), nullable=True)
    
    # 账户状态
    is_active = Column(Boolean, default=True)
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # 关联关系（反向引用）
    goals = relationship("Goal", back_populates="user")
    projects = relationship("Project", back_populates="user")
    tasks = relationship("Task", back_populates="user")
    habits = relationship("Habit", back_populates="user")
    habit_logs = relationship("HabitLog", back_populates="user")
    reviews = relationship("Review", back_populates="user")
