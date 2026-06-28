"""
AI 客户端封装

统一调用 OpenAI 兼容接口，支持文本对话和多模态图片识别。
"""
from __future__ import annotations
import base64
import json
from typing import Any, List, Optional

import httpx

from app.core.config import get_settings


class AIClientError(Exception):
    """AI 调用异常"""
    pass


class AIClient:
    """
    AI 调用统一封装，默认使用环境变量中的配置，
    也支持实例化时传入自定义参数。
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
        provider: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
    ):
        settings = get_settings()
        self.provider = (provider or settings.AI_PROVIDER).lower()
        self.api_key = api_key or settings.AI_API_KEY
        self.model = model or settings.AI_MODEL
        self.base_url = base_url or settings.AI_BASE_URL or self._default_base_url()
        self.max_tokens = max_tokens or settings.AI_MAX_TOKENS
        self.temperature = temperature if temperature is not None else settings.AI_TEMPERATURE

    def _default_base_url(self) -> str:
        if self.provider == "openai":
            return "https://api.openai.com/v1"
        if self.provider == "deepseek":
            return "https://api.deepseek.com/v1"
        if self.provider == "claude":
            # Claude 官方也提供 OpenAI 兼容接口（部分代理），
            # 若使用 Anthropic 原生格式需要额外适配，这里按 OpenAI 兼容处理
            return "https://api.anthropic.com/v1"
        raise AIClientError(f"不支持的 AI provider: {self.provider}")

    def chat_completion(
        self,
        system_prompt: str,
        user_prompt: str,
        image_bytes: Optional[bytes] = None,
        image_mime: str = "image/jpeg",
        min_pixels: Optional[int] = None,
        max_pixels: Optional[int] = None,
    ) -> str:
        """
        同步调用 chat completion。

        Args:
            system_prompt: 系统提示词
            user_prompt: 用户提示词
            image_bytes: 可选，图片二进制数据，传入则走多模态 vision 接口
            image_mime: 图片 MIME 类型
            min_pixels: 图片最小像素阈值（部分 OCR 模型如 qwen3.5-ocr 需要）
            max_pixels: 图片最大像素阈值（部分 OCR 模型如 qwen3.5-ocr 需要）

        Returns:
            AI 返回的文本内容
        """
        if not self.api_key:
            raise AIClientError("AI_API_KEY 未配置，无法调用 AI 服务")

        url = f"{self.base_url.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        user_content: List[Any]
        if image_bytes:
            image_b64 = base64.b64encode(image_bytes).decode("utf-8")
            image_url_obj: dict[str, Any] = {
                "url": f"data:{image_mime};base64,{image_b64}",
            }
            # 阿里云 qwen3.5-ocr 等模型支持 min_pixels/max_pixels 以获得更好识别效果
            if min_pixels is not None:
                image_url_obj["min_pixels"] = min_pixels
            if max_pixels is not None:
                image_url_obj["max_pixels"] = max_pixels

            user_content = [
                {"type": "text", "text": user_prompt},
                {
                    "type": "image_url",
                    "image_url": image_url_obj,
                },
            ]
        else:
            user_content = [{"type": "text", "text": user_prompt}]

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
        }

        try:
            with httpx.Client(timeout=60) as client:
                resp = client.post(url, headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPStatusError as e:
            raise AIClientError(f"AI 服务返回错误: {e.response.status_code} {e.response.text}") from e
        except httpx.RequestError as e:
            raise AIClientError(f"AI 服务请求失败: {e}") from e
        except Exception as e:
            raise AIClientError(f"AI 服务调用异常: {e}") from e

        try:
            return data["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as e:
            raise AIClientError(f"AI 返回格式异常: {json.dumps(data, ensure_ascii=False)}") from e


ai_client = AIClient()
