"""
项目管理 API

项目的增删改查以及项目目标（里程碑）管理
"""
from typing import Optional, List
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_active_user
from app import models
from app.models.project import ProjectStatus
from app.models.task import TaskStatus

router = APIRouter(prefix="/projects", tags=["项目管理"])


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    target_date: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    target_date: Optional[str] = None
    outline: Optional[str] = None


class ProjectGoalCreateRequest(BaseModel):
    title: str
    description: Optional[str] = None
    sort_order: int = 0


class ProjectGoalUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    is_completed: Optional[bool] = None
    sort_order: Optional[int] = None


class ReorderGoalsRequest(BaseModel):
    goal_ids: List[int]


def _parse_date(date_str: Optional[str]) -> Optional[date]:
    """将日期字符串转为 Python date 对象"""
    if not date_str:
        return None
    try:
        return date.fromisoformat(date_str)
    except ValueError:
        return None


def _update_project_progress(db: Session, project_id: int):
    """根据目标完成情况更新项目进度"""
    goals = db.query(models.ProjectGoal).filter(
        models.ProjectGoal.project_id == project_id
    ).all()

    if not goals:
        progress = 0.0
    else:
        completed = sum(1 for g in goals if g.is_completed)
        progress = (completed / len(goals)) * 100

    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if project:
        project.progress = progress
        db.commit()


