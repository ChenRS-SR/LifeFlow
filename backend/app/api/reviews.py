"""
复盘 API

日/周/月/季度/年度复盘
"""
from typing import Any, List, Optional, Dict
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query, File, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from app.api.deps import get_db, get_current_active_user
from app import models, schemas
from app.models.task import TaskStatus
from app.models.goal import GoalStatus, GoalPeriod
from app.models.project import ProjectStatus
from app.models.habit import HabitLog
from app.services.vision_service import vision_service, VisionServiceError

router = APIRouter(prefix="/reviews", tags=["复盘"])


@router.get("/", response_model=List[schemas.Review])
def list_reviews(
    period: Optional[models.ReviewPeriod] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    week: Optional[int] = None,
    quarter: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """获取复盘列表"""
    query = db.query(models.Review).filter(models.Review.user_id == current_user.id)
    
    if period:
        query = query.filter(models.Review.period == period)
    if year:
        query = query.filter(models.Review.year == year)
    if month:
        query = query.filter(models.Review.month == month)
    if week:
        query = query.filter(models.Review.week == week)
    if quarter:
        query = query.filter(models.Review.quarter == quarter)
    
    reviews = query.order_by(models.Review.created_at.desc()).all()
    return reviews


# 注意：这个路由必须在 /by-period/{period} 之前定义
@router.get("/period/summary", response_model=Dict[str, Any])
def get_period_summary(
    period: models.ReviewPeriod = Query(..., description="复盘周期"),
    year: int = Query(..., description="年份"),
    week: Optional[int] = Query(None, description="周数（周复盘需要）"),
    month: Optional[int] = Query(None, description="月份（月复盘需要）"),
    quarter: Optional[int] = Query(None, description="季度（季度复盘需要）"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    获取指定周期的数据汇总，用于复盘时自动填充
    
    返回：
    - tasks: 任务完成情况
    - habits: 习惯打卡统计
    - goals: 目标进度变化
    - projects: 项目里程碑进展
    """
    # 计算时间范围
    if period == models.ReviewPeriod.DAILY:
        start_date = date(year, month or 1, 1)
        end_date = start_date
    elif period == models.ReviewPeriod.WEEKLY:
        if not week:
            raise HTTPException(status_code=400, detail="周复盘需要提供 week 参数")
        start_date = date.fromisocalendar(year, week, 1)
        end_date = date.fromisocalendar(year, week, 7)
    elif period == models.ReviewPeriod.MONTHLY:
        if not month:
            raise HTTPException(status_code=400, detail="月复盘需要提供 month 参数")
        start_date = date(year, month, 1)
        if month == 12:
            end_date = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = date(year, month + 1, 1) - timedelta(days=1)
    elif period == models.ReviewPeriod.QUARTERLY:
        if not quarter:
            raise HTTPException(status_code=400, detail="季度复盘需要提供 quarter 参数")
        start_month = (quarter - 1) * 3 + 1
        end_month = start_month + 2
        start_date = date(year, start_month, 1)
        if end_month == 12:
            end_date = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            end_date = date(year, end_month + 1, 1) - timedelta(days=1)
    else:  # YEARLY
        start_date = date(year, 1, 1)
        end_date = date(year, 12, 31)
    
    # 任务统计
    tasks_query = db.query(models.Task).filter(
        models.Task.user_id == current_user.id,
        models.Task.created_at >= start_date,
        models.Task.created_at <= end_date + timedelta(days=1)
    )
    total_tasks = tasks_query.count()
    completed_tasks = tasks_query.filter(models.Task.status == TaskStatus.COMPLETED).count()
    completed_tasks_list = tasks_query.filter(models.Task.status == TaskStatus.COMPLETED).order_by(models.Task.completed_at.desc()).all()
    
    tasks_summary = {
        "total": total_tasks,
        "completed": completed_tasks,
        "completion_rate": round(completed_tasks / total_tasks * 100, 1) if total_tasks > 0 else 0,
        "completed_list": [{"id": t.id, "title": t.title, "completed_at": t.completed_at.isoformat() if t.completed_at else None} for t in completed_tasks_list[:10]]
    }
    
    # 习惯统计
    habits = db.query(models.Habit).filter(models.Habit.user_id == current_user.id, models.Habit.is_active == True).all()
    habits_summary = []
    total_checkins = 0
    total_target = 0
    
    for habit in habits:
        if period == models.ReviewPeriod.DAILY:
            check_date = end_date
            log = db.query(HabitLog).filter(HabitLog.habit_id == habit.id, HabitLog.date == check_date).first()
            count = log.count if log else 0
            target = habit.get_target_for_date(check_date)
        else:
            logs = db.query(HabitLog).filter(HabitLog.habit_id == habit.id, HabitLog.date >= start_date, HabitLog.date <= end_date).all()
            count = sum(log.count for log in logs)
            if period == models.ReviewPeriod.WEEKLY:
                target = habit.get_weekly_target_total()
            else:
                days = (end_date - start_date).days + 1
                target = days * habit.times_per_day
        
        total_checkins += count
        total_target += target
        habits_summary.append({
            "id": habit.id, "name": habit.name, "icon": habit.icon, "color": habit.color,
            "count": count, "target": target, "rate": round(count / target * 100, 1) if target > 0 else 0
        })
    
    habits_data = {
        "total_checkins": total_checkins, "total_target": total_target,
        "overall_rate": round(total_checkins / total_target * 100, 1) if total_target > 0 else 0,
        "habits": habits_summary
    }
    
    # 目标进度
    if period == models.ReviewPeriod.DAILY:
        related_goals = db.query(models.Goal).filter(
            models.Goal.user_id == current_user.id,
            models.Goal.period.in_([GoalPeriod.MONTH, GoalPeriod.QUARTER, GoalPeriod.YEAR]),
            models.Goal.year == year, models.Goal.status == GoalStatus.ACTIVE
        ).all()
    elif period == models.ReviewPeriod.WEEKLY:
        related_goals = db.query(models.Goal).filter(
            models.Goal.user_id == current_user.id,
            models.Goal.period.in_([GoalPeriod.MONTH, GoalPeriod.QUARTER]),
            models.Goal.year == year, models.Goal.status == GoalStatus.ACTIVE
        ).all()
    elif period == models.ReviewPeriod.MONTHLY:
        related_goals = db.query(models.Goal).filter(
            models.Goal.user_id == current_user.id,
            models.Goal.period.in_([GoalPeriod.MONTH, GoalPeriod.QUARTER, GoalPeriod.YEAR]),
            models.Goal.year == year, models.Goal.month == month if month else True,
            models.Goal.status.in_([GoalStatus.ACTIVE, GoalStatus.COMPLETED])
        ).all()
    elif period == models.ReviewPeriod.QUARTERLY:
        related_goals = db.query(models.Goal).filter(
            models.Goal.user_id == current_user.id,
            models.Goal.period.in_([GoalPeriod.QUARTER, GoalPeriod.YEAR]),
            models.Goal.year == year, models.Goal.quarter == quarter if quarter else True,
            models.Goal.status.in_([GoalStatus.ACTIVE, GoalStatus.COMPLETED])
        ).all()
    else:
        related_goals = db.query(models.Goal).filter(
            models.Goal.user_id == current_user.id,
            models.Goal.period.in_([GoalPeriod.LIFE, GoalPeriod.YEAR]),
            models.Goal.year == year,
            models.Goal.status.in_([GoalStatus.ACTIVE, GoalStatus.COMPLETED])
        ).all()
    
    goals_summary = []
    for goal in related_goals:
        key_results = [{"id": kr.id, "title": kr.title, "current": kr.current_value, "target": kr.target_value, "unit": kr.unit, "completed": kr.is_completed} for kr in goal.key_results]
        goals_summary.append({
            "id": goal.id, "title": goal.title, "period": goal.period.value, "area": goal.area,
            "progress": goal.progress, "status": goal.status.value, "key_results": key_results
        })
    
    goals_data = {"total": len(goals_summary), "goals": goals_summary}
    
    # 项目里程碑
    projects = db.query(models.Project).filter(
        models.Project.user_id == current_user.id,
        models.Project.status.in_([ProjectStatus.ACTIVE, ProjectStatus.COMPLETED])
    ).all()
    
    projects_summary = []
    for project in projects:
        milestones = [{"id": pg.id, "title": pg.title, "completed": pg.is_completed, "sort_order": pg.sort_order} for pg in project.project_goals]
        project_tasks = db.query(models.Task).filter(
            models.Task.project_id == project.id,
            models.Task.created_at >= start_date,
            models.Task.created_at <= end_date + timedelta(days=1)
        ).all()
        projects_summary.append({
            "id": project.id, "name": project.name, "progress": project.progress,
            "status": project.status.value, "milestones": milestones, "tasks_count": len(project_tasks)
        })
    
    projects_data = {"total": len(projects_summary), "projects": projects_summary}
    
    return {
        "period": period.value, "start_date": start_date.isoformat(), "end_date": end_date.isoformat(),
        "tasks": tasks_summary, "habits": habits_data, "goals": goals_data, "projects": projects_data
    }


@router.get("/by-period/{period}", response_model=Optional[schemas.Review])
def get_review_by_period(
    period: models.ReviewPeriod,
    year: int = Query(..., description="年份"),
    month: Optional[int] = Query(None, description="月份"),
    week: Optional[int] = Query(None, description="周数"),
    quarter: Optional[int] = Query(None, description="季度"),
    date: Optional[date] = Query(None, description="日期（日复盘）"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    获取指定周期的复盘（如果不存在返回 null）
    
    用于前端判断是否需要创建新复盘
    """
    query = db.query(models.Review).filter(
        models.Review.user_id == current_user.id,
        models.Review.period == period,
        models.Review.year == year
    )
    
    if month:
        query = query.filter(models.Review.month == month)
    if week:
        query = query.filter(models.Review.week == week)
    if quarter:
        query = query.filter(models.Review.quarter == quarter)
    if date:
        query = query.filter(models.Review.date == date)
    
    review = query.first()
    return review


@router.post("/", response_model=schemas.Review, status_code=status.HTTP_201_CREATED)
def create_review(
    review_in: schemas.ReviewCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    创建复盘
    
    支持日/周/月/季度/年度复盘
    """
    review_data = review_in.model_dump()
    
    # 将字符串日期转换为 Python date 对象
    if review_data.get('date'):
        from datetime import datetime
        review_data['date'] = datetime.strptime(review_data['date'], '%Y-%m-%d').date()
    
    db_review = models.Review(
        user_id=current_user.id,
        **review_data
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
    
    update_data = review_in.model_dump(exclude_unset=True)
    
    # 将字符串日期转换为 Python date 对象
    if update_data.get('date'):
        from datetime import datetime
        update_data['date'] = datetime.strptime(update_data['date'], '%Y-%m-%d').date()
    
    for field, value in update_data.items():
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


def _guess_image_mime(image_bytes: bytes) -> str:
    """根据文件头魔数推断图片 MIME 类型"""
    if len(image_bytes) < 12:
        return ""
    if image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if image_bytes.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if image_bytes.startswith(b"RIFF") and image_bytes[8:12] == b"WEBP":
        return "image/webp"
    return ""


@router.post("/{review_id}/recognize-image")
def recognize_review_image(
    review_id: int,
    type: str = Query(..., description="识别类型: diet 或 workout"),
    image: UploadFile = File(..., description="要识别的图片"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_active_user)
):
    """
    识别复盘关联的图片（饮食/健身）

    图片仅在内存中处理，识别完成后立即丢弃；
    只把识别出的结构化文本数据保存到 review.diet_record 或 review.workout_record。
    """
    if type not in ("diet", "workout"):
        raise HTTPException(status_code=400, detail="type 必须是 diet 或 workout")

    review = db.query(models.Review).filter(
        models.Review.id == review_id,
        models.Review.user_id == current_user.id
    ).first()

    if not review:
        raise HTTPException(status_code=404, detail="复盘不存在")

    # 校验图片类型（支持 content-type 或文件头推断）
    allowed_types = {"image/jpeg", "image/png", "image/webp", "image/jpg", "image/x-png"}
    content_type = (image.content_type or "").lower()

    try:
        image_bytes = image.file.read()
        if len(image_bytes) == 0:
            raise HTTPException(status_code=400, detail="图片文件为空")

        # 如果 content-type 不可靠，根据文件头推断
        if content_type not in allowed_types:
            guessed = _guess_image_mime(image_bytes)
            if guessed in allowed_types:
                content_type = guessed
            else:
                raise HTTPException(status_code=400, detail="只支持 jpg/png/webp 图片")

        record = vision_service.recognize(
            image_bytes=image_bytes,
            record_type=type,
            image_mime=content_type,
        )
    except VisionServiceError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"图片识别失败: {e}") from e
    finally:
        image.file.close()

    # 保存识别结果到 review，不保存原图
    if type == "diet":
        review.diet_record = record
    else:
        review.workout_record = record

    db.commit()
    db.refresh(review)

    return {"type": type, "record": record}
