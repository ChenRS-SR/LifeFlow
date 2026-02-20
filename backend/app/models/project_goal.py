"""
项目目标/里程碑模型

项目可以设置多个目标/里程碑，项目进度基于目标完成情况
"""
from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base


class ProjectGoal(Base):
    """项目目标表 - 项目的里程碑或子目标"""
    __tablename__ = "project_goals"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # 目标内容
    title = Column(String(300), nullable=False)
    description = Column(Text, nullable=True)
    
    # 完成状态
    is_completed = Column(Boolean, default=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    # 排序权重（越小越靠前）
    sort_order = Column(Integer, default=0)
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # 关联关系
    project = relationship("Project", back_populates="project_goals")
