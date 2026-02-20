"""
复盘模型

支持日/周/月/季度/年复盘
"""
from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.db.database import Base


class ReviewPeriod(str, enum.Enum):
    """复盘周期"""
    DAILY = "daily"       # 日复盘
    WEEKLY = "weekly"     # 周复盘
    MONTHLY = "monthly"   # 月复盘
    QUARTERLY = "quarterly"  # 季度复盘
    YEARLY = "yearly"     # 年度复盘


class Review(Base):
    """复盘表"""
    __tablename__ = "reviews"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # 复盘周期
    period = Column(Enum(ReviewPeriod), nullable=False)
    year = Column(Integer, nullable=False)
    quarter = Column(Integer, nullable=True)
    month = Column(Integer, nullable=True)
    week = Column(Integer, nullable=True)
    date = Column(Date, nullable=True)  # 对于日复盘
    
    # 复盘内容（可以根据需要扩展更多字段）
    highlights = Column(Text, nullable=True)      # 高光时刻/成就
    challenges = Column(Text, nullable=True)      # 遇到的挑战
    learnings = Column(Text, nullable=True)       # 学到的东西
    next_steps = Column(Text, nullable=True)      # 下一步行动
    gratitude = Column(Text, nullable=True)       # 感恩事项
    mood = Column(Integer, nullable=True)         # 心情评分 1-10
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # 关联关系
    user = relationship("User", back_populates="reviews")
