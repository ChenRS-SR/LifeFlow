"""
任务模型

任务是具体的行动项
"""
from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Text, Enum, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.db.database import Base


class TaskType(str, enum.Enum):
    """任务类型"""
    TASK = "task"      # 重要任务
    TODO = "todo"      # 待办事项


class TaskStatus(str, enum.Enum):
    """任务状态"""
    PENDING = "pending"           # 未开始
    IN_PROGRESS = "in_progress"   # 进行中
    COMPLETED = "completed"       # 已完成
    CANCELLED = "cancelled"       # 已取消


class TaskPriority(str, enum.Enum):
    """任务优先级"""
    LOW = "low"           # 低 (1)
    MEDIUM = "medium"     # 中 (2)
    HIGH = "high"         # 高 (3)
    URGENT = "urgent"     # 紧急 (4)


class Task(Base):
    """任务表"""
    __tablename__ = "tasks"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)  # 关联项目（可选）
    
    # 任务基本信息
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    
    # 任务类型和状态
    task_type = Column(Enum(TaskType), default=TaskType.TASK)
    status = Column(Enum(TaskStatus), default=TaskStatus.PENDING)
    priority = Column(Enum(TaskPriority), default=TaskPriority.MEDIUM)
    
    # 时间安排
    due_date = Column(Date, nullable=True)              # 截止日期
    scheduled_date = Column(Date, nullable=True)        # 计划执行日期
    scheduled_type = Column(String(20), nullable=True)  # 计划类型：today/tomorrow/week/month/year
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    # 时间预估和实际（番茄钟，1番茄钟=30分钟）
    estimated_pomodoros = Column(Integer, nullable=True)  # 预估番茄钟
    actual_pomodoros = Column(Integer, nullable=True)     # 实际番茄钟（手动填写）
    
    # 是否为收件箱项目（未整理）
    is_inbox = Column(Integer, default=0)  # 0=已整理, 1=收件箱（未整理）
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # 关联关系
    user = relationship("User", back_populates="tasks")
    project = relationship("Project", back_populates="tasks")
