"""
目标模型 - OKR 体系

Goal: 目标（Objectives）- 你想要达成什么
KeyResult: 关键结果 - 如何衡量目标达成
"""
from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Text, Float, Enum, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.db.database import Base


class GoalPeriod(str, enum.Enum):
    """目标周期"""
    LIFE = "life"        # 人生愿景
    YEAR = "year"        # 年度目标
    QUARTER = "quarter"  # 季度目标
    MONTH = "month"      # 月度目标


class GoalStatus(str, enum.Enum):
    """目标状态"""
    ACTIVE = "active"      # 进行中
    COMPLETED = "completed" # 已完成
    ARCHIVED = "archived"   # 已归档


class Goal(Base):
    """目标表 - 存储 OKR 中的 O（Objectives）"""
    __tablename__ = "goals"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # 目标基本信息
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    
    # OKR 相关
    period = Column(Enum(GoalPeriod), default=GoalPeriod.MONTH)
    year = Column(Integer, nullable=True)      # 哪一年
    quarter = Column(Integer, nullable=True)   # 哪一季度 (1-4)
    month = Column(Integer, nullable=True)     # 哪一月 (1-12)
    
    # 目标领域（人生维度）
    area = Column(String(50), nullable=True)   # 如：工作、学习、健康、财务、关系
    
    # 状态
    status = Column(Enum(GoalStatus), default=GoalStatus.ACTIVE)
    progress = Column(Float, default=0.0)      # 完成进度 0-100
    
    # 关联项目（可选）
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # 关联关系
    user = relationship("User", back_populates="goals")
    project = relationship("Project", back_populates="goals")
    key_results = relationship("KeyResult", back_populates="goal", cascade="all, delete-orphan")


class KeyResult(Base):
    """关键结果表 - 存储 OKR 中的 KR（Key Results）"""
    __tablename__ = "key_results"
    
    id = Column(Integer, primary_key=True, index=True)
    goal_id = Column(Integer, ForeignKey("goals.id"), nullable=False)
    
    # 关键结果描述
    title = Column(String(200), nullable=False)
    
    # 量化指标
    target_value = Column(Float, default=100.0)    # 目标值
    current_value = Column(Float, default=0.0)     # 当前值
    unit = Column(String(50), nullable=True)        # 单位（如：本书、小时、元）
    
    # 状态
    is_completed = Column(Boolean, default=False)
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # 关联关系
    goal = relationship("Goal", back_populates="key_results")
