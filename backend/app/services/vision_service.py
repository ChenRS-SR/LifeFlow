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

请仔细识别截图中的内容，并按以下 JSON 格式输出，不要输出任何其他文字：

{
  "raw_text": "识别到的原始文本摘要",
  "total_calories": 总热量（数字，单位 kcal，没有则填 null）,
  "total_protein": 总蛋白质（数字，单位 g，没有则填 null）,
  "total_carbs": 总碳水（数字，单位 g，没有则填 null）,
  "total_fat": 总脂肪（数字，单位 g，没有则填 null）,
  "meals": [
    {
      "name": "早餐/午餐/晚餐/加餐",
      "calories": 该餐热量（数字，没有则填 null）,
      "foods": [
        {"name": "食物名称", "weight": "重量/份量（字符串，如 '50g' 或 '1碗'）", "calories": 该食物热量（数字，没有则填 null）}
      ]
    }
  ]
}

注意：
1. 只输出 JSON，不要 markdown 代码块，不要解释。
2. 数字尽量从截图中识别，识别不到填 null。
3. 如果截图中没有三大营养素，只保留热量和食物清单即可。
"""

WORKOUT_SYSTEM_PROMPT = """你是一位专业的健身记录分析助手。用户会上传一张「训记」App 的训练记录截图。

训记截图的典型结构：
1. 顶部：日期、训练标题（如"练背"、"胸+三头"）、连续打卡天数、消耗热量、总重量(kg)、总耗时(m)
2. 中部：人体肌肉示意图（可推断训练部位）
3. 底部：动作列表，每个动作包含多组，格式如：
   - 动作名
   - 1 50kg×12
   - 2 50kg×10
   - 3 40kg×8
   或无重量的：1 8次、2 8次

请按以下 JSON 格式输出，不要输出任何其他文字：

{
  "raw_text": "识别到的原始文本摘要",
  "duration_minutes": 训练时长（数字，单位分钟，从"总耗时"或"xxm"提取，没有则填 null）,
  "body_parts": ["训练部位，如 背", "二头"],
  "exercises": [
    {
      "name": "动作名称，如 器械划船",
      "sets": [
        {"weight": "50kg", "reps": 12, "rpe": null},
        {"weight": "50kg", "reps": 10, "rpe": null}
      ]
    }
  ]
}

重要规则：
1. 只输出 JSON，不要 markdown 代码块，不要解释。
2. 每个动作必须单独成一个对象，不要把"上胸/中下胸/二头"等部位词合并成一个动作。
3. 训练部位从训练标题或肌肉图推断，一般 1-3 个主要部位即可，不要把截图里出现的所有身体部位都列出来。
4. 重量保留原始单位字符串（如 "50kg"、"自重"），没有重量时填 null。
5. reps（次数）必须是整数数字，不要返回数组或字符串。
6. rpe 没有时填 null，不要编造。
7. 总耗时如果只显示数字（如 "54m"），请提取数字 54。
8. 如果某组只有次数没有重量（如"8次"），weight 填 null，reps 填 8。
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
        structured["recognized_at"] = datetime.utcnow().isoformat()
        return structured

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
