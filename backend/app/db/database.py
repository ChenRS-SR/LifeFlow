"""
数据库配置

SQLAlchemy 是 Python 最流行的 ORM 工具，
它让我们可以用 Python 类来操作数据库表，不用写 SQL 语句。
"""
from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import get_settings

settings = get_settings()

# 创建数据库引擎
# SQLite 配置：check_same_thread=False 允许多线程访问
if settings.DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        settings.DATABASE_URL,
        connect_args={"check_same_thread": False},
        echo=settings.DEBUG,
    )
else:
    engine = create_engine(
        settings.DATABASE_URL,
        echo=settings.DEBUG,
    )

# 创建会话工厂
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 声明基类，所有模型都继承这个类
Base = declarative_base()


def get_db():
    """
    获取数据库会话（用于 FastAPI 依赖注入）
    
    用法：
        @app.get("/items/")
        def read_items(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
