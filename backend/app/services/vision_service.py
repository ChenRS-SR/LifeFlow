"""
图片识别服务

用于识别饮食记录（薄荷健康截图）和健身记录（训记截图）。
图片仅在内存中处理，识别结果保存为结构化 JSON，不保存原图。
"""
from __future__ import annotations
import base64
import json
import re
from datetime import datetime
from typing import Literal, Optional

from app.services.ai_client import AIClient, AIClientError


DIET_SYSTEM_PROMPT = """你是一位专业的饮食记录分析助手。用户会上传一张「薄荷健康」App 的饮食记录截图。请先整体观察截图版面，再提取数据。

【截图布局（从上到下）】
1. 顶部圆环/汇总区：
   - 左侧大字：「饮食摄入 XXX」——这是当天已摄入总热量，必须填到 total_calories。
   - 中间大字：「还可以吃 XXX」——这是剩余热量，**不是**总摄入，**不要**填到 total_calories。
   - 右侧或下方：「自定义预算 XXX」——这是每日热量预算，填到 total_calories_target。
   - 三大营养素行：碳水化合物、蛋白质、脂肪。每个 nutrient 后面通常有"当前 / 目标"两个数字（如"237 / 335克"），当前值填 total_xxx，目标值填 total_xxx_target。
2. 下方是按餐分组的卡片，每张卡片是一个餐（早餐/午餐/晚餐/加餐/晚加餐/早加餐/午加餐）。
   - 卡片顶部左侧是餐名，右侧是该餐的总热量（如"早餐 166千卡"、"午餐 919千卡"）。
   - 卡片内部是食物列表，每个食物条目包含：
     1. 食物名称（字体稍大）
     2. 重量/份量（如"250.0毫升"、"1.0一套"、"100.0克"）
     3. 该食物的热量（条目最右侧，如"166 千卡"）
   - **同一卡片内的所有食物都属于该餐名**，不要把右侧 Summary 卡片里的数字当成食物。

【输出 JSON 格式】
{
  "raw_text": "识别到的原始文本摘要",
  "total_calories": 2335,
  "total_calories_target": 2627,
  "total_protein": 119,
  "total_protein_target": 151,
  "total_carbs": 237,
  "total_carbs_target": 335,
  "total_fat": 98,
  "total_fat_target": 76,
  "meals": [
    {
      "name": "早餐",
      "calories": 1068,
      "foods": [
        {"name": "麦当劳油条", "weight": "", "calories": 0},
        {"name": "麦当劳板烧鸡腿堡", "weight": "", "calories": 0},
        {"name": "娃哈哈AD钙奶", "weight": "", "calories": 0}
      ]
    }
  ]
}

【强制规则】
1. 只输出 JSON，不要 markdown，不要解释。
2. **total_calories 必须填顶部「饮食摄入」数字**，绝不能填「还可以吃」或「自定义预算」。
3. **total_calories_target 必须填「自定义预算」数字**。
4. total_protein/total_carbs/total_fat 是当前摄入数字；对应的 *_target 是推荐数字（如"237 / 335克"分别取 237 和 335）。
5. 每餐的 calories 必须是该餐卡片右侧单独显示的总热量（如"早餐 1068千卡"取 1068，"午餐 642千卡"取 642），不是建议范围，也不是该餐第一个食物的热量。
6. 每个食物都必须输出 name、weight、calories；calories 是该食物条目最右侧的热量数字，不要遗漏。如果某个食物在图里没有单独热量，calories 填 null 或 0，不要拿餐总热量来填。
7. 食物 weight 保留原始单位字符串（如"250.0毫升"、"1.0一套"、"100.0克"）。
8. 注意区分「晚餐」和「晚加餐」：截图中如果晚餐卡片之后还有一个餐，请务必识别出「晚加餐」三个字，不要漏掉「加」字。
9. 如果某字段识别不到，对应填 null；不要编造数字。
10. raw_text 请保留你看到的所有关键数字和餐名，便于后续校验。
"""

