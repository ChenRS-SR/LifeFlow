"""
项目模型

项目是大型目标，可以拆解为多个任务
"""
from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Text, Float, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.db.database import Base


class ProjectStatus(str, enum.Enum):
    """项目状态"""
    PLANNING = "planning"      # 规划中
    ACTIVE = "active"          # 进行中
    PAUSED = "paused"          # 暂停
    COMPLETED = "completed"    # 已完成
    ARCHIVED = "archived"      # 已归档


class Project(Base):
    """项目表"""
    __tablename__ = "projects"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # 项目基本信息
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    
    # 项目状态
    status = Column(Enum(ProjectStatus), default=ProjectStatus.ACTIVE)
    
    # 时间安排
    start_date = Column(Date, nullable=True)           # 开始日期
    target_date = Column(Date, nullable=True)          # 目标截止日期
    completed_date = Column(Date, nullable=True)       # 实际完成日期
    
    # 进度（0-100）
    progress = Column(Float, default=0.0)
    
    # 项目大纲/笔记
    outline = Column(Text, nullable=True)
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # 关联关系
    user = relationship("User", back_populates="projects")
    tasks = relationship("Task", back_populates="project")
    goals = relationship("ProjectGoal", back_populates="project", cascade="all, delete-orphan")
    okr_goals = relationship("Goal", back_populates="project")
