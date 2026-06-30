"""
训记（Xunji）Open API 客户端

用于从训记 App 直接读取结构化训练数据。
- 图片仅在内存中处理；
- 只把识别出的结构化文本数据保存到 review.workout_record；
- 严格遵守限频、缓存、鉴权规则，不暴露内部 key。
"""
from __future__ import annotations

import json
import logging
import re
import threading
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class XunjiClientError(Exception):
    """训记 API 调用异常"""
    pass


class XunjiRateLimitError(XunjiClientError):
    """训记 API 频率限制"""
    pass


class XunjiAuthError(XunjiClientError):
    """训记 API 鉴权失败"""
    pass


class XunjiClient:
    """训记 Open API 客户端：读取训练记录并归一化为 workout_record 结构"""

    # 同一日期 90 秒内最多读取一次
    _CACHE_TTL_SECONDS = 90

    # 身体部位英文/内部名 -> 中文名
    _BODY_PART_MAP = {
        "chest": "胸",
        "胸": "胸",
        "back": "背",
        "背": "背",
        "shoulder": "肩",
        "肩": "肩",
        "arm": "手臂",
        "手臂": "手臂",
        "biceps": "手臂",
        "triceps": "手臂",
        "leg": "腿",
        "腿": "腿",
        "glute": "臀",
        "臀": "臀",
        "core": "核心",
        "核心": "核心",
        "abs": "腹",
        "abdominal": "腹",
        "腹": "腹",
    }

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: int = 30,
    ):
        settings = get_settings()
        self.api_key = api_key or settings.XUNJI_API_KEY
        self.base_url = (base_url or settings.XUNJI_BASE_URL or "https://trains.xunjiapp.cn").rstrip("/")
        self.timeout = timeout
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._cache_lock = threading.Lock()

    def fetch_trains(self, datestr: str, include_full_data: bool = True) -> Dict[str, Any]:
        """
        读取指定日期的训记训练数据。

        Args:
            datestr: 日期字符串，格式 YYYY-MM-DD
            include_full_data: 是否读取完整数据（RPE、备注、未完成组等）

        Returns:
            归一化后的 workout_record 结构 dict
        """
        if not self.api_key:
            raise XunjiClientError("训记 API Key 未配置，请在环境变量中设置 XUNJI_API_KEY")

        if not re.match(r"^\d{4}-\d{2}-\d{2}$", datestr):
            raise XunjiClientError(f"日期格式错误: {datestr}，请使用 YYYY-MM-DD")

        # 命中缓存则直接返回
        cached = self._get_cache(datestr)
        if cached is not None:
            logger.info("[Xunji] 命中缓存: %s", datestr)
            return cached

        url = f"{self.base_url}/api_trains_for_llm_v2"
        payload = {
            "schema_version": "train_open_api_v2",
            "datestr": datestr,
            "include_full_data": include_full_data,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        logger.info("[Xunji] 请求训练数据: datestr=%s, url=%s", datestr, url)
        try:
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.post(url, headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPStatusError as e:
            self._handle_http_error(e.response.status_code, e.response.text)
        except httpx.RequestError as e:
            raise XunjiClientError(f"训记服务请求失败: {e}") from e
        except Exception as e:
            raise XunjiClientError(f"训记服务调用异常: {e}") from e

        normalized = self._parse_and_normalize(data, datestr)
        self._set_cache(datestr, normalized)
        return normalized

    def _handle_http_error(self, status_code: int, text: str) -> None:
        """根据 HTTP 状态码和响应文本抛出对应异常"""
        lowered = text.lower()
        if status_code == 429 or "too frequent" in lowered:
            raise XunjiRateLimitError("训记 API 频率限制：同一日期 90 秒内只能请求一次，请稍后再试")
        if status_code in (401, 403) or "apikey invalid" in lowered or "apikey missing" in lowered:
            raise XunjiAuthError("训记 API Key 无效或已过期，请重新配置 XUNJI_API_KEY")
        if "仅vip可用" in lowered:
            raise XunjiClientError("训记 Open API 仅 VIP 可用，请检查会员权限")
        raise XunjiClientError(f"训记服务返回错误: {status_code} {text}")

    def _parse_and_normalize(self, data: Dict[str, Any], datestr: str) -> Dict[str, Any]:
        """解析 API 响应并归一化为 workout_record 结构"""
        if not isinstance(data, dict):
            raise XunjiClientError(f"训记返回格式异常: 期望 dict，得到 {type(data).__name__}")

        # 某些接口可能直接返回 res；有些包裹在 success/res 中
        if data.get("success") is False:
            msg = data.get("msg") or data.get("message") or json.dumps(data, ensure_ascii=False)
            raise XunjiClientError(f"训记返回失败: {msg}")

        res = data.get("res", data)
        if not isinstance(res, dict):
            raise XunjiClientError("训记返回格式异常: 缺少 res 字段")

        trains = res.get("trains") or []
        if not isinstance(trains, list):
            raise XunjiClientError("训记返回格式异常: res.trains 不是数组")

        if not trains:
            # 没有训练记录时返回空结构，便于前端展示
            return self._empty_record(datestr)

        # 如果一天有多条训练，合并到一条记录（多个 exercises 合并）
        exercises: List[Dict[str, Any]] = []
        duration_seconds = 0
        total_weight = 0
        total_calories = 0
        raw_lines: List[str] = []
        all_body_parts: List[str] = []

        for train in trains:
            if not isinstance(train, dict):
                continue
            title = train.get("title") or "训练"
            start = train.get("start")
            end = train.get("end")
            train_duration = self._calculate_duration_seconds(start, end)
            # 如果 start/end 缺失，尝试字段 duration（秒）
            if train_duration is None:
                train_duration = self._to_int(train.get("duration")) or 0

            duration_seconds += train_duration

            train_weight = self._to_int(train.get("total_weight")) or 0
            train_cals = self._to_int(train.get("calories") or train.get("consume") or train.get("total_calories")) or 0
            total_weight += train_weight
            total_calories += train_cals

            train_body_parts = self._normalize_body_parts(train.get("body_parts"))
            for part in train_body_parts:
                if part not in all_body_parts:
                    all_body_parts.append(part)

            raw_lines.append(f"训练: {title}")
            if train_weight:
                raw_lines.append(f"  总重量: {train_weight}kg")
            if train_cals:
                raw_lines.append(f"  消耗: {train_cals}大卡")
            if train_duration:
                raw_lines.append(f"  时长: {train_duration // 60}分钟")

            train_exercises = self._normalize_exercises(train)
            exercises.extend(train_exercises)
            for ex in train_exercises:
                raw_lines.append(f"  {ex['name']}: " + "; ".join(
                    f"{s.get('weight')}×{s.get('reps')}" for s in ex.get("sets", [])
                ))

        record = {
            "raw_text": "\n".join(raw_lines),
            "duration_minutes": duration_seconds // 60 if duration_seconds else None,
            "total_weight": total_weight if total_weight else self._sum_exercise_weight(exercises),
            "total_calories": total_cals if total_calories else None,
            "body_parts": all_body_parts[:3] if all_body_parts else self._infer_body_parts(exercises),
            "exercises": exercises,
            "source": "xunji_api",
            "synced_at": datetime.utcnow().isoformat(),
            "datestr": datestr,
        }
        return record

    def _empty_record(self, datestr: str) -> Dict[str, Any]:
        return {
            "raw_text": f"训记 {datestr} 暂无训练记录",
            "duration_minutes": None,
            "total_weight": None,
            "total_calories": None,
            "body_parts": [],
            "exercises": [],
            "source": "xunji_api",
            "synced_at": datetime.utcnow().isoformat(),
            "datestr": datestr,
        }

    def _normalize_exercises(self, train: Dict[str, Any]) -> List[Dict[str, Any]]:
        """把训记单条训练中的动作归一化为 exercises 列表"""
        movements = train.get("movements") or train.get("actions") or train.get("exercises") or []
        if not isinstance(movements, list):
            return []

        exercises: List[Dict[str, Any]] = []
        for movement in movements:
            if not isinstance(movement, dict):
                continue
            name = movement.get("name") or "未知动作"
            sets = self._normalize_sets(movement.get("sets"), name)

            # 超级组/递减组：sets[].items[] 子动作
            items = movement.get("items")
            if items and isinstance(items, list):
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    item_name = item.get("name") or name
                    item_sets = self._normalize_sets(item.get("sets"), item_name)
                    if item_sets:
                        exercises.append({"name": item_name, "sets": item_sets})
                continue

            if sets:
                exercises.append({"name": name, "sets": sets})

        return exercises

    def _normalize_sets(self, raw_sets: Any, exercise_name: str) -> List[Dict[str, Any]]:
        """把训记组数据归一化为标准 sets 结构"""
        if not isinstance(raw_sets, list):
            return []

        sets: List[Dict[str, Any]] = []
        for idx, s in enumerate(raw_sets, start=1):
            if not isinstance(s, dict):
                continue
            weight_val = s.get("weight")
            unit = s.get("unit") or s.get("weight_unit") or "kg"
            reps = self._to_int(s.get("reps"))
            rpe = self._to_int(s.get("rpe"))
            time_val = self._to_int(s.get("time") or s.get("duration_s"))
            done = s.get("done")
            metrics = s.get("metrics") or {}

            # weight 可能是字符串 "60" 或数字 60
            weight_str = self._format_weight(weight_val, unit)

            # 如果 reps 缺失但 time 存在，用 time 作为 reps（有氧/计时类）并标注
            if reps is None and time_val:
                reps = time_val

            sets.append({
                "set_no": idx,
                "weight": weight_str,
                "reps": reps,
                "rpe": rpe,
                "done": bool(done) if done is not None else True,
                "metrics": metrics if isinstance(metrics, dict) else {},
            })
        return sets

    def _format_weight(self, weight: Any, unit: str) -> str:
        """把重量格式化为字符串，例如 '60kg'、'(22.5+22.5)kg'"""
        if weight is None or weight == "":
            if unit:
                return f"0{unit}"
            return "0kg"
        if isinstance(weight, (list, tuple)) and len(weight) == 2:
            return f"({weight[0]}+{weight[1]}){unit}"
        return f"{weight}{unit}"

    def _normalize_body_parts(self, raw_parts: Any) -> List[str]:
        """把身体部位归一化为 1-3 个中文主要部位"""
        if not isinstance(raw_parts, list):
            return []
        result: List[str] = []
        for part in raw_parts:
            if not isinstance(part, str):
                continue
            part_lower = part.strip().lower()
            mapped = self._BODY_PART_MAP.get(part_lower)
            if mapped and mapped not in result:
                result.append(mapped)
            elif part in self._BODY_PART_MAP.values() and part not in result:
                result.append(part)
        return result[:3]

    def _infer_body_parts(self, exercises: List[Dict[str, Any]]) -> List[str]:
        """根据动作名推断主要训练部位"""
        for ex in exercises:
            name = ex.get("name", "")
            if any(k in name for k in ("胸", "卧推", "推胸", "飞鸟", "夹胸")):
                return ["胸", "三头"]
            if any(k in name for k in ("背", "划船", "下拉", "引体", "硬拉")):
                return ["背", "二头"]
            if any(k in name for k in ("肩", "推举", "侧平举", "前平举")):
                return ["肩", "三头"]
            if any(k in name for k in ("腿", "深蹲", "腿举", "弓步", "倒蹬")):
                return ["腿", "臀"]
            if any(k in name for k in ("臂", "弯举", "臂屈伸", "牧师")):
                return ["手臂"]
            if any(k in name for k in ("腹", "卷腹", "抬腿", "平板")):
                return ["核心", "腹"]
        return []

    def _sum_exercise_weight(self, exercises: List[Dict[str, Any]]) -> int:
        """当接口没有返回 total_weight 时，按动作组粗略估算总重量"""
        total = 0
        for ex in exercises:
            for s in ex.get("sets", []):
                weight_str = s.get("weight", "0")
                nums = re.findall(r"\d+", str(weight_str))
                if nums:
                    total += int(nums[0]) * (s.get("reps") or 1)
        return total

    def _calculate_duration_seconds(self, start: Any, end: Any) -> Optional[int]:
        """根据 start/end 时间戳计算训练时长（秒）"""
        if start is None or end is None:
            return None
        try:
            start_ms = int(start)
            end_ms = int(end)
            return max(0, (end_ms - start_ms) // 1000)
        except (ValueError, TypeError):
            return None

    def _to_int(self, value: Any) -> Optional[int]:
        """安全地把值转为整数"""
        if value is None or value == "":
            return None
        if isinstance(value, bool):
            return None
        if isinstance(value, int):
            return value
        if isinstance(value, float):
            return int(value)
        if isinstance(value, str):
            nums = re.findall(r"\d+", value)
            if nums:
                return int(nums[0])
        return None

    def _get_cache(self, datestr: str) -> Optional[Dict[str, Any]]:
        with self._cache_lock:
            item = self._cache.get(datestr)
            if not item:
                return None
            cached_at = item.get("_cached_at")
            if not isinstance(cached_at, datetime):
                return None
            if datetime.utcnow() - cached_at > timedelta(seconds=self._CACHE_TTL_SECONDS):
                del self._cache[datestr]
                return None
            return item.get("record")

    def _set_cache(self, datestr: str, record: Dict[str, Any]) -> None:
        with self._cache_lock:
            self._cache[datestr] = {"record": record, "_cached_at": datetime.utcnow()}


xunji_service = XunjiClient()
