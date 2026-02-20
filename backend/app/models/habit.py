"""
习惯模型 - 支持灵活频次
"""
from datetime import date
import sqlalchemy
from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Text, Enum, Boolean, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.db.database import Base


class HabitFrequency(str, enum.Enum):
    """习惯频率类型"""
    DAILY = "daily"         # 每天（固定）
    WEEKDAYS = "weekdays"   # 工作日（固定）
    WEEKENDS = "weekends"   # 周末（固定）
    CUSTOM = "custom"       # 自定义固定日期
    FLEXIBLE = "flexible"   # 灵活次数（不限定具体哪天）


class Habit(Base):
    """习惯表"""
    __tablename__ = "habits"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # 习惯信息
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    icon = Column(String(50), nullable=True)
    color = Column(String(20), default="#3B82F6")
    
    # 频次设置
    frequency_type = Column(Enum(HabitFrequency), default=HabitFrequency.DAILY)
    
    # 每周目标次数（用于灵活模式）
    weekly_target = Column(Integer, default=7)
    
    # 每日目标次数
    times_per_day = Column(Integer, default=1)
    
    # 固定日期安排 [1,1,1,1,1,0,0] 表示周一到周日
    custom_schedule = Column(JSON, default=None)
    
    # 是否允许超额完成（灵活模式）
    allow_overflow = Column(Boolean, default=False)
    
    # 状态
    is_active = Column(Boolean, default=True)
    is_archived = Column(Boolean, default=False)
    archived_at = Column(DateTime(timezone=True), nullable=True)
    
    # 排序
    sort_order = Column(Integer, default=0)
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # 关联关系
    user = relationship("User", back_populates="habits")
    logs = relationship("HabitLog", back_populates="habit", cascade="all, delete-orphan")
    
    def get_target_for_date(self, check_date: date) -> int:
        """获取指定日期的目标打卡次数（返回1表示当天需要打卡，0表示不需要）"""
        weekday = check_date.weekday()  # 0=周一, 6=周日
        
        if self.frequency_type == HabitFrequency.DAILY:
            return 1  # 每天需要打卡
        elif self.frequency_type == HabitFrequency.WEEKDAYS:
            return 1 if weekday < 5 else 0
        elif self.frequency_type == HabitFrequency.WEEKENDS:
            return 1 if weekday >= 5 else 0
        elif self.frequency_type == HabitFrequency.CUSTOM and self.custom_schedule:
            # 固定模式：按设定日期，只要有计划（>0）就返回1
            target = self.custom_schedule[weekday] if weekday < len(self.custom_schedule) else 0
            return 1 if target > 0 else 0
        elif self.frequency_type == HabitFrequency.FLEXIBLE:
            # 灵活模式：每天都可打卡
            return 1
        
        return 1
    
    def is_scheduled_for_date(self, check_date: date) -> bool:
        """判断指定日期是否需要打卡（用于固定模式）"""
        if self.frequency_type == HabitFrequency.FLEXIBLE:
            return True  # 灵活模式每天都可打卡
        return self.get_target_for_date(check_date) > 0
    
    def get_weekly_target_total(self) -> int:
        """获取本周总目标次数（对于灵活模式是目标次数，对于固定模式是计划天数）"""
        if self.frequency_type == HabitFrequency.FLEXIBLE:
            return self.weekly_target  # 灵活模式：目标次数
        elif self.frequency_type == HabitFrequency.CUSTOM and self.custom_schedule:
            return sum(1 for x in self.custom_schedule if x > 0)  # 固定模式：计划天数
        elif self.frequency_type == HabitFrequency.DAILY:
            return 7  # 每天
        elif self.frequency_type == HabitFrequency.WEEKDAYS:
            return 5  # 工作日
        elif self.frequency_type == HabitFrequency.WEEKENDS:
            return 2  # 周末
        return 7


class HabitLog(Base):
    """习惯打卡记录表"""
    __tablename__ = "habit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    habit_id = Column(Integer, ForeignKey("habits.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # 打卡日期
    date = Column(Date, nullable=False)
    
    # 完成次数
    count = Column(Integer, default=1)
    
    # 备注
    note = Column(String(200), nullable=True)
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # 关联关系
    habit = relationship("Habit", back_populates="logs")
    user = relationship("User", back_populates="habit_logs")
    
    # 唯一约束
    __table_args__ = (
        UniqueConstraint('habit_id', 'date', name='unique_habit_date'),
    )
