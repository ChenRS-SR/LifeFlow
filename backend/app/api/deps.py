"""
API 依赖项

这里存放路由函数常用的依赖，比如获取当前登录用户
"""
from typing import Generator, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from jose import JWTError, jwt

from app.db.database import SessionLocal
from app.core.config import get_settings
from app import models, schemas

settings = get_settings()
security = HTTPBearer()


def get_db() -> Generator:
    """获取数据库会话"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> models.User:
    """
    通过 JWT Token 获取当前登录用户
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无效的认证信息",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = credentials.credentials

    # 只接受合法 JWT Token，不再支持 token_1 / token_2 等简单绕过
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        
        user = db.query(models.User).filter(models.User.id == int(user_id)).first()
        if user is None:
            raise credentials_exception
        
        return user
    except JWTError:
        raise credentials_exception


def get_current_active_user(
    current_user: models.User = Depends(get_current_user)
) -> models.User:
    """获取当前活跃用户"""
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="用户已被禁用")
    return current_user
