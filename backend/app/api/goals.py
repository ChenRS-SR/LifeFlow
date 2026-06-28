"""
目标管理 API

OKR 目标体系的增删改查
"""
from typing import Optional
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_active_user
from app import models
from app.models.goal import GoalStatus

router = APIRouter(prefix="/goals", tags=["目标管理"])


@router.get("/")
def list_goals(
    period: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)
):
    """获取目标列表"""
    query = db.query(models.Goal).filter(models.Goal.user_id == current_user.id)

    if period:
        query = query.filter(models.Goal.period == period)
    if year:
        query = query.filter(models.Goal.year == year)

    goals = query.order_by(models.Goal.created_at.desc()).all()

    return [{
        "id": g.id,
        "title": g.title,
        "description": g.description,
        "period": g.period.value,
        "year": g.year,
        "quarter": g.quarter,
        "month": g.month,
        "area": g.area,
        "status": g.status.value,
        "progress": g.progress,
        "created_at": g.created_at.isoformat() if g.created_at else None,
        "key_results": [{
            "id": kr.id,
            "title": kr.title,
            "target_value": kr.target_value,
            "current_value": kr.current_value,
            "unit": kr.unit,
            "is_completed": kr.is_completed
        } for kr in g.key_results]
    } for g in goals]


@router.post("/")
def create_goal(
    goal: dict,
    current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)
):
    """创建目标"""
    db_goal = models.Goal(
        user_id=current_user.id,
        title=goal.get("title", ""),
        description=goal.get("description"),
        period=goal.get("period", "month"),
        year=goal.get("year") or date.today().year,
        quarter=goal.get("quarter"),
        month=goal.get("month"),
        area=goal.get("area"),
        status=GoalStatus.ACTIVE if (goal.get("progress") or 0) < 100 else GoalStatus.COMPLETED,
        progress=float(goal.get("progress") or 0),
        project_id=goal.get("project_id")
    )
    db.add(db_goal)
    db.commit()
    db.refresh(db_goal)
    return {
        "id": db_goal.id,
        "title": db_goal.title,
        "progress": db_goal.progress,
        "project_id": db_goal.project_id,
    }


@router.put("/{goal_id}")
def update_goal(
    goal_id: int,
    goal: dict,
    current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)
):
    """更新目标"""
    g = db.query(models.Goal).filter(
        models.Goal.id == goal_id,
        models.Goal.user_id == current_user.id
    ).first()
    if not g:
        raise HTTPException(status_code=404, detail="目标不存在")

    g.title = goal.get("title", g.title)
    g.description = goal.get("description", g.description)
    g.status = goal.get("status", g.status)
    g.progress = goal.get("progress", g.progress)
    g.area = goal.get("area", g.area)
    g.project_id = goal.get("project_id", g.project_id)

    # 如果进度达到100%，自动标记为已完成
    if g.progress >= 100 and g.status == "active":
        g.status = "completed"

    db.commit()
    db.refresh(g)
    return {
        "id": g.id,
        "title": g.title,
        "progress": g.progress,
        "status": g.status,
        "area": g.area,
        "project_id": g.project_id,
    }


@router.delete("/{goal_id}")
def delete_goal(goal_id: int, current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    """删除目标"""
    g = db.query(models.Goal).filter(
        models.Goal.id == goal_id,
        models.Goal.user_id == current_user.id
    ).first()
    if not g:
        raise HTTPException(status_code=404, detail="目标不存在")

    db.delete(g)
    db.commit()
    return {"message": "目标已删除"}
