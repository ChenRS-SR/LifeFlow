"""
目标管理 API

OKR 目标体系的增删改查
"""
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_active_user
from app import models, schemas

router = APIRouter(prefix="/goals", tags=["目标管理"])


@router.get("/", response_model=List[schemas.Goal])
def list_goals(
    period: Optional[models.GoalPeriod] = None,
    year: Optional[int] = None,
    status: Optional[models.GoalStatus] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    获取目标列表
    
    可筛选：period（周期）、year（年份）、status（状态）
    """
    query = db.query(models.Goal).filter(models.Goal.user_id == current_user.id)
    
    if period:
        query = query.filter(models.Goal.period == period)
    if year:
        query = query.filter(models.Goal.year == year)
    if status:
        query = query.filter(models.Goal.status == status)
    
    goals = query.order_by(models.Goal.created_at.desc()).all()
    return goals


@router.post("/", response_model=schemas.Goal, status_code=status.HTTP_201_CREATED)
def create_goal(
    goal_in: schemas.GoalCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    创建新目标
    
    示例：
        POST /goals/
        {
            "title": "提升编程能力",
            "description": "成为一名优秀的全栈工程师",
            "period": "year",
            "year": 2026,
            "area": "学习",
            "key_results": [
                {"title": "读完10本技术书籍", "target_value": 10, "unit": "本"},
                {"title": "完成5个实战项目", "target_value": 5, "unit": "个"}
            ]
        }
    """
    # 创建目标
    db_goal = models.Goal(
        user_id=current_user.id,
        **goal_in.model_dump(exclude={"key_results"})
    )
    db.add(db_goal)
    db.flush()  # 获取 goal.id
    
    # 创建关键结果
    for kr in goal_in.key_results:
        db_kr = models.KeyResult(goal_id=db_goal.id, **kr.model_dump())
        db.add(db_kr)
    
    db.commit()
    db.refresh(db_goal)
    return db_goal


@router.get("/{goal_id}", response_model=schemas.Goal)
def get_goal(
    goal_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """获取单个目标详情"""
    goal = db.query(models.Goal).filter(
        models.Goal.id == goal_id,
        models.Goal.user_id == current_user.id
    ).first()
    
    if not goal:
        raise HTTPException(status_code=404, detail="目标不存在")
    
    return goal


@router.put("/{goal_id}", response_model=schemas.Goal)
def update_goal(
    goal_id: int,
    goal_in: schemas.GoalUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """更新目标"""
    goal = db.query(models.Goal).filter(
        models.Goal.id == goal_id,
        models.Goal.user_id == current_user.id
    ).first()
    
    if not goal:
        raise HTTPException(status_code=404, detail="目标不存在")
    
    # 更新字段
    for field, value in goal_in.model_dump(exclude_unset=True).items():
        setattr(goal, field, value)
    
    db.commit()
    db.refresh(goal)
    return goal


@router.delete("/{goal_id}")
def delete_goal(
    goal_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """删除目标"""
    goal = db.query(models.Goal).filter(
        models.Goal.id == goal_id,
        models.Goal.user_id == current_user.id
    ).first()
    
    if not goal:
        raise HTTPException(status_code=404, detail="目标不存在")
    
    db.delete(goal)
    db.commit()
    
    return {"message": "目标已删除"}


# ========== 关键结果 API ==========

@router.post("/{goal_id}/key-results", response_model=schemas.KeyResult)
def add_key_result(
    goal_id: int,
    kr_in: schemas.KeyResultCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """为目标添加关键结果"""
    # 验证目标存在
    goal = db.query(models.Goal).filter(
        models.Goal.id == goal_id,
        models.Goal.user_id == current_user.id
    ).first()
    
    if not goal:
        raise HTTPException(status_code=404, detail="目标不存在")
    
    db_kr = models.KeyResult(goal_id=goal_id, **kr_in.model_dump())
    db.add(db_kr)
    db.commit()
    db.refresh(db_kr)
    return db_kr


@router.put("/{goal_id}/key-results/{kr_id}", response_model=schemas.KeyResult)
def update_key_result(
    goal_id: int,
    kr_id: int,
    kr_in: schemas.KeyResultUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """更新关键结果"""
    kr = db.query(models.KeyResult).join(models.Goal).filter(
        models.KeyResult.id == kr_id,
        models.KeyResult.goal_id == goal_id,
        models.Goal.user_id == current_user.id
    ).first()
    
    if not kr:
        raise HTTPException(status_code=404, detail="关键结果不存在")
    
    # 更新字段
    for field, value in kr_in.model_dump(exclude_unset=True).items():
        setattr(kr, field, value)
    
    # 自动检查是否完成
    if kr.current_value >= kr.target_value:
        kr.is_completed = True
    
    db.commit()
    db.refresh(kr)
    return kr
