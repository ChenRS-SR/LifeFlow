"""
配置文件

这里存放所有配置信息，比如数据库连接地址、密钥等
Pydantic Settings 会自动从环境变量读取配置
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """应用配置类"""
    
    # 应用信息
    APP_NAME: str = "LifeFlow"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    
    # 数据库配置（开发环境使用 SQLite，生产环境使用 PostgreSQL）
    DATABASE_URL: str = "sqlite:///./lifeflow.db"
    
    # JWT密钥（生产环境必须用强密码）
    SECRET_KEY: str = "your-secret-key-here-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7天
    
    class Config:
        env_file = ".env"  # 从.env文件读取配置


@lru_cache()
def get_settings() -> Settings:
    """获取配置（使用缓存避免重复读取）"""
    return Settings()
