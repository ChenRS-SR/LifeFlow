"""
复盘模型

支持日/周/月/季度/年复盘
"""
from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Text, Enum, JSON
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
    
    # 日复盘 - 时间线记录（JSON格式: [{time, content, type, ref_id}, ...]）
    timeline = Column(JSON, nullable=True)
    
    # 日复盘 - 简化反思字段
    notes = Column(Text, nullable=True)           # 随意记录（代替高光/挑战/学习）
    tomorrow = Column(Text, nullable=True)        # 明天注意（代替下一步行动）
    mood = Column(Integer, nullable=True)         # 心情评分 1-10
    
    # 兼容旧字段（保留但不再主要使用）
    highlights = Column(Text, nullable=True)      # 高光时刻/成就
    challenges = Column(Text, nullable=True)      # 遇到的挑战
    learnings = Column(Text, nullable=True)       # 学到的东西
    next_steps = Column(Text, nullable=True)      # 下一步行动
    gratitude = Column(Text, nullable=True)       # 感恩事项
    
    # 周复盘模板 (KPT)
    keep = Column(Text, nullable=True)            # 需要保持的
    problem = Column(Text, nullable=True)         # 遇到的问题
    try_ = Column("try", Text, nullable=True)     # 下一步尝试
    
    # 月/季度/年度复盘模板 (ORID)
    objective_summary = Column(Text, nullable=True)    # 客观回顾
    reflective_summary = Column(Text, nullable=True)   # 主观感受
    interpretive_summary = Column(Text, nullable=True) # 深度思考/解读
    decisional_summary = Column(Text, nullable=True)   # 决策/行动计划
    
    # 多维度打分（月/季度/年度复盘使用）
    dimensions = Column(JSON, nullable=True)  # { "外型": 5, "社交": 4, ... }

    # AI 识别后的饮食/健身记录（仅保存结构化文本，不保存原图）
    diet_record = Column(JSON, nullable=True)     # 薄荷健康饮食记录识别结果
    workout_record = Column(JSON, nullable=True)  # 训记训练记录识别结果

    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # 关联关系
    user = relationship("User", back_populates="reviews")