WORKOUT_SYSTEM_PROMPT = """你是一位专业的健身记录分析助手。用户会上传一张「训记」App 的训练记录截图。

【截图结构（请严格按从上到下完整阅读）】
1. 最顶部：日期、训练标题（如"复健4胸"、"练背"）。
2. 上部：人体肌肉示意图（标注的"上胸/中下胸/二头/三头/前束/中束/后束/腹部/股四"等只是部位名称，**不是训练动作**）。
3. 右上方或中上方：本次训练总结数字——消耗(大卡)、总重量(kg)、总耗时（如"1h00m"或"54m"）。
4. 中部到下部（二维码之前）：训练动作列表。每个动作包含：
   - 动作名称（字体较大，如"杠铃卧推"、"上斜杠铃卧推"、"器械飞鸟"、"下斜悍马机推胸"、"绳索臂屈伸"、"抬腿"）。
   - 该动作下面有若干组，格式为"1 60kg×5"、"2 55kg×7"或"热 40kg×10"，其中"60kg"是重量，"×5"是次数。
5. 最底部：二维码和"我在训记APP记录日常训练 长按扫码，查看本次记录吧!"等分享文字——**这是页脚，完全忽略，不要写入任何字段**。

【颜色判断】
训记截图中，**深色的文字/图标代表本次训练实际完成的内容**；浅色/灰色/半透明的文字通常是历史记录、目标组或参考数据，**不要统计**。
- 训练部位：只列出人体肌肉图中颜色较深/高亮的部位。浅色的部位不要列入 body_parts。
- 训练组数：每个动作下面，只统计颜色较深的组。

【输出 JSON 格式】
{
  "raw_text": "你从上到下看到的所有训练相关文字摘要（必须包含日期、标题、消耗、总重量、总耗时、动作名称、组数；不要包含底部二维码分享文字）",
  "duration_minutes": 60,
  "total_weight": 10370,
  "total_calories": 224,
  "body_parts": ["胸", "三头"],
  "exercises": [
    {
      "name": "杠铃卧推",
      "sets": [
        {"weight": "60kg", "reps": 5, "rpe": null},
        {"weight": "55kg", "reps": 7, "rpe": null},
        {"weight": "55kg", "reps": 7, "rpe": null},
        {"weight": "55kg", "reps": 7, "rpe": null},
        {"weight": "55kg", "reps": 7, "rpe": null}
      ]
    }
  ]
}

【强制规则】
1. 只输出 JSON，不要 markdown，不要解释。
2. **必须从上到下完整扫描整张图片，raw_text 要包含上半部分的训练数据**，不能只识别底部二维码文字。
3. **忽略图片最底部的二维码和分享文字**，不要把它写进 raw_text 或任何字段。
4. 人体肌肉图上的部位名称（上胸、中下胸、二头、三头、腹部、股四、前束、中束、后束、斜方、背部、臀部、腘绳等）**不是动作**，不要列入 exercises。
5. 每个动作必须单独成对象。动作名称如"杠铃卧推"、"上斜杠铃卧推"、"器械飞鸟"、"下斜悍马机推胸"、"绳索臂屈伸"、"抬腿"等。
6. weight 和 reps 必须分开：从"60kg×5"中提取 weight="60kg", reps=5；从"0kg×12"中提取 weight="0kg", reps=12；从"(22.5+22.5)kg×10"中提取 weight="(22.5+22.5)kg", reps=10。不要把"60kg×5"整个放进 weight。
7. reps 必须是整数，不能是字符串或数组。
8. duration_minutes 从"总耗时"提取纯数字分钟："1h00m"→60，"54m"→54。total_weight 从"总重量(kg)"提取数字。total_calories 从"消耗(大卡)"提取数字。
9. body_parts 根据训练标题或主要动作推断，只返回1-3个主要部位（如胸、背、肩、手臂、腿、核心），不要列出所有部位词。
10. 列出图片中所有实际完成的动作和组数，不要遗漏。
"""


class VisionServiceError(Exception):
    """图片识别服务异常"""
    pass


