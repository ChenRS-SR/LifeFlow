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


DIET_SYSTEM_PROMPT = """你是一位专业的饮食记录分析助手。用户会上传一张「薄荷健康」App 的饮食记录截图。

【截图结构】
1. 顶部：饮食摄入总热量、运动消耗、还可以吃的热量、自定义预算
2. 中部：三大营养素（碳水化合物、蛋白质、脂肪）及当前摄入克数
3. 下部：按餐分组，每餐包含：
   - 餐名（早餐/午餐/晚餐/加餐/晚加餐）
   - 建议热量范围
   - 该餐总热量
   - 食物列表：食物名称、重量/份量、热量

【输出 JSON 格式】
{
  "raw_text": "识别到的原始文本摘要",
  "total_calories": 1775,
  "total_protein": 102,
  "total_carbs": 194,
  "total_fat": 66,
  "meals": [
    {
      "name": "早餐",
      "calories": 166,
      "foods": [
        {"name": "牛奶", "weight": "250.0毫升", "calories": 166}
      ]
    }
  ]
}

【强制规则】
1. 只输出 JSON，不要 markdown，不要解释。
2. total_calories 是顶部"饮食摄入"的总热量数字。
3. total_protein/total_carbs/total_fat 从三大营养素区域提取当前摄入数字（如"194/340克"取194，"102/174克"取102）。
4. 每餐的 calories 是该餐右侧显示的总热量（如早餐 166千卡）。
5. 食物 weight 保留原始单位字符串（如"250.0毫升"、"1.0一套"、"100.0克"）。
6. 如果某字段识别不到，对应填 null。
"""

WORKOUT_SYSTEM_PROMPT = """你是一位专业的健身记录分析助手。用户会上传一张「训记」App 的训练记录截图。

【截图结构】
1. 顶部：日期、训练标题（如"练背"）、连续打卡天数、消耗(大卡)、总重量(kg)、总耗时(m)
2. 中部：人体肌肉示意图（上面标注的"上胸/中下胸/二头/三头"等只是部位名称，不是训练动作）
3. 下部：真正的动作列表。每个动作下面有若干组，格式为：
   - "1 50kg×12" 表示第1组，重量50kg，次数12
   - "3 8次" 表示第3组，无重量，次数8

【颜色判断】
训记截图中，**深色的文字/图标代表本次训练实际完成的内容**；浅色/灰色/半透明的文字通常是历史记录、目标组或参考数据，**不要统计**。
- 训练部位：只列出人体肌肉图中颜色较深/高亮的部位。浅色的部位不要列入 body_parts。
- 训练组数：每个动作下面，只统计颜色较深的组。例如"器械大剪刀"下如果第一组颜色较浅，不要把它列入 sets。

【输出 JSON 格式】
{
  "raw_text": "识别到的原始文本摘要",
  "duration_minutes": 54,
  "total_weight": 8215,
  "total_calories": 201,
  "body_parts": ["背", "二头"],
  "exercises": [
    {
      "name": "器械划船",
      "sets": [
        {"weight": "50kg", "reps": 10, "rpe": null},
        {"weight": "50kg", "reps": 12, "rpe": null}
      ]
    }
  ]
}

【强制规则】
1. 只输出 JSON，不要 markdown，不要解释。
2. 人体肌肉图上的部位名称（上胸、中下胸、二头、三头、腹部、股四、前束、中束、后束、斜方、背部、臀部、腘绳等）**不是动作**，不要列入 exercises。
3. 每个动作必须单独成对象。动作名称如"器械划船1"、"器械大剪刀"、"坐姿划船"、"宽距下拉"、"蜘蛛弯举"、"上斜俯卧划船"、"引体向上"、"单手悍马机划船"、"牧师器弯举"、"V-bar下拉"等。
4. weight 和 reps 必须分开：从"50kg×12"中提取 weight="50kg", reps=12；从"8次"中提取 weight=null, reps=8。不要把"50kg×12"整个放进 weight。
5. reps 必须是整数，不能是字符串或数组。
6. duration_minutes 从"总耗时"或"xxm"中提取纯数字（如"54m"→54）。total_weight 从"总重量(kg)"提取数字。total_calories 从"消耗(大卡)"提取数字。
7. body_parts 根据训练标题或主要动作推断，只返回1-3个主要部位（如背、胸、肩、手臂、腿、核心），不要列出所有部位词。
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
            user_prompt = "请识别这张训记训练记录截图，按指定 JSON 格式输出。"
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

        # 总耗时：例如 "总耗时\n54m"
        if not record.get("duration_minutes"):
            m = re.search(r"总耗时\s*(\d+)\s*m?", raw)
            if not m:
                m = re.search(r"(\d+)\s*m\s*总耗时", raw)
            if m:
                record["duration_minutes"] = int(m.group(1))

        # 总重量(kg)：例如 "总重量(kg)\n8215"
        if not record.get("total_weight"):
            m = re.search(r"总重量\s*\(kg\)\s*(\d+)", raw)
            if m:
                record["total_weight"] = int(m.group(1))

        # 消耗(大卡)：例如 "消耗(大卡)\n201"
        if not record.get("total_calories"):
            m = re.search(r"消耗\s*\(大卡\)\s*(\d+)", raw)
            if m:
                record["total_calories"] = int(m.group(1))

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