@router.get("/")
def list_projects(current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    """获取所有项目"""
    projects = db.query(models.Project).filter(
        models.Project.user_id == current_user.id
    ).order_by(models.Project.created_at.desc()).all()

    result = []
    for p in projects:
        # 计算项目下的任务统计
        total_tasks = db.query(models.Task).filter(models.Task.project_id == p.id).count()
        completed_tasks = db.query(models.Task).filter(
            models.Task.project_id == p.id,
            models.Task.status == TaskStatus.COMPLETED
        ).count()

        result.append({
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "status": p.status.value,
            "progress": p.progress,
            "target_date": p.target_date.isoformat() if p.target_date else None,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "total_tasks": total_tasks,
            "completed_tasks": completed_tasks
        })

    return result


@router.get("/{project_id}")
def get_project(project_id: int, current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    """获取项目详情"""
    p = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == current_user.id
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 获取项目下的任务
    tasks = db.query(models.Task).filter(models.Task.project_id == p.id).all()

    # 获取项目目标
    goals = db.query(models.ProjectGoal).filter(
        models.ProjectGoal.project_id == p.id
    ).order_by(models.ProjectGoal.sort_order).all()

    return {
        "id": p.id,
        "name": p.name,
        "description": p.description,
        "outline": p.outline,
        "status": p.status.value,
        "progress": p.progress,
        "target_date": p.target_date.isoformat() if p.target_date else None,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "goals": [{
            "id": g.id,
            "title": g.title,
            "description": g.description,
            "is_completed": g.is_completed,
            "completed_at": g.completed_at.isoformat() if g.completed_at else None,
            "sort_order": g.sort_order,
        } for g in goals],
        "tasks": [{
            "id": t.id,
            "title": t.title,
            "status": t.status.value,
            "priority": t.priority.value,
            "completed_at": t.completed_at.isoformat() if t.completed_at else None
        } for t in tasks]
    }


@router.post("/")
def create_project(project: ProjectCreate, current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    """创建项目"""
    db_project = models.Project(
        user_id=current_user.id,
        name=project.name,
        description=project.description,
        status=ProjectStatus.ACTIVE,
        target_date=project.target_date,
        progress=0.0
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return {
        "id": db_project.id,
        "name": db_project.name,
        "status": db_project.status.value
    }


@router.put("/{project_id}")
def update_project(
    project_id: int,
    data: ProjectUpdate,
    current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)
):
    """更新项目"""
    p = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == current_user.id
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="项目不存在")

    if data.name is not None:
        p.name = data.name
    if data.description is not None:
        p.description = data.description
    if data.status is not None:
        p.status = ProjectStatus(data.status)
        # 如果状态变为已完成，记录完成日期
        if data.status == "completed" and not p.completed_date:
            p.completed_date = date.today()
    if data.target_date is not None:
        p.target_date = _parse_date(data.target_date)
    if data.outline is not None:
        p.outline = data.outline

    # 进度基于目标完成情况（不是任务）
    # 由 _update_project_progress 在目标变更时自动更新

    db.commit()
    db.refresh(p)
    return {
        "id": p.id,
        "name": p.name,
        "description": p.description,
        "status": p.status.value,
        "target_date": p.target_date.isoformat() if p.target_date else None,
        "outline": p.outline,
        "progress": p.progress
    }


@router.delete("/{project_id}")
def delete_project(project_id: int, current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    """删除项目"""
    p = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == current_user.id
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 将项目下的任务设为无项目
    db.query(models.Task).filter(models.Task.project_id == project_id).update({"project_id": None})

    db.delete(p)
    db.commit()
    return {"message": "项目已删除"}


# ==================== 项目目标 API ====================

@router.get("/{project_id}/goals")
def list_project_goals(project_id: int, current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    """获取项目的目标列表"""
    # 验证项目归属
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    goals = db.query(models.ProjectGoal).filter(
        models.ProjectGoal.project_id == project_id
    ).order_by(models.ProjectGoal.sort_order, models.ProjectGoal.created_at).all()

    return [{
        "id": g.id,
        "project_id": g.project_id,
        "title": g.title,
        "description": g.description,
        "is_completed": g.is_completed,
        "completed_at": g.completed_at.isoformat() if g.completed_at else None,
        "sort_order": g.sort_order,
        "created_at": g.created_at.isoformat() if g.created_at else None,
    } for g in goals]


@router.post("/{project_id}/goals")
def create_project_goal(
    project_id: int,
    req: ProjectGoalCreateRequest,
    current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)
):
    """创建项目目标"""
    # 验证项目归属
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    goal = models.ProjectGoal(
        project_id=project_id,
        user_id=current_user.id,
        title=req.title,
        description=req.description,
        sort_order=req.sort_order,
        is_completed=False
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)

    # 更新项目进度
    _update_project_progress(db, project_id)

    return {
        "id": goal.id,
        "project_id": goal.project_id,
        "title": goal.title,
        "description": goal.description,
        "is_completed": goal.is_completed,
        "sort_order": goal.sort_order,
    }


@router.put("/{project_id}/goals/{goal_id}")
def update_project_goal(
    project_id: int,
    goal_id: int,
    req: ProjectGoalUpdateRequest,
    current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)
):
    """更新项目目标"""
    # 验证项目归属
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    goal = db.query(models.ProjectGoal).filter(
        models.ProjectGoal.id == goal_id,
        models.ProjectGoal.project_id == project_id
    ).first()

    if not goal:
        raise HTTPException(status_code=404, detail="目标不存在")

    # 更新字段
    if req.title is not None:
        goal.title = req.title
    if req.description is not None:
        goal.description = req.description
    if req.sort_order is not None:
        goal.sort_order = req.sort_order
    if req.is_completed is not None:
        goal.is_completed = req.is_completed
        goal.completed_at = datetime.now() if req.is_completed else None

    db.commit()
    db.refresh(goal)

    # 更新项目进度
    _update_project_progress(db, project_id)

    return {
        "id": goal.id,
        "project_id": goal.project_id,
        "title": goal.title,
        "description": goal.description,
        "is_completed": goal.is_completed,
        "completed_at": goal.completed_at.isoformat() if goal.completed_at else None,
        "sort_order": goal.sort_order,
    }


@router.delete("/{project_id}/goals/{goal_id}")
def delete_project_goal(
    project_id: int,
    goal_id: int,
    current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)
):
    """删除项目目标"""
    # 验证项目归属
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    goal = db.query(models.ProjectGoal).filter(
        models.ProjectGoal.id == goal_id,
        models.ProjectGoal.project_id == project_id
    ).first()

    if not goal:
        raise HTTPException(status_code=404, detail="目标不存在")

    db.delete(goal)
    db.commit()

    # 更新项目进度
    _update_project_progress(db, project_id)

    return {"message": "目标已删除"}


@router.post("/{project_id}/goals/{goal_id}/toggle")
def toggle_project_goal(
    project_id: int,
    goal_id: int,
    current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)
):
    """切换目标完成状态"""
    # 验证项目归属
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    goal = db.query(models.ProjectGoal).filter(
        models.ProjectGoal.id == goal_id,
        models.ProjectGoal.project_id == project_id
    ).first()

    if not goal:
        raise HTTPException(status_code=404, detail="目标不存在")

    goal.is_completed = not goal.is_completed
    goal.completed_at = datetime.now() if goal.is_completed else None

    db.commit()
    db.refresh(goal)

    # 更新项目进度
    _update_project_progress(db, project_id)

    return {
        "id": goal.id,
        "is_completed": goal.is_completed,
        "completed_at": goal.completed_at.isoformat() if goal.completed_at else None,
    }


@router.post("/{project_id}/goals/reorder")
def reorder_project_goals(
    project_id: int,
    req: ReorderGoalsRequest,
    current_user: models.User = Depends(get_current_active_user), db: Session = Depends(get_db)
):
    """批量更新目标排序"""
    # 验证项目归属
    project = db.query(models.Project).filter(
        models.Project.id == project_id,
        models.Project.user_id == current_user.id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    # 更新每个目标的排序
    for index, goal_id in enumerate(req.goal_ids):
        goal = db.query(models.ProjectGoal).filter(
            models.ProjectGoal.id == goal_id,
            models.ProjectGoal.project_id == project_id
        ).first()
        if goal:
            goal.sort_order = index

    db.commit()

    return {"message": "排序已更新"}
