import httpx
import logging
from typing import Any, Dict, List, Optional
from .base import LLMAdapter

logger = logging.getLogger("OpenAIAdapter")

class OpenAIAdapter(LLMAdapter):
    """Standard OpenAI-compatible API adapter."""

    def __init__(self, api_key: str, base_url: str, model: str):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model

    async def chat_completion(
        self,
        messages: List[Dict[str, Any]],
        **kwargs
    ) -> Optional[Dict[str, Any]]:
        model = kwargs.get("model", self.model)
        payload: Dict[str, Any] = {"model": model, "messages": messages}
        
        # Pass through tools and tool_choice if provided
        if "tools" in kwargs:
            payload["tools"] = kwargs["tools"]
        if "tool_choice" in kwargs:
            payload["tool_choice"] = kwargs["tool_choice"]
        if "response_format" in kwargs:
            payload["response_format"] = kwargs["response_format"]

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                )
            if resp.status_code == 200:
                return resp.json()
            logger.error(f"[OpenAI] Request failed: {resp.status_code} {resp.text[:200]}")
        except Exception as exc:
            logger.error(f"[OpenAI] Exception: {exc}")
        return None