class VisionService:
    """图片识别服务：饮食 / 健身"""

    def __init__(self, ai_client: Optional[AIClient] = None):
        self.ai_client = ai_client or AIClient()

    def recognize(
        self,
        image_bytes: bytes,
        record_type: Literal["diet", "workout"],
        image_mime: str = "image/jpeg",
    ) -> dict:
        """
        识别单张图片，返回结构化数据。

        Args:
            image_bytes: 图片二进制数据
            record_type: "diet" 或 "workout"
            image_mime: 图片 MIME 类型

        Returns:
            结构化识别结果 dict
        """
        if record_type == "diet":
            system_prompt = DIET_SYSTEM_PROMPT
            user_prompt = "请识别这张薄荷健康饮食记录截图，按指定 JSON 格式输出。"
        elif record_type == "workout":
            system_prompt = WORKOUT_SYSTEM_PROMPT
            user_prompt = "请从上到下仔细阅读这张训记训练记录截图，重点识别上半部分的训练标题、消耗、总重量、总耗时、动作列表和每组重量×次数。图片底部如果有二维码和'我在训记APP记录日常训练'等分享文字请忽略。按指定 JSON 格式输出。"
        else:
            raise VisionServiceError(f"不支持的识别类型: {record_type}")

        try:
            # 阿里云 qwen3.5-ocr 推荐参数：min_pixels=3072, max_pixels=8388608
            raw_content = self.ai_client.chat_completion(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                image_bytes=image_bytes,
                image_mime=image_mime,
                min_pixels=3072,
                max_pixels=8388608,
            )
        except AIClientError as e:
            raise VisionServiceError(f"AI 识别失败: {e}") from e

        structured = self._parse_json(raw_content)
        structured.setdefault("raw_text", raw_content[:500])
        if record_type == "workout":
            structured = self._normalize_workout_record(structured)
            structured = self._extract_summary_from_raw(structured)
            structured = self._rebuild_workout_exercises_from_raw(structured)

            # 如果模型只识别到最底部的二维码分享文字，自动重试一次
            if self._looks_like_bottom_only_workout(structured):
                retry_user_prompt = (
                    "注意：你上一次只识别到了图片最底部的二维码分享文字，"
                    "完全没有读取到上半部分的训练数据。请重新从上到下完整扫描整张图片，"
                    "务必识别上半部分的训练标题、消耗(大卡)、总重量(kg)、总耗时、动作列表和每组重量×次数。"
                    "底部的二维码和'我在训记APP记录日常训练'等分享文字必须完全忽略。"
                    "按指定 JSON 格式输出。"
                )
                try:
                    raw_content = self.ai_client.chat_completion(
                        system_prompt=system_prompt,
                        user_prompt=retry_user_prompt,
                        image_bytes=image_bytes,
                        image_mime=image_mime,
                        min_pixels=3072,
                        max_pixels=8388608,
                        timeout=45,
                    )
                    structured = self._parse_json(raw_content)
                    structured.setdefault("raw_text", raw_content[:500])
                    structured = self._normalize_workout_record(structured)
                    structured = self._extract_summary_from_raw(structured)
                    structured = self._rebuild_workout_exercises_from_raw(structured)
                except AIClientError:
                    # 重试失败时沿用第一次结果
                    pass
        elif record_type == "diet":
            structured = self._normalize_diet_record(structured)
            structured = self._extract_diet_targets_from_raw(structured)
        structured["recognized_at"] = datetime.utcnow().isoformat()
        return structured

    # 身体部位关键词（用于过滤纯部位动作名）
    _BODY_PART_KEYWORDS = frozenset([
        "上胸", "中下胸", "下胸", "胸", "二头", "三头", "外内", "内外", "上肢", "下肢",
        "腹部", "腹", "股四", "小腿", "前束", "中束", "后束", "小束",
        "上臂", "斜方", "背部", "背", "臀部", "臀", "上下", "腘绳",
        "小臂", "肩", "腿", "手臂", "核心", "全身"
    ])

    # 主要训练部位（body_parts 中只保留这些）
    _PRIMARY_BODY_PARTS = frozenset(["背", "胸", "肩", "手臂", "腿", "臀", "核心", "腹"])
    _BODY_PART_ALIASES = {"背部": "背", "腹部": "腹", "臀部": "臀"}

    def _is_pure_body_part(self, name: str) -> bool:
        """判断名字是否完全由身体部位词组成（不是动作）"""
        name = name.strip()
        if not name:
            return True
        if name in self._BODY_PART_KEYWORDS:
            return True
        # 检查是否全部由部位关键词拼接而成
        temp = name
        for keyword in sorted(self._BODY_PART_KEYWORDS, key=len, reverse=True):
            temp = temp.replace(keyword, "")
        return not temp.strip()

    def _normalize_workout_record(self, record: dict) -> dict:
        """
        后处理健身记录：
        1. 过滤掉纯身体部位的动作名
        2. 从 weight 字符串中拆分重量和次数
        3. 清洗 reps 为整数
        """
        exercises = []
        for ex in record.get("exercises", []):
            if not isinstance(ex, dict):
                continue
            name = ex.get("name", "")
            if not isinstance(name, str) or self._is_pure_body_part(name):
                continue
            sets = []
            for s in ex.get("sets", []):
                if not isinstance(s, dict):
                    continue
                weight = s.get("weight")
                reps = s.get("reps")
                weight, reps = self._split_weight_reps(weight, reps)
                reps = self._to_int(reps)
                sets.append({"weight": weight, "reps": reps, "rpe": s.get("rpe")})
            if sets:
                exercises.append({"name": name, "sets": sets})
        record["exercises"] = exercises

        # 精简 body_parts：只保留主要部位
        body_parts = record.get("body_parts", [])
        cleaned_parts = []
        if isinstance(body_parts, list):
            for part in body_parts:
                if not isinstance(part, str):
                    continue
                part = part.strip()
                part = self._BODY_PART_ALIASES.get(part, part)
                if part in self._PRIMARY_BODY_PARTS and part not in cleaned_parts:
                    cleaned_parts.append(part)
        record["body_parts"] = cleaned_parts[:3]
        return record

    def _split_weight_reps(self, weight, reps):
        """从 weight 字符串拆分重量和次数"""
        if isinstance(weight, str):
            w = weight.strip()
            # "50kg×12" / "50kgx12" / "50kg*12" / "50kg×12次"
            m = re.match(r"^(.+?)\s*[×xX*]\s*(\d+(?:\.\d+)?)\s*(?:次)?$", w)
            if m:
                return m.group(1).strip(), int(float(m.group(2)))
            # "8次" / "12次"
            m = re.match(r"^(\d+(?:\.\d+)?)\s*次$", w)
            if m:
                return None, int(float(m.group(1)))
        return weight, reps

    def _to_int(self, value):
        """把值转成整数"""
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

    def _extract_summary_from_raw(self, record: dict) -> dict:
        """如果 AI 没提取到总耗时/总重量/消耗，从 raw_text 正则补充"""
        raw = record.get("raw_text", "")
        if not isinstance(raw, str):
            return record

        # 总耗时：支持 "54m" / "1h00m" / "1h30m"
        if not record.get("duration_minutes"):
            m = re.search(r"(\d+)\s*h\s*(\d+)\s*m", raw)
            if m:
                record["duration_minutes"] = int(m.group(1)) * 60 + int(m.group(2))
            else:
                m = re.search(r"总耗时\s*(\d+)\s*m?", raw)
                if not m:
                    m = re.search(r"(\d+)\s*m\s*总耗时", raw)
                if m:
                    record["duration_minutes"] = int(m.group(1))

        # 总重量(kg)
        if not record.get("total_weight"):
            m = re.search(r"总重量\s*\(kg\)\s*(\d+)", raw)
            if m:
                record["total_weight"] = int(m.group(1))

        # 消耗(大卡)
        if not record.get("total_calories"):
            m = re.search(r"消耗\s*\(大卡\)\s*(\d+)", raw)
            if m:
                record["total_calories"] = int(m.group(1))

        return record

    # 需要从 raw_text 中排除的非动作行关键词
    _WORKOUT_SKIP_KEYWORDS = frozenset([
        "消耗", "总重量", "总耗时", "大卡", "kg", "m", "天", "周一", "周二", "周三",
        "周四", "周五", "周六", "周日", "x+", "+0", "我在", "训记", "长按", "扫码",
        "查看", "记录", "体重管理", "AI算", "薄荷健康"
    ])

    def _rebuild_workout_exercises_from_raw(self, record: dict) -> dict:
        """
        如果 AI 返回的 exercises 结构混乱，尝试从 raw_text 重新解析动作和组数。
        raw_text 通常比 AI 的 JSON 更准确。
        """
        raw = record.get("raw_text", "")
        if not isinstance(raw, str) or not raw.strip():
            return record

        lines = [l.strip() for l in raw.splitlines() if l.strip()]
        exercises = []
        current = None

        for line in lines:
            # 如果行包含组数格式，追加到当前动作
            if self._has_set_format(line):
                if current is not None:
                    current["sets"].extend(self._parse_workout_sets(line))
                continue

            # 否则可能是动作名/summary/部位/日期
            if self._is_pure_body_part(line):
                continue
            if any(kw in line for kw in self._WORKOUT_SKIP_KEYWORDS):
                continue
            # 跳过日期行（如 2026-06-15周一）
            if re.match(r"^\d{4}[-/]\d{1,2}[-/]\d{1,2}", line):
                continue
            # 跳过太短的行
            if len(line) < 2 or len(line) > 30:
                continue

            # 新动作
            if current is not None:
                exercises.append(current)
            current = {"name": line, "sets": []}

        if current is not None:
            exercises.append(current)

        # 过滤掉没有组数的动作
        record["exercises"] = [ex for ex in exercises if ex.get("sets")]

        # 根据动作名重新推断训练部位
        record["body_parts"] = self._infer_body_parts(record["exercises"])
        return record

    def _infer_body_parts(self, exercises: list) -> list:
        """根据动作名称推断主要训练部位"""
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

    def _looks_like_bottom_only_workout(self, record: dict) -> bool:
        """判断 AI 是否只识别到了底部的二维码分享文字"""
        raw = record.get("raw_text", "")
        if not isinstance(raw, str) or not raw.strip():
            return False
        bottom_markers = ["我在训记APP记录日常训练", "长按扫码", "查看本次记录吧", "训记APP"]
        has_bottom = any(marker in raw for marker in bottom_markers)
        # 若 raw_text 里只有底部文字，且没有动作/组数格式，则判定为失败
        has_set_format = self._has_set_format(raw)
        exercises = record.get("exercises", [])
        has_exercises = isinstance(exercises, list) and len(exercises) > 0
        return has_bottom and not has_set_format and not has_exercises

    def _has_set_format(self, line: str) -> bool:
        """判断一行是否包含训练组数格式（如 60kg×7 或 (22.5+22.5)kg×10）"""
        return bool(re.search(r"(?:\(\d+(?:\.\d+)?\+\d+(?:\.\d+)?\)|\d+(?:\.\d+)?)kg\s*[×xX*]\s*\d+", line))

    def _parse_workout_sets(self, line: str) -> list:
        """从一行中提取所有 weight×reps 组"""
        sets = []
        # 匹配 (22.5+22.5)kg×10 或 60kg×7
        pattern = re.compile(r"(\(\d+(?:\.\d+)?\+\d+(?:\.\d+)?\)kg|\d+(?:\.\d+)?kg)\s*[×xX*]\s*(\d+)")
        for m in pattern.finditer(line):
            weight = m.group(1)
            reps = int(m.group(2))
            sets.append({"weight": weight, "reps": reps, "rpe": None})
        return sets

    # 标准餐名
    _MEAL_NAMES = frozenset(["早餐", "午餐", "晚餐", "加餐", "晚加餐", "早加餐", "午加餐"])
    _DUPLICATE_MEAL_MAP = {"早餐": "早加餐", "午餐": "午加餐", "晚餐": "晚加餐"}

    def _normalize_diet_record(self, record: dict) -> dict:
        """
        后处理饮食记录：
        1. 从 raw_text 重新校正总热量、预算、三大营养素（AI 容易把"还可以吃"错填为 total_calories）
        2. 连续同名餐（如两个"晚餐"）把第二个改名为对应加餐
        3. 为缺失名称的食物从 raw_text 推断食物名
        4. 从 raw_text 修正每个食物的 calories 并补全漏识别食物
        5. 用每餐食物热量之和修正/补充该餐总热量
        6. 清洗营养素数值并做一致性校验
        """
        raw = record.get("raw_text", "")

        # 先用 raw_text 校正总热量和营养素（优先级高于 AI 返回的 JSON）
        record = self._extract_diet_summary_from_raw(record, raw)

        for key in ["total_calories", "total_protein", "total_carbs", "total_fat"]:
            record[key] = self._to_int(record.get(key))

        merged_meals = []
        for meal in record.get("meals", []):
            if not isinstance(meal, dict):
                continue
            name = (meal.get("name") or "").strip()
            foods = meal.get("foods") or []
            if not isinstance(foods, list):
                foods = []
            meal_cal = self._to_int(meal.get("calories"))

            # 连续同名餐：第二个改名为对应加餐（晚餐->晚加餐等）
            if merged_meals and merged_meals[-1]["name"] == name and name in self._DUPLICATE_MEAL_MAP:
                name = self._DUPLICATE_MEAL_MAP[name]

            merged_meals.append({"name": name, "calories": meal_cal, "foods": foods})

        # 清洗食物并推断缺失名称
        for meal in merged_meals:
            cleaned_foods = []
            for f in meal.get("foods", []):
                if not isinstance(f, dict):
                    continue
                weight = f.get("weight", "")
                calories = self._to_int(f.get("calories"))
                name = (f.get("name") or "").strip()
                if not name:
                    name = self._infer_food_name(raw, weight, calories)
                cleaned_foods.append({"name": name, "weight": weight, "calories": calories})
            meal["foods"] = cleaned_foods

        # 用 raw_text 修正食物热量并补全漏识别食物
        if raw:
            self._fix_food_calories_from_raw(merged_meals, raw)
            self._add_missing_foods_from_raw(merged_meals, raw)

        # 修正每餐总热量：优先使用 raw_text 中该餐卡片右侧的总热量
        self._fix_meal_calories_from_raw(merged_meals, raw)

        # 最终校验：宏量营养素和总热量是否一致
        record["meals"] = merged_meals
        record = self._validate_diet_numbers(record)
        return record

    def _fix_food_calories_from_raw(self, meals: list, raw: str) -> None:
        """根据 raw_text 修正每个已有食物的热量（AI 常把餐总热量错填为食物热量）"""
        lines = [l.strip() for l in raw.splitlines() if l.strip()]
        for meal in meals:
            for f in meal.get("foods", []):
                if not isinstance(f, dict):
                    continue
                name = f.get("name", "")
                if not name:
                    continue
                for i, line in enumerate(lines):
                    if name not in line:
                        continue
                    # 向后找第一个 "数字 + 千卡"
                    for j in range(i + 1, min(len(lines), i + 5)):
                        m = re.search(r"(\d+)\s*千卡", lines[j])
                        if m:
                            f["calories"] = int(m.group(1))
                            break
                    break

    def _add_missing_foods_from_raw(self, meals: list, raw: str) -> None:
        """把 raw_text 中已有食物未覆盖的热量条目补全为食物，附加到最近的餐"""
        if not meals:
            return
        used_cals = set()
        for meal in meals:
            for f in meal.get("foods", []):
                if isinstance(f, dict):
                    fc = self._to_int(f.get("calories"))
                    if fc is not None:
                        used_cals.add(fc)

        lines = [l.strip() for l in raw.splitlines() if l.strip()]
        for i, line in enumerate(lines):
            m = re.search(r"(\d+)\s*千卡", line)
            if not m:
                continue
            cal = int(m.group(1))
            if cal in used_cals:
                continue
            # 跳过建议范围、预算、摄入消耗等 summary 数字
            if any(kw in line for kw in ("建议", "预算", "摄入", "消耗", "还可以吃")):
                continue
            # 往前找食物名和重量
            name = ""
            weight = ""
            for j in range(i - 1, -1, -1):
                candidate = lines[j]
                if self._looks_like_food_name(candidate):
                    name = candidate
                    # 在食物名和热量行之间找重量
                    for k in range(j + 1, i):
                        if re.search(r"\d+(\.\d+)?\s*(克|毫升|两|份|套)", lines[k]):
                            weight = lines[k]
                            break
                    break
            if name:
                meals[-1]["foods"].append({"name": name, "weight": weight, "calories": cal})
                used_cals.add(cal)

    def _infer_food_name(self, raw: str, weight: str, calories: Optional[int]) -> str:
        """从 raw_text 中为缺失名称的食物推断食物名"""
        if not isinstance(raw, str) or not raw.strip():
            return ""
        lines = [l.strip() for l in raw.splitlines() if l.strip()]
        for i, line in enumerate(lines):
            if calories is None or str(calories) not in line or "千卡" not in line:
                continue
            # 如果提供了 weight，要求 weight 出现在附近几行内，避免误配
            if weight:
                nearby = lines[max(0, i - 3):min(len(lines), i + 4)]
                if not any(weight in l for l in nearby):
                    continue
            # 往前找第一个像食物名的行
            for j in range(i - 1, -1, -1):
                candidate = lines[j]
                if self._looks_like_food_name(candidate):
                    return candidate
        return ""

    def _looks_like_food_name(self, text: str) -> bool:
        """判断一行文本是否像食物名"""
        text = text.strip()
        if not text:
            return False
        # 排除标准餐名
        if text in self._MEAL_NAMES:
            return False
        # 排除热量/重量行
        if re.search(r"\d+\s*千卡", text):
            return False
        if re.search(r"\d+(\.\d+)?\s*(克|毫升|两|份|套)", text):
            return False
        # 排除建议范围
        if "建议" in text and "千卡" in text:
            return False
        # 排除 App 相关文字
        if text in ("薄荷健康", "体重管理就用薄荷健康", "AI算热量记饮食"):
            return False
        return True

    def _sum_food_calories(self, foods: list) -> int:
        total = 0
        for f in foods:
            fc = self._to_int(f.get("calories") if isinstance(f, dict) else None)
            if isinstance(fc, int):
                total += fc
        return total

    def _extract_diet_summary_from_raw(self, record: dict, raw: str) -> dict:
        """从 raw_text 校正总热量、预算、剩余、三大营养素（优先级最高）"""
        if not isinstance(raw, str) or not raw.strip():
            return record

        # 总热量：必须匹配「饮食摄入」
        m = re.search(r"饮食摄入\s*[:：]?\s*(\d+)", raw)
        if m:
            record["total_calories"] = int(m.group(1))

        # 预算：「自定义预算」或「预算」
        if not record.get("total_calories_target"):
            m = re.search(r"自定义预算\s*[:：]?\s*(\d+)", raw)
            if not m:
                m = re.search(r"预算\s*[:：]?\s*(\d+)", raw)
            if m:
                record["total_calories_target"] = int(m.group(1))

        # 三大营养素：支持「碳水化合物 237 / 335克」「碳水化合物 237/335g」「碳水 237/335 克」等
        # 蛋白质
        if not record.get("total_protein_target"):
            m = re.search(r"蛋白质\s*[:：]?\s*\D*(\d+)\s*/\s*(\d+)\s*[克g]", raw, re.IGNORECASE)
            if not m:
                m = re.search(r"蛋白质\s*[:：]?\s*(\d+)\s*/\s*(\d+)", raw)
            if m:
                record["total_protein"] = int(m.group(1))
                record["total_protein_target"] = int(m.group(2))

        # 碳水化合物
        if not record.get("total_carbs_target"):
            m = re.search(r"碳水化合物\s*[:：]?\s*\D*(\d+)\s*/\s*(\d+)\s*[克g]", raw, re.IGNORECASE)
            if not m:
                m = re.search(r"碳水\s*[:：]?\s*(\d+)\s*/\s*(\d+)\s*[克g]", raw, re.IGNORECASE)
            if not m:
                m = re.search(r"碳水化合物\s*[:：]?\s*(\d+)\s*/\s*(\d+)", raw)
            if m:
                record["total_carbs"] = int(m.group(1))
                record["total_carbs_target"] = int(m.group(2))

        # 脂肪
        if not record.get("total_fat_target"):
            m = re.search(r"脂肪\s*[:：]?\s*\D*(\d+)\s*/\s*(\d+)\s*[克g]", raw, re.IGNORECASE)
            if not m:
                m = re.search(r"脂肪\s*[:：]?\s*(\d+)\s*/\s*(\d+)", raw)
            if m:
                record["total_fat"] = int(m.group(1))
                record["total_fat_target"] = int(m.group(2))

        return record

    def _fix_meal_calories_from_raw(self, meals: list, raw: str) -> None:
        """从 raw_text 提取每个餐卡片右侧的总热量，覆盖 AI 返回的 calories"""
        if not isinstance(raw, str) or not raw.strip() or not meals:
            return
        lines = [l.strip() for l in raw.splitlines() if l.strip()]
        for meal in meals:
            name = meal.get("name", "")
            if not name:
                continue
            # 找包含餐名+千卡或千卡+餐名的行
            for i, line in enumerate(lines):
                if name not in line:
                    continue
                # 同一行或相邻行找「XXX 千卡」
                for j in range(i, min(len(lines), i + 4)):
                    m = re.search(r"(\d+)\s*千卡", lines[j])
                    if m:
                        # 跳过建议范围行（如"建议657-919千卡"）
                        if "建议" in lines[j]:
                            continue
                        meal["calories"] = int(m.group(1))
                        break
                break

    def _validate_diet_numbers(self, record: dict) -> dict:
        """校验宏量营养素和总热量的一致性，修正明显错误的 total_calories"""
        total = self._to_int(record.get("total_calories"))
        p = self._to_int(record.get("total_protein")) or 0
        c = self._to_int(record.get("total_carbs")) or 0
        f = self._to_int(record.get("total_fat")) or 0

        # 根据宏量营养素估算热量（蛋白质4、碳水4、脂肪9）
        estimated = p * 4 + c * 4 + f * 9
        if estimated > 0:
            # 如果 total_calories 明显小于估算值，很可能是 AI 把"还可以吃"错填了
            if total is None or total < estimated * 0.5:
                # 用估算值和餐热量之和的较大者作为 total_calories
                meal_sum = sum(self._sum_food_calories(m.get("foods", [])) for m in record.get("meals", []))
                record["total_calories"] = max(estimated, meal_sum)
            # 同时记录估算热量，方便前端展示
            record["total_calories_estimated"] = estimated

        return record

    def _extract_diet_targets_from_raw(self, record: dict) -> dict:
        """兼容旧逻辑：如果上面没有拿到目标值，再做一次兜底补充"""
        raw = record.get("raw_text", "")
        if not isinstance(raw, str):
            return record

        # 总热量修正：优先从「饮食摄入」提取，防止 AI 错把「还可以吃」当成总热量
        m = re.search(r"饮食摄入\s*[:：]?\s*(\d+)", raw)
        if m:
            record["total_calories"] = int(m.group(1))

        # 热量预算：自定义预算 2627、预算 2627
        if not record.get("total_calories_target"):
            m = re.search(r"自定义预算\s*[:：]?\s*(\d+)", raw)
            if not m:
                m = re.search(r"预算\s*[:：]?\s*(\d+)", raw)
            if m:
                record["total_calories_target"] = int(m.group(1))

        # 三大营养素推荐值兜底
        if not record.get("total_carbs_target"):
            m = re.search(r"碳水化合物\s*[:：]?\s*\D*(\d+)\s*/\s*(\d+)\s*[克g]", raw, re.IGNORECASE)
            if m:
                record["total_carbs"] = int(m.group(1))
                record["total_carbs_target"] = int(m.group(2))
        if not record.get("total_protein_target"):
            m = re.search(r"蛋白质\s*[:：]?\s*\D*(\d+)\s*/\s*(\d+)\s*[克g]", raw, re.IGNORECASE)
            if m:
                record["total_protein"] = int(m.group(1))
                record["total_protein_target"] = int(m.group(2))
        if not record.get("total_fat_target"):
            m = re.search(r"脂肪\s*[:：]?\s*\D*(\d+)\s*/\s*(\d+)\s*[克g]", raw, re.IGNORECASE)
            if m:
                record["total_fat"] = int(m.group(1))
                record["total_fat_target"] = int(m.group(2))

        return record

    def _parse_json(self, content: str) -> dict:
        """
        从 AI 返回内容中提取 JSON。
        兼容直接返回 JSON 或包裹在 markdown 代码块中的情况。
        """
        content = content.strip()

        # 尝试直接解析
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            pass

        # 尝试从 markdown 代码块中提取
        code_block_pattern = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL)
        match = code_block_pattern.search(content)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass

        # 尝试寻找第一个 { ... } 或 [ ... ]
        object_match = re.search(r"\{.*\}", content, re.DOTALL)
        if object_match:
            try:
                return json.loads(object_match.group(0))
            except json.JSONDecodeError:
                pass

        # 实在解析不了，把原始文本包起来返回
        return {"parse_error": True, "raw_text": content}


vision_service = VisionService()
