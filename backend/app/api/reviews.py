"""
复盘 API

日/周/月/季度/年度复盘
"""
from typing import Any, List, Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_active_user
from app import models, schemas

router = APIRouter(prefix="/reviews", tags=["复盘"])


@router.get("/", response_model=List[schemas.Review])
def list_reviews(
    period: Optional[models.ReviewPeriod] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """获取复盘列表"""
    query = db.query(models.Review).filter(models.Review.user_id == current_user.id)
    
    if period:
        query = query.filter(models.Review.period == period)
    if year:
        query = query.filter(models.Review.year == year)
    
    reviews = query.order_by(models.Review.created_at.desc()).all()
    return reviews


@router.post("/", response_model=schemas.Review, status_code=status.HTTP_201_CREATED)
def create_review(
    review_in: schemas.ReviewCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    创建复盘
    
    示例：
        POST /reviews/
        {
            "period": "daily",
            "year": 2026,
            "month": 2,
            "date": "2026-02-19",
            "highlights": "完成了人生管理系统的后端开发",
            "challenges": "时间不够用",
            "learnings": "FastAPI 真的很快",
            "mood": 8
        }
    """
    db_review = models.Review(
        user_id=current_user.id,
        **review_in.model_dump()
    )
    db.add(db_review)
    db.commit()
    db.refresh(db_review)
    return db_review


@router.get("/{review_id}", response_model=schemas.Review)
def get_review(
    review_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """获取复盘详情"""
    review = db.query(models.Review).filter(
        models.Review.id == review_id,
        models.Review.user_id == current_user.id
    ).first()
    
    if not review:
        raise HTTPException(status_code=404, detail="复盘不存在")
    
    return review


@router.get("/today/daily", response_model=Optional[schemas.Review])
def get_today_review(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """获取今日日复盘（如果不存在返回 null）"""
    today = date.today()
    
    review = db.query(models.Review).filter(
        models.Review.user_id == current_user.id,
        models.Review.period == models.ReviewPeriod.DAILY,
        models.Review.date == today
    ).first()
    
    return review


@router.put("/{review_id}", response_model=schemas.Review)
def update_review(
    review_id: int,
    review_in: schemas.ReviewUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """更新复盘"""
    review = db.query(models.Review).filter(
        models.Review.id == review_id,
        models.Review.user_id == current_user.id
    ).first()
    
    if not review:
        raise HTTPException(status_code=404, detail="复盘不存在")
    
    for field, value in review_in.model_dump(exclude_unset=True).items():
        setattr(review, field, value)
    
    db.commit()
    db.refresh(review)
    return review


@router.delete("/{review_id}")
def delete_review(
    review_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """删除复盘"""
    review = db.query(models.Review).filter(
        models.Review.id == review_id,
        models.Review.user_id == current_user.id
    ).first()
    
    if not review:
        raise HTTPException(status_code=404, detail="复盘不存在")
    
    db.delete(review)
    db.commit()
    
    return {"message": "复盘已删除"}
