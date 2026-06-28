"""
配置文件

这里存放所有配置信息，比如数据库连接地址、密钥等
Pydantic Settings 会自动从环境变量读取配置
"""
from __future__ import annotations
from typing import Optional
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

    # AI 配置（用于图片识别、AI 复盘等）
    AI_PROVIDER: str = "openai"          # openai / deepseek / claude / 任意 OpenAI 兼容接口
    AI_API_KEY: Optional[str] = None     # API Key，不配置则图片识别不可用
    AI_MODEL: str = "gpt-4o-mini"        # 默认模型，支持 vision 的多模态模型
    AI_BASE_URL: Optional[str] = None    # 第三方代理地址，留空使用官方地址
    AI_MAX_TOKENS: int = 1500            # 最大返回 token 数
    AI_TEMPERATURE: float = 0.2          # 低温度，保证 JSON 输出稳定

    class Config:
        env_file = ".env"  # 从.env文件读取配置


@lru_cache()
def get_settings() -> Settings:
    """获取配置（使用缓存避免重复读取）"""
    return Settings()
